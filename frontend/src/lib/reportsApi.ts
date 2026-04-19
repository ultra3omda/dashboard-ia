/**
 * Reports API endpoints — added in Phase 2.
 * Typed wrappers for the /api/reports routes.
 */
import { api } from "./api";

export interface ReportFilters {
  activite: string | null;
  group_mode: "all" | "external" | "group";
  only_overdue: boolean;
}

export interface ReportSchedule {
  frequency: "daily" | "weekly" | "monthly";
  day_of_week: number | null;   // 0=Monday … 6=Sunday
  day_of_month: number | null;  // 1..28
  hour: number;
  minute: number;
}

export interface ReportSections {
  kpis: boolean;
  aging: boolean;
  top_clients: boolean;
  activities: boolean;
  clients_at_risk: boolean;
  ai_suggestions: boolean;
}

export interface ReportConfig {
  id: string;
  org_id: string;
  name: string;
  description: string;
  recipients: string[];
  schedule: ReportSchedule;
  filters: ReportFilters;
  sections: ReportSections;
  template: string;
  enabled: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
  last_run_status: "success" | "error" | null;
}

export interface ReportConfigCreatePayload {
  name: string;
  description?: string;
  recipients: string[];
  schedule: ReportSchedule;
  filters?: ReportFilters;
  sections?: ReportSections;
  template?: string;
  enabled?: boolean;
}

export interface ReportPreset {
  name: string;
  description: string;
  sections: ReportSections;
}

export interface ReportRun {
  id: string;
  org_id: string;
  config_id: string;
  config_name: string;
  triggered_by: string;
  recipients: string[];
  status: "success" | "error" | "partial";
  error: string | null;
  email_provider_ids: string[];
  started_at: string;
  finished_at: string | null;
}

export const reportsApi = {
  listPresets: () => api<Record<string, ReportPreset>>("/api/reports/presets"),
  list: () => api<ReportConfig[]>("/api/reports/configs"),
  create: (payload: ReportConfigCreatePayload) =>
    api<ReportConfig>("/api/reports/configs", { method: "POST", body: payload }),
  update: (id: string, payload: Partial<ReportConfigCreatePayload>) =>
    api<ReportConfig>(`/api/reports/configs/${id}`, { method: "PATCH", body: payload }),
  remove: (id: string) =>
    api<void>(`/api/reports/configs/${id}`, { method: "DELETE" }),
  runNow: (id: string) =>
    api<ReportRun>(`/api/reports/configs/${id}/run`, { method: "POST" }),
  runs: (limit = 50) =>
    api<ReportRun[]>("/api/reports/runs", { query: { limit } }),
};
