/**
 * One-shot migration helper — reads data from the legacy localStorage keys
 * and uploads it to the backend as synthesized Excel imports.
 *
 * This is deliberately minimal: we don't expose a full "sync" pipeline,
 * just a best-effort migration that lets a user bring their previous
 * browser-local work into the cloud.
 */
import * as XLSX from "xlsx";
import { importsApi } from "@/lib/api";

const SOLDE_KEY = "medianet_solde_v1";
const FACTURES_KEY = "medianet_factures_v1";

export interface MigrationResult {
  soldeImported: { created: number; updated: number; total: number } | null;
  facturesImported: { created: number; updated: number; total: number } | null;
  errors: string[];
}

export function hasLocalData(): boolean {
  try {
    const s = localStorage.getItem(SOLDE_KEY);
    const f = localStorage.getItem(FACTURES_KEY);
    if (s && JSON.parse(s).length > 0) return true;
    if (f && JSON.parse(f).length > 0) return true;
  } catch {
    return false;
  }
  return false;
}

/** Return counts without doing any work. */
export function countLocalData(): { clients: number; factures: number } {
  let clients = 0;
  let factures = 0;
  try {
    const s = localStorage.getItem(SOLDE_KEY);
    if (s) clients = JSON.parse(s).length ?? 0;
  } catch {
    clients = 0;
  }
  try {
    const f = localStorage.getItem(FACTURES_KEY);
    if (f) factures = JSON.parse(f).length ?? 0;
  } catch {
    factures = 0;
  }
  return { clients, factures };
}

/** Build an xlsx file in-memory from a JSON array and return a File ready to upload. */
function buildXlsxFile<T extends object>(
  rows: T[],
  sheetName: string,
  filename: string
): File {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const array = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new File([array], filename, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Read localStorage, push to backend, and clear the local keys on success. */
export async function migrateLocalToCloud(): Promise<MigrationResult> {
  const result: MigrationResult = {
    soldeImported: null,
    facturesImported: null,
    errors: [],
  };

  // Solde — the backend parser expects sheet name "Feuil1" + first two columns
  try {
    const raw = localStorage.getItem(SOLDE_KEY);
    if (raw) {
      const list = JSON.parse(raw) as { nom: string; montantDu: number }[];
      if (list.length > 0) {
        const rows = list.map(c => ({ "Nom client": c.nom, "Montant dû": c.montantDu }));
        const file = buildXlsxFile(rows, "Feuil1", "solde-migration.xlsx");
        result.soldeImported = await importsApi.uploadSolde(file);
      }
    }
  } catch (e) {
    result.errors.push(
      "Solde : " + (e instanceof Error ? e.message : "erreur inconnue")
    );
  }

  // Factures — sheet "Export", columns matching the canonical Odoo export
  try {
    const raw = localStorage.getItem(FACTURES_KEY);
    if (raw) {
      const list = JSON.parse(raw) as Array<Record<string, unknown>>;
      if (list.length > 0) {
        const rows = list.map(f => ({
          "Nom client": f.nomClient,
          "Activité": f.activite,
          "N° Facture": f.numFacture,
          "Date de paiement": f.datePaiement,
          "Date Facture": f.dateFacture,
          "Echéance Prevue - Account": f.echeancePrevue,
          "Devise": f.devise,
          "Paiement": f.paiement,
          "Hors taxes": f.horsTaxes,
          "Montant en devise (selon pays)": f.montantDevise,
          "is_customer_group": f.isCustomerGroup,
          "M. Recouvrement en Dinar TN": f.montantRecouvrement,
          "Montant recouvré en Dinar TN": f.montantRecouvre,
          "Total TTC en Dinar TN": f.totalTTC,
        }));
        const file = buildXlsxFile(rows, "Export", "factures-migration.xlsx");
        result.facturesImported = await importsApi.uploadFactures(file);
      }
    }
  } catch (e) {
    result.errors.push(
      "Factures : " + (e instanceof Error ? e.message : "erreur inconnue")
    );
  }

  // On success, clear the legacy keys so users don't re-migrate by accident
  if (result.errors.length === 0 && (result.soldeImported || result.facturesImported)) {
    try {
      localStorage.removeItem(SOLDE_KEY);
      localStorage.removeItem(FACTURES_KEY);
      localStorage.removeItem("medianet_actions_v1");
      localStorage.removeItem("medianet_settings_v1");
      localStorage.removeItem("medianet_import_meta_v1");
    } catch {
      // ignore cleanup failures
    }
  }

  return result;
}
