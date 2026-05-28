import { cn } from "@/lib/utils/cn";

/**
 * Inline SVG sparkline. No client JS, no chart library — just a path through
 * (x, y) where x is the index in `values` and y is the value, normalised to
 * the height. Filled area under the line uses the same colour at 12% alpha
 * via Tailwind's `text-{colour}` + `fill-current`.
 *
 * Pass `points` of length ≥2 to render anything meaningful; on 0/1 points we
 * render an em-dash placeholder.
 */
export function Sparkline({
  values,
  width = 320,
  height = 60,
  className,
  ariaLabel,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  ariaLabel?: string;
}) {
  if (values.length < 2) {
    return (
      <div
        className={cn("text-muted-foreground flex items-center text-xs", className)}
        style={{ height }}
        aria-label={ariaLabel}
      >
        not enough data
      </div>
    );
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  const padTop = 4;
  const padBottom = 4;
  const usableH = height - padTop - padBottom;

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = padTop + (1 - (v - min) / span) * usableH;
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L${width.toFixed(2)},${height.toFixed(
    2,
  )} L0,${height.toFixed(2)} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="none"
      className={cn("text-primary block", className)}
    >
      <path d={areaPath} fill="currentColor" opacity="0.12" />
      <path d={linePath} fill="none" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

/**
 * Horizontal progress-bar pill. `value` is clamped to [0, 100]. Renders a
 * filled bar over a muted track. Used for success-rate and override-rate
 * cells in the breakdown tables.
 */
export function ProgressBar({
  value,
  label,
  tone = "primary",
  className,
}: {
  value: number;
  label?: string;
  tone?: "primary" | "success" | "warn" | "muted";
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const fillClass =
    tone === "success"
      ? "bg-emerald-500"
      : tone === "warn"
        ? "bg-amber-500"
        : tone === "muted"
          ? "bg-muted-foreground/60"
          : "bg-primary";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="bg-muted relative h-1.5 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn("h-full rounded-full transition-all", fillClass)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {label ? (
        <span className="text-muted-foreground w-14 shrink-0 text-right text-xs tabular-nums">
          {label}
        </span>
      ) : null}
    </div>
  );
}
