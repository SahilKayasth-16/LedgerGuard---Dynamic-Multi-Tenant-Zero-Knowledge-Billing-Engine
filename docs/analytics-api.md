# Analytics API Documentation (Week 3 Final)

## Base URL
`/api/analytics`

## Authentication & Tenant Isolation
All endpoints are protected by the middleware chain:
`[authenticate, resolveTenant, attachTenantDatabase]`

- **Authentication**: Requires HTTP Header `Authorization: Bearer <RS256_JWT_TOKEN>`.
- **Tenant Security Invariant**: Tenant identity is resolved strictly from verified JWT claims (`req.user.tenantId`). Client attempts to override `tenantId` via query strings or request bodies are strictly ignored.

---

## Endpoints Specification

### 1. `GET /api/analytics/summary`
- **Description**: Returns total expenditure, volume, successful, and failed transaction counts for the authenticated tenant.
- **Query Parameters**:
  - `range`: Optional. Supported values: `7d`, `30d`, `90d` (Default: `30d`).
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "totalExpenditure": 600.00,
    "totalTransactions": 4,
    "successfulTransactions": 3,
    "failedTransactions": 1,
    "currency": "USD",
    "range": "30d"
  }
}
```
- **Response `400 Bad Request`**: Returned when `range` is invalid (e.g. `abc`, `-1`, `365d`).
```json
{
  "success": false,
  "message": "Invalid range parameter. Must be one of: 7d, 30d, 90d"
}
```

### 2. `GET /api/analytics/timeseries`
- **Description**: Returns continuous daily aggregated expenditure and transaction count points over the requested time range.
- **Query Parameters**:
  - `range`: Optional (`7d`, `30d`, `90d`, Default: `30d`).
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "timeseries": [
      { "date": "2026-09-01", "amount": 100.00, "count": 1 },
      { "date": "2026-09-02", "amount": 0.00, "count": 0 }
    ],
    "range": "30d"
  }
}
```

### 3. `GET /api/analytics/breakdown`
- **Description**: Category cost breakdown (CASE B schema limitation).
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "available": false,
    "data": [],
    "message": "Resource/category cost breakdown is unavailable because 'category' is not defined on the LedgerEntry schema.",
    "range": "30d"
  }
}
```

### 4. `GET /api/analytics/limits`
- **Description**: Usage limits configuration (CASE B tenant configuration limitation).
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "configured": false,
    "data": [],
    "message": "Usage limits are not configured for this tenant.",
    "range": "30d"
  }
}
```

