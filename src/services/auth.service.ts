import {
  CLIENT_URL,
  JWT_ACCESS_EXPIRES_IN,
  JWT_ACCESS_SECRET,
  JWT_REFRESH_EXPIRES_IN,
  JWT_REFRESH_SECRET,
  RESET_TOKEN_EXPIRES_IN,
  RESET_TOKEN_SECRET,
} from '@/config/env.config';
import { loginRateLimiter } from '@/config/rate-limiter.config';
import { ErrorCode } from '@/constants/error-code';
import { ERROR_MESSAGE } from '@/constants/message';
import RefreshToken from '@/db/models/refresh-token.model';
import User from '@/db/models/user.model';
import AppError from '@/errors/AppError';
import type { JwtPayload } from '@/middlewares/authentication.middleware';
import { enqueueEmail } from '@/queues/email.queue';
import { renderEmailTemplate } from '@/services/email-template.service';
import { hashPassword, hashRefreshToken, verifyRefreshToken } from '@/utils/helper.util';
import type {
  ForgotPasswordInput,
  LoginInput,
  ResetPasswordInput,
  SignupInput,
} from '@/validations/user.validation';
import argon2 from 'argon2';
import { StatusCodes } from 'http-status-codes';
import jwt, { type SignOptions } from 'jsonwebtoken';

const generateAuthTokens = (payload: JwtPayload) => {
  const accessToken = jwt.sign(payload, JWT_ACCESS_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRES_IN,
  } as SignOptions);

  const refreshToken = jwt.sign({ id: payload.id }, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  } as SignOptions);

  return { accessToken, refreshToken };
};

export const signup = async (input: SignupInput) => {
  const existingUser = await User.findOne({ email: input.email });

  if (existingUser) {
    throw AppError(
      ERROR_MESSAGE.USER_ALREADY_EXIST,
      StatusCodes.CONFLICT,
      ErrorCode.DUPLICATE_ENTRY,
    );
  }

  const hashedPassword = await hashPassword(input.password);

  const user = await User.create({
    fullName: input.fullName,
    email: input.email,
    password: hashedPassword,
  });

  return {
    id: user._id.toString(),
    fullName: user.fullName,
    email: user.email,
    role: user.role,
  };
};

export const login = async (input: LoginInput) => {
  const rateLimiterKey = input.email;

  const rlRes = await loginRateLimiter.get(rateLimiterKey);

  if (rlRes !== null && rlRes.remainingPoints <= 0) {
    throw AppError(
      ERROR_MESSAGE.MAX_UNSUCCESSFUL_LOGIN_REACHED,
      StatusCodes.TOO_MANY_REQUESTS,
      ErrorCode.TOO_MANY_REQUESTS,
    );
  }

  const user = await User.findOne({ email: input.email }).select('+password');
  const isPasswordValid = user ? await argon2.verify(user.password, input.password) : false;

  if (!user || !isPasswordValid) {
    await loginRateLimiter.consume(rateLimiterKey).catch(() => {
      // points exhausted — this account is now blocked for the configured duration
    });

    throw AppError(
      ERROR_MESSAGE.INVALID_EMAIL_PWD,
      StatusCodes.UNAUTHORIZED,
      ErrorCode.INVALID_EMAIL_PWD,
    );
  }

  await loginRateLimiter.delete(rateLimiterKey);

  if (!user.isActive) {
    throw AppError(
      ERROR_MESSAGE.USER_DEACTIVATED,
      StatusCodes.FORBIDDEN,
      ErrorCode.USER_DEACTIVATED,
    );
  }

  const payload: JwtPayload = {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
  };

  const { accessToken, refreshToken } = generateAuthTokens(payload);

  await RefreshToken.findOneAndUpdate(
    { user: user._id },
    { tokenHash: hashRefreshToken(refreshToken) },
    { upsert: true },
  );

  return { accessToken, refreshToken, user: payload };
};

export const forgotPassword = async (input: ForgotPasswordInput) => {
  const user = await User.findOne({ email: input.email });

  // don't reveal whether the email is registered — always resolve the same way
  if (!user) return;

  const resetToken = jwt.sign({ id: user._id.toString() }, RESET_TOKEN_SECRET, {
    expiresIn: RESET_TOKEN_EXPIRES_IN,
  } as SignOptions);

  const resetLink = `${CLIENT_URL}/auth/reset-password?token=${resetToken}`;

  const mailContent = await renderEmailTemplate('resetPassword', {
    fullName: user.fullName,
    resetLink,
  });

  await enqueueEmail({
    subject: 'Reset your password',
    html: mailContent,
    to: user.email,
  });
};

export const resetPassword = async (input: ResetPasswordInput) => {
  let decoded: { id: string };

  try {
    decoded = jwt.verify(input.token, RESET_TOKEN_SECRET) as { id: string };
  } catch {
    throw AppError(
      ERROR_MESSAGE.INVALID_EXPIRED_TOKEN,
      StatusCodes.UNAUTHORIZED,
      ErrorCode.INVALID_EXPIRED_TOKEN,
    );
  }

  const user = await User.findById(decoded.id);

  if (!user) {
    throw AppError(
      ERROR_MESSAGE.INVALID_EXPIRED_TOKEN,
      StatusCodes.UNAUTHORIZED,
      ErrorCode.INVALID_EXPIRED_TOKEN,
    );
  }

  user.password = await hashPassword(input.newPassword);
  await user.save();

  // resetting the password should kill any existing sessions
  await RefreshToken.deleteOne({ user: user._id });
};

export const logout = async (presentedToken: string | undefined) => {
  if (!presentedToken) return;

  let decoded: { id: string };

  try {
    // signature must still be valid (proves this token was genuinely issued by us),
    // but an already-expired refresh token should still be allowed to log out.
    decoded = jwt.verify(presentedToken, JWT_REFRESH_SECRET, {
      ignoreExpiration: true,
    }) as { id: string };
  } catch {
    return;
  }

  await RefreshToken.deleteOne({ user: decoded.id });
};

export const refreshTokens = async (presentedToken: string) => {
  let decoded: { id: string };

  try {
    decoded = jwt.verify(presentedToken, JWT_REFRESH_SECRET) as { id: string };
  } catch {
    throw AppError(
      ERROR_MESSAGE.INVALID_EXPIRED_TOKEN,
      StatusCodes.UNAUTHORIZED,
      ErrorCode.INVALID_EXPIRED_TOKEN,
    );
  }

  const user = await User.findById(decoded.id);
  const storedToken = user ? await RefreshToken.findOne({ user: user._id }) : null;

  if (!user || !storedToken) {
    throw AppError(
      ERROR_MESSAGE.INVALID_EXPIRED_TOKEN,
      StatusCodes.UNAUTHORIZED,
      ErrorCode.INVALID_EXPIRED_TOKEN,
    );
  }

  const isTokenValid = verifyRefreshToken(presentedToken, storedToken.tokenHash);

  if (!isTokenValid) {
    throw AppError(
      ERROR_MESSAGE.INVALID_EXPIRED_TOKEN,
      StatusCodes.UNAUTHORIZED,
      ErrorCode.INVALID_EXPIRED_TOKEN,
    );
  }

  const payload: JwtPayload = {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
  };

  const { accessToken, refreshToken } = generateAuthTokens(payload);

  storedToken.tokenHash = hashRefreshToken(refreshToken);
  await storedToken.save();

  return { accessToken, refreshToken, user: payload };
};
