import csv
import io
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import ANY_USER, MANAGERIAL
from app.database.session import get_db
from app.models import (
    ActivityLog, Allocation, Asset, Booking, MaintenanceRequest, Notification,
    TransferRequest, User, Department, AssetCategory,
)
from app.models.enums import (
    AllocationStatus, AssetStatus, BookingStatus, MaintenanceStatus,
    TransferStatus, UserRole,
)
from app.schemas import ActivityOut, NotificationOut

router = APIRouter(prefix="/api", tags=["dashboard-reports"])


def _now():
    return datetime.now(timezone.utc)


def _norm(dt):
    return dt.replace(tzinfo=timezone.utc) if dt and dt.tzinfo is None else dt


# ---------------- Dashboard ----------------
@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), user: User = Depends(ANY_USER)):
    org = user.organization_id
    aq = db.query(Asset).filter(Asset.organization_id == org)

    def count(status):
        return aq.filter(Asset.status == status).count()

    now = _now()
    active_allocs = (db.query(Allocation).join(Asset)
                     .filter(Asset.organization_id == org,
                             Allocation.status == AllocationStatus.ACTIVE).all())
    overdue = [a for a in active_allocs
               if a.expected_return_date and _norm(a.expected_return_date) < now]
    upcoming = [a for a in active_allocs
                if a.expected_return_date and _norm(a.expected_return_date) >= now]

    bookings = (db.query(Booking).join(Asset)
                .filter(Asset.organization_id == org,
                        Booking.status != BookingStatus.CANCELLED).all())
    active_bookings = sum(1 for b in bookings
                          if _norm(b.start_time) <= now < _norm(b.end_time)
                          or _norm(b.start_time) > now)

    maint_today = (db.query(MaintenanceRequest).join(Asset)
                   .filter(Asset.organization_id == org,
                           MaintenanceRequest.status.in_([
                               MaintenanceStatus.APPROVED,
                               MaintenanceStatus.TECHNICIAN_ASSIGNED,
                               MaintenanceStatus.IN_PROGRESS])).count())

    pending_transfers = (db.query(TransferRequest).join(Asset)
                         .filter(Asset.organization_id == org,
                                 TransferRequest.status == TransferStatus.REQUESTED).count())

    kpis = {
        "assets_available": count(AssetStatus.AVAILABLE),
        "assets_allocated": count(AssetStatus.ALLOCATED),
        "maintenance_today": maint_today,
        "active_bookings": active_bookings,
        "pending_transfers": pending_transfers,
        "upcoming_returns": len(upcoming),
        "overdue_returns": len(overdue),
    }
    # role-aware extras
    if user.role == UserRole.EMPLOYEE:
        kpis["my_assets"] = sum(1 for a in active_allocs if a.holder_id == user.id)
        kpis["my_bookings"] = sum(1 for b in bookings if b.booked_by == user.id)
    overdue_list = [{
        "allocation_id": a.id, "asset_id": a.asset_id,
        "holder_id": a.holder_id,
        "expected_return_date": a.expected_return_date.isoformat(),
        "days_overdue": (now - _norm(a.expected_return_date)).days,
    } for a in sorted(overdue, key=lambda x: _norm(x.expected_return_date))[:10]]
    return {"kpis": kpis, "overdue_returns": overdue_list}


# ---------------- Reports & Analytics ----------------
@router.get("/reports/analytics")
def analytics(db: Session = Depends(get_db), user: User = Depends(MANAGERIAL)):
    org = user.organization_id
    # utilization: allocations per asset (most-used vs idle)
    alloc_counts = dict(
        db.query(Allocation.asset_id, func.count(Allocation.id)).join(Asset)
        .filter(Asset.organization_id == org).group_by(Allocation.asset_id).all())
    assets = db.query(Asset).filter_by(organization_id=org).all()
    usage = sorted(({"asset_id": a.id, "asset_tag": a.asset_tag, "name": a.name,
                     "allocation_count": alloc_counts.get(a.id, 0)} for a in assets),
                   key=lambda x: -x["allocation_count"])
    idle = [u for u in usage if u["allocation_count"] == 0]

    # maintenance frequency by asset + category
    m_by_asset = dict(
        db.query(MaintenanceRequest.asset_id, func.count(MaintenanceRequest.id)).join(Asset)
        .filter(Asset.organization_id == org).group_by(MaintenanceRequest.asset_id).all())
    cats = {c.id: c.name for c in db.query(AssetCategory).filter_by(organization_id=org)}
    m_by_cat = {}
    for a in assets:
        if a.id in m_by_asset:
            m_by_cat[cats.get(a.category_id, "?")] = \
                m_by_cat.get(cats.get(a.category_id, "?"), 0) + m_by_asset[a.id]

    # department-wise allocation summary
    depts = {d.id: d.name for d in db.query(Department).filter_by(organization_id=org)}
    dept_summary = {}
    for a in db.query(Allocation).join(Asset).filter(
            Asset.organization_id == org, Allocation.status == AllocationStatus.ACTIVE):
        name = depts.get(a.department_id, "Unassigned")
        dept_summary[name] = dept_summary.get(name, 0) + 1

    # booking heatmap: weekday x hour counts
    heatmap = {}
    for b in db.query(Booking).join(Asset).filter(
            Asset.organization_id == org, Booking.status != BookingStatus.CANCELLED):
        s = _norm(b.start_time)
        key = f"{s.strftime('%a')}-{s.hour:02d}"
        heatmap[key] = heatmap.get(key, 0) + 1

    return {
        "most_used_assets": usage[:10],
        "idle_assets": idle[:10],
        "maintenance_by_asset": [{"asset_id": k, "count": v} for k, v in m_by_asset.items()],
        "maintenance_by_category": m_by_cat,
        "department_allocation_summary": dept_summary,
        "booking_heatmap": heatmap,
    }


