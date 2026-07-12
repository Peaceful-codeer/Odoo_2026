from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import ADMIN, ANY_USER
from app.database.session import get_db
from app.models import Asset, AuditCycle, AuditItem, User
from app.models.enums import (
    AssetStatus, AuditCycleStatus, AuditItemStatus, NotificationType,
)
from app.schemas import AuditCycleIn, AuditCycleOut, AuditItemOut, AuditMarkIn
from app.services.common import log, notify

router = APIRouter(prefix="/api/audits", tags=["audits"])


@router.get("", response_model=List[AuditCycleOut])
def list_cycles(status: Optional[AuditCycleStatus] = None, db: Session = Depends(get_db),
                user: User = Depends(ANY_USER)):
    q = db.query(AuditCycle).filter_by(organization_id=user.organization_id)
    if status:
        q = q.filter(AuditCycle.status == status)
    return q.order_by(AuditCycle.id.desc()).all()


@router.post("", response_model=AuditCycleOut, status_code=201)
def create_cycle(data: AuditCycleIn, db: Session = Depends(get_db), admin: User = Depends(ADMIN)):
    """Create cycle scoped by department/location; snapshot matching assets as audit items."""
    c = AuditCycle(organization_id=admin.organization_id, created_by=admin.id,
                   **data.model_dump())
    db.add(c); db.flush()
    q = db.query(Asset).filter(Asset.organization_id == admin.organization_id,
                               Asset.status != AssetStatus.DISPOSED)
    if data.scope_department_id:
        q = q.filter(Asset.owner_department_id == data.scope_department_id)
    if data.scope_location:
        q = q.filter(Asset.location.ilike(f"%{data.scope_location}%"))
    assets = q.all()
    for a in assets:
        db.add(AuditItem(cycle_id=c.id, asset_id=a.id, status=AuditItemStatus.PENDING))
    for uid in (data.auditor_ids or []):
        notify(db, uid, NotificationType.AUDIT_REMINDER, "Audit assigned",
               f"You are an auditor on '{c.name}' ({len(assets)} assets).", {"cycle_id": c.id})
    log(db, admin.organization_id, admin.id, "audit.cycle_created", "audit_cycle", c.id,
        f"{c.name}: {len(assets)} assets in scope")
    db.commit(); db.refresh(c)
    return c


@router.get("/{cycle_id}/items", response_model=List[AuditItemOut])
def cycle_items(cycle_id: int, db: Session = Depends(get_db), user: User = Depends(ANY_USER)):
    if not db.get(AuditCycle, cycle_id):
        raise HTTPException(404, "Cycle not found")
    return db.query(AuditItem).filter_by(cycle_id=cycle_id).all()


@router.patch("/items/{item_id}", response_model=AuditItemOut)
def mark_item(item_id: int, data: AuditMarkIn, db: Session = Depends(get_db),
              user: User = Depends(ANY_USER)):
    item = db.get(AuditItem, item_id)
    if not item:
        raise HTTPException(404, "Audit item not found")
    cycle = db.get(AuditCycle, item.cycle_id)
    if cycle.status == AuditCycleStatus.CLOSED:
        raise HTTPException(400, "Cycle is closed (locked)")
    auditors = cycle.auditor_ids or []
    if user.id not in auditors and user.role.value != "admin":
        raise HTTPException(403, "Not an assigned auditor for this cycle")
    if data.status == AuditItemStatus.PENDING:
        raise HTTPException(400, "Mark as verified/missing/damaged")
    item.status = data.status
    item.notes = data.notes
    item.verified_by = user.id
    item.verified_at = datetime.now(timezone.utc)
    log(db, cycle.organization_id, user.id, "audit.item_marked", "audit_item", item.id,
        f"cycle #{cycle.id}: asset {item.asset_id} -> {data.status.value}")
    db.commit(); db.refresh(item)
    return item


@router.get("/{cycle_id}/discrepancies")
def discrepancy_report(cycle_id: int, db: Session = Depends(get_db),
                       user: User = Depends(ANY_USER)):
    """Auto-generated discrepancy report for flagged (missing/damaged) items."""
    cycle = db.get(AuditCycle, cycle_id)
    if not cycle:
        raise HTTPException(404, "Cycle not found")
    items = db.query(AuditItem).filter_by(cycle_id=cycle_id).all()
    flagged = [i for i in items if i.status in (AuditItemStatus.MISSING, AuditItemStatus.DAMAGED)]
    rows = []
    for i in flagged:
        a = db.get(Asset, i.asset_id)
        rows.append({"asset_id": a.id, "asset_tag": a.asset_tag, "name": a.name,
                     "erp_status": a.status.value, "audit_finding": i.status.value,
                     "notes": i.notes, "verified_by": i.verified_by})
    return {
        "cycle": {"id": cycle.id, "name": cycle.name, "status": cycle.status.value},
        "summary": {
            "total": len(items),
            "verified": sum(1 for i in items if i.status == AuditItemStatus.VERIFIED),
            "missing": sum(1 for i in items if i.status == AuditItemStatus.MISSING),
            "damaged": sum(1 for i in items if i.status == AuditItemStatus.DAMAGED),
            "pending": sum(1 for i in items if i.status == AuditItemStatus.PENDING),
        },
        "discrepancies": rows,
    }


@router.post("/{cycle_id}/close", response_model=AuditCycleOut)
def close_cycle(cycle_id: int, db: Session = Depends(get_db), admin: User = Depends(ADMIN)):
    """Close = LOCK cycle + apply statuses: confirmed missing -> Lost (PDF)."""
    cycle = db.get(AuditCycle, cycle_id)
    if not cycle or cycle.status == AuditCycleStatus.CLOSED:
        raise HTTPException(404, "Open cycle not found")
    items = db.query(AuditItem).filter_by(cycle_id=cycle_id).all()
    for i in items:
        asset = db.get(Asset, i.asset_id)
        if i.status == AuditItemStatus.MISSING and asset.status != AssetStatus.DISPOSED:
            old = asset.status
            asset.status = AssetStatus.LOST   # applied on close regardless of prior state
            log(db, cycle.organization_id, admin.id, "asset.status_changed", "asset", asset.id,
                f"{asset.asset_tag}: {old.value} -> lost (audit #{cycle.id})")
            notify(db, cycle.created_by, NotificationType.AUDIT_DISCREPANCY,
                   "Audit discrepancy", f"{asset.asset_tag} marked Lost after audit.")
        elif i.status == AuditItemStatus.DAMAGED:
            asset.condition = "damaged"
    cycle.status = AuditCycleStatus.CLOSED
    cycle.closed_at = datetime.now(timezone.utc)
    log(db, cycle.organization_id, admin.id, "audit.cycle_closed", "audit_cycle", cycle.id,
        f"{cycle.name} locked")
    db.commit(); db.refresh(cycle)
    return cycle
