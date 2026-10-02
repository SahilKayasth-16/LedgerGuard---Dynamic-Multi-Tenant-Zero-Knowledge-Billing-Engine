/**
 * Structured & Security-Safe Trace Logger for LedgerGuard
 *
 * Ensures:
 * 1. CRLF sanitization to prevent log injection / forging attacks.
 * 2. Automatic redaction of sensitive credentials (tokens, private keys, passwords, URIs).
 * 3. Consistent structured JSON formatting with request correlation traceId.
 */

const SENSITIVE_KEYS = [
  'password',
  'token',
  'authorization',
  'privatekey',
  'publickey',
  'secret',
  'mongouri',
  'redisurl',
  'credentials',
  'bearertoken',
];

/**
 * Sanitizes input values to prevent CRLF injection in log records.
 */
export function sanitizeLogValue(val: any): any {
  if (typeof val === 'string') {
    return val.replace(/[\r\n]/g, ' ');
  }
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(val)) {
      if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeLogValue(value);
      }
    }
    return sanitized;
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeLogValue);
  }
  return val;
}

export interface LogContext {
  traceId?: string;
  tenantId?: string;
  userId?: string;
  path?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  [key: string]: any;
}

class Logger {
  private formatMessage(level: string, message: string, context?: LogContext): string {
    const sanitizedMsg = sanitizeLogValue(message);
    const sanitizedContext = context ? sanitizeLogValue(context) : {};

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message: sanitizedMsg,
      ...sanitizedContext,
    };

    return JSON.stringify(logEntry);
  }

  info(message: string, context?: LogContext): void {
    console.log(this.formatMessage('info', message, context));
  }

  warn(message: string, context?: LogContext): void {
    console.warn(this.formatMessage('warn', message, context));
  }

  error(message: string, context?: LogContext): void {
    console.error(this.formatMessage('error', message, context));
  }

  debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(this.formatMessage('debug', message, context));
    }
  }
}

export const logger = new Logger();
