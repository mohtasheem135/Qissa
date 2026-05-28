import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Truncate } from "@/components/shared/Truncate";
import { formatDateTime } from "@/lib/utils/format-datetime";
import { formatUsd } from "@/lib/analytics/pricing";
import {
  fetchAnalytics,
  parseRange,
  RANGE_LABELS,
  type ProviderModelRow,
  type OverrideRow,
  type DailyTrendPoint,
  type TopErrorRow,
} from "@/lib/analytics/translation-stats";
import { AnalyticsRangeFilter } from "@/components/admin/AnalyticsRangeFilter";
import { ProgressBar, Sparkline } from "@/components/admin/AnalyticsCharts";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ range?: string }>;
}

export default async function AnalyticsPage({ searchParams }: PageProps) {
  const { range: rawRange } = await searchParams;
  const range = parseRange(rawRange);
  const data = await fetchAnalytics(range);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Translation cost, quality, and reliability — sourced from{" "}
            <code className="text-xs">translation_jobs</code> and{" "}
            <code className="text-xs">story_part_versions</code>. {RANGE_LABELS[range]}.
            {data.kpis.truncated ? (
              <span className="text-amber-600 dark:text-amber-400">
                {" "}
                Showing the most recent 10,000 attempts.
              </span>
            ) : null}
          </p>
        </div>
        <AnalyticsRangeFilter current={range} />
      </header>

      <KpiSection kpis={data.kpis} />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Daily activity</CardTitle>
          </CardHeader>
          <CardContent>
            <DailyTrendChart points={data.dailyTrend} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Cost trend</CardTitle>
          </CardHeader>
          <CardContent>
            <CostTrendChart points={data.dailyTrend} />
          </CardContent>
        </Card>
      </section>

      <section>
        <SectionHeading
          title="Provider / model breakdown"
          subtitle="Per-attempt cost, latency, and success rate. Sorted by attempts."
        />
        <ProviderModelTable rows={data.byProviderModel} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <SectionHeading
            title="Admin override rate"
            subtitle="Share of saved versions that an admin edited by hand rather than accepting AI output. A real quality signal — lower is better."
          />
          <OverrideTable rows={data.overrides} />
        </div>
        <div>
          <SectionHeading
            title="Top errors"
            subtitle="Most frequent failure messages in this range."
          />
          <TopErrorsList rows={data.topErrors} />
        </div>
      </section>
    </div>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {subtitle ? <p className="text-muted-foreground mt-0.5 text-xs">{subtitle}</p> : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-foreground text-2xl font-semibold tabular-nums sm:text-3xl">{value}</p>
        {caption ? <p className="text-muted-foreground mt-1 text-xs">{caption}</p> : null}
      </CardContent>
    </Card>
  );
}

function KpiSection({ kpis }: { kpis: Awaited<ReturnType<typeof fetchAnalytics>>["kpis"] }) {
  const totalTokens = kpis.totalInputTokens + kpis.totalOutputTokens;
  return (
    <section
      aria-label="Headline metrics"
      className="grid grid-cols-2 gap-4 lg:grid-cols-4"
    >
      <KpiCard
        label="Attempts"
        value={kpis.totalAttempts.toLocaleString()}
        caption={`${kpis.succeeded.toLocaleString()} succeeded · ${kpis.failed.toLocaleString()} failed`}
      />
      <KpiCard
        label="Success rate"
        value={`${kpis.successRatePct.toFixed(1)}%`}
        caption="settled attempts only"
      />
      <KpiCard
        label="Avg latency"
        value={kpis.avgDurationMs === 0 ? "—" : `${(kpis.avgDurationMs / 1000).toFixed(2)} s`}
        caption="per attempt"
      />
      <KpiCard
        label="Est. cost"
        value={formatUsd(kpis.totalCostUsd)}
        caption={`${totalTokens.toLocaleString()} tokens · prices are estimates`}
      />
    </section>
  );
}

function DailyTrendChart({ points }: { points: DailyTrendPoint[] }) {
  if (points.length === 0) {
    return <p className="text-muted-foreground text-sm">No attempts logged in this range.</p>;
  }
  const attempts = points.map((p) => p.attempts);
  const peak = Math.max(...attempts);
  const total = attempts.reduce((s, n) => s + n, 0);

  return (
    <div className="space-y-3">
      <Sparkline values={attempts} ariaLabel="Daily attempts" />
      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>
          {points[0].date} → {points[points.length - 1].date}
        </span>
        <span>
          peak <span className="text-foreground tabular-nums">{peak.toLocaleString()}</span> ·
          total <span className="text-foreground tabular-nums">{total.toLocaleString()}</span>
        </span>
      </div>
    </div>
  );
}

