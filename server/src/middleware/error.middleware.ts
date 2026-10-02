import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const notFoundHandler = (req: Request, res: Response): void => {
  logger.warn(`[NOT FOUND] ${req.method} ${req.originalUrl}`, {
    traceId: req.traceId,
    path: req.originalUrl,
    method: req.method,
  });

  res.status(404).json({
    success: false,
    message: `Route not found - ${req.originalUrl}`,
    traceId: req.traceId,
  });
};

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  const statusCode = err.statusCode || (res.statusCode !== 200 ? res.statusCode : 500);
  const message = err.message || 'Internal server error';

  logger.error(`[UNHANDLED ERROR] ${req.method} ${req.originalUrl}`, {
    traceId: req.traceId,
    path: req.originalUrl,
    method: req.method,
    statusCode,
    errorName: err.name,
    errorMessage: message,
  });

  res.status(statusCode).json({
    success: false,
    message,
    traceId: req.traceId,
  });
};
