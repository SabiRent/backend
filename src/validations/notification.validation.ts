import { NotificationCategory } from '@/constants/notification-category';
import { z } from '@/lib/zod';

export const listNotificationsQuerySchema = z
  .object({
    page: z.coerce
      .number({ error: 'Page must be a number' })
      .int('Page must be a whole number')
      .min(1, 'Page must be at least 1')
      .optional()
      .default(1)
      .openapi({ example: 1 }),
    limit: z.coerce
      .number({ error: 'Limit must be a number' })
      .int('Limit must be a whole number')
      .min(1, 'Limit must be at least 1')
      .max(100, 'Limit cannot exceed 100')
      .optional()
      .default(20)
      .openapi({ example: 20 }),
    // Narrows to a single tab (Payments / Properties / Tenants / Maintenance).
    // Omitted = the "All" view.
    category: z
      .enum(NotificationCategory)
      .optional()
      .openapi({ example: NotificationCategory.PAYMENTS }),
    // Query params arrive as strings, so accept the two literals and convert to a
    // real boolean — z.coerce.boolean() would turn "false" into `true`.
    isRead: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === 'true'))
      .openapi({ example: 'false' }),
  })
  .openapi('ListNotificationsQuery');

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
