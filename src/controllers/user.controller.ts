import { SUCCESS_MESSAGE } from '@/constants/message';
import {
  activateUser,
  changePassword,
  deactivateUser,
  getProfile,
  getUserById,
  listUsers,
  updateProfile,
} from '@/services/user.service';
import type { ChangePasswordInput, UpdateProfileInput } from '@/validations/user.validation';
import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

export const getProfileHandler = async (req: Request, res: Response) => {
  const user = await getProfile(req.user!.id);

  res.status(StatusCodes.OK).json({ success: true, data: user });
};

export const updateProfileHandler = async (
  req: Request<unknown, unknown, UpdateProfileInput>,
  res: Response,
) => {
  const user = await updateProfile(req.user!.id, req.body);

  res.status(StatusCodes.OK).json({
    success: true,
    message: SUCCESS_MESSAGE.UPDATED,
    data: user,
  });
};

export const changePasswordHandler = async (
  req: Request<unknown, unknown, ChangePasswordInput>,
  res: Response,
) => {
  await changePassword(req.user!.id, req.body);

  res.status(StatusCodes.OK).json({
    success: true,
    message: SUCCESS_MESSAGE.PASSWORD_UPDATE_SUCCESS,
  });
};

export const listUsersHandler = async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;

  const result = await listUsers(page, limit);

  res.status(StatusCodes.OK).json({ success: true, ...result });
};

export const getUserByIdHandler = async (req: Request<{ id: string }>, res: Response) => {
  const user = await getUserById(req.params.id);

  res.status(StatusCodes.OK).json({ success: true, data: user });
};

export const deactivateUserHandler = async (req: Request<{ id: string }>, res: Response) => {
  const user = await deactivateUser(req.params.id, req.user!.id);

  res.status(StatusCodes.OK).json({
    success: true,
    message: SUCCESS_MESSAGE.USER_DEACTIVATE_SUCCESS,
    data: user,
  });
};

export const activateUserHandler = async (req: Request<{ id: string }>, res: Response) => {
  const user = await activateUser(req.params.id);

  res.status(StatusCodes.OK).json({
    success: true,
    message: SUCCESS_MESSAGE.USER_ACTIVATE_SUCCESS,
    data: user,
  });
};
