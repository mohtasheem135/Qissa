/**
 * Pure types + range helpers for the analytics page.
 *
 * Lives in a separate file (no `server-only` import) so client components
 * like [components/admin/AnalyticsRangeFilter.tsx] can import the types and
 * `RANGE_LABELS` without dragging the server-only aggregation module into
 * the client bundle.
 */

export type RangeKey = "7d" | "30d" | "90d" | "all";

export const RANGE_LABELS: Record<RangeKey, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

export function parseRange(value: string | undefined): RangeKey {
  if (value === "7d" || value === "30d" || value === "90d" || value === "all") return value;
  return "30d";
}

export interface KpiSummary {
  totalAttempts: number;
  succeeded: number;
  failed: number;
  successRatePct: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgDurationMs: number;
  totalCostUsd: number;
  truncated: boolean;
}

export interface ProviderModelRow {
  provider: string;
  model: string;
  attempts: number;
  succeeded: number;
  failed: number;
  successRatePct: number;
  avgDurationMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface DailyTrendPoint {
  /** YYYY-MM-DD in UTC. */
  date: string;
  attempts: number;
  succeeded: number;
  costUsd: number;
}

export interface TopErrorRow {
  message: string;
  count: number;
  lastSeen: string;
}

export interface OverrideRow {
  model: string;
  aiVersions: number;
  adminVersions: number;
  overrideRatePct: number;
}

export interface AnalyticsBundle {
  range: RangeKey;
  rangeStart: string | null;
  kpis: KpiSummary;
  byProviderModel: ProviderModelRow[];
  dailyTrend: DailyTrendPoint[];
  topErrors: TopErrorRow[];
  overrides: OverrideRow[];
}