def _asset_rows(db, org):
    rows = [["Asset Tag", "Name", "Status", "Condition", "Location", "Bookable"]]
    for a in db.query(Asset).filter_by(organization_id=org).order_by(Asset.id):
        rows.append([a.asset_tag, a.name, a.status.value, a.condition.value,
                     a.location or "", "yes" if a.is_bookable else "no"])
    return rows


@router.get("/reports/export")
def export_report(format: str = Query("csv", pattern="^(csv|excel|pdf)$"),
                  db: Session = Depends(get_db), user: User = Depends(MANAGERIAL)):
    rows = _asset_rows(db, user.organization_id)
    if format == "csv":
        buf = io.StringIO()
        csv.writer(buf).writerows(rows)
        return Response(buf.getvalue(), media_type="text/csv",
                        headers={"Content-Disposition": "attachment; filename=assets.csv"})
    if format == "excel":
        from openpyxl import Workbook
        wb = Workbook(); ws = wb.active; ws.title = "Assets"
        for r in rows:
            ws.append(r)
        buf = io.BytesIO(); wb.save(buf)
        return Response(buf.getvalue(),
                        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        headers={"Content-Disposition": "attachment; filename=assets.xlsx"})
    # pdf
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
    from reportlab.lib.styles import getSampleStyleSheet
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4)
    t = Table(rows, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
    ]))
    doc.build([Paragraph("AssetFlow — Asset Report", getSampleStyleSheet()["Title"]), t])
    return Response(buf.getvalue(), media_type="application/pdf",
                    headers={"Content-Disposition": "attachment; filename=assets.pdf"})


# ---------------- Notifications ----------------
@router.get("/notifications", response_model=List[NotificationOut])
def my_notifications(unread_only: bool = False, db: Session = Depends(get_db),
                     user: User = Depends(ANY_USER)):
    q = db.query(Notification).filter_by(user_id=user.id)
    if unread_only:
        q = q.filter(Notification.is_read == False)  # noqa: E712
    return q.order_by(Notification.id.desc()).limit(100).all()


@router.post("/notifications/{nid}/read", response_model=NotificationOut)
def mark_read(nid: int, db: Session = Depends(get_db), user: User = Depends(ANY_USER)):
    n = db.get(Notification, nid)
    if not n or n.user_id != user.id:
        raise HTTPException(404, "Notification not found")
    n.is_read = True
    db.commit(); db.refresh(n)
    return n


@router.post("/notifications/read-all")
def mark_all_read(db: Session = Depends(get_db), user: User = Depends(ANY_USER)):
    db.query(Notification).filter_by(user_id=user.id, is_read=False).update({"is_read": True})
    db.commit()
    return {"message": "All marked read"}


# ---------------- Activity logs ----------------
@router.get("/activity-logs", response_model=List[ActivityOut])
def activity_logs(entity_type: Optional[str] = None, actor_id: Optional[int] = None,
                  skip: int = 0, limit: int = Query(50, le=200),
                  db: Session = Depends(get_db), user: User = Depends(MANAGERIAL)):
    q = db.query(ActivityLog).filter_by(organization_id=user.organization_id)
    if entity_type:
        q = q.filter(ActivityLog.entity_type == entity_type)
    if actor_id:
        q = q.filter(ActivityLog.actor_id == actor_id)
    return q.order_by(ActivityLog.id.desc()).offset(skip).limit(limit).all()
