import authRouter from '@/routes/auth.routes';
import { Router } from 'express';

const router = Router();

router.use('/auth', authRouter);

export default router;
