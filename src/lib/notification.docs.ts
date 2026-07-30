import { NotificationCategory } from '@/constants/notification-category';
import { registry } from '@/lib/open-api-registry';
import {
  errorResponseSchema,
  messageOnlyResponseSchema,
  successResponseSchema,
} from '@/lib/response.docs';
import { z } from '@/lib/zod';
import { listNotificationsQuerySchema } from '@/validations/notification.validation';

const notificationDataSchema = z.object({
  id: z.string().openapi({ example: '6a60b9659c16fbcbeab13e4a' }),
  category: z.enum(NotificationCategory).openapi({ example: NotificationCategory.PAYMENTS }),
  title: z.string().openapi({ example: 'Rent Payment Received' }),
  subtitle: z.string().nullable().openapi({ example: 'Flat 3B - Sunshine Apartments' }),
  message: z.string().openapi({ example: 'Chinedu Okafor has paid N850,000 for the Annual rent.' }),
  isRead: z.boolean().openapi({ example: false }),
  readAt: z.string().nullable().openapi({ example: null }),
  meta: z
    .record(z.string(), z.unknown())
    .nullable()
    .openapi({ example: { unitId: '6a60b8659c16fbcbeab13e49' } }),
  createdAt: z.string().openapi({ example: '2026-07-20T10:46:15.836Z' }),
  updatedAt: z.string().openapi({ example: '2026-07-20T10:46:15.836Z' }),
});

const notificationResponseSchema = successResponseSchema(
  'NotificationResponse',
  notificationDataSchema,
);

const notificationListResponseSchema = z
  .object({
    success: z.literal(true),
    notifications: z.array(notificationDataSchema),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
    }),
  })
  .openapi('NotificationListResponse');

const unreadCountResponseSchema = successResponseSchema(
  'UnreadCountResponse',
  z.object({ count: z.number().openapi({ example: 3 }) }),
);

const markAllReadResponseSchema = successResponseSchema(
  'MarkAllReadResponse',
  z.object({ updated: z.number().openapi({ example: 5 }) }),
);

const idParam = z.object({ id: z.string().openapi({ example: '6a60b9659c16fbcbeab13e4a' }) });

const bearerAuth = [{ bearerAuth: [] }];

export const registerNotificationDocs = () => {
  registry.registerPath({
    method: 'get',
    path: '/api/v1/notifications',
    tags: ['Notifications'],
    summary: "List the logged-in user's notifications (newest first)",
    security: bearerAuth,
    request: { query: listNotificationsQuerySchema },
    responses: {
      '200': {
        description: 'Paginated list of notifications',
        content: { 'application/json': { schema: notificationListResponseSchema } },
      },
      '401': {
        description: 'Missing or invalid access token',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/notifications/unread-count',
    tags: ['Notifications'],
    summary: "Count the logged-in user's unread notifications (powers the badge)",
    security: bearerAuth,
    responses: {
      '200': {
        description: 'Unread notification count',
        content: { 'application/json': { schema: unreadCountResponseSchema } },
      },
      '401': {
        description: 'Missing or invalid access token',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/notifications/read-all',
    tags: ['Notifications'],
    summary: "Mark all of the logged-in user's notifications as read",
    security: bearerAuth,
    responses: {
      '200': {
        description: 'All notifications marked as read',
        content: { 'application/json': { schema: markAllReadResponseSchema } },
      },
      '401': {
        description: 'Missing or invalid access token',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/notifications/{id}/read',
    tags: ['Notifications'],
    summary: 'Mark a single notification as read',
    security: bearerAuth,
    request: { params: idParam },
    responses: {
      '200': {
        description: 'Notification marked as read',
        content: { 'application/json': { schema: notificationResponseSchema } },
      },
      '400': {
        description: 'Invalid notification ID format',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '401': {
        description: 'Missing or invalid access token',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '404': {
        description: 'No notification with that ID, or it belongs to someone else',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/v1/notifications/{id}',
    tags: ['Notifications'],
    summary: 'Delete a single notification',
    security: bearerAuth,
    request: { params: idParam },
    responses: {
      '200': {
        description: 'Notification deleted successfully',
        content: { 'application/json': { schema: messageOnlyResponseSchema } },
      },
      '400': {
        description: 'Invalid notification ID format',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '401': {
        description: 'Missing or invalid access token',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      '404': {
        description: 'No notification with that ID, or it belongs to someone else',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  });
};
