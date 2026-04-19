/**
 * TanStack Query hooks — the ONLY way the frontend should read/write
 * business data now that the backend is the source of truth.
 *
 * These replace the old `lib/storage.ts` localStorage module.
 */
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  clientsApi, facturesApi, actionsApi, settingsApi, analyticsApi,
  type SoldeClient, type Facture, type ActionRelance, type AppSettings,
  type AnalyticsSummary, type SuggestionsPayload, type AnalyticsFiltersQS,
} from "@/lib/apiEndpoints";
import { importsApi, type ImportLog } from "@/lib/api";

// Query keys — centralised to keep invalidations consistent
export const qk = {
  clients: ["clients"] as const,
  factures: ["factures"] as const,
  actions: ["actions"] as const,
  settings: ["settings"] as const,
  importHistory: ["imports", "history"] as const,
  analyticsSummary: (f: AnalyticsFiltersQS) => ["analytics", "summary", f] as const,
  analyticsSuggestions: (f: AnalyticsFiltersQS) => ["analytics", "suggestions", f] as const,
};

// ─── Clients ─────────────────────────────────────────────────────────
export function useClients(): UseQueryResult<SoldeClient[]> {
  return useQuery({
    queryKey: qk.clients,
    queryFn: () => clientsApi.list(),
  });
}

// ─── Factures ────────────────────────────────────────────────────────
export function useFactures(): UseQueryResult<Facture[]> {
  return useQuery({
    queryKey: qk.factures,
    queryFn: () => facturesApi.list(),
  });
}

/** Helper: filter out reversed invoices (mirrors the old isReversed check). */
export function useActiveFactures(): UseQueryResult<Facture[]> {
  const q = useFactures();
  return {
    ...q,
    data: q.data?.filter(f => (f.paiement || "").toLowerCase().trim() !== "reversed"),
  } as UseQueryResult<Facture[]>;
}

// ─── Actions ─────────────────────────────────────────────────────────
export function useActions(): UseQueryResult<ActionRelance[]> {
  return useQuery({
    queryKey: qk.actions,
    queryFn: () => actionsApi.list(),
  });
}

export function useCreateAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof actionsApi.create>[0]) => actionsApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.actions });
    },
  });
}

export function useUpdateAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<ActionRelance> }) =>
      actionsApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.actions });
    },
  });
}

export function useDeleteAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => actionsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.actions });
    },
  });
}

// ─── Settings ────────────────────────────────────────────────────────
export function useSettings(): UseQueryResult<AppSettings> {
  return useQuery({
    queryKey: qk.settings,
    queryFn: () => settingsApi.get(),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<AppSettings>) => settingsApi.update(payload),
    onSuccess: (data) => {
      qc.setQueryData(qk.settings, data);
    },
  });
}

// ─── Imports ─────────────────────────────────────────────────────────
export function useImportHistory(): UseQueryResult<ImportLog[]> {
  return useQuery({
    queryKey: qk.importHistory,
    queryFn: () => importsApi.history(),
  });
}

export function useImportSolde() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => importsApi.uploadSolde(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.clients });
      qc.invalidateQueries({ queryKey: qk.importHistory });
    },
  });
}

export function useImportFactures() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => importsApi.uploadFactures(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.factures });
      qc.invalidateQueries({ queryKey: qk.importHistory });
    },
  });
}

// ─── Analytics ───────────────────────────────────────────────────────
export function useAnalyticsSummary(filters: AnalyticsFiltersQS): UseQueryResult<AnalyticsSummary> {
  return useQuery({
    queryKey: qk.analyticsSummary(filters),
    queryFn: () => analyticsApi.summary(filters),
  });
}

export function useAnalyticsSuggestions(
  filters: AnalyticsFiltersQS,
  enabled = true
): UseQueryResult<SuggestionsPayload> {
  return useQuery({
    queryKey: qk.analyticsSuggestions(filters),
    queryFn: () => analyticsApi.suggestions(filters),
    enabled,
    staleTime: 5 * 60 * 1000, // 5 min — reduce repeated Claude API hits
  });
}
