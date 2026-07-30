import { SUCCESS_MESSAGE } from '@/constants/message';
import {
  deleteNotification,
  getUnreadCount,
  listNotifications,
  markAllAsRead,
  markAsRead,
} from '@/services/notification.service';
import type { ListNotificationsQuery } from '@/validations/notification.validation';
import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

export const listNotificationsHandler = async (req: Request, res: Response) => {
  const { page, limit, category, isRead } = req.validatedQuery as unknown as ListNotificationsQuery;

  const result = await listNotifications(req.user!.id, page, limit, category, isRead);

  res.status(StatusCodes.OK).json({ success: true, ...result });
};

export const unreadCountHandler = async (req: Request, res: Response) => {
  const result = await getUnreadCount(req.user!.id);

  res.status(StatusCodes.OK).json({ success: true, data: result });
};

export const markAsReadHandler = async (req: Request<{ id: string }>, res: Response) => {
  const notification = await markAsRead(req.user!.id, req.params.id);

  res.status(StatusCodes.OK).json({
    success: true,
    message: SUCCESS_MESSAGE.NOTIFICATION_MARKED_READ,
    data: notification,
  });
};

export const markAllAsReadHandler = async (req: Request, res: Response) => {
  const result = await markAllAsRead(req.user!.id);

  res.status(StatusCodes.OK).json({
    success: true,
    message: SUCCESS_MESSAGE.NOTIFICATIONS_ALL_MARKED_READ,
    data: result,
  });
};

export const deleteNotificationHandler = async (req: Request<{ id: string }>, res: Response) => {
  await deleteNotification(req.user!.id, req.params.id);

  res.status(StatusCodes.OK).json({
    success: true,
    message: SUCCESS_MESSAGE.NOTIFICATION_DELETED,
  });
};
