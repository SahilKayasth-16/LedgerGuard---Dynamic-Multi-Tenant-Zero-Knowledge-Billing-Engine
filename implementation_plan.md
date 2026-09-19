# Implementation Plan — Day 9: Unique Event IDs + Idempotency Foundation

Day 9 establishes **database-enforced idempotency** for **LedgerGuard's** billing engine.

---

## Technical Goal

Guarantee that within any tenant, the same billing event ID (`eventId`) cannot produce more than one committed ledger entry, while ensuring different tenants can process identical `eventId` values independently without collision.

```text
Request (POST /api/ledger)
   ↓
JWT Authentication (JWT tenantId = company-a)
   ↓
Tenant Connection Manager (Tenant DB)
   ↓
Application Pre-Check (findOne { tenantId, eventId })
   ├── Exists? → Return 200 OK { duplicate: true, data: entry }
   └── Not Found? → Attempt insert
            ↓
Database Compound Unique Index { tenantId: 1, eventId: 1 }
   ├── Insert Success → Return 201 Created { duplicate: false, data: entry }
   └── Race Condition (E11000 Duplicate Key Error)
            ↓
     Catch E11000 Error → Re-query entry → Return 200 OK { duplicate: true, data: entry }
```

---

## User Review Required

> [!IMPORTANT]
> **Preserving Architectural Scope**:
> - **Idempotency Strategy**: Combination of application-level pre-check (`findOne`), compound database unique index (`{ tenantId: 1, eventId: 1 }`), and graceful MongoDB `E11000` duplicate key race condition recovery.
> - **Security Rule**: `tenantId` is derived strictly from verified RS256 JWT context (`req.user.tenantId`). Request body overrides are ignored.
> - **API Contract**:
>   - First creation: `201 Created` with `{ success: true, duplicate: false, message: "...", data: {...} }`.
>   - Duplicate request: `200 OK` with `{ success: true, duplicate: true, message: "Ledger event has already been processed.", data: {...} }`.
> - **Strict Scope Control**: Redis distributed locks, MongoDB transactions, ACID multi-document session locks, and background workers are **NOT** implemented today (scheduled for Days 10–12).

---

## Open Questions

None. All criteria for Day 9 are clearly specified.

---

## Proposed Changes

### Server (`server/`)

#### [MODIFY] [ledger.model.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/models/ledger.model.ts)
* Add compound unique index to `LedgerSchema`:
  ```typescript
  LedgerSchema.index({ tenantId: 1, eventId: 1 }, { unique: true });
  ```
* This ensures MongoDB enforces tenant-aware uniqueness across concurrent writes.

#### [NEW] [idempotency.service.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/services/idempotency.service.ts)
* Create `IdempotencyService` implementing `processIdempotentLedgerEntry`:
  1. Performs application-level lookup (`findOne({ tenantId, eventId })`).
  2. If found, returns `{ duplicate: true, entry }`.
  3. If not found, attempts `new LedgerModel(...).save()`.
  4. Catches `E11000` (code `11000` or duplicate key error), re-queries `{ tenantId, eventId }`, and returns `{ duplicate: true, entry }`.

#### [MODIFY] [ledger.service.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/services/ledger.service.ts)
* Delegate ledger entry creation to `idempotencyService.processIdempotentLedgerEntry`.

#### [MODIFY] [ledger.controller.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/controllers/ledger.controller.ts)
* Update `createLedgerEntry`:
  - If `result.duplicate === false`: Return `201 Created` with `duplicate: false`.
  - If `result.duplicate === true`: Return `200 OK` with `duplicate: true` and message `"Ledger event has already been processed."`.

#### [NEW] [tests/idempotency.test.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/tests/idempotency.test.ts)
* Create comprehensive test suite verifying:
  1. First event request creates record (`201 Created`, `duplicate: false`).
  2. Repeated event request returns existing entry (`200 OK`, `duplicate: true`) without creating a duplicate in DB (DB count = 1).
  3. Different event IDs create separate entries.
  4. Same `eventId` used by different tenants coexists independently (`company-a` + `event-001` vs `company-b` + `event-001`).
  5. Request body `tenantId` override attempt is ignored.
  6. **Concurrent Stress Test**: Sends 10 concurrent duplicate requests (`Promise.all`) with identical `tenantId` and `eventId`. Asserts DB count is **EXACTLY 1**.
  7. **High Concurrency Stress Test**: Sends 50 concurrent duplicate requests to verify zero duplicate index violations or unhandled crashes.

#### [MODIFY] [package.json](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/package.json)
* Include `tsx src/tests/idempotency.test.ts` in `npm test`.

---

### Frontend (`client/`)

#### [NEW] [context/NotificationContext.tsx](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/client/src/context/NotificationContext.tsx)
* Create `NotificationContext` providing reusable notification state (`idle`, `submitting`, `success`, `error`, `duplicate`) and trigger helpers.

#### [NEW] [components/Notification.tsx](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/client/src/components/Notification.tsx)
* Render floating/banner UI for:
  - `duplicate`: Soft info banner ("This billing event has already been processed.").
  - `success`: Success banner ("Ledger transaction created successfully.").
  - `error`: Error banner ("Unable to process the transaction. Please try again.").
* Ensures raw backend MongoDB stack traces (e.g., `E11000`) are never displayed to end users.

#### [MODIFY] [services/ledger.service.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/client/src/services/ledger.service.ts)
* Update `createLedgerEntry` return type to expose `{ duplicate: boolean, data: LedgerEntry }`.

---

## Verification Plan

### Automated Testing
1. Run `npm test` in `server/`:
   - `security.test.ts` (7 tests)
   - `tenantConnectionManager.test.ts` (8 tests)
   - `tenantGateway.test.ts` (10 tests)
   - `isolation.test.ts` (11 tests)
   - `week1Audit.test.ts` (16 tests)
   - `ledger.test.ts` (12 tests)
   - `idempotency.test.ts` (~8 tests)
   - **Total**: 72+ passing automated tests with 0 failures.

2. Run `npm run build` in `server/` (`tsc`).
3. Run `npm run build` in `client/` (`tsc -b && vite build`).

### Database Verification
* Verify index creation on Mongoose tenant connection models.

