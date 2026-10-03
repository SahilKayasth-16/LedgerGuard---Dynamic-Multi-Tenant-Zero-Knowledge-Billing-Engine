import http from 'http';
import jwt from 'jsonwebtoken';
import app from '../app';
import { generateAccessToken, getKeys } from '../utils/jwt';
import { generateRsaKeyPair } from '../utils/generateKeys';
import { tenantConnectionManager } from '../services/tenantConnectionManager';
import { connectRedis, disconnectRedis, getRedisClient, setSimulatedRedisFailure } from '../config/redis';
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
    const payload = typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined;

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

export async function runDay24SecurityHardeningTests() {
  console.log('================================================================');
  console.log('=== DAY 24 SECURITY HARDENING & FAILURE AUDIT SUITE ===');
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
    const tenantB = 'tenant-company-b';

    const validTokenA = generateAccessToken({
      userId: 'user-sec-a',
      tenantId: tenantA,
      role: 'ADMIN',
    });

    const validTokenB = generateAccessToken({
      userId: 'user-sec-b',
      tenantId: tenantB,
      role: 'ADMIN',
    });

    // ----------------------------------------------------
    // 4. AUTHENTICATION SECURITY TESTING
    // ----------------------------------------------------
    console.log('\n--- 4. Authentication Security ---');

    // 4.1 Missing JWT
    const res4_1a = await request(server, 'GET', '/api/tenant/me');
    const res4_1b = await request(server, 'GET', '/api/ledger');
    const res4_1c = await request(server, 'GET', '/api/analytics/summary?range=30d');
    assert(
      res4_1a.status === 401 && res4_1b.status === 401 && res4_1c.status === 401,
      '4.1 Missing JWT returns 401 on protected endpoints'
    );

    // 4.2 Expired JWT
    const expiredToken = generateAccessToken({
      userId: 'user-sec-a',
      tenantId: tenantA,
      role: 'ADMIN',
      expiresIn: '-1s',
    });
    const res4_2 = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${expiredToken}`,
    });
    assert(res4_2.status === 401, '4.2 Expired JWT rejected with 401');

    // 4.3 Tampered JWT
    const tokenParts = validTokenA.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: 'user-sec-a', tenantId: tenantB, role: 'ADMIN' })
    ).toString('base64url');
    const tamperedToken = `${tokenParts[0]}.${tamperedPayload}.${tokenParts[2]}`;
    const res4_3 = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${tamperedToken}`,
    });
    assert(res4_3.status === 401, '4.3 Tampered JWT payload rejected with 401');

    // 4.4 Wrong RSA Key
    const { privateKey: wrongPrivateKey } = generateRsaKeyPair();
    const wrongKeyToken = generateAccessToken({
      userId: 'user-sec-a',
      tenantId: tenantA,
      role: 'ADMIN',
      privateKeyOverride: wrongPrivateKey,
    });
    const res4_4 = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${wrongKeyToken}`,
    });
    assert(res4_4.status === 401, '4.4 JWT signed with untrusted RSA key rejected with 401');

    // 4.5 Wrong Algorithm (HS256)
    const hs256Token = jwt.sign(
      { sub: 'user-sec-a', tenantId: tenantA, role: 'ADMIN' },
      'secret-key-123',
      { algorithm: 'HS256' }
    );
    const res4_5 = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${hs256Token}`,
    });
    assert(res4_5.status === 401, '4.5 HS256 algorithm confusion attempt rejected with 401');

    // 4.6 Malformed JWT
    const res4_6a = await request(server, 'GET', '/api/tenant/me', { Authorization: 'Bearer' });
    const res4_6b = await request(server, 'GET', '/api/tenant/me', { Authorization: 'Bearer malformed.jwt.str' });
    assert(res4_6a.status === 401 && res4_6b.status === 401, '4.6 Malformed JWT formats rejected with 401');

    // ----------------------------------------------------
    // 5. AUTHORIZATION / TENANT ISOLATION
    // ----------------------------------------------------
    console.log('\n--- 5. Authorization / Tenant Isolation ---');

    // 5.1 Tenant A -> Tenant B Override
    const res5_1a = await request(server, 'GET', `/api/analytics/summary?tenantId=${tenantB}`, {
      Authorization: `Bearer ${validTokenA}`,
    });
    const res5_1b = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${validTokenA}` },
      { eventId: `evt-override-${Date.now()}`, tenantId: tenantB, type: 'debit', amount: 50, currency: 'USD' }
    );
    assert(
      res5_1a.status === 200 && res5_1b.status === 201 && res5_1b.body.data.tenantId === tenantA,
      '5.1 Tenant override attempts (query/body) IGNORED; identity remains Tenant A'
    );

    // 5.2 Unauthorized Analytics
    const res5_2 = await request(server, 'GET', '/api/analytics/summary');
    assert(res5_2.status === 401, '5.2 Unauthorized analytics access rejected with 401');

    // 5.3 Unauthorized Ledger
    const res5_3 = await request(server, 'GET', '/api/ledger');
    assert(res5_3.status === 401, '5.3 Unauthorized ledger access rejected with 401');

    // 5.4 Unauthorized Tenant APIs
    const res5_4a = await request(server, 'GET', '/api/tenant/me');
    const res5_4b = await request(server, 'GET', '/api/tenant/test-data');
    assert(res5_4a.status === 401 && res5_4b.status === 401, '5.4 Protected tenant endpoints reject unauthenticated access');

    // ----------------------------------------------------
    // 6. INPUT VALIDATION SECURITY TESTING
    // ----------------------------------------------------
    console.log('\n--- 6. Input Validation Security ---');

    // 6.1 Invalid eventId
    const res6_1a = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${validTokenA}` },
      { eventId: '', type: 'debit', amount: 100, currency: 'USD' }
    );
    assert(res6_1a.status === 400, '6.1 Empty eventId rejected with 400');

    // 6.2 Invalid amount
    const res6_2a = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${validTokenA}` },
      { eventId: `evt-neg-${Date.now()}`, type: 'debit', amount: -100, currency: 'USD' }
    );
    const res6_2b = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${validTokenA}` },
      { eventId: `evt-nan-${Date.now()}`, type: 'debit', amount: 'abc' as any, currency: 'USD' }
    );
    assert(res6_2a.status === 400 && res6_2b.status === 400, '6.2 Negative and non-numeric amounts rejected with 400');

    // 6.3 Invalid status (server-controlled)
    const res6_3 = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${validTokenA}` },
      { eventId: `evt-stat-${Date.now()}`, type: 'debit', amount: 100, currency: 'USD', status: 'unknown' }
    );
    assert(res6_3.status === 201 && (res6_3.body.data.status === 'completed' || res6_3.body.data.status === 'COMPLETED'), '6.3 Client-controlled status override IGNORED; set by server to completed');

    // 6.4 Invalid Analytics Range
    const res6_4a = await request(server, 'GET', '/api/analytics/summary?range=abc', {
      Authorization: `Bearer ${validTokenA}`,
    });
    const res6_4b = await request(server, 'GET', '/api/analytics/summary?range=999999d', {
      Authorization: `Bearer ${validTokenA}`,
    });
    assert(res6_4a.status === 400 && res6_4b.status === 400, '6.4 Invalid analytics range parameters rejected with 400');

    // 6.5 Malformed Request Body
    const res6_5 = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${validTokenA}` },
      '{ invalid json body '
    );
    assert(res6_5.status === 400, '6.5 Malformed JSON body rejected with 400');

    // 6.6 Unexpected Fields
    const res6_6 = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${validTokenA}` },
      { eventId: `evt-unexp-${Date.now()}`, type: 'debit', amount: 100, currency: 'USD', admin: true, superuser: 1 }
    );
    assert(res6_6.status === 201 && (res6_6.body.data as any).admin === undefined, '6.6 Unexpected body fields safely ignored without privilege escalation');

    // 6.7 Huge Input (Request Body Size Limit)
    const hugePayload = {
      eventId: `evt-huge-${Date.now()}`,
      type: 'debit',
      amount: 100,
      currency: 'USD',
      description: 'x'.repeat(200000), // ~200KB exceeds Express default 100KB limit
    };
    const res6_7 = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${validTokenA}` },
      hugePayload
    );
    assert(res6_7.status === 413, '6.7 Oversized payload (>100KB) rejected with 413 Payload Too Large');

    // 6.8 Missing Required Fields
    const res6_8 = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${validTokenA}` },
      { type: 'debit', amount: 100, currency: 'USD' } // Missing eventId
    );
    assert(res6_8.status === 400, '6.8 Request missing required fields rejected with 400');

    // ----------------------------------------------------
    // 7. INFRASTRUCTURE FAILURE TESTING
    // ----------------------------------------------------
    console.log('\n--- 7. Infrastructure Failure Testing ---');

    // 7.2 Redis Unavailable Simulation
    setSimulatedRedisFailure(true);
    const res7_2 = await request(
      server!,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${validTokenA}` },
      { eventId: `evt-redis-fail-${Date.now()}`, type: 'debit', amount: 100, currency: 'USD' }
    );
    assert(
      res7_2.status === 503 && res7_2.body.code === 'REDIS_UNAVAILABLE',
      '7.2 Redis lock failure safely returns 503 REDIS_UNAVAILABLE without bypassing lock'
    );
    setSimulatedRedisFailure(false);

    // 7.3 Invalid Tenant ID in Valid Token
    const invalidTenantToken = generateAccessToken({
      userId: 'user-fake',
      tenantId: 'nonexistent-tenant-xyz',
      role: 'ADMIN',
    });
    const res7_3 = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${invalidTenantToken}`,
    });
    assert(res7_3.status === 404, '7.3 Nonexistent tenantId in valid token rejected with 404');

    // ----------------------------------------------------
    // 8. ERROR RESPONSE SECURITY AUDIT
    // ----------------------------------------------------
    console.log('\n--- 8. Error Response Security ---');
    const errString = JSON.stringify(res4_3.body);
    const isCleanError =
      !errString.includes('at ') &&
      !errString.includes('mongodb://') &&
      !errString.includes('private.pem') &&
      !errString.includes('JsonWebTokenError');
    assert(isCleanError, '8. Error responses sanitized without exposing stack traces, keys, or URIs');

    // ----------------------------------------------------
    // 17. TRACE ID FAILURE CORRELATION
    // ----------------------------------------------------
    console.log('\n--- 17. Trace ID Failure Correlation ---');
    assert(
      Boolean(res4_1a.headers['x-trace-id']) &&
        Boolean(res6_1a.headers['x-trace-id']) &&
        Boolean(res7_2.headers['x-trace-id']),
      '17. X-Trace-Id header present across all auth, validation, and infrastructure failure responses'
    );

    // ----------------------------------------------------
    // 21. CONTROLLED CONCURRENCY / FAILURE TEST
    // ----------------------------------------------------
    console.log('\n--- 21. Controlled Concurrency Test ---');
    // Warm up database connection pool before burst
    await request(server!, 'GET', '/api/ledger', { Authorization: `Bearer ${validTokenA}` });
    const concurrentEvtId = `evt-concurrent-d24-${Date.now()}`;
    const concurrentRequests = Array.from({ length: 10 }).map(() =>
      request(
        server!,
        'POST',
        '/api/ledger',
        { Authorization: `Bearer ${validTokenA}` },
        { eventId: concurrentEvtId, type: 'debit', amount: 100, currency: 'USD' }
      )
    );
    const concurrentResults = await Promise.all(concurrentRequests);
    const successCount = concurrentResults.filter((r) => r.status === 201).length;
    const duplicateCount = concurrentResults.filter((r) => r.status === 200 && r.body.duplicate === true).length;
    const lockedCount = concurrentResults.filter((r) => r.status === 409).length;
    assert(
      successCount === 1 && successCount + duplicateCount + lockedCount === 10,
      `21. 10 concurrent requests handled safely: 1 created (${successCount}), rest duplicates/locked (${duplicateCount + lockedCount})`
    );

    // ----------------------------------------------------
    // 22. SERVER STABILITY TEST
    // ----------------------------------------------------
    const res22 = await request(server, 'GET', '/api/health');
    assert(res22.status === 200 && res22.body.success === true, '22. GET /api/health returns 200 OK after attack tests');

  } catch (err: any) {
    console.log('❌ Day 24 test execution error:', err?.stack || err);
    failed++;
  } finally {
    await new Promise((r) => setTimeout(r, 100));
    if (server) {
      server.close();
    }
    await tenantConnectionManager.disconnectAll();
    await disconnectRedis();
    if (redisServer) {
      try {
        await redisServer.stop();
      } catch (_) {}
    }
  }

  console.log('\n================================================================');
  console.log(`DAY 24 SECURITY HARDENING SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runDay24SecurityHardeningTests();
}
