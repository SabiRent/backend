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
import Token, { TokenType } from '@/db/models/token.model';
import User from '@/db/models/user.model';
import AppError from '@/errors/AppError';
import type { JwtPayload } from '@/middlewares/authentication.middleware';
import { enqueueEmail } from '@/queues/email.queue';
import { renderEmailTemplate } from '@/services/email-template.service';
import {
  generateToken,
  hashPassword,
  hashRefreshToken,
  hashToken,
  parseDuration,
  verifyRefreshToken,
} from '@/utils/helper.util';
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

/**
 * Mint a single-use token, persisting only its hash with an expiry. Any earlier
 * token of the same kind for this user is dropped first, so requesting a fresh
 * link (e.g. resend-verification) invalidates the previous one — the server, not
 * just the token's own expiry, decides which link is live.
 */
const issueToken = async (userId: string, type: TokenType, secret: string, duration: string) => {
  const rawToken = generateToken();

  await Token.deleteMany({ user: userId, type });

  await Token.create({
    user: userId,
    tokenHash: hashToken(rawToken, secret),
    type,
    expiresAt: new Date(Date.now() + parseDuration(duration)),
  });

  return rawToken;
};

/**
 * Look up the record for a presented raw token. Returns null (and cleans up) when
 * it's unknown or expired — the caller consumes the returned record with
 * `deleteOne()` to make it single-use.
 */
const findValidToken = async (rawToken: string, type: TokenType, secret: string) => {
  const record = await Token.findOne({ tokenHash: hashToken(rawToken, secret), type });

  if (!record) return null;

  // TTL cleanup is only a periodic background sweep, so an expired record may
  // still be present — reject it and remove it now.
  if (record.expiresAt.getTime() < Date.now()) {
    await record.deleteOne();
    return null;
  }

  return record;
};

const sendVerificationEmail = async (userId: string, email: string, fullName: string) => {
  const rawToken = await issueToken(
    userId,
    TokenType.EMAIL_VERIFICATION,
    VERIFICATION_TOKEN_SECRET,
    VERIFICATION_TOKEN_EXPIRES_IN,
  );

  const verifyLink = `${CLIENT_URL}/auth/verify-email?token=${rawToken}`;

  try {
    // Render + hand the email to the queue; SMTP delivery happens in the worker,
    // off the request path, with BullMQ retries. Enqueue only fails if Redis is down.
    const html = await renderEmailTemplate('verifyEmail', { fullName, verifyLink });
    await enqueueEmail({ subject: 'Verify your email', html, to: email });
  } catch (err) {
    // The account is already created — don't fail signup over a transient queue
    // issue. The user can request a fresh verification email later.
    logger.error(
      `Failed to enqueue verification email to ${email}: ${err instanceof Error ? err.message : err}`,
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
  const record = await findValidToken(
    input.token,
    TokenType.EMAIL_VERIFICATION,
    VERIFICATION_TOKEN_SECRET,
  );

  if (!record) {
    throw AppError(
      ERROR_MESSAGE.INVALID_EXPIRED_TOKEN,
      StatusCodes.UNAUTHORIZED,
      ErrorCode.INVALID_EXPIRED_TOKEN,
    );
  }

  const user = await User.findById(record.user);

  if (!user) {
    // orphaned token (user deleted) — consume it and reject uniformly
    await record.deleteOne();
    throw AppError(
      ERROR_MESSAGE.INVALID_EXPIRED_TOKEN,
      StatusCodes.UNAUTHORIZED,
      ErrorCode.INVALID_EXPIRED_TOKEN,
    );
  }

  if (user.isVerified) {
    await record.deleteOne();
    throw AppError(
      ERROR_MESSAGE.USER_ALREADY_VERIFIED,
      StatusCodes.CONFLICT,
      ErrorCode.ALREADY_VERIFIED,
    );
  }

  user.isVerified = true;
  await user.save();

  // single-use: the token can't be replayed once it has verified the account
  await record.deleteOne();

  // Welcome the user now that their email is confirmed. Best-effort — verification
  // has already succeeded, so a failed welcome email must not fail the request.
  try {
    const html = await renderEmailTemplate('welcome', { fullName: user.fullName });
    await enqueueEmail({ subject: 'Welcome to MyCompound', html, to: user.email });
  } catch (err) {
    logger.error(
      `Failed to enqueue welcome email to ${user.email}: ${err instanceof Error ? err.message : err}`,
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

  const resetToken = await issueToken(
    user._id.toString(),
    TokenType.PASSWORD_RESET,
    RESET_TOKEN_SECRET,
    RESET_TOKEN_EXPIRES_IN,
  );

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
  const record = await findValidToken(input.token, TokenType.PASSWORD_RESET, RESET_TOKEN_SECRET);

  if (!record) {
    throw AppError(
      ERROR_MESSAGE.INVALID_EXPIRED_TOKEN,
      StatusCodes.UNAUTHORIZED,
      ErrorCode.INVALID_EXPIRED_TOKEN,
    );
  }

  const user = await User.findById(record.user);

  if (!user) {
    await record.deleteOne();
    throw AppError(
      ERROR_MESSAGE.INVALID_EXPIRED_TOKEN,
      StatusCodes.UNAUTHORIZED,
      ErrorCode.INVALID_EXPIRED_TOKEN,
    );
  }

  user.password = await hashPassword(input.newPassword);
  await user.save();

  // single-use: consume the token so it can't reset the password twice
  await record.deleteOne();

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
