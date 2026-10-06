# LedgerGuard — Dynamic Multi-Tenant Billing Engine

LedgerGuard is an enterprise multi-tenant billing engine designed with strong database-per-tenant isolation, distributed idempotency controls via Redis mutexes, atomic double-entry bookkeeping with MongoDB ACID multi-document transactions, RS256 asymmetric JWT authentication, and real-time Chart.js usage analytics.

---

## 1. Project Purpose & Scope

Modern SaaS platforms require rigorous isolation and guaranteed idempotency for financial billing events. LedgerGuard provides:
- **Strict Database-Level Isolation:** Dedicated physical MongoDB databases per tenant organization (`ledgerguard_tenant_company_a`, `ledgerguard_tenant_company_b`) to prevent cross-tenant data bleed.
- **Distributed Concurrency & Idempotency:** Distributed Redis locking (`SET NX PX`) combined with compound unique indexes (`{ tenantId: 1, eventId: 1 }`) to eliminate duplicate charges under concurrent network retries.
- **Transactional Consistency:** Multi-document MongoDB ACID transactions executing atomic creation of ledger entries and audit trails.
- **Asymmetric Security:** RSA-2048 signing (`RS256`) ensuring tenant claims cannot be forged, manipulated, or bypassed via headers, query parameters, or request bodies.
- **Real-Time Operational Analytics:** Real-time Chart.js line and doughnut visualizations aggregating live ledger collections without fabricated mock data.

> **Note on Architecture:** LedgerGuard is an enterprise multi-tenant billing engine enforcing strict database-level separation and cryptographic token verification. It does not utilize cryptographic zero-knowledge proofs (ZKP); application data is processed in plaintext by tenant-authorized services.

---

## 2. Tech Stack

- **Backend:** Node.js (v20+), Express 4.x, TypeScript 5.x
- **Databases:** MongoDB Atlas, Mongoose 8.x (Dynamic connection pooling via `TenantConnectionManager`)
- **Distributed Locks & Caching:** Redis (Redis v7+ / `@redis/client`), in-memory fallback for isolated testing
- **Authentication:** Asymmetric RSA-2048 JWT (`RS256`), crypto keypair management
- **Frontend:** React 18, Vite 5/6, TypeScript, Tailwind CSS, Chart.js (`react-chartjs-2`)
- **Observability:** End-to-end request trace logging (`x-trace-id`) with sensitive credential sanitization

---

## 3. Architecture & Request Pipeline

```text
Client Browser / External API
       │
       ▼
 [HTTP Request] ── (x-trace-id assigned or propagated)
       │
       ▼
 [authenticate] ── (Verify RS256 JWT signature & claims)
       │
       ▼
 [resolveTenant] ── (Enforce tenantId from JWT; reject overrides)
       │
       ▼
 [attachTenantDatabase] ── (TenantConnectionManager routes to dedicated DB)
       │
       ▼
 [Redis Distributed Lock] ── (Acquire mutex: ledger:lock:{tenantId}:{eventId})
       │
       ▼
 [Idempotency Pre-Check] ── (Search existing (tenantId, eventId))
       │
       ▼
 [MongoDB ACID Transaction] ── (Atomically commit LedgerEntry + LedgerAuditLog)
       │
       ▼
 [Redis Lock Release] ── (Atomic Lua script release in finally block)
       │
       ▼
 [HTTP Response] ── (Return 201 Created or 200 OK duplicate status)
```

---

## 4. Multi-Tenant Architecture & Data Isolation

Tenant isolation is guaranteed by design:
1. **Source of Truth:** Tenant identity is extracted solely from the cryptographically verified JWT (`req.user.tenantId`). Any client attempts to supply `?tenantId=...` or `{ "tenantId": "..." }` are completely ignored.
2. **Dedicated Databases:** `TenantConnectionManager` maintains isolated Mongoose connection instances:
   - `tenant-company-a` $\rightarrow$ `ledgerguard_tenant_company_a`
   - `tenant-company-b` $\rightarrow$ `ledgerguard_tenant_company_b`
3. **Resilience:** If one tenant's database connection experiences latency or failure, other tenant partitions remain 100% operational.

---

## 5. Security & Cryptography (RS256)

- **Key Generation:** Managed via `server/src/utils/generateKeys.ts`. Generates a 2048-bit RSA keypair in `server/keys/private.pem` (mode 0600) and `public.pem` (mode 0644).
- **Git Safety:** Private and public key files are explicitly excluded via `.gitignore` and are never committed to version control.
- **Algorithm Lockdown:** The verification middleware explicitly enforces `algorithms: ['RS256']`, rejecting HS256, `none`, or altered signatures with HTTP 401 Unauthorized.
- **Error & Log Hygiene:** Production error responses and structured logger outputs mask and redact database URIs, passwords, private keys, and tokens.

---

## 6. Running Locally

### Prerequisites
- Node.js (v20+ recommended)
- npm (v10+)
- MongoDB Atlas cluster URI or local MongoDB instance
- Redis server running on `localhost:6379` (or automated in-memory fallback during test runs)

### Environment Configuration
1. Copy example configuration:
   ```bash
   cp server/.env.example server/.env
   ```
2. Populate `server/.env`:
   ```ini
   PORT=5040
   NODE_ENV=development
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/LedgerGuard
   REDIS_URL=redis://localhost:6379
   REDIS_LOCK_TTL_MS=10000
   ```
   *(Note: The database name in `MONGODB_URI` acts as the base cluster target; tenant database routing dynamically targets tenant-specific databases).*

### Installing Dependencies
```bash
# Root and server dependencies
cd server
npm install

# Client dependencies
cd ../client
npm install
```

### Running in Development
```bash
# In terminal 1 (Backend):
cd server
npm run dev

# In terminal 2 (Frontend):
cd client
npm run dev
```
The frontend is available at `http://localhost:5173`, and the backend API runs at `http://localhost:5040/api`.

---

## 7. Testing & Build Commands

### Running Production Builds
```bash
# Backend TypeScript build
cd server
npm run build

# Frontend Vite production build
cd ../client
npm run build
```

### Running Test Suites
The server includes 23 automated test suites covering security, isolation, idempotency, distributed locking, stress testing, trace logging, analytics, and full end-to-end integration:
```bash
cd server
npm test
```

---

## 8. Current Project Status & Known Limitations

- **Week 1–4 Status:** Feature-complete and fully verified through Day 28 release gate.
- **Self-Service Registration:** Tenant organizations are pre-provisioned enterprise partitions configured in `tenantConfig.ts`. Self-service signup is outside the current architecture scope.
- **Analytics Bucketing:** Timeseries aggregations strictly support `7d`, `30d`, and `90d` continuous calendar windows. Arbitrary date intervals return HTTP 400.
- **Resource Categorization:** Ledger transactions record monetary debits/credits without infrastructure resource tagging (compute/storage), reflected accurately in the Case B schema notice.
