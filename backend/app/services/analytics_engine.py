"""Server-side analytics engine — mirror of the frontend analytics.ts logic.
Produces KPIs, client performance, activity breakdown, aging classification.
"""
from __future__ import annotations
from datetime import datetime, date
from typing import Literal, Optional

AgingCategory = Literal["normal", "vigilance", "critique", "danger"]


# ─── Helpers ──────────────────────────────────────────────────────────

def _normalize_name(s: str) -> str:
    return " ".join((s or "").lower().split())


def _parse_iso_date(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def _payment_status(paiement: str) -> Literal["paid", "partial", "unpaid"]:
    p = (paiement or "").lower().strip()
    if p in {"paid", "in_payment"}:
        return "paid"
    if p == "partial":
        return "partial"
    return "unpaid"


def _is_reversed(paiement: str) -> bool:
    return (paiement or "").lower().strip() == "reversed"


def _compute_echeance(echeance_prevue: Optional[str], date_facture: Optional[str]) -> Optional[date]:
    ech = _parse_iso_date(echeance_prevue)
    if ech:
        return ech
    df = _parse_iso_date(date_facture)
    if df:
        from datetime import timedelta
        return df + timedelta(days=60)
    return None


def _classify_aging(days_overdue: int, buckets: dict) -> AgingCategory:
    if days_overdue <= buckets.get("normal", 30):
        return "normal"
    if days_overdue <= buckets.get("vigilance", 60):
        return "vigilance"
    if days_overdue <= buckets.get("critique", 90):
        return "critique"
    return "danger"


# ─── Main compute ─────────────────────────────────────────────────────

def enrich_factures(factures: list[dict], aging_buckets: dict) -> list[dict]:
    """Add computed fields: remaining, paid, status, daysOverdue, aging."""
    today = date.today()
    out = []
    for f in factures:
        if _is_reversed(f.get("paiement", "")):
            continue
        status = _payment_status(f.get("paiement", ""))
        paid = status == "paid"
        ech = _compute_echeance(f.get("echeancePrevue"), f.get("dateFacture"))
        days = 0
        if not paid and ech:
            days = max(0, (today - ech).days)
        m_rec = float(f.get("montantRecouvrement") or 0)
        m_paye = float(f.get("montantRecouvre") or 0)
        remaining = max(0.0, m_rec - m_paye)
        out.append({
            **f,
            "_status": status,
            "_paid": paid,
            "_remaining": remaining,
            "_daysOverdue": days,
            "_aging": _classify_aging(days, aging_buckets),
        })
    return out


def apply_filters(
    enriched: list[dict],
    activite: Optional[str] = None,
    group_mode: Literal["all", "external", "group"] = "all",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    only_overdue: bool = False,
) -> list[dict]:
    group_names: set[str] = set()
    for f in enriched:
        if f.get("isCustomerGroup"):
            group_names.add(_normalize_name(f.get("nomClient", "")))

    df = _parse_iso_date(date_from)
    dt = _parse_iso_date(date_to)

    out = []
    for f in enriched:
        if activite and activite != "ALL":
            if (f.get("activite") or "").strip() != activite:
                continue
        if group_mode != "all":
            key = _normalize_name(f.get("nomClient", ""))
            is_grp = key in group_names
            if group_mode == "external" and is_grp:
                continue
            if group_mode == "group" and not is_grp:
                continue
        if df or dt:
            fdate = _parse_iso_date(f.get("dateFacture"))
            if not fdate:
                continue
            if df and fdate < df:
                continue
            if dt and fdate > dt:
                continue
        if only_overdue and f["_daysOverdue"] == 0:
            continue
        out.append(f)
    return out


def compute_client_performance(filtered: list[dict]) -> list[dict]:
    group_names: set[str] = set()
    for f in filtered:
        if f.get("isCustomerGroup"):
            group_names.add(_normalize_name(f.get("nomClient", "")))

    by_client: dict[str, list[dict]] = {}
    for f in filtered:
        key = (f.get("nomClient") or "").strip()
        by_client.setdefault(key, []).append(f)

    severity = {"normal": 0, "vigilance": 1, "critique": 2, "danger": 3}
    out = []
    for nom, invs in by_client.items():
        ca = sum(float(f.get("horsTaxes") or 0) for f in invs)
        paye = sum(float(f.get("montantRecouvre") or 0) for f in invs)
        attendu = sum(float(f.get("montantRecouvrement") or 0) for f in invs)
        reste = sum(f["_remaining"] for f in invs)
        taux = paye / attendu if attendu > 0 else 0.0
        nb_imp = sum(1 for f in invs if not f["_paid"])

        delais = []
        for f in invs:
            dp = _parse_iso_date(f.get("datePaiement"))
            df_ = _parse_iso_date(f.get("dateFacture"))
            if dp and df_:
                delta = (dp - df_).days
                if delta >= 0:
                    delais.append(delta)
        delai_moyen = sum(delais) / len(delais) if delais else None

        aging_mix = {"normal": 0.0, "vigilance": 0.0, "critique": 0.0, "danger": 0.0}
        pire = "normal"
        for f in invs:
            if f["_paid"]:
                continue
            aging_mix[f["_aging"]] += f["_remaining"]
            if severity[f["_aging"]] > severity[pire]:
                pire = f["_aging"]

        out.append({
            "nomClient": nom,
            "caRealise": ca,
            "montantRecouvre": paye,
            "montantAttendu": attendu,
            "resteARecouvrer": reste,
            "tauxRecouvrement": taux,
            "nbFactures": len(invs),
            "nbImpayees": nb_imp,
            "delaiMoyenPaiement": delai_moyen,
            "agingMix": aging_mix,
            "pireAging": pire,
            "isGroup": _normalize_name(nom) in group_names,
        })
    return out


def compute_kpis(filtered: list[dict], client_perf: list[dict]) -> dict:
    ca = sum(float(f.get("horsTaxes") or 0) for f in filtered)
    paye = sum(float(f.get("montantRecouvre") or 0) for f in filtered)
    attendu = sum(float(f.get("montantRecouvrement") or 0) for f in filtered)
    reste = sum(f["_remaining"] for f in filtered)

    aging_totals = {"normal": 0.0, "vigilance": 0.0, "critique": 0.0, "danger": 0.0}
    aging_counts = {"normal": 0, "vigilance": 0, "critique": 0, "danger": 0}
    for f in filtered:
        if f["_paid"]:
            continue
        aging_totals[f["_aging"]] += f["_remaining"]
        aging_counts[f["_aging"]] += 1

    delais = []
    for f in filtered:
        dp = _parse_iso_date(f.get("datePaiement"))
        df_ = _parse_iso_date(f.get("dateFacture"))
        if dp and df_:
            delta = (dp - df_).days
            if delta >= 0:
                delais.append(delta)
    delai_moyen = sum(delais) / len(delais) if delais else None

    return {
        "caRealise": ca,
        "montantRecouvre": paye,
        "montantAttendu": attendu,
        "resteARecouvrer": reste,
        "tauxRecouvrement": paye / attendu if attendu > 0 else 0.0,
        "nbFactures": len(filtered),
        "nbClients": len(client_perf),
        "nbClientsEnRetard": sum(
            1 for c in client_perf if c["nbImpayees"] > 0 and c["pireAging"] != "normal"
        ),
        "delaiMoyenPaiement": delai_moyen,
        "agingTotals": aging_totals,
        "agingCounts": aging_counts,
    }


def compute_activity_breakdown(filtered: list[dict]) -> list[dict]:
    agg: dict[str, dict] = {}
    for f in filtered:
        key = (f.get("activite") or "—").strip() or "—"
        row = agg.setdefault(key, {
            "activite": key,
            "caRealise": 0.0,
            "montantRecouvre": 0.0,
            "resteARecouvrer": 0.0,
            "nbFactures": 0,
        })
        row["caRealise"] += float(f.get("horsTaxes") or 0)
        row["montantRecouvre"] += float(f.get("montantRecouvre") or 0)
        row["resteARecouvrer"] += f["_remaining"]
        row["nbFactures"] += 1

    out = []
    for r in agg.values():
        r["tauxRecouvrement"] = r["montantRecouvre"] / r["caRealise"] if r["caRealise"] > 0 else 0.0
        out.append(r)
    out.sort(key=lambda x: x["caRealise"], reverse=True)
    return out
