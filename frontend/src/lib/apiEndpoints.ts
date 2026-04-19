/**
 * Typed API endpoints for business data (clients, factures, actions, settings, analytics).
 * Keep this file thin — it just wraps api() with typed shapes.
 */
import { api } from "./api";

// ─── Shared types ────────────────────────────────────────────────────
export interface SoldeClient {
  id: string;
  nom: string;
  montantDu: number;
  updated_at: string;
}

export interface Facture {
  id: string;
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
  source: string;
  notes: string;
  montantConcerne: number;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
}

export interface AgingBuckets {
  normal: number;
  vigilance: number;
  critique: number;
}

export interface AppSettings {
  org_id: string;
  scoringWeights: {
    delaiMoyen: number;
    tauxPaye: number;
    ancienneteImpayes: number;
    encoursRelatif: number;
    nbRelances: number;
  };
  scoreThresholds: { bon: number; moyen: number; risque: number };
  alertThresholds: {
    echeanceJours: number;
    relanceEmail: number;
    relanceAppel: number;
    relanceRdv: number;
    relanceAvocat: number;
    encoursMinEscalade: number;
  };
  agingBuckets: AgingBuckets;
  team: TeamMember[];
  companyName: string;
  logoBase64: string | null;
  currencyFormat: string;
  updated_at: string;
}

// ─── Clients ─────────────────────────────────────────────────────────
export const clientsApi = {
  list: () => api<SoldeClient[]>("/api/clients"),
};

// ─── Factures ────────────────────────────────────────────────────────
export const facturesApi = {
  list: () => api<Facture[]>("/api/factures"),
};

// ─── Actions ─────────────────────────────────────────────────────────
export const actionsApi = {
  list: () => api<ActionRelance[]>("/api/actions"),
  create: (payload: Omit<ActionRelance, "id" | "dateCreation" | "source">) =>
    api<ActionRelance>("/api/actions", { method: "POST", body: payload }),
  update: (id: string, payload: Partial<ActionRelance>) =>
    api<ActionRelance>(`/api/actions/${id}`, { method: "PATCH", body: payload }),
  remove: (id: string) => api<void>(`/api/actions/${id}`, { method: "DELETE" }),
};

// ─── Settings ────────────────────────────────────────────────────────
export const settingsApi = {
  get: () => api<AppSettings>("/api/settings"),
  update: (payload: Partial<AppSettings>) =>
    api<AppSettings>("/api/settings", { method: "PATCH", body: payload }),
};

// ─── Analytics ───────────────────────────────────────────────────────
export interface AnalyticsFiltersQS {
  activite?: string | null;
  group_mode?: "all" | "external" | "group";
  date_from?: string | null;
  date_to?: string | null;
  only_overdue?: boolean;
}

export type AgingCategory = "normal" | "vigilance" | "critique" | "danger";

export interface ClientPerformance {
  nomClient: string;
  caRealise: number;
  montantRecouvre: number;
  montantAttendu: number;
  resteARecouvrer: number;
  tauxRecouvrement: number;
  nbFactures: number;
  nbImpayees: number;
  delaiMoyenPaiement: number | null;
  agingMix: Record<AgingCategory, number>;
  pireAging: AgingCategory;
  isGroup: boolean;
}

export interface ActivityBreakdown {
  activite: string;
  caRealise: number;
  montantRecouvre: number;
  resteARecouvrer: number;
  tauxRecouvrement: number;
  nbFactures: number;
}

export interface AnalyticsSummary {
  kpis: {
    caRealise: number;
    montantRecouvre: number;
    montantAttendu: number;
    resteARecouvrer: number;
    tauxRecouvrement: number;
    nbFactures: number;
    nbClients: number;
    nbClientsEnRetard: number;
    delaiMoyenPaiement: number | null;
    agingTotals: Record<AgingCategory, number>;
    agingCounts: Record<AgingCategory, number>;
  };
  clientPerformance: ClientPerformance[];
  activityBreakdown: ActivityBreakdown[];
  agingBuckets: AgingBuckets;
}

export interface Suggestion {
  title: string;
  detail: string;
  severity: "info" | "warning" | "danger" | "success";
  action: string;
}

export interface SuggestionsPayload {
  tauxRecouvrement?: Suggestion[];
  resteARecouvrer?: Suggestion[];
  delaiMoyenPaiement?: Suggestion[];
  retardsCritiques?: Suggestion[];
  concentration?: Suggestion[];
  _source?: string;
}

function filtersToQuery(f: AnalyticsFiltersQS): Record<string, string | boolean | null | undefined> {
  return {
    activite: f.activite ?? undefined,
    group_mode: f.group_mode ?? "all",
    date_from: f.date_from ?? undefined,
    date_to: f.date_to ?? undefined,
    only_overdue: f.only_overdue ?? false,
  };
}

export const analyticsApi = {
  summary: (filters: AnalyticsFiltersQS = {}) =>
    api<AnalyticsSummary>("/api/analytics/summary", { query: filtersToQuery(filters) }),

  suggestions: (filters: AnalyticsFiltersQS = {}) =>
    api<SuggestionsPayload>("/api/analytics/suggestions", { query: filtersToQuery(filters) }),
};
