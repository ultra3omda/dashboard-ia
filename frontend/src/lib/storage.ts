/**
 * `storage.ts` — legacy façade, kept to avoid refactoring ~10 pages.
 *
 * Historical behaviour : localStorage-backed synchronous getters.
 * New behaviour : the same synchronous getters now read from an in-memory
 * cache that is populated by `<DataBootstrap>` at app startup via the
 * authenticated REST API. Writes (saveSettings, saveActions, etc.) push
 * both the cache AND the backend.
 *
 * This lets the seven existing business pages keep working without edits,
 * while the source of truth lives in MongoDB on the server.
 */
import {
  SoldeClient, Facture, ActionRelance, ImportSummary, isReversed,
} from "@/types/data";
import { actionsApi, settingsApi, clientsApi, facturesApi } from "@/lib/apiEndpoints";
import type { AppSettings as ApiAppSettings } from "@/lib/apiEndpoints";

// ═══════════════════════════════════════════════════════════════════
// Shared types (kept identical to the original module for compatibility)
// ═══════════════════════════════════════════════════════════════════

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
  /** Aging classification thresholds (days overdue). */
  agingBuckets: {
    normal: number;
    vigilance: number;
    critique: number;
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
  agingBuckets: { normal: 30, vigilance: 60, critique: 90 },
  team: [],
  companyName: "MEDIANET",
  logoBase64: null,
  currencyFormat: "DT",
};

// ═══════════════════════════════════════════════════════════════════
// In-memory cache
// ═══════════════════════════════════════════════════════════════════

interface DataCache {
  solde: SoldeClient[];
  factures: Facture[];
  actions: ActionRelance[];
  settings: AppSettings;
  importMeta: ImportMeta;
  loaded: boolean;
}

const cache: DataCache = {
  solde: [],
  factures: [],
  actions: [],
  settings: { ...defaultSettings },
  importMeta: { lastSoldeImport: null, lastFacturesImport: null },
  loaded: false,
};

