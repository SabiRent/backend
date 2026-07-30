import type { NotificationCategory } from '@/constants/notification-category';
import { ErrorCode } from '@/constants/error-code';
import { ERROR_MESSAGE } from '@/constants/message';
import Notification, { type Notification as NotificationDoc } from '@/db/models/notification.model';
import AppError from '@/errors/AppError';
import { StatusCodes } from 'http-status-codes';
import { isValidObjectId, type HydratedDocument, type QueryFilter, type Types } from 'mongoose';

// The shape other features hand in when they raise a notification. `recipient`
// accepts either a raw id string or an ObjectId so callers don't have to convert.
export interface CreateNotificationInput {
  recipient: string | Types.ObjectId;
  category: NotificationCategory;
  title: string;
  subtitle?: string;
  message: string;
  meta?: Record<string, unknown>;
}

const sanitizeNotification = (notification: HydratedDocument<NotificationDoc>) => ({
  id: notification._id.toString(),
  category: notification.category,
  title: notification.title,
  subtitle: notification.subtitle ?? null,
  message: notification.message,
  isRead: notification.isRead,
  readAt: notification.readAt,
  meta: notification.meta ?? null,
  createdAt: notification.createdAt,
  updatedAt: notification.updatedAt,
});

/**
 * Creates a notification for a user. This is the internal hook the rest of the
 * app calls — e.g. the payments feature calls it after a rent payment is
 * confirmed. It is deliberately not exposed as an HTTP endpoint: notifications
 * are raised by the system, never by clients.
 */
export const createNotification = async (input: CreateNotificationInput) => {
  const notification = await Notification.create(input);

  return sanitizeNotification(notification);
};

export const listNotifications = async (
  userId: string,
  page: number,
  limit: number,
  category?: NotificationCategory,
  isRead?: boolean,
) => {
  const skip = (page - 1) * limit;

  // Always scoped to the logged-in user; category/read filters are optional.
  const filter: QueryFilter<NotificationDoc> = { recipient: userId };

  if (category) {
    filter.category = category;
  }

  if (isRead !== undefined) {
    filter.isRead = isRead;
  }

  const [notifications, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(filter),
  ]);

  return {
    notifications: notifications.map(sanitizeNotification),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

// Powers the unread badge in the sidebar — just the count of this user's unread
// notifications.
export const getUnreadCount = async (userId: string) => {
  const count = await Notification.countDocuments({ recipient: userId, isRead: false });

  return { count };
};

// Fetches one of the user's own notifications or throws a 404. A notification
// that belongs to someone else is masked as "not found" — same rule as elsewhere,
// so a caller can't probe for ids that aren't theirs.
const findOwnNotificationOrThrow = async (userId: string, notificationId: string) => {
  if (!isValidObjectId(notificationId)) {
    throw AppError(ERROR_MESSAGE.INVALID_ID, StatusCodes.BAD_REQUEST, ErrorCode.INVALID_ID);
  }

  const notification = await Notification.findOne({ _id: notificationId, recipient: userId });

  if (!notification) {
    throw AppError(
      ERROR_MESSAGE.NOTIFICATION_NOT_FOUND,
      StatusCodes.NOT_FOUND,
      ErrorCode.RESOURCE_NOT_FOUND,
    );
  }

  return notification;
};

export const markAsRead = async (userId: string, notificationId: string) => {
  const notification = await findOwnNotificationOrThrow(userId, notificationId);

  // Already read — leave the original readAt timestamp untouched.
  if (!notification.isRead) {
    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();
  }

  return sanitizeNotification(notification);
};

// Marks every unread notification for the user as read in one write. Returns how
// many rows were flipped so the client can update its badge without a re-fetch.
export const markAllAsRead = async (userId: string) => {
  const result = await Notification.updateMany(
    { recipient: userId, isRead: false },
    { isRead: true, readAt: new Date() },
  );

  return { updated: result.modifiedCount };
};

export const deleteNotification = async (userId: string, notificationId: string) => {
  await findOwnNotificationOrThrow(userId, notificationId);

  await Notification.deleteOne({ _id: notificationId, recipient: userId });
};
