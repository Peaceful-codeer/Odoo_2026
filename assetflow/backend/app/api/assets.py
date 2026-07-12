import io
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import ANY_USER, ASSET_MANAGER
from app.database.session import get_db
from app.models import (
    Allocation, Asset, AssetDocument, MaintenanceRequest, User,
)
from app.models.enums import AssetStatus
from app.schemas import (
    AllocationOut, AssetIn, AssetOut, AssetUpdateIn, DocumentIn, DocumentOut,
    MaintenanceOut, StatusChangeIn,
)
from app.services.common import InvalidTransition, log, next_asset_tag, transition

router = APIRouter(prefix="/api/assets", tags=["assets"])


@router.get("", response_model=List[AssetOut])
def search_assets(
    q: Optional[str] = Query(None, description="Search tag/serial/name (QR scans resolve to tag)"),
    status: Optional[AssetStatus] = None,
    category_id: Optional[int] = None,
    department_id: Optional[int] = None,
    location: Optional[str] = None,
    bookable: Optional[bool] = None,
    skip: int = 0, limit: int = Query(50, le=200),
    db: Session = Depends(get_db), user: User = Depends(ANY_USER),
):
    qry = db.query(Asset).filter(Asset.organization_id == user.organization_id)
    if q:
        like = f"%{q}%"
        qry = qry.filter(or_(Asset.asset_tag.ilike(like), Asset.serial_number.ilike(like),
                             Asset.name.ilike(like)))
    if status:
        qry = qry.filter(Asset.status == status)
    if category_id:
        qry = qry.filter(Asset.category_id == category_id)
    if department_id:
        qry = qry.filter(Asset.owner_department_id == department_id)
    if location:
        qry = qry.filter(Asset.location.ilike(f"%{location}%"))
    if bookable is not None:
        qry = qry.filter(Asset.is_bookable == bookable)
    return qry.order_by(Asset.id.desc()).offset(skip).limit(limit).all()


@router.post("", response_model=AssetOut, status_code=201)
def register_asset(data: AssetIn, db: Session = Depends(get_db),
                   mgr: User = Depends(ASSET_MANAGER)):
    a = Asset(organization_id=mgr.organization_id,
              asset_tag=next_asset_tag(db, mgr.organization_id),
              status=AssetStatus.AVAILABLE, **data.model_dump())
    db.add(a); db.flush()
    log(db, mgr.organization_id, mgr.id, "asset.registered", "asset", a.id,
        f"{a.asset_tag} {a.name}")
    db.commit(); db.refresh(a)
    return a


@router.get("/{asset_id}", response_model=AssetOut)
def get_asset(asset_id: int, db: Session = Depends(get_db), user: User = Depends(ANY_USER)):
    a = db.get(Asset, asset_id)
    if not a or a.organization_id != user.organization_id:
        raise HTTPException(404, "Asset not found")
    return a


@router.patch("/{asset_id}", response_model=AssetOut)
def update_asset(asset_id: int, data: AssetUpdateIn, db: Session = Depends(get_db),
                 mgr: User = Depends(ASSET_MANAGER)):
    a = db.get(Asset, asset_id)
    if not a or a.organization_id != mgr.organization_id:
        raise HTTPException(404, "Asset not found")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(a, k, v)
    log(db, mgr.organization_id, mgr.id, "asset.updated", "asset", a.id, a.asset_tag)
    db.commit(); db.refresh(a)
    return a


@router.patch("/{asset_id}/status", response_model=AssetOut)
def change_status(asset_id: int, data: StatusChangeIn, db: Session = Depends(get_db),
                  mgr: User = Depends(ASSET_MANAGER)):
    """Manual lifecycle transitions (e.g. Retired, Disposed, Lost->Available)."""
    a = db.get(Asset, asset_id)
    if not a or a.organization_id != mgr.organization_id:
        raise HTTPException(404, "Asset not found")
    try:
        transition(db, a, data.status, mgr, data.notes or "")
    except InvalidTransition as e:
        raise HTTPException(400, str(e))
    db.commit(); db.refresh(a)
    return a


@router.get("/{asset_id}/qr")
def asset_qr(asset_id: int, db: Session = Depends(get_db), user: User = Depends(ANY_USER)):
    a = db.get(Asset, asset_id)
    if not a or a.organization_id != user.organization_id:
        raise HTTPException(404, "Asset not found")
    import qrcode
    buf = io.BytesIO()
    qrcode.make(a.asset_tag).save(buf, format="PNG")
    return Response(buf.getvalue(), media_type="image/png")


@router.get("/{asset_id}/history")
def asset_history(asset_id: int, db: Session = Depends(get_db), user: User = Depends(ANY_USER)):
    a = db.get(Asset, asset_id)
    if not a or a.organization_id != user.organization_id:
        raise HTTPException(404, "Asset not found")
    allocs = db.query(Allocation).filter_by(asset_id=asset_id).order_by(Allocation.id.desc()).all()
    maints = (db.query(MaintenanceRequest).filter_by(asset_id=asset_id)
              .order_by(MaintenanceRequest.id.desc()).all())
    return {
        "allocations": [AllocationOut.model_validate(x).model_dump() for x in allocs],
        "maintenance": [MaintenanceOut.model_validate(x).model_dump() for x in maints],
    }


@router.post("/{asset_id}/documents", response_model=DocumentOut, status_code=201)
def add_document(asset_id: int, data: DocumentIn, db: Session = Depends(get_db),
                 mgr: User = Depends(ASSET_MANAGER)):
    a = db.get(Asset, asset_id)
    if not a or a.organization_id != mgr.organization_id:
        raise HTTPException(404, "Asset not found")
    d = AssetDocument(asset_id=asset_id, **data.model_dump())
    db.add(d)
    db.commit(); db.refresh(d)
    return d


@router.get("/{asset_id}/documents", response_model=List[DocumentOut])
def list_documents(asset_id: int, db: Session = Depends(get_db), user: User = Depends(ANY_USER)):
    return db.query(AssetDocument).filter_by(asset_id=asset_id).all()
