# LedgerGuard — Ledger Domain Model Specification

## 1. What is a Billing Event?
A **billing event** represents a business transaction or operation that results in a financial movement within a tenant's account (e.g., subscription charges, usage consumption, credit adjustments, refunds, or manual invoices). Each billing event is identified by a client-supplied business identifier called `eventId`.

---

## 2. Core Domain Fields

### `eventId`
- **Definition**: The business event identifier supplied by the client or external service (e.g., `inv_1002`, `usage_pkg_409`, `sub_ren_883`).
- **Required**: Yes.
- **Purpose**: Uniquely identifies the real-world business event being recorded.
- **Idempotency Note**: In Day 8, `eventId` is recorded as a standard string field. In **Day 9**, `eventId` will become the foundation for tenant-aware idempotency and duplicate event prevention.

### `tenantId`
- **Definition**: The tenant organization that owns the ledger entry.
- **Security Invariant**: `tenantId` is strictly derived from the verified RS256 JWT context (`req.user.tenantId`). It is **never** trusted from client inputs (body, query parameters, URL path parameters, or custom HTTP headers).
- **Isolation**: Stored strictly within the database instance assigned to the tenant via `TenantConnectionManager`.

### `type`
- **Definition**: The direction of the financial operation.
- **Allowed Values**:
  - `debit`: An amount charged/deducted from the tenant's account balance.
  - `credit`: An amount credited/added to the tenant's account balance.

### `amount`
- **Definition**: The monetary value of the ledger entry.
- **Validation Rules**: Must be a positive, finite number (`amount > 0`). Zero, negative values, `NaN`, and `Infinity` are strictly rejected.
- **Precision Note**: For production financial systems, integer minor units (e.g., cents/paise) or `Decimal128` should be considered to eliminate floating-point rounding issues.

### `currency`
- **Definition**: ISO 4217 3-character uppercase currency code (e.g., `INR`, `USD`, `EUR`).
- **Validation Rules**: Required, string, normalized to uppercase, validated against a 3-letter alphabetic format.

### `description`
- **Definition**: Optional human-readable description of the billing event (e.g., `"Monthly subscription charge - Pro Plan"`).
- **Validation Rules**: Optional, trimmed string, max 500 characters.

### `status`
- **Definition**: The processing lifecycle status of the ledger record.
- **Allowed Values**:
  - `pending`: The event has been recorded but processing is in-flight (Default).
  - `completed`: The operation has successfully executed.
  - `failed`: The operation encountered a processing failure.
- **Control**: Status is strictly server-managed. Clients cannot dictate arbitrary status values upon entry creation.

### `metadata`
- **Definition**: Optional key-value object containing contextual key information (e.g., `invoiceId`, `planId`, `source`).
- **Validation Rules**: Optional JSON-compatible object.

### `createdAt` / `updatedAt`
- **Definition**: Server-managed Mongoose timestamps.
- **Control**: Client-supplied timestamps are ignored. System clock is authoritative.

---

## 3. Future Requirements Notice (Day 9)
> **Day 9 Idempotency Requirement**: The final uniqueness strategy for `eventId` will be implemented during Day 9 and will enforce tenant-aware uniqueness (`tenantId` + `eventId`) across concurrent incoming transactions.

