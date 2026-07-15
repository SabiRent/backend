import { JWT_ACCESS_SECRET } from '@/config/env.config';
import { ErrorCode } from '@/constants/error-code';
import AppError from '@/errors/AppError';
import type { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import jwt from 'jsonwebtoken';
import type { UserRole } from '../constants/user-role';

export interface JwtPayload {
  id: string;
  email: string;
  role: UserRole;
}
export const authenticate = (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw AppError('No token provided, access denied', StatusCodes.UNAUTHORIZED);
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET) as JwtPayload;

    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role as UserRole,
    };

    next();
  } catch (_err) {
    next(
      AppError(
        'Invalid or expired token',
        StatusCodes.UNAUTHORIZED,
        ErrorCode.INVALID_EXPIRED_TOKEN,
      ),
    );
  }
};

export const authorize = (...roles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(
        AppError('You do not have permission to perform this action', StatusCodes.FORBIDDEN),
      );
    }
    next();
  };
};
