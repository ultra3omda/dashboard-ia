"""Organisation (tenant) model."""
from datetime import datetime
from pydantic import BaseModel, Field
import uuid


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.utcnow()


class OrgCreate(BaseModel):
    name: str
    slug: str  # URL-safe identifier


class Org(BaseModel):
    id: str = Field(default_factory=_uuid)
    name: str
    slug: str
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class OrgPublic(BaseModel):
    """Client-facing view (id is exposed as such, not as _id)."""
    id: str
    name: str
    slug: str
    created_at: datetime
