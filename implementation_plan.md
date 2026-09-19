# Implementation Plan — Day 10: Redis Distributed Locks

Day 10 introduces **Redis distributed locking** to coordinate concurrent processing of billing events across LedgerGuard's multi-tenant architecture.

---

## Technical Goal & Concurrency Flow

The Redis lock coordinates concurrent requests for the **same tenant + event ID**, preventing race conditions before the event reaches the database:

```text
POST /api/ledger
        ↓
JWT Authentication (Verified req.user.tenantId)
        ↓
Tenant Connection Manager (Tenant Database)
        ↓
tenantId + eventId
        ↓
Acquire Redis Lock (SET ledger:lock:{tenantId}:{eventId} {uniqueToken} NX PX {ttl})
        ↓
┌──────────────────────────────┐
│ Lock Acquired?               │
└──────────────┬───────────────┘
               │
        ┌──────┴──────┐
        │             │
       YES            NO (Another request processing)
        │             │
        ↓             ↓
Existing Event?   Return 409 Conflict
        │         { code: "EVENT_PROCESSING",
   ┌────┴────┐      message: "This billing event is currently being processed." }
   │         │
  YES        NO
   │         │
   ↓         ↓
Return     Insert
Existing   Ledger Entry
   │         │
   └────┬────┘
        ↓
   finally: Atomic Release Lock (Lua compare-and-delete)
        ↓
     Response (201 Created or 200 OK)
```

If Redis is temporarily unavailable, fail safely with `503 Service Unavailable` (`"Ledger processing is temporarily unavailable."`) without exposing raw Redis errors or bypassing locking.

---

## User Review Required

> [!IMPORTANT]
> **Separation of Concerns: Redis Locking vs Idempotency Guarantee**:
> - **Redis Distributed Lock**: Concurrency coordination mechanism answering *"Who can process this event right now?"*
> - **MongoDB Compound Unique Index (`{ tenantId: 1, eventId: 1 }`)**: Day 9 idempotency guarantee answering *"Can this event exist more than once?"*
> - **Strict Boundaries Preserved**: MongoDB multi-document transactions and sessions belong to **Day 11**. Distributed queues/workers and payment processing remain strictly out of scope for Day 10.

---

## Proposed Changes

### Configuration Layer

#### [MODIFY] [env.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/config/env.ts)
- Add `redisUrl`: reads `process.env.REDIS_URL || 'redis://localhost:6379'`.
- Add `redisLockTtlMs`: reads `process.env.REDIS_LOCK_TTL_MS || '10000'`, validating it is a finite number > 0.

#### [MODIFY] [.env.example](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/.env.example)
- Add safe placeholder:
  ```env
  REDIS_URL=redis://localhost:6379
  REDIS_LOCK_TTL_MS=10000
  ```

#### [MODIFY] [.env](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/.env)
- Append `REDIS_URL=redis://localhost:6379` and `REDIS_LOCK_TTL_MS=10000` if not already present.

---

### Redis Client & Distributed Lock Service

#### [NEW] [redis.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/config/redis.ts)
- Singleton Redis client wrapper using `createClient({ url: config.redisUrl })`.
- Handles lifecycle events: `connect`, `ready`, `error`, `reconnecting`, `end`.
- Exposes `getRedisClient()`, `connectRedis()`, `disconnectRedis()`, and `isRedisAvailable()`.
- Prevents Express application crashes if Redis is temporarily offline.

#### [NEW] [redis-lock.service.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/services/redis-lock.service.ts)
- `acquireLock(tenantId: string, eventId: string, ttlMs?: number)`:
  - Generates unique ownership token (`crypto.randomUUID()`).
  - Executes atomic `SET ledger:lock:{tenantId}:{eventId} {token} NX PX {ttl}`.
  - Returns `{ acquired: boolean, token?: string }`.
- `releaseLock(tenantId: string, eventId: string, token: string)`:
  - Executes atomic Lua script to compare token before deleting:
    ```lua
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
    ```
- Sanitized logging for lock lifecycle events (never logs passwords or tokens).

---

### Ledger API & Controller Integration

#### [MODIFY] [ledger.controller.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/controllers/ledger.controller.ts)
- Wrap ledger entry creation with Redis distributed locking:
  1. Check Redis availability / attempt lock acquisition.
  2. If Redis is unavailable -> return `503 Service Unavailable` with `code: "REDIS_UNAVAILABLE"`.
  3. If lock acquisition fails -> return `409 Conflict` with `code: "EVENT_PROCESSING"`.
  4. In `try ... finally`, process event through `idempotencyService` and ensure `releaseLock` is called in `finally`.

---

### Frontend Concurrency State & Notification

#### [MODIFY] [NotificationContext.tsx](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/client/src/context/NotificationContext.tsx)
- Add `'contention'` notification type.
- Add `showContention(message?: string)`.

#### [MODIFY] [Notification.tsx](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/client/src/components/Notification.tsx)
- Render styled amber notification banner for `'contention'`.

#### [MODIFY] [LedgerPage.tsx](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/client/src/pages/LedgerPage.tsx)
- Catch `409 Conflict` (`EVENT_PROCESSING`) and trigger `showContention("This transaction is currently being processed. Please try again shortly.")`.
- Preserve Day 9 duplicate handling and disable submit button during submission.

---

### Test Suite

#### [NEW] [redisLock.test.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/tests/redisLock.test.ts)
- Spin up `RedisMemoryServer` for zero-dependency, hermetic test execution.
- Validate:
  1. Redis connection & lifecycle
  2. Lock acquisition success
  3. Lock contention failure (2nd request blocked)
  4. Lock TTL expiration
  5. Correct owner token release
  6. Wrong owner token release rejection
  7. Lock release in `finally` after success
  8. Lock release in `finally` after exception
  9. Redis unavailable handling (503 response)
  10. 4 concurrent requests for same event (1 lock winner, 3 contention responses, 1 DB record)
  11. 10 concurrent requests for same event (strictly 1 DB record)
  12. Different events use independent lock keys (no global lock)
  13. Same event across different tenants use independent lock keys (tenant isolation)
  14. Day 9 idempotency regression validation

#### [MODIFY] [index.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/tests/index.ts)
- Add `redisLock.test.ts` to test files.
- Fix Windows path space quoting bug (`"${filePath}"`).

---

## Verification Plan

### Automated Tests
1. Run `npm test` in `server/`:
   - Runs all 8 test suites sequentially:
     - `security.test.ts`
     - `tenantConnectionManager.test.ts`
     - `tenantGateway.test.ts`
     - `isolation.test.ts`
     - `week1Audit.test.ts`
     - `ledger.test.ts`
     - `idempotency.test.ts`
     - `redisLock.test.ts`
   - Expect 85+ total assertions passing with exit code 0.

2. Run `npm run build` in `server/` (`tsc`).
3. Run `npm run build` in `client/` (`tsc -b && vite build`).
