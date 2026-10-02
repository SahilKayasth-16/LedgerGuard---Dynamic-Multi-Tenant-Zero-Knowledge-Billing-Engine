import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      traceId?: string;
    }
  }
}

const TRACE_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const MAX_TRACE_ID_LENGTH = 64;

export function generateTraceId(): string {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 9);
  return `tr-${timestamp}-${randomSuffix}`;
}

export function traceMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingTraceIdHeader = req.headers['x-trace-id'];
  let traceId: string;
  let isInvalidTraceId = false;

  if (typeof incomingTraceIdHeader === 'string' && incomingTraceIdHeader.trim().length > 0) {
    const rawTraceId = incomingTraceIdHeader.trim();
    // Validate length, allowed characters, and presence of CRLF
    if (
      rawTraceId.length <= MAX_TRACE_ID_LENGTH &&
      TRACE_ID_REGEX.test(rawTraceId) &&
      !/[\r\n]/.test(rawTraceId)
    ) {
      traceId = rawTraceId;
    } else {
      isInvalidTraceId = true;
      traceId = generateTraceId();
    }
  } else {
    traceId = generateTraceId();
  }

  req.traceId = traceId;

  // Set response headers securely
  res.setHeader('X-Trace-Id', traceId);
  res.setHeader('Access-Control-Expose-Headers', 'X-Trace-Id');

  if (isInvalidTraceId) {
    logger.warn('Invalid incoming X-Trace-Id header replaced with new trace ID', {
      traceId,
      path: req.path,
      method: req.method,
    });
  }

  const startNs = process.hrtime.bigint();

  logger.info(`[REQUEST START] ${req.method} ${req.path}`, {
    traceId,
    method: req.method,
    path: req.path,
    ip: req.ip || req.socket.remoteAddress,
  });

  res.on('finish', () => {
    const endNs = process.hrtime.bigint();
    const durationMs = Number(endNs - startNs) / 1e6;

    logger.info(`[REQUEST END] ${req.method} ${req.path} ${res.statusCode}`, {
      traceId,
      tenantId: req.tenant?.tenantId,
      userId: req.user?.userId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: parseFloat(durationMs.toFixed(2)),
    });
  });

  next();
}
