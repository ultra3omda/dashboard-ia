# CashFlow Pilot — Backend

FastAPI + MongoDB backend for the CashFlow Pilot multi-tenant recouvrement dashboard.

## Architecture

Multi-tenant by design. Every collection is scoped by `org_id`.

```
app/
├── main.py                 # FastAPI app + lifespan
├── core/
│   ├── config.py           # Settings (pydantic-settings)
│   ├── database.py         # MongoDB client + indexes
│   ├── security.py         # bcrypt password hashing
│   ├── jwt_utils.py        # JWT tokens + httpOnly cookies
│   └── dependencies.py     # get_current_user, require_role, require_admin
├── models/                 # Pydantic schemas
├── routers/
│   ├── auth.py             # /api/auth (register-org, login, logout, me, refresh)
│   ├── imports.py          # /api/imports (Excel upload + upsert)
│   ├── data.py             # /api/clients, /api/factures
│   ├── actions.py          # /api/actions (CRUD)
│   ├── settings.py         # /api/settings
│   └── analytics.py        # /api/analytics (summary + AI suggestions)
└── services/
    ├── excel_parser.py     # .xlsx → dict (mirrors frontend parser)
    ├── analytics_engine.py # KPIs + aging classification
    └── ai_suggestions.py   # Claude API + scripted fallback + Mongo cache
```

## Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Linux/macOS
.venv\Scripts\activate              # Windows

pip install -r requirements.txt

cp .env.example .env
# Edit .env: fill MONGO_URL, JWT_SECRET (required)
# ANTHROPIC_API_KEY and RESEND_API_KEY are optional (fallback to scripted/logs)

uvicorn server:app --reload --port 8000
```

Swagger UI: http://localhost:8000/docs

## Authentication

JWT stored in **httpOnly cookies** (OWASP recommended for SPAs on same domain).
- `cfp_access` — access token (1h)
- `cfp_refresh` — refresh token (7d)

Frontend must call `fetch(..., { credentials: "include" })` on every request.

## Multi-tenant

- New orgs sign up via `POST /api/auth/register-org` (creates org + admin + default settings)
- All data endpoints filter by `user.org_id` automatically
- Unique indexes on `(org_id, …)` for client/facture dedup

## Excel ingestion

Dedup keys:
- **Clients**: `(org_id, nom_normalized)` where `nom_normalized = lowercase + trim + collapse whitespace`
- **Factures**: `(org_id, numFacture)`

Strategy: **last-write-wins** (re-uploading a file overwrites matching rows).

Audit logs stored in `import_logs` collection — 20 most recent available via `GET /api/imports/history`.

## AI suggestions

`GET /api/analytics/suggestions` returns actionable suggestions per KPI.
- If `ANTHROPIC_API_KEY` is set → calls Claude API with a structured JSON summary
- If absent → falls back to deterministic scripted rules
- Responses cached in `ai_cache` collection for 1h (configurable)

## Environment variables

See `.env.example` for the full list. Required: `MONGO_URL`, `JWT_SECRET`.

## API endpoints (summary)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register-org` | — | Create org + first admin |
| POST | `/api/auth/login` | — | Log in |
| POST | `/api/auth/logout` | — | Clear cookies |
| GET | `/api/auth/me` | ✅ | Current user + org |
| POST | `/api/auth/refresh` | refresh cookie | Renew access token |
| POST | `/api/imports/solde` | ✅ | Upload Solde_Clients.xlsx |
| POST | `/api/imports/factures` | ✅ | Upload Factures.xlsx |
| GET | `/api/imports/history` | ✅ | Last 20 imports |
| GET | `/api/clients` | ✅ | List clients (org-scoped) |
| GET | `/api/factures` | ✅ | List factures (org-scoped) |
| GET/POST/PATCH/DELETE | `/api/actions` | ✅ | CRUD actions |
| GET | `/api/settings` | ✅ | Get org settings |
| PATCH | `/api/settings` | admin | Update settings |
| GET | `/api/analytics/summary` | ✅ | KPIs + client perf + activity |
| GET | `/api/analytics/suggestions` | ✅ | AI-powered suggestions per KPI |
| GET | `/api/health` | — | Health check |
