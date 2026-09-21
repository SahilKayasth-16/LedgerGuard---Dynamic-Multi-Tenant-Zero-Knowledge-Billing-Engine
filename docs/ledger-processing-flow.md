# LedgerGuard Architecture: Integrated Ledger Processing Pipeline

## Overview & Core Invariant

Day 12 combines **Day 9 (Tenant-Aware Idempotency)**, **Day 10 (Redis Distributed Locking)**, and **Day 11 (MongoDB Multi-Document ACID Transactions)** into a unified, resilient billing event processing pipeline.

> **Core Invariant**: For a given tenant, one legitimate billing event ID produces **strictly one committed ledger operation**, even when the event is submitted repeatedly or concurrently.

---

## Full End-to-End Request Flow Diagram

```text
                         CLIENT REQUEST
                               │
                               ▼
                        POST /api/ledger
                               │
                               ▼
                 ┌───────────────────────────┐
                 │ JWT Authentication (RS256)│
                 └─────────────┬─────────────┘
                               │
                               ▼
                       Tenant Resolution
                               │
                               ▼
                 Tenant Connection Manager
                               │
                               ▼
                       Tenant Database DB
                               │
                               ▼
                    Validate Request Payload
                               │
                               ▼
                ┌─────────────────────────────┐
                │ Acquire Redis Distributed   │
                │ Lock (ledger:lock:{T}:{E})  │
                └──────────────┬──────────────┘
                               │
                      ┌────────┴────────┐
                      │ Lock Acquired?  │
                      └────────┬────────┘
                               │
                       ┌───────┴───────┐
                      YES              NO
                       │               │
                       ▼               ▼
                 Check Existing  Return 409 Conflict / 503 Service Unavailable
                  Event Check    ("This event is currently being processed")
                       │
              ┌────────┴────────┐
              │ Event Exists?   │
              └────────┬────────┘
                       │
               ┌───────┴───────┐
              YES              NO
               │               │
               ▼               ▼
          Return 200 OK  Start Tenant Mongo Session (startSession)
           (Duplicate)         │
                               ▼
                         Start Transaction (startTransaction)
                               │
                               ▼
                         Write Ledger & Audit Documents
                               │
                          ┌────┴────┐
                          ▼         ▼
                       COMMIT      ABORT
                          │         │
                          ▼         ▼
                       Success   Rollback
                          │         │
                          └────┬────┘
                               ▼
                     finally: endSession()
                               │
                               ▼
                  finally: release Redis Lock (Lua Script)
                               │
                               ▼
                     Return 201 Created Response
```

---

## Distinct Responsibilities of Each Layer

1. **JWT RS256 Authentication**: Evaluates token authenticity using RSA public key encryption. Decodes authoritative claims (`userId`, `tenantId`, `role`). Request body `tenantId` injection attempts are completely ignored.
2. **TenantConnectionManager**: Dynamically establishes and caches tenant-isolated MongoDB connections (`tenantDb`). Connection reuse prevents pool exhaustion across concurrent requests.
3. **Redis Lock Service**: Coordinates concurrent event processing before database interaction. Key format: `ledger:lock:{tenantId}:{eventId}` with random UUID ownership token and automatic TTL expiration. Locks are released via Lua script comparison.
4. **Idempotency Service**: Performs application-level lookup (`findOne({ tenantId, eventId })`) and relies on MongoDB compound unique index `{ tenantId: 1, eventId: 1 }` as permanent database protection.
5. **MongoDB Transaction Service**: Spawns session from tenant connection (`tenantDb.startSession()`) to execute multi-document atomic operations (`LedgerEntry` + `LedgerAuditLog`). Aborts on error and ends session in `finally`.

---

## Failure Matrix & System Behavior

| Failure Scenario | Layer Handling | Resulting HTTP Response | Ledger Database State | Redis Lock State |
| :--- | :--- | :--- | :--- | :--- |
| **Concurrent Same Event** | Redis Lock (`set NX PX`) | Winner: `201 Created` / Others: `409 Conflict` or `200 OK` | Exactly 1 record created | Released by winner in `finally` |
| **Duplicate Event (Sequential)** | Idempotency Check (`findOne`) | `200 OK` (`duplicate: true`) | Exactly 1 record created | Released in `finally` |
| **Redis Down/Unreachable** | Lock Service (`isRedisAvailable`) | `503 Service Unavailable` (`REDIS_UNAVAILABLE`) | Unchanged (No DB operations performed) | No lock acquired |
| **Validation Error (bad amount/type)** | Controller Validation | `400 Bad Request` | Unchanged | No lock acquired |
| **Transaction Failure (Write Error)** | `TransactionService` (`abortTransaction`) | `400 Bad Request` / `500 Server Error` | Unchanged (Rollback executed) | Released in `finally` |
| **Tenant Database Failure** | `TenantConnectionManager` | `500 Internal Server Error` | Unchanged | Released in `finally` |

---

## Verification & Monitoring

Audit logs record all transaction commits and duplicate attempts:

```http
GET /api/ledger/audit-logs
Authorization: Bearer <jwt_token>
```

