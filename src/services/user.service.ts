import { ErrorCode } from '@/constants/error-code';
import { ERROR_MESSAGE } from '@/constants/message';
import RefreshToken from '@/db/models/refresh-token.model';
import User from '@/db/models/user.model';
import AppError from '@/errors/AppError';
import { hashPassword } from '@/utils/helper.util';
import type { ChangePasswordInput, UpdateProfileInput } from '@/validations/user.validation';
import argon2 from 'argon2';
import { StatusCodes } from 'http-status-codes';
import { isValidObjectId, type HydratedDocument } from 'mongoose';
import type { User as UserType } from '@/db/models/user.model';

const sanitizeUser = (user: HydratedDocument<UserType>) => ({
  id: user._id.toString(),
  fullName: user.fullName,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
  createdAt: user.createdAt,
});

const findUserOrThrow = async (userId: string) => {
  const user = await User.findById(userId);

  if (!user) {
    throw AppError(
      ERROR_MESSAGE.USER_NOT_FOUND,
      StatusCodes.NOT_FOUND,
      ErrorCode.RESOURCE_NOT_FOUND,
    );
  }

  return user;
};

export const getProfile = async (userId: string) => {
  const user = await findUserOrThrow(userId);

  return sanitizeUser(user);
};

export const updateProfile = async (userId: string, input: UpdateProfileInput) => {
  const user = await findUserOrThrow(userId);

  user.fullName = input.fullName;
  await user.save();

  return sanitizeUser(user);
};

export const changePassword = async (userId: string, input: ChangePasswordInput) => {
  const user = await User.findById(userId).select('+password');

  if (!user) {
    throw AppError(
      ERROR_MESSAGE.USER_NOT_FOUND,
      StatusCodes.NOT_FOUND,
      ErrorCode.RESOURCE_NOT_FOUND,
    );
  }

  const isCurrentPasswordValid = await argon2.verify(user.password, input.currentPassword);

  if (!isCurrentPasswordValid) {
    throw AppError(
      ERROR_MESSAGE.INVALID_CURRENT_PASSWORD,
      StatusCodes.UNAUTHORIZED,
      ErrorCode.INVALID_PASSWORD,
    );
  }

  const isSameAsCurrent = await argon2.verify(user.password, input.newPassword);

  if (isSameAsCurrent) {
    throw AppError(
      ERROR_MESSAGE.NEW_PASSWORD_SAME_AS_CURRENT,
      StatusCodes.BAD_REQUEST,
      ErrorCode.INVALID_PASSWORD,
    );
  }

  user.password = await hashPassword(input.newPassword);
  await user.save();

  // changing the password should kill any existing sessions, same as reset-password
  await RefreshToken.deleteOne({ user: user._id });
};

export const listUsers = async (page: number, limit: number) => {
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    User.find().skip(skip).limit(limit),
    User.countDocuments(),
  ]);

  return {
    users: users.map(sanitizeUser),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const getUserById = async (targetUserId: string) => {
  if (!isValidObjectId(targetUserId)) {
    throw AppError(ERROR_MESSAGE.INVALID_ID, StatusCodes.BAD_REQUEST, ErrorCode.INVALID_ID);
  }

  const user = await findUserOrThrow(targetUserId);

  return sanitizeUser(user);
};

export const deactivateUser = async (targetUserId: string, requestingUserId: string) => {
  if (!isValidObjectId(targetUserId)) {
    throw AppError(ERROR_MESSAGE.INVALID_ID, StatusCodes.BAD_REQUEST, ErrorCode.INVALID_ID);
  }

  if (targetUserId === requestingUserId) {
    throw AppError(
      ERROR_MESSAGE.CANNOT_DEACTIVATE_LOGGED_IN_USER,
      StatusCodes.FORBIDDEN,
      ErrorCode.CANNOT_DEACTIVATE_LOGGED_IN_USER,
    );
  }

  const user = await findUserOrThrow(targetUserId);

  if (!user.isActive) {
    throw AppError(
      ERROR_MESSAGE.USER_ALREADY_DEACTIVATED,
      StatusCodes.CONFLICT,
      ErrorCode.USER_DEACTIVATED,
    );
  }

  user.isActive = false;
  await user.save();

  // deactivating an account should kill its active session too
  await RefreshToken.deleteOne({ user: user._id });

  return sanitizeUser(user);
};

export const activateUser = async (targetUserId: string) => {
  if (!isValidObjectId(targetUserId)) {
    throw AppError(ERROR_MESSAGE.INVALID_ID, StatusCodes.BAD_REQUEST, ErrorCode.INVALID_ID);
  }

  const user = await findUserOrThrow(targetUserId);

  if (user.isActive) {
    throw AppError(
      ERROR_MESSAGE.USER_ALREADY_ACTIVE,
      StatusCodes.CONFLICT,
      ErrorCode.USER_ACTIVATED,
    );
  }

  user.isActive = true;
  await user.save();

  return sanitizeUser(user);
};
