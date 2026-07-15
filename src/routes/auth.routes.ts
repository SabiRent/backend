import {
  forgotPasswordHandler,
  loginHandler,
  logoutHandler,
  refreshHandler,
  resetPasswordHandler,
  signupHandler,
} from '@/controllers/auth.controller';
import { validateSchema } from '@/middlewares/validation.middeware';
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from '@/validations/user.validation';
import { Router } from 'express';

const router = Router();

router.post('/signup', validateSchema(signupSchema), signupHandler);
router.post('/login', validateSchema(loginSchema), loginHandler);
router.post('/refresh', refreshHandler);
router.post('/logout', logoutHandler);
router.post('/forgot-password', validateSchema(forgotPasswordSchema), forgotPasswordHandler);
router.post('/reset-password', validateSchema(resetPasswordSchema), resetPasswordHandler);

export default router;
