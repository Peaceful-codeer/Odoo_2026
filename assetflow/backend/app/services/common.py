from datetime import datetime, timezone
from typing import Optional

from loguru import logger
from sqlalchemy.orm import Session

from app.models import Asset, ActivityLog, Notification, User
from app.models.enums import AssetStatus, NotificationType

# ---------------- State machine (7 PDF states) ----------------
ALLOWED_TRANSITIONS = {
    AssetStatus.AVAILABLE: {AssetStatus.RESERVED, AssetStatus.ALLOCATED,
                            AssetStatus.UNDER_MAINTENANCE, AssetStatus.RETIRED,
                            AssetStatus.LOST},
    AssetStatus.RESERVED: {AssetStatus.ALLOCATED, AssetStatus.AVAILABLE},
    AssetStatus.ALLOCATED: {AssetStatus.AVAILABLE, AssetStatus.UNDER_MAINTENANCE,
                            AssetStatus.LOST},
    AssetStatus.UNDER_MAINTENANCE: {AssetStatus.AVAILABLE, AssetStatus.ALLOCATED,
                                    AssetStatus.RETIRED},
    AssetStatus.LOST: {AssetStatus.AVAILABLE},          # found during later audit
    AssetStatus.RETIRED: {AssetStatus.DISPOSED},
    AssetStatus.DISPOSED: set(),                        # terminal
}


class InvalidTransition(Exception):
    pass


def transition(db: Session, asset: Asset, new_status: AssetStatus,
               actor: Optional[User] = None, detail: str = "") -> Asset:
    if new_status == asset.status:
        return asset
    if new_status not in ALLOWED_TRANSITIONS[asset.status]:
        raise InvalidTransition(f"{asset.status.value} -> {new_status.value} not allowed")
    old = asset.status
    asset.status = new_status
    log(db, asset.organization_id, actor.id if actor else None,
        "asset.status_changed", "asset", asset.id,
        f"{asset.asset_tag}: {old.value} -> {new_status.value}. {detail}".strip())
    return asset


# ---------------- Activity log ----------------
def log(db: Session, org_id: int, actor_id: Optional[int], action: str,
        entity_type: Optional[str] = None, entity_id: Optional[int] = None,
        detail: str = "") -> None:
    db.add(ActivityLog(
        organization_id=org_id, actor_id=actor_id, action=action,
        entity_type=entity_type, entity_id=entity_id, detail=detail,
        created_at=datetime.now(timezone.utc),
    ))


# ---------------- Notifications ----------------
def notify(db: Session, user_id: int, ntype: NotificationType, title: str,
           message: str = "", payload: Optional[dict] = None) -> None:
    db.add(Notification(user_id=user_id, type=ntype, title=title,
                        message=message, payload=payload or {}))


# ---------------- Email (console fallback; SMTP if configured) ----------------
def send_email(to: str, subject: str, body: str) -> None:
    from app.core.config import settings
    if not settings.SMTP_HOST:
        logger.info(f"[EMAIL:console] to={to} subject={subject}\n{body}")
        return
    try:
        import smtplib
        from email.mime.text import MIMEText
        msg = MIMEText(body)
        msg["Subject"], msg["From"], msg["To"] = subject, settings.SMTP_USER, to
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as s:
            s.starttls()
            s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            s.send_message(msg)
    except Exception as e:
        logger.error(f"Email send failed: {e}")


# ---------------- Asset tag ----------------
def next_asset_tag(db: Session, org_id: int) -> str:
    last = (db.query(Asset).filter(Asset.organization_id == org_id)
            .order_by(Asset.id.desc()).first())
    n = 0
    if last and last.asset_tag.startswith("AF-"):
        try:
            n = int(last.asset_tag.split("-")[1])
        except ValueError:
            n = last.id
    return f"AF-{n + 1:04d}"
