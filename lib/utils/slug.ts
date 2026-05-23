/**
 * Convert a free-form name to a URL-safe slug.
 *
 *   "Real Life"      -> "real-life"
 *   "Sufi & Stories" -> "sufi-stories"
 *   "  multiple   "  -> "multiple"
 *
 * Non-Latin characters are normalized when they have a Unicode decomposition
 * (e.g., "résumé" -> "resume"); when they don't (Devanagari, etc.), they are
 * stripped. For non-Latin category names admins should set the slug
 * explicitly in the form rather than relying on auto-generation.
 */
export function toSlug(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // anything non-alphanumeric -> hyphen
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
}

/**
 * True when the string is a valid URL-safe slug (lowercase letters, digits,
 * single hyphens, no leading/trailing/double hyphens).
 */
export function isValidSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}
