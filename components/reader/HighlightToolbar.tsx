"use client";

import { useEffect, useRef, useState } from "react";
import { TrashIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { HIGHLIGHT_COLOURS, type HighlightColour } from "@/lib/reader/highlights";

/**
 * Floating highlight control, used in two modes:
 *  - **create** — a compact colour bar shown above an active text selection;
 *    picking a colour highlights the exact selected words.
 *  - **edit** — a small popover anchored to an existing highlight (tap it);
 *    change its colour, add/edit a note, or remove it.
 *
 * Anchored to a viewport rect (selection bounds in create mode, the tapped
 * `<mark>`'s rect in edit mode). Dismissal: outside pointerdown + Escape, plus
 * scroll in create mode (the selection rect goes stale once the page moves).
 */
const CREATE_WIDTH = 168;
const EDIT_WIDTH = 264;
const GAP = 8;
const GUTTER = 12;

const SWATCH_COLOURS: Record<HighlightColour, string> = {
  yellow: "rgb(245, 200, 50)",
  green: "rgb(120, 200, 130)",
  blue: "rgb(110, 165, 235)",
};
const COLOUR_LABELS: Record<HighlightColour, string> = {
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
};

export interface HighlightToolbarProps {
  mode: "create" | "edit";
  rect: DOMRect;
  /** Current colour (edit mode) so the active swatch reads as pressed. */
  activeColour?: HighlightColour | null;
  /** Current note (edit mode). */
  note?: string;
  onPickColour: (colour: HighlightColour) => void;
  /** Edit mode — persist the note (called on blur). */
  onChangeNote?: (note: string) => void;
  /** Edit mode — delete the highlight. */
  onRemove?: () => void;
  onClose: () => void;
}

export function HighlightToolbar({
  mode,
  rect,
  activeColour,
  note,
  onPickColour,
  onChangeNote,
  onRemove,
  onClose,
}: HighlightToolbarProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [noteDraft, setNoteDraft] = useState(note ?? "");

  // Touch devices pop a native text-selection menu (Copy / Share / Translate…)
  // right over the selection, which would hide a bar anchored there. So on a
  // coarse pointer we DOCK the create bar to the bottom of the screen instead.
  // Desktop (mouse select → no native menu) keeps the near-selection placement.
  const coarse =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(pointer: coarse)").matches
      : false;
  const docked = mode === "create" && coarse;

  // Reset the note draft when a different highlight opens (microtask-defer to
  // keep the setState out of the effect body — React-19 lint).
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setNoteDraft(note ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [note]);

  // Dismiss on outside pointerdown / Escape (+ scroll in create mode).
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const node = rootRef.current;
      if (node && e.target instanceof Node && !node.contains(e.target)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    // Scroll dismisses an anchored bar (its rect goes stale) — but NOT the
    // bottom-docked one, which is fixed and survives scrolling/selection tweaks.
    if (mode === "create" && !docked) {
      window.addEventListener("scroll", onClose, { passive: true, capture: true });
    }
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
      if (mode === "create" && !docked) {
        window.removeEventListener("scroll", onClose, { capture: true });
      }
    };
  }, [mode, docked, onClose]);

  const placement = computePlacement(rect, mode);
  const width = mode === "create" ? CREATE_WIDTH : EDIT_WIDTH;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={mode === "create" ? "Highlight selection" : "Edit highlight"}
      className="bg-popover text-popover-foreground fixed z-50 rounded-lg border shadow-xl"
      style={
        docked
          ? {
              left: "50%",
              transform: "translateX(-50%)",
              // Sit above the reader's bottom nav (h-14) + the safe-area inset.
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 4.75rem)",
            }
          : { top: placement.top, left: placement.left, width }
      }
    >
      {mode === "create" ? (
        <div className="flex items-center gap-2 px-3 py-2">
          {docked ? (
            <span className="text-muted-foreground mr-0.5 text-xs font-medium">Highlight</span>
          ) : null}
          {HIGHLIGHT_COLOURS.map((colour) => (
            <Swatch
              key={colour}
              colour={colour}
              active={false}
              onClick={() => onPickColour(colour)}
            />
          ))}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between border-b px-3 py-2">
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
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
              {HIGHLIGHT_COLOURS.map((colour) => (
                <Swatch
                  key={colour}
                  colour={colour}
                  active={colour === activeColour}
                  onClick={() => onPickColour(colour)}
                />
              ))}
              <button
                type="button"
                onClick={onRemove}
                aria-label="Remove highlight"
                className="text-muted-foreground hover:bg-muted hover:text-destructive ms-auto rounded p-2"
              >
                <TrashIcon className="size-4" />
              </button>
            </div>
            <label className="block space-y-1">
              <span className="text-muted-foreground text-xs">Note (optional)</span>
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onBlur={() => onChangeNote?.(noteDraft)}
                placeholder="Add a quick note…"
                rows={3}
                className={cn(
                  "w-full resize-none rounded-md border bg-background px-2 py-1.5 text-sm",
                  "placeholder:text-muted-foreground/60",
                  "focus:outline-none focus:ring-2 focus:ring-ring/40",
                )}
              />
            </label>
          </div>
        </>
      )}
    </div>
  );
}

function Swatch({
  colour,
  active,
  onClick,
}: {
  colour: HighlightColour;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={COLOUR_LABELS[colour]}
      className={cn(
        "size-9 rounded-full border-2 transition-all",
        active ? "border-foreground scale-110" : "border-transparent",
      )}
      style={{ backgroundColor: SWATCH_COLOURS[colour] }}
    />
  );
}

function computePlacement(rect: DOMRect, mode: "create" | "edit"): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = mode === "create" ? CREATE_WIDTH : EDIT_WIDTH;
  const estHeight = mode === "create" ? 52 : 210;

  // Horizontal: centre over the anchor, clamped to the viewport gutters.
  const left = Math.max(GUTTER, Math.min(rect.left + rect.width / 2 - width / 2, vw - width - GUTTER));

  // Vertical: prefer above the anchor; flip below when there isn't room.
  let top = rect.top - GAP - estHeight;
  if (top < GUTTER) top = rect.bottom + GAP;
  top = Math.max(GUTTER, Math.min(top, vh - estHeight - GUTTER));

  return { top, left };
}