function CostTrendChart({ points }: { points: DailyTrendPoint[] }) {
  if (points.length === 0) {
    return <p className="text-muted-foreground text-sm">No data.</p>;
  }
  const costs = points.map((p) => p.costUsd);
  const total = costs.reduce((s, n) => s + n, 0);
  const peakDay = points.reduce((a, b) => (b.costUsd > a.costUsd ? b : a), points[0]);
  return (
    <div className="space-y-3">
      <Sparkline values={costs} height={60} ariaLabel="Daily cost" />
      <div className="text-muted-foreground text-xs">
        Total <span className="text-foreground tabular-nums">{formatUsd(total)}</span>
        {peakDay.costUsd > 0 ? (
          <>
            {" "}
            · peak day{" "}
            <span className="text-foreground tabular-nums">
              {formatUsd(peakDay.costUsd)} on {peakDay.date}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ProviderModelTable({ rows }: { rows: ProviderModelRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-6 text-sm">
          No translation attempts in this range.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="px-0">
        {/* Desktop table */}
        <div className="hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-xs uppercase">
                <th className="px-4 py-2 text-left font-medium">Provider</th>
                <th className="px-4 py-2 text-left font-medium">Model</th>
                <th className="px-4 py-2 text-right font-medium">Attempts</th>
                <th className="px-4 py-2 text-left font-medium">Success</th>
                <th className="px-4 py-2 text-right font-medium">Avg latency</th>
                <th className="px-4 py-2 text-right font-medium">Tokens in / out</th>
                <th className="px-4 py-2 text-right font-medium">Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.provider}:${r.model}`} className="border-b last:border-b-0">
                  <td className="px-4 py-3 align-middle">{r.provider}</td>
                  <td className="text-muted-foreground max-w-[24ch] truncate px-4 py-3 align-middle font-mono text-xs">
                    <Truncate text={r.model} />
                  </td>
                  <td className="px-4 py-3 text-right align-middle tabular-nums">
                    {r.attempts.toLocaleString()}
                  </td>
                  <td className="w-[160px] px-4 py-3 align-middle">
                    <ProgressBar
                      value={r.successRatePct}
                      label={`${r.successRatePct.toFixed(0)}%`}
                      tone={r.successRatePct >= 90 ? "success" : r.successRatePct >= 60 ? "warn" : "muted"}
                    />
                  </td>
                  <td className="px-4 py-3 text-right align-middle tabular-nums">
                    {r.avgDurationMs === 0 ? "—" : `${(r.avgDurationMs / 1000).toFixed(2)}s`}
                  </td>
                  <td className="text-muted-foreground px-4 py-3 text-right align-middle text-xs tabular-nums">
                    {r.inputTokens.toLocaleString()} / {r.outputTokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right align-middle tabular-nums">
                    {formatUsd(r.costUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <ul className="divide-y md:hidden">
          {rows.map((r) => (
            <li key={`m-${r.provider}:${r.model}`} className="space-y-2 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.provider}</p>
                  <p className="text-muted-foreground truncate font-mono text-xs">{r.model}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums">{formatUsd(r.costUsd)}</span>
              </div>
              <ProgressBar
                value={r.successRatePct}
                label={`${r.successRatePct.toFixed(0)}%`}
                tone={r.successRatePct >= 90 ? "success" : r.successRatePct >= 60 ? "warn" : "muted"}
              />
              <div className="text-muted-foreground flex flex-wrap justify-between gap-x-3 text-xs tabular-nums">
                <span>{r.attempts.toLocaleString()} attempts</span>
                <span>
                  {r.avgDurationMs === 0 ? "—" : `${(r.avgDurationMs / 1000).toFixed(2)}s avg`}
                </span>
                <span>
                  {r.inputTokens.toLocaleString()} in / {r.outputTokens.toLocaleString()} out
                </span>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function OverrideTable({ rows }: { rows: OverrideRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-6 text-sm">
          No saved versions in this range.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="px-0">
        <ul className="divide-y">
          {rows.map((r) => {
            const total = r.aiVersions + r.adminVersions;
            return (
              <li key={r.model} className="space-y-2 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-muted-foreground truncate font-mono text-xs">{r.model}</p>
                  <span className="text-xs tabular-nums">
                    {r.overrideRatePct.toFixed(0)}% overridden
                  </span>
                </div>
                <ProgressBar
                  value={r.overrideRatePct}
                  tone={r.overrideRatePct <= 10 ? "success" : r.overrideRatePct <= 30 ? "warn" : "muted"}
                />
                <p className="text-muted-foreground text-xs">
                  {r.aiVersions.toLocaleString()} AI · {r.adminVersions.toLocaleString()} admin ·{" "}
                  {total.toLocaleString()} total
                </p>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function TopErrorsList({ rows }: { rows: TopErrorRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-6 text-sm">
          No failed attempts in this range. 🎉
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="px-0">
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.message} className="space-y-1 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-foreground line-clamp-2 text-xs">{r.message}</p>
                <span className="bg-muted shrink-0 rounded px-1.5 py-0.5 text-xs tabular-nums">
                  ×{r.count}
                </span>
              </div>
              <p className="text-muted-foreground text-xs">
                last seen <time dateTime={r.lastSeen}>{formatDateTime(r.lastSeen)}</time>
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
