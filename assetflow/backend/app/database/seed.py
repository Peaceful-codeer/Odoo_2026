"""Seed AssetFlow with a demo organization, users, master data and sample assets.

Run:  python -m app.database.seed
Idempotent: skips if the demo org already exists.
"""
from datetime import datetime, timedelta, timezone

from app.database.session import SessionLocal
from app.core.security import hash_password
from app.models import (
    Organization, Department, User, AssetCategory, Asset, Allocation,
)
from app.models.enums import (
    UserRole, UserStatus, DepartmentStatus, AssetStatus, AssetCondition,
    AllocationStatus,
)

NOW = datetime.now(timezone.utc)


def seed():
    db = SessionLocal()
    try:
        if db.query(Organization).filter_by(email="admin@acme-demo.com").first():
            print("Seed skipped: demo org exists.")
            return

        org = Organization(
            name="Acme Corp", email="admin@acme-demo.com", industry="IT",
            company_size="51-200", country="India",
        )
        db.add(org); db.flush()

        # Departments (with hierarchy: IT under Operations)
        ops = Department(organization_id=org.id, name="Operations", status=DepartmentStatus.ACTIVE)
        db.add(ops); db.flush()
        it = Department(organization_id=org.id, name="IT", parent_id=ops.id, status=DepartmentStatus.ACTIVE)
        hr = Department(organization_id=org.id, name="HR", status=DepartmentStatus.ACTIVE)
        fin = Department(organization_id=org.id, name="Finance", status=DepartmentStatus.ACTIVE)
        db.add_all([it, hr, fin]); db.flush()

        pw = hash_password("Passw0rd!")
        admin = User(organization_id=org.id, name="Admin User", email="admin@acme-demo.com",
                     hashed_password=pw, role=UserRole.ADMIN, status=UserStatus.ACTIVE,
                     department_id=it.id, employee_code="EMP-0001")
        mgr = User(organization_id=org.id, name="Asha Manager", email="assetmgr@acme-demo.com",
                   hashed_password=pw, role=UserRole.ASSET_MANAGER, status=UserStatus.ACTIVE,
                   department_id=it.id, employee_code="EMP-0002")
        head = User(organization_id=org.id, name="Dev Head", email="depthead@acme-demo.com",
                    hashed_password=pw, role=UserRole.DEPARTMENT_HEAD, status=UserStatus.ACTIVE,
                    department_id=it.id, employee_code="EMP-0003")
        emp = User(organization_id=org.id, name="Priya Sharma", email="priya@acme-demo.com",
                   hashed_password=pw, role=UserRole.EMPLOYEE, status=UserStatus.ACTIVE,
                   department_id=it.id, employee_code="EMP-0004")
        db.add_all([admin, mgr, head, emp]); db.flush()

        it.head_id = head.id

        # Categories with custom field definitions
        cat_elec = AssetCategory(
            organization_id=org.id, name="Electronics",
            description="Laptops, monitors, peripherals",
            custom_fields=[{"key": "warranty_months", "label": "Warranty (months)", "type": "number"}],
        )
        cat_furn = AssetCategory(organization_id=org.id, name="Furniture", custom_fields=[])
        cat_room = AssetCategory(organization_id=org.id, name="Rooms & Vehicles",
                                 description="Bookable shared resources", custom_fields=[])
        db.add_all([cat_elec, cat_furn, cat_room]); db.flush()

        # Assets
        laptop = Asset(
            organization_id=org.id, asset_tag="AF-0001", name="Dell Latitude 7450",
            category_id=cat_elec.id, serial_number="DL7450-9931",
            acquisition_date=NOW - timedelta(days=120), acquisition_cost=95000,
            condition=AssetCondition.GOOD, location="HQ - Floor 3",
            status=AssetStatus.ALLOCATED, owner_department_id=it.id, is_bookable=False,
            custom_values={"warranty_months": 36},
        )
        monitor = Asset(
            organization_id=org.id, asset_tag="AF-0002", name="LG 27UP850 Monitor",
            category_id=cat_elec.id, serial_number="LG27-2210",
            condition=AssetCondition.NEW, location="HQ - Floor 3",
            status=AssetStatus.AVAILABLE, owner_department_id=it.id,
        )
        room = Asset(
            organization_id=org.id, asset_tag="AF-0003", name="Conference Room B2",
            category_id=cat_room.id, condition=AssetCondition.GOOD, location="HQ - Floor 2",
            status=AssetStatus.AVAILABLE, is_bookable=True,
        )
        db.add_all([laptop, monitor, room]); db.flush()

        # Active allocation for laptop -> Priya (overdue for dashboard demo)
        db.add(Allocation(
            asset_id=laptop.id, holder_id=emp.id, department_id=it.id,
            allocated_by=mgr.id, allocated_at=NOW - timedelta(days=10),
            expected_return_date=NOW - timedelta(days=4), status=AllocationStatus.ACTIVE,
        ))

        db.commit()
        print("Seed complete.")
        print("  Admin login:        admin@acme-demo.com / Passw0rd!")
        print("  Asset Manager:      assetmgr@acme-demo.com / Passw0rd!")
        print("  Department Head:    depthead@acme-demo.com / Passw0rd!")
        print("  Employee (Priya):   priya@acme-demo.com / Passw0rd!")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
