import http from 'http';
import app from '../app';
import { generateAccessToken } from '../utils/jwt';
import { tenantConnectionManager } from '../services/tenantConnectionManager';
import { getLedgerModel } from '../models/ledger.model';
import { disconnectRedis } from '../config/redis';

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

async function runIdempotencyTests() {
  console.log('================================================================');
  console.log('=== DAY 9 UNIQUE EVENT IDS & IDEMPOTENCY FOUNDATION TESTS ===');
  console.log('================================================================\n');

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

    const uniqueSuffix = Date.now();
    const event1 = `evt-idem-001-${uniqueSuffix}`;
    const event2 = `evt-idem-002-${uniqueSuffix}`;

    // TEST 1: First event creates entry (201 Created, duplicate: false)
    const res1 = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenA}` },
      {
        eventId: event1,
        type: 'debit',
        amount: 250,
        currency: 'INR',
        description: 'First idempotent event execution',
      }
    );

    assert(
      res1.status === 201 &&
        res1.body.success === true &&
        res1.body.duplicate === false &&
        res1.body.data.eventId === event1 &&
        res1.body.data.tenantId === 'tenant-company-a',
      'Test 1: Initial event submission creates record with 201 Created and duplicate=false',
      `Got status ${res1.status}, duplicate: ${res1.body.duplicate}`
    );

    const firstRecordId = res1.body.data?.id;

    // TEST 2: Repeated event returns existing entry (200 OK, duplicate: true)
    const res2 = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenA}` },
      {
        eventId: event1,
        type: 'debit',
        amount: 250,
        currency: 'INR',
        description: 'Repeated idempotent event execution',
      }
    );

    assert(
      res2.status === 200 &&
        res2.body.success === true &&
        res2.body.duplicate === true &&
        res2.body.data.id === firstRecordId &&
        res2.body.data.eventId === event1 &&
        res2.body.message === 'Ledger event has already been processed.',
      'Test 2: Repeated event returns 200 OK with duplicate=true and existing entry payload',
      `Got status ${res2.status}, duplicate: ${res2.body.duplicate}`
    );

    // TEST 3: Database contains strictly 1 record for event1
    const resListA = await request(server, 'GET', '/api/ledger', {
      Authorization: `Bearer ${tokenA}`,
    });
    const event1Records = resListA.body.data?.filter((r: any) => r.eventId === event1) || [];

    assert(
      event1Records.length === 1,
      'Test 3: Database contains strictly 1 committed record for event1 (no duplicates generated)',
      `Found ${event1Records.length} records`
    );

    // TEST 4: Different event creates separate entry
    const res4 = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenA}` },
      {
        eventId: event2,
        type: 'credit',
        amount: 500,
        currency: 'INR',
        description: 'Second distinct event',
      }
    );

    assert(
      res4.status === 201 &&
        res4.body.duplicate === false &&
        res4.body.data.eventId === event2,
      'Test 4: Distinct eventId creates new record with 201 Created and duplicate=false'
    );

    // TEST 5: Same eventId across different tenants coexists independently
    const res5 = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenB}` },
      {
        eventId: event1, // Same event ID as Company A!
        type: 'credit',
        amount: 800,
        currency: 'USD',
        description: 'Company B using same eventId independently',
      }
    );

    assert(
      res5.status === 201 &&
        res5.body.duplicate === false &&
        res5.body.data.tenantId === 'tenant-company-b' &&
        res5.body.data.eventId === event1,
      'Test 5: Compound uniqueness allows same eventId for different tenant (Company B) independently',
      `Got status ${res5.status}, tenantId: ${res5.body.data?.tenantId}`
    );

    // TEST 6: Tenant override attempt cannot alter idempotency boundary
    const res6 = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenA}` },
      {
        eventId: `evt-override-${uniqueSuffix}`,
        tenantId: 'tenant-company-b', // Malicious body override
        type: 'debit',
        amount: 100,
        currency: 'INR',
      }
    );

    assert(
      res6.status === 201 &&
        res6.body.data.tenantId === 'tenant-company-a' &&
        res6.body.data.tenantId !== 'tenant-company-b',
      'Test 6: Request body tenantId injection cannot alter ownership or idempotency partition'
    );

    // TEST 7: 10 Concurrent duplicate requests
    const concurrent10EventId = `evt-concurrent-10-${uniqueSuffix}`;
    const concurrent10Promises = [];

    for (let i = 0; i < 10; i++) {
      concurrent10Promises.push(
        request(
          server,
          'POST',
          '/api/ledger',
          { Authorization: `Bearer ${tokenA}` },
          {
            eventId: concurrent10EventId,
            type: 'debit',
            amount: 75,
            currency: 'INR',
            description: `Concurrent request ${i}`,
          }
        )
      );
    }

    const concurrent10Results = await Promise.all(concurrent10Promises);

    // With Redis locking, concurrent requests return 201 (winner), 200 (duplicate after release), or 409 (lock contention)
    const all10Handled = concurrent10Results.every(
      (res) => res.status === 200 || res.status === 201 || res.status === 409
    );

    // Direct database verification
    const connA = await tenantConnectionManager.getTenantConnection('tenant-company-a');
    const LedgerModelA = getLedgerModel(connA);
    const db10Count = await LedgerModelA.countDocuments({
      tenantId: 'tenant-company-a',
      eventId: concurrent10EventId,
    });

    assert(
      all10Handled && db10Count === 1,
      'Test 7: 10 concurrent duplicate requests are handled by locking / idempotency resulting in strictly 1 DB record',
      `DB count: ${db10Count}`
    );

    // TEST 8: 50 Concurrent duplicate requests
    const concurrent50EventId = `evt-concurrent-50-${uniqueSuffix}`;
    const concurrent50Promises = [];

    for (let i = 0; i < 50; i++) {
      concurrent50Promises.push(
        request(
          server,
          'POST',
          '/api/ledger',
          { Authorization: `Bearer ${tokenA}` },
          {
            eventId: concurrent50EventId,
            type: 'credit',
            amount: 150,
            currency: 'INR',
            description: `Concurrent request ${i}`,
          }
        )
      );
    }

    const concurrent50Results = await Promise.all(concurrent50Promises);

    const all50Handled = concurrent50Results.every(
      (res) => res.status === 200 || res.status === 201 || res.status === 409
    );
    const db50Count = await LedgerModelA.countDocuments({
      tenantId: 'tenant-company-a',
      eventId: concurrent50EventId,
    });

    assert(
      all50Handled && db50Count === 1,
      'Test 8: 50 concurrent duplicate requests result in exactly 1 DB record with zero race errors',
      `All 50 Handled: ${all50Handled}, DB count: ${db50Count}`
    );

    // TEST 9: Compound unique index validation in MongoDB
    const indexes = await LedgerModelA.collection.indexes();
    const hasCompoundIndex = indexes.some(
      (idx: any) => idx.key?.tenantId === 1 && idx.key?.eventId === 1 && idx.unique === true
    );

    assert(
      hasCompoundIndex,
      'Test 9: Database confirms compound unique index { tenantId: 1, eventId: 1 } exists and is active',
      `Indexes found: ${JSON.stringify(indexes.map((i: any) => i.key))}`
    );

    console.log('\n================================================================');
    console.log(`=== DAY 9 IDEMPOTENCY TEST RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
    console.log('================================================================\n');
  } finally {
    await tenantConnectionManager.disconnectAll();
    await disconnectRedis();
    server.close();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runIdempotencyTests().catch((err) => {
  console.error('Idempotency test suite error:', err);
  process.exit(1);
});

