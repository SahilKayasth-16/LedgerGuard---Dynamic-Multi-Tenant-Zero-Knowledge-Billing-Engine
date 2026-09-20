# Implementation Plan — Day 11: MongoDB Multi-Document Transactions + ACID Ledger Processing

Day 11 introduces **MongoDB ACID transaction handling** into LedgerGuard using tenant-isolated sessions and multi-document atomicity.

---

## Technical Goal & Concurrency/Transaction Flow

Redis distributed locks (Day 10) coordinate **concurrency**, while MongoDB multi-document transactions (Day 11) guarantee **ACID database atomicity**.

> **Core Invariant**: A billing operation must never leave the tenant database in a partially updated state. Either the `LedgerEntry` and its corresponding `LedgerAuditLog` are atomically committed together, or the session aborts and neither document persists.

```text
POST /api/ledger
        ↓
JWT Authentication (Verified req.user.tenantId)
        ↓
Tenant Connection Manager (Tenant Database)
        ↓
Acquire Redis Distributed Lock (ledger:lock:{tenantId}:{eventId})
        ↓
Idempotency Check
        ↓
Start Tenant MongoDB Session (const session = await tenantDb.startSession())
        ↓
Start MongoDB Transaction (session.startTransaction())
        ↓
┌───────────────────────────────────────────────────────────┐
│ Multi-Document Transactional Writes                       │
│ 1. Create LedgerEntry (status: 'completed', session)      │
│ 2. Create LedgerAuditLog (action: 'CREATED', session)    │
└─────────────────────────────┬─────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │  Writes Valid?    │
                    └─────────┬─────────┘
                              │
                       ┌──────┴──────┐
                      YES           NO / Exception
                       │             │
                       ↓             ↓
               Commit Transaction   Abort Transaction
             (commitTransaction)   (abortTransaction)
                       │             │
                       └──────┬──────┘
                              ↓
                  finally: endSession()
                              ↓
               finally: release Redis Lock
                              ↓
              Response (201 Created / 400 Bad Request)
```

---

## User Review Required

> [!IMPORTANT]
> **Tenant Connection Session Requirement & Redis Isolation Boundary**:
> - **Tenant Connection Sessions**: Sessions MUST be spawned from `tenantDb.startSession()`, NOT the global `mongoose.startSession()`. This ensures transactions run strictly on the tenant-isolated MongoDB instance.
> - **Multi-Document Persistence**: A transaction creates BOTH a `LedgerEntry` AND a `LedgerAuditLog` document atomically. If an exception occurs (or validation fails), `abortTransaction()` rolls back both documents completely.
> - **Lock & Session Lifecycles**: Redis locks are acquired BEFORE transaction start and released in `finally` AFTER session cleanup (`endSession()`).

---

## Open Questions

- None. Requirements for session management, multi-document atomicity, audit logging, transaction rollbacks, test suites, and documentation are fully specified.

---

## Proposed Changes

### Ledger Models

#### [NEW] [ledgerAudit.model.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/models/ledgerAudit.model.ts)
- Define `ILedgerAuditLog` interface and `LedgerAuditSchema`:
  - `tenantId`: string (required)
  - `eventId`: string (required)
  - `ledgerEntryId`: Mongoose ObjectId (required)
  - `action`: `'LEDGER_ENTRY_CREATED' | 'LEDGER_ENTRY_DUPLICATE_ATTEMPT'`
  - `status`: `'completed' | 'failed' | 'duplicate'`
  - `details`: Schema.Types.Mixed
  - `timestamp`: Date (default: `Date.now`)
- Expose `getLedgerAuditModel(conn: mongoose.Connection)`.

---

### Transaction & Idempotency Services

#### [NEW] [transaction.service.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/services/transaction.service.ts)
- `executeTransaction<T>(tenantDb: mongoose.Connection, work: (session: mongoose.ClientSession) => Promise<T>): Promise<T>`
- Starts session via `tenantDb.startSession()`.
- Starts transaction via `session.startTransaction()`.
- Executes transactional work callback with `{ session }`.
- Commits transaction via `session.commitTransaction()`.
- Catches errors and calls `session.abortTransaction()`.
- Guarantees `session.endSession()` in `finally`.

#### [MODIFY] [idempotency.service.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/services/idempotency.service.ts)
- Update `processIdempotentLedgerEntry` to use `TransactionService` to create `LedgerEntry` and `LedgerAuditLog` atomically within a single MongoDB session.
- Handle duplicate event checks gracefully and record audit logs.

#### [MODIFY] [ledger.service.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/services/ledger.service.ts)
- Pass transaction context down to `idempotencyService`.
- Expose audit log retrieval method `getLedgerAuditLogs(tenantDb, tenantId)`.

#### [MODIFY] [ledger.controller.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/controllers/ledger.controller.ts)
- Coordinate request validation, Redis lock acquisition, transactional ledger creation, response formatting, and lock release in `finally`.

---

### Documentation & Architecture Guide

#### [NEW] [ledger-transactions.md](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/docs/ledger-transactions.md)
- Comprehensive architectural guide covering:
  1. MongoDB Session & Transaction Architecture in LedgerGuard
  2. Multi-tenant isolation for sessions (`tenantDb.startSession()`)
  3. Multi-document atomicity (`LedgerEntry` + `LedgerAuditLog`)
  4. Failure & Rollback mechanics (`abortTransaction()`)
  5. Distinction between Redis Distributed Locks (Concurrency) vs MongoDB Transactions (Database ACID)

---

### Test Suite

#### [NEW] [transaction.test.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/tests/transaction.test.ts)
- End-to-end integration and transaction test suite:
  1. Multi-document atomic commit (`LedgerEntry` + `LedgerAuditLog` both created in single transaction)
  2. Forced rollback on error (neither `LedgerEntry` nor `LedgerAuditLog` persisted when error occurs)
  3. Session cleanup verification (`session.endSession()` called in `finally`)
  4. Tenant connection session isolation (`tenantDb.startSession()`)
  5. Day 9 idempotency & Day 10 Redis lock regression validation

#### [MODIFY] [index.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/tests/index.ts)
- Include `transaction.test.ts` in the test runner.

---

## Verification Plan

### Automated Tests
1. Run `npm test` in `server/`:
   - Executes all 9 test suites sequentially including `transaction.test.ts`.
   - Expect all assertions to pass with 0 errors.

2. Run `npm run build` in `server/` (`tsc`).
3. Run `npm run build` in `client/` (`tsc -b && vite build`).
