"""Orchestrates a single report run: fetch analytics, render HTML, send email,
log the outcome to report_runs.
"""
from __future__ import annotations
import logging
from datetime import datetime
from typing import Optional

from app.core.database import get_db
from app.models.report import ReportConfig, ReportRun
from app.services import analytics_engine as ae
from app.services.ai_suggestions import generate_suggestions
from app.services.email_sender import send_email
from app.services.report_renderer import render_report_html

logger = logging.getLogger(__name__)


async def _load_analytics(config: ReportConfig) -> dict:
    """Fetch org data, enrich, apply filters, compute KPIs."""
    db = get_db()
    settings_doc = await db.settings.find_one({"org_id": config.org_id})
    aging_buckets = {"normal": 30, "vigilance": 60, "critique": 90}
    if settings_doc and "agingBuckets" in settings_doc:
        aging_buckets = settings_doc["agingBuckets"]

    cursor = db.factures.find({"org_id": config.org_id})
    factures = []
    async for f in cursor:
        f.pop("_id", None)
        factures.append(f)

    enriched = ae.enrich_factures(factures, aging_buckets)
    filtered = ae.apply_filters(
        enriched,
        activite=config.filters.activite,
        group_mode=config.filters.group_mode,  # type: ignore
        only_overdue=config.filters.only_overdue,
    )
    client_perf = ae.compute_client_performance(filtered)
    kpis = ae.compute_kpis(filtered, client_perf)
    activities = ae.compute_activity_breakdown(filtered)
    return {
        "kpis": kpis,
        "clientPerformance": client_perf,
        "activityBreakdown": activities,
        "agingBuckets": aging_buckets,
    }


async def _maybe_suggestions(config: ReportConfig, summary: dict) -> Optional[dict]:
    """Generate AI suggestions if the report config opted in."""
    if not config.sections.ai_suggestions:
        return None
    k = summary["kpis"]
    top_debtors = sorted(
        [c for c in summary["clientPerformance"] if c["resteARecouvrer"] > 0],
        key=lambda c: c["resteARecouvrer"],
        reverse=True,
    )[:10]
    compact = {
        "tauxRecouvrement": round(k["tauxRecouvrement"], 3),
        "caRealise": round(k["caRealise"]),
        "montantRecouvre": round(k["montantRecouvre"]),
        "resteARecouvrer": round(k["resteARecouvrer"]),
        "delaiMoyenPaiement": round(k["delaiMoyenPaiement"], 1) if k["delaiMoyenPaiement"] is not None else None,
        "nbClients": k["nbClients"],
        "nbClientsEnRetard": k["nbClientsEnRetard"],
        "agingTotals": {kk: round(vv) for kk, vv in k["agingTotals"].items()},
        "topDebtors": [
            {
                "nomClient": d["nomClient"],
                "resteARecouvrer": round(d["resteARecouvrer"]),
                "pireAging": d["pireAging"],
            }
            for d in top_debtors
        ],
    }
    try:
        return await generate_suggestions(config.org_id, compact)
    except Exception as e:
        logger.warning("AI suggestions for report failed: %s", e)
        return None


async def run_report(config: ReportConfig, triggered_by: str) -> ReportRun:
    """Execute a report end-to-end. Persists a ReportRun row and returns it."""
    db = get_db()
    run = ReportRun(
        org_id=config.org_id,
        config_id=config.id,
        config_name=config.name,
        triggered_by=triggered_by,
        recipients=config.recipients,
        status="error",
    )
    try:
        # Fetch org name for branding
        org_doc = await db.orgs.find_one({"id": config.org_id})
        org_name = org_doc["name"] if org_doc else "Organisation"

        summary = await _load_analytics(config)
        suggestions = await _maybe_suggestions(config, summary)

        subject, html_body = render_report_html(
            config=config,
            org_name=org_name,
            summary=summary,
            suggestions=suggestions,
            dashboard_url="",  # can be filled later from settings
        )

        result = await send_email(config.recipients, subject, html_body)
        if result.success:
            run.status = "success"
            run.email_provider_ids = result.provider_ids
        else:
            run.status = "error"
            run.error = result.error or "Email send failed"

    except Exception as e:
        logger.exception("run_report unexpected error")
        run.status = "error"
        run.error = str(e)

    run.finished_at = datetime.utcnow()
    await db.report_runs.insert_one(run.model_dump())

    # Update the config's last_run fields
    await db.report_configs.update_one(
        {"id": config.id, "org_id": config.org_id},
        {"$set": {"last_run_at": run.finished_at, "last_run_status": run.status}},
    )
    return run
