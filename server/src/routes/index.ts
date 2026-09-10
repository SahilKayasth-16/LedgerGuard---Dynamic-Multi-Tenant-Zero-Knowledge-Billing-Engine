import { Router } from 'express';
import healthRouter from './health.routes';
import authRouter from './auth.routes';

const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);

export default router;
