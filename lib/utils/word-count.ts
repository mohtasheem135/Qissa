/**
 * Crude but language-agnostic word count.
 *
 * Splits on Unicode whitespace, drops empty tokens, and strips leading /
 * trailing punctuation from each token so "Hello." and "Hello" both
 * count as one word. Works for all scripts we ship (Latin, Devanagari,
 * Bengali, Tamil, etc.) because none of them rely on inter-character
 * separators we'd need to know about.
 */
export function wordCount(text: string): number {
  if (!text) return 0;
  return text
    .trim()
    .split(/\s+/u)
    .filter((token) => token.replace(/^\p{P}+|\p{P}+$/gu, "").length > 0).length;
}

/** Reading time in minutes, rounded up. 200 wpm is a typical literary pace. */
export function readingMinutes(words: number, wpm = 200): number {
  if (words <= 0) return 0;
  return Math.max(1, Math.ceil(words / wpm));
}
