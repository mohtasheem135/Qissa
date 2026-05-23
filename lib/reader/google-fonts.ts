/**
 * Per-language Google Fonts stylesheet URL.
 *
 * The seeded `languages.font_family` / `font_family_reading` columns name
 * Google Fonts that must actually be loaded for the script to render
 * correctly. This map mirrors docs/01-requirements.md §3.11 — keep it in
 * sync if the seed changes.
 *
 * Returns null for languages we already get via next/font (English uses
 * Inter + Lora via app/layout.tsx).
 */

const FAMILIES_BY_LANGUAGE: Record<string, ReadonlyArray<string>> = {
  hi: ["Tiro Devanagari Hindi", "Noto Sans Devanagari", "Noto Serif Devanagari"],
  mr: ["Noto Sans Devanagari", "Noto Serif Devanagari", "Tiro Devanagari Marathi"],
  ur: ["Noto Nastaliq Urdu"],
  ar: ["Noto Naskh Arabic", "Amiri"],
  bn: ["Tiro Bangla", "Noto Sans Bengali", "Noto Serif Bengali"],
  ta: ["Noto Sans Tamil", "Noto Serif Tamil", "Tiro Tamil"],
  or: ["Noto Sans Oriya"],
  pa: ["Noto Sans Gurmukhi", "Noto Serif Gurmukhi"],
  gu: ["Noto Sans Gujarati", "Noto Serif Gujarati"],
  te: ["Noto Sans Telugu", "Noto Serif Telugu"],
  kn: ["Noto Sans Kannada", "Noto Serif Kannada"],
  ml: ["Noto Sans Malayalam", "Noto Serif Malayalam"],
};

export function googleFontsUrlForLanguage(languageCode: string): string | null {
  const families = FAMILIES_BY_LANGUAGE[languageCode];
  if (!families || families.length === 0) return null;
  const params = families
    .map((name) => `family=${name.replace(/ /g, "+")}:wght@400;600`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}
