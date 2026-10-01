import http from 'http';
import { RedisMemoryServer } from 'redis-memory-server';
import app from '../app';
import { tenantConnectionManager } from '../services/tenantConnectionManager';
import { connectRedis, disconnectRedis } from '../config/redis';
import { generateAccessToken } from '../utils/jwt';
import { getLedgerModel } from '../models/ledger.model';

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

async function runDay20AnalyticsAuditTests() {
  console.log('================================================================');
  console.log('=== DAY 20 ANALYTICS SECURITY, ACCURACY & PERFORMANCE AUDIT ===');
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

    const tenantDbA = await tenantConnectionManager.getTenantConnection(tenantA);
    const tenantDbB = await tenantConnectionManager.getTenantConnection(tenantB);

    const tokenA = generateAccessToken({ userId: 'user-d20-a', tenantId: tenantA, role: 'ADMIN' });
    const tokenB = generateAccessToken({ userId: 'user-d20-b', tenantId: tenantB, role: 'ADMIN' });

    const LedgerA = getLedgerModel(tenantDbA);
    const LedgerB = getLedgerModel(tenantDbB);

    // Clean test collections to ensure isolated independent data accuracy math
    await LedgerA.deleteMany({});
    await LedgerB.deleteMany({});

    const uniqueSuffix = Date.now();

    // Setup Controlled Dataset for Tenant A
    // Event A (100 debit completed), Event B (200 debit completed), Event C (300 debit completed) -> Total = 600
    // Event D (500 debit failed) -> Excluded from expenditure, counted in failed
    // Event E (400 credit completed) -> Excluded from debit expenditure, counted in successful
    const controlledDatasetA = [
      {
        eventId: `evt-audit-a1-${uniqueSuffix}`,
        tenantId: tenantA,
        type: 'debit',
        amount: 100,
        currency: 'USD',
        status: 'completed',
        createdAt: new Date(),
      },
      {
        eventId: `evt-audit-a2-${uniqueSuffix}`,
        tenantId: tenantA,
        type: 'debit',
        amount: 200,
        currency: 'USD',
        status: 'completed',
        createdAt: new Date(),
      },
      {
        eventId: `evt-audit-a3-${uniqueSuffix}`,
        tenantId: tenantA,
        type: 'debit',
        amount: 300,
        currency: 'USD',
        status: 'completed',
        createdAt: new Date(),
      },
      {
        eventId: `evt-audit-a4-${uniqueSuffix}`,
        tenantId: tenantA,
        type: 'debit',
        amount: 500,
        currency: 'USD',
        status: 'failed',
        createdAt: new Date(),
      },
      {
        eventId: `evt-audit-a5-${uniqueSuffix}`,
        tenantId: tenantA,
        type: 'credit',
        amount: 400,
        currency: 'USD',
        status: 'completed',
        createdAt: new Date(),
      },
    ];

    // Setup Controlled Dataset for Tenant B
    // Event B1 (1000 debit completed), Event B2 (2000 debit completed), Event B3 (3000 debit completed) -> Total = 6000
    const controlledDatasetB = [
      {
        eventId: `evt-audit-b1-${uniqueSuffix}`,
        tenantId: tenantB,
        type: 'debit',
        amount: 1000,
        currency: 'USD',
        status: 'completed',
        createdAt: new Date(),
      },
      {
        eventId: `evt-audit-b2-${uniqueSuffix}`,
        tenantId: tenantB,
        type: 'debit',
        amount: 2000,
        currency: 'USD',
        status: 'completed',
        createdAt: new Date(),
      },
      {
        eventId: `evt-audit-b3-${uniqueSuffix}`,
        tenantId: tenantB,
        type: 'debit',
        amount: 3000,
        currency: 'USD',
        status: 'completed',
        createdAt: new Date(),
      },
    ];

    await LedgerA.create(controlledDatasetA as any);
    await LedgerB.create(controlledDatasetB as any);

    // AUDIT TEST 1: Tenant Isolation
    const resSummaryA = await request(server, 'GET', '/api/analytics/summary?range=30d', {
      Authorization: `Bearer ${tokenA}`,
    });
    const resSummaryB = await request(server, 'GET', '/api/analytics/summary?range=30d', {
      Authorization: `Bearer ${tokenB}`,
    });

    assert(
      resSummaryA.status === 200 &&
        resSummaryA.body.data.totalExpenditure === 600 &&
        resSummaryB.status === 200 &&
        resSummaryB.body.data.totalExpenditure === 6000,
      '1. Tenant Isolation Audit: Tenant A JWT returns 600; Tenant B JWT returns 6000'
    );

    // AUDIT TEST 2: Tenant Override Attack Protection
    const resOverride = await request(
      server,
      'GET',
      `/api/analytics/summary?range=30d&tenantId=${tenantB}`,
      {
        Authorization: `Bearer ${tokenA}`,
      }
    );

    assert(
      resOverride.status === 200 && resOverride.body.data.totalExpenditure === 600,
      '2. Tenant Override Attack Audit: Query param tenantId=tenantB IGNORED; returns Tenant A data (600)'
    );

    // AUDIT TEST 3: Independent Data Accuracy Calculation
    const expectedExpenditureA = 100 + 200 + 300; // 600
    const expectedTotalTxA = 5;
    const expectedSuccessTxA = 4; // 3 debits + 1 credit completed
    const expectedFailedTxA = 1; // 1 debit failed

    assert(
      resSummaryA.body.data.totalExpenditure === expectedExpenditureA &&
        resSummaryA.body.data.totalTransactions === expectedTotalTxA &&
        resSummaryA.body.data.successfulTransactions === expectedSuccessTxA &&
        resSummaryA.body.data.failedTransactions === expectedFailedTxA,
      '3. Independent Data Accuracy Audit: Actual metrics match independently calculated totals (600 expenditure, 5 total, 4 success, 1 failed)'
    );

    // AUDIT TEST 4: Failed Record Handling
    assert(
      resSummaryA.body.data.totalExpenditure === 600 && resSummaryA.body.data.failedTransactions === 1,
      '4. Failed Record Handling Audit: Failed transaction (500) is excluded from expenditure and included in failed count'
    );

    // AUDIT TEST 5: Date Range Boundary Accuracy
    const now = Date.now();
    const dateInside7d = new Date(now - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    const dateOutside7dInside30d = new Date(now - 15 * 24 * 60 * 60 * 1000); // 15 days ago
    const dateOutside30dInside90d = new Date(now - 45 * 24 * 60 * 60 * 1000); // 45 days ago

    await LedgerA.create([
      {
        eventId: `evt-boundary-1-${uniqueSuffix}`,
        tenantId: tenantA,
        type: 'debit',
        amount: 50,
        currency: 'USD',
        status: 'completed',
        createdAt: dateInside7d,
      },
      {
        eventId: `evt-boundary-2-${uniqueSuffix}`,
        tenantId: tenantA,
        type: 'debit',
        amount: 150,
        currency: 'USD',
        status: 'completed',
        createdAt: dateOutside7dInside30d,
      },
      {
        eventId: `evt-boundary-3-${uniqueSuffix}`,
        tenantId: tenantA,
        type: 'debit',
        amount: 250,
        currency: 'USD',
        status: 'completed',
        createdAt: dateOutside30dInside90d,
      },
    ]);

    const resRange7d = await request(server, 'GET', '/api/analytics/summary?range=7d', {
      Authorization: `Bearer ${tokenA}`,
    });
    const resRange30d = await request(server, 'GET', '/api/analytics/summary?range=30d', {
      Authorization: `Bearer ${tokenA}`,
    });
    const resRange90d = await request(server, 'GET', '/api/analytics/summary?range=90d', {
      Authorization: `Bearer ${tokenA}`,
    });

    // 7d includes 600 (today) + 50 (2 days ago) = 650
    // 30d includes 650 + 150 (15 days ago) = 800
    // 90d includes 800 + 250 (45 days ago) = 1050
    assert(
      resRange7d.body.data.totalExpenditure === 650 &&
        resRange30d.body.data.totalExpenditure === 800 &&
        resRange90d.body.data.totalExpenditure === 1050,
      '5. Date Range Boundary Audit: 7d (650), 30d (800), 90d (1050) correctly include/exclude boundary records'
    );

    // AUDIT TEST 6: Invalid Range Validation
    const invalidRanges = ['abc', '-1', '999999', '1d', '365d'];
    let allInvalidRejected = true;

    for (const invRange of invalidRanges) {
      const resInv = await request(server, 'GET', `/api/analytics/summary?range=${invRange}`, {
        Authorization: `Bearer ${tokenA}`,
      });
      if (resInv.status !== 400 || resInv.body.success !== false) {
        allInvalidRejected = false;
        break;
      }
    }

    assert(
      allInvalidRejected,
      '6. Invalid Range Validation Audit: Malformed & unsupported ranges (abc, -1, 999999, 1d, 365d) return 400 Bad Request'
    );

    // AUDIT TEST 7: Empty Tenant Behavior
    // Clear LedgerB to simulate empty tenant
    await LedgerB.deleteMany({});

    const resEmptySummary = await request(server, 'GET', '/api/analytics/summary?range=30d', {
      Authorization: `Bearer ${tokenB}`,
    });
    const resEmptyTs = await request(server, 'GET', '/api/analytics/timeseries?range=30d', {
      Authorization: `Bearer ${tokenB}`,
    });
    const resEmptyBr = await request(server, 'GET', '/api/analytics/breakdown?range=30d', {
      Authorization: `Bearer ${tokenB}`,
    });

    assert(
      resEmptySummary.status === 200 &&
        resEmptySummary.body.data.totalExpenditure === 0 &&
        resEmptySummary.body.data.totalTransactions === 0 &&
        resEmptySummary.body.data.successfulTransactions === 0 &&
        resEmptySummary.body.data.failedTransactions === 0 &&
        resEmptyTs.status === 200 &&
        resEmptyTs.body.data.timeseries.length === 30 &&
        resEmptyBr.status === 200 &&
        resEmptyBr.body.data.available === false,
      '7. Empty Tenant Audit: Zero entries return clean zero metrics and zero-filled timeseries without throwing errors'
    );

    // AUDIT TEST 8: Unauthenticated / Invalid JWT Protection
    const resNoAuth = await request(server, 'GET', '/api/analytics/summary');
    const resBadToken = await request(server, 'GET', '/api/analytics/summary', {
      Authorization: 'Bearer invalid_jwt_token',
    });

    assert(
      resNoAuth.status === 401 && resBadToken.status === 401,
      '8. Security Audit: Missing or invalid JWT requests are rejected with 401 Unauthorized'
    );

    // Clean up test data
    await LedgerA.deleteMany({});
    await LedgerB.deleteMany({});
  } catch (err: any) {
    console.error('❌ Day 20 Audit test execution error:', err);
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
  console.log(`DAY 20 AUDIT TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runDay20AnalyticsAuditTests();
