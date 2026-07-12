from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import ANY_USER
from app.database.session import get_db
from app.models import Asset, Booking, User
from app.models.enums import BookingStatus, NotificationType
from app.schemas import BookingIn, BookingOut, RescheduleIn
from app.services.common import log, notify

router = APIRouter(prefix="/api/bookings", tags=["bookings"])


def _norm(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _effective_status(b: Booking) -> BookingStatus:
    if b.status == BookingStatus.CANCELLED:
        return b.status
    now = datetime.now(timezone.utc)
    s, e = _norm(b.start_time), _norm(b.end_time)
    if now < s:
        return BookingStatus.UPCOMING
    if now >= e:
        return BookingStatus.COMPLETED
    return BookingStatus.ONGOING


def _out(b: Booking) -> BookingOut:
    o = BookingOut.model_validate(b)
    o.status = _effective_status(b)
    return o


def _overlap_exists(db: Session, asset_id: int, start: datetime, end: datetime,
                    exclude_id: Optional[int] = None) -> bool:
    q = db.query(Booking).filter(
        Booking.asset_id == asset_id,
        Booking.status != BookingStatus.CANCELLED,
        Booking.start_time < end,
        Booking.end_time > start,
    )
    if exclude_id:
        q = q.filter(Booking.id != exclude_id)
    return db.query(q.exists()).scalar()


@router.get("", response_model=List[BookingOut])
def list_bookings(asset_id: Optional[int] = None, mine: bool = False,
                  db: Session = Depends(get_db), user: User = Depends(ANY_USER)):
    q = db.query(Booking).join(Asset).filter(Asset.organization_id == user.organization_id)
    if asset_id:
        q = q.filter(Booking.asset_id == asset_id)
    if mine:
        q = q.filter(Booking.booked_by == user.id)
    return [_out(b) for b in q.order_by(Booking.start_time).all()]


@router.post("", response_model=BookingOut, status_code=201)
def create_booking(data: BookingIn, db: Session = Depends(get_db), user: User = Depends(ANY_USER)):
    asset = db.get(Asset, data.asset_id)
    if not asset or asset.organization_id != user.organization_id:
        raise HTTPException(404, "Resource not found")
    if not asset.is_bookable:
        raise HTTPException(400, "Asset is not a bookable shared resource")
    start, end = _norm(data.start_time), _norm(data.end_time)
    if end <= start:
        raise HTTPException(400, "end_time must be after start_time")
    # PDF overlap rule: 9:00-10:00 booked -> 9:30-10:30 rejected; 10:00-11:00 fine
    if _overlap_exists(db, asset.id, start, end):
        raise HTTPException(409, "Time slot overlaps an existing booking")
    b = Booking(asset_id=asset.id, booked_by=user.id,
                department_id=data.department_id or user.department_id,
                start_time=start, end_time=end, purpose=data.purpose,
                status=BookingStatus.UPCOMING)
    db.add(b); db.flush()
    notify(db, user.id, NotificationType.BOOKING_CONFIRMED, "Booking confirmed",
           f"{asset.name} booked {start:%d %b %H:%M}–{end:%H:%M}.", {"booking_id": b.id})
    log(db, user.organization_id, user.id, "booking.created", "booking", b.id, asset.asset_tag)
    db.commit(); db.refresh(b)
    return _out(b)


@router.patch("/{booking_id}/reschedule", response_model=BookingOut)
def reschedule(booking_id: int, data: RescheduleIn, db: Session = Depends(get_db),
               user: User = Depends(ANY_USER)):
    b = db.get(Booking, booking_id)
    if not b or (b.booked_by != user.id and user.role.value == "employee"):
        raise HTTPException(404, "Booking not found")
    if b.status == BookingStatus.CANCELLED:
        raise HTTPException(400, "Cannot reschedule a cancelled booking")
    start, end = _norm(data.start_time), _norm(data.end_time)
    if end <= start:
        raise HTTPException(400, "end_time must be after start_time")
    if _overlap_exists(db, b.asset_id, start, end, exclude_id=b.id):
        raise HTTPException(409, "New slot overlaps an existing booking")
    b.start_time, b.end_time = start, end
    log(db, user.organization_id, user.id, "booking.rescheduled", "booking", b.id)
    db.commit(); db.refresh(b)
    return _out(b)


@router.post("/{booking_id}/cancel", response_model=BookingOut)
def cancel(booking_id: int, db: Session = Depends(get_db), user: User = Depends(ANY_USER)):
    b = db.get(Booking, booking_id)
    if not b or (b.booked_by != user.id and user.role.value == "employee"):
        raise HTTPException(404, "Booking not found")
    b.status = BookingStatus.CANCELLED
    notify(db, b.booked_by, NotificationType.BOOKING_CANCELLED, "Booking cancelled",
           f"Booking #{b.id} was cancelled.")
    log(db, user.organization_id, user.id, "booking.cancelled", "booking", b.id)
    db.commit(); db.refresh(b)
    return _out(b)
