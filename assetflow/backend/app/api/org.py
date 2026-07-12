from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import ADMIN, ANY_USER
from app.core.security import hash_password
from app.database.session import get_db
from app.models import AssetCategory, Department, User
from app.models.enums import UserRole, UserStatus
from app.schemas import (
    CategoryIn, CategoryOut, DeptIn, DeptOut, RoleUpdateIn,
    UserCreateIn, UserOut, UserUpdateIn,
)
from app.services.common import log

router = APIRouter(prefix="/api/org", tags=["organization-setup"])


# ---------- Tab A: Departments ----------
@router.get("/departments", response_model=List[DeptOut])
def list_departments(db: Session = Depends(get_db), user: User = Depends(ANY_USER)):
    return db.query(Department).filter_by(organization_id=user.organization_id).all()


@router.post("/departments", response_model=DeptOut, status_code=201)
def create_department(data: DeptIn, db: Session = Depends(get_db), admin: User = Depends(ADMIN)):
    if data.parent_id and not db.get(Department, data.parent_id):
        raise HTTPException(404, "Parent department not found")
    d = Department(organization_id=admin.organization_id, **data.model_dump())
    db.add(d); db.flush()
    log(db, admin.organization_id, admin.id, "department.created", "department", d.id, d.name)
    db.commit(); db.refresh(d)
    return d


@router.patch("/departments/{dept_id}", response_model=DeptOut)
def update_department(dept_id: int, data: DeptIn, db: Session = Depends(get_db),
                      admin: User = Depends(ADMIN)):
    d = db.get(Department, dept_id)
    if not d or d.organization_id != admin.organization_id:
        raise HTTPException(404, "Department not found")
    if data.parent_id == dept_id:
        raise HTTPException(400, "Department cannot be its own parent")
    if data.head_id:
        head = db.get(User, data.head_id)
        if not head:
            raise HTTPException(404, "Head user not found")
        if head.role == UserRole.EMPLOYEE:
            head.role = UserRole.DEPARTMENT_HEAD
    for k, v in data.model_dump().items():
        setattr(d, k, v)
    log(db, admin.organization_id, admin.id, "department.updated", "department", d.id, d.name)
    db.commit(); db.refresh(d)
    return d


# ---------- Tab B: Categories ----------
@router.get("/categories", response_model=List[CategoryOut])
def list_categories(db: Session = Depends(get_db), user: User = Depends(ANY_USER)):
    return db.query(AssetCategory).filter_by(organization_id=user.organization_id).all()


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(data: CategoryIn, db: Session = Depends(get_db), admin: User = Depends(ADMIN)):
    c = AssetCategory(organization_id=admin.organization_id, **data.model_dump())
    db.add(c); db.flush()
    log(db, admin.organization_id, admin.id, "category.created", "category", c.id, c.name)
    db.commit(); db.refresh(c)
    return c


@router.patch("/categories/{cat_id}", response_model=CategoryOut)
def update_category(cat_id: int, data: CategoryIn, db: Session = Depends(get_db),
                    admin: User = Depends(ADMIN)):
    c = db.get(AssetCategory, cat_id)
    if not c or c.organization_id != admin.organization_id:
        raise HTTPException(404, "Category not found")
    for k, v in data.model_dump().items():
        setattr(c, k, v)
    db.commit(); db.refresh(c)
    return c


# ---------- Tab C: Employee Directory ----------
@router.get("/employees", response_model=List[UserOut])
def list_employees(role: Optional[UserRole] = None, status: Optional[UserStatus] = None,
                   db: Session = Depends(get_db), admin: User = Depends(ADMIN)):
    q = db.query(User).filter_by(organization_id=admin.organization_id)
    if role:
        q = q.filter(User.role == role)
    if status:
        q = q.filter(User.status == status)
    return q.all()


@router.post("/employees", response_model=UserOut, status_code=201)
def create_employee(data: UserCreateIn, db: Session = Depends(get_db), admin: User = Depends(ADMIN)):
    if db.query(User).filter_by(email=data.email).first():
        raise HTTPException(409, "Email already exists")
    count = db.query(User).filter_by(organization_id=admin.organization_id).count()
    u = User(
        organization_id=admin.organization_id, name=data.name, email=data.email,
        hashed_password=hash_password(data.password), department_id=data.department_id,
        employee_code=data.employee_code or f"EMP-{count + 1:04d}",
        role=UserRole.EMPLOYEE, status=UserStatus.ACTIVE,
    )
    db.add(u); db.flush()
    log(db, admin.organization_id, admin.id, "user.created", "user", u.id, u.email)
    db.commit(); db.refresh(u)
    return u


@router.patch("/employees/{user_id}", response_model=UserOut)
def update_employee(user_id: int, data: UserUpdateIn, db: Session = Depends(get_db),
                    admin: User = Depends(ADMIN)):
    u = db.get(User, user_id)
    if not u or u.organization_id != admin.organization_id:
        raise HTTPException(404, "User not found")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(u, k, v)
    log(db, admin.organization_id, admin.id, "user.updated", "user", u.id)
    db.commit(); db.refresh(u)
    return u


@router.patch("/employees/{user_id}/role", response_model=UserOut)
def promote_employee(user_id: int, data: RoleUpdateIn, db: Session = Depends(get_db),
                     admin: User = Depends(ADMIN)):
    """The ONLY place roles are assigned (PDF requirement)."""
    u = db.get(User, user_id)
    if not u or u.organization_id != admin.organization_id:
        raise HTTPException(404, "User not found")
    if u.id == admin.id and data.role != UserRole.ADMIN:
        raise HTTPException(400, "Admin cannot demote themselves")
    old = u.role
    u.role = data.role
    log(db, admin.organization_id, admin.id, "user.role_changed", "user", u.id,
        f"{u.email}: {old.value} -> {data.role.value}")
    db.commit(); db.refresh(u)
    return u