// Subscribers for cache changes — lets UI components refresh without a full React rerender
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeToStorage(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach(fn => {
    try {
      fn();
    } catch (e) {
      console.error("Storage listener error:", e);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
// Bootstrap — called by <DataBootstrap> after login
// ═══════════════════════════════════════════════════════════════════

function normalizeApiSettings(api: ApiAppSettings): AppSettings {
  return {
    scoringWeights: { ...defaultSettings.scoringWeights, ...api.scoringWeights },
    scoreThresholds: { ...defaultSettings.scoreThresholds, ...api.scoreThresholds },
    alertThresholds: { ...defaultSettings.alertThresholds, ...api.alertThresholds },
    agingBuckets: { ...defaultSettings.agingBuckets, ...api.agingBuckets },
    team: api.team ?? [],
    companyName: api.companyName ?? "MEDIANET",
    logoBase64: api.logoBase64 ?? null,
    currencyFormat: (api.currencyFormat === "TND" ? "TND" : "DT") as "DT" | "TND",
  };
}

/** Fetch everything from the API and fill the cache. Safe to call multiple times. */
export async function bootstrapStorage(): Promise<void> {
  const [soldeRes, facturesRes, actionsRes, settingsRes] = await Promise.allSettled([
    clientsApi.list(),
    facturesApi.list(),
    actionsApi.list(),
    settingsApi.get(),
  ]);

  if (soldeRes.status === "fulfilled") {
    cache.solde = soldeRes.value.map(c => ({
      id: c.id,
      nom: c.nom,
      montantDu: c.montantDu,
      updated_at: c.updated_at,
    }));
  }
  if (facturesRes.status === "fulfilled") {
    cache.factures = facturesRes.value.map(f => ({ ...f }));
  }
  if (actionsRes.status === "fulfilled") {
    cache.actions = actionsRes.value.map(a => ({ ...a, source: a.source as ActionRelance["source"] }));
  }
  if (settingsRes.status === "fulfilled") {
    cache.settings = normalizeApiSettings(settingsRes.value);
  }

  cache.loaded = true;
  notify();
}

export function clearCache() {
  cache.solde = [];
  cache.factures = [];
  cache.actions = [];
  cache.settings = { ...defaultSettings };
  cache.importMeta = { lastSoldeImport: null, lastFacturesImport: null };
  cache.loaded = false;
  notify();
}

export function isBootstrapped(): boolean {
  return cache.loaded;
}

// ═══════════════════════════════════════════════════════════════════
// Getters — synchronous, read from cache (drop-in replacements)
// ═══════════════════════════════════════════════════════════════════

export function getSoldeClients(): SoldeClient[] {
  return cache.solde;
}

export function getFactures(): Facture[] {
  return cache.factures;
}

export function getActiveFactures(): Facture[] {
  return cache.factures.filter(f => !isReversed(f.paiement));
}

export function getActions(): ActionRelance[] {
  return cache.actions;
}

export function getSettings(): AppSettings {
  return cache.settings;
}

export function getImportMeta(): ImportMeta {
  return cache.importMeta;
}

export function hasData(): boolean {
  return cache.solde.length > 0 || cache.factures.length > 0;
}

// ═══════════════════════════════════════════════════════════════════
// Setters — push to cache AND to backend
// ═══════════════════════════════════════════════════════════════════

/** Optimistic update + server persistence. */
export function saveSettings(settings: AppSettings) {
  cache.settings = { ...settings };
  notify();
  // Fire and forget — caller can await the returned promise if it cares
  void settingsApi.update(settings as Partial<ApiAppSettings>).catch(err => {
    console.error("saveSettings server sync failed:", err);
  });
}

export function saveImportMeta(meta: Partial<ImportMeta>) {
  cache.importMeta = { ...cache.importMeta, ...meta };
  notify();
}

export function saveActions(actions: ActionRelance[]) {
  // This setter was used to bulk-save the whole array to localStorage.
  // Callers now should prefer createAction/updateAction/deleteAction.
  // We diff against the cache to determine what changed and sync.
  const prev = new Map(cache.actions.map(a => [a.id, a]));
  const next = new Map(actions.map(a => [a.id, a]));

  cache.actions = actions;
  notify();

  // Create + update
  const tasks: Promise<unknown>[] = [];
  for (const [id, action] of next) {
    if (!prev.has(id)) {
      tasks.push(
        actionsApi.create({
          clientNom: action.clientNom,
          factureId: action.factureId,
          type: action.type,
          priorite: action.priorite,
          assigneA: action.assigneA,
          statut: action.statut,
          datePrevue: action.datePrevue,
          notes: action.notes,
          montantConcerne: action.montantConcerne,
        }).catch(err => console.error("createAction failed:", err))
      );
    } else if (JSON.stringify(prev.get(id)) !== JSON.stringify(action)) {
      tasks.push(
        actionsApi.update(id, {
          type: action.type,
          priorite: action.priorite,
          assigneA: action.assigneA,
          statut: action.statut,
          datePrevue: action.datePrevue,
          notes: action.notes,
          montantConcerne: action.montantConcerne,
        }).catch(err => console.error("updateAction failed:", err))
      );
    }
  }
  // Delete
  for (const id of prev.keys()) {
    if (!next.has(id)) {
      tasks.push(actionsApi.remove(id).catch(err => console.error("deleteAction failed:", err)));
    }
  }

  void Promise.allSettled(tasks);
}

// ═══════════════════════════════════════════════════════════════════
// Merge helpers — kept for API compatibility but do NOT perform writes.
// The modern path is to upload an Excel via /api/imports and let the
// backend upsert. We keep these functions so that the legacy ImportModal
// compiles; they just return zero-deltas and emit a warning.
// ═══════════════════════════════════════════════════════════════════

export function mergeSoldeClients(_incoming: SoldeClient[]): { newClients: number; updatedClients: number } {
  console.warn("mergeSoldeClients is deprecated — use importsApi.uploadSolde instead");
  return { newClients: 0, updatedClients: 0 };
}

export function mergeFactures(_incoming: Facture[]): { newInvoices: number; updatedInvoices: number } {
  console.warn("mergeFactures is deprecated — use importsApi.uploadFactures instead");
  return { newInvoices: 0, updatedInvoices: 0 };
}

export function importData(_solde: SoldeClient[], _factures: Facture[]): ImportSummary {
  console.warn("importData is deprecated — use the Import modal which calls importsApi");
  return { newClients: 0, updatedClients: 0, newInvoices: 0, updatedInvoices: 0 };
}

export function clearAllData() {
  clearCache();
}

// Internal: allow imports router callers to refresh after upload
export async function refreshAfterImport() {
  try {
    const [soldeRes, facturesRes] = await Promise.all([
      clientsApi.list(),
      facturesApi.list(),
    ]);
    cache.solde = soldeRes.map(c => ({
      id: c.id, nom: c.nom, montantDu: c.montantDu, updated_at: c.updated_at,
    }));
    cache.factures = facturesRes.map(f => ({ ...f }));
    notify();
  } catch (e) {
    console.error("refreshAfterImport failed:", e);
  }
}
