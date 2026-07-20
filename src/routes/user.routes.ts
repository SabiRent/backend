import {
  activateUserHandler,
  changePasswordHandler,
  deactivateUserHandler,
  getProfileHandler,
  getUserByIdHandler,
  listUsersHandler,
  updateProfileHandler,
} from '@/controllers/user.controller';
import { UserRole } from '@/constants/user-role';
import { authenticate, authorize } from '@/middlewares/authentication.middleware';
import { validateSchema } from '@/middlewares/validation.middeware';
import { changePasswordSchema, updateProfileSchema } from '@/validations/user.validation';
import { Router } from 'express';

const router = Router();

router.use(authenticate);

router.get('/me', getProfileHandler);
router.patch('/me', validateSchema(updateProfileSchema), updateProfileHandler);
router.patch('/me/password', validateSchema(changePasswordSchema), changePasswordHandler);

const adminOnly = authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN);

router.get('/', adminOnly, listUsersHandler);
router.get('/:id', adminOnly, getUserByIdHandler);
router.patch('/:id/activate', adminOnly, activateUserHandler);
router.patch('/:id/deactivate', adminOnly, deactivateUserHandler);

export default router;
