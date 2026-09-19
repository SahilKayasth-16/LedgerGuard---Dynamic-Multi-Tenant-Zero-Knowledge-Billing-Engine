import http from 'http';
import { RedisMemoryServer } from 'redis-memory-server';
import mongoose from 'mongoose';
import app from '../app';
import { tenantConnectionManager } from '../services/tenantConnectionManager';
import { getRedisClient, connectRedis, disconnectRedis, setSimulatedRedisFailure } from '../config/redis';
import { redisLockService } from '../services/redis-lock.service';
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

async function runRedisLockTests() {
  console.log('================================================================');
  console.log('=== DAY 10 REDIS DISTRIBUTED LOCKS & CONCURRENCY TEST SUITE ===');
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
    // 1. Start in-memory Redis server for hermetic testing
    redisServer = new RedisMemoryServer();
    await redisServer.start();
    const host = await redisServer.getHost();
    const port = await redisServer.getPort();

    process.env.REDIS_URL = `redis://${host}:${port}`;
    process.env.REDIS_LOCK_TTL_MS = '5000';

    // 2. Connect Redis singleton
    await connectRedis();

    // 3. Connect Express server
    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));

    const tenantA = 'tenant-company-a';
    const tenantB = 'tenant-company-b';

    const tenantDbA = await tenantConnectionManager.getTenantConnection(tenantA);
    const tenantDbB = await tenantConnectionManager.getTenantConnection(tenantB);

    const tokenTenantA = generateAccessToken({ userId: 'user-redis-a', tenantId: tenantA, role: 'ADMIN' });
    const tokenTenantB = generateAccessToken({ userId: 'user-redis-b', tenantId: tenantB, role: 'ADMIN' });

    // Test 1: Redis client connects
    const client = getRedisClient();
    assert(client.isOpen && redisLockService.isAvailable(), '1. Redis client connects and reports ready status');

    // Test 2: Lock can be acquired
    const event1 = `evt-lock-acq-${Date.now()}`;
    const res1 = await redisLockService.acquireLock(tenantA, event1);
    assert(res1.acquired && typeof res1.token === 'string', '2. Lock can be acquired for a tenant + eventId');
    await redisLockService.releaseLock(tenantA, event1, res1.token!);

    // Test 3: Second request cannot acquire held lock
    const event2 = `evt-lock-held-${Date.now()}`;
    const resHeld1 = await redisLockService.acquireLock(tenantA, event2);
    const resHeld2 = await redisLockService.acquireLock(tenantA, event2);
    assert(resHeld1.acquired && !resHeld2.acquired && resHeld2.token === undefined, '3. Second request cannot acquire the same lock while held');
    await redisLockService.releaseLock(tenantA, event2, resHeld1.token!);

    // Test 4: Lock TTL expiration
    const event3 = `evt-ttl-${Date.now()}`;
    const resTtl1 = await redisLockService.acquireLock(tenantA, event3, 150);
    assert(resTtl1.acquired, '4a. Initial lock acquired with short TTL');
    await new Promise((r) => setTimeout(r, 200));
    const resTtl2 = await redisLockService.acquireLock(tenantA, event3);
    assert(resTtl2.acquired, '4b. Lock is re-acquired after TTL expiration');
    await redisLockService.releaseLock(tenantA, event3, resTtl2.token!);

    // Test 5: Correct owner release
    const event4 = `evt-rel-correct-${Date.now()}`;
    const resRel = await redisLockService.acquireLock(tenantA, event4);
    const releasedCorrect = await redisLockService.releaseLock(tenantA, event4, resRel.token!);
    assert(releasedCorrect, '5. Correct owner can release the lock');

    // Test 6: Wrong owner release
    const event5 = `evt-rel-wrong-${Date.now()}`;
    const resWrong = await redisLockService.acquireLock(tenantA, event5);
    const releasedWrong = await redisLockService.releaseLock(tenantA, event5, 'wrong-token-abc');
    assert(!releasedWrong, '6a. Wrong owner token cannot release the lock');
    const releasedOriginal = await redisLockService.releaseLock(tenantA, event5, resWrong.token!);
    assert(releasedOriginal, '6b. Original owner can still release lock after failed wrong release attempt');

    // Test 7: Release in finally block after success
    const event6 = `evt-success-flow-${Date.now()}`;
    const httpRes1 = await request(server, 'POST', '/api/ledger', { Authorization: `Bearer ${tokenTenantA}` }, {
      eventId: event6,
      type: 'debit',
      amount: 150,
      currency: 'INR',
    });
    assert(httpRes1.status === 201, '7a. Successful ledger entry creation returns 201');
    const reacquireCheck1 = await redisLockService.acquireLock(tenantA, event6);
    assert(reacquireCheck1.acquired, '7b. Lock is released in finally block after HTTP success');
    await redisLockService.releaseLock(tenantA, event6, reacquireCheck1.token!);

    // Test 8: Release in finally block after exception
    const event7 = `evt-fail-flow-${Date.now()}`;
    const httpResFail = await request(server, 'POST', '/api/ledger', { Authorization: `Bearer ${tokenTenantA}` }, {
      eventId: event7,
      type: 'debit',
      amount: -50,
      currency: 'INR',
    });
    assert(httpResFail.status === 400, '8a. Invalid input returns 400');
    const reacquireCheck2 = await redisLockService.acquireLock(tenantA, event7);
    assert(reacquireCheck2.acquired, '8b. Lock is released in finally block after exception');
    await redisLockService.releaseLock(tenantA, event7, reacquireCheck2.token!);

    // Test 9: Redis unavailable handling (503 Service Unavailable)
    setSimulatedRedisFailure(true);

    const httpResDown = await request(server, 'POST', '/api/ledger', { Authorization: `Bearer ${tokenTenantA}` }, {
      eventId: `evt-redis-down-${Date.now()}`,
      type: 'credit',
      amount: 500,
      currency: 'INR',
    });

    setSimulatedRedisFailure(false);

    assert(
      httpResDown.status === 503 &&
      httpResDown.body.code === 'REDIS_UNAVAILABLE' &&
      httpResDown.body.message === 'Ledger processing is temporarily unavailable.',
      '9. Returns controlled 503 Service Unavailable when Redis is unavailable'
    );

    // Test 10: 4 concurrent requests -> 1 winner, 3 contention responses, 1 DB entry
    const eventConcurrent4 = `evt-concurrent-4-${Date.now()}`;
    const body4 = {
      eventId: eventConcurrent4,
      type: 'debit',
      amount: 100,
      currency: 'INR',
    };

    const reqs4 = Array.from({ length: 4 }).map(() =>
      request(server!, 'POST', '/api/ledger', { Authorization: `Bearer ${tokenTenantA}` }, body4)
    );
    const results4 = await Promise.all(reqs4);

    const created4 = results4.filter((r) => r.status === 201);
    const contention4 = results4.filter((r) => r.status === 409);

    assert(
      created4.length === 1 && contention4.length === 3,
      '10a. Exactly 1 request succeeds (201) and 3 requests encounter contention (409 Conflict)',
      `Created: ${created4.length}, Contention: ${contention4.length}`
    );
    assert(
      contention4[0].body.code === 'EVENT_PROCESSING' &&
      contention4[0].body.message === 'This billing event is currently being processed.',
      '10b. Contention response returns code EVENT_PROCESSING and clear user message'
    );

    const LedgerModelA = getLedgerModel(tenantDbA);
    const count4 = await LedgerModelA.countDocuments({ tenantId: tenantA, eventId: eventConcurrent4 });
    assert(count4 === 1, '10c. Database contains strictly 1 record for 4 concurrent requests');

    // Test 11: 10 concurrent requests -> strictly 1 DB entry created
    const eventConcurrent10 = `evt-concurrent-10-${Date.now()}`;
    const body10 = {
      eventId: eventConcurrent10,
      type: 'credit',
      amount: 250,
      currency: 'INR',
    };

    const reqs10 = Array.from({ length: 10 }).map(() =>
      request(server!, 'POST', '/api/ledger', { Authorization: `Bearer ${tokenTenantA}` }, body10)
    );
    const results10 = await Promise.all(reqs10);

    const validResults10 = results10.filter((r) => r.status === 201 || r.status === 409);
    assert(validResults10.length === 10, '11a. All 10 requests complete with 201 or 409 status');

    const count10 = await LedgerModelA.countDocuments({ tenantId: tenantA, eventId: eventConcurrent10 });
    assert(count10 === 1, '11b. Database contains strictly 1 record for 10 concurrent requests');

    // Test 12: Different events use independent lock keys
    const eventIndep1 = `evt-indep-1-${Date.now()}`;
    const eventIndep2 = `evt-indep-2-${Date.now()}`;

    const lockIndep1 = await redisLockService.acquireLock(tenantA, eventIndep1);
    const lockIndep2 = await redisLockService.acquireLock(tenantA, eventIndep2);

    assert(
      lockIndep1.acquired && lockIndep2.acquired,
      '12. Different events acquire independent lock keys concurrently without blocking each other'
    );

    await redisLockService.releaseLock(tenantA, eventIndep1, lockIndep1.token!);
    await redisLockService.releaseLock(tenantA, eventIndep2, lockIndep2.token!);

    // Test 13: Cross-tenant lock isolation
    const eventShared = `evt-shared-name-${Date.now()}`;
    const lockTenantA = await redisLockService.acquireLock(tenantA, eventShared);
    const lockTenantB = await redisLockService.acquireLock(tenantB, eventShared);

    assert(
      lockTenantA.acquired && lockTenantB.acquired,
      '13a. Same event ID across different tenants acquire independent lock keys concurrently'
    );
    assert(
      redisLockService.getLockKey(tenantA, eventShared) !== redisLockService.getLockKey(tenantB, eventShared),
      '13b. Lock key namespace incorporates tenantId prefix for strict tenant isolation'
    );

    await redisLockService.releaseLock(tenantA, eventShared, lockTenantA.token!);
    await redisLockService.releaseLock(tenantB, eventShared, lockTenantB.token!);

    // Test 14: Day 9 idempotency logic regression verification
    const eventRepeat = `evt-day9-repeat-${Date.now()}`;
    const repeatBody = {
      eventId: eventRepeat,
      type: 'debit',
      amount: 100,
      currency: 'INR',
    };

    const firstResp = await request(server, 'POST', '/api/ledger', { Authorization: `Bearer ${tokenTenantA}` }, repeatBody);
    assert(firstResp.status === 201 && firstResp.body.duplicate === false, '14a. Initial event request returns 201 Created');

    const secondResp = await request(server, 'POST', '/api/ledger', { Authorization: `Bearer ${tokenTenantA}` }, repeatBody);
    assert(
      secondResp.status === 200 &&
      secondResp.body.duplicate === true &&
      secondResp.body.message === 'Ledger event has already been processed.',
      '14b. Sequential duplicate request after lock release returns 200 OK with duplicate: true'
    );

    const countRepeat = await LedgerModelA.countDocuments({ tenantId: tenantA, eventId: eventRepeat });
    assert(countRepeat === 1, '14c. Database count remains strictly 1 for repeat events');

  } catch (err: any) {
    console.error('❌ Test execution error:', err);
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
  console.log(`DAY 10 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runRedisLockTests();
