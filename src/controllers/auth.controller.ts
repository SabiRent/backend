import { NODE_ENV } from '@/config/env.config';
import { NodeEnv } from '@/constants';
import { ErrorCode } from '@/constants/error-code';
import { SUCCESS_MESSAGE } from '@/constants/message';
import AppError from '@/errors/AppError';
import {
  forgotPassword,
  login,
  logout,
  refreshTokens,
  resendVerificationEmail,
  resetPassword,
  signup,
  verifyEmail,
} from '@/services/auth.service';
import type {
  ForgotPasswordInput,
  LoginInput,
  ResendVerificationInput,
  ResetPasswordInput,
  SignupInput,
  VerifyEmailInput,
} from '@/validations/user.validation';
import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import jwt from 'jsonwebtoken';

const refreshCookieBaseOptions = {
  httpOnly: true,
  secure: true,
  sameSite: NODE_ENV === NodeEnv.PRODUCTION ? ('lax' as const) : ('none' as const),
};

const setRefreshTokenCookie = (res: Response, refreshToken: string) => {
  const decodedRefresh = jwt.decode(refreshToken) as { exp: number };
  const maxAge = decodedRefresh.exp * 1000 - Date.now();

  res.cookie('refreshToken', refreshToken, { ...refreshCookieBaseOptions, maxAge });
};

export const signupHandler = async (req: Request<unknown, unknown, SignupInput>, res: Response) => {
  const user = await signup(req.body);

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: SUCCESS_MESSAGE.CREATED,
    data: user,
  });
};

export const loginHandler = async (req: Request<unknown, unknown, LoginInput>, res: Response) => {
  const { accessToken, refreshToken, user } = await login(req.body);

  setRefreshTokenCookie(res, refreshToken);

  res.status(StatusCodes.OK).json({
    success: true,
    message: SUCCESS_MESSAGE.LOGIN_SUCCESS,
    data: { accessToken, user },
  });
};

export const logoutHandler = async (req: Request, res: Response) => {
  const presentedToken = req.cookies?.refreshToken as string | undefined;

  await logout(presentedToken);

  res.clearCookie('refreshToken', refreshCookieBaseOptions);

  res.status(StatusCodes.OK).json({
    success: true,
    message: SUCCESS_MESSAGE.LOGOUT_SUCCESS,
  });
};

export const forgotPasswordHandler = async (
  req: Request<unknown, unknown, ForgotPasswordInput>,
  res: Response,
) => {
  await forgotPassword(req.body);

  res.status(StatusCodes.OK).json({
    success: true,
    message: SUCCESS_MESSAGE.PASSWORD_RESET_EMAIL_SENT,
  });
};

export const resetPasswordHandler = async (
  req: Request<unknown, unknown, ResetPasswordInput>,
  res: Response,
) => {
  await resetPassword(req.body);

  res.status(StatusCodes.OK).json({
    success: true,
    message: SUCCESS_MESSAGE.PASSWORD_UPDATE_SUCCESS,
  });
};

export const verifyEmailHandler = async (
  req: Request<unknown, unknown, VerifyEmailInput>,
  res: Response,
) => {
  await verifyEmail(req.body);

  res.status(StatusCodes.OK).json({
    success: true,
    message: SUCCESS_MESSAGE.EMAIL_VERIFIED_SUCCESS,
  });
};

export const resendVerificationHandler = async (
  req: Request<unknown, unknown, ResendVerificationInput>,
  res: Response,
) => {
  await resendVerificationEmail(req.body);

  res.status(StatusCodes.OK).json({
    success: true,
    message: SUCCESS_MESSAGE.EMAIL_VERIFICATION_SENT,
  });
};

export const refreshHandler = async (req: Request, res: Response) => {
  const presentedToken = req.cookies?.refreshToken as string | undefined;

  if (!presentedToken) {
    throw AppError('No refresh token provided', StatusCodes.UNAUTHORIZED, ErrorCode.UNAUTHORIZED);
  }

  const { accessToken, refreshToken, user } = await refreshTokens(presentedToken);

  setRefreshTokenCookie(res, refreshToken);

  res.status(StatusCodes.OK).json({
    success: true,
    message: SUCCESS_MESSAGE.TOKEN_REFRESH_SUCCESS,
    data: { accessToken, user },
  });
};
