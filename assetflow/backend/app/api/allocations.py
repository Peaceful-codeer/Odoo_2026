from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import ANY_USER, ASSET_MANAGER, MANAGERIAL
from app.database.session import get_db
from app.models import Allocation, Asset, TransferRequest, User
from app.models.enums import (
    AllocationStatus, AssetStatus, NotificationType, TransferStatus, UserRole,
)
from app.schemas import AllocateIn, AllocationOut, ReturnIn, TransferIn, TransferOut
from app.services.common import InvalidTransition, log, notify, transition

router = APIRouter(prefix="/api/allocations", tags=["allocations-transfers"])


def _active_allocation(db: Session, asset_id: int) -> Optional[Allocation]:
    return db.query(Allocation).filter_by(asset_id=asset_id,
                                          status=AllocationStatus.ACTIVE).first()


def _with_overdue(a: Allocation) -> AllocationOut:
    out = AllocationOut.model_validate(a)
    erd = a.expected_return_date
    if erd is not None and a.status == AllocationStatus.ACTIVE:
        if erd.tzinfo is None:
            erd = erd.replace(tzinfo=timezone.utc)
        out.is_overdue = erd < datetime.now(timezone.utc)
    return out


@router.get("", response_model=List[AllocationOut])
def list_allocations(active_only: bool = False, holder_id: Optional[int] = None,
                     db: Session = Depends(get_db), user: User = Depends(ANY_USER)):
    q = db.query(Allocation).join(Asset).filter(Asset.organization_id == user.organization_id)
    if user.role == UserRole.EMPLOYEE:
        q = q.filter(Allocation.holder_id == user.id)          # employees see their own
    elif user.role == UserRole.DEPARTMENT_HEAD:
        q = q.filter(Allocation.department_id == user.department_id)
    if active_only:
        q = q.filter(Allocation.status == AllocationStatus.ACTIVE)
    if holder_id:
        q = q.filter(Allocation.holder_id == holder_id)
    return [_with_overdue(a) for a in q.order_by(Allocation.id.desc()).all()]


@router.post("", response_model=AllocationOut, status_code=201)
def allocate(data: AllocateIn, db: Session = Depends(get_db), mgr: User = Depends(ASSET_MANAGER)):
    asset = db.get(Asset, data.asset_id)
    if not asset or asset.organization_id != mgr.organization_id:
        raise HTTPException(404, "Asset not found")
    existing = _active_allocation(db, asset.id)
    if existing:
        holder = db.get(User, existing.holder_id)
        # PDF conflict rule: block + surface current holder + suggest transfer
        raise HTTPException(409, detail={
            "error": "Asset already allocated",
            "current_holder": {"id": holder.id, "name": holder.name},
            "suggestion": "Create a transfer request instead",
        })
    holder = db.get(User, data.holder_id)
    if not holder:
        raise HTTPException(404, "Holder not found")
    try:
        transition(db, asset, AssetStatus.ALLOCATED, mgr, f"to {holder.name}")
    except InvalidTransition as e:
        raise HTTPException(400, str(e))
    a = Allocation(asset_id=asset.id, holder_id=holder.id,
                   department_id=data.department_id or holder.department_id,
                   allocated_by=mgr.id, allocated_at=datetime.now(timezone.utc),
                   expected_return_date=data.expected_return_date)
    db.add(a); db.flush()
    notify(db, holder.id, NotificationType.ASSET_ASSIGNED, "Asset assigned to you",
           f"{asset.asset_tag} {asset.name} has been allocated to you.",
           {"asset_id": asset.id})
    log(db, mgr.organization_id, mgr.id, "asset.allocated", "allocation", a.id,
        f"{asset.asset_tag} -> {holder.name}")
    db.commit(); db.refresh(a)
    return _with_overdue(a)


@router.post("/{allocation_id}/return", response_model=AllocationOut)
def return_asset(allocation_id: int, data: ReturnIn, db: Session = Depends(get_db),
                 mgr: User = Depends(ASSET_MANAGER)):
    a = db.get(Allocation, allocation_id)
    if not a or a.status != AllocationStatus.ACTIVE:
        raise HTTPException(404, "Active allocation not found")
    asset = db.get(Asset, a.asset_id)
    a.status = AllocationStatus.RETURNED
    a.returned_at = datetime.now(timezone.utc)
    a.return_condition = data.condition.value
    a.return_notes = data.notes
    asset.condition = data.condition
    transition(db, asset, AssetStatus.AVAILABLE, mgr, "returned & verified")
    log(db, mgr.organization_id, mgr.id, "asset.returned", "allocation", a.id,
        f"{asset.asset_tag} condition={data.condition.value}")
    db.commit(); db.refresh(a)
    return _with_overdue(a)


