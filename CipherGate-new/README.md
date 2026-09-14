# CipherGate

### Zero-Trust API Security Gateway for Cryptographic Request Integrity and Replay Attack Protection

## Overview

CipherGate is a security gateway that sits between an API client and a backend
API. Every request must pass through it before reaching the backend. It
verifies API authentication, HMAC-SHA256 request integrity, timestamp
freshness, nonce-based replay protection, and per-key rate limits — and only
forwards a request to the backend once every check has genuinely passed.

```
Client → CipherGate → Security Verification → Backend API
```

This is a real, runnable prototype: the cryptography, replay detection, and
rate limiting are implemented against actual HTTP requests and a real
database. Nothing is simulated with buttons that fake a result.

## Problem Statement

Most student/demo APIs trust a request the moment authentication succeeds.
That leaves two gaps even a valid API key doesn't close:

1. **Integrity** — an attacker (or a compromised proxy) can alter a request's
   body in flight without the API ever knowing the payload changed.
2. **Replay** — a captured, perfectly valid request can be resent later to
   repeat an action (e.g. a payment) that should only happen once.

CipherGate closes both gaps in front of the backend, so the backend itself
never has to trust the network.

## Objectives

- Verify *who* is calling (API key + optional JWT) separately from
  *whether the exact request was tampered with* (HMAC).
- Reject requests whose signed timestamp has expired.
- Detect and block replayed requests using a persisted nonce store.
- Rate-limit each client independently.
- Make every decision, and every dashboard statistic, traceable to a real
  HTTP request in the audit log.

## Features

- API Key + HMAC-secret issuance per registered application
- HMAC-SHA256 canonical-request signing and server-side verification
  (`hmac.compare_digest`, no hand-rolled crypto)
- Configurable timestamp replay window (default 30s)
- Persisted nonce store for real replay-attack detection
- Per-application in-memory sliding-window rate limiting (default 20/min)
- JWT login flow, kept separate from HMAC integrity on purpose
- Central Security Decision Engine used by every gated endpoint
- Demo backend endpoint (`/api/payment`) only reachable through the gateway
- React API Request Editor: generate timestamp/nonce/HMAC, tamper with the
  body, resend with the same nonce, or fire a 25-request burst — all real
  HTTP calls
- Security dashboard and full audit log, both backed entirely by the
  `security_events` table

## Architecture

```
                    CLIENT
                       |
                       v
              API REQUEST EDITOR
                       |
                       v
              ┌─────────────────┐
              │   CIPHERGATE    │
              │ Security Gateway│
              └────────┬────────┘
                       |
        ┌──────────────┼──────────────┐
        v              v              v
 Authentication      HMAC        Timestamp
        v              v              v
      Nonce        Rate Limit    Replay Check
        └──────────────┼──────────────┘
                       v
                DECISION ENGINE
                  /          \
              ALLOW          BLOCK
                |              |
                v              v
           BACKEND API     AUDIT LOG
                |
                v
             RESPONSE
```

## Security Mechanisms

| Mechanism | Where | Detail |
|---|---|---|
| API Key auth | `backend/auth/credentials.py` | `secrets.token_urlsafe` issued key, looked up per request |
| HMAC-SHA256 integrity | `backend/crypto/hmac_utils.py` | Canonical request: `METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY`, compared with `hmac.compare_digest` |
| Timestamp validation | `backend/gateway/decision_engine.py` | Rejects if `|now - timestamp| > REPLAY_WINDOW_SECONDS` |
| Nonce / replay protection | `backend/replay/nonce_store.py` | Persisted per-client nonce table; a reused nonce inside the window is blocked |
| Rate limiting | `backend/rate_limit/limiter.py` | In-memory sliding window, per application |
| JWT | `backend/auth/jwt_utils.py` | Separate authentication demo (`/auth/login`, `/auth/verify`) |
| Decision engine | `backend/gateway/decision_engine.py` | Single function every gated route calls; returns which check failed, if any |

## Demo Workflow

1. **Applications** page → register a demo application → copy the API key
   and HMAC secret into the **Request Editor**.
