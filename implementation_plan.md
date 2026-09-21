# Implementation Plan — Day 12: Idempotency + Redis + MongoDB Integration

Day 12 is the **core integration milestone of Week 2**, combining Day 9 (Tenant-Aware Idempotency & Database Unique Constraints), Day 10 (Redis Distributed Locking), and Day 11 (MongoDB Multi-Document ACID Transactions) into a unified, resilient billing processing pipeline.

---

## Technical Architecture & Invariant

> **Core Invariant**: One legitimate `tenantId + eventId` must result in **strictly one committed ledger operation**, even when the same billing event is submitted concurrently or repeatedly.

### Unified Request Processing Pipeline

```text
                         POST /api/ledger
                                │
                                ▼
                       JWT Authentication (RS256)
                                │
                                ▼
                        Tenant Resolution
                                │
                                ▼
                    Tenant DB Connection Manager
                                │
                                ▼
                         Validate Request Body
                                │
                                ▼
                       Acquire Redis Lock (ledger:lock:{tenantId}:{eventId})
                                │
                                ▼
                     Existing Event Check (Idempotency)
                                │
                       ┌────────┴────────┐
                       │                 │
                    Exists            New Event
                       │                 │
                       ▼                 ▼
                   Duplicate       Start Tenant Mongo Session (startSession)
                   Response              │
                  (200 OK)               ▼
                                   Start Transaction (startTransaction)
                                         │
                                         ▼
                                  Write Ledger & Audit Documents
                                         │
                                         ▼
                                      COMMIT (commitTransaction)
                                         │
                                         ▼
                                  finally: endSession()
                                         │
                                         ▼
                                  finally: release Redis Lock
                                         │
                                         ▼
                                    API Response (201 Created)
```

---

## Component Responsibilities & Boundaries

1. **JWT Auth & Tenant Resolution**: Authenticates identity via RS256 JWT; derives authoritative `req.user.tenantId`. User body cannot override tenant identity.
2. **TenantConnectionManager**: Resolves and caches tenant-isolated MongoDB connection (`tenantDb`). Connection reuse prevents pool exhaustion.
3. **Redis Lock Service**: Coordinates concurrent requests before database entry. Key: `ledger:lock:{tenantId}:{eventId}` with random UUID token, finite TTL, and atomic Lua script release.
4. **Idempotency Service**: Performs application-level lookup (`findOne({ tenantId, eventId })`) and handles compound unique index fallback (`{ tenantId: 1, eventId: 1 }`).
5. **Transaction Service**: Manages multi-document ACID atomicity on `tenantDb`. Creates both `LedgerEntry` and `LedgerAuditLog` atomically. Aborts on failure and ends session in `finally`.

---

## User Review Required

> [!IMPORTANT]
> **Strict Concurrency & Failure Isolation Requirements**:
> - **Redis Lock Order**: Lock acquisition MUST precede idempotency lookup and transaction execution.
> - **Lock Key Isolation**: Lock keys incorporate `tenantId` prefix (`ledger:lock:{tenantId}:{eventId}`) so `tenantA + event-001` and `tenantB + event-001` never block each other.
> - **Redis Unavailable Handling**: If Redis is unavailable, return `503 Service Unavailable` (`REDIS_UNAVAILABLE`). Lock is NEVER silently bypassed.
> - **Lock Contention Handling**: Concurrent duplicate requests return `409 Conflict` (`EVENT_PROCESSING`) while lock is held, or `200 OK` (`duplicate: true`) after winner completes.
> - **Cleanup Guarantees**: Session cleanup (`endSession()`) and Redis lock release (`releaseLock()`) MUST occur in `finally` blocks under all success and error paths.

---

## Open Questions

- None. Architecture, test requirements, response contracts, and frontend state alignment are fully specified.

---

## Proposed Changes

### Backend Processing & Services

#### [NEW] [ledger-processing.service.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/services/ledger-processing.service.ts)
- Create unified orchestrator service `LedgerProcessingService` that encapsulates:
  1. Redis lock acquisition via `redisLockService`
  2. Idempotency check via `idempotencyService`
  3. MongoDB multi-document ACID transaction execution via `transactionService`
  4. Automatic session end and lock release in `finally` blocks
  5. Detailed server-side logging for audit and debugging

#### [MODIFY] [ledger.controller.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/controllers/ledger.controller.ts)
- Update `createLedgerEntry` controller to invoke `ledgerProcessingService.processLedgerEvent()`.
- Ensure clean HTTP response mapping for `201 Created`, `200 OK (duplicate)`, `409 Conflict (contention)`, `503 Service Unavailable (redis down)`, and `400 Bad Request`.

---

### Documentation & Architectural Guide

#### [NEW] [ledger-processing-flow.md](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/docs/ledger-processing-flow.md)
- Complete technical reference documenting:
  - Sequence diagram of the end-to-end processing pipeline
  - Layer-by-layer responsibility analysis (Auth, Connection Manager, Redis Lock, Idempotency, Mongo Transaction, Unique Index)
  - Failure matrix (Redis failure, DB failure, transaction abort, lock TTL expiry)
  - Concurrency guarantees and cross-tenant security invariants

---

### Integration & Regression Test Suite

#### [NEW] [day12Integration.test.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/tests/day12Integration.test.ts)
- Comprehensive Day 12 integration test suite covering the full 14-point test matrix:
  1. First event submission (201 Created, duplicate: false, 1 DB record)
  2. Sequential duplicate submission (200 OK, duplicate: true, 1 DB record)
  3. 10 concurrent duplicate requests (1 lock winner, 9 duplicate/contention responses, strictly 1 DB record)
  4. 50 concurrent duplicate requests (strictly 1 DB record, zero race condition errors)
  5. Different event IDs (independent locks, independent 201 entries)
  6. Same event ID across tenants (`tenantA` vs `tenantB` independent execution)
  7. Tenant override attempt (`req.body.tenantId` injection ignored; verified JWT `req.user.tenantId` enforced)
  8. Redis unavailable handling (controlled 503 response, lock not bypassed)
  9. Transaction failure / rollback (atomic abort, zero partial state)
  10. MongoDB failure resiliency (controlled 500, lock released in `finally`, server survives)
  11. Redis TTL & orphan lock recovery
  12. Safe lock release verification (Lua token matching)
  13. Compound unique index fallback (`{ tenantId: 1, eventId: 1 }` E11000 handling)
  14. Final ledger count verification

#### [MODIFY] [index.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/tests/index.ts)
- Add `day12Integration.test.ts` to the automated test suite runner.

---

### Frontend Real Data & State Alignment

#### [MODIFY] [LedgerPage.tsx](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/client/src/pages/LedgerPage.tsx)
- Ensure form submission directly queries `POST /api/ledger` and updates table from `GET /api/ledger`.
- Handle transaction status states (`pending` -> `processing` -> `completed` / `duplicate` / `contention` / `failed`).
- Display status badges cleanly for `completed`, `pending`, and `failed`.

---

## Verification Plan

### Automated Tests
1. Run `npm test` in `server/`:
   - Executes all 10 test suites sequentially including `day12Integration.test.ts`.
   - Expect 100+ total assertions passing with 0 errors.

2. Run `npm run build` in `server/` (`tsc`).
3. Run `npm run build` in `client/` (`tsc -b && vite build`).

### Manual Verification Matrix Report
Output the complete Day 12 Integration Validation Report with exact concurrency test counts as specified in the prompt guidelines.
