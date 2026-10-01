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

async function runDay16AnalyticsTests() {
  console.log('================================================================');
  console.log('=== DAY 16 MONGODB AGGREGATION SUMMARY ANALYTICS TESTS ===');
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

    const tokenA = generateAccessToken({ userId: 'user-d16-a', tenantId: tenantA, role: 'ADMIN' });
    const tokenB = generateAccessToken({ userId: 'user-d16-b', tenantId: tenantB, role: 'ADMIN' });

    const LedgerA = getLedgerModel(tenantDbA);
    const LedgerB = getLedgerModel(tenantDbB);

    const uniqueSuffix = Date.now();

    await LedgerA.create([
      {
        eventId: `evt-d16-1-${uniqueSuffix}`,
        tenantId: tenantA,
        type: 'debit',
        amount: 100.5,
        currency: 'USD',
        status: 'completed',
      },
      {
        eventId: `evt-d16-2-${uniqueSuffix}`,
        tenantId: tenantA,
        type: 'debit',
        amount: 250.0,
        currency: 'USD',
        status: 'completed',
      },
      {
        eventId: `evt-d16-3-${uniqueSuffix}`,
        tenantId: tenantA,
        type: 'credit',
        amount: 500.0,
        currency: 'USD',
        status: 'completed',
      },
      {
        eventId: `evt-d16-4-${uniqueSuffix}`,
        tenantId: tenantA,
        type: 'debit',
        amount: 75.0,
        currency: 'USD',
        status: 'failed',
      },
    ]);

    await LedgerB.create([
      {
        eventId: `evt-d16-b1-${uniqueSuffix}`,
        tenantId: tenantB,
        type: 'debit',
        amount: 9999.99,
        currency: 'USD',
        status: 'completed',
      },
    ]);

    const resSummary = await request(server, 'GET', '/api/analytics/summary?range=30d', {
      Authorization: `Bearer ${tokenA}`,
    });

    assert(
      resSummary.status === 200 &&
        resSummary.body.success === true &&
        resSummary.body.data.totalExpenditure >= 350.5 &&
        resSummary.body.data.successfulTransactions >= 3 &&
        resSummary.body.data.failedTransactions >= 1 &&
        typeof resSummary.body.data.currency === 'string' &&
        resSummary.body.data.range === '30d',
      '1. GET /api/analytics/summary calculates real MongoDB summary metrics for tenant A'
    );

    const resBadRange = await request(server, 'GET', '/api/analytics/summary?range=invalid_range', {
      Authorization: `Bearer ${tokenA}`,
    });

    assert(
      resBadRange.status === 400 &&
        resBadRange.body.success === false &&
        resBadRange.body.message.includes('Invalid range parameter'),
      '2. Invalid range parameter returns 400 Bad Request'
    );

    const resSummaryB = await request(server, 'GET', '/api/analytics/summary?range=30d', {
      Authorization: `Bearer ${tokenB}`,
    });

    assert(
      resSummaryB.status === 200 &&
        resSummaryB.body.data.totalExpenditure >= 9999.99,
      '3. Tenant B analytics summary isolated from Tenant A'
    );
  } catch (err: any) {
    console.error('❌ Day 16 test execution error:', err);
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
  console.log(`DAY 16 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runDay16AnalyticsTests();
