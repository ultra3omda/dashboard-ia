"""Read-only endpoints for clients and factures (sourced from Excel imports)."""
from fastapi import APIRouter, Depends
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import UserInDB
from app.models.business import ClientPublic, FacturePublic

router = APIRouter(tags=["data"])


@router.get("/clients", response_model=list[ClientPublic])
async def list_clients(user: UserInDB = Depends(get_current_user)):
    db = get_db()
    cursor = db.clients.find({"org_id": user.org_id})
    out: list[ClientPublic] = []
    async for c in cursor:
        c.pop("_id", None)
        out.append(ClientPublic(
            id=c["id"],
            nom=c["nom"],
            montantDu=c.get("montantDu", 0.0),
            updated_at=c.get("updated_at"),
        ))
    return out


@router.get("/factures", response_model=list[FacturePublic])
async def list_factures(user: UserInDB = Depends(get_current_user)):
    db = get_db()
    cursor = db.factures.find({"org_id": user.org_id})
    out: list[FacturePublic] = []
    async for f in cursor:
        f.pop("_id", None)
        out.append(FacturePublic(**{k: f.get(k, _default_for(k)) for k in FacturePublic.model_fields}))
    return out


def _default_for(field: str):
    defaults = {
        "datePaiement": None,
        "isCustomerGroup": False,
    }
    if field in defaults:
        return defaults[field]
    # Numeric fields default to 0.0, string fields to ""
    numeric_fields = {"horsTaxes", "montantDevise", "montantRecouvrement", "montantRecouvre", "totalTTC"}
    if field in numeric_fields:
        return 0.0
    return ""
