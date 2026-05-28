import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { estimateJobCost } from "./pricing";
import type {
  AnalyticsBundle,
  DailyTrendPoint,
  KpiSummary,
  OverrideRow,
  ProviderModelRow,
  RangeKey,
  TopErrorRow,
} from "./translation-stats.types";

// Re-export the shared types so existing imports of these names from this
// module keep working without every caller having to know about the split.
export type {
  AnalyticsBundle,
  DailyTrendPoint,
  KpiSummary,
  OverrideRow,
  ProviderModelRow,
  RangeKey,
  TopErrorRow,
} from "./translation-stats.types";
export { RANGE_LABELS, parseRange } from "./translation-stats.types";

/**
 * Server-only analytics aggregations for the admin dashboard.
 *
 * Data sources:
 *  - `translation_jobs` — one row per attempt (provider, model, tokens, latency, status, error)
 *  - `story_part_versions` — every saved version, with `created_by ∈ {ai, admin}` for override rate
 *
 * Strategy: pull rows in range (capped at MAX_ROWS) and aggregate in JS.
 * Admin-only surface + small volumes today → simpler than a Postgres RPC.
 * If `translation_jobs` ever exceeds ~10k rows in a typical window, swap this
 * for a server-side SQL function.
 */

const MAX_ROWS = 10_000;

