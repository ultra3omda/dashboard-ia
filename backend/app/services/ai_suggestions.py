"""AI-powered suggestions for each KPI. Uses Claude API when configured,
falls back to deterministic scripted suggestions otherwise."""
from __future__ import annotations
import hashlib
import json
import logging
from datetime import datetime, timedelta
from typing import Any, Literal

from app.core.config import get_settings
from app.core.database import get_db

logger = logging.getLogger(__name__)

SuggestionSeverity = Literal["info", "warning", "danger", "success"]


# ═══════════════════════════════════════════════════════════════════
# Public API
# ═══════════════════════════════════════════════════════════════════

async def generate_suggestions(org_id: str, kpis_summary: dict[str, Any]) -> dict[str, Any]:
    """Main entry point.
    Returns a dict {kpi_key: [{title, detail, severity, action}]}
    kpis_summary must include: caRealise, montantRecouvre, resteARecouvrer,
    tauxRecouvrement, delaiMoyenPaiement, agingTotals, topDebtors, activityBreakdown.
    """
    settings = get_settings()
    cache_key = _hash_summary(kpis_summary)
    db = get_db()

    # 1. Try cache
    cached = await db.ai_cache.find_one({"org_id": org_id, "cache_key": cache_key})
    if cached and cached.get("expires_at") and cached["expires_at"] > datetime.utcnow():
        return cached["payload"]

    # 2. Generate
    if settings.ai_enabled:
        try:
            payload = await _call_claude(kpis_summary, settings)
            source = "claude"
        except Exception as e:
            logger.warning("Claude API call failed, falling back to scripted: %s", e)
            payload = _scripted_suggestions(kpis_summary)
            source = "scripted_fallback"
    else:
        payload = _scripted_suggestions(kpis_summary)
        source = "scripted"

    payload["_source"] = source

    # 3. Cache
    await db.ai_cache.update_one(
        {"org_id": org_id, "cache_key": cache_key},
        {"$set": {
            "org_id": org_id,
            "cache_key": cache_key,
            "payload": payload,
            "expires_at": datetime.utcnow() + timedelta(seconds=settings.ai_suggestions_cache_ttl_seconds),
        }},
        upsert=True,
    )
    return payload


def _hash_summary(summary: dict[str, Any]) -> str:
    """Stable hash of the KPI summary for cache lookups."""
    j = json.dumps(summary, sort_keys=True, default=str)
    return hashlib.sha256(j.encode()).hexdigest()[:32]


# ═══════════════════════════════════════════════════════════════════
# Claude-backed suggestions
# ═══════════════════════════════════════════════════════════════════

_SYSTEM_PROMPT = """Tu es un expert en recouvrement B2B et en pilotage financier.
Tu reçois un résumé chiffré de la santé du recouvrement d'une entreprise (tunisienne, secteur IT/services).

Pour chaque KPI listé, tu dois générer 2 à 4 suggestions d'actions concrètes, priorisées,
permettant d'améliorer la performance ou de réduire le risque.

Réponds UNIQUEMENT avec un objet JSON valide (pas de markdown, pas de texte autour), structuré ainsi :
{
  "tauxRecouvrement": [
    {"title": "...", "detail": "...", "severity": "info|warning|danger|success", "action": "..."},
    ...
  ],
  "resteARecouvrer": [...],
  "delaiMoyenPaiement": [...],
  "retardsCritiques": [...],
  "concentration": [...]
}

Chaque suggestion doit avoir :
- title : court (max 60 caractères), orienté action
- detail : phrase explicative (max 200 caractères)
- severity : "info" | "warning" | "danger" | "success"
- action : verbe à l'impératif (ex : "Relancer", "Escalader", "Réviser", "Automatiser")

Reste factuel, appuie-toi sur les chiffres fournis, évite les généralités."""


async def _call_claude(kpis_summary: dict[str, Any], settings) -> dict[str, Any]:
    """Call the Anthropic API and return a parsed JSON payload."""
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    user_msg = (
        "Voici le résumé chiffré du recouvrement à analyser :\n\n"
        + json.dumps(kpis_summary, ensure_ascii=False, indent=2, default=str)
        + "\n\nGénère les suggestions au format JSON demandé."
    )

    message = await client.messages.create(
        model=settings.anthropic_model,
        max_tokens=2000,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )

    # Extract text from content blocks
    text = ""
    for block in message.content:
        if getattr(block, "type", None) == "text":
            text += block.text

    # Strip markdown fences if present
    text = text.strip()
    if text.startswith("```"):
        # Remove ```json or ``` at start
        text = text.split("\n", 1)[1] if "\n" in text else text
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0]
        text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        logger.error("Claude returned non-JSON: %s (payload: %r)", e, text[:500])
        raise


