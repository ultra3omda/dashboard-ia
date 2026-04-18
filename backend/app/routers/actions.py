"""CRUD for action relances."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import UserInDB
from app.models.business import Action, ActionIn, ActionPublic, ActionUpdate

router = APIRouter(prefix="/actions", tags=["actions"])


def _to_public(doc: dict) -> ActionPublic:
    doc.pop("_id", None)
    return ActionPublic(**{k: doc.get(k) for k in ActionPublic.model_fields})


@router.get("", response_model=list[ActionPublic])
async def list_actions(user: UserInDB = Depends(get_current_user)):
    db = get_db()
    cursor = db.actions.find({"org_id": user.org_id}).sort("datePrevue", 1)
    out = []
    async for d in cursor:
        out.append(_to_public(d))
    return out


@router.post("", response_model=ActionPublic, status_code=201)
async def create_action(
    payload: ActionIn,
    user: UserInDB = Depends(get_current_user),
):
    db = get_db()
    action = Action(
        org_id=user.org_id,
        created_by=user.id,
        **payload.model_dump(),
    )
    await db.actions.insert_one(action.model_dump())
    doc = action.model_dump()
    return _to_public(doc)


@router.patch("/{action_id}", response_model=ActionPublic)
async def update_action(
    action_id: str,
    payload: ActionUpdate,
    user: UserInDB = Depends(get_current_user),
):
    db = get_db()
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    update["updated_at"] = datetime.utcnow()
    res = await db.actions.find_one_and_update(
        {"id": action_id, "org_id": user.org_id},
        {"$set": update},
        return_document=True,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Action not found")
    return _to_public(res)


@router.delete("/{action_id}", status_code=204)
async def delete_action(
    action_id: str,
    user: UserInDB = Depends(get_current_user),
):
    db = get_db()
    res = await db.actions.delete_one({"id": action_id, "org_id": user.org_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Action not found")
