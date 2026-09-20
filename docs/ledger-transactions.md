# LedgerGuard Architecture: MongoDB Multi-Document Transactions & ACID Processing

## Overview

In **LedgerGuard**, financial transactions require strict **ACID guarantees** (Atomicity, Consistency, Isolation, Durability) to ensure that tenant databases never end up in a corrupted or partially-updated state.

Day 10 introduced **Redis Distributed Locking** (`ledger:lock:{tenantId}:{eventId}`) to coordinate concurrent inbound API requests.
Day 11 introduces **MongoDB Multi-Document ACID Transactions** to guarantee that multiple database writes (specifically, the `LedgerEntry` and its corresponding `LedgerAuditLog`) succeed or fail as a single atomic unit.

---

## Technical Core Principles

### 1. Redis Lock vs. MongoDB Transaction Boundary

| Layer | Technology | Primary Purpose | Key Mechanism |
| :--- | :--- | :--- | :--- |
| **Concurrency Guard** | Redis Distributed Lock | Prevents race conditions before database operations start | Atomic `SET key token NX PX ttl` |
| **ACID Database Guard** | MongoDB Multi-Document Transaction | Guarantees atomic database persistence across multiple documents | `session.startTransaction()` / `commitTransaction()` / `abortTransaction()` |
| **Idempotency Guard** | MongoDB Compound Unique Index | Permanent deduplication safeguard | `{ tenantId: 1, eventId: 1 }` unique index |

```text
POST /api/ledger
        ↓
1. JWT Auth & Tenant Resolution (req.user.tenantId)
        ↓
2. Acquire Redis Lock (ledger:lock:{tenantId}:{eventId})
        ↓
3. Start Tenant MongoDB Session (const session = await tenantDb.startSession())
        ↓
4. Start Transaction (session.startTransaction())
        ↓
5. Perform Multi-Document Writes:
   ├─ Write 1: Create LedgerEntry (status: 'completed', { session })
   └─ Write 2: Create LedgerAuditLog (action: 'CREATED', { session })
        ↓
6. Commit Transaction (session.commitTransaction())
   (If any write or validation fails -> session.abortTransaction())
        ↓
7. finally: Clean up Session (session.endSession())
        ↓
8. finally: Release Redis Lock (Lua script)
        ↓
Return HTTP Response (201 Created)
```

---

## Multi-Tenant Session Isolation Requirement

To maintain strict tenant isolation:

- Sessions **MUST** be spawned from the tenant-specific Mongoose connection:
  ```typescript
  const session = await tenantDb.startSession();
  ```
- **NEVER** use global `mongoose.startSession()`, which targets the global connection pool and bypasses tenant partition boundaries.

---

## Failure & Rollback Dynamics

If an exception occurs during billing operation execution (such as schema validation errors or database write errors):

1. `TransactionService` catches the exception.
2. Checks if `session.inTransaction()` is true.
3. Invokes `await session.abortTransaction()`.
4. Neither the `LedgerEntry` nor the `LedgerAuditLog` document is saved to the tenant database.
5. In the `finally` block, `session.endSession()` and Redis `releaseLock` are executed.

---

## Verifying Transactions

You can inspect tenant audit logs via the API:

```http
GET /api/ledger/audit-logs
Authorization: Bearer <jwt_token>
```

Sample Audit Payload:
```json
{
  "success": true,
  "tenantId": "tenant-company-a",
  "data": [
    {
      "id": "673752e89d1a...",
      "tenantId": "tenant-company-a",
      "eventId": "evt-001",
      "ledgerEntryId": "673752e89d19...",
      "action": "LEDGER_ENTRY_CREATED",
      "status": "completed",
      "details": {
        "type": "debit",
        "amount": 250,
        "currency": "INR"
      },
      "createdAt": "2026-09-20T21:10:00.000Z"
    }
  ]
}
```

