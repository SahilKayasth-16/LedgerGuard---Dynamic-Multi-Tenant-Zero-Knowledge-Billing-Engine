import http from 'http';
import app from '../app';
import { generateAccessToken } from '../utils/jwt';
import { tenantConnectionManager } from '../services/tenantConnectionManager';
import { connectRedis, disconnectRedis } from '../config/redis';
import { RedisMemoryServer } from 'redis-memory-server';
import { sanitizeLogValue, logger } from '../utils/logger';

const request = (
  server: http.Server,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: any
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> => {
  return new Promise((resolve, reject) => {
    const address = server.address() as { port: number };
    const payload = body ? JSON.stringify(body) : undefined;

    const req = http.request(
      {
        host: '127.0.0.1',
        port: address.port,
        method,
        path,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload).toString() } : {}),
          ...headers,
        },
      },
      (res) => {
        let responseData = '';
        res.on('data', (chunk) => (responseData += chunk));
        res.on('end', () => {
          try {
            const parsed = responseData ? JSON.parse(responseData) : {};
            resolve({ status: res.statusCode || 500, headers: res.headers, body: parsed });
          } catch (e) {
            resolve({ status: res.statusCode || 500, headers: res.headers, body: responseData });
          }
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
};

async function runDay23TraceLoggingTests() {
  console.log('================================================================');
  console.log('=== DAY 23 END-TO-END TRACE LOGGING & OBSERVABILITY TESTS ===');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  let redisServer: RedisMemoryServer | null = null;
  let server: http.Server | null = null;

  try {
    redisServer = new RedisMemoryServer();
    await redisServer.start();
    const host = await redisServer.getHost();
    const port = await redisServer.getPort();

    process.env.REDIS_URL = `redis://${host}:${port}`;
    process.env.REDIS_LOCK_TTL_MS = '5000';

    await connectRedis();

    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));

    const tenantA = 'tenant-company-a';
    const validTokenA = generateAccessToken({
      userId: 'user-trace-a',
      tenantId: tenantA,
      role: 'ADMIN',
    });

    // 1. Trace Header Generation & Propagation
    const res1 = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${validTokenA}`,
    });
    const traceId1 = res1.headers['x-trace-id'] as string;
    assert(
      res1.status === 200 && Boolean(traceId1) && traceId1.startsWith('tr-'),
      '1. Unspecified X-Trace-Id automatically generated with valid prefix'
    );

    // 2. Custom Trace ID Propagation
    const customTraceId = 'client-custom-trace-12345';
    const res2 = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${validTokenA}`,
      'X-Trace-Id': customTraceId,
    });
    assert(
      res2.status === 200 && res2.headers['x-trace-id'] === customTraceId,
      '2. Valid incoming X-Trace-Id is preserved and propagated in response headers'
    );

    // 3. Expose-Headers Header Verification
    assert(
      res2.headers['access-control-expose-headers'] === 'X-Trace-Id',
      '3. Access-Control-Expose-Headers includes X-Trace-Id for browser client visibility'
    );

    // 4. Invalid Trace ID Handling (Excessive Length)
    const longTraceId = 'a'.repeat(100);
    const res4 = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${validTokenA}`,
      'X-Trace-Id': longTraceId,
    });
    const traceId4 = res4.headers['x-trace-id'] as string;
    assert(
      res4.status === 200 && traceId4 !== longTraceId && traceId4.startsWith('tr-'),
      '4. Excessive length X-Trace-Id (>64 chars) is replaced with clean generated trace ID'
    );

    // 5. Invalid Trace ID Handling (Illegal Characters / Injection)
    const invalidCharTraceId = 'trace_123;<script>alert(1)</script>';
    const res5 = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${validTokenA}`,
      'X-Trace-Id': invalidCharTraceId,
    });
    const traceId5 = res5.headers['x-trace-id'] as string;
    assert(
      res5.status === 200 && traceId5 !== invalidCharTraceId && traceId5.startsWith('tr-'),
      '5. Invalid character X-Trace-Id is replaced with safe generated trace ID'
    );

    // 6. Trace ID in 401 Unauthorized Auth Error JSON
    const res6 = await request(server, 'GET', '/api/tenant/me');
    assert(
      res6.status === 401 && res6.body.traceId !== undefined && res6.headers['x-trace-id'] === res6.body.traceId,
      '6. Auth failure response JSON contains traceId matching response header'
    );

    // 7. Trace ID in 404 Route Not Found Error JSON
    const res7 = await request(server, 'GET', '/api/non-existent-route-xyz');
    assert(
      res7.status === 404 && res7.body.traceId !== undefined && res7.headers['x-trace-id'] === res7.body.traceId,
      '7. 404 Not Found response JSON contains traceId matching response header'
    );

    // 8. Trace ID in Ledger Operation Response
    const res8 = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${validTokenA}` },
      {
        eventId: `evt-trace-${Date.now()}`,
        type: 'debit',
        amount: 150,
        currency: 'USD',
      }
    );
    assert(
      res8.status === 201 && res8.body.traceId !== undefined && res8.headers['x-trace-id'] === res8.body.traceId,
      '8. Ledger operation response JSON contains traceId matching response header'
    );

    // 9. Trace ID in Analytics Response
    const res9 = await request(server, 'GET', '/api/analytics/summary', {
      Authorization: `Bearer ${validTokenA}`,
    });
    assert(
      res9.status === 200 && res9.body.traceId !== undefined && res9.headers['x-trace-id'] === res9.body.traceId,
      '9. Analytics response JSON contains traceId matching response header'
    );

    // 10. Sanitization Utility Redaction Test
    const sensitivePayload = {
      password: 'super-secret-pass',
      token: 'jwt.token.value',
      authorization: 'Bearer secret',
      privateKey: '-----BEGIN PRIVATE KEY-----',
      normalField: 'safe-value',
      nested: {
        secret: 'nested-secret',
        mongoUri: 'mongodb://user:pass@localhost',
      },
    };
    const sanitized = sanitizeLogValue(sensitivePayload);
    assert(
      sanitized.password === '[REDACTED]' &&
        sanitized.token === '[REDACTED]' &&
        sanitized.authorization === '[REDACTED]' &&
        sanitized.privateKey === '[REDACTED]' &&
        sanitized.normalField === 'safe-value' &&
        sanitized.nested.secret === '[REDACTED]' &&
        sanitized.nested.mongoUri === '[REDACTED]',
      '10. Logger sanitizeLogValue redacts sensitive keys (passwords, tokens, keys, URIs)'
    );

    // 11. CRLF Injection Sanitization Test
    const crlfString = 'Line1\r\nLine2\rFORGED LOG ENTRY';
    const sanitizedCrlf = sanitizeLogValue(crlfString);
    assert(
      typeof sanitizedCrlf === 'string' && !sanitizedCrlf.includes('\r') && !sanitizedCrlf.includes('\n'),
      '11. Logger sanitizeLogValue strips carriage return \\r and newline \\n to prevent log forging'
    );
  } catch (err: any) {
    console.error('❌ Day 23 test execution error:', err);
    failed++;
  } finally {
    if (server) {
      server.close();
    }
    await tenantConnectionManager.disconnectAll();
    await disconnectRedis();
    if (redisServer) {
      await redisServer.stop();
    }
  }

  console.log('\n================================================================');
  console.log(`DAY 23 TRACE LOGGING TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runDay23TraceLoggingTests();