function rangeStartIso(range: RangeKey): string | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function fetchAnalytics(range: RangeKey): Promise<AnalyticsBundle> {
  const admin = createAdminClient();
  const rangeStart = rangeStartIso(range);

  const jobsQuery = admin
    .from("translation_jobs")
    .select(
      "id, provider, model, status, input_tokens, output_tokens, duration_ms, error_message, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (rangeStart) jobsQuery.gte("created_at", rangeStart);

  const versionsQuery = admin
    .from("story_part_versions")
    .select("id, created_by, model_used, provider_used, created_at")
    .limit(MAX_ROWS);
  if (rangeStart) versionsQuery.gte("created_at", rangeStart);

  const [jobsResult, versionsResult] = await Promise.all([jobsQuery, versionsQuery]);

  if (jobsResult.error) throw new Error(`translation_jobs query failed: ${jobsResult.error.message}`);
  if (versionsResult.error)
    throw new Error(`story_part_versions query failed: ${versionsResult.error.message}`);

  const jobs = jobsResult.data ?? [];
  const versions = versionsResult.data ?? [];

  return {
    range,
    rangeStart,
    kpis: aggregateKpis(jobs),
    byProviderModel: aggregateByProviderModel(jobs),
    dailyTrend: aggregateDailyTrend(jobs),
    topErrors: aggregateTopErrors(jobs),
    overrides: aggregateOverrides(versions),
  };
}

type Job = {
  id: string;
  provider: string | null;
  model: string | null;
  status: string;
  input_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
};

function aggregateKpis(jobs: Job[]): KpiSummary {
  let succeeded = 0;
  let failed = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let durationSum = 0;
  let durationCount = 0;
  let totalCostUsd = 0;

  for (const j of jobs) {
    if (j.status === "succeeded") succeeded += 1;
    else if (j.status === "failed") failed += 1;
    totalInputTokens += j.input_tokens ?? 0;
    totalOutputTokens += j.output_tokens ?? 0;
    if (j.duration_ms != null) {
      durationSum += j.duration_ms;
      durationCount += 1;
    }
    totalCostUsd += estimateJobCost(j.provider, j.model, j.input_tokens, j.output_tokens);
  }

  const settled = succeeded + failed;
  return {
    totalAttempts: jobs.length,
    succeeded,
    failed,
    successRatePct: settled === 0 ? 0 : (succeeded / settled) * 100,
    totalInputTokens,
    totalOutputTokens,
    avgDurationMs: durationCount === 0 ? 0 : durationSum / durationCount,
    totalCostUsd,
    truncated: jobs.length === MAX_ROWS,
  };
}

function aggregateByProviderModel(jobs: Job[]): ProviderModelRow[] {
  const buckets = new Map<
    string,
    {
      provider: string;
      model: string;
      attempts: number;
      succeeded: number;
      failed: number;
      durationSum: number;
      durationCount: number;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
    }
  >();

  for (const j of jobs) {
    const provider = j.provider ?? "unknown";
    const model = j.model ?? "unknown";
    const key = `${provider}:::${model}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        provider,
        model,
        attempts: 0,
        succeeded: 0,
        failed: 0,
        durationSum: 0,
        durationCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      };
      buckets.set(key, b);
    }
    b.attempts += 1;
    if (j.status === "succeeded") b.succeeded += 1;
    else if (j.status === "failed") b.failed += 1;
    if (j.duration_ms != null) {
      b.durationSum += j.duration_ms;
      b.durationCount += 1;
    }
    b.inputTokens += j.input_tokens ?? 0;
    b.outputTokens += j.output_tokens ?? 0;
    b.costUsd += estimateJobCost(j.provider, j.model, j.input_tokens, j.output_tokens);
  }

  const rows: ProviderModelRow[] = [];
  for (const b of buckets.values()) {
    const settled = b.succeeded + b.failed;
    rows.push({
      provider: b.provider,
      model: b.model,
      attempts: b.attempts,
      succeeded: b.succeeded,
      failed: b.failed,
      successRatePct: settled === 0 ? 0 : (b.succeeded / settled) * 100,
      avgDurationMs: b.durationCount === 0 ? 0 : b.durationSum / b.durationCount,
      inputTokens: b.inputTokens,
      outputTokens: b.outputTokens,
      costUsd: b.costUsd,
    });
  }
  rows.sort((a, b) => b.attempts - a.attempts);
  return rows;
}

function aggregateDailyTrend(jobs: Job[]): DailyTrendPoint[] {
  const buckets = new Map<string, { attempts: number; succeeded: number; costUsd: number }>();
  for (const j of jobs) {
    const date = j.created_at.slice(0, 10); // YYYY-MM-DD (UTC from ISO string)
    let b = buckets.get(date);
    if (!b) {
      b = { attempts: 0, succeeded: 0, costUsd: 0 };
      buckets.set(date, b);
    }
    b.attempts += 1;
    if (j.status === "succeeded") b.succeeded += 1;
    b.costUsd += estimateJobCost(j.provider, j.model, j.input_tokens, j.output_tokens);
  }
  const points: DailyTrendPoint[] = [];
  for (const [date, v] of buckets.entries()) {
    points.push({ date, attempts: v.attempts, succeeded: v.succeeded, costUsd: v.costUsd });
  }
  points.sort((a, b) => a.date.localeCompare(b.date));
  return points;
}

function aggregateTopErrors(jobs: Job[]): TopErrorRow[] {
  const buckets = new Map<string, { count: number; lastSeen: string }>();
  for (const j of jobs) {
    if (j.status !== "failed" || !j.error_message) continue;
    const message = truncate(j.error_message, 240);
    const existing = buckets.get(message);
    if (!existing) {
      buckets.set(message, { count: 1, lastSeen: j.created_at });
    } else {
      existing.count += 1;
      if (j.created_at > existing.lastSeen) existing.lastSeen = j.created_at;
    }
  }
  const rows: TopErrorRow[] = [];
  for (const [message, v] of buckets.entries()) {
    rows.push({ message, count: v.count, lastSeen: v.lastSeen });
  }
  rows.sort((a, b) => b.count - a.count);
  return rows.slice(0, 8);
}

type Version = {
  id: string;
  created_by: string;
  model_used: string | null;
  provider_used: string | null;
  created_at: string;
};

function aggregateOverrides(versions: Version[]): OverrideRow[] {
  const buckets = new Map<string, { aiVersions: number; adminVersions: number }>();
  for (const v of versions) {
    const model = v.model_used ?? "—";
    let b = buckets.get(model);
    if (!b) {
      b = { aiVersions: 0, adminVersions: 0 };
      buckets.set(model, b);
    }
    if (v.created_by === "admin") b.adminVersions += 1;
    else b.aiVersions += 1;
  }
  const rows: OverrideRow[] = [];
  for (const [model, v] of buckets.entries()) {
    const total = v.aiVersions + v.adminVersions;
    rows.push({
      model,
      aiVersions: v.aiVersions,
      adminVersions: v.adminVersions,
      overrideRatePct: total === 0 ? 0 : (v.adminVersions / total) * 100,
    });
  }
  rows.sort((a, b) => b.aiVersions + b.adminVersions - (a.aiVersions + a.adminVersions));
  return rows;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
