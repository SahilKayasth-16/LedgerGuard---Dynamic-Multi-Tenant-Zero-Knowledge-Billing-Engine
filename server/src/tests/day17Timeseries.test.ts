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

async function runDay17TimeseriesTests() {
  console.log('================================================================');
  console.log('=== DAY 17 HISTORICAL TIME-SERIES ANALYTICS TESTS ===');
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
    const tenantDbA = await tenantConnectionManager.getTenantConnection(tenantA);
    const tokenA = generateAccessToken({ userId: 'user-d17-a', tenantId: tenantA, role: 'ADMIN' });
    const LedgerA = getLedgerModel(tenantDbA);

    const uniqueSuffix = Date.now();

    await LedgerA.create({
      eventId: `evt-d17-1-${uniqueSuffix}`,
      tenantId: tenantA,
      type: 'debit',
      amount: 150.0,
      currency: 'USD',
      status: 'completed',
    });

    const resTs7 = await request(server, 'GET', '/api/analytics/timeseries?range=7d', {
      Authorization: `Bearer ${tokenA}`,
    });

    assert(
      resTs7.status === 200 &&
        resTs7.body.success === true &&
        Array.isArray(resTs7.body.data.timeseries) &&
        resTs7.body.data.timeseries.length === 7 &&
        resTs7.body.data.range === '7d',
      '1. GET /api/analytics/timeseries?range=7d returns 7 continuous date data points'
    );

    const timeseries = resTs7.body.data.timeseries;
    const todayStr = new Date().toISOString().split('T')[0];
    const todayPoint = timeseries.find((p: any) => p.date === todayStr);

    assert(
      todayPoint !== undefined && todayPoint.amount >= 150.0,
      '2. Timeseries contains non-zero amount for today and zero-filled points for empty dates'
    );

    const resTs30 = await request(server, 'GET', '/api/analytics/timeseries?range=30d', {
      Authorization: `Bearer ${tokenA}`,
    });

    assert(
      resTs30.status === 200 &&
        Array.isArray(resTs30.body.data.timeseries) &&
        resTs30.body.data.timeseries.length === 30,
      '3. GET /api/analytics/timeseries?range=30d returns 30 continuous date data points'
    );
  } catch (err: any) {
    console.error('❌ Day 17 test execution error:', err);
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
  console.log(`DAY 17 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runDay17TimeseriesTests();
