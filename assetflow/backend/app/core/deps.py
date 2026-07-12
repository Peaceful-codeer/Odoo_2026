from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.session import get_db
from app.models import User
from app.models.enums import UserRole, UserStatus

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def create_token(sub: str, expires_delta: timedelta, token_type: str = "access") -> str:
    payload = {
        "sub": sub, "type": token_type,
        "exp": datetime.now(timezone.utc) + expires_delta,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_access_token(user_id: int) -> str:
    return create_token(str(user_id), timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))


def create_refresh_token(user_id: int) -> str:
    return create_token(str(user_id), timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS), "refresh")


def decode_token(token: str, expected_type: str = "access") -> Optional[int]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != expected_type:
            return None
        return int(payload["sub"])
    except (JWTError, ValueError):
        return None


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    uid = decode_token(token)
    if uid is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = db.get(User, uid)
    if not user or user.status != UserStatus.ACTIVE:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Inactive or unknown user")
    return user


def require_roles(*roles: UserRole):
    def guard(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        return user
    return guard


ADMIN = require_roles(UserRole.ADMIN)
ASSET_MANAGER = require_roles(UserRole.ASSET_MANAGER, UserRole.ADMIN)
MANAGERIAL = require_roles(UserRole.ASSET_MANAGER, UserRole.DEPARTMENT_HEAD, UserRole.ADMIN)
ANY_USER = get_current_user
