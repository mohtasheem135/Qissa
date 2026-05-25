/**
 * Normalize a title to per-word Title Case ("first letter capital, rest small").
 *
 * Why: ingested DB titles are inconsistent — some are ALL-CAPS — and reader
 * surfaces should render them uniformly. Non-Latin scripts (Devanagari,
 * Arabic, Bengali…) are case-less so this is a no-op for them.
 */
export function toTitleCase(input: string): string {
  if (!input) return input;
  return input
    .toLowerCase()
    .replace(/(\p{L})(\p{L}*)/gu, (_, first: string, rest: string) => first.toUpperCase() + rest);
}
