"""CRUD endpoints for report configurations + manual send + run history."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_admin
from app.models.user import UserInDB
from app.models.report import (
    ReportConfig, ReportConfigCreate, ReportConfigUpdate, TEMPLATE_PRESETS,
)
from app.services.report_runner import run_report

router = APIRouter(prefix="/reports", tags=["reports"])


def _doc_to_config(doc: dict) -> ReportConfig:
    doc.pop("_id", None)
    return ReportConfig(**doc)


@router.get("/presets")
async def list_presets(_user: UserInDB = Depends(get_current_user)):
    """Return the curated templates (CEO, CFO, etc.) the UI offers at creation time."""
    return {
        key: {
            "name": v["name"],
            "description": v["description"],
            "sections": v["sections"].model_dump(),
        }
        for key, v in TEMPLATE_PRESETS.items()
    }


@router.get("/configs", response_model=list[ReportConfig])
async def list_configs(user: UserInDB = Depends(get_current_user)):
    db = get_db()
    cursor = db.report_configs.find({"org_id": user.org_id}).sort("created_at", -1)
    out = []
    async for d in cursor:
        out.append(_doc_to_config(d))
    return out


@router.post("/configs", response_model=ReportConfig, status_code=201)
async def create_config(
    payload: ReportConfigCreate,
    user: UserInDB = Depends(require_admin),
):
    db = get_db()
    config = ReportConfig(
        org_id=user.org_id,
        created_by=user.id,
        name=payload.name,
        description=payload.description,
        recipients=[r.lower() for r in payload.recipients],
        schedule=payload.schedule,
        filters=payload.filters,
        sections=payload.sections,
        template=payload.template,
        enabled=payload.enabled,
    )
    await db.report_configs.insert_one(config.model_dump())
    return config


@router.patch("/configs/{config_id}", response_model=ReportConfig)
async def update_config(
    config_id: str,
    payload: ReportConfigUpdate,
    user: UserInDB = Depends(require_admin),
):
    db = get_db()
    raw = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not raw:
        raise HTTPException(status_code=400, detail="No fields to update")
    # Convert nested models to dicts
    update: dict = {}
    for k, v in raw.items():
        if hasattr(v, "model_dump"):
            update[k] = v.model_dump()
        elif isinstance(v, list) and v and hasattr(v[0], "model_dump"):
            update[k] = [x.model_dump() for x in v]
        else:
            update[k] = v
    if "recipients" in update:
        update["recipients"] = [r.lower() for r in update["recipients"]]
    update["updated_at"] = datetime.utcnow()
    res = await db.report_configs.find_one_and_update(
        {"id": config_id, "org_id": user.org_id},
        {"$set": update},
        return_document=True,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Config not found")
    return _doc_to_config(res)


@router.delete("/configs/{config_id}", status_code=204)
async def delete_config(
    config_id: str,
    user: UserInDB = Depends(require_admin),
):
    db = get_db()
    res = await db.report_configs.delete_one({"id": config_id, "org_id": user.org_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Config not found")


@router.post("/configs/{config_id}/run")
async def run_now(
    config_id: str,
    user: UserInDB = Depends(get_current_user),
):
    """Trigger an immediate send of the report, useful to test the pipeline."""
    db = get_db()
    doc = await db.report_configs.find_one({"id": config_id, "org_id": user.org_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Config not found")
    config = _doc_to_config(doc)
    run = await run_report(config, triggered_by=f"manual:{user.id}")
    return run.model_dump()


@router.get("/runs")
async def list_runs(user: UserInDB = Depends(get_current_user), limit: int = 50):
    """Most recent report runs for this org."""
    db = get_db()
    cursor = (
        db.report_runs.find({"org_id": user.org_id})
        .sort("started_at", -1)
        .limit(min(max(limit, 1), 200))
    )
    out = []
    async for d in cursor:
        d.pop("_id", None)
        out.append(d)
    return out
