"""Render a report configuration into an HTML email body.

We keep the template inline rather than loading from disk — this makes the
service simpler to deploy (no file lookup path to manage) and the HTML email
safe from accidental template escape misuse by callers.
"""
from __future__ import annotations
from datetime import datetime
from typing import Any
import html

from app.models.report import ReportConfig, ReportSections


def _escape(v: Any) -> str:
    if v is None:
        return ""
    return html.escape(str(v), quote=True)


def _fmt_tnd(n: float | int) -> str:
    try:
        return f"{round(float(n)):,}".replace(",", " ") + " DT"
    except (TypeError, ValueError):
        return "—"


def _fmt_pct(n: float | int) -> str:
    try:
        return f"{round(float(n) * 100)}%"
    except (TypeError, ValueError):
        return "—"


AGING_LABELS = {
    "normal": ("Normal", "#059669"),
    "vigilance": ("Vigilance", "#d97706"),
    "critique": ("Critique", "#ea580c"),
    "danger": ("Danger", "#dc2626"),
}


def render_report_html(
    config: ReportConfig,
    org_name: str,
    summary: dict,
    suggestions: dict | None = None,
    dashboard_url: str = "",
) -> tuple[str, str]:
    """Return (subject, html_body) for the report.

    `summary` is the payload produced by analytics_engine (computeKPIs etc).
    `suggestions` is the optional payload from ai_suggestions.generate_suggestions.
    """
    k = summary.get("kpis", {})
    client_perf: list[dict] = summary.get("clientPerformance", [])
    activities: list[dict] = summary.get("activityBreakdown", [])

    sections: ReportSections = config.sections
    today = datetime.utcnow().strftime("%d %B %Y")
    subject = f"[CashFlow Pilot] {config.name} — {today}"

    parts: list[str] = [_header(org_name, config)]

    if sections.kpis:
        parts.append(_kpis_block(k))

    if sections.aging:
        parts.append(_aging_block(k))

    if sections.top_clients and client_perf:
        parts.append(_top_clients_block(client_perf))

    if sections.activities and activities:
        parts.append(_activities_block(activities))

    if sections.clients_at_risk and client_perf:
        parts.append(_clients_at_risk_block(client_perf))

    if sections.ai_suggestions and suggestions:
        parts.append(_suggestions_block(suggestions))

    parts.append(_footer(dashboard_url))

    body = _document("".join(parts))
    return subject, body


# ═══════════════════════════════════════════════════════════════════
# Building blocks (inline CSS for email client compatibility)
# ═══════════════════════════════════════════════════════════════════

