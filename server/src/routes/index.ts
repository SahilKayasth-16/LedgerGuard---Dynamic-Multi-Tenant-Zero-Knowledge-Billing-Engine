import { Router } from 'express';
import healthRouter from './health.routes';
import authRouter from './auth.routes';
import tenantRouter from './tenant.routes';

const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/tenant', tenantRouter);

export default router;
