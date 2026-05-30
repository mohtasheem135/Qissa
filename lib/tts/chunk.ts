/**
 * Split text into chunks no longer than `max` characters, preferring sentence
 * boundaries (Latin + Devanagari danda `।` / double-danda `॥`). A single
 * sentence longer than `max` is hard-split so no chunk ever exceeds the limit.
 *
 * Both TTS providers cap text per request (Sarvam 2500, ElevenLabs ~10k); they
 * chunk below their limit and stitch the per-chunk audio back together.
 */
export function chunkText(text: string, max: number): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return [normalized];

  const sentences = normalized.split(/(?<=[।.!?…॥])\s+/);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (sentence.length > max) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let i = 0; i < sentence.length; i += max) chunks.push(sentence.slice(i, i + max));
      continue;
    }
    if (current.length + sentence.length + 1 > max && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
