/**
 * Client-side analytics helpers.
 * Mirrors the backend analytics_engine.py — used to drive the AnalyseIA page
 * UI state (aging colors, labels, bucket ranges, formatting).
 *
 * The heavy lifting (KPI aggregates, top clients, activity breakdown, AI
 * suggestions) is done on the server via /api/analytics. These helpers are
 * only for presentation concerns that must stay in sync with the server's
 * aging classification logic.
 */

export type AgingCategory = "normal" | "vigilance" | "critique" | "danger";

export interface AgingBucketDef {
  key: AgingCategory;
  label: string;
  color: string;
  badgeClass: string;
}

export const AGING_BUCKET_DEFS: Record<AgingCategory, AgingBucketDef> = {
  normal: {
    key: "normal",
    label: "Normal",
    color: "hsl(142, 72%, 35%)",
    badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  vigilance: {
    key: "vigilance",
    label: "Vigilance",
    color: "hsl(42, 92%, 48%)",
    badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
  },
  critique: {
    key: "critique",
    label: "Critique",
    color: "hsl(22, 90%, 52%)",
    badgeClass: "bg-orange-100 text-orange-700 border-orange-200",
  },
  danger: {
    key: "danger",
    label: "Danger",
    color: "hsl(0, 78%, 48%)",
    badgeClass: "bg-red-100 text-red-700 border-red-200",
  },
};

export const AGING_BUCKET_ORDER: AgingCategory[] = ["normal", "vigilance", "critique", "danger"];

export interface AgingBuckets {
  normal: number;
  vigilance: number;
  critique: number;
}

export function classifyAging(daysOverdue: number, b: AgingBuckets): AgingCategory {
  if (daysOverdue <= b.normal) return "normal";
  if (daysOverdue <= b.vigilance) return "vigilance";
  if (daysOverdue <= b.critique) return "critique";
  return "danger";
}

export function bucketRangeLabel(cat: AgingCategory, b: AgingBuckets): string {
  switch (cat) {
    case "normal":
      return `0–${b.normal} j`;
    case "vigilance":
      return `${b.normal + 1}–${b.vigilance} j`;
    case "critique":
      return `${b.vigilance + 1}–${b.critique} j`;
    case "danger":
      return `> ${b.critique} j`;
  }
}

export function formatTND(n: number): string {
  if (!isFinite(n)) return "—";
  return (
    new Intl.NumberFormat("fr-TN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(n)) + " DT"
  );
}

export function formatPct(n: number): string {
  if (!isFinite(n)) return "—";
  return `${Math.round(n * 100)}%`;
}
