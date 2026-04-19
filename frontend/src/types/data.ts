export interface SoldeClient {
  /** Server-assigned ID. Absent on legacy localStorage data. */
  id?: string;
  nom: string;
  montantDu: number;
  /** ISO timestamp set by the backend on last update. */
  updated_at?: string;
}

export interface Facture {
  /** Server-assigned ID. Absent on legacy localStorage data. */
  id?: string;
  nomClient: string;
  activite: string;
  numFacture: string;
  datePaiement: string | null;
  dateFacture: string;
  echeancePrevue: string;
  devise: string;
  paiement: string;
  horsTaxes: number;
  montantDevise: number;
  isCustomerGroup: boolean;
  montantRecouvrement: number;
  montantRecouvre: number;
  totalTTC: number;
}

export type PaymentStatus = "paid" | "partial" | "unpaid";

export interface ImportSummary {
  newClients: number;
  updatedClients: number;
  newInvoices: number;
  updatedInvoices: number;
}

export interface ActionRelance {
  id: string;
  clientNom: string;
  factureId: string | null;
  type: "email" | "appel" | "rdv" | "avocat" | "autre";
  priorite: "haute" | "moyenne" | "basse";
  assigneA: string;
  statut: "à faire" | "en cours" | "fait" | "annulé";
  datePrevue: string;
  dateCreation: string;
  source: "manuel" | "ia" | "alerte_auto";
  notes: string;
  montantConcerne: number;
}

export function getPaymentStatus(paiement: string): PaymentStatus {
  const p = paiement?.toLowerCase().trim() ?? "";
  if (["paid", "in_payment"].includes(p)) return "paid";
  if (p === "partial") return "partial";
  return "unpaid";
}

export function isReversed(paiement: string): boolean {
  return paiement?.toLowerCase().trim() === "reversed";
}

function excelSerialToDate(serial: number): Date {
  return new Date((serial - 25569) * 86400 * 1000);
}

export function safeParseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && value > 1000 && value < 100000) {
    const d = excelSerialToDate(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;
    // DD/MM/YYYY
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (dmy) {
      let yr = parseInt(dmy[3]); if (yr < 100) yr += 2000;
      const d = new Date(Date.UTC(yr, parseInt(dmy[2]) - 1, parseInt(dmy[1])));
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function safeDateToISO(value: unknown): string {
  const d = safeParseDate(value);
  return d ? d.toISOString().split("T")[0] : "";
}

export function computeEcheance(echeancePrevue: string | null | undefined, dateFacture: string | null | undefined): string {
  const ech = safeParseDate(echeancePrevue);
  if (ech) {
    return ech.toISOString().split("T")[0];
  }

  const df = safeParseDate(dateFacture);
  if (df) {
    const fallback = new Date(df);
    fallback.setDate(fallback.getDate() + 60);
    return fallback.toISOString().split("T")[0];
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.toISOString().split("T")[0];
}

export function isExportCurrency(devise: string): boolean {
  return devise?.toUpperCase().trim() !== "TND";
}
