import http from 'http';
import jwt from 'jsonwebtoken';
import app from '../app';
import { generateAccessToken, getKeys } from '../utils/jwt';
import { generateRsaKeyPair } from '../utils/generateKeys';
import { tenantConnectionManager } from '../services/tenantConnectionManager';
import { connectRedis, disconnectRedis } from '../config/redis';
import { RedisMemoryServer } from 'redis-memory-server';

const request = (
  server: http.Server,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: any
): Promise<{ status: number; body: any }> => {
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
            resolve({ status: res.statusCode || 500, body: parsed });
          } catch (e) {
            resolve({ status: res.statusCode || 500, body: responseData });
          }
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
};

async function runDay22SecurityAuditTests() {
  console.log('================================================================');
  console.log('=== DAY 22 CRYPTOGRAPHIC LAYER & API LOCKDOWN SECURITY AUDIT ===');
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

    // 1. Valid RS256 JWT
    const res1 = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${validTokenA}`,
    });
    assert(
      res1.status === 200 && res1.body.success === true && res1.body.user?.tenantId === tenantA,
      '1. Valid RS256 JWT returns 200 OK with verified identity'
    );

    // 2. Missing JWT
    const res2 = await request(server, 'GET', '/api/tenant/me');
    assert(
      res2.status === 401 && res2.body.success === false,
      '2. Missing Authorization header returns 401 Unauthorized'
    );

    // 3. Malformed JWT
    const res3a = await request(server, 'GET', '/api/tenant/me', { Authorization: 'Bearer' });
    const res3b = await request(server, 'GET', '/api/tenant/me', { Authorization: 'Bearer malformed.token.value' });
    assert(
      res3a.status === 401 && res3b.status === 401,
      '3. Malformed JWT string returns 401 Unauthorized'
    );

    // 4. Expired JWT
    const expiredToken = generateAccessToken({
      userId: 'user-sec-a',
      tenantId: tenantA,
      role: 'ADMIN',
      expiresIn: '-1s',
    });
    const res4 = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${expiredToken}`,
    });
    assert(
      res4.status === 401 && res4.body.success === false,
      '4. Expired JWT returns 401 Unauthorized'
    );

    // 5. Tampered JWT Payload
    const tokenParts = validTokenA.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: 'user-sec-a', tenantId: tenantB, role: 'ADMIN' })
    ).toString('base64url');
    const tamperedToken = `${tokenParts[0]}.${tamperedPayload}.${tokenParts[2]}`;
    const res5 = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${tamperedToken}`,
    });
    assert(
      res5.status === 401 && res5.body.success === false,
      '5. Tampered JWT payload returns 401 Unauthorized'
    );

    // 6. Wrong RSA Private Key
    const { privateKey: wrongPrivateKey } = generateRsaKeyPair();
    const wrongKeyToken = generateAccessToken({
      userId: 'user-sec-a',
      tenantId: tenantA,
      role: 'ADMIN',
      privateKeyOverride: wrongPrivateKey,
    });
    const res6 = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${wrongKeyToken}`,
    });
    assert(
      res6.status === 401 && res6.body.success === false,
      '6. JWT signed with untrusted RSA private key returns 401 Unauthorized'
    );

    // 7. Wrong Algorithm (HS256 attempt)
    const hs256Token = jwt.sign(
      { sub: 'user-sec-a', tenantId: tenantA, role: 'ADMIN' },
      'secret-key-123',
      { algorithm: 'HS256' }
    );
    const res7 = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${hs256Token}`,
    });
    assert(
      res7.status === 401 && res7.body.success === false,
      '7. Algorithm confusion attack (HS256) returns 401 Unauthorized'
    );

    // 8. Invalid Signature
    const invalidSigToken = `${tokenParts[0]}.${tokenParts[1]}.invalid_signature_bytes`;
    const res8 = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${invalidSigToken}`,
    });
    assert(
      res8.status === 401 && res8.body.success === false,
      '8. Invalid signature returns 401 Unauthorized'
    );

    // 9. Modified Tenant Claim
    const modifiedPayloadToken = `${tokenParts[0]}.${tamperedPayload}.${tokenParts[2]}`;
    const res9 = await request(server, 'GET', '/api/analytics/summary', {
      Authorization: `Bearer ${modifiedPayloadToken}`,
    });
    assert(
      res9.status === 401 && res9.body.success === false,
      '9. Modified tenant claim without valid signature rejected with 401 Unauthorized'
    );

    // 10. Missing Tenant Claim
    const { privateKey } = getKeys();
    const noTenantToken = jwt.sign({ sub: 'user-no-tenant', role: 'ADMIN' }, privateKey, { algorithm: 'RS256' });
    const res10 = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${noTenantToken}`,
    });
    assert(
      res10.status === 401 && res10.body.success === false,
      '10. Signed JWT missing mandatory tenantId claim rejected with 401 Unauthorized'
    );

    // 11. Non-existent Tenant
    const nonexistentTenantToken = generateAccessToken({
      userId: 'user-fake',
      tenantId: 'nonexistent-tenant-xyz',
      role: 'ADMIN',
    });
    const res11 = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${nonexistentTenantToken}`,
    });
    assert(
      res11.status === 404 && res11.body.success === false,
      '11. JWT with non-existent tenantId returns 404 Not Found'
    );

    // 12. Disabled Tenant
    const disabledTenantToken = generateAccessToken({
      userId: 'user-disabled',
      tenantId: 'tenant-disabled',
      role: 'ADMIN',
    });
    const res12 = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${disabledTenantToken}`,
    });
    assert(
      res12.status === 403 && res12.body.success === false,
      '12. Inactive/Disabled tenant returns 403 Forbidden'
    );

    // 13. Query Tenant Override Attack
    const res13 = await request(server, 'GET', `/api/analytics/summary?tenantId=${tenantB}`, {
      Authorization: `Bearer ${validTokenA}`,
    });
    assert(
      res13.status === 200 && res13.body.data?.range !== undefined,
      '13. Query string tenantId override attempt IGNORED; returns Tenant A data'
    );

    // 14. Body Tenant Override Attack
    const res14 = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${validTokenA}` },
      {
        eventId: `evt-override-test-${Date.now()}`,
        tenantId: tenantB, // Client override attempt in body
        type: 'debit',
        amount: 100,
        currency: 'USD',
      }
    );
    assert(
      res14.status === 201 && res14.body.data?.tenantId === tenantA,
      '14. Body tenantId override attempt IGNORED; entry created under JWT tenant (tenantA)'
    );

    // 15. Header Tenant Override Attack
    const res15 = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${validTokenA}`,
      'X-Tenant-Id': tenantB,
    });
    assert(
      res15.status === 200 && res15.body.user?.tenantId === tenantA,
      '15. Header X-Tenant-Id override attempt IGNORED; identity remains Tenant A'
    );

    // 16. Protected Tenant Endpoint Lockdown
    const res16 = await request(server, 'GET', '/api/tenant/test-data');
    assert(res16.status === 401, '16. Protected /api/tenant/test-data rejects unauthenticated requests');

    // 17. Protected Ledger Endpoint Lockdown
    const res17 = await request(server, 'GET', '/api/ledger');
    assert(res17.status === 401, '17. Protected /api/ledger rejects unauthenticated requests');

    // 18. Protected Analytics Endpoint Lockdown
    const res18 = await request(server, 'GET', '/api/analytics/summary');
    assert(res18.status === 401, '18. Protected /api/analytics/summary rejects unauthenticated requests');

    // 19. Sanitized Authentication Error Responses
    const errorString = JSON.stringify(res5.body);
    const isSanitized =
      !errorString.includes('at ') &&
      !errorString.includes('private.pem') &&
      !errorString.includes('mongodb://') &&
      !errorString.includes('JsonWebTokenError');
    assert(isSanitized, '19. Error responses are sanitized without internal stack traces or secrets');
  } catch (err: any) {
    console.error('❌ Day 22 test execution error:', err);
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
  console.log(`DAY 22 SECURITY AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runDay22SecurityAuditTests();

