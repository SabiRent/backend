import authRouter from '@/routes/auth.routes';
import propertyRouter from '@/routes/property.routes';
import userRouter from '@/routes/user.routes';
import { Router } from 'express';

const router = Router();

router.use('/auth', authRouter);
router.use('/users', userRouter);
router.use('/properties', propertyRouter);

export default router;