2. **Valid request** — Generate Timestamp, Generate Nonce, Generate HMAC,
   then Send Request → `200 OK`, all five checks green.
3. **Tampering demo** — edit the JSON body (e.g. `amount: 500 → 5000`)
   *without* regenerating the HMAC, then Send Request → `403
   HMAC_VERIFICATION_FAILED`.
4. **Replay demo** — click "Send Again (same nonce)" on a request that
   already succeeded → `409 REPLAY_ATTACK`.
5. **Rate limit demo** — click "Send 25 Requests" → the first ~20 return
   `200`, the rest return `429 RATE_LIMIT_EXCEEDED`.
6. Check the **Dashboard** and **Security Events** pages — every number and
   row reflects the requests you just sent.

## Technology Stack

- **Backend**: Python, FastAPI, SQLAlchemy, SQLite
- **Security**: `hmac`, `hashlib`, `secrets`, PyJWT, bcrypt
- **Frontend**: React 18, Vite, plain CSS (design tokens), Web Crypto API
  for client-side HMAC signing
- **Testing**: pytest, FastAPI `TestClient`, httpx

## Installation

### Backend

```bash
cd CipherGate
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # edit JWT_SECRET etc. as needed
```

### Frontend

```bash
cd CipherGate/frontend
npm install
cp .env.example .env             # set VITE_API_BASE_URL if not localhost:8000
```

## Configuration

Backend `.env` (see `.env.example`):

```
DATABASE_URL=sqlite:///./ciphergate.db
JWT_SECRET=replace_with_secure_secret
JWT_EXPIRE_MINUTES=30
DEFAULT_RATE_LIMIT=20
RATE_LIMIT_WINDOW_SECONDS=60
REPLAY_WINDOW_SECONDS=30
```

Frontend `frontend/.env`:

```
VITE_API_BASE_URL=http://localhost:8000
```

## Project Structure

```
CipherGate/
├── backend/
│   ├── main.py              # FastAPI app + routes
│   ├── config.py            # env-driven settings
│   ├── database.py          # SQLAlchemy models (Application, SecurityEvent, UsedNonce)
│   ├── auth/                # API key issuance, password hashing, JWT
│   ├── crypto/               # HMAC-SHA256 canonical request + signing
│   ├── replay/               # nonce store / replay detection
│   ├── rate_limit/           # in-memory sliding-window limiter
│   ├── gateway/               # the Security Decision Engine
│   ├── audit/                 # security_events logger
│   └── api/                    # demo backend (/api/payment)
├── frontend/
│   └── src/
│       ├── components/       # SecurityPipeline, Layout, shared UI
│       ├── pages/            # Dashboard, RequestEditor, Applications, SecurityEvents, Settings
│       └── services/         # api.js (fetch), crypto.js (Web Crypto HMAC)
├── tests/
│   ├── conftest.py
│   └── test_gateway.py       # 14 end-to-end tests against the real pipeline
├── .env.example
├── .gitignore
├── requirements.txt
└── README.md
```

## Running the Project

### 1. Start the backend

```bash
cd CipherGate/backend
source ../.venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend runs at `http://localhost:8000`. Interactive API docs at
`http://localhost:8000/docs`.

### 2. Start the frontend

```bash
cd CipherGate/frontend
npm run dev
```

Frontend runs at `http://localhost:5173`.

## API Documentation

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness check |
| POST | `/auth/register` | Create a demo application → returns API key + HMAC secret (shown once) |
| POST | `/auth/login` | Exchange application ID + password for a JWT |
| GET | `/auth/verify` | Validate a JWT (Bearer token) |
| GET | `/applications` | List registered applications (secrets never re-exposed) |
| POST | `/gateway/request` | Generic gated pass-through, used by the Request Editor |
| POST | `/api/payment` | Demo backend endpoint, gated by the full pipeline |
| GET | `/audit/logs?limit=N` | Recent security events |
| GET | `/dashboard/stats` | Aggregate counters for the dashboard |

**Required headers for gated requests:** `X-API-Key`, `X-Timestamp`,
`X-Nonce`, `X-Signature`.

**Error response shape:**

