"""File import endpoints: /imports/solde and /imports/factures."""
from datetime import datetime
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pymongo import UpdateOne

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import UserInDB
from app.models.business import normalize_name
from app.services.excel_parser import parse_solde_xlsx, parse_factures_xlsx

router = APIRouter(prefix="/imports", tags=["imports"])


MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB guardrail


async def _read_upload(upload: UploadFile) -> bytes:
    data = await upload.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 20 MB)")
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    return data


@router.post("/solde")
async def import_solde(
    file: UploadFile = File(...),
    user: UserInDB = Depends(get_current_user),
):
    """Upload Solde_Clients.xlsx — upsert clients by (org_id, nom_normalized)."""
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only .xlsx/.xls accepted")
    data = await _read_upload(file)

    try:
        rows = parse_solde_xlsx(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Parse error: {e}") from e

    db = get_db()
    now = datetime.utcnow()
    ops: list[UpdateOne] = []
    import uuid
    for r in rows:
        nom_norm = normalize_name(r["nom"])
        if not nom_norm:
            continue
        ops.append(UpdateOne(
            {"org_id": user.org_id, "nom_normalized": nom_norm},
            {
                "$set": {
                    "nom": r["nom"],
                    "montantDu": r["montantDu"],
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "id": str(uuid.uuid4()),
                    "org_id": user.org_id,
                    "nom_normalized": nom_norm,
                    "created_at": now,
                },
            },
            upsert=True,
        ))

    result = {"created": 0, "updated": 0, "total": len(ops)}
    if ops:
        res = await db.clients.bulk_write(ops, ordered=False)
        result["created"] = res.upserted_count
        result["updated"] = res.modified_count

    # Audit log
    await db.import_logs.insert_one({
        "org_id": user.org_id,
        "kind": "solde",
        "filename": file.filename,
        "rows_parsed": len(rows),
        "created": result["created"],
        "updated": result["updated"],
        "created_at": now,
        "user_id": user.id,
    })

    return result


@router.post("/factures")
async def import_factures(
    file: UploadFile = File(...),
    user: UserInDB = Depends(get_current_user),
):
    """Upload Factures (Export sheet) — upsert factures by (org_id, numFacture)."""
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only .xlsx/.xls accepted")
    data = await _read_upload(file)

    try:
        rows = parse_factures_xlsx(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Parse error: {e}") from e

    db = get_db()
    now = datetime.utcnow()
    ops: list[UpdateOne] = []
    import uuid
    for r in rows:
        if not r["numFacture"]:
            continue
        update_fields = {**r, "org_id": user.org_id, "updated_at": now}
        ops.append(UpdateOne(
            {"org_id": user.org_id, "numFacture": r["numFacture"]},
            {
                "$set": update_fields,
                "$setOnInsert": {
                    "id": str(uuid.uuid4()),
                    "created_at": now,
                },
            },
            upsert=True,
        ))

    result = {"created": 0, "updated": 0, "total": len(ops)}
    if ops:
        res = await db.factures.bulk_write(ops, ordered=False)
        result["created"] = res.upserted_count
        result["updated"] = res.modified_count

    await db.import_logs.insert_one({
        "org_id": user.org_id,
        "kind": "factures",
        "filename": file.filename,
        "rows_parsed": len(rows),
        "created": result["created"],
        "updated": result["updated"],
        "created_at": now,
        "user_id": user.id,
    })

    return result


@router.get("/history")
async def import_history(user: UserInDB = Depends(get_current_user)):
    """Last 20 imports for the current org."""
    db = get_db()
    cursor = db.import_logs.find({"org_id": user.org_id}).sort("created_at", -1).limit(20)
    logs = []
    async for log in cursor:
        log.pop("_id", None)
        logs.append(log)
    return logs
