import { SoldeClient, Facture, ActionRelance, ImportSummary, isReversed } from "@/types/data";

const SOLDE_KEY = "medianet_solde_v1";
const FACTURES_KEY = "medianet_factures_v1";
const ACTIONS_KEY = "medianet_actions_v1";
const SETTINGS_KEY = "medianet_settings_v1";
const IMPORT_META_KEY = "medianet_import_meta_v1";

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
}

export interface AppSettings {
  scoringWeights: {
    delaiMoyen: number;
    tauxPaye: number;
    ancienneteImpayes: number;
    encoursRelatif: number;
    nbRelances: number;
  };
  scoreThresholds: {
    bon: number;
    moyen: number;
    risque: number;
  };
  alertThresholds: {
    echeanceJours: number;
    relanceEmail: number;
    relanceAppel: number;
    relanceRdv: number;
    relanceAvocat: number;
    encoursMinEscalade: number;
  };
  team: TeamMember[];
  companyName: string;
  logoBase64: string | null;
  currencyFormat: "DT" | "TND";
}

export interface ImportMeta {
  lastSoldeImport: string | null;
  lastFacturesImport: string | null;
}

export const defaultSettings: AppSettings = {
  scoringWeights: { delaiMoyen: 30, tauxPaye: 25, ancienneteImpayes: 20, encoursRelatif: 15, nbRelances: 10 },
  scoreThresholds: { bon: 80, moyen: 50, risque: 30 },
  alertThresholds: { echeanceJours: 7, relanceEmail: 30, relanceAppel: 60, relanceRdv: 90, relanceAvocat: 180, encoursMinEscalade: 50000 },
  team: [],
  companyName: "MEDIANET",
  logoBase64: null,
  currencyFormat: "DT",
};

export function getSettings(): AppSettings {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return { ...defaultSettings };
  return { ...defaultSettings, ...JSON.parse(raw) };
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function getImportMeta(): ImportMeta {
  const raw = localStorage.getItem(IMPORT_META_KEY);
  return raw ? JSON.parse(raw) : { lastSoldeImport: null, lastFacturesImport: null };
}

export function saveImportMeta(meta: Partial<ImportMeta>) {
  const existing = getImportMeta();
  localStorage.setItem(IMPORT_META_KEY, JSON.stringify({ ...existing, ...meta }));
}

export function getSoldeClients(): SoldeClient[] {
  const raw = localStorage.getItem(SOLDE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function getFactures(): Facture[] {
  const raw = localStorage.getItem(FACTURES_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function getActions(): ActionRelance[] {
  const raw = localStorage.getItem(ACTIONS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function saveActions(actions: ActionRelance[]) {
  localStorage.setItem(ACTIONS_KEY, JSON.stringify(actions));
}

export function getActiveFactures(): Facture[] {
  return getFactures().filter(f => !isReversed(f.paiement));
}

export function hasData(): boolean {
  return getSoldeClients().length > 0 || getFactures().length > 0;
}

export function mergeSoldeClients(incoming: SoldeClient[]): { newClients: number; updatedClients: number } {
  const existing = getSoldeClients();
  const map = new Map<string, SoldeClient>();
  existing.forEach(c => map.set(c.nom.toLowerCase().trim(), c));

  let newClients = 0;
  let updatedClients = 0;

  incoming.forEach(c => {
    const key = c.nom.toLowerCase().trim();
    if (map.has(key)) {
      map.set(key, { ...map.get(key)!, montantDu: c.montantDu });
      updatedClients++;
    } else {
      map.set(key, c);
      newClients++;
    }
  });

  localStorage.setItem(SOLDE_KEY, JSON.stringify(Array.from(map.values())));
  return { newClients, updatedClients };
}

export function mergeFactures(incoming: Facture[]): { newInvoices: number; updatedInvoices: number } {
  const existing = getFactures();
  const map = new Map<string, Facture>();
  existing.forEach(f => map.set(f.numFacture, f));

  let newInvoices = 0;
  let updatedInvoices = 0;

  incoming.forEach(f => {
    if (map.has(f.numFacture)) {
      map.set(f.numFacture, { ...map.get(f.numFacture)!, ...f });
      updatedInvoices++;
    } else {
      map.set(f.numFacture, f);
      newInvoices++;
    }
  });

  localStorage.setItem(FACTURES_KEY, JSON.stringify(Array.from(map.values())));
  return { newInvoices, updatedInvoices };
}

export function importData(solde: SoldeClient[], factures: Facture[]): ImportSummary {
  const s = mergeSoldeClients(solde);
  const f = mergeFactures(factures);
  return { ...s, ...f };
}

export function clearAllData() {
  localStorage.removeItem(SOLDE_KEY);
  localStorage.removeItem(FACTURES_KEY);
  localStorage.removeItem(ACTIONS_KEY);
}
