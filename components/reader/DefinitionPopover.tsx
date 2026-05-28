"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BookmarkIcon, ExternalLinkIcon, XIcon } from "lucide-react";
import type {
  DictionaryResult,
  DictionarySection,
} from "@/lib/dictionary/types";
import { cn } from "@/lib/utils/cn";
import {
  getVocab,
  subscribeVocab,
  toggleWord,
  type VocabEntry,
} from "@/lib/reader/vocab";

/**
 * Floating dictionary popover anchored to the bounding rect of a tapped word.
 *
 * State machine:
 *   open=false → unmounted
 *   open=true, status="loading"  → spinner + word title
 *   open=true, status="loaded"   → primary sections, then collapsed others
 *   open=true, status="empty"    → "No definition found" + link to Wiktionary
 *   open=true, status="error"    → message + retry hint
 *
 * Positioning: `position: fixed` keyed off the anchor `DOMRect`. Prefers
 * placement below the word; flips above if it would clip the viewport.
 * The horizontal centre is clamped to a 12px gutter on both sides.
 *
 * Dismissal: outside click · Escape · scroll · resize · explicit close button.
 * Scroll dismisses because once the page moves the anchor rect is stale; we
 * don't try to re-track it.
 */

export interface DefinitionAnchor {
  rect: DOMRect;
  word: string;
  languageCode: string;
  context?: {
    storyId: string;
    variantSlug: string;
    partNumber: number;
  };
}

interface DefinitionPopoverProps {
  anchor: DefinitionAnchor | null;
  onClose: () => void;
}

type Status = "loading" | "loaded" | "empty" | "error";

const POPOVER_WIDTH = 320;
const POPOVER_MAX_HEIGHT = 360;
const GAP = 8; // gap between anchor and popover
const GUTTER = 12; // viewport-edge gutter

