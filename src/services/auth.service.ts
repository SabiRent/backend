import {
  CLIENT_URL,
  JWT_ACCESS_EXPIRES_IN,
  JWT_ACCESS_SECRET,
  JWT_REFRESH_EXPIRES_IN,
  JWT_REFRESH_SECRET,
  NODE_ENV,
  RESET_TOKEN_EXPIRES_IN,
  RESET_TOKEN_SECRET,
  SHOULD_VERIFY_USER,
  VERIFICATION_TOKEN_EXPIRES_IN,
  VERIFICATION_TOKEN_SECRET,
} from '@/config/env.config';
import logger from '@/config/logger.config';
import { loginRateLimiter, resendVerificationRateLimiter } from '@/config/rate-limiter.config';
import { NodeEnv } from '@/constants';
import { ErrorCode } from '@/constants/error-code';
import { ERROR_MESSAGE } from '@/constants/message';
import RefreshToken from '@/db/models/refresh-token.model';
import User from '@/db/models/user.model';
import AppError from '@/errors/AppError';
import type { JwtPayload } from '@/middlewares/authentication.middleware';
import { hashPassword, hashRefreshToken, sendEmail, verifyRefreshToken } from '@/utils/helper.util';
import type {
  ForgotPasswordInput,
  LoginInput,
  ResendVerificationInput,
  ResetPasswordInput,
  SignupInput,
  VerifyEmailInput,
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

const sendVerificationEmail = async (userId: string, email: string, fullName: string) => {
  const verificationToken = jwt.sign({ id: userId }, VERIFICATION_TOKEN_SECRET, {
    expiresIn: VERIFICATION_TOKEN_EXPIRES_IN,
  } as SignOptions);

  const verifyLink = `${CLIENT_URL}/verify-email?token=${verificationToken}`;

  try {
    await sendEmail({
      to: email,
      subject: 'Verify your email',
      template: 'verify-email.temp.ejs',
      data: { fullName, verifyLink },
    });
  } catch (err) {
    // The account is already created — don't fail signup over a transient mail
    // issue. The user can request a fresh verification email later.
    logger.error(
      `Failed to send verification email to ${email}: ${err instanceof Error ? err.message : err}`,
    );
  }
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

  // Outside production, SHOULD_VERIFY_USER auto-verifies new accounts so they can
  // be used without the email link — Resend can't deliver to non-owner addresses
  // until the sending domain is verified, so test users can't receive one.
  const autoVerify = SHOULD_VERIFY_USER && NODE_ENV !== NodeEnv.PRODUCTION;

  const user = await User.create({
    fullName: input.fullName,
    email: input.email,
    password: hashedPassword,
    isVerified: autoVerify,
  });

  if (!autoVerify) {
    await sendVerificationEmail(user._id.toString(), user.email, user.fullName);
  }

  return {
    id: user._id.toString(),
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    isVerified: user.isVerified,
  };
};

export const verifyEmail = async (input: VerifyEmailInput) => {
  let decoded: { id: string };

  try {
    decoded = jwt.verify(input.token, VERIFICATION_TOKEN_SECRET) as { id: string };
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

  if (user.isVerified) {
    throw AppError(
      ERROR_MESSAGE.USER_ALREADY_VERIFIED,
      StatusCodes.CONFLICT,
      ErrorCode.ALREADY_VERIFIED,
    );
  }

  user.isVerified = true;
  await user.save();

  // Welcome the user now that their email is confirmed. Best-effort — verification
  // has already succeeded, so a failed welcome email must not fail the request.
  try {
    await sendEmail({
      to: user.email,
      subject: 'Welcome to MyCompound',
      template: 'welcome.temp.ejs',
      data: { fullName: user.fullName },
    });
  } catch (err) {
    logger.error(
      `Failed to send welcome email to ${user.email}: ${err instanceof Error ? err.message : err}`,
    );
  }
};

export const resendVerificationEmail = async (input: ResendVerificationInput) => {
  try {
    await resendVerificationRateLimiter.consume(input.email);
  } catch (err) {
    // A RateLimiterRes (not an Error) means the limit was hit → 429. A real Error
    // means the store is unavailable; don't block a legitimate resend over that.
    if (!(err instanceof Error)) {
      throw AppError(
        ERROR_MESSAGE.TOO_MANY_REQUESTS,
        StatusCodes.TOO_MANY_REQUESTS,
        ErrorCode.TOO_MANY_REQUESTS,
      );
    }
    logger.error(`resend-verification rate limiter store error: ${err.message}`);
  }

  const user = await User.findOne({ email: input.email });

  // Don't reveal whether the email is registered, and never re-send to an
  // already-verified account — either case resolves the same way.
  if (!user || user.isVerified) return;

  await sendVerificationEmail(user._id.toString(), user.email, user.fullName);
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

  // Checked only after credentials are validated, so it never reveals whether an
  // email is registered — only the account's own owner reaches this branch.
  if (!user.isVerified) {
    throw AppError(
      ERROR_MESSAGE.USER_UNVERIFIED,
      StatusCodes.FORBIDDEN,
      ErrorCode.EMAIL_NOT_VERIFIED,
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

  const resetLink = `${CLIENT_URL}/reset-password?token=${resetToken}`;

  await sendEmail({
    to: user.email,
    subject: 'Reset your password',
    template: 'reset-password.temp.ejs',
    data: { fullName: user.fullName, resetLink },
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
