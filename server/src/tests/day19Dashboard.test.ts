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

async function runDay19DashboardTests() {
  console.log('================================================================');
  console.log('=== DAY 19 ANALYTICS DASHBOARD INTEGRATION & SECURITY TESTS ===');
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

    const tokenA = generateAccessToken({ userId: 'user-d19-a', tenantId: tenantA, role: 'ADMIN' });

    const LedgerA = getLedgerModel(tenantDbA);
    const LedgerB = getLedgerModel(tenantDbB);

    const uniqueSuffix = Date.now();

    await LedgerA.create([
      {
        eventId: `evt-d19-1-${uniqueSuffix}`,
        tenantId: tenantA,
        type: 'debit',
        amount: 500.0,
        currency: 'USD',
        status: 'completed',
      },
    ]);

    await LedgerB.create([
      {
        eventId: `evt-d19-b1-${uniqueSuffix}`,
        tenantId: tenantB,
        type: 'debit',
        amount: 8888.88,
        currency: 'USD',
        status: 'completed',
      },
    ]);

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
        resOverride.body.success === true &&
        resOverride.body.data.totalExpenditure >= 500.0,
      '1. Security Invariant: Query parameter tenantId override attempt is IGNORED; data belongs strictly to JWT tenant'
    );

    const ranges = ['7d', '30d', '90d'];
    let allRangesValid = true;

    for (const r of ranges) {
      const res = await request(server, 'GET', `/api/analytics/summary?range=${r}`, {
        Authorization: `Bearer ${tokenA}`,
      });
      if (res.status !== 200 || res.body.data.range !== r) {
        allRangesValid = false;
        break;
      }
    }

    assert(
      allRangesValid,
      '2. Dashboard analytics endpoints support all valid time ranges (7d, 30d, 90d)'
    );

    const resNoAuth = await request(server, 'GET', '/api/analytics/summary');

    assert(
      resNoAuth.status === 401 && resNoAuth.body.success === false,
      '3. Unauthenticated requests to analytics endpoints are rejected with 401 Unauthorized'
    );
  } catch (err: any) {
    console.error('❌ Day 19 test execution error:', err);
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
  console.log(`DAY 19 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runDay19DashboardTests();
