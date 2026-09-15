import http from 'http';
import jwt from 'jsonwebtoken';
import app from '../app';
import { generateAccessToken } from '../utils/jwt';
import { generateRsaKeyPair } from '../utils/generateKeys';
import { tenantConnectionManager } from '../services/tenantConnectionManager';

// HTTP client helper for test execution
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

async function runWeek1Audit() {
  console.log('===============================================================');
  console.log('=== WEEK 1 INTEGRATION & SECURITY AUDIT TEST SUITE (DAY 7) ===');
  console.log('===============================================================\n');

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
    // Generate authoritative test tokens
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

    const tokenNonexistent = generateAccessToken({
      userId: 'user-unknown',
      tenantId: 'tenant-nonexistent',
      role: 'ADMIN',
    });

    // -----------------------------------------------------------------
    // AUDIT SECTION 1: END-TO-END MULTITENANT ROUTING & DATA ISOLATION
    // -----------------------------------------------------------------
    console.log('--- SECTION 1: Multitenant Routing & Data Isolation Audit ---');

    const resMeA = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${tokenA}`,
    });
    assert(
      resMeA.status === 200 && resMeA.body.tenant?.id === 'tenant-company-a',
      'Audit 1.1: Tenant A JWT routes exclusively to Tenant A context & database config',
      `Got status ${resMeA.status}`
    );

    const resMeB = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${tokenB}`,
    });
    assert(
      resMeB.status === 200 && resMeB.body.tenant?.id === 'tenant-company-b',
      'Audit 1.2: Tenant B JWT routes exclusively to Tenant B context & database config',
      `Got status ${resMeB.status}`
    );

    const resDataA = await request(server, 'GET', '/api/tenant/test-data', {
      Authorization: `Bearer ${tokenA}`,
    });
    const resDataB = await request(server, 'GET', '/api/tenant/test-data', {
      Authorization: `Bearer ${tokenB}`,
    });

    const dataAOnlyA = resDataA.body.data?.every((item: any) => item.tenantId === 'tenant-company-a');
    const dataBOnlyB = resDataB.body.data?.every((item: any) => item.tenantId === 'tenant-company-b');

    assert(
      resDataA.status === 200 &&
        resDataB.status === 200 &&
        resDataA.body.tenantId === 'tenant-company-a' &&
        resDataB.body.tenantId === 'tenant-company-b' &&
        dataAOnlyA &&
        dataBOnlyB,
      'Audit 1.3: End-to-end data segregation verified — Tenant A & B receive only their own data',
      'Data leakage detected between tenant endpoints'
    );

    // -----------------------------------------------------------------
    // AUDIT SECTION 2: 100-REQUEST CONNECTION REUSE PERFORMANCE SANITY
    // -----------------------------------------------------------------
    console.log('\n--- SECTION 2: 100-Request Connection Reuse & Stress Sanity Audit ---');

    const initialStats = tenantConnectionManager.getCacheStats();
    console.log(`[Cache State] Active connections before stress test: ${initialStats.activeConnections}`);

    const stressPromises = [];
    for (let i = 0; i < 100; i++) {
      stressPromises.push(
        request(server, 'GET', '/api/tenant/test-data', {
          Authorization: `Bearer ${tokenA}`,
        })
      );
    }

    const stressResults = await Promise.all(stressPromises);
    const all200OK = stressResults.every((res) => res.status === 200);
    const postStats = tenantConnectionManager.getCacheStats();

    console.log(`[Cache State] Active connections after 100 requests: ${postStats.activeConnections}`);

    assert(
      all200OK && postStats.activeConnections <= 2 && postStats.cachedTenants.includes('tenant-company-a'),
      'Audit 2.1: 100 concurrent requests for Tenant A succeed with 100% 200 OK using pooled cached connection',
      `All 200 OK: ${all200OK}, Active connections: ${postStats.activeConnections}`
    );

    // -----------------------------------------------------------------
    // AUDIT SECTION 3: TOKEN REPLAY & STATELESS CONTEXT AUDIT
    // -----------------------------------------------------------------
    console.log('\n--- SECTION 3: Token Replay & Stateless Context Audit ---');

    const reqSeq1 = await request(server, 'GET', '/api/tenant/me', { Authorization: `Bearer ${tokenA}` });
    const reqSeq2 = await request(server, 'GET', '/api/tenant/me', { Authorization: `Bearer ${tokenB}` });
    const reqSeq3 = await request(server, 'GET', '/api/tenant/me'); // No token
    const reqSeq4 = await request(server, 'GET', '/api/tenant/me', { Authorization: `Bearer ${tokenA}` });

    const expiredToken = generateAccessToken({
      userId: 'user-company-a',
      tenantId: 'tenant-company-a',
      role: 'ADMIN',
      expiresIn: '-5s',
    });
    const reqSeq5 = await request(server, 'GET', '/api/tenant/me', { Authorization: `Bearer ${expiredToken}` });

    assert(
      reqSeq1.body.tenant?.id === 'tenant-company-a' &&
        reqSeq2.body.tenant?.id === 'tenant-company-b' &&
        reqSeq3.status === 401 &&
        reqSeq4.body.tenant?.id === 'tenant-company-a' &&
        reqSeq5.status === 401,
      'Audit 3.1: Request context is strictly stateless — no cross-request state bleeding or expired token replay vulnerability',
      `Seq 1: ${reqSeq1.body.tenant?.id}, Seq 2: ${reqSeq2.body.tenant?.id}, Seq 3: ${reqSeq3.status}, Seq 4: ${reqSeq4.body.tenant?.id}, Seq 5: ${reqSeq5.status}`
    );

    // -----------------------------------------------------------------
    // AUDIT SECTION 4: SECURITY & CLIENT PARAMETER TAMPERING AUDIT
    // -----------------------------------------------------------------
    console.log('\n--- SECTION 4: Security & Parameter Override Audit ---');

    // Missing Token
    const resNoToken = await request(server, 'GET', '/api/tenant/me');
    assert(resNoToken.status === 401, 'Audit 4.1: Missing JWT returns 401 Unauthorized');

    // Tampered Token
    const tokenParts = tokenA.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: 'user-company-a', tenantId: 'tenant-company-b', role: 'ADMIN' })
    ).toString('base64url');
    const tamperedToken = `${tokenParts[0]}.${tamperedPayload}.${tokenParts[2]}`;
    const resTampered = await request(server, 'GET', '/api/tenant/me', { Authorization: `Bearer ${tamperedToken}` });
    assert(resTampered.status === 401, 'Audit 4.2: Tampered JWT signature returns 401 Unauthorized');

    // Wrong RSA Key
    const { privateKey: wrongPrivateKey } = generateRsaKeyPair();
    const wrongKeyToken = generateAccessToken({
      userId: 'user-company-a',
      tenantId: 'tenant-company-a',
      role: 'ADMIN',
      privateKeyOverride: wrongPrivateKey,
    });
    const resWrongKey = await request(server, 'GET', '/api/tenant/me', { Authorization: `Bearer ${wrongKeyToken}` });
    assert(resWrongKey.status === 401, 'Audit 4.3: JWT signed with untrusted RSA private key returns 401 Unauthorized');

    // HS256 Attack Attempt
    const hs256Token = jwt.sign(
      { sub: 'user-company-a', tenantId: 'tenant-company-a', role: 'ADMIN' },
      'secret-key-123',
      { algorithm: 'HS256' }
    );
    const resHs256 = await request(server, 'GET', '/api/tenant/me', { Authorization: `Bearer ${hs256Token}` });
    assert(resHs256.status === 401, 'Audit 4.4: Non-RS256 algorithm attempt (HS256) returns 401 Unauthorized');

    // Parameter Override Attacks
    const resOverrideQuery = await request(server, 'GET', '/api/tenant/me?tenantId=tenant-company-b', {
      Authorization: `Bearer ${tokenA}`,
    });
    const resOverrideBody = await request(
      server,
      'GET',
      '/api/tenant/me',
      { Authorization: `Bearer ${tokenA}` },
      { tenantId: 'tenant-company-b' }
    );
    const resOverrideHeader = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${tokenA}`,
      'x-tenant-id': 'tenant-company-b',
    });
    assert(
      resOverrideQuery.body.tenant?.id === 'tenant-company-a' &&
        resOverrideBody.body.tenant?.id === 'tenant-company-a' &&
        resOverrideHeader.body.tenant?.id === 'tenant-company-a',
      'Audit 4.5: Verified JWT authority resists query, body, and custom header tenant ID injection',
      `Query: ${resOverrideQuery.body.tenant?.id}, Body: ${resOverrideBody.body.tenant?.id}, Header: ${resOverrideHeader.body.tenant?.id}`
    );

    // Nonexistent Tenant
    const resNonexistent = await request(server, 'GET', '/api/tenant/me', { Authorization: `Bearer ${tokenNonexistent}` });
    assert(resNonexistent.status === 404, 'Audit 4.6: Unknown tenant ID in JWT returns 404 safe resolution error');

    // Disabled Tenant
    const resDisabled = await request(server, 'GET', '/api/tenant/me', { Authorization: `Bearer ${tokenDisabled}` });
    assert(resDisabled.status === 403, 'Audit 4.7: Disabled tenant returns 403 Forbidden without database access');

    // -----------------------------------------------------------------
    // AUDIT SECTION 5: DATABASE FAILURE RESILIENCY & SERVER SURVIVAL AUDIT
    // -----------------------------------------------------------------
    console.log('\n--- SECTION 5: Database Failure Resiliency & Server Survival Audit ---');

    // 1. Simulate DB failure for Tenant A
    tenantConnectionManager.simulateFailure('tenant-company-a');

    // 2. Request Tenant A endpoint -> returns 500 error cleanly
    const resFailA = await request(server, 'GET', '/api/tenant/test-data', { Authorization: `Bearer ${tokenA}` });
    assert(resFailA.status === 500, 'Audit 5.1: Tenant A DB failure returns 500 Internal Server Error cleanly');

    // 3. Health check -> 200 OK (Server process survived)
    const resHealth = await request(server, 'GET', '/api/health');
    assert(
      resHealth.status === 200 && resHealth.body.success === true,
      'Audit 5.2: Server process survives Tenant A database failure, /api/health returns 200 OK'
    );

    // 4. Tenant B endpoint -> 200 OK (Tenant B unaffected)
    const resSuccessB = await request(server, 'GET', '/api/tenant/test-data', { Authorization: `Bearer ${tokenB}` });
    assert(
      resSuccessB.status === 200 && resSuccessB.body.tenantId === 'tenant-company-b',
      'Audit 5.3: Tenant B remains 100% operational during Tenant A database failure'
    );

    // 5. Recovery test: clear failure for Tenant A
    tenantConnectionManager.clearSimulatedFailure('tenant-company-a');
    const resRecoverA = await request(server, 'GET', '/api/tenant/test-data', { Authorization: `Bearer ${tokenA}` });
    assert(
      resRecoverA.status === 200 && resRecoverA.body.tenantId === 'tenant-company-a',
      'Audit 5.4: Tenant A connection cache recovers seamlessly after database failure resolves'
    );

    console.log(`\n===============================================================`);
    console.log(`=== AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
    console.log(`===============================================================\n`);
  } finally {
    await tenantConnectionManager.disconnectAll();
    server.close();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runWeek1Audit().catch((err) => {
  console.error('Audit suite failure:', err);
  process.exit(1);
});
