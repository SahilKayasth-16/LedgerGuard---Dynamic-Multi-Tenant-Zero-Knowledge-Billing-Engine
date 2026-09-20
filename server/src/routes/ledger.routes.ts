import { Router } from 'express';
import {
  createLedgerEntry,
  getLedgerEntries,
  getLedgerEntryById,
  getLedgerAuditLogs,
} from '../controllers/ledger.controller';
import { authenticate } from '../middleware/auth.middleware';
import { resolveTenant } from '../middleware/tenant.middleware';
import { attachTenantDatabase } from '../middleware/tenantDatabase.middleware';

const router = Router();

// Middleware chain enforcing authentication, tenant identity resolution, and Mongoose connection attachment
const tenantProtectionChain = [authenticate, resolveTenant, attachTenantDatabase];

router.post('/', tenantProtectionChain, createLedgerEntry);
router.get('/', tenantProtectionChain, getLedgerEntries);
router.get('/audit-logs', tenantProtectionChain, getLedgerAuditLogs);
router.get('/:id', tenantProtectionChain, getLedgerEntryById);

export default router;
