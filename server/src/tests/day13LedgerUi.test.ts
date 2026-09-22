import http from 'http';
import { RedisMemoryServer } from 'redis-memory-server';
import app from '../app';
import { tenantConnectionManager } from '../services/tenantConnectionManager';
import { connectRedis, disconnectRedis } from '../config/redis';
import { generateAccessToken } from '../utils/jwt';
import { getLedgerModel } from '../models/ledger.model';
import { getLedgerAuditModel } from '../models/ledgerAudit.model';

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

async function runDay13LedgerUiTests() {
  console.log('================================================================');
  console.log('=== DAY 13 BILLING LEDGER UI & TRANSACTION INTEGRATION TESTS ===');
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

    const tokenTenantA = generateAccessToken({ userId: 'user-d13-a', tenantId: tenantA, role: 'ADMIN' });
    const tokenTenantB = generateAccessToken({ userId: 'user-d13-b', tenantId: tenantB, role: 'ADMIN' });

    const LedgerModelA = getLedgerModel(tenantDbA);
    const AuditModelA = getLedgerAuditModel(tenantDbA);
    const LedgerModelB = getLedgerModel(tenantDbB);

    const uniqueSuffix = Date.now();
    const event1 = `evt-d13-ui-${uniqueSuffix}`;

    // Test 1: POST /api/ledger creates transaction with real payload
    const resCreate = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenTenantA}` },
      {
        eventId: event1,
        type: 'credit',
        amount: 1250.75,
        currency: 'USD',
        description: 'Enterprise Cloud Billing Subscription',
        metadata: { plan: 'enterprise', billingCycle: 'monthly' },
      }
    );

    assert(
      resCreate.status === 201 &&
        resCreate.body.success === true &&
        resCreate.body.duplicate === false &&
        resCreate.body.data.amount === 1250.75 &&
        resCreate.body.data.currency === 'USD' &&
        resCreate.body.data.status === 'completed',
      '1. POST /api/ledger creates real ledger entry with 201 Created and formatted payload'
    );

    // Test 2: GET /api/ledger fetches real records for Tenant A
    const resGetList = await request(server, 'GET', '/api/ledger', {
      Authorization: `Bearer ${tokenTenantA}`,
    });

    const matchingEntry = resGetList.body.data?.find((item: any) => item.eventId === event1);

    assert(
      resGetList.status === 200 &&
        resGetList.body.success === true &&
        Array.isArray(resGetList.body.data) &&
        matchingEntry !== undefined &&
        matchingEntry.amount === 1250.75,
      '2. GET /api/ledger retrieves real committed database records for authenticated tenant'
    );

    // Test 3: Resubmitting same eventId returns duplicate indicator
    const resDup = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenTenantA}` },
      {
        eventId: event1,
        type: 'credit',
        amount: 1250.75,
        currency: 'USD',
        description: 'Enterprise Cloud Billing Subscription',
      }
    );

    assert(
      resDup.status === 200 &&
        resDup.body.success === true &&
        resDup.body.duplicate === true &&
        resDup.body.message === 'Ledger event has already been processed.',
      '3. Resubmitting duplicate eventId returns 200 OK with duplicate=true'
    );

    // Test 4: Error response sanitization (no internal stack traces or connection strings)
    const resBadInput = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenTenantA}` },
      {
        eventId: `evt-bad-${uniqueSuffix}`,
        type: 'invalid_type',
        amount: -50,
        currency: 'INVALID',
      }
    );

    const bodyString = JSON.stringify(resBadInput.body);
    const isSanitized =
      !bodyString.includes('at ') &&
      !bodyString.includes('mongodb://') &&
      !bodyString.includes('CastError') &&
      !bodyString.includes('MongoServerError');

    assert(
      resBadInput.status === 400 && resBadInput.body.success === false && isSanitized,
      '4. Validation error returns sanitized 400 response without internal stack traces or DB credentials'
    );

    // Test 5: Tenant A cannot see Tenant B records (Multi-Tenant Segregation)
    const eventTenantB = `evt-d13-tenantB-${uniqueSuffix}`;
    await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenTenantB}` },
      {
        eventId: eventTenantB,
        type: 'debit',
        amount: 499.99,
        currency: 'EUR',
        description: 'Tenant B Isolated Charge',
      }
    );

    const resListA = await request(server, 'GET', '/api/ledger', { Authorization: `Bearer ${tokenTenantA}` });
    const resListB = await request(server, 'GET', '/api/ledger', { Authorization: `Bearer ${tokenTenantB}` });

    const tenantAHasTenantBData = resListA.body.data?.some((item: any) => item.eventId === eventTenantB);
    const tenantBHasTenantBData = resListB.body.data?.some((item: any) => item.eventId === eventTenantB);

    assert(
      !tenantAHasTenantBData && tenantBHasTenantBData,
      '5. GET /api/ledger strictly segregates Tenant A and Tenant B database records'
    );

    // Test 6: Audit log endpoint retrieves recorded logs
    const resAudit = await request(server, 'GET', '/api/ledger/audit-logs', {
      Authorization: `Bearer ${tokenTenantA}`,
    });

    const matchingAudit = resAudit.body.data?.find((log: any) => log.eventId === event1);

    assert(
      resAudit.status === 200 &&
        resAudit.body.success === true &&
        matchingAudit !== undefined &&
        matchingAudit.action === 'LEDGER_ENTRY_CREATED',
      '6. GET /api/ledger/audit-logs retrieves real audit records for authenticated tenant'
    );

  } catch (err: any) {
    console.error('❌ Day 13 test execution error:', err);
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
  console.log(`DAY 13 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runDay13LedgerUiTests();

