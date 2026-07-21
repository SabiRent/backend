import authRouter from '@/routes/auth.routes';
import userRouter from '@/routes/user.routes';
import { Router } from 'express';

const router = Router();

router.use('/auth', authRouter);
router.use('/users', userRouter);

export default router;