```json
{
  "success": false,
  "error": "HMAC_VERIFICATION_FAILED",
  "message": "Request integrity verification failed",
  "security_check": "hmac",
  "decision": { "allowed": false, "checks": { "...": "..." } }
}
```

## Testing

```bash
cd CipherGate
source .venv/bin/activate
PYTHONPATH=backend:tests pytest tests/ -v
```

14 tests cover: valid request, invalid API key, invalid JWT, valid JWT,
valid HMAC, modified body (tampering), invalid HMAC signature, expired
timestamp, reused nonce (replay), rate limit exceeded, valid request
reaching the backend, invalid request not reaching the backend, audit
logging, and dashboard stats.

## Future Enhancements

- Swap the in-memory rate limiter for Redis to support multiple gateway
  instances
- Add mutual TLS between CipherGate and the backend
- Support key rotation and per-application scoped permissions
- Add a scheduled job to purge expired nonces instead of relying on the
  TTL filter at read time

---

## CipherShop Demo

CipherShop is a controlled sample e-commerce client application that sits in
front of CipherGate. It demonstrates how a real-world third-party application
communicates with CipherGate and how CipherGate's security pipeline protects
every API request.

### Purpose

CipherShop is **not** another security gateway. It is a sample **client
application** — a small storefront where users can select a product, trigger a
payment, and watch the entire CipherGate security pipeline execute in real time.

### Updated Architecture

```
             CIPHERSHOP
          Sample Client App
                 |
                 | HMAC-signed REST request
                 v
          ┌──────────────┐
          │  CIPHERGATE  │
          │              │
          │ API Key      │
          │ HMAC-SHA256  │
          │ Timestamp    │
          │ Nonce/Replay │
          │ Rate Limit   │
          └──────┬───────┘
                 |
            Decision Engine
             /           \
          ALLOW          BLOCK
            |              |
            v              v
       Demo Backend     Audit Log
            |
            v
         Response
```

### How CipherShop Communicates with CipherGate

1. On first load, CipherShop calls `/auth/register` to obtain an API key and
   HMAC secret for a "CipherShop Demo" application. The secret is stored in
   `localStorage` (client-side only, consistent with the existing Request
   Editor workflow).
2. When the user clicks **PAY NOW**, the frontend:
   - Generates a timestamp and nonce using `crypto.js` (the shared signing
     utility).
   - Computes an HMAC-SHA256 signature over the canonical request using the
     Web Crypto API.
   - Posts the signed request directly to `/api/payment` on the CipherGate
     backend.
3. CipherGate runs the full 5-stage security pipeline. The response includes a
   `decision` object with per-check results.
4. CipherShop displays the result, including a live security pipeline
   visualization.
5. Every request is automatically recorded in the `security_events` table and
   visible in the existing **Dashboard** and **Security Events** pages.

### Running the CipherShop Demo

No extra setup is required. CipherShop is part of the main application.

**Start the backend and frontend as usual:**

```bash
# Backend (from CipherGate-new/)
.venv\Scripts\activate       # Windows
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# Frontend (from CipherGate-new/frontend/)
npm run dev
```

Then navigate to `http://localhost:5173` and click **🛒 CipherShop** in the
sidebar.

### Five Demo Scenarios

#### DEMO 1 — Normal Payment Flow
1. Open **CipherShop** from the sidebar.
2. Select any product (e.g. Wireless Headphones — ₹5,000).
3. Click **PAY NOW**.
4. Expected: `HTTP 200` — Payment Successful. All five checks show ✓.
5. Open **Dashboard** → observe the "Allowed" counter increment.

> *"The request was authenticated, cryptographically verified, checked for
> freshness and replay, rate-limited, and then forwarded."*

#### DEMO 2 — Request Tampering Attack
1. Open **⚡ Security Demo** from the sidebar.
2. Find section **02 — Request Tampering Attack**.
3. Click **Run Tampering Attack**.
4. Expected: `HTTP 403 — HMAC_VERIFICATION_FAILED`. The pipeline shows
   API Key ✓, HMAC ✗, all subsequent checks skipped.

