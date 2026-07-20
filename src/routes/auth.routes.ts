import {
  forgotPasswordHandler,
  loginHandler,
  logoutHandler,
  refreshHandler,
  resendVerificationHandler,
  resetPasswordHandler,
  signupHandler,
  verifyEmailHandler,
} from '@/controllers/auth.controller';
import { validateSchema } from '@/middlewares/validation.middeware';
import {
  forgotPasswordSchema,
  loginSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
} from '@/validations/user.validation';
import { Router } from 'express';

const router = Router();

router.post('/signup', validateSchema(signupSchema), signupHandler);
router.post('/verify-email', validateSchema(verifyEmailSchema), verifyEmailHandler);
router.post(
  '/resend-verification',
  validateSchema(resendVerificationSchema),
  resendVerificationHandler,
);
router.post('/login', validateSchema(loginSchema), loginHandler);
router.post('/refresh', refreshHandler);
router.post('/logout', logoutHandler);
router.post('/forgot-password', validateSchema(forgotPasswordSchema), forgotPasswordHandler);
router.post('/reset-password', validateSchema(resetPasswordSchema), resetPasswordHandler);

export default router;
