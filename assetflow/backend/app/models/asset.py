from datetime import datetime
from typing import Optional
from sqlalchemy import String, ForeignKey, Enum, Boolean, DateTime, Text, Numeric, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin
from app.models.enums import (
    AssetStatus, AssetCondition, AllocationStatus, TransferStatus,
)


class Asset(Base, TimestampMixin):
    __tablename__ = "assets"
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    asset_tag: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)  # AF-0001
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category_id: Mapped[int] = mapped_column(ForeignKey("asset_categories.id"), nullable=False)
    serial_number: Mapped[Optional[str]] = mapped_column(String(150))
    acquisition_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    acquisition_cost: Mapped[Optional[float]] = mapped_column(Numeric(12, 2))
    condition: Mapped[AssetCondition] = mapped_column(
        Enum(AssetCondition), default=AssetCondition.GOOD, nullable=False
    )
    location: Mapped[Optional[str]] = mapped_column(String(200))
    status: Mapped[AssetStatus] = mapped_column(
        Enum(AssetStatus), default=AssetStatus.AVAILABLE, nullable=False
    )
    owner_department_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id"))
    is_bookable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    qr_url: Mapped[Optional[str]] = mapped_column(String(500))
    custom_values: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)


class AssetDocument(Base, TimestampMixin):
    __tablename__ = "asset_documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)  # Cloudinary URL
    doc_type: Mapped[Optional[str]] = mapped_column(String(50))  # photo, warranty, invoice
    label: Mapped[Optional[str]] = mapped_column(String(150))


class Allocation(Base, TimestampMixin):
    __tablename__ = "allocations"
    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), nullable=False)
    holder_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    department_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id"))
    allocated_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    allocated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expected_return_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    returned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    return_condition: Mapped[Optional[str]] = mapped_column(String(50))
    return_notes: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[AllocationStatus] = mapped_column(
        Enum(AllocationStatus), default=AllocationStatus.ACTIVE, nullable=False
    )


class TransferRequest(Base, TimestampMixin):
    __tablename__ = "transfer_requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), nullable=False)
    from_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    to_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    requested_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    approved_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    reason: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[TransferStatus] = mapped_column(
        Enum(TransferStatus), default=TransferStatus.REQUESTED, nullable=False
    )