> *"The request was authenticated but its integrity was compromised, so
> CipherGate blocked it."*

#### DEMO 3 — Replay Attack
1. In **⚡ Security Demo**, find section **03 — Replay Attack**.
2. Click **Send Valid Request** (Step 1) → `200 OK`.
3. Click **Replay Exact Request** (Step 2) → `409 REPLAY_ATTACK`.
4. Expected: HMAC ✓, Timestamp ✓, Nonce ✗.

> *"The request was valid originally, but the nonce had already been used."*

#### DEMO 4 — Expired Timestamp
1. In **⚡ Security Demo**, find section **04 — Expired Timestamp Attack**.
2. Click **Send Expired Timestamp** → `408 TIMESTAMP_EXPIRED`.
3. The HMAC itself is valid (computed with the old timestamp), but the
   timestamp is 10 minutes old — outside the 30-second window.

> *"CipherGate prevents requests outside the configured freshness window."*

#### DEMO 5 — Rate Limit Burst
1. In **⚡ Security Demo**, find section **05 — Rate Limit Burst Attack**.
2. Click **Send 25 Requests**.
3. Watch the live progress dots: the first ~20 turn green (allowed), the
   remaining turn red (429 RATE_LIMIT_EXCEEDED).

> *"CipherGate limits each application independently."*

#### After Each Demo
Open **Dashboard** and **Security Events** to see all events reflected in
real time — including HMAC failures, replay detections, timestamp expirations,
and rate limit violations.

### Testing

The full test suite covers all CipherShop scenarios:

```bash
cd CipherGate-new/tests
python -m pytest test_gateway.py test_ciphershop_integration.py -v
```

**31 tests total — 15 existing + 16 new CipherShop integration tests:**

| Test | Expected Result |
|---|---|
| Valid payment allowed | 200 — decision.allowed = true |
| Valid request reaches backend | response.message = "Payment request processed" |
| All pipeline checks pass | All 5 checks = "passed" |
| Tampered body rejected | 403 — HMAC_VERIFICATION_FAILED |
| Tampered request skips backend | Backend-only fields absent |
| Replay first request allowed | 200 OK |
| Replay second request rejected | 409 — REPLAY_ATTACK |
| Expired timestamp rejected | 408 — TIMESTAMP_EXPIRED |
| Rate limit burst | 429 — RATE_LIMIT_EXCEEDED after ~20 |
| Events appear in audit log | /audit/logs contains the events |
| Blocked events logged | BLOCKED events in audit log |
| Dashboard stats updated | Counters reflect CipherShop events |
| Dashboard still works | All expected fields present |
| Applications page still works | Lists apps; no hmac_secret exposed |
| Request Editor still works | /gateway/request returns 200 |
| Security Events page still works | /audit/logs returns structured records |

### Files Added / Modified

**New files:**
- `frontend/src/pages/CipherShop.jsx` — Shop storefront + checkout + auto-registration
- `frontend/src/pages/CipherShop.css` — Styles (amber accent to distinguish client from gateway)
- `frontend/src/pages/SecurityDemo.jsx` — 5 attack demos with live results
- `frontend/src/pages/SecurityDemo.css` — Attack simulator styles
- `tests/test_ciphershop_integration.py` — 16 integration tests

**Modified files:**
- `frontend/src/App.jsx` — Added CipherShop + SecurityDemo routes
- `frontend/src/components/Layout.jsx` — Added 🛒 CipherShop and ⚡ Security Demo nav items
- `frontend/src/components/Layout.css` — Added `.shell__nav-item--shop` style

**Unchanged (verified):**
- All backend files (zero backend changes required)
- `frontend/src/pages/Dashboard.jsx`
- `frontend/src/pages/PaymentPage.jsx`
- `frontend/src/pages/RequestEditor.jsx`
- `frontend/src/pages/Applications.jsx`
- `frontend/src/pages/SecurityEvents.jsx`
- `frontend/src/pages/Settings.jsx`
- `frontend/src/services/crypto.js` (reused as-is)
- `frontend/src/services/api.js` (reused as-is)
- `tests/test_gateway.py` (all 15 tests still pass)
