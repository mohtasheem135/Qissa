/**
 * Cover image URL composition.
 *
 * The DB stores either:
 *   - a path:        "/covers/the_bet_xxx.png"                    (new shape)
 *   - a full URL:    "https://ik.imagekit.io/azadstudio/covers/x.png" (legacy)
 *   - an external URL: "https://example.com/foo.jpg"               (admin pasted)
 *
 * `coverUrl()` returns a render-ready URL for all three, appending the
 * requested ImageKit `?tr=…` transform when applicable. Composition for
 * paths uses NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT — which is public env, so
 * this helper works on both server and client.
 */

const IMAGEKIT_HOST = "ik.imagekit.io";

function getEndpoint(): string {
  // Strip trailing slashes so we never get `…//covers/x.png`.
  return (process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT ?? "").replace(/\/+$/, "");
}

/**
 * Compose a render-ready URL from whatever is in the DB.
 *
 *   coverUrl("/covers/foo.png", "w-400,h-225,c-maintain_ratio")
 *     -> "https://ik.imagekit.io/azadstudio/covers/foo.png?tr=w-400,h-225,c-maintain_ratio"
 *
 *   coverUrl("https://ik.imagekit.io/.../foo.png", "w-400,h-225")    (legacy)
 *     -> "<the URL>?tr=w-400,h-225"
 *
 *   coverUrl("https://example.com/foo.png", "w-400,h-225")           (external)
 *     -> "https://example.com/foo.png"   (no transform; not ImageKit)
 */
export function coverUrl(
  stored: string | null | undefined,
  transform: string,
): string | null {
  if (!stored) return null;
  const trimmed = stored.trim();
  if (!trimmed) return null;

  let baseUrl: string;
  if (trimmed.startsWith("/")) {
    const endpoint = getEndpoint();
    if (!endpoint) return null; // misconfigured env — fail closed
    baseUrl = `${endpoint}${trimmed}`;
  } else {
    baseUrl = trimmed;
  }

  if (!baseUrl.includes(IMAGEKIT_HOST)) return baseUrl;

  // If the stored value already has a tr= query, replace it rather than
  // stack a second transform. Defensive — we don't write these — but
  // harmless for callers that pass a pre-transformed value.
  const url = new URL(baseUrl);
  url.searchParams.set("tr", transform);
  return url.toString();
}

/** Common card thumbnail (3:2 cover, 600px wide for retina). */
export function thumbnailUrl(stored: string | null | undefined): string | null {
  return coverUrl(stored, "w-600,h-400,c-maintain_ratio");
}

/** Hero / story-page cover. */
export function heroUrl(stored: string | null | undefined): string | null {
  return coverUrl(stored, "w-1200,h-700,c-maintain_ratio");
}

/**
 * Inverse of compose: when the admin pastes a URL into the cover field,
 * we want to STORE the path-only form if the URL belongs to our
 * configured ImageKit endpoint. External URLs pass through unchanged.
 *
 *   normalizeStoredValue("https://ik.imagekit.io/azadstudio/covers/x.png")
 *     -> "/covers/x.png"
 *
 *   normalizeStoredValue("/covers/x.png")
 *     -> "/covers/x.png"
 *
 *   normalizeStoredValue("https://example.com/foo.png")
 *     -> "https://example.com/foo.png"
 */
export function normalizeStoredValue(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/")) return trimmed;

  const endpoint = getEndpoint();
  if (!endpoint) return trimmed;

  if (trimmed.startsWith(endpoint)) {
    const rest = trimmed.slice(endpoint.length);
    // Drop any query (?tr=…) the user may have pasted — transforms are
    // applied at render time, not stored.
    const queryStart = rest.indexOf("?");
    const path = queryStart === -1 ? rest : rest.slice(0, queryStart);
    return path.startsWith("/") ? path : `/${path}`;
  }

  return trimmed;
}
