"""Authentication endpoints: register-org, login, logout, me, refresh."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Response, status, Cookie
from pymongo.errors import DuplicateKeyError

from app.core.database import get_db
from app.core.security import hash_password, verify_password
from app.core.jwt_utils import (
    create_access_token, create_refresh_token, decode_token,
    set_auth_cookies, clear_auth_cookies,
    REFRESH_COOKIE_NAME,
)
from app.core.dependencies import get_current_user
from app.models.user import (
    UserRegister, UserLogin, UserInDB, UserPublic, AuthResponse,
)
from app.models.org import Org
from app.models.settings import AppSettings
from app.models.enums import UserRole

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register-org", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register_org(payload: UserRegister, response: Response):
    """Create a new organisation + its first admin user.
    This is the public onboarding endpoint used by new tenants.
    """
    db = get_db()

    # Validate slug
    slug = payload.org_slug.lower().strip().replace(" ", "-")
    if not slug.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(
            status_code=400,
            detail="Slug must contain only letters, digits, hyphens or underscores",
        )

    # Create the org
    org = Org(name=payload.org_name, slug=slug)
    try:
        await db.orgs.insert_one(org.model_dump())
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Organisation slug already taken")

    # Create the admin user
    user = UserInDB(
        org_id=org.id,
        email=payload.email.lower(),
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role=UserRole.ADMIN,
    )
    try:
        await db.users.insert_one(user.model_dump())
    except DuplicateKeyError:
        # Rollback org creation
        await db.orgs.delete_one({"id": org.id})
        raise HTTPException(status_code=409, detail="Email already registered")

    # Create default settings for the org
    await db.settings.insert_one(AppSettings(org_id=org.id, companyName=payload.org_name).model_dump())

    # Issue tokens
    access = create_access_token(user.id, org.id, user.role.value)
    refresh = create_refresh_token(user.id, org.id)
    set_auth_cookies(response, access, refresh)

    return AuthResponse(
        user=UserPublic(**user.model_dump()),
        org={"id": org.id, "name": org.name, "slug": org.slug},
    )


@router.post("/login", response_model=AuthResponse)
async def login(payload: UserLogin, response: Response):
    """Authenticate an existing user and issue session cookies."""
    db = get_db()
    doc = await db.users.find_one({"email": payload.email.lower()})
    if not doc:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    doc.pop("_id", None)
    user = UserInDB(**doc)
    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    # Update last_login
    await db.users.update_one({"id": user.id}, {"$set": {"last_login": datetime.utcnow()}})
    user.last_login = datetime.utcnow()

    org_doc = await db.orgs.find_one({"id": user.org_id})
    if not org_doc:
        raise HTTPException(status_code=500, detail="Organisation missing for user")

    access = create_access_token(user.id, user.org_id, user.role.value)
    refresh = create_refresh_token(user.id, user.org_id)
    set_auth_cookies(response, access, refresh)

    return AuthResponse(
        user=UserPublic(**user.model_dump()),
        org={"id": org_doc["id"], "name": org_doc["name"], "slug": org_doc["slug"]},
    )


@router.post("/logout", status_code=204)
async def logout(response: Response):
    clear_auth_cookies(response)
    return Response(status_code=204)


@router.get("/me", response_model=AuthResponse)
async def me(user: UserInDB = Depends(get_current_user)):
    db = get_db()
    org_doc = await db.orgs.find_one({"id": user.org_id})
    if not org_doc:
        raise HTTPException(status_code=500, detail="Organisation missing")
    return AuthResponse(
        user=UserPublic(**user.model_dump()),
        org={"id": org_doc["id"], "name": org_doc["name"], "slug": org_doc["slug"]},
    )


@router.post("/refresh", status_code=204)
async def refresh(
    response: Response,
    cfp_refresh: str | None = Cookie(None, alias=REFRESH_COOKIE_NAME),
):
    """Exchange a valid refresh cookie for a fresh access cookie."""
    if not cfp_refresh:
        raise HTTPException(status_code=401, detail="No refresh token")
    payload = decode_token(cfp_refresh)
    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = payload["sub"]
    org_id = payload["org_id"]
    db = get_db()
    user_doc = await db.users.find_one({"id": user_id, "is_active": True})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found or disabled")

    new_access = create_access_token(user_id, org_id, user_doc["role"])
    new_refresh = create_refresh_token(user_id, org_id)
    set_auth_cookies(response, new_access, new_refresh)
    return Response(status_code=204)
