# LedgerGuard Analytics Dashboard Documentation (Day 26 Polish)

## 1. Overview
The LedgerGuard Analytics Dashboard (`/dashboard/analytics`) provides enterprise tenants with real-time financial and ledger operational insights derived strictly from authentic MongoDB transaction ledgers. Following the Day 26 UI Polish, all obsolete Day 15/16 placeholder UI and mock data were completely eradicated, replacing them with live Chart.js visualizations, real backend KPI summaries, and robust UX state handling.

---

## 2. Analytics Page Architecture

### Component Hierarchy
```text
AnalyticsPage (/dashboard/analytics)
├── Header & Controls
│   ├── Page Title & Subtitle ("Live enterprise analytics across transactions, expenditure, and tenant activity")
│   └── Range Selector Buttons [ 7D | 30D | 90D ]
├── Error Banner (Conditional: Displays API error message and [Retry] action button)
├── KPI Summary Grid (AnalyticsSummary)
│   ├── Card 1: Total Expenditure (USD formatted via Intl.NumberFormat)
│   ├── Card 2: Total Transactions (Numeric volume count)
│   ├── Card 3: Successful Volume (Green status, completed transactions)
│   └── Card 4: Failed Transactions (Red status, failed transactions)
├── Data Visualizations Grid (2 Columns on Desktop, 1 Column on Mobile)
│   ├── Left Column: Expenditure Over Time (ExpenditureChart - Chart.js Line Chart)
│   └── Right Column: Transaction Distribution (TransactionDistributionChart - Chart.js Doughnut Chart)
├── Resource & Limits Section (2 Columns)
│   ├── Left Column: Cost Breakdown (CostBreakdownCard - Schema limitation notice & zero breakdown)
│   └── Right Column: Usage Limits (UsageLimitCard - Unconfigured limits notice & infinite allowance)
└── Enterprise Security Invariants Footer
    └── Real-time Tenant Isolation, Cryptographic Proof, and Multi-Tenant DB Routing Badges
```

### State Management & Lifecycle
- `timeRange`: Active period selection (`'7d' | '30d' | '90d'`). Defaults to `'30d'`.
- `loading`: Global boolean flag indicating an in-flight API synchronization across all 4 analytics endpoints.
- `error`: Nullable string storing network or API failure messages.
- `summary`: State storing `AnalyticsSummaryResponse` (`totalExpenditure`, `totalTransactions`, `successfulTransactions`, `failedTransactions`, `range`, `periodStart`, `periodEnd`).
- `timeseries`: State storing `TimeseriesDataPoint[]` (`date`, `expenditure`, `transactionCount`).
- `breakdown`: State storing `CostBreakdownItem[]` (categories and costs).
- `limits`: State storing `UsageLimitItem[]` (limits, current usage, and percentages).
- `requestIdRef`: Incremental integer ref used to discard out-of-order responses from stale network requests when rapidly switching time ranges.

---

## 3. Real Backend API Integrations

All analytics data is fetched concurrently using `Promise.all` inside `loadAnalytics(range)`:

### A. Summary API (`GET /api/analytics/summary?range={range}`)
- **Controller**: `analyticsController.getSummary`
- **Service**: `analyticsService.getSummaryMetrics(tenantConnection, range)`
- **Aggregation**: Aggregates the tenant's `transactions` collection using `$match` on date range, `$facet` to group totals and compute successful vs failed transaction sums.
- **Contract**:
  ```json
  {
    "success": true,
    "data": {
      "totalExpenditure": 1500.50,
      "totalTransactions": 42,
      "successfulTransactions": 40,
      "failedTransactions": 2,
      "range": "30d",
      "periodStart": "2026-09-04T00:00:00.000Z",
      "periodEnd": "2026-10-04T00:00:00.000Z"
    }
  }
  ```

### B. Timeseries API (`GET /api/analytics/timeseries?range={range}`)
- **Controller**: `analyticsController.getTimeseries`
- **Service**: `analyticsService.getTimeseriesMetrics(tenantConnection, range)`
- **Aggregation**: Groups transactions by `$dateToString: { format: "%Y-%m-%d", date: "$createdAt" }`, sums `$amount` as daily expenditure, and counts daily transactions. Fills missing dates in the range with `$0` expenditure to ensure a continuous daily curve.
- **Contract**:
  ```json
  {
    "success": true,
    "data": [
      { "date": "2026-10-01", "expenditure": 120.00, "transactionCount": 5 },
      { "date": "2026-10-02", "expenditure": 0.00, "transactionCount": 0 }
    ]
  }
  ```

