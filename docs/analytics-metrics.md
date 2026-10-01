# Analytics Domain & Metrics Specification (Week 3 Final)

## Overview
This document specifies the authoritative business rules, domain boundaries, and metric definitions for LedgerGuard's Week 3 Analytics Engine.

---

## Metric Definitions & Business Rules

### 1. Total Expenditure
- **Definition**: The total monetary value spent by the authenticated tenant within the selected date range.
- **Aggregation Logic**:
  - Filter: `tenantId === authenticatedTenantId` AND `createdAt >= startDate`
  - Sum Condition: `type === 'debit'` AND `status === 'completed'`
  - **Exclusions**:
    - Failed debits (`status: 'failed'`) are **EXCLUDED** from expenditure.
    - Credits (`type: 'credit'`) are **EXCLUDED** from debit expenditure.
    - Entries outside the specified date boundary are **EXCLUDED**.

### 2. Total Transactions
- **Definition**: Total count of processed ledger entries (volume) recorded for the authenticated tenant within the date range, regardless of type or status.

### 3. Successful Transactions
- **Definition**: Total count of ledger entries committed with `status: 'completed'`.

### 4. Failed Transactions
- **Definition**: Total count of ledger entries aborted or recorded with `status: 'failed'`.

### 5. Expenditure Trend (Time-Series)
- **Definition**: Daily aggregation of completed debit expenditure formatted as `YYYY-MM-DD` (UTC).
- **Zero-Filling Rule**: Dates within the selected range (`7d`, `30d`, `90d`) containing zero transactions are populated with `{ amount: 0, count: 0 }` to ensure continuous line chart visualization in Chart.js.

---

## Domain & Schema Boundaries (CASE B Limitations)

### 1. Resource Category Cost Breakdown
- **Status**: `UNAVAILABLE` (`available: false`)
- **Rationale**: The core `LedgerEntry` schema does not store `category` or `resourceType` fields. LedgerGuard returns an explicit unavailable status notice rather than fabricating mock category distributions.

### 2. Usage & Spending Limits
- **Status**: `NOT CONFIGURED` (`configured: false`)
- **Rationale**: Tenant configuration models do not store custom monthly spending cap fields. LedgerGuard returns an explicit unconfigured status notice rather than inventing fake limit percentages.
