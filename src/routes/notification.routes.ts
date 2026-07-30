import {
  deleteNotificationHandler,
  listNotificationsHandler,
  markAllAsReadHandler,
  markAsReadHandler,
  unreadCountHandler,
} from '@/controllers/notification.controller';
import { authenticate } from '@/middlewares/authentication.middleware';
import { validateSchema } from '@/middlewares/validation.middeware';
import { listNotificationsQuerySchema } from '@/validations/notification.validation';
import { Router } from 'express';

const router = Router();

router.use(authenticate);

router.get('/', validateSchema(listNotificationsQuerySchema, 'query'), listNotificationsHandler);
router.get('/unread-count', unreadCountHandler);
router.patch('/read-all', markAllAsReadHandler);
router.patch('/:id/read', markAsReadHandler);
router.delete('/:id', deleteNotificationHandler);

export default router;