export function DefinitionPopover({ anchor, onClose }: DefinitionPopoverProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [result, setResult] = useState<DictionaryResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showOthers, setShowOthers] = useState(false);

  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!anchor) return;
    let cancelled = false;
    // Microtask-defer the reset so the setStates aren't synchronous inside
    // the effect body — same pattern ReaderShell uses to satisfy the
    // React-19 `react-hooks/set-state-in-effect` lint rule.
    Promise.resolve().then(() => {
      if (cancelled) return;
      setStatus("loading");
      setResult(null);
      setErrorMessage(null);
      setShowOthers(false);
    });

    const url = `/api/dictionary?word=${encodeURIComponent(anchor.word)}&lang=${encodeURIComponent(anchor.languageCode)}`;

    fetch(url, { headers: { accept: "application/json" } })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Dictionary lookup failed (${res.status}).`);
        }
        return (await res.json()) as DictionaryResult;
      })
      .then((data) => {
        if (cancelled) return;
        setResult(data);
        setStatus(data.empty ? "empty" : "loaded");
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : "Lookup failed.");
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [anchor]);

  // Dismiss on outside click / Escape / scroll / resize.
  useEffect(() => {
    if (!anchor) return;
    const onPointerDown = (e: PointerEvent) => {
      const node = popoverRef.current;
      if (node && e.target instanceof Node && !node.contains(e.target)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onScrollOrResize = () => onClose();
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, { passive: true, capture: true });
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, { capture: true });
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [anchor, onClose]);

  if (!anchor) return null;

  const placement = computePlacement(anchor.rect);

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={`Definition of ${anchor.word}`}
      className="bg-popover text-popover-foreground fixed z-50 rounded-lg border shadow-xl"
      style={{
        top: placement.top,
        left: placement.left,
        width: POPOVER_WIDTH,
        maxHeight: POPOVER_MAX_HEIGHT,
      }}
    >
      <Header
        word={anchor.word}
        languageCode={anchor.languageCode}
        sourceUrl={result?.sourceUrl}
        anchor={anchor}
        onClose={onClose}
      />
      <div
        className="px-4 py-3 text-sm"
        style={{ maxHeight: POPOVER_MAX_HEIGHT - 48, overflowY: "auto" }}
      >
        {status === "loading" ? (
          <p className="text-muted-foreground text-xs">Looking up…</p>
        ) : status === "error" ? (
          <p className="text-destructive text-xs">{errorMessage ?? "Lookup failed."}</p>
        ) : status === "empty" && result ? (
          <EmptyState sourceUrl={result.sourceUrl} />
        ) : result ? (
          <>
            <SectionsList sections={result.primary} />
            {result.others.length > 0 ? (
              <div className="mt-3 border-t pt-3">
                <button
                  type="button"
                  onClick={() => setShowOthers((v) => !v)}
                  className="text-muted-foreground hover:text-foreground text-xs"
                >
                  {showOthers ? "Hide" : "Also in"} {result.others.length} other{" "}
                  {result.others.length === 1 ? "language" : "languages"}
                </button>
                {showOthers ? (
                  <div className="mt-2">
                    <SectionsList sections={result.others} />
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function Header({
  word,
  languageCode,
  sourceUrl,
  anchor,
  onClose,
}: {
  word: string;
  languageCode: string;
  sourceUrl: string | undefined;
  anchor: DefinitionAnchor;
  onClose: () => void;
}) {
  // Subscribe so the bookmark icon flips when the user saves/unsaves.
  const vocab = useSyncExternalStore(subscribeVocab, getVocab, getVocab);
  const isSaved = vocab.some(
    (v: VocabEntry) =>
      v.languageCode.toLowerCase() === languageCode.toLowerCase() && v.word === word,
  );

  const handleSave = () => {
    toggleWord({
      word,
      languageCode,
      storyId: anchor.context?.storyId,
      variantSlug: anchor.context?.variantSlug,
      partNumber: anchor.context?.partNumber,
    });
  };

  return (
    <div className="flex items-start justify-between gap-2 border-b px-4 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold" dir="auto">
          {word}
        </p>
        <p className="text-muted-foreground text-[10px] uppercase tracking-wide">
          {languageCode} · via Wiktionary
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={handleSave}
          aria-pressed={isSaved}
          aria-label={isSaved ? "Remove from saved words" : "Save word"}
          className={cn(
            "hover:bg-muted rounded p-1.5 transition-colors",
            isSaved ? "text-primary" : "text-muted-foreground",
          )}
        >
          <BookmarkIcon className={cn("size-4", isSaved && "fill-current")} />
        </button>
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open on Wiktionary"
            className="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1.5"
          >
            <ExternalLinkIcon className="size-4" />
          </a>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1.5"
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}

function SectionsList({ sections }: { sections: DictionarySection[] }) {
  if (sections.length === 0) {
    return <p className="text-muted-foreground text-xs">No senses listed.</p>;
  }
  return (
    <ul className="space-y-3">
      {sections.map((section, idx) => (
        <li key={`${section.languageCode}-${section.partOfSpeech}-${idx}`}>
          <p className="text-muted-foreground mb-1 text-[10px] uppercase tracking-wide">
            {section.languageName}
            {section.partOfSpeech ? ` · ${section.partOfSpeech}` : ""}
          </p>
          <ol className="text-foreground list-decimal space-y-1 pl-4 text-xs leading-snug">
            {section.senses.map((sense, sIdx) => (
              <li key={sIdx} dir="auto">
                {stripHtml(sense.definition)}
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ sourceUrl }: { sourceUrl: string }) {
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">
        No definition found. Wiktionary may have it under a different spelling.
      </p>
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary inline-flex items-center gap-1 text-xs underline"
      >
        Search Wiktionary
        <ExternalLinkIcon className="size-3" />
      </a>
    </div>
  );
}

/**
 * Strip HTML tags from a Wiktionary `definition` string. Wiktionary returns
 * limited HTML (`<a>`, `<i>`, `<b>`, occasional `<span>`). v0 renders plain
 * text to avoid any sanitisation question. Future polish can render
 * `<a>` and emphasis with a tiny allowlist parser.
 */
function stripHtml(html: string): string {
  // Replace tags with spaces so adjacent tokens stay separate, then collapse
  // whitespace runs.
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

function computePlacement(anchorRect: DOMRect): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Horizontal: centre on the word, clamp to viewport gutters.
  const desiredLeft = anchorRect.left + anchorRect.width / 2 - POPOVER_WIDTH / 2;
  const left = Math.max(GUTTER, Math.min(vw - POPOVER_WIDTH - GUTTER, desiredLeft));

  // Vertical: prefer below; flip above if too close to bottom.
  const belowTop = anchorRect.bottom + GAP;
  const aboveTop = anchorRect.top - GAP - POPOVER_MAX_HEIGHT;
  const room_below = vh - belowTop - GUTTER;
  const top =
    room_below >= 160 || aboveTop < GUTTER
      ? Math.min(belowTop, vh - GUTTER - 160)
      : Math.max(GUTTER, aboveTop);

  return { top, left };
}
