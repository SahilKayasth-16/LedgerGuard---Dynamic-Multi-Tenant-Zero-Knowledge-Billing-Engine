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

export async function runDay26AnalyticsPolishTests() {
  console.log('================================================================');
  console.log('=== DAY 26 ANALYTICS API & INTEGRATION VERIFICATION TESTS ===');
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

    const connA = await tenantConnectionManager.getTenantConnection(tenantA);
    const connB = await tenantConnectionManager.getTenantConnection(tenantB);

    const tokenA = generateAccessToken({ userId: 'user-d26-a', tenantId: tenantA, role: 'ADMIN' });
    const tokenB = generateAccessToken({ userId: 'user-d26-b', tenantId: tenantB, role: 'ADMIN' });

    const LedgerA = getLedgerModel(connA);
    const LedgerB = getLedgerModel(connB);

    const testId = Date.now();

    // Seed test transaction for Tenant A
    await LedgerA.create([
      {
        eventId: `evt-d26-a1-${testId}`,
        tenantId: tenantA,
        type: 'debit',
        amount: 250.0,
        currency: 'USD',
        status: 'completed',
      },
      {
        eventId: `evt-d26-a2-${testId}`,
        tenantId: tenantA,
        type: 'credit',
        amount: 100.0,
        currency: 'USD',
        status: 'completed',
      },
    ]);

    // Seed test transaction for Tenant B
    await LedgerB.create([
      {
        eventId: `evt-d26-b1-${testId}`,
        tenantId: tenantB,
        type: 'debit',
        amount: 1200.0,
        currency: 'USD',
        status: 'completed',
      },
    ]);

    // TEST 1: Summary endpoint returns valid real aggregate structure
    const resSummaryA = await request(server, 'GET', '/api/analytics/summary?range=30d', {
      Authorization: `Bearer ${tokenA}`,
    });

    assert(
      resSummaryA.status === 200 &&
        resSummaryA.body.success === true &&
        typeof resSummaryA.body.data.totalExpenditure === 'number' &&
        resSummaryA.body.data.totalExpenditure >= 250 &&
        resSummaryA.body.data.totalTransactions >= 2 &&
        resSummaryA.body.data.range === '30d',
      '1. GET /api/analytics/summary?range=30d returns real aggregated numbers for Tenant A'
    );

    // TEST 2: Timeseries endpoint returns 30 daily buckets for 30d
    const resTimeseries30d = await request(server, 'GET', '/api/analytics/timeseries?range=30d', {
      Authorization: `Bearer ${tokenA}`,
    });

    assert(
      resTimeseries30d.status === 200 &&
        resTimeseries30d.body.success === true &&
        Array.isArray(resTimeseries30d.body.data.timeseries) &&
        resTimeseries30d.body.data.timeseries.length === 30,
      '2. GET /api/analytics/timeseries?range=30d returns exactly 30 ordered daily buckets'
    );

    // TEST 3: Timeseries endpoint returns 7 daily buckets for 7d
    const resTimeseries7d = await request(server, 'GET', '/api/analytics/timeseries?range=7d', {
      Authorization: `Bearer ${tokenA}`,
    });

    assert(
      resTimeseries7d.status === 200 &&
        resTimeseries7d.body.success === true &&
        resTimeseries7d.body.data.timeseries.length === 7,
      '3. GET /api/analytics/timeseries?range=7d returns exactly 7 ordered daily buckets'
    );

    // TEST 4: Timeseries endpoint returns 90 daily buckets for 90d
    const resTimeseries90d = await request(server, 'GET', '/api/analytics/timeseries?range=90d', {
      Authorization: `Bearer ${tokenA}`,
    });

    assert(
      resTimeseries90d.status === 200 &&
        resTimeseries90d.body.success === true &&
        resTimeseries90d.body.data.timeseries.length === 90,
      '4. GET /api/analytics/timeseries?range=90d returns exactly 90 ordered daily buckets'
    );

    // TEST 5: Breakdown returns honest schema limitation notice
    const resBreakdown = await request(server, 'GET', '/api/analytics/breakdown?range=30d', {
      Authorization: `Bearer ${tokenA}`,
    });

    assert(
      resBreakdown.status === 200 &&
        resBreakdown.body.data.available === false &&
        resBreakdown.body.data.message.includes("'category' is not defined"),
      '5. GET /api/analytics/breakdown returns honest schema limitation notice without fake categories'
    );

    // TEST 6: Limits returns honest unconfigured notice
    const resLimits = await request(server, 'GET', '/api/analytics/limits?range=30d', {
      Authorization: `Bearer ${tokenA}`,
    });

    assert(
      resLimits.status === 200 &&
        resLimits.body.data.configured === false &&
        resLimits.body.data.message.includes('Usage limits are not configured'),
      '6. GET /api/analytics/limits returns honest unconfigured notice without fake limits'
    );

    // TEST 7: Invalid range parameter rejected with 400
    const resInvalidRange = await request(server, 'GET', '/api/analytics/summary?range=custom', {
      Authorization: `Bearer ${tokenA}`,
    });

    assert(
      resInvalidRange.status === 400 && resInvalidRange.body.success === false,
      '7. Unsupported range query parameter rejected with 400 Bad Request'
    );

    // TEST 8: Unauthenticated access rejected with 401
    const resUnauth = await request(server, 'GET', '/api/analytics/summary?range=30d');
    assert(
      resUnauth.status === 401,
      '8. Unauthenticated analytics access rejected with 401'
    );

    // TEST 9: Tenant isolation: Query override attempt ignored
    const resOverride = await request(
      server,
      'GET',
      `/api/analytics/summary?range=30d&tenantId=${tenantB}`,
      {
        Authorization: `Bearer ${tokenA}`,
      }
    );

    assert(
      resOverride.status === 200 &&
        resOverride.body.data.totalExpenditure === resSummaryA.body.data.totalExpenditure &&
        resOverride.body.data.totalTransactions === resSummaryA.body.data.totalTransactions,
      '9. Tenant isolation preserved: Tenant A JWT ignores ?tenantId=tenant-company-b override'
    );

    // TEST 10: Tenant B gets isolated Tenant B data
    const resSummaryB = await request(server, 'GET', '/api/analytics/summary?range=30d', {
      Authorization: `Bearer ${tokenB}`,
    });

    assert(
      resSummaryB.status === 200 &&
        resSummaryB.body.data.totalExpenditure >= 1200,
      '10. Tenant B JWT accesses isolated Tenant B data exclusively'
    );

    // TEST 11: X-Trace-Id header present on response
    assert(
      Boolean(resSummaryA.headers['x-trace-id']),
      '11. X-Trace-Id header present on analytics API responses'
    );

  } catch (err: any) {
    console.error('❌ Day 26 test execution error:', err?.stack || err);
    failed++;
  } finally {
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
  console.log(`DAY 26 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runDay26AnalyticsPolishTests();
}