# ---------------- Transfers ----------------
transfer_router = APIRouter(prefix="/api/transfers", tags=["allocations-transfers"])


@transfer_router.get("", response_model=List[TransferOut])
def list_transfers(status: Optional[TransferStatus] = None, db: Session = Depends(get_db),
                   user: User = Depends(ANY_USER)):
    q = db.query(TransferRequest).join(Asset).filter(Asset.organization_id == user.organization_id)
    if user.role == UserRole.EMPLOYEE:
        q = q.filter((TransferRequest.requested_by == user.id) |
                     (TransferRequest.from_user_id == user.id) |
                     (TransferRequest.to_user_id == user.id))
    if status:
        q = q.filter(TransferRequest.status == status)
    return q.order_by(TransferRequest.id.desc()).all()


@transfer_router.post("", response_model=TransferOut, status_code=201)
def request_transfer(data: TransferIn, db: Session = Depends(get_db),
                     user: User = Depends(ANY_USER)):
    asset = db.get(Asset, data.asset_id)
    if not asset or asset.organization_id != user.organization_id:
        raise HTTPException(404, "Asset not found")
    active = _active_allocation(db, asset.id)
    if not active:
        raise HTTPException(400, "Asset is not allocated; allocate directly instead")
    if not db.get(User, data.to_user_id):
        raise HTTPException(404, "Target user not found")
    t = TransferRequest(asset_id=asset.id, from_user_id=active.holder_id,
                        to_user_id=data.to_user_id, requested_by=user.id,
                        reason=data.reason)
    db.add(t); db.flush()
    log(db, user.organization_id, user.id, "transfer.requested", "transfer", t.id,
        f"{asset.asset_tag}")
    db.commit(); db.refresh(t)
    return t


@transfer_router.post("/{transfer_id}/approve", response_model=TransferOut)
def approve_transfer(transfer_id: int, db: Session = Depends(get_db),
                     approver: User = Depends(MANAGERIAL)):
    """Approved by Asset Manager / Department Head (PDF). Completes re-allocation."""
    t = db.get(TransferRequest, transfer_id)
    if not t or t.status != TransferStatus.REQUESTED:
        raise HTTPException(404, "Pending transfer not found")
    asset = db.get(Asset, t.asset_id)
    old = _active_allocation(db, asset.id)
    if old:
        old.status = AllocationStatus.RETURNED
        old.returned_at = datetime.now(timezone.utc)
        old.return_notes = f"Transferred via request #{t.id}"
    new_holder = db.get(User, t.to_user_id)
    db.add(Allocation(asset_id=asset.id, holder_id=new_holder.id,
                      department_id=new_holder.department_id, allocated_by=approver.id,
                      allocated_at=datetime.now(timezone.utc)))
    t.status = TransferStatus.COMPLETED
    t.approved_by = approver.id
    notify(db, new_holder.id, NotificationType.TRANSFER_APPROVED, "Transfer approved",
           f"{asset.asset_tag} {asset.name} is now allocated to you.", {"asset_id": asset.id})
    if t.from_user_id:
        notify(db, t.from_user_id, NotificationType.TRANSFER_APPROVED, "Transfer approved",
               f"{asset.asset_tag} has been transferred to {new_holder.name}.")
    log(db, approver.organization_id, approver.id, "transfer.approved", "transfer", t.id,
        f"{asset.asset_tag} -> {new_holder.name} (history auto-updated)")
    db.commit(); db.refresh(t)
    return t


@transfer_router.post("/{transfer_id}/reject", response_model=TransferOut)
def reject_transfer(transfer_id: int, db: Session = Depends(get_db),
                    approver: User = Depends(MANAGERIAL)):
    t = db.get(TransferRequest, transfer_id)
    if not t or t.status != TransferStatus.REQUESTED:
        raise HTTPException(404, "Pending transfer not found")
    t.status = TransferStatus.REJECTED
    t.approved_by = approver.id
    notify(db, t.requested_by, NotificationType.TRANSFER_REJECTED, "Transfer rejected",
           f"Transfer request #{t.id} was rejected.")
    log(db, approver.organization_id, approver.id, "transfer.rejected", "transfer", t.id)
    db.commit(); db.refresh(t)
    return t
