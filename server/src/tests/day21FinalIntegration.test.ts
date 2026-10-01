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

async function runDay21FinalIntegrationTests() {
  console.log('================================================================');
  console.log('=== DAY 21 WEEK 3 FINAL INTEGRATION & ANALYTICS AUDIT SUITE ===');
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

    const tokenA = generateAccessToken({ userId: 'user-d21-a', tenantId: tenantA, role: 'ADMIN' });
    const tokenB = generateAccessToken({ userId: 'user-d21-b', tenantId: tenantB, role: 'ADMIN' });

    const LedgerA = getLedgerModel(tenantDbA);
    const LedgerB = getLedgerModel(tenantDbB);

    // Clean test collections for isolated test execution
    await LedgerA.deleteMany({});
    await LedgerB.deleteMany({});

    const uniqueSuffix = Date.now();

    // 1. Setup Controlled Dataset for Tenant A
    // Event A1 (100 debit), Event A2 (200 debit), Event A3 (300 debit) -> Independent Expected Expenditure = 600
    // Event A4 (500 debit failed) -> Excluded from total expenditure
    const datasetA = [
      {
        eventId: `evt-d21-a1-${uniqueSuffix}`,
        tenantId: tenantA,
        type: 'debit',
        amount: 100,
        currency: 'USD',
        status: 'completed',
        createdAt: new Date(),
      },
      {
        eventId: `evt-d21-a2-${uniqueSuffix}`,
        tenantId: tenantA,
        type: 'debit',
        amount: 200,
        currency: 'USD',
        status: 'completed',
        createdAt: new Date(),
      },
      {
        eventId: `evt-d21-a3-${uniqueSuffix}`,
        tenantId: tenantA,
        type: 'debit',
        amount: 300,
        currency: 'USD',
        status: 'completed',
        createdAt: new Date(),
      },
      {
        eventId: `evt-d21-a4-${uniqueSuffix}`,
        tenantId: tenantA,
        type: 'debit',
        amount: 500,
        currency: 'USD',
        status: 'failed',
        createdAt: new Date(),
      },
    ];

    // 2. Setup Controlled Dataset for Tenant B
    // Event B1 (1000 debit), Event B2 (2000 debit), Event B3 (3000 debit) -> Independent Expected Expenditure = 6000
    const datasetB = [
      {
        eventId: `evt-d21-b1-${uniqueSuffix}`,
        tenantId: tenantB,
        type: 'debit',
        amount: 1000,
        currency: 'USD',
        status: 'completed',
        createdAt: new Date(),
      },
      {
        eventId: `evt-d21-b2-${uniqueSuffix}`,
        tenantId: tenantB,
        type: 'debit',
        amount: 2000,
        currency: 'USD',
        status: 'completed',
        createdAt: new Date(),
      },
      {
        eventId: `evt-d21-b3-${uniqueSuffix}`,
        tenantId: tenantB,
        type: 'debit',
        amount: 3000,
        currency: 'USD',
        status: 'completed',
        createdAt: new Date(),
      },
    ];

    await LedgerA.create(datasetA as any);
    await LedgerB.create(datasetB as any);

    // TEST 1: End-to-End Flow for Normal Tenant A
    const resSummaryA = await request(server, 'GET', '/api/analytics/summary?range=30d', {
      Authorization: `Bearer ${tokenA}`,
    });

    assert(
      resSummaryA.status === 200 &&
        resSummaryA.body.success === true &&
        resSummaryA.body.data.totalExpenditure === 600 &&
        resSummaryA.body.data.totalTransactions === 4 &&
        resSummaryA.body.data.successfulTransactions === 3 &&
        resSummaryA.body.data.failedTransactions === 1,
      '1. Normal Tenant End-to-End Flow: Summary metrics match independent math (600 total expenditure, 4 total, 3 success, 1 failed)'
    );

    // TEST 2: Tenant Isolation (Tenant A vs Tenant B)
    const resSummaryB = await request(server, 'GET', '/api/analytics/summary?range=30d', {
      Authorization: `Bearer ${tokenB}`,
    });

    assert(
      resSummaryB.status === 200 &&
        resSummaryB.body.data.totalExpenditure === 6000 &&
        resSummaryB.body.data.totalTransactions === 3 &&
        resSummaryB.body.data.successfulTransactions === 3,
      '2. Tenant Isolation Audit: Tenant B JWT returns 6000 total expenditure; Tenant A data completely isolated'
    );

    // TEST 3: Tenant Override Protection (JWT Authority)
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
      '3. Tenant Override Protection Audit: Query param tenantId=tenantB IGNORED; returns Tenant A data (600)'
    );

    // TEST 4: Empty Tenant Handling
    await LedgerB.deleteMany({}); // Empty Tenant B collection
    const resEmptySummary = await request(server, 'GET', '/api/analytics/summary?range=30d', {
      Authorization: `Bearer ${tokenB}`,
    });
    const resEmptyTs = await request(server, 'GET', '/api/analytics/timeseries?range=30d', {
      Authorization: `Bearer ${tokenB}`,
    });

    assert(
      resEmptySummary.status === 200 &&
        resEmptySummary.body.data.totalExpenditure === 0 &&
        resEmptySummary.body.data.totalTransactions === 0 &&
        resEmptySummary.body.data.successfulTransactions === 0 &&
        resEmptySummary.body.data.failedTransactions === 0 &&
        resEmptyTs.status === 200 &&
        resEmptyTs.body.data.timeseries.length === 30,
      '4. Empty Tenant Audit: Zero entries return clean zero summary metrics and 30-day zero-filled timeseries'
    );

    // TEST 5: Supported Date Range Boundaries (7d, 30d, 90d)
    const resTs7 = await request(server, 'GET', '/api/analytics/timeseries?range=7d', {
      Authorization: `Bearer ${tokenA}`,
    });
    const resTs30 = await request(server, 'GET', '/api/analytics/timeseries?range=30d', {
      Authorization: `Bearer ${tokenA}`,
    });
    const resTs90 = await request(server, 'GET', '/api/analytics/timeseries?range=90d', {
      Authorization: `Bearer ${tokenA}`,
    });

    assert(
      resTs7.body.data.timeseries.length === 7 &&
        resTs30.body.data.timeseries.length === 30 &&
        resTs90.body.data.timeseries.length === 90,
      '5. Historical Range Audit: 7d (7 points), 30d (30 points), 90d (90 points) continuous daily data points returned'
    );

    // TEST 6: Breakdown & Limits Schema Limitation Checks (CASE B)
    const resBreakdown = await request(server, 'GET', '/api/analytics/breakdown?range=30d', {
      Authorization: `Bearer ${tokenA}`,
    });
    const resLimits = await request(server, 'GET', '/api/analytics/limits?range=30d', {
      Authorization: `Bearer ${tokenA}`,
    });

    assert(
      resBreakdown.status === 200 &&
        resBreakdown.body.data.available === false &&
        resLimits.status === 200 &&
        resLimits.body.data.configured === false,
      '6. Honest Schema Limitations Audit: Breakdown returns available: false; Limits returns configured: false (CASE B)'
    );

    // TEST 7: Invalid Range Validation
    const invalidRanges = ['abc', '-1', '999999', '1d', '365d'];
    let invalidHandled = true;

    for (const r of invalidRanges) {
      const resInv = await request(server, 'GET', `/api/analytics/summary?range=${r}`, {
        Authorization: `Bearer ${tokenA}`,
      });
      if (resInv.status !== 400 || resInv.body.success !== false) {
        invalidHandled = false;
        break;
      }
    }

    assert(
      invalidHandled,
      '7. Invalid Range Validation Audit: Malformed & unsupported ranges (abc, -1, 999999, 1d, 365d) return 400 Bad Request'
    );

    // TEST 8: Regression Behavior — Week 1 & Week 2 APIs
    // Create new ledger entry via POST /api/ledger
    const resLedgerPost = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenA}` },
      {
        eventId: `evt-reg-d21-${uniqueSuffix}`,
        type: 'debit',
        amount: 75.0,
        currency: 'USD',
        description: 'Regression verification charge',
      }
    );

    // Fetch ledger entries via GET /api/ledger
    const resLedgerGet = await request(server, 'GET', '/api/ledger', {
      Authorization: `Bearer ${tokenA}`,
    });

    assert(
      resLedgerPost.status === 201 &&
        resLedgerPost.body.success === true &&
        resLedgerPost.body.data.amount === 75.0 &&
        resLedgerGet.status === 200 &&
        Array.isArray(resLedgerGet.body.data),
      '8. Regression Audit: POST /api/ledger creation & GET /api/ledger retrieval remain 100% operational'
    );

    // Clean test data
    await LedgerA.deleteMany({});
    await LedgerB.deleteMany({});
  } catch (err: any) {
    console.error('❌ Day 21 test execution error:', err);
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
  console.log(`DAY 21 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runDay21FinalIntegrationTests();
