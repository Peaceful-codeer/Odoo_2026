from datetime import datetime
from typing import Optional
from sqlalchemy import String, ForeignKey, Enum, Boolean, DateTime, Text, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin
from app.models.enums import (
    BookingStatus, MaintenanceStatus, MaintenancePriority,
    AuditCycleStatus, AuditItemStatus, NotificationType,
)


class Booking(Base, TimestampMixin):
    __tablename__ = "bookings"
    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), nullable=False)
    booked_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    department_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id"))
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    purpose: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[BookingStatus] = mapped_column(
        Enum(BookingStatus), default=BookingStatus.UPCOMING, nullable=False
    )
    # Overlap prevented at DB level via exclusion constraint (added in migration):
    #   EXCLUDE USING gist (asset_id WITH =, tstzrange(start_time,end_time) WITH &&)
    #   WHERE status <> 'cancelled'
    __table_args__ = (Index("ix_bookings_asset_time", "asset_id", "start_time", "end_time"),)


class MaintenanceRequest(Base, TimestampMixin):
    __tablename__ = "maintenance_requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), nullable=False)
    raised_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    approved_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    technician_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    issue_description: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[MaintenancePriority] = mapped_column(
        Enum(MaintenancePriority), default=MaintenancePriority.MEDIUM, nullable=False
    )
    attachment_url: Mapped[Optional[str]] = mapped_column(String(500))
    resolution_notes: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[MaintenanceStatus] = mapped_column(
        Enum(MaintenanceStatus), default=MaintenanceStatus.PENDING, nullable=False
    )


class AuditCycle(Base, TimestampMixin):
    __tablename__ = "audit_cycles"
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    scope_department_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id"))
    scope_location: Mapped[Optional[str]] = mapped_column(String(200))
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    auditor_ids: Mapped[Optional[list]] = mapped_column(JSON, default=list)  # [user_id,...]
    status: Mapped[AuditCycleStatus] = mapped_column(
        Enum(AuditCycleStatus), default=AuditCycleStatus.OPEN, nullable=False
    )
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class AuditItem(Base, TimestampMixin):
    __tablename__ = "audit_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("audit_cycles.id"), nullable=False)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), nullable=False)
    verified_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[AuditItemStatus] = mapped_column(
        Enum(AuditItemStatus), default=AuditItemStatus.PENDING, nullable=False
    )


class Notification(Base, TimestampMixin):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    type: Mapped[NotificationType] = mapped_column(Enum(NotificationType), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[Optional[str]] = mapped_column(Text)
    payload: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class ActivityLog(Base):
    __tablename__ = "activity_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    actor_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(100), nullable=False)  # e.g. asset.allocated
    entity_type: Mapped[Optional[str]] = mapped_column(String(50))
    entity_id: Mapped[Optional[int]] = mapped_column()
    detail: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    __table_args__ = (Index("ix_activity_org_created", "organization_id", "created_at"),)
