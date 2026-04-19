"""JWT tokens for authentication — signed with HS256, stored in httpOnly cookies."""
from datetime import datetime, timedelta
from typing import Optional
import jwt
from app.core.config import get_settings

ALGORITHM = "HS256"
ACCESS_COOKIE_NAME = "cfp_access"
REFRESH_COOKIE_NAME = "cfp_refresh"


def create_access_token(user_id: str, org_id: str, role: str) -> str:
    settings = get_settings()
    now = datetime.utcnow()
    payload = {
        "sub": user_id,
        "org_id": org_id,
        "role": role,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_access_ttl_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def create_refresh_token(user_id: str, org_id: str) -> str:
    settings = get_settings()
    now = datetime.utcnow()
    payload = {
        "sub": user_id,
        "org_id": org_id,
        "type": "refresh",
        "iat": now,
        "exp": now + timedelta(days=settings.jwt_refresh_ttl_days),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT. Returns None on failure."""
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except (jwt.InvalidTokenError, jwt.ExpiredSignatureError):
        return None


def _normalize_samesite(value: str) -> str:
    """Starlette expects 'lax' | 'strict' | 'none' (lowercase)."""
    s = (value or "lax").strip().lower()
    if s not in ("lax", "strict", "none"):
        return "lax"
    return s


def set_auth_cookies(response, access_token: str, refresh_token: str) -> None:
    """Attach access + refresh as httpOnly cookies on the response."""
    settings = get_settings()
    common = dict(
        httponly=True,
        secure=settings.cookie_secure,
        samesite=_normalize_samesite(settings.cookie_samesite),
        path="/",
    )
    if settings.cookie_domain:
        common["domain"] = settings.cookie_domain

    response.set_cookie(
        key=ACCESS_COOKIE_NAME,
        value=access_token,
        max_age=settings.jwt_access_ttl_minutes * 60,
        **common,
    )
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=settings.jwt_refresh_ttl_days * 24 * 3600,
        **common,
    )


def clear_auth_cookies(response) -> None:
    settings = get_settings()
    common = dict(
        path="/",
        secure=settings.cookie_secure,
        samesite=_normalize_samesite(settings.cookie_samesite),
    )
    if settings.cookie_domain:
        common["domain"] = settings.cookie_domain
    response.delete_cookie(ACCESS_COOKIE_NAME, **common)
    response.delete_cookie(REFRESH_COOKIE_NAME, **common)