### C. Resource Breakdown API (`GET /api/analytics/breakdown?range={range}`)
- **Controller**: `analyticsController.getBreakdown`
- **Service**: `analyticsService.getCostBreakdown(tenantConnection, range)`
- **Contract & Architecture (CASE B)**:
  Because the core ledger schema stores transactions (`amount`, `status`, `senderId`, `recipientId`) and does not categorize transactions into arbitrary cloud resources (e.g., compute, bandwidth), the backend returns `breakdown: []` and an explicit `limitationNotice` explaining the schema invariant. The UI accurately displays this notice rather than manufacturing fake categories.

### D. Usage Limits API (`GET /api/analytics/limits`)
- **Controller**: `analyticsController.getLimits`
- **Service**: `analyticsService.getUsageLimits(tenantConnection)`
- **Contract & Architecture (CASE B)**:
  Tenants currently do not have preconfigured expenditure quotas in the schema. The backend returns `limits: []` and `unconfiguredNotice`. The UI informs the user that unlimited quota is currently active.

---

## 4. Chart.js Implementations

### A. Expenditure Over Time (`ExpenditureChart.tsx`)
- **Chart Type**: Chart.js Line Chart (`react-chartjs-2`).
- **Registered Modules**: `CategoryScale`, `LinearScale`, `PointElement`, `LineElement`, `Title`, `Tooltip`, `Legend`, `Filler`.
- **Styling**:
  - Border color: Primary indigo `#4f46e5` (2.5px width).
  - Background: Gradient area fill with subtle alpha (`rgba(79, 70, 229, 0.1)`).
  - Points: Radius 3 with hover radius 6.
  - Scales: Clean gridlines, Y-axis ticks formatted with `$`.
- **Empty State**: When `timeseries` array is empty or contains all zeros, renders a clean slate message indicating no transaction history exists for the selected window.

### B. Transaction Distribution by Status (`TransactionDistributionChart.tsx`)
- **Chart Type**: Chart.js Doughnut Chart (`react-chartjs-2`).
- **Registered Modules**: `ArcElement`, `Tooltip`, `Legend`.
- **Data Source**: Derived directly from real backend summary metrics (`summary.successfulTransactions` and `summary.failedTransactions`).
- **Styling**:
  - Emerald green (`#10b981`) for Completed / Successful transactions.
  - Rose red (`#ef4444`) for Failed transactions.
  - Cutout: 70% donut styling with clean legends and percentage calculation in tooltips.
- **Zero State**: Displays a clean empty status message when total transaction volume is 0.

---

## 5. UX & State Handling

### Supported Ranges
The backend strictly allows only:
- `7d` (7 calendar days)
- `30d` (30 calendar days)
- `90d` (90 calendar days)

Passing an unsupported range (such as `custom` or `1y`) triggers HTTP 400 (`Invalid range parameter`). The UI range selector buttons strictly support only these 3 validated values.

### Loading States
- When `loading === true`, the UI displays animated skeleton pulse placeholders matching the exact card and chart dimensions.
- Eliminates jarring layout shifts (CLS) and avoids flickering `$0` numbers before live data resolves.

### Race Condition Prevention
- Stored `requestIdRef.current` increments on every invocation of `loadAnalytics`.
- When an asynchronous request resolves, the response is discarded if `currentRequestId !== requestIdRef.current`.
- Guarantees that if a user clicks `7d` followed immediately by `90d`, the slower `7d` response will never overwrite the `90d` state.

### Error Handling
- Network or HTTP errors populate the `error` state.
- A prominent red alert banner displays the exact error message alongside a "[Try Again]" button to retry data synchronization.

---

## 6. Enterprise Security & Multi-Tenancy

1. **RS256 JWT Authentication**:
   All `/api/analytics/*` endpoints require a verified RSA-256 JWT in the `Authorization: Bearer <token>` header. Missing or invalid tokens result in HTTP 401 Unauthorized.
2. **Strict Tenant Context**:
   Tenant identity is extracted exclusively from the cryptographically verified JWT payload (`req.user.tenantId`).
3. **Database Isolation**:
   `TenantConnectionManager` resolves the tenant ID to its dedicated MongoDB database (e.g., `ledger_tenant-company-a`). Queries cannot bleed across tenants.
4. **Parameter Override Immunity**:
   Passing query parameters such as `?tenantId=tenant-company-b` is completely ignored by the analytics controller and services. Queries remain hard-locked to the authenticated JWT tenant.
5. **Traceability**:
   Every request propagates an `x-request-id` header across the middleware stack, logging the entire lifecycle from entry to database aggregation.

---

## 7. Known Limitations
1. **Schema Scope (CASE B)**: Transaction category metadata is not defined in the current Ledger document schema. The Resource Breakdown card displays an informational limitation notice rather than synthetic categories.
2. **Fixed Time Windows**: Only `7d`, `30d`, and `90d` ranges are supported by backend daily bucketing pipelines; arbitrary date ranges are not supported.
3. **Usage Limits**: Quota policies are not yet configured in tenant settings; usage limits reflect unconfigured status.