# ═══════════════════════════════════════════════════════════════════
# Scripted fallback (deterministic, no external calls)
# ═══════════════════════════════════════════════════════════════════

def _scripted_suggestions(s: dict[str, Any]) -> dict[str, Any]:
    """Deterministic rule-based suggestions, used when Claude is unavailable."""
    out: dict[str, list[dict[str, str]]] = {
        "tauxRecouvrement": [],
        "resteARecouvrer": [],
        "delaiMoyenPaiement": [],
        "retardsCritiques": [],
        "concentration": [],
    }

    taux = s.get("tauxRecouvrement", 0.0) or 0.0
    reste = s.get("resteARecouvrer", 0.0) or 0.0
    delai = s.get("delaiMoyenPaiement")
    aging = s.get("agingTotals", {}) or {}
    top = s.get("topDebtors", []) or []

    # Taux de recouvrement
    if taux < 0.7:
        out["tauxRecouvrement"].append({
            "title": "Taux de recouvrement sous les 70%",
            "detail": "Performance critique. Renforcer les processus de relance dès J+5 après échéance.",
            "severity": "danger",
            "action": "Automatiser les relances",
        })
        out["tauxRecouvrement"].append({
            "title": "Réviser les conditions commerciales",
            "detail": "Exiger un acompte sur les nouveaux contrats, notamment pour les clients à historique de retard.",
            "severity": "warning",
            "action": "Réviser",
        })
    elif taux < 0.85:
        out["tauxRecouvrement"].append({
            "title": "Marge de progression sur le recouvrement",
            "detail": f"Taux actuel : {round(taux*100)}%. Cible à 90%+ : industrialiser les relances J+5 / J+15 / J+30.",
            "severity": "warning",
            "action": "Industrialiser",
        })
    else:
        out["tauxRecouvrement"].append({
            "title": "Taux de recouvrement sain",
            "detail": "Maintenir la rigueur et capitaliser sur le processus existant.",
            "severity": "success",
            "action": "Maintenir",
        })

    # Reste à recouvrer
    if reste > 0:
        out["resteARecouvrer"].append({
            "title": "Prioriser les montants élevés",
            "detail": "Concentrer l'effort sur les 20% de débiteurs représentant 80% du reste (loi de Pareto).",
            "severity": "info",
            "action": "Prioriser",
        })

    # Délai moyen
    if delai is not None:
        if delai > 90:
            out["delaiMoyenPaiement"].append({
                "title": "DSO excessif (>90 j)",
                "detail": "Le cash immobilisé pèse sur la trésorerie. Négocier des acomptes et raccourcir les échéances.",
                "severity": "danger",
                "action": "Renégocier",
            })
        elif delai > 60:
            out["delaiMoyenPaiement"].append({
                "title": "DSO au-dessus de la norme B2B",
                "detail": f"{round(delai)} jours moyens. Cible B2B saine : 30-45 j. Raccourcir les délais contractuels.",
                "severity": "warning",
                "action": "Raccourcir",
            })
        else:
            out["delaiMoyenPaiement"].append({
                "title": "DSO dans la norme",
                "detail": f"{round(delai)} jours moyens. Bon indicateur de santé de la relation client.",
                "severity": "success",
                "action": "Maintenir",
            })

    # Retards critiques / danger
    critique = aging.get("critique", 0)
    danger = aging.get("danger", 0)
    if danger > 0:
        out["retardsCritiques"].append({
            "title": "Escalade juridique à envisager",
            "detail": f"{_fmt_tnd(danger)} en zone Danger (retard >90 j). Passer en contentieux ou relance avocat.",
            "severity": "danger",
            "action": "Escalader",
        })
    if critique > 0:
        out["retardsCritiques"].append({
            "title": "Relances intensifiées requises",
            "detail": f"{_fmt_tnd(critique)} en zone Critique (60-90 j). RDV physique / mise en demeure recommandés.",
            "severity": "warning",
            "action": "Intensifier",
        })

    # Concentration
    if len(top) >= 3:
        top3 = top[:3]
        top3_sum = sum((d.get("resteARecouvrer", 0) or 0) for d in top3)
        if reste > 0 and top3_sum / reste > 0.4:
            names = ", ".join(d.get("nomClient", "?") for d in top3)
            out["concentration"].append({
                "title": "Risque concentré sur 3 clients",
                "detail": f"{names} cumulent {round(top3_sum/reste*100)}% du reste à recouvrer. Contact direction recommandé.",
                "severity": "warning",
                "action": "Escalader direction",
            })

    return out


def _fmt_tnd(n: float) -> str:
    try:
        return f"{round(n):,}".replace(",", " ") + " DT"
    except (TypeError, ValueError):
        return "—"
