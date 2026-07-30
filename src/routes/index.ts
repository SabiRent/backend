import authRouter from '@/routes/auth.routes';
import notificationRouter from '@/routes/notification.routes';
import propertyRouter from '@/routes/property.routes';
import tenantRouter from '@/routes/tenant.routes';
import unitRouter from '@/routes/unit.routes';
import userRouter from '@/routes/user.routes';
import { Router } from 'express';

const router = Router();

router.use('/auth', authRouter);
router.use('/users', userRouter);
router.use('/properties', propertyRouter);
router.use('/units', unitRouter);
router.use('/tenants', tenantRouter);
router.use('/notifications', notificationRouter);

export default router;
