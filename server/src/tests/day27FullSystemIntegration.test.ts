import http from 'http';
import jwt from 'jsonwebtoken';
import { RedisMemoryServer } from 'redis-memory-server';
import app from '../app';
import { tenantConnectionManager } from '../services/tenantConnectionManager';
import { connectRedis, disconnectRedis, getRedisClient, setSimulatedRedisFailure } from '../config/redis';
import { generateAccessToken, getKeys } from '../utils/jwt';
import { getLedgerModel } from '../models/ledger.model';
import { getLedgerAuditModel } from '../models/ledgerAudit.model';

const request = (
  server: http.Server,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: any
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> => {
  return new Promise((resolve, reject) => {
    const address = server.address() as { port: number };
    const payload = typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined;

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

export async function runDay27FullSystemIntegrationTests() {
  console.log('================================================================');
  console.log('=== DAY 27 COMPLETE END-TO-END WORKFLOW INTEGRATION SUITE ===');
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
    // 0. Spin up Redis and HTTP server
    redisServer = new RedisMemoryServer();
    await redisServer.start();
    const host = await redisServer.getHost();
    const port = await redisServer.getPort();

    process.env.REDIS_URL = `redis://${host}:${port}`;
    process.env.REDIS_LOCK_TTL_MS = '5000';

    await connectRedis();
    const redisClient = getRedisClient();

    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));

    const tenantA = 'tenant-company-a';
    const tenantB = 'tenant-company-b';

    const connA = await tenantConnectionManager.getTenantConnection(tenantA);
    const connB = await tenantConnectionManager.getTenantConnection(tenantB);

    const LedgerA = getLedgerModel(connA);
    const AuditA = getLedgerAuditModel(connA);
    const LedgerB = getLedgerModel(connB);
    const AuditB = getLedgerAuditModel(connB);

    // ================================================================
    // WORKFLOW 1: AUTHENTICATION & IDENTITY VERIFICATION
    // ================================================================
    console.log('\n--- WORKFLOW 1: AUTHENTICATION JOURNEY ---');

    // 1.1 Registration Check
    const resRegister = await request(server, 'POST', '/api/auth/register', {}, {
      email: 'newuser@company-a.com',
      password: 'password123',
    });
    assert(
      resRegister.status === 404,
      '1.1 Registration endpoint is outside active production workflow (404 Not Found)',
      `Got status ${resRegister.status}`
    );

    // 1.2 Login with valid credentials
    const resLoginA = await request(server, 'POST', '/api/auth/login', {}, {
      email: 'user@company-a.com',
    });
    assert(
      resLoginA.status === 200 && resLoginA.body.success === true && !!resLoginA.body.token,
      '1.2 POST /api/auth/login returns 200 OK with token and user profile',
      JSON.stringify(resLoginA.body)
    );

    const tokenA = resLoginA.body.token;

    // 1.3 Verify RS256 algorithm in JWT header
    const decodedJwtHeader = jwt.decode(tokenA, { complete: true })?.header;
    assert(
      decodedJwtHeader?.alg === 'RS256',
      '1.3 Issued JWT uses RS256 asymmetric cryptographic signing',
      `Header alg was ${decodedJwtHeader?.alg}`
    );

    // 1.4 Verify password is never returned
    assert(
      resLoginA.body.password === undefined && resLoginA.body.user?.password === undefined,
      '1.4 Password is never exposed in authentication responses'
    );

    // 1.5 Authenticated request GET /api/auth/me
    const resMe = await request(server, 'GET', '/api/auth/me', {
      Authorization: `Bearer ${tokenA}`,
    });
    assert(
      resMe.status === 200 &&
        resMe.body.user?.tenantId === tenantA &&
        resMe.body.user?.role === 'ADMIN',
      '1.5 GET /api/auth/me returns verified authenticated user context',
      JSON.stringify(resMe.body)
    );

    // 1.6 Authenticated request GET /api/tenant/me
    const resTenantMe = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${tokenA}`,
    });
    assert(
      resTenantMe.status === 200 &&
        resTenantMe.body.tenant?.id === tenantA &&
        resTenantMe.body.tenant?.name === 'Company A Corp',
      '1.6 GET /api/tenant/me resolves correct tenant context from verified JWT',
      JSON.stringify(resTenantMe.body)
    );

    // ================================================================
    // WORKFLOW 2: LEDGER END-TO-END + IDEMPOTENCY + REDIS + MONGO ACID
    // ================================================================
    console.log('\n--- WORKFLOW 2: LEDGER END-TO-END ---');

    const day27EventId = `day27-e2e-${Date.now()}`;
    const ledgerAmount = 350.0;

    // 2.1 Database state before event creation
    const countBefore = await LedgerA.countDocuments({
      tenantId: tenantA,
      eventId: day27EventId,
    });
    assert(
      countBefore === 0,
      '2.1 Pre-check: Database contains exactly 0 records for new unique Day 27 event',
      `Found ${countBefore} records`
    );

    // 2.2 Submit first ledger creation request
    const resLedger1 = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenA}` },
      {
        eventId: day27EventId,
        type: 'debit',
        amount: ledgerAmount,
        currency: 'USD',
        description: 'Day 27 End-to-End integration test event',
        metadata: { source: 'day27-audit-test' },
      }
    );

    assert(
      resLedger1.status === 201 &&
        resLedger1.body.success === true &&
        resLedger1.body.duplicate === false &&
        resLedger1.body.transactionCommitted === true &&
        resLedger1.body.data?.eventId === day27EventId &&
        resLedger1.body.data?.amount === ledgerAmount &&
        resLedger1.body.data?.status === 'completed',
      '2.2 First POST /api/ledger commits entry with 201 Created and transactionCommitted=true',
      JSON.stringify(resLedger1.body)
    );

    // 2.3 Verify MongoDB state after first request
    const countAfter1 = await LedgerA.countDocuments({
      tenantId: tenantA,
      eventId: day27EventId,
    });
    const savedEntry = await LedgerA.findOne({
      tenantId: tenantA,
      eventId: day27EventId,
    });
    assert(
      countAfter1 === 1 &&
        savedEntry !== null &&
        savedEntry.amount === ledgerAmount &&
        savedEntry.status === 'completed',
      '2.3 MongoDB state verified: exactly 1 ledger entry persisted in tenant A database',
      `Count: ${countAfter1}`
    );

    // 2.4 Verify Ledger Audit Log atomically written
    const auditRecord = await AuditA.findOne({
      tenantId: tenantA,
      eventId: day27EventId,
    });
    assert(
      auditRecord !== null &&
        auditRecord.action === 'LEDGER_ENTRY_CREATED' &&
        auditRecord.status === 'completed',
      '2.4 Ledger Audit Log record atomically created in same MongoDB transaction session',
      JSON.stringify(auditRecord)
    );

    // 2.5 Verify Redis lock was released after request completion
    const lockKey = `ledger:lock:${tenantA}:${day27EventId}`;
    const activeLock = await redisClient.get(lockKey);
    assert(
      activeLock === null,
      '2.5 Redis distributed lock was cleanly released in finally block',
      `Lock value was: ${activeLock}`
    );

    // 2.6 Idempotency Test: Submit the EXACT SAME event again
    const resLedgerDuplicate = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenA}` },
      {
        eventId: day27EventId,
        type: 'debit',
        amount: ledgerAmount,
        currency: 'USD',
        description: 'Day 27 End-to-End integration test event',
        metadata: { source: 'day27-audit-test' },
      }
    );

    assert(
      resLedgerDuplicate.status === 200 &&
        resLedgerDuplicate.body.success === true &&
        resLedgerDuplicate.body.duplicate === true &&
        resLedgerDuplicate.body.transactionCommitted === true,
      '2.6 Duplicate event request handled idempotently with 200 OK and duplicate=true',
      JSON.stringify(resLedgerDuplicate.body)
    );

    // 2.7 Database count after duplicate request
    const countAfterDuplicate = await LedgerA.countDocuments({
      tenantId: tenantA,
      eventId: day27EventId,
    });
    assert(
      countAfterDuplicate === 1,
      '2.7 Database count invariance: STILL exactly 1 record after duplicate request (0 -> 1 -> 1)',
      `Count is ${countAfterDuplicate}`
    );

    // ================================================================
    // WORKFLOW 3: ANALYTICS END-TO-END PROPAGATION
    // ================================================================
    console.log('\n--- WORKFLOW 3: ANALYTICS END-TO-END ---');

    // 3.1 Capture analytics before additional test debit
    const resSummaryBefore = await request(
      server,
      'GET',
      '/api/analytics/summary?range=30d',
      { Authorization: `Bearer ${tokenA}` }
    );
    const expBefore = resSummaryBefore.body.data.totalExpenditure;
    const countTxBefore = resSummaryBefore.body.data.totalTransactions;
    const successTxBefore = resSummaryBefore.body.data.successfulTransactions;

    // 3.2 Create new debit transaction for analytics propagation
    const day27AnalyticsEventId = `day27-analytics-${Date.now()}`;
    const deltaAmount = 150.0;

    const resDebit = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenA}` },
      {
        eventId: day27AnalyticsEventId,
        type: 'debit',
        amount: deltaAmount,
        currency: 'USD',
        description: 'Analytics propagation test debit',
      }
    );
    assert(
      resDebit.status === 201,
      '3.2 Analytics test debit event created successfully via /api/ledger',
      `Status: ${resDebit.status}`
    );

    // 3.3 Capture analytics after and compare exact delta
    const resSummaryAfter = await request(
      server,
      'GET',
      '/api/analytics/summary?range=30d',
      { Authorization: `Bearer ${tokenA}` }
    );
    const expAfter = resSummaryAfter.body.data.totalExpenditure;
    const countTxAfter = resSummaryAfter.body.data.totalTransactions;
    const successTxAfter = resSummaryAfter.body.data.successfulTransactions;

    assert(
      Math.abs(expAfter - (expBefore + deltaAmount)) < 0.01 &&
        countTxAfter === countTxBefore + 1 &&
        successTxAfter === successTxBefore + 1,
      `3.3 Analytics Summary dynamically reflects new debit: totalExpenditure (+${deltaAmount}), transactions (+1)`,
      `Before: ${expBefore}, After: ${expAfter}`
    );

    // 3.4 Timeseries Range Verification (7d, 30d, 90d)
    const res7d = await request(server, 'GET', '/api/analytics/timeseries?range=7d', {
      Authorization: `Bearer ${tokenA}`,
    });
    const res30d = await request(server, 'GET', '/api/analytics/timeseries?range=30d', {
      Authorization: `Bearer ${tokenA}`,
    });
    const res90d = await request(server, 'GET', '/api/analytics/timeseries?range=90d', {
      Authorization: `Bearer ${tokenA}`,
    });

    assert(
      res7d.status === 200 &&
        res7d.body.data?.timeseries?.length === 7 &&
        res30d.status === 200 &&
        res30d.body.data?.timeseries?.length === 30 &&
        res90d.status === 200 &&
        res90d.body.data?.timeseries?.length === 90,
      '3.4 Timeseries API returns exact continuous daily bucket arrays for 7d, 30d, and 90d',
      `Counts: 7d=${res7d.body.data?.timeseries?.length}, 30d=${res30d.body.data?.timeseries?.length}, 90d=${res90d.body.data?.timeseries?.length}`
    );

    // ================================================================
    // WORKFLOW 4: MULTI-TENANT ISOLATION & CROSS-TENANT ATTACK
    // ================================================================
    console.log('\n--- WORKFLOW 4: MULTI-TENANT ISOLATION & ATTACK ---');

    // 4.1 Login as Tenant B
    const resLoginB = await request(server, 'POST', '/api/auth/login', {}, {
      email: 'user@company-b.com',
    });
    const tokenB = resLoginB.body.token;

    // 4.2 Verify Tenant B database does NOT contain Tenant A's event
    const countAinB = await LedgerB.countDocuments({ eventId: day27EventId });
    assert(
      countAinB === 0,
      '4.1 Tenant B database contains exactly 0 records for Tenant A events (Database Isolation)',
      `Found ${countAinB} in tenant B DB`
    );

    // 4.3 Create Tenant B dedicated event
    const day27EventIdB = `day27-e2e-b-${Date.now()}`;
    const resLedgerB = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenB}` },
      {
        eventId: day27EventIdB,
        type: 'debit',
        amount: 500.0,
        currency: 'USD',
        description: 'Tenant B private ledger entry',
      }
    );
    assert(
      resLedgerB.status === 201 && resLedgerB.body.data?.tenantId === tenantB,
      '4.2 Tenant B creates ledger entry strictly in Tenant B database',
      JSON.stringify(resLedgerB.body)
    );

    // Verify it is in B and NOT in A
    const countBinB = await LedgerB.countDocuments({ eventId: day27EventIdB });
    const countBinA = await LedgerA.countDocuments({ eventId: day27EventIdB });
    assert(
      countBinB === 1 && countBinA === 0,
      '4.3 Complete database-level isolation: Tenant B event exists only in DB B, not in DB A',
      `In B: ${countBinB}, In A: ${countBinA}`
    );

    // 4.4 Cross-Tenant Attack Test: Tenant A JWT + ?tenantId=tenant-company-b
    const resAttackQuery = await request(
      server,
      'GET',
      '/api/analytics/summary?range=30d&tenantId=tenant-company-b',
      { Authorization: `Bearer ${tokenA}` }
    );
    assert(
      resAttackQuery.status === 200 &&
        resAttackQuery.body.data.totalExpenditure === expAfter,
      '4.4 Cross-tenant attack via query param override is ignored; Tenant A data returned',
      `Got total: ${resAttackQuery.body.data?.totalExpenditure}`
    );

    // 4.5 Cross-Tenant Attack Test: Tenant A JWT + body tenantId='tenant-company-b' on POST /api/ledger
    const attackEventId = `day27-attack-${Date.now()}`;
    const resAttackBody = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenA}` },
      {
        eventId: attackEventId,
        tenantId: tenantB, // Malicious override attempt
        type: 'debit',
        amount: 99.0,
        currency: 'USD',
      }
    );
    assert(
      resAttackBody.status === 201 && resAttackBody.body.data?.tenantId === tenantA,
      '4.5 Cross-tenant attack via body override is neutralized: tenantId forced to JWT tenant A',
      JSON.stringify(resAttackBody.body)
    );

    const attackInB = await LedgerB.countDocuments({ eventId: attackEventId });
    const attackInA = await LedgerA.countDocuments({ eventId: attackEventId });
    assert(
      attackInB === 0 && attackInA === 1,
      '4.6 Database verification: Malicious override wrote strictly to Tenant A DB, zero footprint in Tenant B DB',
      `In B: ${attackInB}, In A: ${attackInA}`
    );

    // ================================================================
    // WORKFLOW 5: LOGOUT & PROTECTED ROUTE ENFORCEMENT
    // ================================================================
    console.log('\n--- WORKFLOW 5: LOGOUT & PROTECTED ROUTES ---');

    // 5.1 Request with no Authorization header
    const resNoAuth = await request(server, 'GET', '/api/ledger');
    assert(
      resNoAuth.status === 401 && resNoAuth.body.success === false,
      '5.1 Unauthenticated request without Authorization header rejected with 401 Unauthorized',
      `Status: ${resNoAuth.status}`
    );

    // 5.2 Request with malformed Bearer token
    const resBadToken = await request(server, 'GET', '/api/ledger', {
      Authorization: 'Bearer invalid.token.garbage',
    });
    assert(
      resBadToken.status === 401,
      '5.2 Request with malformed Bearer token rejected with 401 Unauthorized',
      `Status: ${resBadToken.status}`
    );

    // 5.3 Request with tampered RS256 token (payload modified)
    const tokenParts = tokenA.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: 'user-hacker', tenantId: tenantB, role: 'ADMIN' })
    ).toString('base64url');
    const tamperedToken = `${tokenParts[0]}.${tamperedPayload}.${tokenParts[2]}`;

    const resTampered = await request(server, 'GET', '/api/ledger', {
      Authorization: `Bearer ${tamperedToken}`,
    });
    assert(
      resTampered.status === 401,
      '5.3 Request with cryptographically tampered payload rejected with 401 Unauthorized',
      `Status: ${resTampered.status}`
    );

    // ================================================================
    // WORKFLOW 6: FAILURE RECOVERY & CONTROLLED FAULT HANDLING
    // ================================================================
    console.log('\n--- WORKFLOW 6: FAILURE RECOVERY ---');

    // 6.1 Controlled Ledger Failure: Invalid amount (negative number)
    const failEventId = `day27-fail-${Date.now()}`;
    const resFailLedger = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenA}` },
      {
        eventId: failEventId,
        type: 'debit',
        amount: -250.0,
        currency: 'USD',
      }
    );
    assert(
      resFailLedger.status === 400 && resFailLedger.body.success === false,
      '6.1 Invalid ledger payload (amount < 0) rejected safely with 400 Bad Request',
      JSON.stringify(resFailLedger.body)
    );

    // Verify 0 records created and lock released
    const failCount = await LedgerA.countDocuments({ eventId: failEventId });
    const failLock = await redisClient.get(`ledger:lock:${tenantA}:${failEventId}`);
    assert(
      failCount === 0 && failLock === null,
      '6.2 Failed request left zero database records and cleanly released Redis lock',
      `Count: ${failCount}, Lock: ${failLock}`
    );

    // 6.3 Recovery: Re-attempt with valid payload succeeds
    const resRecoveredLedger = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenA}` },
      {
        eventId: failEventId,
        type: 'debit',
        amount: 250.0,
        currency: 'USD',
        description: 'Recovered valid retry event',
      }
    );
    assert(
      resRecoveredLedger.status === 201 &&
        resRecoveredLedger.body.success === true &&
        resRecoveredLedger.body.duplicate === false,
      '6.3 Retry with corrected payload recovers successfully (201 Created)',
      JSON.stringify(resRecoveredLedger.body)
    );

    // 6.4 Redis Resiliency Failure Simulation
    setSimulatedRedisFailure(true);
    const redisFailEventId = `day27-redis-fail-${Date.now()}`;
    const resRedisFail = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenA}` },
      {
        eventId: redisFailEventId,
        type: 'debit',
        amount: 100.0,
        currency: 'USD',
      }
    );
    assert(
      resRedisFail.status === 503 && resRedisFail.body.code === 'REDIS_UNAVAILABLE',
      '6.4 Redis outage simulation fails fast with 503 Service Unavailable (REDIS_UNAVAILABLE)',
      `Status: ${resRedisFail.status}`
    );

    // Restore Redis and retry
    setSimulatedRedisFailure(false);
    const resRedisRecover = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenA}` },
      {
        eventId: redisFailEventId,
        type: 'debit',
        amount: 100.0,
        currency: 'USD',
        description: 'Post-redis-recovery transaction',
      }
    );
    assert(
      resRedisRecover.status === 201 && resRedisRecover.body.success === true,
      '6.5 After Redis connectivity restored, subsequent request recovers cleanly (201 Created)',
      JSON.stringify(resRedisRecover.body)
    );

    // ================================================================
    // WORKFLOW 7: TRACE LOGGING OBSERVABILITY & SECRET LEAK PREVENTION
    // ================================================================
    console.log('\n--- WORKFLOW 7: TRACE LOGGING & OBSERVABILITY ---');

    // 7.1 Custom trace ID propagation
    const customTraceId = `tr-custom-e2e-${Date.now()}`;
    const resTrace = await request(
      server,
      'GET',
      '/api/tenant/me',
      {
        Authorization: `Bearer ${tokenA}`,
        'x-trace-id': customTraceId,
      }
    );
    assert(
      resTrace.status === 200 &&
        resTrace.headers['x-trace-id'] === customTraceId,
      '7.1 Incoming x-trace-id header propagates across middleware and attaches to response',
      `Header: ${resTrace.headers['x-trace-id']}`
    );

    // 7.2 Generated trace ID when none supplied
    const resAutoTrace = await request(server, 'GET', '/api/tenant/me', {
      Authorization: `Bearer ${tokenA}`,
    });
    assert(
      resAutoTrace.status === 200 &&
        typeof resAutoTrace.headers['x-trace-id'] === 'string' &&
        (resAutoTrace.headers['x-trace-id'] as string).startsWith('tr-'),
      '7.2 Auto-generated trace ID prefixed with tr- attached when none provided in request',
      `Header: ${resAutoTrace.headers['x-trace-id']}`
    );

    // 7.3 Secrets safety: Verify error messages never expose database strings or keys
    const resBadParam = await request(
      server,
      'GET',
      '/api/analytics/summary?range=malicious-injection',
      { Authorization: `Bearer ${tokenA}` }
    );
    const rawErrorBody = JSON.stringify(resBadParam.body);
    const hasSecretLeak =
      rawErrorBody.includes('mongodb+srv') ||
      rawErrorBody.includes('redis://') ||
      rawErrorBody.includes('BEGIN RSA PRIVATE KEY');

    assert(
      !hasSecretLeak,
      '7.3 Sanitized error handling: Zero exposure of DB URIs, Redis credentials, or RSA keys',
      rawErrorBody
    );
  } finally {
    // Graceful teardown
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await tenantConnectionManager.disconnectAll();
    await disconnectRedis();
    if (redisServer) {
      await redisServer.stop();
    }
  }

  console.log('\n================================================================');
  console.log(`DAY 27 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

// Auto-run if executed directly
if (require.main === module) {
  runDay27FullSystemIntegrationTests().catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}
