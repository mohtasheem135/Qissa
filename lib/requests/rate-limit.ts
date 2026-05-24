/**
 * Tiny in-memory IP rate limiter — sliding-window, per-key.
 *
 * Good enough for a single Vercel instance; resets on cold start. Phase 1.5
 * can swap to Upstash @upstash/ratelimit for cross-instance accuracy.
 */

interface Bucket {
  hits: number[];
}

const STORE = new Map<string, Bucket>();

export interface RateLimitOptions {
  /** Number of hits allowed in the window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export function rateLimit(key: string, opts: RateLimitOptions): { ok: boolean; remaining: number } {
  const now = Date.now();
  const cutoff = now - opts.windowMs;
  const bucket = STORE.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => t > cutoff);
  if (bucket.hits.length >= opts.max) {
    STORE.set(key, bucket);
    return { ok: false, remaining: 0 };
  }
  bucket.hits.push(now);
  STORE.set(key, bucket);
  return { ok: true, remaining: opts.max - bucket.hits.length };
}

/**
 * Best-effort client IP extraction. Prefers the leftmost x-forwarded-for
 * entry (closest to the client), falls back to x-real-ip, then "unknown".
 */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
