/**
 * Audio URL composition.
 *
 * The DB stores a provider-agnostic **path** (the R2 object key), e.g.
 *   "audio/<variantId>/1-anushka.mp3"
 *
 * `audioUrl()` composes a render-ready public URL from that path using
 * NEXT_PUBLIC_R2_PUBLIC_URL — which is public env, so this helper works on
 * both server and client (the reader builds playback URLs in the browser).
 *
 * Mirrors lib/imagekit/url.ts's path-only decoupling: the backing store can
 * swap R2→S3 by changing the env var alone, with no data migration.
 */

function getBase(): string {
  // Strip trailing slashes so we never produce `…//audio/x.mp3`.
  return (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
}

/**
 * Compose a public playback URL from a stored audio path.
 *
 *   audioUrl("audio/abc/1-anushka.mp3")
 *     -> "https://pub-xxxx.r2.dev/audio/abc/1-anushka.mp3"
 *
 * Returns null for empty input or when the public base is misconfigured
 * (fail closed — the reader falls back to Web Speech).
 */
export function audioUrl(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const trimmed = stored.trim();
  if (!trimmed) return null;

  // Already an absolute URL (defensive — we only store paths).
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const base = getBase();
  if (!base) return null;

  const path = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
  return `${base}/${path}`;
}
