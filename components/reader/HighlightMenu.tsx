"use client";

import { useEffect, useRef, useState } from "react";
import { TrashIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  HIGHLIGHT_COLOURS,
  removeHighlight,
  saveHighlight,
  type Highlight,
  type HighlightColour,
} from "@/lib/reader/highlights";

/**
 * Popover for picking a highlight colour, adding an optional note, or
 * removing an existing highlight. Anchored to the bounding rect of the
 * paragraph's highlight handle (the small dot in the start margin).
 *
 * Dismissal: outside click · Escape · scroll · resize. Same UX rule as
 * [DefinitionPopover] — once the page moves, the anchor rect is stale and
 * we close rather than tracking.
 *
 * Save behaviour:
 *  - Tapping a colour swatch saves immediately (no extra confirm). The
 *    popover stays open so the reader can add a note without re-opening.
 *  - The note input persists on blur; the menu closes on Escape or
 *    outside-click.
 *  - The "Remove" button drops the highlight and closes the popover.
 */
const POPOVER_WIDTH = 280;
const POPOVER_MAX_HEIGHT = 280;
const GAP = 8;
const GUTTER = 12;

export interface HighlightTarget {
  rect: DOMRect;
  storyId: string;
  variantSlug: string;
  partNumber: number;
  paragraphIndex: number;
  /** Full paragraph text — used to capture a snippet on first save. */
  paragraphText: string;
  /** Current highlight for this paragraph, if any. */
  existing: Highlight | null;
}

interface HighlightMenuProps {
  target: HighlightTarget | null;
  onClose: () => void;
}

const COLOUR_LABELS: Record<HighlightColour, string> = {
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
};

export function HighlightMenu({ target, onClose }: HighlightMenuProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // The note input is locally-controlled to feel snappy; we flush to storage
  // on blur (via `saveHighlight`). Mirrors the popover-staying-open UX —
  // every keystroke shouldn't write localStorage.
  const [noteDraft, setNoteDraft] = useState<string>("");
  // Track the active highlight locally so colour swatches reflect their
  // pressed state immediately instead of waiting on the parent re-subscribing.
  const [activeColour, setActiveColour] = useState<HighlightColour | null>(null);

  // Sync local state when a new target opens — microtask-defer so the
  // setStates aren't synchronous inside the effect body (React-19 lint).
  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setNoteDraft(target.existing?.note ?? "");
      setActiveColour(target.existing?.colour ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [target]);

  // Dismiss on outside click / Escape / scroll / resize.
  useEffect(() => {
    if (!target) return;
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
  }, [target, onClose]);

  if (!target) return null;

  const placement = computePlacement(target.rect);

  const handlePickColour = (colour: HighlightColour) => {
    setActiveColour(colour);
    saveHighlight({
      storyId: target.storyId,
      variantSlug: target.variantSlug,
      partNumber: target.partNumber,
      paragraphIndex: target.paragraphIndex,
      text: target.paragraphText,
      colour,
      note: noteDraft.trim() || undefined,
    });
  };

  const handleNoteBlur = () => {
    // Only persist when a colour exists — saving a note without a colour
    // would create a colourless highlight, which the type doesn't allow.
    if (!activeColour) return;
    saveHighlight({
      storyId: target.storyId,
      variantSlug: target.variantSlug,
      partNumber: target.partNumber,
      paragraphIndex: target.paragraphIndex,
      text: target.paragraphText,
      colour: activeColour,
      note: noteDraft.trim() || undefined,
    });
  };

  const handleRemove = () => {
    if (target.existing) {
      removeHighlight(target.existing.id);
    }
    onClose();
  };

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Highlight paragraph"
      className="bg-popover text-popover-foreground fixed z-50 rounded-lg border shadow-xl"
      style={{
        top: placement.top,
        left: placement.left,
        width: POPOVER_WIDTH,
        maxHeight: POPOVER_MAX_HEIGHT,
      }}
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Highlight
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>

      <div className="space-y-3 px-3 py-3">
        <div className="flex items-center gap-2">
          {HIGHLIGHT_COLOURS.map((colour) => {
            const isActive = colour === activeColour;
            return (
              <button
                key={colour}
                type="button"
                onClick={() => handlePickColour(colour)}
                aria-pressed={isActive}
                aria-label={COLOUR_LABELS[colour]}
                className={cn(
                  "size-9 rounded-full border-2 transition-all",
                  isActive ? "border-foreground scale-110" : "border-transparent",
                )}
                style={{ backgroundColor: SWATCH_COLOURS[colour] }}
              />
            );
          })}
          {target.existing ? (
            <button
              type="button"
              onClick={handleRemove}
              aria-label="Remove highlight"
              className="text-muted-foreground hover:bg-muted hover:text-destructive ms-auto rounded p-2"
            >
              <TrashIcon className="size-4" />
            </button>
          ) : null}
        </div>

        <label className="block space-y-1">
          <span className="text-muted-foreground text-xs">Note (optional)</span>
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={handleNoteBlur}
            placeholder={activeColour ? "Add a quick note…" : "Pick a colour first"}
            disabled={!activeColour}
            rows={3}
            className={cn(
              "w-full resize-none rounded-md border bg-background px-2 py-1.5 text-sm",
              "placeholder:text-muted-foreground/60",
              "focus:outline-none focus:ring-2 focus:ring-ring/40",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          />
        </label>
      </div>
    </div>
  );
}

const SWATCH_COLOURS: Record<HighlightColour, string> = {
  yellow: "rgb(245, 200, 50)",
  green: "rgb(120, 200, 130)",
  blue: "rgb(110, 165, 235)",
};

function computePlacement(anchorRect: DOMRect): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Horizontal: prefer placing the popover to the right of the handle (its
  // natural reading direction). Clamp to the viewport gutters.
  const desiredLeft = anchorRect.right + GAP;
  const overflowsRight = desiredLeft + POPOVER_WIDTH + GUTTER > vw;
  const left = overflowsRight
    ? Math.max(GUTTER, anchorRect.left - POPOVER_WIDTH - GAP)
    : desiredLeft;

  // Vertical: top-align with the handle, but never let the popover bottom
  // run past the viewport floor.
  const top = Math.min(
    Math.max(GUTTER, anchorRect.top),
    vh - POPOVER_MAX_HEIGHT - GUTTER,
  );

  return { top, left };
}
