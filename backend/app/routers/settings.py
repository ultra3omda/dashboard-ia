"""Per-org app settings (scoring, thresholds, aging buckets, team, branding)."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_admin
from app.models.user import UserInDB
from app.models.settings import AppSettings, AppSettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=AppSettings)
async def get_settings(user: UserInDB = Depends(get_current_user)):
    db = get_db()
    doc = await db.settings.find_one({"org_id": user.org_id})
    if not doc:
        # Create default on the fly
        settings = AppSettings(org_id=user.org_id)
        await db.settings.insert_one(settings.model_dump())
        return settings
    doc.pop("_id", None)
    return AppSettings(**doc)


@router.patch("", response_model=AppSettings)
async def update_settings(
    payload: AppSettingsUpdate,
    user: UserInDB = Depends(require_admin),
):
    db = get_db()
    update = {k: (v.model_dump() if hasattr(v, "model_dump") else v)
              for k, v in payload.model_dump(exclude_unset=True).items()
              if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    update["updated_at"] = datetime.utcnow()
    doc = await db.settings.find_one_and_update(
        {"org_id": user.org_id},
        {"$set": update, "$setOnInsert": {"org_id": user.org_id}},
        upsert=True,
        return_document=True,
    )
    doc.pop("_id", None)
    return AppSettings(**doc)
