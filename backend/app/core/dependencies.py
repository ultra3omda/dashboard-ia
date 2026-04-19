"""FastAPI dependencies for authentication and authorisation."""
from typing import Optional
from fastapi import Cookie, Depends, Header, HTTPException, status
from app.core.database import get_db
from app.core.jwt_utils import decode_token, ACCESS_COOKIE_NAME
from app.models.user import UserInDB
from app.models.enums import UserRole


def _access_token_from_request(
    authorization: Optional[str],
    cfp_access: Optional[str],
) -> Optional[str]:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip() or None
    return cfp_access


async def get_current_user(
    authorization: Optional[str] = Header(None),
    cfp_access: Optional[str] = Cookie(None, alias=ACCESS_COOKIE_NAME),
) -> UserInDB:
    """Decode access JWT from cookie or Authorization: Bearer. Raises 401 on failure."""
    token = _access_token_from_request(authorization, cfp_access)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    payload = decode_token(token)
    if payload is None or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
        )
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    db = get_db()
    doc = await db.users.find_one({"id": user_id})
    if not doc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not doc.get("is_active", True):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User disabled")
    doc.pop("_id", None)
    return UserInDB(**doc)


def require_role(*allowed_roles: UserRole):
    """Returns a dependency that checks the caller has one of the allowed roles.
    super_admin always passes.
    """
    allowed_set = {r.value for r in allowed_roles}

    async def _dep(user: UserInDB = Depends(get_current_user)) -> UserInDB:
        if user.role == UserRole.SUPER_ADMIN:
            return user
        if user.role.value not in allowed_set:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return _dep


def require_admin(user: UserInDB = Depends(get_current_user)) -> UserInDB:
    """Shortcut for admin+ access."""
    if user.role not in {UserRole.SUPER_ADMIN, UserRole.ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user
