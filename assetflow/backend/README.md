# AssetFlow — Enterprise Asset & Resource Management System (Backend)

FastAPI + SQLAlchemy 2 + PostgreSQL. 100% free stack. All PDF requirements implemented and verified by 47 passing E2E tests (`python e2e_test.py`).

## Features (mapped to problem statement)
| PDF Requirement | Implementation |
|---|---|
| Signup = Employee only, no role selection | `POST /api/auth/signup` hardcodes role=employee |
| Roles assigned ONLY in Employee Directory | `PATCH /api/org/employees/{id}/role` (Admin) |
| Login / forgot / reset / session validation | `/api/auth/*`, JWT access+refresh |
| Org Setup 3 tabs (depts w/ parent, categories w/ custom fields, directory) | `/api/org/*` |
| 7 lifecycle states + valid transitions | `services/common.py` state machine, enforced everywhere |
| Auto asset tag AF-0001, QR, search/filter, per-asset history | `/api/assets*` (`/qr` returns PNG) |
| Double-allocation blocked, shows holder, offers transfer | `POST /api/allocations` → 409 with holder |
| Transfer: Requested → Approved (AM/DeptHead) → Re-allocated, history auto | `/api/transfers/*` |
| Return flow + condition check-in → Available | `POST /api/allocations/{id}/return` |
| Overdue auto-flagged (computed on read) → Dashboard + Notifications | dashboard + daily scheduler job |
| Booking overlap rejection (9-10 vs 9:30-10:30 example) | service check + **Postgres EXCLUDE constraint** |
| Booking statuses, cancel, reschedule, reminder | `/api/bookings/*` + APScheduler 15-min job |
| Maintenance: Pending→Approved/Rejected→Technician→InProgress→Resolved, auto status flips | `/api/maintenance/*` |
| Audit cycles: scope, auditors, mark Verified/Missing/Damaged, discrepancy report, Close=lock+Lost | `/api/audits/*` |
| KPI dashboard (role-aware) | `GET /api/dashboard` |
| Analytics: utilization, idle, maintenance freq, dept summary, booking heatmap | `GET /api/reports/analytics` |
| Export PDF/Excel/CSV | `GET /api/reports/export?format=` |
| Notifications (all PDF types) + activity log (who/what/when, no deletion) | `/api/notifications`, `/api/activity-logs` |

## Middleware stack
CORS → in-memory rate limit (120/min/IP) → request logging → JWT verify (`get_current_user`) → RBAC (`require_roles`) → global error handler.

## Run locally
```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # set DATABASE_URL (Neon free) + SECRET_KEY
alembic upgrade head            # tables + btree_gist + booking EXCLUDE constraint
python -m app.database.seed     # demo org + 4 role users
uvicorn app.main:app --reload   # Swagger at /docs
```
Quick demo without Postgres: `DATABASE_URL=sqlite:///./dev.db` then create tables via `python -c "from app.database.session import engine; from app.models import Base; Base.metadata.create_all(engine)"` and seed. (Booking overlap is still enforced in the service layer.)

## Demo logins (password `Passw0rd!`)
admin@acme-demo.com · assetmgr@acme-demo.com · depthead@acme-demo.com · priya@acme-demo.com

## Deploy (free)
Frontend: Vercel · Backend: Render free (`uvicorn app.main:app --host 0.0.0.0 --port $PORT`) · DB: Neon · Files: Cloudinary (store URLs via `POST /api/assets/{id}/documents`).

## Structure
```
app/
├── api/         auth, org, assets, allocations(+transfers), bookings, maintenance, audits, misc(dashboard/reports/notifications/logs)
├── core/        config, security(bcrypt), deps(JWT+RBAC)
├── database/    base, session, seed
├── models/      enums + 16 tables
├── schemas/     all Pydantic I/O models
├── services/    common(state machine, log, notify, email, tag), scheduler
└── main.py      middleware + routers + APScheduler lifespan
alembic/         0001_initial (btree_gist + EXCLUDE constraint)
e2e_test.py      47 checks covering every workflow
```
