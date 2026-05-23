"use client";

import { useEffect, useMemo, useRef } from "react";
import { pairParagraphs } from "@/lib/reader/paragraphs";
import { LINE_HEIGHT_VALUES, type ReaderSettings } from "@/lib/reader/reader-settings";
import type { ReaderTheme } from "@/lib/reader/themes";

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
}

/**
 * The reading article. Pure presentation — the ReaderShell owns the
 * theme + font + chrome state and just passes it down here.
 *
 * In "focus" mode an IntersectionObserver tags the paragraph closest to
 * the viewport centre with data-focus="active"; CSS dims the others to
 * --reader-focus-dim.
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
}: ReaderBodyProps) {
  const articleRef = useRef<HTMLElement>(null);
  const paragraphs = useMemo(
    () => pairParagraphs(textOriginal, textTranslated),
    [textOriginal, textTranslated],
  );
  const showOriginal = settings.showOriginal && textOriginal.length > 0;

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

  return (
    <article
      ref={articleRef}
      dir={direction}
      data-theme={theme}
      className="reader-article mx-auto max-w-[680px] px-5 pt-20 pb-24 sm:px-8"
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
  );
}
