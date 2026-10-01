import http from 'http';
import { RedisMemoryServer } from 'redis-memory-server';
import app from '../app';
import { tenantConnectionManager } from '../services/tenantConnectionManager';
import { connectRedis, disconnectRedis } from '../config/redis';
import { generateAccessToken } from '../utils/jwt';

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

async function runDay18BreakdownLimitsTests() {
  console.log('================================================================');
  console.log('=== DAY 18 COST BREAKDOWN & LIMITS ANALYTICS TESTS ===');
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
    await tenantConnectionManager.getTenantConnection(tenantA);
    const tokenA = generateAccessToken({ userId: 'user-d18-a', tenantId: tenantA, role: 'ADMIN' });

    const resBreakdown = await request(server, 'GET', '/api/analytics/breakdown?range=30d', {
      Authorization: `Bearer ${tokenA}`,
    });

    assert(
      resBreakdown.status === 200 &&
        resBreakdown.body.success === true &&
        resBreakdown.body.data.available === false &&
        Array.isArray(resBreakdown.body.data.data) &&
        resBreakdown.body.data.message.includes("'category' is not defined"),
      '1. GET /api/analytics/breakdown returns CASE B unavailable status without inventing fake category data'
    );

    const resLimits = await request(server, 'GET', '/api/analytics/limits?range=30d', {
      Authorization: `Bearer ${tokenA}`,
    });

    assert(
      resLimits.status === 200 &&
        resLimits.body.success === true &&
        resLimits.body.data.configured === false &&
        Array.isArray(resLimits.body.data.data) &&
        resLimits.body.data.message.includes('Usage limits are not configured'),
      '2. GET /api/analytics/limits returns CASE B unconfigured status without inventing fake budget limits'
    );
  } catch (err: any) {
    console.error('❌ Day 18 test execution error:', err);
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
  console.log(`DAY 18 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runDay18BreakdownLimitsTests();
