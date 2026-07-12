from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, EmailStr, Field, ConfigDict

from app.models.enums import (
    UserRole, UserStatus, DepartmentStatus, AssetStatus, AssetCondition,
    TransferStatus, BookingStatus, MaintenanceStatus, MaintenancePriority,
    AuditCycleStatus, AuditItemStatus, NotificationType,
)


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Auth ----------
class SignupIn(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    department_id: Optional[int] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshIn(BaseModel):
    refresh_token: str


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=72)


# ---------- Users ----------
class UserOut(ORM):
    id: int
    name: str
    email: EmailStr
    employee_code: Optional[str]
    department_id: Optional[int]
    role: UserRole
    status: UserStatus


class UserCreateIn(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    department_id: Optional[int] = None
    employee_code: Optional[str] = None


class UserUpdateIn(BaseModel):
    name: Optional[str] = None
    department_id: Optional[int] = None
    status: Optional[UserStatus] = None


class RoleUpdateIn(BaseModel):
    role: UserRole


# ---------- Departments / Categories ----------
class DeptIn(BaseModel):
    name: str
    parent_id: Optional[int] = None
    head_id: Optional[int] = None
    status: DepartmentStatus = DepartmentStatus.ACTIVE


class DeptOut(ORM):
    id: int
    name: str
    parent_id: Optional[int]
    head_id: Optional[int]
    status: DepartmentStatus


class CategoryIn(BaseModel):
    name: str
    description: Optional[str] = None
    custom_fields: List[dict] = []


class CategoryOut(ORM):
    id: int
    name: str
    description: Optional[str]
    custom_fields: Optional[Any]


# ---------- Assets ----------
class AssetIn(BaseModel):
    name: str
    category_id: int
    serial_number: Optional[str] = None
    acquisition_date: Optional[datetime] = None
    acquisition_cost: Optional[float] = None
    condition: AssetCondition = AssetCondition.GOOD
    location: Optional[str] = None
    owner_department_id: Optional[int] = None
    is_bookable: bool = False
    custom_values: dict = {}


class AssetUpdateIn(BaseModel):
    name: Optional[str] = None
    serial_number: Optional[str] = None
    condition: Optional[AssetCondition] = None
    location: Optional[str] = None
    owner_department_id: Optional[int] = None
    is_bookable: Optional[bool] = None
    custom_values: Optional[dict] = None


class AssetOut(ORM):
    id: int
    asset_tag: str
    name: str
    category_id: int
    serial_number: Optional[str]
    acquisition_date: Optional[datetime]
    acquisition_cost: Optional[float]
    condition: AssetCondition
    location: Optional[str]
    status: AssetStatus
    owner_department_id: Optional[int]
    is_bookable: bool
    custom_values: Optional[Any]


class StatusChangeIn(BaseModel):
    status: AssetStatus
    notes: Optional[str] = None


class DocumentIn(BaseModel):
    url: str
    doc_type: Optional[str] = None
    label: Optional[str] = None


class DocumentOut(ORM):
    id: int
    url: str
    doc_type: Optional[str]
    label: Optional[str]


# ---------- Allocation / Transfer ----------
class AllocateIn(BaseModel):
    asset_id: int
    holder_id: int
    department_id: Optional[int] = None
    expected_return_date: Optional[datetime] = None


class AllocationOut(ORM):
    id: int
    asset_id: int
    holder_id: int
    department_id: Optional[int]
    allocated_by: int
    allocated_at: datetime
    expected_return_date: Optional[datetime]
    returned_at: Optional[datetime]
    return_condition: Optional[str]
    return_notes: Optional[str]
    status: str
    is_overdue: bool = False


class ReturnIn(BaseModel):
    condition: AssetCondition = AssetCondition.GOOD
    notes: Optional[str] = None


class TransferIn(BaseModel):
    asset_id: int
    to_user_id: int
    reason: Optional[str] = None


class TransferOut(ORM):
    id: int
    asset_id: int
    from_user_id: Optional[int]
    to_user_id: int
    requested_by: int
    approved_by: Optional[int]
    reason: Optional[str]
    status: TransferStatus
    created_at: datetime


# ---------- Booking ----------
class BookingIn(BaseModel):
    asset_id: int
    start_time: datetime
    end_time: datetime
    purpose: Optional[str] = None
    department_id: Optional[int] = None


class RescheduleIn(BaseModel):
    start_time: datetime
    end_time: datetime


class BookingOut(ORM):
    id: int
    asset_id: int
    booked_by: int
    department_id: Optional[int]
    start_time: datetime
    end_time: datetime
    purpose: Optional[str]
    status: BookingStatus


# ---------- Maintenance ----------
class MaintenanceIn(BaseModel):
    asset_id: int
    issue_description: str
    priority: MaintenancePriority = MaintenancePriority.MEDIUM
    attachment_url: Optional[str] = None


class TechnicianIn(BaseModel):
    technician_id: int


class ResolveIn(BaseModel):
    resolution_notes: Optional[str] = None


class MaintenanceOut(ORM):
    id: int
    asset_id: int
    raised_by: int
    approved_by: Optional[int]
    technician_id: Optional[int]
    issue_description: str
    priority: MaintenancePriority
    attachment_url: Optional[str]
    resolution_notes: Optional[str]
    status: MaintenanceStatus
    created_at: datetime


# ---------- Audit ----------
class AuditCycleIn(BaseModel):
    name: str
    scope_department_id: Optional[int] = None
    scope_location: Optional[str] = None
    start_date: datetime
    end_date: datetime
    auditor_ids: List[int] = []


class AuditCycleOut(ORM):
    id: int
    name: str
    scope_department_id: Optional[int]
    scope_location: Optional[str]
    start_date: datetime
    end_date: datetime
    created_by: int
    auditor_ids: Optional[Any]
    status: AuditCycleStatus
    closed_at: Optional[datetime]


class AuditMarkIn(BaseModel):
    status: AuditItemStatus
    notes: Optional[str] = None


class AuditItemOut(ORM):
    id: int
    cycle_id: int
    asset_id: int
    verified_by: Optional[int]
    verified_at: Optional[datetime]
    notes: Optional[str]
    status: AuditItemStatus


# ---------- Notifications / Logs ----------
class NotificationOut(ORM):
    id: int
    type: NotificationType
    title: str
    message: Optional[str]
    payload: Optional[Any]
    is_read: bool
    created_at: datetime


class ActivityOut(ORM):
    id: int
    actor_id: Optional[int]
    action: str
    entity_type: Optional[str]
    entity_id: Optional[int]
    detail: Optional[str]
    created_at: datetime
