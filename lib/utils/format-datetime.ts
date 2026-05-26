/**
 * Compact, locale-aware date + time formatter for admin tables. Returns
 * something like "26 May 2026, 14:32" so an admin can scan recency without a
 * tooltip. Caller is responsible for wrapping in a `title` attribute if the
 * raw ISO string should remain available on hover.
 */
export function formatDateTime(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
