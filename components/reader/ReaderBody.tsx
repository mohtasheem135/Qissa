"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { pairParagraphs } from "@/lib/reader/paragraphs";
import { LINE_HEIGHT_VALUES, type ReaderSettings } from "@/lib/reader/reader-settings";
import type { ReaderTheme } from "@/lib/reader/themes";
import { DefinitionPopover, type DefinitionAnchor } from "./DefinitionPopover";
import { HighlightToolbar } from "./HighlightToolbar";
import {
  addHighlight,
  getHighlights,
  getServerHighlights,
  removeHighlight,
  subscribeHighlights,
  updateHighlight,
  type Highlight,
  type HighlightColour,
} from "@/lib/reader/highlights";
import {
  clearSelection,
  getSelectionSegments,
  type HighlightSegment,
} from "@/lib/reader/selection";

interface ReaderBodyProps {
  partLabel: string;
  partNumber: number;
  totalParts: number;
  textOriginal: string;
  textTranslated: string;
  /** dir attribute — "ltr" / "rtl" — applied to the article element. */
  direction: "ltr" | "rtl";
  fontFamily: string | null;
  originalFontFamily: string | null;
  fontSize: number;
  settings: ReaderSettings;
  /**
   * The current theme. We mirror it as a data attribute so CSS can
   * differentiate focus mode without prop-drilling another flag.
   */
  theme: ReaderTheme;
  /**
   * ISO language code of the translated text. When present (variant reader),
   * tapping a word opens the [DefinitionPopover]. `null` (source reader)
   * disables the tap-to-define interaction.
   */
  targetLanguage: string | null;
  /** Context plumbed through into saved-word entries so /my-words can link back. */
  storyId: string;
  variantSlug: string;
}

type ToolbarState =
  | { mode: "create"; rect: DOMRect; segments: HighlightSegment[] }
  | { mode: "edit"; rect: DOMRect; highlight: Highlight }
  | null;

/**
 * The reading article. Pure presentation — the ReaderShell owns the
 * theme + font + chrome state and just passes it down here.
 *
 * In "focus" mode an IntersectionObserver tags the paragraph closest to
 * the viewport centre with data-focus="active"; CSS dims the others to
 * --reader-focus-dim.
 *
 * Tap-to-define: when `targetLanguage` is set, a click on body text (not the
 * paragraph margins, not header text) resolves the tapped word using
 * `Intl.Segmenter` keyed by language and opens the [DefinitionPopover]
 * anchored to the word's bounding rect. We bail out if the user has an
 * active text selection so the native long-press / copy menu still works.
 */
