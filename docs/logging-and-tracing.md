# LedgerGuard End-to-End Trace Logging & Observability Architecture

## 1. Overview & Objectives

Day 23 introduces structured, security-safe, end-to-end request trace logging to LedgerGuard. A single backend request can now be tracked and correlated across its complete lifecycle:

```
Request (X-Trace-Id Header)
   │
   ▼
[Trace Middleware] (Attaches / Validates req.traceId, Starts Monotonic Timer)
   │
   ▼
[Authentication Middleware] (Logs RS256 JWT Identity Verification with traceId)
   │
   ▼
[Tenant Resolution Middleware] (Logs Tenant Identity Resolution with traceId)
   │
   ▼
[Tenant DB Connection Pool] (Logs Database Pool Allocation with traceId)
   │
   ▼
[Ledger / Analytics Operation] (Logs Controller Execution & DB Operations with traceId)
   │
   ▼
[Response Pipeline] (Injects X-Trace-Id & Access-Control-Expose-Headers, Logs Duration)
```

---

## 2. Correlation Strategy & Request Propagation

1. **Header Identification**:
   - The backend checks for an incoming `X-Trace-Id` header.
   - If a valid `X-Trace-Id` header is supplied, it is preserved.
   - If missing, empty, or invalid, a unique correlation ID is generated with format: `tr-<timestamp>-<randomSuffix>`.
2. **Response Propagation**:
   - Every API response includes `X-Trace-Id: <traceId>`.
   - `Access-Control-Expose-Headers: X-Trace-Id` is included so browser clients (React/Vite) can inspect trace IDs.
   - JSON error and success bodies include a top-level `"traceId"` property.
3. **Monotonic Timing**:
   - Request duration is computed using high-resolution monotonic time (`process.hrtime.bigint()`).
   - Recorded in milliseconds (`durationMs`) on response `finish`.

---

## 3. Security & Safety Invariants

### 🛑 Strictly Forbidden Data (Never Logged)
- **JWT Tokens & Bearer Headers**: Logged as `[REDACTED]`.
- **RSA Private Keys & Passwords**: Logged as `[REDACTED]`.
- **MongoDB Connection Strings / Credentials**: Logged as `[REDACTED]`.
- **Redis Passwords / Connection URIs**: Logged as `[REDACTED]`.

### 🛡️ Log Injection & Header Splitting Protection
- Incoming trace IDs are strictly validated using regex: `/^[a-zA-Z0-9_-]+$/` with max length 64 chars.
- Values containing carriage return (`\r`) or newline (`\n`) characters are stripped and sanitized to prevent log forging or header splitting.
- Any invalid incoming trace ID triggers a warning log and is replaced with a newly generated safe trace ID.

---

## 4. Log Format & Schema

All log output uses structured JSON:

```json
{
  "timestamp": "2026-10-02T07:40:54.675Z",
  "level": "INFO",
  "message": "[LEDGER CREATION START] Processing event request",
  "traceId": "tr-1790926853948-otp49gi",
  "tenantId": "tenant-company-a",
  "eventId": "evt-trace-101",
  "type": "debit",
  "amount": 150,
  "currency": "USD"
}
```

---

## 5. End-to-End Tracing Example Log Output

```json
{"timestamp":"2026-10-02T07:40:55.023Z","level":"INFO","message":"[REQUEST START] GET /api/analytics/summary","traceId":"tr-1790926855023-j1zm1ol","method":"GET","path":"/api/analytics/summary","ip":"127.0.0.1"}
{"timestamp":"2026-10-02T07:40:55.025Z","level":"INFO","message":"[AUTH SUCCESS] JWT identity verified","traceId":"tr-1790926855023-j1zm1ol","userId":"user-trace-a","tenantId":"tenant-company-a","role":"ADMIN"}
{"timestamp":"2026-10-02T07:40:55.025Z","level":"INFO","message":"[TENANT RESOLUTION SUCCESS] Tenant context attached","traceId":"tr-1790926855023-j1zm1ol","tenantId":"tenant-company-a","tenantName":"Company A Corp","status":"active"}
{"timestamp":"2026-10-02T07:40:55.026Z","level":"INFO","message":"[TENANT DB CONNECTED] Database connection pool acquired","traceId":"tr-1790926855023-j1zm1ol","tenantId":"tenant-company-a","dbName":"ledgerguard_tenant_company_a"}
{"timestamp":"2026-10-02T07:40:55.073Z","level":"INFO","message":"[ANALYTICS SUMMARY SUCCESS]","traceId":"tr-1790926855023-j1zm1ol","tenantId":"tenant-company-a","range":"30d"}
{"timestamp":"2026-10-02T07:40:55.074Z","level":"INFO","message":"[REQUEST END] GET /summary 200","traceId":"tr-1790926855023-j1zm1ol","tenantId":"tenant-company-a","userId":"user-trace-a","method":"GET","path":"/summary","statusCode":200,"durationMs":50.98}
```
