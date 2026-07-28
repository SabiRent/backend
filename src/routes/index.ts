import authRouter from '@/routes/auth.routes';
import propertyRouter from '@/routes/property.routes';
import unitRouter from '@/routes/unit.routes';
import userRouter from '@/routes/user.routes';
import { Router } from 'express';

const router = Router();

router.use('/auth', authRouter);
router.use('/users', userRouter);
router.use('/properties', propertyRouter);
router.use('/units', unitRouter);

export default router;
