import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { reportsApi, type ReportConfig, type ReportConfigCreatePayload, type ReportRun, type ReportPreset } from "@/lib/reportsApi";

export const reportsKeys = {
  presets: ["reports", "presets"] as const,
  configs: ["reports", "configs"] as const,
  runs: ["reports", "runs"] as const,
};

export function useReportPresets(): UseQueryResult<Record<string, ReportPreset>> {
  return useQuery({
    queryKey: reportsKeys.presets,
    queryFn: () => reportsApi.listPresets(),
    staleTime: Infinity, // presets are static per deployment
  });
}

export function useReportConfigs(): UseQueryResult<ReportConfig[]> {
  return useQuery({
    queryKey: reportsKeys.configs,
    queryFn: () => reportsApi.list(),
  });
}

export function useReportRuns(limit = 50): UseQueryResult<ReportRun[]> {
  return useQuery({
    queryKey: [...reportsKeys.runs, limit],
    queryFn: () => reportsApi.runs(limit),
  });
}

export function useCreateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReportConfigCreatePayload) => reportsApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportsKeys.configs });
    },
  });
}

export function useUpdateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<ReportConfigCreatePayload> }) =>
      reportsApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportsKeys.configs });
    },
  });
}

export function useDeleteReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reportsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportsKeys.configs });
    },
  });
}

export function useRunReportNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reportsApi.runNow(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportsKeys.configs });
      qc.invalidateQueries({ queryKey: reportsKeys.runs });
    },
  });
}
