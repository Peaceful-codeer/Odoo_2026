from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from loguru import logger

from app.database.session import SessionLocal
from app.models import Allocation, Booking, Asset
from app.models.enums import AllocationStatus, BookingStatus, NotificationType
from app.services.common import notify


def _norm(dt):
    return dt.replace(tzinfo=timezone.utc) if dt and dt.tzinfo is None else dt


def booking_reminders():
    """Notify holders 15-30 min before their booking starts (runs every 15 min)."""
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        window_end = now + timedelta(minutes=30)
        for b in db.query(Booking).filter(Booking.status == BookingStatus.UPCOMING):
            s = _norm(b.start_time)
            if now <= s <= window_end:
                asset = db.get(Asset, b.asset_id)
                notify(db, b.booked_by, NotificationType.BOOKING_REMINDER,
                       "Booking starting soon",
                       f"{asset.name} booking starts at {s:%H:%M}.", {"booking_id": b.id})
        db.commit()
    except Exception as e:
        logger.error(f"booking_reminders failed: {e}")
        db.rollback()
    finally:
        db.close()


def overdue_alerts():
    """Daily overdue-return alerts to holders."""
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        q = db.query(Allocation).filter(Allocation.status == AllocationStatus.ACTIVE,
                                        Allocation.expected_return_date.isnot(None))
        for a in q:
            if _norm(a.expected_return_date) < now:
                asset = db.get(Asset, a.asset_id)
                notify(db, a.holder_id, NotificationType.OVERDUE_RETURN,
                       "Overdue return",
                       f"{asset.asset_tag} {asset.name} return is overdue.",
                       {"allocation_id": a.id})
        db.commit()
    except Exception as e:
        logger.error(f"overdue_alerts failed: {e}")
        db.rollback()
    finally:
        db.close()


def start_scheduler() -> BackgroundScheduler:
    sched = BackgroundScheduler(timezone="UTC")
    sched.add_job(booking_reminders, "interval", minutes=15, id="booking_reminders")
    sched.add_job(overdue_alerts, "cron", hour=6, id="overdue_alerts")
    sched.start()
    logger.info("APScheduler started (booking reminders q15m, overdue alerts daily)")
    return sched
