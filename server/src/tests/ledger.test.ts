import http from 'http';
import app from '../app';
import { generateAccessToken } from '../utils/jwt';
import { tenantConnectionManager } from '../services/tenantConnectionManager';
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

async function runLedgerTests() {
  console.log('================================================================');
  console.log('=== DAY 8 LEDGER DATA MODEL & API FOUNDATION TEST SUITE ===');
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

    const testPrefix = `evt-d8-${Date.now()}`;
    const event1 = `${testPrefix}-001`;
    const event2 = `${testPrefix}-002`;
    const event3 = `${testPrefix}-003`;
    const eventB1 = `${testPrefix}-b-001`;

    // 1. Authenticated tenant can create a ledger entry
    const resCreateA = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenA}` },
      {
        eventId: event1,
        type: 'debit',
        amount: 499.5,
        currency: 'INR',
        description: 'Monthly Cloud Infrastructure Charge',
        metadata: { invoiceId: 'INV-2026-001' },
      }
    );

    assert(
      resCreateA.status === 201 &&
        resCreateA.body.success === true &&
        resCreateA.body.data.eventId === event1 &&
        resCreateA.body.data.tenantId === 'tenant-company-a' &&
        resCreateA.body.data.type === 'debit' &&
        resCreateA.body.data.amount === 499.5 &&
        resCreateA.body.data.currency === 'INR' &&
        (resCreateA.body.data.status === 'completed' || resCreateA.body.data.status === 'pending'),
      'Test 1: Authenticated Tenant A creates a valid debit ledger entry',
      `Got status ${resCreateA.status}, body: ${JSON.stringify(resCreateA.body)}`
    );

    const recordAId = resCreateA.body.data?.id;

    // 2. Unauthenticated request is rejected
    const resUnauth = await request(server, 'POST', '/api/ledger', {}, {
      eventId: event2,
      type: 'credit',
      amount: 100,
      currency: 'USD',
    });
    assert(
      resUnauth.status === 401 && resUnauth.body.success === false,
      'Test 2: Unauthenticated POST /api/ledger is rejected with 401 Unauthorized'
    );

    // 3. tenantId comes strictly from JWT (Client-supplied tenantId cannot override JWT tenant)
    const resOverride = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenA}` },
      {
        eventId: event3,
        tenantId: 'tenant-company-b', // Client injection attempt
        type: 'credit',
        amount: 250,
        currency: 'INR',
      }
    );
    assert(
      resOverride.status === 201 &&
        resOverride.body.data.tenantId === 'tenant-company-a' &&
        resOverride.body.data.tenantId !== 'tenant-company-b',
      'Test 3: Client-supplied body tenantId is overridden by verified JWT tenant identity (company-a)',
      `Stored tenantId: ${resOverride.body.data?.tenantId}`
    );

    // Create a record for Tenant B
    const resCreateB = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenB}` },
      {
        eventId: eventB1,
        type: 'credit',
        amount: 1200,
        currency: 'USD',
        description: 'Tenant B Annual Deposit',
      }
    );
    const recordBId = resCreateB.body.data?.id;

    // 4. GET /api/ledger returns only authenticated tenant's records
    const resGetListA = await request(server, 'GET', '/api/ledger', {
      Authorization: `Bearer ${tokenA}`,
    });
    const resGetListB = await request(server, 'GET', '/api/ledger', {
      Authorization: `Bearer ${tokenB}`,
    });

    const allRecordsBelongToA = resGetListA.body.data?.every(
      (item: any) => item.tenantId === 'tenant-company-a'
    );
    const allRecordsBelongToB = resGetListB.body.data?.every(
      (item: any) => item.tenantId === 'tenant-company-b'
    );

    assert(
      resGetListA.status === 200 &&
        resGetListB.status === 200 &&
        allRecordsBelongToA &&
        allRecordsBelongToB &&
        resGetListA.body.data.length >= 2,
      'Test 4: GET /api/ledger returns ONLY authenticated tenant records (Tenant A != Tenant B)',
      'Cross-tenant data contamination in list endpoint'
    );

    // 5. GET /api/ledger/:id cannot retrieve a record from another tenant
    const resCrossGet = await request(server, 'GET', `/api/ledger/${recordBId}`, {
      Authorization: `Bearer ${tokenA}`,
    });
    assert(
      resCrossGet.status === 404 && resCrossGet.body.success === false,
      'Test 5: Tenant A token cannot retrieve Tenant B record by ID (returns 404 Not Found)',
      `Got status ${resCrossGet.status}`
    );

    // 6. Invalid type is rejected
    const resBadType = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenA}` },
      {
        eventId: 'evt-err-1',
        type: 'invalid_type',
        amount: 100,
        currency: 'INR',
      }
    );
    assert(
      resBadType.status === 400 && resBadType.body.success === false,
      'Test 6: Invalid ledger operation type is rejected with 400 Bad Request'
    );

    // 7. Zero amount is rejected
    const resZeroAmount = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenA}` },
      {
        eventId: 'evt-err-2',
        type: 'debit',
        amount: 0,
        currency: 'INR',
      }
    );
    assert(
      resZeroAmount.status === 400 && resZeroAmount.body.success === false,
      'Test 7: Zero amount is rejected with 400 Bad Request'
    );

    // 8. Negative amount is rejected
    const resNegAmount = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenA}` },
      {
        eventId: 'evt-err-3',
        type: 'debit',
        amount: -50,
        currency: 'INR',
      }
    );
    assert(
      resNegAmount.status === 400 && resNegAmount.body.success === false,
      'Test 8: Negative amount is rejected with 400 Bad Request'
    );

    // 9. Invalid currency format is rejected
    const resBadCurrency = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenA}` },
      {
        eventId: 'evt-err-4',
        type: 'debit',
        amount: 100,
        currency: 'INVALID_CURRENCY',
      }
    );
    assert(
      resBadCurrency.status === 400 && resBadCurrency.body.success === false,
      'Test 9: Invalid currency code format is rejected with 400 Bad Request'
    );

    // 10. Missing eventId is rejected
    const resNoEventId = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenA}` },
      {
        type: 'debit',
        amount: 100,
        currency: 'INR',
      }
    );
    assert(
      resNoEventId.status === 400 && resNoEventId.body.success === false,
      'Test 10: Missing eventId is rejected with 400 Bad Request'
    );

    // 11. Invalid metadata type is rejected
    const resBadMetadata = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenA}` },
      {
        eventId: 'evt-err-5',
        type: 'debit',
        amount: 100,
        currency: 'INR',
        metadata: 'invalid_string_metadata',
      }
    );
    assert(
      resBadMetadata.status === 400 && resBadMetadata.body.success === false,
      'Test 11: Non-object metadata is rejected with 400 Bad Request'
    );

    // 12. Valid GET /api/ledger/:id returns exact matching record
    const resGetSingleA = await request(server, 'GET', `/api/ledger/${recordAId}`, {
      Authorization: `Bearer ${tokenA}`,
    });
    assert(
      resGetSingleA.status === 200 && resGetSingleA.body.data?.id === recordAId,
      'Test 12: GET /api/ledger/:id returns exact record for authenticated tenant'
    );

    console.log('\n================================================================');
    console.log(`=== DAY 8 LEDGER TEST RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
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

runLedgerTests().catch((err) => {
  console.error('Ledger test suite error:', err);
  process.exit(1);
});

