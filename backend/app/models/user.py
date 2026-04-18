"""User model with org scoping and RBAC."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field
import uuid
from app.models.enums import UserRole


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.utcnow()


class UserRegister(BaseModel):
    """Used for /auth/register-org - creates both the org and the first admin."""
    org_name: str
    org_slug: str
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    full_name: str


class UserCreate(BaseModel):
    """Used by an admin to invite another user to their org."""
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    full_name: str
    role: UserRole = UserRole.AGENT


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserInDB(BaseModel):
    id: str = Field(default_factory=_uuid)
    org_id: str
    email: str
    hashed_password: str
    full_name: str
    role: UserRole
    is_active: bool = True
    created_at: datetime = Field(default_factory=_now)
    last_login: Optional[datetime] = None


class UserPublic(BaseModel):
    id: str
    org_id: str
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime] = None


class AuthResponse(BaseModel):
    """Returned after successful login."""
    user: UserPublic
    org: dict  # Light org info: {id, name, slug}
