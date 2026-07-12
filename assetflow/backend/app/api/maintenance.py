from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import ANY_USER, ASSET_MANAGER
from app.database.session import get_db
from app.models import Asset, MaintenanceRequest, User
from app.models.enums import (
    AssetStatus, MaintenanceStatus, NotificationType, UserRole,
)
from app.schemas import MaintenanceIn, MaintenanceOut, ResolveIn, TechnicianIn
from app.services.common import InvalidTransition, log, notify, transition

router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])


@router.get("", response_model=List[MaintenanceOut])
def list_requests(status: Optional[MaintenanceStatus] = None, db: Session = Depends(get_db),
                  user: User = Depends(ANY_USER)):
    q = db.query(MaintenanceRequest).join(Asset).filter(
        Asset.organization_id == user.organization_id)
    if user.role == UserRole.EMPLOYEE:
        q = q.filter(MaintenanceRequest.raised_by == user.id)
    if status:
        q = q.filter(MaintenanceRequest.status == status)
    return q.order_by(MaintenanceRequest.id.desc()).all()


@router.post("", response_model=MaintenanceOut, status_code=201)
def raise_request(data: MaintenanceIn, db: Session = Depends(get_db),
                  user: User = Depends(ANY_USER)):
    asset = db.get(Asset, data.asset_id)
    if not asset or asset.organization_id != user.organization_id:
        raise HTTPException(404, "Asset not found")
    m = MaintenanceRequest(raised_by=user.id, **data.model_dump())
    db.add(m); db.flush()
    log(db, user.organization_id, user.id, "maintenance.raised", "maintenance", m.id,
        f"{asset.asset_tag} [{data.priority.value}]")
    db.commit(); db.refresh(m)
    return m


def _get_pending(db, mid, expected: MaintenanceStatus):
    m = db.get(MaintenanceRequest, mid)
    if not m or m.status != expected:
        raise HTTPException(404, f"Request not found in state {expected.value}")
    return m


@router.post("/{mid}/approve", response_model=MaintenanceOut)
def approve(mid: int, db: Session = Depends(get_db), mgr: User = Depends(ASSET_MANAGER)):
    m = _get_pending(db, mid, MaintenanceStatus.PENDING)
    asset = db.get(Asset, m.asset_id)
    try:
        transition(db, asset, AssetStatus.UNDER_MAINTENANCE, mgr, f"maintenance #{m.id} approved")
    except InvalidTransition as e:
        raise HTTPException(400, str(e))
    m.status = MaintenanceStatus.APPROVED
    m.approved_by = mgr.id
    notify(db, m.raised_by, NotificationType.MAINTENANCE_APPROVED, "Maintenance approved",
           f"Request #{m.id} for {asset.asset_tag} approved.")
    log(db, mgr.organization_id, mgr.id, "maintenance.approved", "maintenance", m.id)
    db.commit(); db.refresh(m)
    return m


@router.post("/{mid}/reject", response_model=MaintenanceOut)
def reject(mid: int, db: Session = Depends(get_db), mgr: User = Depends(ASSET_MANAGER)):
    m = _get_pending(db, mid, MaintenanceStatus.PENDING)
    m.status = MaintenanceStatus.REJECTED
    m.approved_by = mgr.id
    notify(db, m.raised_by, NotificationType.MAINTENANCE_REJECTED, "Maintenance rejected",
           f"Request #{m.id} was rejected.")
    log(db, mgr.organization_id, mgr.id, "maintenance.rejected", "maintenance", m.id)
    db.commit(); db.refresh(m)
    return m


@router.post("/{mid}/assign-technician", response_model=MaintenanceOut)
def assign_technician(mid: int, data: TechnicianIn, db: Session = Depends(get_db),
                      mgr: User = Depends(ASSET_MANAGER)):
    m = _get_pending(db, mid, MaintenanceStatus.APPROVED)
    if not db.get(User, data.technician_id):
        raise HTTPException(404, "Technician user not found")
    m.technician_id = data.technician_id
    m.status = MaintenanceStatus.TECHNICIAN_ASSIGNED
    log(db, mgr.organization_id, mgr.id, "maintenance.technician_assigned", "maintenance", m.id)
    db.commit(); db.refresh(m)
    return m


@router.post("/{mid}/start", response_model=MaintenanceOut)
def start_work(mid: int, db: Session = Depends(get_db), mgr: User = Depends(ASSET_MANAGER)):
    m = _get_pending(db, mid, MaintenanceStatus.TECHNICIAN_ASSIGNED)
    m.status = MaintenanceStatus.IN_PROGRESS
    log(db, mgr.organization_id, mgr.id, "maintenance.in_progress", "maintenance", m.id)
    db.commit(); db.refresh(m)
    return m


@router.post("/{mid}/resolve", response_model=MaintenanceOut)
def resolve(mid: int, data: ResolveIn, db: Session = Depends(get_db),
            mgr: User = Depends(ASSET_MANAGER)):
    m = db.get(MaintenanceRequest, mid)
    if not m or m.status not in (MaintenanceStatus.IN_PROGRESS,
                                 MaintenanceStatus.TECHNICIAN_ASSIGNED,
                                 MaintenanceStatus.APPROVED):
        raise HTTPException(404, "Request not in a resolvable state")
    asset = db.get(Asset, m.asset_id)
    m.status = MaintenanceStatus.RESOLVED
    m.resolution_notes = data.resolution_notes
    try:
        transition(db, asset, AssetStatus.AVAILABLE, mgr, f"maintenance #{m.id} resolved")
    except InvalidTransition as e:
        raise HTTPException(400, str(e))
    notify(db, m.raised_by, NotificationType.MAINTENANCE_COMPLETED, "Maintenance completed",
           f"{asset.asset_tag} is available again.")
    log(db, mgr.organization_id, mgr.id, "maintenance.resolved", "maintenance", m.id)
    db.commit(); db.refresh(m)
    return m
