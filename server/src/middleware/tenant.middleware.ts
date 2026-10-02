import { Request, Response, NextFunction } from 'express';
import { getTenantConfig, TenantConfig } from '../config/tenantConfig';
import { logger } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantConfig;
    }
  }
}

export const resolveTenant = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user || !req.user.tenantId) {
    logger.warn('[TENANT RESOLUTION FAILURE] Missing req.user.tenantId', {
      traceId: req.traceId,
      path: req.path,
    });
    res.status(401).json({
      success: false,
      message: 'Unauthenticated request. Cannot resolve tenant identity.',
      traceId: req.traceId,
    });
    return;
  }

  // Authoritative source of tenant identity is strictly req.user.tenantId from verified RS256 JWT
  const tenantId = req.user.tenantId;

  try {
    const tenantConfig = getTenantConfig(tenantId);
    req.tenant = tenantConfig;

    logger.info('[TENANT RESOLUTION SUCCESS] Tenant context attached', {
      traceId: req.traceId,
      tenantId: tenantConfig.tenantId,
      tenantName: tenantConfig.name,
      status: tenantConfig.status,
    });

    next();
  } catch (error: any) {
    const statusCode = error.message.includes('currently') ? 403 : 404;
    logger.warn('[TENANT RESOLUTION FAILURE] Invalid or inactive tenant', {
      traceId: req.traceId,
      tenantId,
      statusCode,
      error: error.message,
    });
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Tenant resolution failed.',
      traceId: req.traceId,
    });
    return;
  }
};
