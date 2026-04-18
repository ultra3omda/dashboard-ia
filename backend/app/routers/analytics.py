"""Analytics endpoints: KPI summary + AI-powered suggestions per KPI."""
from typing import Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import UserInDB
from app.services import analytics_engine as ae
from app.services.ai_suggestions import generate_suggestions

router = APIRouter(prefix="/analytics", tags=["analytics"])


class AnalyticsFilters(BaseModel):
    activite: Optional[str] = None
    group_mode: str = "all"
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    only_overdue: bool = False


async def _load_and_filter(user: UserInDB, filters: AnalyticsFilters) -> dict:
    """Fetch org data, enrich with aging, apply filters, return everything."""
    db = get_db()
    settings_doc = await db.settings.find_one({"org_id": user.org_id})
    aging_buckets = {"normal": 30, "vigilance": 60, "critique": 90}
    if settings_doc and "agingBuckets" in settings_doc:
        aging_buckets = settings_doc["agingBuckets"]

    cursor = db.factures.find({"org_id": user.org_id})
    factures = []
    async for f in cursor:
        f.pop("_id", None)
        factures.append(f)

    enriched = ae.enrich_factures(factures, aging_buckets)
    filtered = ae.apply_filters(
        enriched,
        activite=filters.activite,
        group_mode=filters.group_mode,  # type: ignore
        date_from=filters.date_from,
        date_to=filters.date_to,
        only_overdue=filters.only_overdue,
    )
    client_perf = ae.compute_client_performance(filtered)
    kpis = ae.compute_kpis(filtered, client_perf)
    activity = ae.compute_activity_breakdown(filtered)
    return {
        "kpis": kpis,
        "clientPerformance": client_perf,
        "activityBreakdown": activity,
        "agingBuckets": aging_buckets,
    }


@router.get("/summary")
async def summary(
    activite: Optional[str] = Query(None),
    group_mode: str = Query("all"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    only_overdue: bool = Query(False),
    user: UserInDB = Depends(get_current_user),
):
    """Return aggregated KPIs + client performance + activity breakdown."""
    filters = AnalyticsFilters(
        activite=activite, group_mode=group_mode,
        date_from=date_from, date_to=date_to, only_overdue=only_overdue,
    )
    return await _load_and_filter(user, filters)


@router.get("/suggestions")
async def suggestions(
    activite: Optional[str] = Query(None),
    group_mode: str = Query("all"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    only_overdue: bool = Query(False),
    user: UserInDB = Depends(get_current_user),
):
    """AI-powered suggestions per KPI (Claude API or scripted fallback)."""
    filters = AnalyticsFilters(
        activite=activite, group_mode=group_mode,
        date_from=date_from, date_to=date_to, only_overdue=only_overdue,
    )
    data = await _load_and_filter(user, filters)
    k = data["kpis"]

    # Build compact summary for the LLM (top 10 debtors only to keep prompt small)
    top_debtors = sorted(
        [c for c in data["clientPerformance"] if c["resteARecouvrer"] > 0],
        key=lambda x: x["resteARecouvrer"],
        reverse=True,
    )[:10]

    summary_payload = {
        "tauxRecouvrement": round(k["tauxRecouvrement"], 3),
        "caRealise": round(k["caRealise"]),
        "montantRecouvre": round(k["montantRecouvre"]),
        "resteARecouvrer": round(k["resteARecouvrer"]),
        "delaiMoyenPaiement": round(k["delaiMoyenPaiement"], 1) if k["delaiMoyenPaiement"] is not None else None,
        "nbFactures": k["nbFactures"],
        "nbClients": k["nbClients"],
        "nbClientsEnRetard": k["nbClientsEnRetard"],
        "agingTotals": {kk: round(vv) for kk, vv in k["agingTotals"].items()},
        "agingCounts": k["agingCounts"],
        "topDebtors": [
            {
                "nomClient": d["nomClient"],
                "resteARecouvrer": round(d["resteARecouvrer"]),
                "tauxRecouvrement": round(d["tauxRecouvrement"], 3),
                "pireAging": d["pireAging"],
            }
            for d in top_debtors
        ],
        "activityBreakdown": [
            {
                "activite": a["activite"],
                "caRealise": round(a["caRealise"]),
                "tauxRecouvrement": round(a["tauxRecouvrement"], 3),
            }
            for a in data["activityBreakdown"][:6]
        ],
    }

    payload = await generate_suggestions(user.org_id, summary_payload)
    return payload
