import os, sys
os.environ["DATABASE_URL"] = "sqlite:///./e2e.db"
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient

from app.database.session import engine
from app.models import Base
Base.metadata.create_all(engine)
from app.database import seed
seed.seed()
from app.main import app

c = TestClient(app)
F = 0
def check(name, cond, extra=""):
    global F
    print(("PASS " if cond else "FAIL ") + name, extra if not cond else "")
    if not cond: F += 1

def login(email):
    r = c.post("/api/auth/login", json={"email": email, "password": "Passw0rd!"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}

admin, mgr, head, emp = (login(e) for e in
    ["admin@acme-demo.com", "assetmgr@acme-demo.com", "depthead@acme-demo.com", "priya@acme-demo.com"])

# 1 signup employee-only
r = c.post("/api/auth/signup", json={"name": "New Guy", "email": "new@acme-demo.com",
                                     "password": "Passw0rd!"})
check("signup creates employee", r.status_code == 201 and r.json()["role"] == "employee")
newg = login("new@acme-demo.com")

# 2 role promotion only via admin endpoint; employee blocked from admin routes
uid = r.json()["id"]
r = c.patch(f"/api/org/employees/{uid}/role", json={"role": "asset_manager"}, headers=emp)
check("employee cannot promote", r.status_code == 403)
r = c.patch(f"/api/org/employees/{uid}/role", json={"role": "asset_manager"}, headers=admin)
check("admin promotes", r.status_code == 200 and r.json()["role"] == "asset_manager")

# 3 forgot/reset
r = c.post("/api/auth/forgot-password", json={"email": "priya@acme-demo.com"})
check("forgot ok", r.status_code == 200)

# 4 org setup
r = c.post("/api/org/departments", json={"name": "R&D", "parent_id": 1}, headers=admin)
check("dept w/ parent", r.status_code == 201 and r.json()["parent_id"] == 1)
r = c.post("/api/org/categories", json={"name": "Vehicles", "custom_fields":
    [{"key": "reg_no", "label": "Registration", "type": "text"}]}, headers=admin)
check("category custom fields", r.status_code == 201)

# 5 register asset (auto tag), employee blocked
r = c.post("/api/assets", json={"name": "MacBook Air", "category_id": 1}, headers=emp)
check("employee cannot register asset", r.status_code == 403)
r = c.post("/api/assets", json={"name": "MacBook Air", "category_id": 1,
    "custom_values": {"warranty_months": 12}}, headers=mgr)
check("register asset auto-tag", r.status_code == 201 and r.json()["asset_tag"] == "AF-0004")
mba = r.json()["id"]

# 6 QR + search + history
check("qr png", c.get(f"/api/assets/{mba}/qr", headers=emp).headers["content-type"] == "image/png")
r = c.get("/api/assets", params={"q": "AF-0004"}, headers=emp)
check("search by tag", len(r.json()) == 1)

# 7 allocation + double-allocation conflict
r = c.post("/api/allocations", json={"asset_id": mba, "holder_id": 4,
    "expected_return_date": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()},
    headers=mgr)
check("allocate", r.status_code == 201)
r = c.post("/api/allocations", json={"asset_id": mba, "holder_id": 3}, headers=mgr)
check("double allocation blocked w/ holder", r.status_code == 409 and
      "current_holder" in r.json()["detail"])

# 8 transfer workflow
r = c.post("/api/transfers", json={"asset_id": mba, "to_user_id": 3, "reason": "project"},
           headers=emp)
check("transfer requested", r.status_code == 201)
tid = r.json()["id"]
r = c.post(f"/api/transfers/{tid}/approve", headers=head)
check("dept head approves transfer", r.status_code == 200 and r.json()["status"] == "completed")
r = c.get("/api/allocations", params={"active_only": True, "holder_id": 3}, headers=mgr)
check("re-allocated to new holder", any(a["asset_id"] == mba for a in r.json()))

# 9 return flow -> Available
aid = [a for a in r.json() if a["asset_id"] == mba][0]["id"]
r = c.post(f"/api/allocations/{aid}/return", json={"condition": "good", "notes": "ok"},
           headers=mgr)
check("return -> available", r.status_code == 200 and
      c.get(f"/api/assets/{mba}", headers=emp).json()["status"] == "available")

# 10 booking overlap: PDF example 9-10 booked, 9:30-10:30 rejected, 10-11 ok
room = 3
base = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(days=1)
s9, e10 = base.replace(hour=9, minute=0), base.replace(hour=10, minute=0)
r = c.post("/api/bookings", json={"asset_id": room, "start_time": s9.isoformat(),
    "end_time": e10.isoformat(), "purpose": "standup"}, headers=emp)
check("book 9-10", r.status_code == 201)
b1 = r.json()["id"]
r = c.post("/api/bookings", json={"asset_id": room,
    "start_time": base.replace(hour=9, minute=30).isoformat(),
    "end_time": base.replace(hour=10, minute=30).isoformat()}, headers=head)
check("9:30-10:30 rejected", r.status_code == 409)
r = c.post("/api/bookings", json={"asset_id": room,
    "start_time": base.replace(hour=10).isoformat(),
    "end_time": base.replace(hour=11).isoformat()}, headers=head)
check("10-11 approved", r.status_code == 201)
# reschedule + cancel
r = c.patch(f"/api/bookings/{b1}/reschedule", json={
    "start_time": base.replace(hour=8).isoformat(),
    "end_time": base.replace(hour=9).isoformat()}, headers=emp)
check("reschedule", r.status_code == 200)
r = c.post(f"/api/bookings/{b1}/cancel", headers=emp)
check("cancel", r.status_code == 200 and r.json()["status"] == "cancelled")
# non-bookable asset rejected
r = c.post("/api/bookings", json={"asset_id": mba, "start_time": s9.isoformat(),
    "end_time": e10.isoformat()}, headers=emp)
check("non-bookable rejected", r.status_code == 400)

# 11 maintenance full workflow + auto status flips
r = c.post("/api/maintenance", json={"asset_id": mba, "issue_description": "screen flicker",
    "priority": "high"}, headers=emp)
check("maintenance raised", r.status_code == 201)
mid = r.json()["id"]
r = c.post(f"/api/maintenance/{mid}/approve", headers=mgr)
check("approve -> under_maintenance", r.status_code == 200 and
      c.get(f"/api/assets/{mba}", headers=emp).json()["status"] == "under_maintenance")
c.post(f"/api/maintenance/{mid}/assign-technician", json={"technician_id": 2}, headers=mgr)
c.post(f"/api/maintenance/{mid}/start", headers=mgr)
r = c.post(f"/api/maintenance/{mid}/resolve", json={"resolution_notes": "fixed"}, headers=mgr)
check("resolve -> available", r.status_code == 200 and
      c.get(f"/api/assets/{mba}", headers=emp).json()["status"] == "available")

# 12 audit: create cycle, mark, discrepancy report, close+lock -> Lost
r = c.post("/api/audits", json={"name": "Q3 HQ Audit",
    "start_date": datetime.now(timezone.utc).isoformat(),
    "end_date": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
    "auditor_ids": [2]}, headers=admin)
check("cycle created", r.status_code == 201)
cyc = r.json()["id"]
items = c.get(f"/api/audits/{cyc}/items", headers=mgr).json()
check("items snapshotted", len(items) >= 4)
target = [i for i in items if i["asset_id"] == mba][0]
r = c.patch(f"/api/audits/items/{target['id']}", json={"status": "missing",
    "notes": "not found"}, headers=mgr)
check("auditor marks missing", r.status_code == 200)
r = c.patch(f"/api/audits/items/{items[0]['id']}", json={"status": "verified"}, headers=emp)
check("non-auditor blocked", r.status_code == 403)
r = c.get(f"/api/audits/{cyc}/discrepancies", headers=admin)
check("discrepancy report", r.json()["summary"]["missing"] == 1)
r = c.post(f"/api/audits/{cyc}/close", headers=admin)
check("close locks + Lost", r.status_code == 200 and
      c.get(f"/api/assets/{mba}", headers=emp).json()["status"] == "lost")
r = c.patch(f"/api/audits/items/{target['id']}", json={"status": "verified"}, headers=mgr)
check("locked cycle immutable", r.status_code == 400)
# lost -> available (found later)
r = c.patch(f"/api/assets/{mba}/status", json={"status": "available",
    "notes": "found in storage"}, headers=mgr)
check("lost -> available", r.status_code == 200)
# invalid transition blocked
r = c.patch(f"/api/assets/{mba}/status", json={"status": "disposed"}, headers=mgr)
check("invalid transition blocked", r.status_code == 400)
# retire -> dispose
c.patch(f"/api/assets/{mba}/status", json={"status": "retired"}, headers=mgr)
r = c.patch(f"/api/assets/{mba}/status", json={"status": "disposed"}, headers=mgr)
check("retire->dispose", r.status_code == 200)

# 13 dashboard (role aware) + overdue from seed
r = c.get("/api/dashboard", headers=admin)
k = r.json()["kpis"]
check("dashboard kpis", all(x in k for x in ["assets_available", "assets_allocated",
      "maintenance_today", "active_bookings", "pending_transfers", "overdue_returns"]))
check("seed overdue detected", k["overdue_returns"] >= 1)
r = c.get("/api/dashboard", headers=emp)
check("employee dashboard extras", "my_assets" in r.json()["kpis"])

# 14 analytics + exports
r = c.get("/api/reports/analytics", headers=mgr)
check("analytics", r.status_code == 200 and "booking_heatmap" in r.json())
check("employee blocked analytics",
      c.get("/api/reports/analytics", headers=emp).status_code == 403)
for f, ct in [("csv", "text/csv"), ("excel", "sheet"), ("pdf", "pdf")]:
    r = c.get("/api/reports/export", params={"format": f}, headers=mgr)
    check(f"export {f}", r.status_code == 200 and ct in r.headers["content-type"])

# 15 notifications + activity logs
r = c.get("/api/notifications", headers=emp)
check("notifications exist", r.status_code == 200 and len(r.json()) > 0)
nid = r.json()[0]["id"]
check("mark read", c.post(f"/api/notifications/{nid}/read", headers=emp).json()["is_read"])
r = c.get("/api/activity-logs", headers=admin)
check("activity logs", r.status_code == 200 and len(r.json()) > 10)
check("employee blocked logs", c.get("/api/activity-logs", headers=emp).status_code == 403)

print(f"\n{'ALL TESTS PASSED' if F == 0 else str(F) + ' FAILURES'}")
sys.exit(1 if F else 0)
