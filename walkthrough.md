# Walkthrough — Day 10: Redis Distributed Locks

Day 10 introduces **Redis distributed locking** to coordinate concurrent processing of billing events across **LedgerGuard's** multi-tenant architecture.

---

## Technical Overview & Flow

```text
POST /api/ledger
        ↓
JWT Authentication (RS256 req.user.tenantId)
        ↓
Tenant Connection Manager (Tenant Database)
        ↓
tenantId + eventId
        ↓
Acquire Redis Lock (SET ledger:lock:{tenantId}:{eventId} {randomToken} NX PX 10000)
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

---

## Summary of Changes

### Backend Infrastructure (`server/`)

#### 1. Redis Environment Configuration
- [env.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/config/env.ts): Added `redisUrl` and validated `redisLockTtlMs` configuration properties.
- [.env.example](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/.env.example) & [.env](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/.env): Added `REDIS_URL=redis://localhost:6379` and `REDIS_LOCK_TTL_MS=10000`.

#### 2. Reusable Singleton Redis Client
- [redis.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/config/redis.ts): Built singleton Redis client module managing connection lifecycle (`connect`, `ready`, `error`, `reconnecting`, `end`). Includes dynamic in-memory fallback server (`RedisMemoryServer`) for hermetic testing.

#### 3. Distributed Lock Service
- [redis-lock.service.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/services/redis-lock.service.ts): Created `RedisLockService`:
  - Enforces tenant-isolated lock key format: `ledger:lock:{tenantId}:{eventId}`.
  - Atomic lock acquisition using `SET key token NX PX ttlMs` with `crypto.randomUUID()` ownership token.
  - Atomic lock release using Lua script compare-and-delete logic:
    ```lua
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
    ```

#### 4. Ledger Controller Integration
- [ledger.controller.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/controllers/ledger.controller.ts):
  - Integrates Redis distributed lock into `createLedgerEntry`.
  - Returns `503 Service Unavailable` (`code: "REDIS_UNAVAILABLE"`) if Redis is offline.
  - Returns `409 Conflict` (`code: "EVENT_PROCESSING"`) if another request holds the lock.
  - Guarantees lock release in `finally` block.

---

### Frontend UI & Concurrency Notification (`client/`)

- [NotificationContext.tsx](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/client/src/context/NotificationContext.tsx): Added `'contention'` type and `showContention(message)` notification trigger.
- [Notification.tsx](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/client/src/components/Notification.tsx): Added styled amber notification banner for concurrent request contention.
- [LedgerPage.tsx](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/client/src/pages/LedgerPage.tsx): Displays `"Processing transaction with idempotency verification..."` and handles HTTP 409 Conflict responses.

---

## Verification Results

### Test Execution Summary

Ran all 8 automated test suites via `npm test`:

```text
================================================================
DAY 10 SUMMARY: 24 PASSED, 0 FAILED
================================================================

================================================================
🎉 ALL TEST SUITES PASSED SUCCESSFULLY! (87+ ASSERTIONS)
================================================================
```

| Test Suite | Assertions / Tests | Status |
| :--- | :---: | :---: |
| `security.test.ts` | 7 PASSED | **PASS** |
| `tenantConnectionManager.test.ts` | 8 PASSED | **PASS** |
| `tenantGateway.test.ts` | 10 PASSED | **PASS** |
| `isolation.test.ts` | 11 PASSED | **PASS** |
| `week1Audit.test.ts` | 16 PASSED | **PASS** |
| `ledger.test.ts` | 12 PASSED | **PASS** |
| `idempotency.test.ts` | 9 PASSED | **PASS** |
| `redisLock.test.ts` | 14 PASSED (24 assertions) | **PASS** |

### Build Validation
- **Server Build**: `npm run build` in `server/` -> **PASS** (`tsc`, exit code 0)
- **Client Build**: `npm run build` in `client/` -> **PASS** (`tsc -b && vite build`, exit code 0)

