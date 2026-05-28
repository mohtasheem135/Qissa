"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RANGE_LABELS, type RangeKey } from "@/lib/analytics/translation-stats.types";

/**
 * Reads/writes `?range=` on the analytics page URL. Server component reads
 * the param via `searchParams` to drive the aggregation, so this is the
 * single source of truth — no client state to keep in sync.
 *
 * Uses `useTransition` so the select stays interactive while the server
 * re-renders the heavier breakdown sections.
 */
export function AnalyticsRangeFilter({ current }: { current: RangeKey }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const onChange = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "30d") params.delete("range");
    else params.set("range", next);
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `/admin/analytics?${qs}` : "/admin/analytics");
    });
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="analytics-range" className="text-muted-foreground text-xs uppercase">
        Range
      </label>
      <Select value={current} onValueChange={onChange} disabled={pending}>
        <SelectTrigger
          id="analytics-range"
          size="sm"
          className="w-[160px]"
          aria-label="Time range"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(RANGE_LABELS) as RangeKey[]).map((key) => (
            <SelectItem key={key} value={key}>
              {RANGE_LABELS[key]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
