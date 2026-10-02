import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { tenantConnectionManager } from '../services/tenantConnectionManager';
import { logger } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      tenantDb?: mongoose.Connection;
    }
  }
}

export const attachTenantDatabase = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (!req.tenant || !req.tenant.tenantId) {
    logger.error('[TENANT DB FAILURE] Tenant context missing', {
      traceId: req.traceId,
      path: req.path,
    });
    res.status(500).json({
      success: false,
      message: 'Tenant context missing. Cannot attach tenant database connection.',
      traceId: req.traceId,
    });
    return;
  }

  try {
    // Reuses the Day 3 TenantConnectionManager connection pool
    const tenantDb = await tenantConnectionManager.getTenantConnection(req.tenant.tenantId);
    req.tenantDb = tenantDb;

    logger.info('[TENANT DB CONNECTED] Database connection pool acquired', {
      traceId: req.traceId,
      tenantId: req.tenant.tenantId,
      dbName: tenantDb.name,
    });

    next();
  } catch (error: any) {
    logger.error('[TENANT DB FAILURE] Database connection error', {
      traceId: req.traceId,
      tenantId: req.tenant.tenantId,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      message: `Database connection error for tenant '${req.tenant.tenantId}'.`,
      traceId: req.traceId,
    });
    return;
  }
};
