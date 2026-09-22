# Billing Ledger UI Architecture & Data Flow (`/dashboard/ledger`)

## Overview

The **Billing Ledger UI** (`/dashboard/ledger`) serves as the primary financial interface for authenticated tenants in **LedgerGuard**.
It presents real, tenant-isolated transaction records fetched directly from the backend API (`GET /api/ledger`).

> **Core Invariant**: The Billing Ledger UI is a direct representation of the backend's tenant-isolated ledger state. No mock data, hardcoded rows, or fabricated transactions exist in the production interface.

---

## Technical Data Flow

```text
Authenticated Tenant User
            │
            ▼
   Open /dashboard/ledger
            │
            ▼
    GET /api/ledger (Authorization: Bearer <jwt>)
            │
            ▼
   JWT RS256 Verification & Tenant Connection Resolution
            │
            ▼
   Tenant-isolated MongoDB Collection (`LedgerEntry`)
            │
            ▼
   Response (200 OK) -> Formatted Transaction Table
```

---

## Key Interface Capabilities

### 1. Formatted Transaction Table
The transaction table renders real backend ledger records with strict formatting rules:

| Column | Description | Formatting Standard |
| :--- | :--- | :--- |
| **Event ID** | Idempotency Key | Rendered in monospace font (`eventId`). |
| **Type** | Operation Type | Styled badge (`DEBIT` in soft red, `CREDIT` in soft green). |
| **Amount** | Financial Value | Formatted via `Intl.NumberFormat` by currency (e.g. `INR` -> `₹500.00`, `USD` -> `$500.00`, `EUR` -> `€500.00`). |
| **Status** | Transaction Lifecycle | Rendered in accessible text (`Completed`, `Pending`, `Failed`, `Processing`) with semantic badge styling. |
| **Description** | Event Description | Optional text or fallback dash (`—`). |
| **Date** | Timestamp | Formatted via `Intl.DateTimeFormat` (e.g. `21 Sep 2026, 4:00 PM`). |
| **Action** | Detail Inspector | Clickable row / button opening the **Transaction Details Modal**. |

---

### 2. Idempotency Key Guidance
When submitting new billing events through the creation form:
- The input is explicitly labeled **Event ID (Idempotency Key)**.
- Form guidance clarifies: *"Unique key used to prevent duplicate billing processing on retries."*

---

### 3. State Management & Lifecycle

- **Loading State**: Displays clean placeholder message while fetching (`"Fetching tenant ledger records from MongoDB..."`).
- **Empty State**: Displays an intentional empty state (`"No Transactions Found"`) with a button to create the tenant's first transaction.
- **Error State**: Displays safe user-facing error message with an interactive **[Retry Loading Records]** button.
- **Duplicate Notification**: Displays `"This event has already been processed. No duplicate transaction was created."` when duplicate event IDs are resubmitted.
- **Processing State**: Submitting button changes to `"Processing..."` and disables double submission while the backend acquires Redis lock and executes MongoDB ACID transaction.

---

### 4. Transaction Details Modal
Clicking any transaction row opens a detailed inspector displaying:
- Event ID (Idempotency Key)
- Authoritative Tenant ID
- Operation Type & Formatted Amount
- Transaction Status
- Description & Full Timestamps
- Raw Metadata Object (JSON formatted)

---

## Multi-Tenant Security & Error Sanitization

1. **Strict Tenant Segregation**: Records are fetched exclusively using the verified `req.user.tenantId` extracted from the RS256 JWT header. Client-supplied `tenantId` override attempts are completely ignored.
2. **Sanitized Error Responses**: Raw database errors, Mongo connection strings, and stack traces are suppressed server-side. The UI receives safe error codes (`VALIDATION_ERROR`, `EVENT_PROCESSING`, `REDIS_UNAVAILABLE`, `SERVER_ERROR`).

