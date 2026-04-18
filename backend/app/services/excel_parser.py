"""Excel parsing service for Solde_Clients and Factures (Export) sheets.
Mirrors the frontend xlsx-parser.ts logic on the server side.
"""
from __future__ import annotations
from io import BytesIO
from datetime import datetime
import re
from typing import Any
import pandas as pd


# ─── Helpers ──────────────────────────────────────────────────────────

def _num_fr(val: Any) -> float:
    """Parse French number format: '592 818,48' or native numbers."""
    if val is None or (isinstance(val, float) and pd.isna(val)) or val == "":
        return 0.0
    if isinstance(val, (int, float)):
        try:
            v = float(val)
            return 0.0 if pd.isna(v) else v
        except (TypeError, ValueError):
            return 0.0
    s = str(val).replace("\xa0", "").replace(" ", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def _str(val: Any) -> str:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ""
    return str(val).strip()


def _bool(val: Any) -> bool:
    if isinstance(val, bool):
        return val
    s = _str(val).lower()
    return s in {"true", "1", "yes", "oui"}


_DMY_RE = re.compile(r"^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$")


def _date_iso(val: Any) -> str | None:
    """Try to parse a cell as date and return ISO (YYYY-MM-DD) or None."""
    if val is None:
        return None
    if isinstance(val, float) and pd.isna(val):
        return None
    if isinstance(val, (pd.Timestamp, datetime)):
        try:
            return val.strftime("%Y-%m-%d")
        except (ValueError, AttributeError):
            return None
    if isinstance(val, (int, float)):
        # Excel serial date
        if 1000 < val < 100000:
            try:
                d = datetime(1899, 12, 30) + pd.Timedelta(days=float(val))
                return d.strftime("%Y-%m-%d")
            except (ValueError, OverflowError):
                return None
        return None
    s = _str(val)
    if not s:
        return None
    m = _DMY_RE.match(s)
    if m:
        dd, mm, yy = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if yy < 100:
            yy += 2000
        try:
            return datetime(yy, mm, dd).strftime("%Y-%m-%d")
        except ValueError:
            return None
    # Fallback pandas parsing
    try:
        d = pd.to_datetime(s, errors="coerce", dayfirst=True)
        if pd.isna(d):
            return None
        return d.strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        return None


def _find_col(row: dict, candidates: list[str]) -> Any:
    """Case-insensitive + partial column matching."""
    if not isinstance(row, dict):
        return None
    for c in candidates:
        if c in row:
            return row[c]
    lower_map = {str(k).lower().strip(): k for k in row.keys()}
    for c in candidates:
        key = lower_map.get(c.lower().strip())
        if key is not None:
            return row[key]
    # Partial match
    for c in candidates:
        lc = c.lower().strip()
        for lk, original in lower_map.items():
            if lc in lk:
                return row[original]
    return None


# ─── Public parsers ──────────────────────────────────────────────────

def parse_solde_xlsx(file_bytes: bytes) -> list[dict]:
    """Parse Solde_Clients sheet. Returns list of {nom, montantDu}."""
    bio = BytesIO(file_bytes)
    # Try sheet "Feuil1" first, then fallback to first sheet
    try:
        xls = pd.ExcelFile(bio, engine="openpyxl")
    except (ValueError, KeyError) as e:
        raise ValueError(f"Invalid Excel file: {e}") from e

    target_sheet = None
    for name in xls.sheet_names:
        if name.lower() == "feuil1":
            target_sheet = name
            break
    if target_sheet is None:
        target_sheet = xls.sheet_names[0]

    df = pd.read_excel(xls, sheet_name=target_sheet, header=0)

    results: list[dict] = []
    for _, row in df.iterrows():
        if len(df.columns) < 2:
            continue
        nom_raw = row.iloc[0]
        nom = _str(nom_raw)
        if not nom:
            continue
        low = nom.lower()
        if "total" in low or "location voiture" in low or low == "nan":
            continue
        montant = _num_fr(row.iloc[1])
        results.append({"nom": nom, "montantDu": montant})
    return results


def parse_factures_xlsx(file_bytes: bytes) -> list[dict]:
    """Parse Factures (Export sheet). Returns list of facture dicts matching FactureIn."""
    bio = BytesIO(file_bytes)
    try:
        xls = pd.ExcelFile(bio, engine="openpyxl")
    except (ValueError, KeyError) as e:
        raise ValueError(f"Invalid Excel file: {e}") from e

    target_sheet = None
    for name in xls.sheet_names:
        if "export" in name.lower():
            target_sheet = name
            break
    if target_sheet is None:
        target_sheet = xls.sheet_names[0]

    df = pd.read_excel(xls, sheet_name=target_sheet)

    results: list[dict] = []
    for _, row in df.iterrows():
        r = row.to_dict()
        nom_client = _str(_find_col(r, ["nom client", "Nom client", "nom_client", "Client"]))
        if not nom_client:
            continue
        num_facture = _str(_find_col(r, [
            "N° Facture", "N° facture", "N_Facture", "Numero Facture", "num_facture",
        ]))
        if not num_facture:
            continue

        results.append({
            "nomClient": nom_client,
            "activite": _str(_find_col(r, ["Activité", "Activite", "activité", "activite"])),
            "numFacture": num_facture,
            "datePaiement": _date_iso(_find_col(r, ["Date de paiement", "date_paiement"])),
            "dateFacture": _date_iso(_find_col(r, ["Date Facture", "date_facture", "Date facture"])) or "",
            "echeancePrevue": _date_iso(_find_col(r, [
                "Echéance Prevue - Account", "Echeance Prevue - Account",
                "Échéance Prevue", "echeance_prevue",
            ])) or "",
            "devise": _str(_find_col(r, ["Devise", "devise"])),
            "paiement": _str(_find_col(r, ["Paiement", "paiement"])),
            "horsTaxes": _num_fr(_find_col(r, ["Hors taxes", "hors_taxes", "Hors Taxes"])),
            "montantDevise": _num_fr(_find_col(r, [
                "Montant en devise (selon pays)", "Montant en devise", "montant_devise",
            ])),
            "isCustomerGroup": _bool(_find_col(r, [
                "is_customer_group", "Is_customer_group", "is customer group",
            ])),
            "montantRecouvrement": _num_fr(_find_col(r, [
                "M. Recouvrement en Dinar TN", "M. Recouvrement", "m_recouvrement",
            ])),
            "montantRecouvre": _num_fr(_find_col(r, [
                "Montant recouvré en Dinar TN", "Montant recouvré", "montant_recouvre",
            ])),
            "totalTTC": _num_fr(_find_col(r, ["Total TTC en Dinar TN", "Total TTC", "total_ttc"])),
        })
    return results
