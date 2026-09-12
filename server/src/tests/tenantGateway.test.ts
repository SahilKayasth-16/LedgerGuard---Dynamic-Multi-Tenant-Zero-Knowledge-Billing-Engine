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

async function runTenantGatewayTests() {
  console.log('=== STARTING DAY 4 TENANT-AWARE API GATEWAY TEST SUITE ===\n');

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

    // TEST 1: Valid authenticated tenant
    const res1 = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${tokenA}`,
    });
    assert(
      res1.status === 200 && res1.body.success === true && res1.body.tenant?.id === 'tenant-company-a',
      'TEST 1: GET /api/tenant/me with valid JWT returns 200 OK and matching tenant info',
      `Got status ${res1.status}, body: ${JSON.stringify(res1.body)}`
    );

    // TEST 2: Missing JWT
    const res2 = await request(server, 'GET', '/api/tenant/me');
    assert(
      res2.status === 401 && res2.body.success === false,
      'TEST 2: GET /api/tenant/me without JWT returns 401 Unauthorized',
      `Got status ${res2.status}`
    );

    // TEST 3: Invalid / tampered JWT
    const tamperedToken = tokenA.substring(0, tokenA.length - 6) + 'abcdef';
    const res3 = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${tamperedToken}`,
    });
    assert(
      res3.status === 401 && res3.body.success === false,
      'TEST 3: GET /api/tenant/me with tampered JWT returns 401 Unauthorized',
      `Got status ${res3.status}`
    );

    // TEST 4: Tenant override attempt
    const res4 = await request(
      server,
      'GET',
      '/api/tenant/me?tenantId=tenant-company-b',
      {
        Authorization: `Bearer ${tokenA}`,
      },
      { tenantId: 'tenant-company-b' }
    );
    assert(
      res4.status === 200 && res4.body.tenant?.id === 'tenant-company-a',
      'TEST 4: Client input (?tenantId=company-b or body) CANNOT override verified JWT tenantId',
      `Got tenant: ${res4.body.tenant?.id}`
    );

    // TEST 5: Unknown tenant in JWT
    const unknownToken = generateAccessToken({
      userId: 'user-unknown',
      tenantId: 'tenant-unknown',
      role: 'ADMIN',
    });
    const res5 = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${unknownToken}`,
    });
    assert(
      res5.status === 404 && res5.body.success === false,
      'TEST 5: Unknown tenant ID in JWT returns safe resolution error without falling back',
      `Got status ${res5.status}`
    );

    // TEST 6: Tenant database attachment
    const res6 = await request(server, 'GET', '/api/tenant/test-data', {
      Authorization: `Bearer ${tokenA}`,
    });
    assert(
      res6.status === 200 && res6.body.success === true && res6.body.tenantId === 'tenant-company-a',
      'TEST 6: GET /api/tenant/test-data attaches tenant DB connection and queries records',
      `Got status ${res6.status}, tenantId: ${res6.body.tenantId}`
    );

    // TEST 7: Tenant database isolation
    const res7B = await request(server, 'GET', '/api/tenant/test-data', {
      Authorization: `Bearer ${tokenB}`,
    });
    assert(
      res7B.status === 200 &&
        res7B.body.tenantId === 'tenant-company-b' &&
        res6.body.tenantId !== res7B.body.tenantId,
      'TEST 7: Company A and Company B query strictly isolated database connections',
      `Got tokenA tenantId ${res6.body.tenantId}, tokenB tenantId ${res7B.body.tenantId}`
    );

    // TEST 8: Connection reuse across requests
    const initialActiveConns = tenantConnectionManager.getCacheStats().activeConnections;
    await request(server, 'GET', '/api/tenant/test-data', {
      Authorization: `Bearer ${tokenA}`,
    });
    const postActiveConns = tenantConnectionManager.getCacheStats().activeConnections;
    assert(
      initialActiveConns === postActiveConns,
      'TEST 8: Consecutive API requests for tenant A reuse cached connection without opening new pools',
      `Initial conns: ${initialActiveConns}, Post conns: ${postActiveConns}`
    );

    // TEST 9: Unauthorized tenant test-data access
    const res9 = await request(server, 'GET', '/api/tenant/test-data');
    assert(
      res9.status === 401 && res9.body.success === false,
      'TEST 9: GET /api/tenant/test-data without JWT returns 401 Unauthorized',
      `Got status ${res9.status}`
    );

    // TEST 10: Cross-tenant access prevention
    // Company A token cannot access Company B data
    const res10 = await request(
      server,
      'GET',
      '/api/tenant/test-data?tenantId=tenant-company-b',
      {
        Authorization: `Bearer ${tokenA}`,
      },
      { tenantId: 'tenant-company-b' }
    );
    assert(
      res10.status === 200 && res10.body.tenantId === 'tenant-company-a',
      'TEST 10: Company A JWT cannot retrieve Company B data even if client requests company-b',
      `Returned tenantId: ${res10.body.tenantId}`
    );

    console.log(`\n=== TENANT GATEWAY TEST RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
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

runTenantGatewayTests().catch((err) => {
  console.error('Fatal gateway test error:', err);
  process.exit(1);
});

