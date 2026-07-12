import enum


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    ASSET_MANAGER = "asset_manager"
    DEPARTMENT_HEAD = "department_head"
    EMPLOYEE = "employee"


class UserStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    PENDING = "pending"


class DepartmentStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class AssetStatus(str, enum.Enum):
    AVAILABLE = "available"
    ALLOCATED = "allocated"
    RESERVED = "reserved"
    UNDER_MAINTENANCE = "under_maintenance"
    LOST = "lost"
    RETIRED = "retired"
    DISPOSED = "disposed"


class AssetCondition(str, enum.Enum):
    NEW = "new"
    GOOD = "good"
    FAIR = "fair"
    POOR = "poor"
    DAMAGED = "damaged"


class AllocationStatus(str, enum.Enum):
    ACTIVE = "active"
    RETURNED = "returned"


class TransferStatus(str, enum.Enum):
    REQUESTED = "requested"
    APPROVED = "approved"
    REJECTED = "rejected"
    COMPLETED = "completed"


class BookingStatus(str, enum.Enum):
    UPCOMING = "upcoming"
    ONGOING = "ongoing"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class MaintenanceStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    TECHNICIAN_ASSIGNED = "technician_assigned"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"


class MaintenancePriority(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AuditCycleStatus(str, enum.Enum):
    OPEN = "open"
    CLOSED = "closed"


class AuditItemStatus(str, enum.Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    MISSING = "missing"
    DAMAGED = "damaged"


class NotificationType(str, enum.Enum):
    ASSET_ASSIGNED = "asset_assigned"
    TRANSFER_APPROVED = "transfer_approved"
    TRANSFER_REJECTED = "transfer_rejected"
    RETURN_REMINDER = "return_reminder"
    OVERDUE_RETURN = "overdue_return"
    BOOKING_CONFIRMED = "booking_confirmed"
    BOOKING_CANCELLED = "booking_cancelled"
    BOOKING_REMINDER = "booking_reminder"
    MAINTENANCE_APPROVED = "maintenance_approved"
    MAINTENANCE_REJECTED = "maintenance_rejected"
    MAINTENANCE_COMPLETED = "maintenance_completed"
    AUDIT_REMINDER = "audit_reminder"
    AUDIT_DISCREPANCY = "audit_discrepancy"
