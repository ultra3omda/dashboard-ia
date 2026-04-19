# CashFlow Pilot — Frontend

Vite + React 18 + TypeScript + Tailwind + shadcn/ui.
Connects to the FastAPI backend via `credentials: include` for httpOnly cookie auth.

## Setup

```bash
cd frontend
npm install

# Dev server
npm run dev              # http://localhost:5173

# Build
npm run build            # outputs to dist/
```

## Environment

Create a `.env.local` at the root of `frontend/`:

```env
VITE_API_BASE_URL=http://localhost:8000
```

For production, point this to your deployed backend URL.

## Architecture

### Authentication

- **JWT in httpOnly cookies** (cfp_access 1h + cfp_refresh 7d)
- All API calls use `credentials: "include"` to send cookies
- 401 responses trigger a silent refresh, then replay the original request
- Public routes : `/login`, `/register-org`
- All other routes wrapped in `<ProtectedRoute>`

### Multi-tenant

New users sign up through `/register-org` which creates both the organisation
and its first admin user. Data is automatically scoped by `org_id` server-side.

### State management

TanStack Query manages all server state. Hooks in `src/hooks/useData.ts` :
- `useClients`, `useFactures`, `useActiveFactures`
- `useActions`, `useCreateAction`, `useUpdateAction`, `useDeleteAction`
- `useSettings`, `useUpdateSettings`
- `useImportSolde`, `useImportFactures`, `useImportHistory`
- `useAnalyticsSummary`, `useAnalyticsSuggestions`

### Legacy compatibility

The seven business pages originally used `storage.ts` backed by `localStorage`.
The module has been rewritten as a **façade** over an in-memory cache populated
by `<DataBootstrap>` on startup via the REST API. Those pages keep working
without a large refactor while the source of truth lives in MongoDB.

### Analyse IA v2

`src/pages/AnalyseIA.tsx` replaces the old iframe dashboard with a full React
page that:
- Calls `/api/analytics/summary` for KPIs, client performance, activity breakdown
- Offers filters (activity, group/external, period, overdue-only)
- Displays 4 aging buckets (Normal / Vigilance / Critique / Danger) using
  configurable thresholds from org settings
- Shows top clients in 3 modes (CA realised / Recovered / Remaining)
- **Per-KPI AI suggestions** — each KPI card has a "Suggestions IA" button
  that calls `/api/analytics/suggestions`, powered by Claude API with
  scripted fallback

## File layout

```
src/
├── App.tsx                # AuthProvider + public/protected routes
├── lib/
│   ├── api.ts             # fetch client with refresh on 401
│   ├── apiEndpoints.ts    # typed endpoints
│   ├── analytics.ts       # aging classification + formatting
│   ├── localMigration.ts  # one-shot localStorage -> cloud
│   ├── storage.ts         # legacy façade (in-memory cache)
│   ├── xlsx-parser.ts     # (legacy, kept for compat)
│   └── forecast-utils.ts  # forecasting helpers
├── contexts/AuthContext.tsx
├── components/
│   ├── ProtectedRoute.tsx # guard + RoleGuard
│   ├── DataBootstrap.tsx  # loads data after auth, rerenders cache changes
│   ├── TopBar.tsx         # header + avatar menu + logout
│   ├── ImportModal.tsx    # Excel upload via API
│   └── ...
├── hooks/useData.ts       # TanStack Query hooks
├── pages/
│   ├── Login.tsx
│   ├── RegisterOrg.tsx
│   ├── AnalyseIA.tsx      # rewritten
│   ├── Parametres.tsx     # patched (aging + migration)
│   └── ... (Dashboard, Encours, Factures, Previsions, Actions — unchanged)
└── types/data.ts          # id and updated_at optional
```

## Roles

`super_admin` > `admin` > `ceo` > `cfo` > `chef_dep` > `chef_projet` > `agent`

Use `useAuth().hasRole([...])` or `<RoleGuard roles={[...]}>` to conditionally
render role-gated UI. The backend enforces the same checks.
