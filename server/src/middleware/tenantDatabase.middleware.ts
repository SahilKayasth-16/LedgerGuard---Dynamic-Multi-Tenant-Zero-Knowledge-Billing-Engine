import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { tenantConnectionManager } from '../services/tenantConnectionManager';

declare global {
  namespace Express {
    interface Request {
      tenantDb?: mongoose.Connection;
    }
  }
}

export const attachTenantDatabase = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (!req.tenant || !req.tenant.tenantId) {
    res.status(500).json({
      success: false,
      message: 'Tenant context missing. Cannot attach tenant database connection.',
    });
    return;
  }

  try {
    // Reuses the Day 3 TenantConnectionManager connection pool
    const tenantDb = await tenantConnectionManager.getTenantConnection(req.tenant.tenantId);
    req.tenantDb = tenantDb;
    next();
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `Database connection error for tenant '${req.tenant.tenantId}'.`,
    });
    return;
  }
};