export function ReaderBody({
  partLabel,
  partNumber,
  totalParts,
  textOriginal,
  textTranslated,
  direction,
  fontFamily,
  originalFontFamily,
  fontSize,
  settings,
  theme,
  targetLanguage,
  storyId,
  variantSlug,
}: ReaderBodyProps) {
  const articleRef = useRef<HTMLElement>(null);
  const paragraphs = useMemo(
    () => pairParagraphs(textOriginal, textTranslated),
    [textOriginal, textTranslated],
  );
  const showOriginal = settings.showOriginal && textOriginal.length > 0;

  const [anchor, setAnchor] = useState<DefinitionAnchor | null>(null);
  const handleCloseAnchor = useCallback(() => setAnchor(null), []);

  // Floating highlight control: "create" over a fresh selection, "edit" when an
  // existing highlight (mark) is tapped.
  const [toolbar, setToolbar] = useState<ToolbarState>(null);
  const closeToolbar = useCallback(() => setToolbar(null), []);

  // All highlights for this part, grouped by paragraph index (a paragraph can
  // hold several). Subscribing to the whole list then filtering is cheap.
  const allHighlights = useSyncExternalStore(
    subscribeHighlights,
    getHighlights,
    getServerHighlights,
  );
  const paragraphHighlights = useMemo(() => {
    const map = new Map<number, Highlight[]>();
    for (const h of allHighlights) {
      if (h.storyId === storyId && h.variantSlug === variantSlug && h.partNumber === partNumber) {
        const list = map.get(h.paragraphIndex);
        if (list) list.push(h);
        else map.set(h.paragraphIndex, [h]);
      }
    }
    return map;
  }, [allHighlights, storyId, variantSlug, partNumber]);

  // Tap an existing highlight → open the edit popover anchored to it.
  const handleMarkClick = useCallback((event: React.MouseEvent<HTMLElement>, highlight: Highlight) => {
    event.stopPropagation();
    setToolbar({ mode: "edit", rect: event.currentTarget.getBoundingClientRect(), highlight });
  }, []);

  // Watch the text selection. When it settles on a non-empty range inside the
  // article, show the create bar; when it collapses, dismiss the create bar
  // (leaving any open edit popover alone). pointerup covers mouse + touch;
  // keyup covers shift-arrow keyboard selection.
  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    function check() {
      if (!article) return;
      const segments = getSelectionSegments(article);
      if (!segments) {
        setToolbar((cur) => (cur && cur.mode === "create" ? null : cur));
        return;
      }
      const sel = window.getSelection();
      const rect = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).getBoundingClientRect() : null;
      if (!rect || (rect.width === 0 && rect.height === 0)) return;
      setToolbar({ mode: "create", rect, segments });
    }
    // Defer past the gesture so the selection has settled before we read it.
    const onPointerUp = () => setTimeout(check, 0);
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.shiftKey || e.key.startsWith("Arrow")) setTimeout(check, 0);
    };
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("keyup", onKeyUp);
    return () => {
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Create: colour every paragraph-segment of the current selection.
  const handleCreate = useCallback(
    (colour: HighlightColour, segments: HighlightSegment[]) => {
      for (const seg of segments) {
        addHighlight({
          storyId,
          variantSlug,
          partNumber,
          paragraphIndex: seg.paragraphIndex,
          startOffset: seg.startOffset,
          endOffset: seg.endOffset,
          colour,
          text: seg.snippet,
        });
      }
      clearSelection();
      setToolbar(null);
    },
    [storyId, variantSlug, partNumber],
  );

  // NB: storage mutations (add/update/remove) run in the event-handler body,
  // never inside a setToolbar(updater) — the updater executes during render,
  // and the resulting highlights-store change would be a setState-in-render.
  const handleToolbarPick = useCallback(
    (colour: HighlightColour) => {
      if (!toolbar) return;
      if (toolbar.mode === "create") {
        handleCreate(colour, toolbar.segments);
        return;
      }
      updateHighlight(toolbar.highlight.id, { colour });
      setToolbar({ ...toolbar, highlight: { ...toolbar.highlight, colour } });
    },
    [toolbar, handleCreate],
  );

  const handleEditNote = useCallback(
    (note: string) => {
      if (!toolbar || toolbar.mode !== "edit") return;
      updateHighlight(toolbar.highlight.id, { note });
      setToolbar({
        ...toolbar,
        highlight: { ...toolbar.highlight, note: note.trim() || undefined },
      });
    },
    [toolbar],
  );

  const handleEditRemove = useCallback(() => {
    if (toolbar && toolbar.mode === "edit") removeHighlight(toolbar.highlight.id);
    setToolbar(null);
  }, [toolbar]);

  // Scroll-into-view for deep links from /highlights — `#h-<paragraphIndex>`.
  // Runs after paint so the article has laid out at its final font size.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.location.hash;
    if (!raw.startsWith("#h-")) return;
    const idx = Number.parseInt(raw.slice(3), 10);
    if (!Number.isFinite(idx)) return;
    const article = articleRef.current;
    if (!article) return;
    const target = article.querySelectorAll<HTMLElement>("[data-paragraph]")[idx];
    if (!target) return;
    requestAnimationFrame(() => {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, [partNumber]);

  // Focus mode: highlight the paragraph closest to the viewport centre.
  useEffect(() => {
    const article = articleRef.current;
    if (!article || theme !== "focus") return;

    const targets = Array.from(article.querySelectorAll<HTMLElement>("[data-paragraph]"));
    if (targets.length === 0) return;

    let activeIndex = -1;
    function setActive(index: number) {
      if (index === activeIndex) return;
      if (activeIndex >= 0) targets[activeIndex]?.removeAttribute("data-focus");
      activeIndex = index;
      if (index >= 0) targets[index]?.setAttribute("data-focus", "active");
    }

    // Pick the paragraph closest to the viewport centre on each scroll.
    let raf = 0;
    function onScroll() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const centre = window.innerHeight / 2;
        let bestIndex = 0;
        let bestDistance = Infinity;
        for (let i = 0; i < targets.length; i++) {
          const rect = targets[i].getBoundingClientRect();
          const middle = rect.top + rect.height / 2;
          const d = Math.abs(middle - centre);
          if (d < bestDistance) {
            bestDistance = d;
            bestIndex = i;
          }
        }
        setActive(bestIndex);
      });
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
      // Restore all paragraphs to fully visible when leaving focus mode.
      for (const target of targets) target.removeAttribute("data-focus");
    };
  }, [theme, paragraphs.length]);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!targetLanguage) return;

      // Respect native text selection — long-press / drag-select should
      // surface the system copy menu, not our popover.
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return;

      // Only fire for body paragraphs — header taps shouldn't open the popover.
      const target = event.target as Element | null;
      if (!target?.closest?.(".reader-translated, .reader-original")) return;

      const resolved = resolveWordAtPoint(event.clientX, event.clientY, targetLanguage);
      if (!resolved) return;

      // Don't reopen on the same word repeatedly — but a different word should
      // replace the current popover.
      setAnchor((prev) => {
        if (prev && prev.word === resolved.word && rectsEqual(prev.rect, resolved.rect)) {
          return prev;
        }
        return {
          word: resolved.word,
          rect: resolved.rect,
          languageCode: targetLanguage,
          context: { storyId, variantSlug, partNumber },
        };
      });
    },
    [targetLanguage, storyId, variantSlug, partNumber],
  );

  return (
    <>
      <article
        ref={articleRef}
        dir={direction}
        data-theme={theme}
        className="reader-article mx-auto max-w-[680px] px-5 pt-20 pb-24 sm:px-8"
        onClick={handleClick}
        style={{
          color: "var(--reader-text)",
          fontFamily:
            settings.fontVariant === "serif"
              ? fontFamily ?? "var(--font-serif)"
              : "var(--font-sans)",
          fontSize: `${fontSize}px`,
          lineHeight: LINE_HEIGHT_VALUES[settings.lineHeight],
          textAlign: settings.alignment,
        }}
      >
        <header className="mb-8 space-y-1 not-prose">
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--reader-text-muted)" }}>
            Part {partNumber} of {totalParts}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight" dir={direction}>
            {partLabel}
          </h1>
        </header>

        <div className="space-y-5">
          {paragraphs.map((p, idx) => {
            const marks = paragraphHighlights.get(idx);
            return (
              <div
                key={idx}
                id={`h-${idx}`}
                data-paragraph
                data-pidx={idx}
                className="reader-paragraph relative space-y-2 transition-opacity duration-200"
              >
                <p
                  className="reader-translated"
                  style={{ wordBreak: direction === "rtl" ? "normal" : "break-word" }}
                >
                  {marks && marks.length > 0
                    ? renderHighlighted(p.translated, marks, handleMarkClick)
                    : p.translated}
                </p>
                {showOriginal && p.original ? (
                  <p
                    className="reader-original border-s-2 ps-3 text-[0.85em] italic"
                    lang={p.original ? undefined : undefined}
                    style={{
                      color: "var(--reader-text-muted)",
                      borderColor: "var(--reader-chrome-border)",
                      fontFamily: originalFontFamily ?? "var(--font-serif)",
                    }}
                    dir="auto"
                  >
                    {p.original}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </article>

      <DefinitionPopover anchor={anchor} onClose={handleCloseAnchor} />
      {toolbar ? (
        <HighlightToolbar
          mode={toolbar.mode}
          rect={toolbar.rect}
          activeColour={toolbar.mode === "edit" ? toolbar.highlight.colour : null}
          note={toolbar.mode === "edit" ? toolbar.highlight.note : undefined}
          onPickColour={handleToolbarPick}
          onChangeNote={handleEditNote}
          onRemove={handleEditRemove}
          onClose={closeToolbar}
        />
      ) : null}
    </>
  );
}

/**
 * Render a paragraph's text with its highlight ranges wrapped in `<mark>`.
 * Marks are applied left-to-right; an overlapping range is clipped to start
 * after the previous one so the output never double-wraps a character.
 */
function renderHighlighted(
  text: string,
  marks: Highlight[],
  onMarkClick: (event: React.MouseEvent<HTMLElement>, highlight: Highlight) => void,
): React.ReactNode {
  const sorted = [...marks].sort((a, b) => a.startOffset - b.startOffset);
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (const m of sorted) {
    const start = Math.max(cursor, m.startOffset);
    const end = Math.min(text.length, m.endOffset);
    if (end <= start) continue; // out of range, or clipped by an earlier overlap
    if (start > cursor) nodes.push(text.slice(cursor, start));
    nodes.push(
      <mark
        key={m.id}
        data-hl={m.id}
        data-colour={m.colour}
        className="reader-highlight"
        onClick={(e) => onMarkClick(e, m)}
      >
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

/**
 * Resolve the word under (clientX, clientY) and return its trimmed text plus
 * a `DOMRect` enclosing it (across line breaks if needed). Uses
 * `Intl.Segmenter` keyed by `languageCode` so Devanagari, Arabic, Tamil etc.
 * tokenise correctly. Falls back to a Latin word regex when Segmenter or the
 * caret APIs aren't available.
 */
function resolveWordAtPoint(
  x: number,
  y: number,
  languageCode: string,
): { word: string; rect: DOMRect } | null {
  const caret = caretFromPoint(x, y);
  if (!caret) return null;
  const { node, offset } = caret;
  if (node.nodeType !== Node.TEXT_NODE) return null;
  const text = node.nodeValue ?? "";
  if (text.length === 0) return null;

  const found = wordBoundsAt(text, offset, languageCode);
  if (!found) return null;
  const { start, end, word } = found;
  if (!word || word.length === 0) return null;

  const range = document.createRange();
  try {
    range.setStart(node, start);
    range.setEnd(node, end);
  } catch {
    return null;
  }
  const rect = range.getBoundingClientRect();
  range.detach?.();
  if (rect.width === 0 && rect.height === 0) return null;
  return { word, rect };
}

interface CaretHit {
  node: Node;
  offset: number;
}

type CaretPositionFromPointFn = (
  x: number,
  y: number,
) => { offsetNode: Node; offset: number } | null;

function caretFromPoint(x: number, y: number): CaretHit | null {
  // Modern API (Firefox, recent Chromium, Safari 17+).
  const docWithCaretPos = document as Document & {
    caretPositionFromPoint?: CaretPositionFromPointFn;
  };
  const fn = docWithCaretPos.caretPositionFromPoint;
  if (typeof fn === "function") {
    const pos = fn.call(document, x, y);
    if (pos && pos.offsetNode) return { node: pos.offsetNode, offset: pos.offset };
  }
  // WebKit fallback (older Safari).
  const docWithCaretRange = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const rfn = docWithCaretRange.caretRangeFromPoint;
  if (typeof rfn === "function") {
    const range = rfn.call(document, x, y);
    if (range && range.startContainer) {
      return { node: range.startContainer, offset: range.startOffset };
    }
  }
  return null;
}

function wordBoundsAt(
  text: string,
  offset: number,
  languageCode: string,
): { start: number; end: number; word: string } | null {
  if (offset < 0 || offset > text.length) return null;

  // Modern segmenter handles every script we care about.
  const SegmenterCtor = (
    Intl as typeof Intl & {
      Segmenter?: new (
        locale?: string,
        opts?: { granularity?: "word" | "grapheme" | "sentence" },
      ) => { segment(input: string): Iterable<{ segment: string; index: number; isWordLike?: boolean }> };
    }
  ).Segmenter;
  if (typeof SegmenterCtor === "function") {
    try {
      const seg = new SegmenterCtor(languageCode, { granularity: "word" });
      for (const piece of seg.segment(text)) {
        if (piece.isWordLike !== true) continue;
        const start = piece.index;
        const end = piece.index + piece.segment.length;
        if (offset >= start && offset <= end) {
          return { start, end, word: piece.segment };
        }
      }
      return null;
    } catch {
      // Bad locale tag — drop through to regex fallback.
    }
  }

  // Fallback: Latin-ish word characters around the offset.
  const isWordChar = (ch: string) => /[\p{Letter}\p{Mark}\p{Number}'’-]/u.test(ch);
  let start = offset;
  while (start > 0 && isWordChar(text[start - 1])) start--;
  let end = offset;
  while (end < text.length && isWordChar(text[end])) end++;
  if (end === start) return null;
  return { start, end, word: text.slice(start, end) };
}

function rectsEqual(a: DOMRect, b: DOMRect): boolean {
  return (
    Math.round(a.top) === Math.round(b.top) &&
    Math.round(a.left) === Math.round(b.left) &&
    Math.round(a.width) === Math.round(b.width) &&
    Math.round(a.height) === Math.round(b.height)
  );
}
