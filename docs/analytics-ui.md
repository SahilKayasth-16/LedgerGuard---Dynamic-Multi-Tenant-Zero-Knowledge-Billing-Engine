# Analytics Frontend UI & Chart.js Architecture (Week 3 Final)

## Page Route
`/dashboard/analytics` (`AnalyticsPage.tsx`)

---

## Component Structure & UI Hierarchy

```text
AnalyticsPage (/dashboard/analytics)
  ├── Header & Range Selector Buttons (7d | 30d | 90d)
  ├── AnalyticsSummary (KPI Metric Cards Grid)
  │     ├── Card 1: Total Expenditure (USD formatted)
  │     ├── Card 2: Total Transactions (Volume count)
  │     ├── Card 3: Successful Transactions (Completed count)
  │     └── Card 4: Failed Transactions (Failed count)
  ├── ExpenditureChart (Chart.js Line Component)
  ├── CostBreakdownCard (CASE B Schema Limitation Banner)
  ├── UsageLimitCard (CASE B Configuration Notice Banner)
  └── Enterprise Security Invariants Footer
```

---

## Technical Features & UX State Handling

1. **Section-Level Loading Skeletons**: Animated pulse loaders display during API fetches, preventing misleading `$0` or empty counts from flashing on screen.
2. **Race Condition Prevention**: `activeRangeRef` tracks current time range selection to ensure out-of-order API responses from rapid toggling (`7d` → `30d` → `90d`) do not overwrite the active UI state.
3. **Session & Logout State Handling**: Auth token cleared on logout. Upon re-logging in as a different tenant, analytics state resets and fetches fresh tenant-scoped data.
4. **Chart.js Integration**: Uses `react-chartjs-2` with registered `CategoryScale`, `LinearScale`, `PointElement`, `LineElement`, `Title`, `Tooltip`, `Legend`, and `Filler`. Renders continuous line plots with custom currency tooltips.

