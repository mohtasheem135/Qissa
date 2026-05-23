/**
 * Helpers for applying a language's seeded font stacks (from the
 * `languages` table). We don't load these via next/font in Phase 8 —
 * they're system-installed or browser-fallback. Phase 9 (the reader)
 * adds proper next/font loading for the reading-serif stacks.
 */

export interface LanguageFontish {
  font_family: string | null;
  font_family_reading: string | null;
}

/**
 * Build a `style` prop that sets the appropriate font for displaying a
 * language's text. Use `variant="ui"` for chrome (titles in cards) and
 * `variant="reading"` for the reader body.
 */
export function languageFontStyle(
  lang: LanguageFontish | null | undefined,
  variant: "ui" | "reading" = "ui",
): React.CSSProperties | undefined {
  if (!lang) return undefined;
  const value = variant === "reading" ? lang.font_family_reading : lang.font_family;
  return value ? { fontFamily: value } : undefined;
}
