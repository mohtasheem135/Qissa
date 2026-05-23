/**
 * Append an ImageKit `tr=...` transform query param to a stored cover URL.
 *
 *   coverUrl(url, "w-400,h-225,c-maintain_ratio")
 *
 * For URLs that aren't ImageKit (admin pasted an arbitrary URL into the
 * form), returns the URL unchanged.
 */
export function coverUrl(url: string | null | undefined, transform: string): string | null {
  if (!url) return null;
  if (!url.includes("ik.imagekit.io")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}tr=${transform}`;
}

/** Common card thumbnail (3:2 cover, 600px wide for retina). */
export function thumbnailUrl(url: string | null | undefined): string | null {
  return coverUrl(url, "w-600,h-400,c-maintain_ratio");
}

/** Hero / story-page cover (16:9 ish, larger). */
export function heroUrl(url: string | null | undefined): string | null {
  return coverUrl(url, "w-1200,h-700,c-maintain_ratio");
}
