import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { logger } from '../utils/logger';

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn('[AUTH FAILURE] Authorization header missing or malformed', {
      traceId: req.traceId,
      path: req.path,
    });
    res.status(401).json({
      success: false,
      message: 'Authentication required. Authorization header missing or malformed.',
      traceId: req.traceId,
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    logger.warn('[AUTH FAILURE] Bearer token value empty', {
      traceId: req.traceId,
      path: req.path,
    });
    res.status(401).json({
      success: false,
      message: 'Authentication token missing.',
      traceId: req.traceId,
    });
    return;
  }

  try {
    const decoded = verifyAccessToken(token);

    // Attach verified identity strictly from RS256 JWT
    req.user = {
      userId: decoded.sub,
      tenantId: decoded.tenantId,
      role: decoded.role,
    };

    logger.info('[AUTH SUCCESS] JWT identity verified', {
      traceId: req.traceId,
      userId: req.user.userId,
      tenantId: req.user.tenantId,
      role: req.user.role,
    });

    next();
  } catch (error: any) {
    logger.warn('[AUTH FAILURE] Invalid, expired, or tampered token', {
      traceId: req.traceId,
      path: req.path,
      error: error.message,
    });
    res.status(401).json({
      success: false,
      message: 'Invalid, expired, or tampered authentication token.',
      traceId: req.traceId,
    });
    return;
  }
};
