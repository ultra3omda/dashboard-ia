import * as XLSX from "xlsx";
import { SoldeClient, Facture, safeDateToISO } from "@/types/data";

// Use safeDateToISO from data.ts for all date parsing

function numFR(val: any): number {
  if (val == null || val === "") return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  // Handle French number format: "592 818,48" with \xa0, regular spaces, commas
  let s = String(val)
    .replace(/\xa0/g, "")  // non-breaking space
    .replace(/\s/g, "")    // regular spaces
    .replace(/,/g, ".");   // comma → dot
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function str(val: any): string {
  return val == null ? "" : String(val).trim();
}

function bool(val: any): boolean {
  if (typeof val === "boolean") return val;
  const s = str(val).toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "oui";
}

function findSheet(wb: XLSX.WorkBook, preferredName: string): XLSX.WorkSheet {
  // Try exact match first, then case-insensitive, then fall back to first sheet
  if (wb.Sheets[preferredName]) return wb.Sheets[preferredName];
  const lower = preferredName.toLowerCase();
  const found = wb.SheetNames.find(n => n.toLowerCase() === lower);
  if (found) return wb.Sheets[found];
  return wb.Sheets[wb.SheetNames[0]];
}

function findColumn(row: any, candidates: string[]): any {
  for (const c of candidates) {
    if (row[c] !== undefined) return row[c];
  }
  // Try case-insensitive match
  const keys = Object.keys(row);
  for (const c of candidates) {
    const lower = c.toLowerCase();
    const found = keys.find(k => k.toLowerCase() === lower);
    if (found && row[found] !== undefined) return row[found];
  }
  // Try partial match
  for (const c of candidates) {
    const lower = c.toLowerCase();
    const found = keys.find(k => k.toLowerCase().includes(lower));
    if (found && row[found] !== undefined) return row[found];
  }
  return undefined;
}

export function parseSoldeFile(file: ArrayBuffer): SoldeClient[] {
  const wb = XLSX.read(file, { type: "array", cellDates: true });
  const ws = findSheet(wb, "Feuil1");
  // Use header:1 to get raw arrays — avoids column name issues ("Montantdû" vs "Montant dû")
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

  console.log("[CashFlow] Solde: sheet names =", wb.SheetNames);
  console.log("[CashFlow] Solde: raw row count =", rows.length);
  if (rows.length > 1) console.log("[CashFlow] Solde: header row =", JSON.stringify(rows[0]));
  if (rows.length > 1) console.log("[CashFlow] Solde: first data row =", JSON.stringify(rows[1]));

  const results: SoldeClient[] = [];
  // Skip row 0 (headers)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;

    const nom = String(row[0]).trim();
    if (!nom) continue;

    // Filter garbage rows
    const nomLower = nom.toLowerCase();
    if (nomLower.includes("total")) continue;
    if (nomLower.includes("location voiture")) continue;
    if (nomLower === "nan") continue;

    // Column index 1 = amount, handle both number and French string format
    const rawVal = row[1];
    const montantDu = typeof rawVal === "number" ? rawVal : numFR(rawVal);
    if (isNaN(montantDu)) continue;

    results.push({ nom, montantDu });
  }

  console.log("[CashFlow] Solde: parsed count =", results.length);
  console.log("[CashFlow] Solde: total encours =", results.reduce((s, c) => s + (c.montantDu > 0 ? c.montantDu : 0), 0));
  if (results.length > 0) console.log("[CashFlow] Solde: first parsed =", JSON.stringify(results[0]));
  return results;
}

export function parseFacturesFile(file: ArrayBuffer): Facture[] {
  const wb = XLSX.read(file, { type: "array", cellDates: true });
  const ws = findSheet(wb, "Export");
  const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

  console.log("[CashFlow] Factures: sheet names =", wb.SheetNames);
  console.log("[CashFlow] Factures: row count =", rows.length);
  if (rows.length > 0) console.log("[CashFlow] Factures: first row keys =", Object.keys(rows[0]));
  if (rows.length > 0) console.log("[CashFlow] Factures: first row sample =", JSON.stringify(rows[0]));

  const results: Facture[] = [];
  for (const r of rows) {
    const nomClient = str(findColumn(r, ["nom client", "Nom client", "nom_client", "Client"]));
    if (!nomClient) continue;

    results.push({
      nomClient,
      activite: str(findColumn(r, ["Activité", "Activite", "activité", "activite"])),
      numFacture: str(findColumn(r, ["N° Facture", "N° facture", "N_Facture", "Numero Facture", "num_facture"])),
      datePaiement: safeDateToISO(findColumn(r, ["Date de paiement", "date_paiement"])) || null,
      dateFacture: safeDateToISO(findColumn(r, ["Date Facture", "date_facture", "Date facture"])),
      echeancePrevue: safeDateToISO(findColumn(r, ["Echéance Prevue - Account", "Echeance Prevue - Account", "Échéance Prevue", "echeance_prevue"])),
      devise: str(findColumn(r, ["Devise", "devise"])),
      paiement: str(findColumn(r, ["Paiement", "paiement"])),
      horsTaxes: numFR(findColumn(r, ["Hors taxes", "hors_taxes", "Hors Taxes"])),
      montantDevise: numFR(findColumn(r, ["Montant en devise (selon pays)", "Montant en devise", "montant_devise"])),
      isCustomerGroup: bool(findColumn(r, ["is_customer_group", "Is_customer_group", "is customer group"])),
      montantRecouvrement: numFR(findColumn(r, ["M. Recouvrement en Dinar TN", "M. Recouvrement", "m_recouvrement"])),
      montantRecouvre: numFR(findColumn(r, ["Montant recouvré en Dinar TN", "Montant recouvré", "montant_recouvre"])),
      totalTTC: numFR(findColumn(r, ["Total TTC en Dinar TN", "Total TTC", "total_ttc"])),
    });
  }

  console.log("[CashFlow] Factures: parsed count =", results.length);
  if (results.length > 0) console.log("[CashFlow] Factures: first parsed =", JSON.stringify(results[0]));
  return results;
}
