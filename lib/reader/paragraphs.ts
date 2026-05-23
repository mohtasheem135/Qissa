/**
 * Split a part's text into paragraphs and pair the original ↔ translated
 * arrays so the "Show original" toggle can render them inline.
 *
 * Paragraphs are separated by blank lines (\n\n+). If counts don't match
 * (the AI sometimes merges/splits), we pair index-by-index and surface
 * the orphans alone — better than dropping content silently.
 */

export interface PairedParagraph {
  translated: string;
  original: string | null;
}

export function splitParagraphs(text: string): string[] {
  if (!text) return [];
  return text
    .split(/\n{2,}/u)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function pairParagraphs(originalText: string, translatedText: string): PairedParagraph[] {
  const original = splitParagraphs(originalText);
  const translated = splitParagraphs(translatedText);
  const length = Math.max(original.length, translated.length);
  const pairs: PairedParagraph[] = [];
  for (let i = 0; i < length; i++) {
    pairs.push({
      translated: translated[i] ?? "",
      original: original[i] ?? null,
    });
  }
  return pairs;
}
