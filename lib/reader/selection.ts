/**
 * Map the current text selection onto per-paragraph character ranges for the
 * reader's highlight feature. Browser-only (DOM APIs).
 *
 * Each reading paragraph renders as
 *   <div data-paragraph data-pidx={idx}> … <p class="reader-translated">…</p> …
 * The translated `<p>` may already contain `<mark>` children (existing
 * highlights), so offsets are computed against the element's *text content*
 * (marks contribute their text, tags don't) using a Range from the paragraph
 * start to each boundary — `Range.toString().length` gives the char index.
 */

export interface HighlightSegment {
  paragraphIndex: number;
  startOffset: number;
  endOffset: number;
  /** The selected substring of that paragraph. */
  snippet: string;
}

/** Char index of (container, offset) measured from the start of `root`'s text. */
function charOffset(root: Node, container: Node, offset: number): number {
  const range = document.createRange();
  range.setStart(root, 0);
  range.setEnd(container, offset);
  const len = range.toString().length;
  range.detach?.();
  return len;
}

function paragraphIndexOf(wrapper: HTMLElement): number {
  const raw = wrapper.dataset.pidx;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : -1;
}

/**
 * Returns the highlightable segments under the live selection, or null when
 * there's no usable selection inside `article`. A multi-paragraph selection
 * yields one segment per `.reader-translated` paragraph it covers.
 */
export function getSelectionSegments(article: HTMLElement): HighlightSegment[] | null {
  const selection = typeof window !== "undefined" ? window.getSelection() : null;
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (range.collapsed) return null;
  if (!range.intersectsNode(article)) return null;

  const segments: HighlightSegment[] = [];
  const paragraphs = article.querySelectorAll<HTMLElement>(".reader-translated");
  for (const pEl of paragraphs) {
    if (!range.intersectsNode(pEl)) continue;
    const full = pEl.textContent ?? "";
    const len = full.length;
    if (len === 0) continue;

    // If the boundary is outside this paragraph, the selection runs through it
    // entirely on that side (0 / len).
    const rawStart = pEl.contains(range.startContainer)
      ? charOffset(pEl, range.startContainer, range.startOffset)
      : 0;
    const rawEnd = pEl.contains(range.endContainer)
      ? charOffset(pEl, range.endContainer, range.endOffset)
      : len;

    const start = Math.max(0, Math.min(rawStart, rawEnd));
    const end = Math.min(len, Math.max(rawStart, rawEnd));
    if (end <= start) continue;

    const wrapper = pEl.closest<HTMLElement>("[data-paragraph]");
    const paragraphIndex = wrapper ? paragraphIndexOf(wrapper) : -1;
    if (paragraphIndex < 0) continue;

    segments.push({ paragraphIndex, startOffset: start, endOffset: end, snippet: full.slice(start, end) });
  }

  return segments.length > 0 ? segments : null;
}

/** Clear the current selection (after a highlight is created from it). */
export function clearSelection(): void {
  if (typeof window === "undefined") return;
  window.getSelection()?.removeAllRanges();
}
