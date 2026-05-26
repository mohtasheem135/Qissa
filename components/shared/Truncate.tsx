import { cn } from "@/lib/utils/cn";

interface TruncateProps {
  text: string;
  className?: string;
  /** Render N lines before clamping. Defaults to single-line truncation. */
  lines?: number;
  /**
   * When false, suppresses the native `title` tooltip. Set this if a parent
   * already wires a richer tooltip and the browser one would just duplicate.
   */
  withTooltip?: boolean;
  as?: "span" | "div";
}

/**
 * Single-line (or N-line) truncation with the full text exposed on hover via
 * the native `title` attribute. Caller controls width via `className`
 * (e.g. `max-w-[28ch]`) — this component is layout-agnostic on purpose so it
 * can be dropped into table cells, card titles, list items, etc.
 */
export function Truncate({
  text,
  className,
  lines,
  withTooltip = true,
  as = "span",
}: TruncateProps) {
  const Tag = as;
  const isMultiline = typeof lines === "number" && lines > 1;
  return (
    <Tag
      title={withTooltip ? text : undefined}
      className={cn(
        isMultiline ? "" : "block truncate",
        className,
      )}
      style={
        isMultiline
          ? {
              display: "-webkit-box",
              WebkitLineClamp: lines,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }
          : undefined
      }
    >
      {text}
    </Tag>
  );
}
