import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    message: `Route not found - ${req.originalUrl}`,
  });
};

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  const statusCode = err.statusCode || res.statusCode !== 200 ? (res.statusCode !== 200 ? res.statusCode : 500) : 500;
  const message = err.message || 'Internal server error';

  if (config.nodeEnv !== 'production') {
    console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(config.nodeEnv === 'development' && { stack: err.stack }),
  });
};

