import http from 'http';
import { RedisMemoryServer } from 'redis-memory-server';
import mongoose from 'mongoose';
import app from '../app';
import { tenantConnectionManager } from '../services/tenantConnectionManager';
import { getRedisClient, connectRedis, disconnectRedis } from '../config/redis';
import { generateAccessToken } from '../utils/jwt';
import { getLedgerModel } from '../models/ledger.model';
import { getLedgerAuditModel } from '../models/ledgerAudit.model';
import { transactionService } from '../services/transaction.service';

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

async function runTransactionTests() {
  console.log('================================================================');
  console.log('=== DAY 11 MONGODB MULTI-DOC TRANSACTIONS & ACID TEST SUITE ===');
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
    // 1. Setup in-memory Redis
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

    const tokenTenantA = generateAccessToken({ userId: 'user-tx-a', tenantId: tenantA, role: 'ADMIN' });
    const tokenTenantB = generateAccessToken({ userId: 'user-tx-b', tenantId: tenantB, role: 'ADMIN' });

    const LedgerModelA = getLedgerModel(tenantDbA);
    const AuditModelA = getLedgerAuditModel(tenantDbA);
    const LedgerModelB = getLedgerModel(tenantDbB);
    const AuditModelB = getLedgerAuditModel(tenantDbB);

    // Test 1: Multi-Document Atomic Creation (LedgerEntry + LedgerAuditLog created together)
    const event1 = `evt-acid-atomic-${Date.now()}`;
    const httpRes1 = await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenTenantA}` },
      {
        eventId: event1,
        type: 'debit',
        amount: 350,
        currency: 'INR',
        description: 'Testing ACID multi-document atomicity',
      }
    );

    assert(
      httpRes1.status === 201 &&
        httpRes1.body.success === true &&
        httpRes1.body.transactionCommitted === true,
      '1a. API returns 201 Created with transactionCommitted=true'
    );

    const entry1 = await LedgerModelA.findOne({ tenantId: tenantA, eventId: event1 });
    const audit1 = await AuditModelA.findOne({ tenantId: tenantA, eventId: event1 });

    assert(
      entry1 !== null && audit1 !== null && audit1.ledgerEntryId?.toString() === entry1._id.toString(),
      '1b. Both LedgerEntry and LedgerAuditLog are saved atomically in the tenant database',
      `Entry: ${!!entry1}, Audit: ${!!audit1}`
    );

    // Test 2: Audit Logs API Endpoint
    const auditApiRes = await request(server, 'GET', '/api/ledger/audit-logs', {
      Authorization: `Bearer ${tokenTenantA}`,
    });

    const matchingAudit = auditApiRes.body.data?.find((a: any) => a.eventId === event1);

    assert(
      auditApiRes.status === 200 &&
        auditApiRes.body.success === true &&
        matchingAudit !== undefined &&
        matchingAudit.action === 'LEDGER_ENTRY_CREATED',
      '2. GET /api/ledger/audit-logs retrieves recorded transaction audit log'
    );

    // Test 3: Forced Rollback Mechanics (Atomic Abort on Error)
    const eventRollback = `evt-acid-rollback-${Date.now()}`;
    let rollbackErrorCaught = false;

    try {
      await transactionService.executeTransaction(tenantDbA, async (session) => {
        const sessionOpts = session ? { session } : {};

        // Document 1 write: LedgerEntry
        const entry = new LedgerModelA({
          eventId: eventRollback,
          tenantId: tenantA,
          type: 'credit',
          amount: 500,
          currency: 'INR',
          status: 'completed',
        });
        await entry.save(sessionOpts);

        // Intentionally throw error to force transaction abort
        throw new Error('Simulated failure during multi-document transaction');
      });
    } catch (err: any) {
      rollbackErrorCaught = err.message === 'Simulated failure during multi-document transaction';
    }

    const entryRollback = await LedgerModelA.findOne({ tenantId: tenantA, eventId: eventRollback });
    const auditRollback = await AuditModelA.findOne({ tenantId: tenantA, eventId: eventRollback });

    assert(
      rollbackErrorCaught && entryRollback === null && auditRollback === null,
      '3. Error inside transaction triggers abortTransaction(): neither LedgerEntry nor LedgerAuditLog persisted',
      `Caught: ${rollbackErrorCaught}, Entry: ${!!entryRollback}, Audit: ${!!auditRollback}`
    );

    // Test 4: Session Cleanup (endSession executed cleanly)
    let sessionEndedCleanly = false;
    try {
      await transactionService.executeTransaction(tenantDbA, async (session) => {
        // Simple valid operation
        return true;
      });
      sessionEndedCleanly = true;
    } catch (e) {
      sessionEndedCleanly = false;
    }

    assert(sessionEndedCleanly, '4. TransactionService ends session cleanly in finally block');

    // Test 5: Multi-Tenant Session & Audit Isolation
    const eventTenantB = `evt-acid-tenantB-${Date.now()}`;
    await request(
      server,
      'POST',
      '/api/ledger',
      { Authorization: `Bearer ${tokenTenantB}` },
      {
        eventId: eventTenantB,
        type: 'credit',
        amount: 1000,
        currency: 'USD',
        description: 'Company B transaction',
      }
    );

    const auditTenantA = await AuditModelA.findOne({ tenantId: tenantA, eventId: eventTenantB });
    const auditTenantB = await AuditModelB.findOne({ tenantId: tenantB, eventId: eventTenantB });

    assert(
      auditTenantA === null && auditTenantB !== null && auditTenantB.tenantId === tenantB,
      '5. Multi-document transactions preserve strict tenant database isolation boundaries'
    );

    // Test 6: Day 9 & Day 10 Integration Regression (Duplicate Event Idempotency & Lock Release)
    const eventDup = `evt-acid-dup-${Date.now()}`;
    const dupBody = {
      eventId: eventDup,
      type: 'debit',
      amount: 120,
      currency: 'INR',
    };

    const firstPost = await request(server, 'POST', '/api/ledger', { Authorization: `Bearer ${tokenTenantA}` }, dupBody);
    assert(firstPost.status === 201 && firstPost.body.duplicate === false, '6a. Initial transaction creates entry (201)');

    const secondPost = await request(server, 'POST', '/api/ledger', { Authorization: `Bearer ${tokenTenantA}` }, dupBody);
    assert(
      secondPost.status === 200 && secondPost.body.duplicate === true,
      '6b. Subsequent duplicate request returns existing entry with 200 OK without breaking ACID constraints'
    );

    const dupCount = await LedgerModelA.countDocuments({ tenantId: tenantA, eventId: eventDup });
    assert(dupCount === 1, '6c. Database contains strictly 1 committed entry for duplicate event');

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
  console.log(`DAY 11 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTransactionTests();

