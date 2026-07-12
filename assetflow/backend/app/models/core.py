from datetime import datetime
from typing import Optional
from sqlalchemy import String, ForeignKey, Enum, Boolean, DateTime, Text, JSON, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin
from app.models.enums import UserRole, UserStatus, DepartmentStatus


class Organization(Base, TimestampMixin):
    __tablename__ = "organizations"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    industry: Mapped[Optional[str]] = mapped_column(String(100))
    company_size: Mapped[Optional[str]] = mapped_column(String(50))
    country: Mapped[Optional[str]] = mapped_column(String(100))


class Department(Base, TimestampMixin):
    __tablename__ = "departments"
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    parent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id"))
    head_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", use_alter=True))
    status: Mapped[DepartmentStatus] = mapped_column(
        Enum(DepartmentStatus), default=DepartmentStatus.ACTIVE, nullable=False
    )
    parent = relationship("Department", remote_side=[id])


class User(Base, TimestampMixin):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    employee_code: Mapped[Optional[str]] = mapped_column(String(50))
    department_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id"))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.EMPLOYEE, nullable=False)
    status: Mapped[UserStatus] = mapped_column(Enum(UserStatus), default=UserStatus.ACTIVE, nullable=False)


class AssetCategory(Base, TimestampMixin):
    __tablename__ = "asset_categories"
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    # category-specific custom field definitions, e.g. [{"key":"warranty_months","label":"Warranty","type":"number"}]
    custom_fields: Mapped[Optional[dict]] = mapped_column(JSON, default=list)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    token: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False)


class Settings(Base, TimestampMixin):
    __tablename__ = "settings"
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    key: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[Optional[str]] = mapped_column(Text)
