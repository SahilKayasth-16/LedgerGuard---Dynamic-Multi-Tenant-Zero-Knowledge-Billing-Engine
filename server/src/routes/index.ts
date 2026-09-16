import { Router } from 'express';
import healthRouter from './health.routes';
import authRouter from './auth.routes';
import tenantRouter from './tenant.routes';
import ledgerRouter from './ledger.routes';

const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/tenant', tenantRouter);
router.use('/ledger', ledgerRouter);

export default router;
