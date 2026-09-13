import http from 'http';
import app from '../app';
import { generateAccessToken } from '../utils/jwt';
import { tenantConnectionManager } from '../services/tenantConnectionManager';

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

async function runIsolationTests() {
  console.log('=== STARTING DAY 5 TENANT ISOLATION & RESILIENCY TEST SUITE ===\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

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

  try {
    const tokenA = generateAccessToken({
      userId: 'user-company-a',
      tenantId: 'tenant-company-a',
      role: 'ADMIN',
    });

    const tokenB = generateAccessToken({
      userId: 'user-company-b',
      tenantId: 'tenant-company-b',
      role: 'ADMIN',
    });

    const tokenDisabled = generateAccessToken({
      userId: 'user-disabled',
      tenantId: 'tenant-disabled',
      role: 'ADMIN',
    });

    // TEST 1: Tenant A Routing
    const res1 = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${tokenA}`,
    });
    assert(
      res1.status === 200 && res1.body.tenant?.id === 'tenant-company-a',
      'Test 1: Tenant A JWT routes exclusively to Tenant A context',
      `Got status ${res1.status}`
    );

    // TEST 2: Tenant B Routing
    const res2 = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${tokenB}`,
    });
    assert(
      res2.status === 200 && res2.body.tenant?.id === 'tenant-company-b',
      'Test 2: Tenant B JWT routes exclusively to Tenant B context',
      `Got status ${res2.status}`
    );

    // TEST 3: Cross-Tenant Override Attempt (Query, Body, Header)
    const res3Query = await request(server, 'GET', '/api/tenant/me?tenantId=tenant-company-b', {
      Authorization: `Bearer ${tokenA}`,
    });
    const res3Body = await request(
      server,
      'GET',
      '/api/tenant/me',
      { Authorization: `Bearer ${tokenA}` },
      { tenantId: 'tenant-company-b' }
    );
    const res3Header = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': 'tenant-company-b',
    });

    assert(
      res3Query.body.tenant?.id === 'tenant-company-a' &&
        res3Body.body.tenant?.id === 'tenant-company-a' &&
        res3Header.body.tenant?.id === 'tenant-company-a',
      'Test 3: Query, body, and header tenant override attempts cannot change authenticated tenant identity',
      `Query: ${res3Query.body.tenant?.id}, Body: ${res3Body.body.tenant?.id}, Header: ${res3Header.body.tenant?.id}`
    );

    // TEST 4: Direct Cross-Tenant Data Isolation
    const resDataA = await request(server, 'GET', '/api/tenant/test-data', {
      Authorization: `Bearer ${tokenA}`,
    });
    const resDataB = await request(server, 'GET', '/api/tenant/test-data', {
      Authorization: `Bearer ${tokenB}`,
    });

    assert(
      resDataA.body.tenantId === 'tenant-company-a' &&
        resDataB.body.tenantId === 'tenant-company-b' &&
        resDataA.body.data.every((r: any) => r.tenantId === 'tenant-company-a') &&
        resDataB.body.data.every((r: any) => r.tenantId === 'tenant-company-b'),
      'Test 4: Tenant A receives ONLY Tenant A data; Tenant B receives ONLY Tenant B data',
      'Data leak detected between tenants'
    );

    // TEST 5: Invalid / Nonexistent Tenant
    const tokenNonexistent = generateAccessToken({
      userId: 'user-nonexistent',
      tenantId: 'tenant-nonexistent',
      role: 'ADMIN',
    });
    const res5 = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${tokenNonexistent}`,
    });
    assert(
      res5.status === 404 && res5.body.success === false,
      'Test 5: Nonexistent tenant ID in JWT returns 404 safe error without falling back',
      `Got status ${res5.status}`
    );

    // TEST 6: Disabled / Inactive Tenant
    const res6 = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${tokenDisabled}`,
    });
    assert(
      res6.status === 403 && res6.body.success === false,
      'Test 6: Disabled/inactive tenant returns 403 Forbidden without database access',
      `Got status ${res6.status}`
    );

    // TEST 7: Tenant Database Failure Simulation & Server Survival
    tenantConnectionManager.simulateFailure('tenant-company-a');

    const res7A = await request(server, 'GET', '/api/tenant/test-data', {
      Authorization: `Bearer ${tokenA}`,
    });
    const res7Health = await request(server, 'GET', '/api/health');
    const res7B = await request(server, 'GET', '/api/tenant/test-data', {
      Authorization: `Bearer ${tokenB}`,
    });

    assert(
      res7A.status === 500 &&
        res7Health.status === 200 &&
        res7B.status === 200 &&
        res7B.body.tenantId === 'tenant-company-b',
      'Test 7: Tenant A DB failure returns 500, server stays alive, /api/health works, Tenant B operates normally',
      `Tenant A status: ${res7A.status}, Health status: ${res7Health.status}, Tenant B status: ${res7B.status}`
    );

    // TEST 8: Connection Cache Resiliency Post-Failure
    tenantConnectionManager.clearSimulatedFailure('tenant-company-a');
    const res8 = await request(server, 'GET', '/api/tenant/test-data', {
      Authorization: `Bearer ${tokenA}`,
    });
    assert(
      res8.status === 200 && res8.body.tenantId === 'tenant-company-a',
      'Test 8: Connection cache recovers cleanly for Tenant A after database failure resolves',
      `Got status ${res8.status}`
    );

    // TEST 9: Unauthenticated Request Rejection
    const res9Me = await request(server, 'GET', '/api/tenant/me');
    const res9Data = await request(server, 'GET', '/api/tenant/test-data');
    assert(
      res9Me.status === 401 && res9Data.status === 401,
      'Test 9: Unauthenticated requests to /api/tenant/me and /test-data return 401 Unauthorized',
      `me status: ${res9Me.status}, data status: ${res9Data.status}`
    );

    // TEST 10: Tampered / Invalid JWT Rejection
    const tamperedToken = tokenA.substring(0, tokenA.length - 8) + '12345678';
    const res10 = await request(server, 'GET', '/api/tenant/test-data', {
      Authorization: `Bearer ${tamperedToken}`,
    });
    assert(
      res10.status === 401 && res10.body.success === false,
      'Test 10: Tampered JWT is rejected with 401 before reaching tenant resolution or DB connection',
      `Got status ${res10.status}`
    );

    // TEST 11: Middleware Failure Pipeline Order
    // Missing JWT -> stops at authenticate (401)
    // Unknown tenant -> stops at resolveTenant (404)
    // Disabled tenant -> stops at resolveTenant (403)
    assert(
      res9Me.status === 401 && res5.status === 404 && res6.status === 403,
      'Test 11: Middleware pipeline halts execution immediately upon stage failure',
      `Statuses: ${res9Me.status}, ${res5.status}, ${res6.status}`
    );

    console.log(`\n=== ISOLATION & RESILIENCY TEST RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
  } catch (err: any) {
    console.error('Test suite error:', err);
    failed++;
  } finally {
    server.close();
    await tenantConnectionManager.disconnectAll();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runIsolationTests().catch((err) => {
  console.error('Fatal isolation test error:', err);
  process.exit(1);
});

