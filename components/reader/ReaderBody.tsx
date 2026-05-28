"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pairParagraphs } from "@/lib/reader/paragraphs";
import { LINE_HEIGHT_VALUES, type ReaderSettings } from "@/lib/reader/reader-settings";
import type { ReaderTheme } from "@/lib/reader/themes";
import { DefinitionPopover, type DefinitionAnchor } from "./DefinitionPopover";

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
          {paragraphs.map((p, idx) => (
            <div
              key={idx}
              data-paragraph
              className="reader-paragraph space-y-2 transition-opacity duration-200"
            >
              <p
                className="reader-translated"
                style={{ wordBreak: direction === "rtl" ? "normal" : "break-word" }}
              >
                {p.translated}
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
          ))}
        </div>
      </article>

      <DefinitionPopover anchor={anchor} onClose={handleCloseAnchor} />
    </>
  );
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
