"use client";

import {
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  STEP_FONT_SIZE,
} from "@/lib/reader/font-size";

interface FontControlsProps {
  fontSize: number;
  onChange: (next: number) => void;
  /** True when the chrome is visible; we fade with chrome. */
  visible: boolean;
}

/**
 * Floating A− / A+ buttons, bottom-right (above the bottom chrome). The
 * pair fades together with the rest of the chrome.
 */
export function FontControls({ fontSize, onChange, visible }: FontControlsProps) {
  const canDecrease = fontSize > MIN_FONT_SIZE;
  const canIncrease = fontSize < MAX_FONT_SIZE;

  return (
    <div
      className={`fixed right-4 bottom-20 z-40 flex flex-col gap-2 transition-opacity duration-300 sm:right-6 ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!visible}
    >
      <button
        type="button"
        onClick={() => onChange(fontSize + STEP_FONT_SIZE)}
        disabled={!canIncrease}
        aria-label="Increase font size"
        className="bg-(--reader-chrome-bg) text-(--reader-text) border-(--reader-chrome-border) ring-offset-(--reader-bg) hover:bg-(--reader-accent)/10 disabled:opacity-30 inline-flex h-10 w-10 items-center justify-center rounded-full border text-base font-semibold shadow-md backdrop-blur transition-colors"
      >
        A+
      </button>
      <button
        type="button"
        onClick={() => onChange(fontSize - STEP_FONT_SIZE)}
        disabled={!canDecrease}
        aria-label="Decrease font size"
        className="bg-(--reader-chrome-bg) text-(--reader-text) border-(--reader-chrome-border) ring-offset-(--reader-bg) hover:bg-(--reader-accent)/10 disabled:opacity-30 inline-flex h-10 w-10 items-center justify-center rounded-full border text-xs font-semibold shadow-md backdrop-blur transition-colors"
      >
        A−
      </button>
    </div>
  );
}
