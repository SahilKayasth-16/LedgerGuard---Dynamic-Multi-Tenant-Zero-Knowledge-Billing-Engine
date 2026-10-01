import { Router } from 'express';
import {
  getAnalyticsSummary,
  getAnalyticsTimeseries,
  getAnalyticsBreakdown,
  getAnalyticsLimits,
} from '../controllers/analytics.controller';
import { authenticate } from '../middleware/auth.middleware';
import { resolveTenant } from '../middleware/tenant.middleware';
import { attachTenantDatabase } from '../middleware/tenantDatabase.middleware';

const router = Router();

const tenantProtectionChain = [authenticate, resolveTenant, attachTenantDatabase];

router.get('/summary', tenantProtectionChain, getAnalyticsSummary);
router.get('/timeseries', tenantProtectionChain, getAnalyticsTimeseries);
router.get('/breakdown', tenantProtectionChain, getAnalyticsBreakdown);
router.get('/limits', tenantProtectionChain, getAnalyticsLimits);

export default router;
