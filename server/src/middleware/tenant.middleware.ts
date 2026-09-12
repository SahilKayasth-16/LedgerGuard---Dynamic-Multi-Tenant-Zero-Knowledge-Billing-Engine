import { Request, Response, NextFunction } from 'express';
import { getTenantConfig, TenantConfig } from '../config/tenantConfig';

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantConfig;
    }
  }
}

export const resolveTenant = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user || !req.user.tenantId) {
    res.status(401).json({
      success: false,
      message: 'Unauthenticated request. Cannot resolve tenant identity.',
    });
    return;
  }

  // Authoritative source of tenant identity is strictly req.user.tenantId from verified RS256 JWT
  const tenantId = req.user.tenantId;

  try {
    const tenantConfig = getTenantConfig(tenantId);
    req.tenant = tenantConfig;
    next();
  } catch (error: any) {
    const statusCode = error.message.includes('currently') ? 403 : 404;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Tenant resolution failed.',
    });
    return;
  }
};