def _document(inner_html: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>CashFlow Pilot Report</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9;padding:24px 0;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="max-width:640px;background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(15,23,42,.08);overflow:hidden;">
{inner_html}
</table>
</td></tr>
</table>
</body>
</html>"""


def _header(org_name: str, config: ReportConfig) -> str:
    date_str = datetime.utcnow().strftime("%A %d %B %Y")
    return f"""
<tr><td style="background:linear-gradient(135deg,#0ea5e9 0%,#7c3aed 100%);padding:28px 32px;color:#fff;">
  <div style="font-size:12px;opacity:.85;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">CashFlow Pilot</div>
  <div style="font-size:22px;font-weight:700;margin-bottom:6px;">{_escape(config.name)}</div>
  <div style="font-size:13px;opacity:.9;">{_escape(org_name)} &middot; {_escape(date_str)}</div>
</td></tr>
"""


def _kpis_block(k: dict) -> str:
    delai = k.get("delaiMoyenPaiement")
    delai_str = f"{round(delai)} j" if delai is not None else "—"
    rows = [
        ("CA réalisé", _fmt_tnd(k.get("caRealise", 0)), f"{k.get('nbFactures', 0)} factures"),
        ("Taux de recouvrement", _fmt_pct(k.get("tauxRecouvrement", 0)), _fmt_tnd(k.get("montantRecouvre", 0)) + " recouvrés"),
        ("Reste à recouvrer", _fmt_tnd(k.get("resteARecouvrer", 0)), f"{k.get('nbClientsEnRetard', 0)} clients en retard"),
        ("Délai moyen de paiement", delai_str, "DSO"),
    ]
    cells = "".join(
        f"""<td style="padding:16px;border-right:1px solid #e2e8f0;width:25%;vertical-align:top;">
<div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">{_escape(label)}</div>
<div style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:2px;">{_escape(value)}</div>
<div style="font-size:11px;color:#94a3b8;">{_escape(hint)}</div>
</td>"""
        for label, value, hint in rows
    )
    # Remove the right border on the last cell
    cells = cells.rsplit("border-right:1px solid #e2e8f0;", 1)
    cells = "".join(cells)
    return f"""
<tr><td style="padding:24px 32px 8px 32px;">
  <div style="font-size:15px;font-weight:600;color:#0f172a;margin-bottom:12px;">Indicateurs clés</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e2e8f0;border-radius:8px;border-collapse:separate;">
<tr>{cells}</tr>
  </table>
</td></tr>
"""


def _aging_block(k: dict) -> str:
    totals = k.get("agingTotals", {})
    counts = k.get("agingCounts", {})
    rows = []
    for key in ["normal", "vigilance", "critique", "danger"]:
        label, color = AGING_LABELS[key]
        rows.append(f"""
<tr>
  <td style="padding:10px 12px;border-left:4px solid {color};background:#f8fafc;font-weight:600;color:{color};">{label}</td>
  <td style="padding:10px 12px;background:#f8fafc;text-align:right;font-weight:700;">{_fmt_tnd(totals.get(key, 0))}</td>
  <td style="padding:10px 12px;background:#f8fafc;text-align:right;color:#64748b;font-size:12px;">{counts.get(key, 0)} facture{'s' if counts.get(key, 0) > 1 else ''}</td>
</tr>""")
    return f"""
<tr><td style="padding:8px 32px 8px 32px;">
  <div style="font-size:15px;font-weight:600;color:#0f172a;margin:16px 0 10px 0;">Classement des retards</div>
  <table role="presentation" cellpadding="0" cellspacing="2" border="0" width="100%" style="border-collapse:separate;">
  {''.join(rows)}
  </table>
</td></tr>
"""


def _top_clients_block(clients: list[dict]) -> str:
    top = sorted(
        [c for c in clients if c.get("caRealise", 0) > 0],
        key=lambda c: c.get("caRealise", 0),
        reverse=True,
    )[:10]
    rows = []
    for i, c in enumerate(top, 1):
        aging = c.get("pireAging", "normal")
        _, color = AGING_LABELS.get(aging, AGING_LABELS["normal"])
        status = "À jour" if c.get("nbImpayees", 0) == 0 else AGING_LABELS[aging][0]
        rows.append(f"""
<tr style="border-bottom:1px solid #e2e8f0;">
  <td style="padding:10px 12px;color:#94a3b8;font-size:12px;width:30px;">{i}</td>
  <td style="padding:10px 12px;font-weight:500;">{_escape(c.get('nomClient', ''))}{' <span style="font-size:10px;color:#64748b;background:#e2e8f0;padding:1px 6px;border-radius:4px;margin-left:4px;">Groupe</span>' if c.get('isGroup') else ''}</td>
  <td style="padding:10px 12px;text-align:right;font-weight:600;">{_fmt_tnd(c.get('caRealise', 0))}</td>
  <td style="padding:10px 12px;text-align:right;color:#64748b;font-size:13px;">{_fmt_pct(c.get('tauxRecouvrement', 0))}</td>
  <td style="padding:10px 12px;color:{color};font-size:12px;font-weight:600;">{status}</td>
</tr>""")
    return f"""
<tr><td style="padding:8px 32px 8px 32px;">
  <div style="font-size:15px;font-weight:600;color:#0f172a;margin:16px 0 10px 0;">Top clients (CA réalisé)</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
<tr style="background:#f1f5f9;">
  <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">#</th>
  <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">Client</th>
  <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">CA HT</th>
  <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">Taux</th>
  <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">Statut</th>
</tr>
  {''.join(rows)}
  </table>
</td></tr>
"""


def _activities_block(activities: list[dict]) -> str:
    top = activities[:6]
    rows = []
    for a in top:
        rows.append(f"""
<tr style="border-bottom:1px solid #e2e8f0;">
  <td style="padding:8px 12px;font-weight:500;">{_escape(a.get('activite', ''))}</td>
  <td style="padding:8px 12px;text-align:right;">{_fmt_tnd(a.get('caRealise', 0))}</td>
  <td style="padding:8px 12px;text-align:right;color:#059669;">{_fmt_tnd(a.get('montantRecouvre', 0))}</td>
  <td style="padding:8px 12px;text-align:right;color:#64748b;">{_fmt_pct(a.get('tauxRecouvrement', 0))}</td>
</tr>""")
    return f"""
<tr><td style="padding:8px 32px 8px 32px;">
  <div style="font-size:15px;font-weight:600;color:#0f172a;margin:16px 0 10px 0;">Performance par activité</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
<tr style="background:#f1f5f9;">
  <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;">Activité</th>
  <th style="padding:10px 12px;text-align:right;font-size:11px;color:#64748b;">CA HT</th>
  <th style="padding:10px 12px;text-align:right;font-size:11px;color:#64748b;">Recouvré</th>
  <th style="padding:10px 12px;text-align:right;font-size:11px;color:#64748b;">Taux</th>
</tr>
  {''.join(rows)}
  </table>
</td></tr>
"""


def _clients_at_risk_block(clients: list[dict]) -> str:
    at_risk = sorted(
        [c for c in clients if c.get("resteARecouvrer", 0) > 0 and c.get("pireAging") in ("critique", "danger")],
        key=lambda c: c.get("resteARecouvrer", 0),
        reverse=True,
    )[:10]
    if not at_risk:
        return f"""
<tr><td style="padding:8px 32px 8px 32px;">
  <div style="font-size:15px;font-weight:600;color:#0f172a;margin:16px 0 10px 0;">Clients à risque</div>
  <div style="padding:16px;background:#ecfdf5;border-left:4px solid #059669;border-radius:4px;color:#065f46;font-size:14px;">Aucun client en zone Critique ou Danger. 🎉</div>
</td></tr>
"""
    rows = []
    for c in at_risk:
        aging = c.get("pireAging", "normal")
        label, color = AGING_LABELS[aging]
        rows.append(f"""
<tr style="border-bottom:1px solid #e2e8f0;">
  <td style="padding:10px 12px;font-weight:500;">{_escape(c.get('nomClient', ''))}</td>
  <td style="padding:10px 12px;text-align:right;font-weight:700;color:#dc2626;">{_fmt_tnd(c.get('resteARecouvrer', 0))}</td>
  <td style="padding:10px 12px;text-align:right;color:#64748b;font-size:13px;">{c.get('nbImpayees', 0)}</td>
  <td style="padding:10px 12px;"><span style="display:inline-block;padding:2px 8px;background:{color};color:#fff;border-radius:4px;font-size:11px;font-weight:600;">{label}</span></td>
</tr>""")
    return f"""
<tr><td style="padding:8px 32px 8px 32px;">
  <div style="font-size:15px;font-weight:600;color:#0f172a;margin:16px 0 10px 0;">Clients à risque (Critique + Danger)</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
<tr style="background:#fef2f2;">
  <th style="padding:10px 12px;text-align:left;font-size:11px;color:#991b1b;">Client</th>
  <th style="padding:10px 12px;text-align:right;font-size:11px;color:#991b1b;">Reste à recouvrer</th>
  <th style="padding:10px 12px;text-align:right;font-size:11px;color:#991b1b;">Impayées</th>
  <th style="padding:10px 12px;text-align:left;font-size:11px;color:#991b1b;">Statut</th>
</tr>
  {''.join(rows)}
  </table>
</td></tr>
"""


def _suggestions_block(suggestions: dict) -> str:
    categories = [
        ("tauxRecouvrement", "Taux de recouvrement"),
        ("resteARecouvrer", "Reste à recouvrer"),
        ("delaiMoyenPaiement", "Délai moyen de paiement"),
        ("retardsCritiques", "Retards critiques"),
        ("concentration", "Concentration du risque"),
    ]
    blocks = []
    for key, label in categories:
        items = suggestions.get(key) or []
        if not items:
            continue
        items_html = []
        for s in items[:3]:
            sev = s.get("severity", "info")
            bg = {
                "info": "#eff6ff",
                "success": "#ecfdf5",
                "warning": "#fffbeb",
                "danger": "#fef2f2",
            }.get(sev, "#f8fafc")
            border = {
                "info": "#3b82f6",
                "success": "#059669",
                "warning": "#d97706",
                "danger": "#dc2626",
            }.get(sev, "#64748b")
            items_html.append(f"""
<div style="padding:10px 12px;background:{bg};border-left:3px solid {border};border-radius:4px;margin-bottom:8px;">
  <div style="font-weight:600;font-size:13px;color:#0f172a;margin-bottom:2px;">{_escape(s.get('title', ''))}</div>
  <div style="font-size:12px;color:#475569;line-height:1.5;">{_escape(s.get('detail', ''))}</div>
</div>""")
        blocks.append(f"""
<div style="margin-bottom:12px;">
  <div style="font-size:13px;font-weight:600;color:#475569;margin-bottom:6px;">{_escape(label)}</div>
  {''.join(items_html)}
</div>""")
    if not blocks:
        return ""
    return f"""
<tr><td style="padding:8px 32px 8px 32px;">
  <div style="font-size:15px;font-weight:600;color:#0f172a;margin:16px 0 10px 0;">💡 Actions suggérées par l'IA</div>
  {''.join(blocks)}
</td></tr>
"""


def _footer(dashboard_url: str) -> str:
    link = ""
    if dashboard_url:
        link = f'<div style="margin-top:8px;"><a href="{_escape(dashboard_url)}" style="color:#0ea5e9;text-decoration:none;font-size:13px;">→ Ouvrir le dashboard complet</a></div>'
    return f"""
<tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;">
  Généré automatiquement par CashFlow Pilot. Ce rapport reflète les données à l'instant de l'envoi.
  {link}
</td></tr>
"""
