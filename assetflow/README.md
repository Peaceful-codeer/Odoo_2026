# AssetFlow — Unified Full-Stack Project

Enterprise Asset & Resource Management System.
`backend/` = FastAPI + SQLAlchemy + PostgreSQL (untouched functionality).
`frontend/` = React (TanStack Start + Tailwind + shadcn) — **fully rewired from Supabase to the FastAPI backend** via `frontend/src/lib/api.ts` (JWT auth, auto token refresh, typed endpoint helpers).

## 1. Run the backend
```bash
cd backend
python -m venv venv && source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # set DATABASE_URL (your Neon Postgres) + SECRET_KEY
alembic upgrade head        # skip if your DB already has the tables
python -m app.database.seed # optional demo data (admin@acme-demo.com / Passw0rd!)
uvicorn app.main:app --reload --port 8000
```
Swagger: http://localhost:8000/docs

## 2. Run the frontend
```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173 (any common dev port is CORS-allowed)
```
`frontend/.env` → `VITE_API_URL="http://localhost:8000"` (point to your deployed backend URL in production).

## What was changed in the frontend (backend untouched except CORS origins)
- Removed `@supabase/supabase-js` and `src/integrations/supabase/*` entirely.
- New `src/lib/api.ts`: fetch client with JWT storage, automatic refresh on 401, and helpers for every backend endpoint (auth, org setup, assets, allocations, transfers, bookings, maintenance, audits, dashboard, reports, notifications, activity logs).
- `use-session` now hydrates from `GET /api/auth/me`; role `department_head` is mapped to the UI's `dept_head`.
- Every page's queries/mutations now call the backend:
  - **Auth**: signup creates Employee-only accounts; login/forgot/reset wired to `/api/auth/*`.
  - **Dashboard**: live KPIs + overdue returns + recent activity from `/api/dashboard`, `/api/activity-logs`.
  - **Assets**: list/search/register (auto AF-tag), detail with allocation + maintenance history.
  - **Allocations**: allocate (backend blocks double-allocation with 409 + current holder), return (condition check-in), transfer request/approve/reject.
  - **Booking**: bookable resources, create (backend rejects overlaps), cancel; UI keeps its statuses.
  - **Maintenance**: kanban columns mapped to backend workflow (Pending→Approved→Technician→In&nbsp;Progress→Resolved) with auto asset status flips.
  - **Audits**: create cycle (items auto-snapshotted), mark Verified/Missing/Damaged, close = lock + Missing→Lost.
  - **Organization**: departments, categories, employee directory + role promotion (the only place roles change).
  - **Reports**: live analytics + server-generated CSV export (Excel/PDF also available via API).
  - **Notifications**: list + mark-all-read.
- Backend: only `allow_origins` extended to cover common local dev ports (5173/3000/8080).

## Verified
- `tsc --noEmit` clean, production build succeeds.
- 19/19 live integration tests (login → dashboard → register → allocate → conflict 409 → transfer → booking overlap 409 → maintenance workflow → audit close → notifications/reports/logs) passed against the running backend.

## Demo logins (after seeding, password `Passw0rd!`)
admin@acme-demo.com · assetmgr@acme-demo.com · depthead@acme-demo.com · priya@acme-demo.com
