# Implementation Plan — Day 13: Billing Ledger UI + Transaction History

Day 13 transforms `/dashboard/ledger` into a **fully functional, production-ready Billing Ledger & Transaction History interface** backed exclusively by real backend API data (`GET /api/ledger` and `POST /api/ledger`).

---

## Core Principles & Invariants

> **Core Invariant**: The Billing Ledger UI is a direct representation of the backend's tenant-isolated ledger state. No mock data, hardcoded rows, or fabricated transactions exist in the production interface.

```text
Authenticated User (JWT)
       ↓
/dashboard/ledger
       ↓
GET /api/ledger
       ↓
Tenant Resolution & Connection Manager
       ↓
Tenant-isolated Database
       ↓
Formatted Transaction Table (Intl Amount & Date Formatting)
```

---

## User Review Required

> [!IMPORTANT]
> **UI Design & Formatting Enhancements**:
> - **Idempotency Key Guidance**: The creation form clearly designates `Event ID (Idempotency Key)` with explicit help text explaining deduplication behavior.
> - **Intl Amount & Date Formatting**: Amounts format dynamically using `Intl.NumberFormat` by record currency (e.g. `INR` -> `₹500.00`, `USD` -> `$500.00`, `EUR` -> `€500.00`). Timestamps format using `Intl.DateTimeFormat` (e.g. `21 Sep 2026, 4:00 PM`).
> - **Status Indicators**: Status badges render accessible text labels (`Completed`, `Pending`, `Failed`, `Processing`) with semantic styling.
> - **Retry Action**: Error state includes an interactive `[Retry Loading Records]` button to recover gracefully from network glitches.
> - **Transaction Details View**: Table rows support clicking to inspect detailed event metadata (Event ID, Type, Amount, Currency, Status, Description, Date, Metadata).
> - **Backend Error Sanitization**: All API error responses return sanitized error codes (`VALIDATION_ERROR`, `EVENT_PROCESSING`, `REDIS_UNAVAILABLE`, `SERVER_ERROR`) without leaking internal stack traces or connection strings.

---

## Open Questions

- None. UI requirements, formatting policies, error handling, documentation, and test criteria are fully specified.

---

## Proposed Changes

### Frontend Component & Service Updates

#### [MODIFY] [LedgerPage.tsx](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/client/src/pages/LedgerPage.tsx)
- Enhance `/dashboard/ledger` with:
  1. Amount formatting utility (`formatCurrencyAmount(amount, currency)`) using `Intl.NumberFormat`.
  2. Date formatting utility (`formatDateTime(dateString)`) displaying readable local timestamps (`21 Sep 2026, 4:00 PM`).
  3. Form field guidance for `Event ID (Idempotency Key)` explaining deduplication behavior.
  4. Interactive `[Retry Loading Records]` button on API error state.
  5. Detailed transaction inspection modal/drawer when clicking a ledger row.
  6. Client-side validation for non-empty Event ID, positive amount > 0, and valid currency code.
  7. Clear duplicate notification (`"This event has already been processed. No duplicate transaction was created."`).

#### [MODIFY] [ledger.service.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/client/src/services/ledger.service.ts)
- Update TypeScript interfaces if needed to include `transactionCommitted` or details fields.

---

### Backend Controller & Error Sanitization

#### [MODIFY] [ledger.controller.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/controllers/ledger.controller.ts)
- Audit error handlers to ensure all catch blocks return safe, sanitized JSON error responses without stack traces or internal filesystem paths.

---

### Documentation & Architectural Reference

#### [NEW] [ledger-ui.md](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/docs/ledger-ui.md)
- Complete technical documentation detailing:
  1. Ledger Page UI architecture & data flow
  2. Backend API endpoints used (`GET /api/ledger`, `POST /api/ledger`, `GET /api/ledger/:id`, `GET /api/ledger/audit-logs`)
  3. Idempotency Key explanation & user guidance
  4. Formatting standards (`Intl.NumberFormat`, `Intl.DateTimeFormat`)
  5. Loading, Empty, Error, and Duplicate notification states
  6. Multi-tenant isolation verification and backend error sanitization policies

---

### Test Suite & Integration Tests

#### [NEW] [day13LedgerUi.test.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/tests/day13LedgerUi.test.ts)
- Add Day 13 frontend/backend integration test suite verifying:
  1. `GET /api/ledger` returns real tenant-isolated database records
  2. `POST /api/ledger` handles idempotency and returns duplicate flag correctly
  3. Error responses contain sanitized error messages without internal stack traces
  4. Tenant A and Tenant B data isolation remains 100% segregated
  5. Audit logs endpoint functions correctly

#### [MODIFY] [index.ts](file:///C:/Users/sahil/Desktop/Internship%20sem%208/Infotact%20Solutions/LedgerGuard/server/src/tests/index.ts)
- Add `day13LedgerUi.test.ts` to the test runner index.

---

## Verification Plan

### Automated Tests
1. Run `npm test` in `server/`:
   - Executes all 11 test suites sequentially including `day13LedgerUi.test.ts`.
   - Expect 130+ total assertions passing with 0 errors.

2. Run `npm run build` in `server/` (`tsc`).
3. Run `npm run build` in `client/` (`tsc -b && vite build`).

### Manual Verification Matrix
Output the Day 13 Validation Report with actual test results across all 35 manual flow checks specified in the prompt.
