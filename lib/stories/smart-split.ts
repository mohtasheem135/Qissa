import { splitParagraphs } from "@/lib/reader/paragraphs";
import { wordCount } from "@/lib/utils/word-count";

/** One computed part — matches the `ParsedPart` shape BulkImportDialog emits. */
export interface SplitPart {
  label: string;
  text: string;
}

export interface SmartSplitOptions {
  /** Approximate words per part. The balancer aims near this, never exact. */
  targetWords: number;
}

/** Sensible default pre-filled in the UI — ~5 min of narration per part. */
export const DEFAULT_TARGET_WORDS = 800;

/**
 * Split a whole pasted story into near-equal parts at NATURAL boundaries
 * (whole paragraphs, never mid-sentence) so each part narrates smoothly.
 *
 * Algorithm:
 *   1. Split into paragraphs (blank-line separated) via splitParagraphs().
 *   2. Any paragraph far larger than the target is pre-split on sentence
 *      boundaries (Latin + Devanagari danda) so one giant block can't force a
 *      lopsided part — but we never break inside a sentence.
 *   3. Greedily pack blocks into a part, closing it when adding the next block
 *      would overshoot the target by MORE than stopping now undershoots it
 *      (minimises each part's deviation from target → near-equal parts).
 *   4. Merge a too-small trailing part back into the previous one.
 *
 * Returns one part when the text is short or empty (after trimming).
 */
export function smartSplit(text: string, options: SmartSplitOptions): SplitPart[] {
  const targetWords = Math.max(1, Math.round(options.targetWords));
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) return [];

  // 2) Pre-split oversized paragraphs into sentence-grouped sub-blocks. A
  // paragraph is "oversized" once it exceeds 1.5× the target on its own.
  const blocks: string[] = [];
  for (const paragraph of paragraphs) {
    if (wordCount(paragraph) > targetWords * 1.5) {
      blocks.push(...splitParagraphIntoSentenceGroups(paragraph, targetWords));
    } else {
      blocks.push(paragraph);
    }
  }

  // 3) Greedy balance: close a part when stopping is closer to target than going.
  const parts: string[][] = [];
  let current: string[] = [];
  let currentWords = 0;

  for (const block of blocks) {
    const blockWords = wordCount(block);
    if (current.length === 0) {
      current.push(block);
      currentWords = blockWords;
      continue;
    }
    const withBlock = currentWords + blockWords;
    // Deviation if we STOP here vs if we ADD the block.
    const stopDeviation = Math.abs(targetWords - currentWords);
    const addDeviation = Math.abs(withBlock - targetWords);
    if (currentWords >= targetWords || stopDeviation < addDeviation) {
      parts.push(current);
      current = [block];
      currentWords = blockWords;
    } else {
      current.push(block);
      currentWords = withBlock;
    }
  }
  if (current.length > 0) parts.push(current);

  // 4) Merge a runt trailing part (< 40% of target) into the previous one.
  if (parts.length > 1) {
    const lastWords = parts[parts.length - 1].reduce((sum, b) => sum + wordCount(b), 0);
    if (lastWords < targetWords * 0.4) {
      const last = parts.pop()!;
      parts[parts.length - 1].push(...last);
    }
  }

  return parts.map((blockList, idx) => ({
    label: `Part ${idx + 1}`,
    text: blockList.join("\n\n"),
  }));
}

/**
 * Break one oversized paragraph into sentence-grouped sub-blocks, each near the
 * target word count. Sentence boundaries: Latin `.!?…` + Devanagari danda
 * `।`/`॥` (same set as lib/tts/chunk.ts). A single sentence longer than the
 * target stays whole — we never split inside a sentence.
 */
function splitParagraphIntoSentenceGroups(paragraph: string, targetWords: number): string[] {
  const sentences = paragraph.split(/(?<=[।.!?…॥])\s+/).filter((s) => s.trim().length > 0);
  if (sentences.length <= 1) return [paragraph];

  const groups: string[] = [];
  let current = "";
  let currentWords = 0;
  for (const sentence of sentences) {
    const sentenceWords = wordCount(sentence);
    if (current && currentWords + sentenceWords > targetWords) {
      groups.push(current);
      current = sentence;
      currentWords = sentenceWords;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
      currentWords += sentenceWords;
    }
  }
  if (current) groups.push(current);
  return groups;
}
