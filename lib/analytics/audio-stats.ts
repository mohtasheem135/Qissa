import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { estimateTtsCost } from "./pricing";
import { type RangeKey } from "./translation-stats.types";

/**
 * Server-only analytics aggregations for AUDIO narration (TTS), mirroring
 * lib/analytics/translation-stats.ts but sourced from `tts_jobs` — one row per
 * synthesis attempt (provider, model, voice, characters, latency, status).
 *
 * TTS bills by characters (not tokens), so cost is char-based via
 * estimateTtsCost. Same pull-and-aggregate-in-JS strategy as translations.
 */

const MAX_ROWS = 10_000;

export interface AudioKpiSummary {
  totalAttempts: number;
  succeeded: number;
  failed: number;
  successRatePct: number;
  totalCharacters: number;
  avgDurationMs: number;
  totalCostUsd: number;
  truncated: boolean;
}

export interface AudioProviderModelRow {
  provider: string;
  model: string;
  attempts: number;
  succeeded: number;
  failed: number;
  successRatePct: number;
  avgDurationMs: number;
  characters: number;
  costUsd: number;
}

export interface AudioVoiceRow {
  provider: string;
  voice: string;
  attempts: number;
  characters: number;
}

export interface AudioDailyPoint {
  date: string;
  attempts: number;
  characters: number;
  costUsd: number;
}

export interface AudioTopErrorRow {
  message: string;
  count: number;
  lastSeen: string;
}

export interface AudioAnalyticsBundle {
  range: RangeKey;
  rangeStart: string | null;
  kpis: AudioKpiSummary;
  byProviderModel: AudioProviderModelRow[];
  byVoice: AudioVoiceRow[];
  dailyTrend: AudioDailyPoint[];
  topErrors: AudioTopErrorRow[];
}

function rangeStartIso(range: RangeKey): string | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

type AudioJob = {
  tts_provider: string | null;
  tts_model: string | null;
  voice_id: string | null;
  status: string;
  characters: number | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
};

export async function fetchAudioAnalytics(range: RangeKey): Promise<AudioAnalyticsBundle> {
  const admin = createAdminClient();
  const rangeStart = rangeStartIso(range);

  const query = admin
    .from("tts_jobs")
    .select(
      "tts_provider, tts_model, voice_id, status, characters, duration_ms, error_message, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (rangeStart) query.gte("created_at", rangeStart);

  const { data, error } = await query;
  if (error) throw new Error(`tts_jobs query failed: ${error.message}`);
  const jobs = (data ?? []) as AudioJob[];

  return {
    range,
    rangeStart,
    kpis: aggregateKpis(jobs),
    byProviderModel: aggregateByProviderModel(jobs),
    byVoice: aggregateByVoice(jobs),
    dailyTrend: aggregateDailyTrend(jobs),
    topErrors: aggregateTopErrors(jobs),
  };
}

function aggregateKpis(jobs: AudioJob[]): AudioKpiSummary {
  let succeeded = 0;
  let failed = 0;
  let totalCharacters = 0;
  let durationSum = 0;
  let durationCount = 0;
  let totalCostUsd = 0;

  for (const j of jobs) {
    if (j.status === "succeeded") succeeded += 1;
    else if (j.status === "failed") failed += 1;
    // Only successful attempts actually synthesized (and billed) characters.
    if (j.status === "succeeded") {
      totalCharacters += j.characters ?? 0;
      totalCostUsd += estimateTtsCost(j.tts_provider, j.tts_model, j.characters);
    }
    if (j.duration_ms != null) {
      durationSum += j.duration_ms;
      durationCount += 1;
    }
  }

  const settled = succeeded + failed;
  return {
    totalAttempts: jobs.length,
    succeeded,
    failed,
    successRatePct: settled === 0 ? 0 : (succeeded / settled) * 100,
    totalCharacters,
    avgDurationMs: durationCount === 0 ? 0 : durationSum / durationCount,
    totalCostUsd,
    truncated: jobs.length === MAX_ROWS,
  };
}

function aggregateByProviderModel(jobs: AudioJob[]): AudioProviderModelRow[] {
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
      characters: number;
      costUsd: number;
    }
  >();

  for (const j of jobs) {
    const provider = j.tts_provider ?? "unknown";
    const model = j.tts_model ?? "unknown";
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
        characters: 0,
        costUsd: 0,
      };
      buckets.set(key, b);
    }
    b.attempts += 1;
    if (j.status === "succeeded") {
      b.succeeded += 1;
      b.characters += j.characters ?? 0;
      b.costUsd += estimateTtsCost(j.tts_provider, j.tts_model, j.characters);
    } else if (j.status === "failed") {
      b.failed += 1;
    }
    if (j.duration_ms != null) {
      b.durationSum += j.duration_ms;
      b.durationCount += 1;
    }
  }

  const rows: AudioProviderModelRow[] = [];
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
      characters: b.characters,
      costUsd: b.costUsd,
    });
  }
  rows.sort((a, b) => b.attempts - a.attempts);
  return rows;
}

function aggregateByVoice(jobs: AudioJob[]): AudioVoiceRow[] {
  const buckets = new Map<string, { provider: string; voice: string; attempts: number; characters: number }>();
  for (const j of jobs) {
    const provider = j.tts_provider ?? "unknown";
    const voice = j.voice_id ?? "unknown";
    const key = `${provider}:::${voice}`;
    let b = buckets.get(key);
    if (!b) {
      b = { provider, voice, attempts: 0, characters: 0 };
      buckets.set(key, b);
    }
    b.attempts += 1;
    if (j.status === "succeeded") b.characters += j.characters ?? 0;
  }
  const rows = [...buckets.values()];
  rows.sort((a, b) => b.attempts - a.attempts);
  return rows.slice(0, 12);
}

function aggregateDailyTrend(jobs: AudioJob[]): AudioDailyPoint[] {
  const buckets = new Map<string, { attempts: number; characters: number; costUsd: number }>();
  for (const j of jobs) {
    const date = j.created_at.slice(0, 10);
    let b = buckets.get(date);
    if (!b) {
      b = { attempts: 0, characters: 0, costUsd: 0 };
      buckets.set(date, b);
    }
    b.attempts += 1;
    if (j.status === "succeeded") {
      b.characters += j.characters ?? 0;
      b.costUsd += estimateTtsCost(j.tts_provider, j.tts_model, j.characters);
    }
  }
  const points: AudioDailyPoint[] = [];
  for (const [date, v] of buckets.entries()) {
    points.push({ date, attempts: v.attempts, characters: v.characters, costUsd: v.costUsd });
  }
  points.sort((a, b) => a.date.localeCompare(b.date));
  return points;
}

function aggregateTopErrors(jobs: AudioJob[]): AudioTopErrorRow[] {
  const buckets = new Map<string, { count: number; lastSeen: string }>();
  for (const j of jobs) {
    if (j.status !== "failed" || !j.error_message) continue;
    const message = j.error_message.length <= 240 ? j.error_message : `${j.error_message.slice(0, 239)}…`;
    const existing = buckets.get(message);
    if (!existing) {
      buckets.set(message, { count: 1, lastSeen: j.created_at });
    } else {
      existing.count += 1;
      if (j.created_at > existing.lastSeen) existing.lastSeen = j.created_at;
    }
  }
  const rows: AudioTopErrorRow[] = [];
  for (const [message, v] of buckets.entries()) {
    rows.push({ message, count: v.count, lastSeen: v.lastSeen });
  }
  rows.sort((a, b) => b.count - a.count);
  return rows.slice(0, 8);
}
