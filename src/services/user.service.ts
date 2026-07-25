import logger from '@/config/logger.config';
import { ErrorCode } from '@/constants/error-code';
import { ERROR_MESSAGE } from '@/constants/message';
import RefreshToken from '@/db/models/refresh-token.model';
import User from '@/db/models/user.model';
import AppError from '@/errors/AppError';
import { deleteFile, getFileAccessUrl, uploadFile } from '@/services/file.service';
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

// Look up the user's avatar URL from the file it points at. The files collection
// is the single source of truth, so we resolve it here on read instead of storing
// a copy of the URL on the user.
const resolveAvatarUrl = async (user: HydratedDocument<UserType>): Promise<string | null> => {
  if (!user.avatarFileId) return null;

  try {
    return await getFileAccessUrl(user.avatarFileId.toString());
  } catch {
    // the file record is gone — treat the user as having no avatar
    return null;
  }
};

// The user object we return to clients: the base fields plus the resolved avatar.
const buildUserResponse = async (user: HydratedDocument<UserType>) => ({
  ...sanitizeUser(user),
  avatarUrl: await resolveAvatarUrl(user),
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

  return buildUserResponse(user);
};

export const updateProfile = async (userId: string, input: UpdateProfileInput) => {
  const user = await findUserOrThrow(userId);

  user.fullName = input.fullName;
  await user.save();

  return buildUserResponse(user);
};

/**
 * Uploads a new profile image for the user and points their record at it.
 *
 * The new image is uploaded and saved first; only then do we delete the old one.
 * That ordering means a failure while deleting can never leave the user without
 * an avatar — at worst an unused image lingers in storage.
 */
export const updateAvatar = async (userId: string, file: Express.Multer.File) => {
  const user = await findUserOrThrow(userId);

  const previousFileId = user.avatarFileId;

  // Upload the new image and point the user at its file record. The URL itself is
  // resolved from this reference on read, so we don't store it on the user.
  const { file: stored } = await uploadFile({ file, folder: 'avatars' });

  user.avatarFileId = stored._id;
  await user.save();

  // Remove the image the user was using before. Best-effort — the new avatar is
  // already saved, so a failed cleanup should not fail the request.
  if (previousFileId) {
    await deleteFile(previousFileId.toString()).catch((err) => {
      logger.error(
        `Failed to delete old avatar ${previousFileId.toString()}: ${err instanceof Error ? err.message : err}`,
      );
    });
  }

  return buildUserResponse(user);
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
    users: await Promise.all(users.map(buildUserResponse)),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const getUserById = async (targetUserId: string) => {
  if (!isValidObjectId(targetUserId)) {
    throw AppError(ERROR_MESSAGE.INVALID_ID, StatusCodes.BAD_REQUEST, ErrorCode.INVALID_ID);
  }

  const user = await findUserOrThrow(targetUserId);

  return buildUserResponse(user);
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

  return buildUserResponse(user);
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

  return buildUserResponse(user);
};
