import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import (
    create_access_token, create_refresh_token, decode_token, get_current_user,
)
from app.core.security import hash_password, verify_password
from app.database.session import get_db
from app.models import Organization, PasswordResetToken, User
from app.models.enums import UserRole, UserStatus
from app.schemas import (
    ForgotIn, LoginIn, RefreshIn, ResetIn, SignupIn, TokenOut, UserOut,
)
from app.services.common import log, send_email

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", response_model=UserOut, status_code=201)
def signup(data: SignupIn, db: Session = Depends(get_db)):
    """Creates an EMPLOYEE account only. Roles are assigned by Admin in Employee Directory."""
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(409, "Email already registered")
    org = db.query(Organization).first()
    if not org:
        raise HTTPException(400, "Organization not initialized. Run seed/setup first.")
    count = db.query(User).filter(User.organization_id == org.id).count()
    user = User(
        organization_id=org.id, name=data.name, email=data.email,
        hashed_password=hash_password(data.password),
        department_id=data.department_id,
        role=UserRole.EMPLOYEE,                  # never self-elevating
        status=UserStatus.ACTIVE,
        employee_code=f"EMP-{count + 1:04d}",
    )
    db.add(user); db.flush()
    log(db, org.id, user.id, "user.signup", "user", user.id, f"{user.email} signed up as employee")
    db.commit(); db.refresh(user)
    return user


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(401, "Invalid email or password")
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(403, "Account is inactive")
    return TokenOut(access_token=create_access_token(user.id),
                    refresh_token=create_refresh_token(user.id))


@router.post("/refresh", response_model=TokenOut)
def refresh(data: RefreshIn, db: Session = Depends(get_db)):
    uid = decode_token(data.refresh_token, "refresh")
    if uid is None or not db.get(User, uid):
        raise HTTPException(401, "Invalid refresh token")
    return TokenOut(access_token=create_access_token(uid),
                    refresh_token=create_refresh_token(uid))


@router.post("/forgot-password")
def forgot(data: ForgotIn, bg: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if user:
        token = secrets.token_urlsafe(32)
        db.add(PasswordResetToken(
            user_id=user.id, token=token,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        ))
        db.commit()
        link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        bg.add_task(send_email, user.email, "AssetFlow password reset",
                    f"Reset your password: {link}\nLink expires in 1 hour.")
    return {"message": "If the email exists, a reset link has been sent."}


@router.post("/reset-password")
def reset(data: ResetIn, db: Session = Depends(get_db)):
    rec = db.query(PasswordResetToken).filter_by(token=data.token, used=False).first()
    exp = rec.expires_at if rec else None
    if exp is not None and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if not rec or exp < datetime.now(timezone.utc):
        raise HTTPException(400, "Invalid or expired token")
    user = db.get(User, rec.user_id)
    user.hashed_password = hash_password(data.password)
    rec.used = True
    log(db, user.organization_id, user.id, "user.password_reset", "user", user.id)
    db.commit()
    return {"message": "Password updated"}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
