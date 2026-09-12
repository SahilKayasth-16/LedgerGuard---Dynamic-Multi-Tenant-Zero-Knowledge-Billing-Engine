import { Router } from 'express';
import { getTenantMe, getTenantTestData } from '../controllers/tenant.controller';
import { authenticate } from '../middleware/auth.middleware';
import { resolveTenant } from '../middleware/tenant.middleware';
import { attachTenantDatabase } from '../middleware/tenantDatabase.middleware';

const router = Router();

// Middleware chain: authenticate -> resolveTenant -> attachTenantDatabase
router.get('/me', authenticate, resolveTenant, getTenantMe);
router.get('/test-data', authenticate, resolveTenant, attachTenantDatabase, getTenantTestData);

export default router;

