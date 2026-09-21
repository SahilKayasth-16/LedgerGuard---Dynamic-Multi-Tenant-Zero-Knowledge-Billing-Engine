import http from 'http';
import { RedisMemoryServer } from 'redis-memory-server';
import mongoose from 'mongoose';
import app from '../app';
import { tenantConnectionManager } from '../services/tenantConnectionManager';
import { getRedisClient, connectRedis, disconnectRedis, setSimulatedRedisFailure } from '../config/redis';
import { redisLockService } from '../services/redis-lock.service';
import { transactionService } from '../services/transaction.service';
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

async function runDay12IntegrationTests() {
  console.log('================================================================');
  console.log('=== DAY 12 COMPLETE INTEGRATION TEST SUITE (IDEMPOTENCY+LOCKS+ACID) ===');
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
    // 1. Spin up in-memory Redis server for hermetic testing
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

    const tokenTenantA = generateAccessToken({ userId: 'user-d12-a', tenantId: tenantA, role: 'ADMIN' });
    const tokenTenantB = generateAccessToken({ userId: 'user-d12-b', tenantId: tenantB, role: 'ADMIN' });

    let LedgerModelA = getLedgerModel(tenantDbA);
    const AuditModelA = getLedgerAuditModel(tenantDbA);
    const LedgerModelB = getLedgerModel(tenantDbB);

    const uniqueSuffix = Date.now();

    // -------------------------------------------------------------------------
    // TEST 1: First Event Submission
    // -------------------------------------------------------------------------
    const event1 = `evt-d12-first-${uniqueSuffix}`;
    const res1 = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenTenantA}` },
      {
        eventId: event1,
        type: 'debit',
        amount: 450,
        currency: 'INR',
        description: 'First event submission Day 12',
      }
    );

    assert(
      res1.status === 201 &&
        res1.body.success === true &&
        res1.body.duplicate === false &&
        res1.body.transactionCommitted === true &&
        res1.body.data.eventId === event1 &&
        res1.body.data.tenantId === tenantA,
      '1. First event submission returns 201 Created with duplicate=false and transactionCommitted=true'
    );

    const entry1 = await LedgerModelA.findOne({ tenantId: tenantA, eventId: event1 });
    const audit1 = await AuditModelA.findOne({ tenantId: tenantA, eventId: event1 });
    assert(
      entry1 !== null && audit1 !== null && audit1.action === 'LEDGER_ENTRY_CREATED',
      '1b. Database confirms atomic creation of both LedgerEntry and LedgerAuditLog'
    );

    // -------------------------------------------------------------------------
    // TEST 2: Sequential Duplicate Event Submission
    // -------------------------------------------------------------------------
    const res2 = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenTenantA}` },
      {
        eventId: event1,
        type: 'debit',
        amount: 450,
        currency: 'INR',
        description: 'Duplicate event submission Day 12',
      }
    );

    assert(
      res2.status === 200 &&
        res2.body.success === true &&
        res2.body.duplicate === true &&
        res2.body.data.id === entry1!._id.toString() &&
        res2.body.message === 'Ledger event has already been processed.',
      '2. Sequential duplicate submission returns 200 OK with duplicate=true and existing payload'
    );

    const count1 = await LedgerModelA.countDocuments({ tenantId: tenantA, eventId: event1 });
    assert(count1 === 1, '2b. Database strictly contains 1 committed record for event1');

    // -------------------------------------------------------------------------
    // TEST 3: 10 Concurrent Duplicate Requests
    // -------------------------------------------------------------------------
    const eventConcurrent10 = `evt-d12-conc10-${uniqueSuffix}`;
    const body10 = {
      eventId: eventConcurrent10,
      type: 'credit',
      amount: 750,
      currency: 'INR',
      description: 'Concurrent 10 event test',
    };

    const reqs10 = Array.from({ length: 10 }).map(() =>
      request(server!, 'POST', '/api/ledger', { Authorization: `Bearer ${tokenTenantA}` }, body10)
    );
    const results10 = await Promise.all(reqs10);

    const created10 = results10.filter((r) => r.status === 201);
    const duplicate10 = results10.filter((r) => r.status === 200);
    const contention10 = results10.filter((r) => r.status === 409);

    const totalHandled10 = created10.length + duplicate10.length + contention10.length;
    const dbCount10 = await LedgerModelA.countDocuments({ tenantId: tenantA, eventId: eventConcurrent10 });

    assert(
      totalHandled10 === 10 && created10.length >= 1 && dbCount10 === 1,
      `3. 10 concurrent requests handled cleanly (Created: ${created10.length}, Dup: ${duplicate10.length}, Contention: ${contention10.length}) resulting in strictly 1 DB entry`,
      `DB count: ${dbCount10}`
    );

    // -------------------------------------------------------------------------
    // TEST 4: 50 Concurrent Duplicate Requests
    // -------------------------------------------------------------------------
    const eventConcurrent50 = `evt-d12-conc50-${uniqueSuffix}`;
    const body50 = {
      eventId: eventConcurrent50,
      type: 'debit',
      amount: 1500,
      currency: 'INR',
      description: 'Concurrent 50 stress event test',
    };

    const reqs50 = Array.from({ length: 50 }).map(() =>
      request(server!, 'POST', '/api/ledger', { Authorization: `Bearer ${tokenTenantA}` }, body50)
    );
    const results50 = await Promise.all(reqs50);

    const valid50 = results50.every(
      (r) => r.status === 201 || r.status === 200 || r.status === 409
    );
    const dbCount50 = await LedgerModelA.countDocuments({ tenantId: tenantA, eventId: eventConcurrent50 });

    assert(
      valid50 && dbCount50 === 1,
      `4. 50 concurrent requests handled with 0 unhandled errors, resulting in strictly 1 DB entry`,
      `All Valid: ${valid50}, DB count: ${dbCount50}`
    );

    // -------------------------------------------------------------------------
    // TEST 5: Different Event IDs
    // -------------------------------------------------------------------------
    const eventIndep1 = `evt-indep-a-${uniqueSuffix}`;
    const eventIndep2 = `evt-indep-b-${uniqueSuffix}`;
    const eventIndep3 = `evt-indep-c-${uniqueSuffix}`;

    const resIndep1 = await request(server, 'POST', '/api/ledger', { Authorization: `Bearer ${tokenTenantA}` }, { eventId: eventIndep1, type: 'debit', amount: 100, currency: 'INR' });
    const resIndep2 = await request(server, 'POST', '/api/ledger', { Authorization: `Bearer ${tokenTenantA}` }, { eventId: eventIndep2, type: 'credit', amount: 200, currency: 'INR' });
    const resIndep3 = await request(server, 'POST', '/api/ledger', { Authorization: `Bearer ${tokenTenantA}` }, { eventId: eventIndep3, type: 'debit', amount: 300, currency: 'INR' });

    assert(
      resIndep1.status === 201 && resIndep2.status === 201 && resIndep3.status === 201,
      '5. Different event IDs acquire independent lock keys and create separate entries (3/3 created)'
    );

    // -------------------------------------------------------------------------
    // TEST 6: Same Event ID Across Tenants
    // -------------------------------------------------------------------------
    const sharedEvent = `evt-shared-tenant-${uniqueSuffix}`;
    const resTenantA = await request(server, 'POST', '/api/ledger', { Authorization: `Bearer ${tokenTenantA}` }, { eventId: sharedEvent, type: 'debit', amount: 999, currency: 'INR' });
    const resTenantB = await request(server, 'POST', '/api/ledger', { Authorization: `Bearer ${tokenTenantB}` }, { eventId: sharedEvent, type: 'credit', amount: 888, currency: 'USD' });

    const entryTenantA = await LedgerModelA.findOne({ tenantId: tenantA, eventId: sharedEvent });
    const entryTenantB = await LedgerModelB.findOne({ tenantId: tenantB, eventId: sharedEvent });

    assert(
      resTenantA.status === 201 &&
        resTenantB.status === 201 &&
        entryTenantA !== null &&
        entryTenantB !== null &&
        entryTenantA.tenantId === tenantA &&
        entryTenantB.tenantId === tenantB,
      '6. Same eventId coexists independently across different tenants in isolated databases'
    );

    // -------------------------------------------------------------------------
    // TEST 7: Tenant Override Protection
    // -------------------------------------------------------------------------
    const eventOverride = `evt-override-${uniqueSuffix}`;
    const resOverride = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenTenantA}` },
      {
        eventId: eventOverride,
        tenantId: 'tenant-company-b', // Injection attempt in body
        type: 'debit',
        amount: 50,
        currency: 'INR',
      }
    );

    assert(
      resOverride.status === 201 &&
        resOverride.body.data.tenantId === tenantA &&
        resOverride.body.data.tenantId !== 'tenant-company-b',
      '7. Client-supplied tenantId in request body is overridden by verified JWT identity (tenantA)'
    );

    // -------------------------------------------------------------------------
    // TEST 8: Redis Unavailable Handling
    // -------------------------------------------------------------------------
    setSimulatedRedisFailure(true);

    const resRedisDown = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenTenantA}` },
      {
        eventId: `evt-redis-down-${uniqueSuffix}`,
        type: 'credit',
        amount: 500,
        currency: 'INR',
      }
    );

    setSimulatedRedisFailure(false);

    assert(
      resRedisDown.status === 503 &&
        resRedisDown.body.code === 'REDIS_UNAVAILABLE' &&
        resRedisDown.body.message === 'Ledger processing is temporarily unavailable.',
      '8. Returns 503 Service Unavailable when Redis is unavailable, without bypassing lock'
    );

    // -------------------------------------------------------------------------
    // TEST 9: Transaction Rollback Verification
    // -------------------------------------------------------------------------
    const eventRollback = `evt-rollback-${uniqueSuffix}`;
    let errorCaught = false;

    try {
      await transactionService.executeTransaction(tenantDbA, async (session) => {
        const opts = session ? { session } : {};

        const entry = new LedgerModelA({
          eventId: eventRollback,
          tenantId: tenantA,
          type: 'credit',
          amount: 100,
          currency: 'INR',
          status: 'completed',
        });
        await entry.save(opts);

        // Force exception
        throw new Error('Simulated atomic rollback test');
      });
    } catch (e: any) {
      errorCaught = e.message === 'Simulated atomic rollback test';
    }

    const checkRollbackEntry = await LedgerModelA.findOne({ tenantId: tenantA, eventId: eventRollback });
    assert(
      errorCaught && checkRollbackEntry === null,
      '9. Exception during multi-doc transaction triggers abortTransaction(): 0 records persisted'
    );

    // -------------------------------------------------------------------------
    // TEST 10: Database Failure Resiliency
    // -------------------------------------------------------------------------
    tenantConnectionManager.simulateFailure(tenantA);

    const resDbFail = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenTenantA}` },
      {
        eventId: `evt-db-fail-${uniqueSuffix}`,
        type: 'debit',
        amount: 100,
        currency: 'INR',
      }
    );

    tenantConnectionManager.clearSimulatedFailure(tenantA);
    const freshDbA = await tenantConnectionManager.getTenantConnection(tenantA);
    LedgerModelA = getLedgerModel(freshDbA);

    assert(
      resDbFail.status === 500 && resDbFail.body.success === false,
      '10a. Controlled 500 returned when database connection fails for Tenant A'
    );

    // Verify tenant B works during Tenant A failure
    const resTenantBCheck = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenTenantB}` },
      {
        eventId: `evt-tenantB-health-${uniqueSuffix}`,
        type: 'debit',
        amount: 200,
        currency: 'USD',
      }
    );

    assert(
      resTenantBCheck.status === 201,
      '10b. Tenant B remains 100% operational during Tenant A database connection failure'
    );

    // -------------------------------------------------------------------------
    // TEST 11: Redis TTL & Orphan Lock Recovery
    // -------------------------------------------------------------------------
    const eventTtl = `evt-ttl-${uniqueSuffix}`;
    const lockTtl1 = await redisLockService.acquireLock(tenantA, eventTtl, 150);
    assert(lockTtl1.acquired, '11a. Short TTL lock acquired');
    await new Promise((r) => setTimeout(r, 200));
    const lockTtl2 = await redisLockService.acquireLock(tenantA, eventTtl);
    assert(lockTtl2.acquired, '11b. Lock is re-acquired after TTL expiration');
    await redisLockService.releaseLock(tenantA, eventTtl, lockTtl2.token!);

    // -------------------------------------------------------------------------
    // TEST 12: Safe Lock Release Verification
    // -------------------------------------------------------------------------
    const eventSafeRel = `evt-safe-rel-${uniqueSuffix}`;
    const lockRel = await redisLockService.acquireLock(tenantA, eventSafeRel);
    const relWrong = await redisLockService.releaseLock(tenantA, eventSafeRel, 'wrong-token-xyz');
    assert(!relWrong, '12a. Wrong ownership token fails lock release');
    const relCorrect = await redisLockService.releaseLock(tenantA, eventSafeRel, lockRel.token!);
    assert(relCorrect, '12b. Original ownership token releases lock successfully');

    // -------------------------------------------------------------------------
    // TEST 13: Compound Unique Index Verification
    // -------------------------------------------------------------------------
    const indexes = await LedgerModelA.collection.indexes();
    const hasCompoundUnique = indexes.some(
      (idx: any) => idx.key?.tenantId === 1 && idx.key?.eventId === 1 && idx.unique === true
    );
    assert(hasCompoundUnique, '13. Database confirms compound unique index { tenantId: 1, eventId: 1 } is active');

    // -------------------------------------------------------------------------
    // TEST 14: Final Database Count Verification
    // -------------------------------------------------------------------------
    const totalRecordsA = await LedgerModelA.countDocuments({ tenantId: tenantA });
    assert(
      totalRecordsA > 0,
      `14. Final ledger count query for Tenant A executes accurately (${totalRecordsA} records verified)`
    );

  } catch (err: any) {
    console.error('❌ Integration test execution error:', err);
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
  console.log(`DAY 12 INTEGRATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runDay12IntegrationTests();
