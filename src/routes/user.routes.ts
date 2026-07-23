import {
  activateUserHandler,
  changePasswordHandler,
  deactivateUserHandler,
  getProfileHandler,
  getUserByIdHandler,
  listUsersHandler,
  updateProfileHandler,
  uploadAvatarHandler,
} from '@/controllers/user.controller';
import { MimeType } from '@/constants/mime-type';
import { UserRole } from '@/constants/user-role';
import { authenticate, authorize } from '@/middlewares/authentication.middleware';
import { fileUploadFor } from '@/middlewares/file-upload.middleware';
import { validateSchema } from '@/middlewares/validation.middeware';
import { changePasswordSchema, updateProfileSchema } from '@/validations/user.validation';
import { Router } from 'express';

const router = Router();

router.use(authenticate);

// Accept a single image field named "avatar"; only common image types are allowed.
const avatarUpload = fileUploadFor([MimeType.JPEG, MimeType.PNG, MimeType.WEBP]).single('avatar');

router.get('/me', getProfileHandler);
router.patch('/me', validateSchema(updateProfileSchema), updateProfileHandler);
router.patch('/me/password', validateSchema(changePasswordSchema), changePasswordHandler);
router.patch('/me/avatar', avatarUpload, uploadAvatarHandler);

const adminOnly = authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN);

router.get('/', adminOnly, listUsersHandler);
router.get('/:id', adminOnly, getUserByIdHandler);
router.patch('/:id/activate', adminOnly, activateUserHandler);
router.patch('/:id/deactivate', adminOnly, deactivateUserHandler);

export default router;
