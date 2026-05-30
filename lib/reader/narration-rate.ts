/**
 * Persisted narration playback speed, shared by the stored-MP3 player and the
 * Web Speech fallback in [ListenButton](../../components/reader/ListenButton.tsx).
 *
 * Lives in its own localStorage key (like font-size.ts) so the reader's speed
 * choice survives part-to-part navigation and reloads — "remember my speed for
 * all future plays".
 */

const STORAGE_KEY = "qissa:narration-rate";

/** The speeds offered in the player UI. A saved value outside this set is ignored. */
export const NARRATION_SPEEDS = [0.75, 1, 1.25, 1.5] as const;
export const DEFAULT_NARRATION_RATE = 1;

export function getNarrationRate(): number {
  if (typeof window === "undefined") return DEFAULT_NARRATION_RATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_NARRATION_RATE;
    const value = Number(raw);
    return (NARRATION_SPEEDS as ReadonlyArray<number>).includes(value)
      ? value
      : DEFAULT_NARRATION_RATE;
  } catch {
    return DEFAULT_NARRATION_RATE;
  }
}

export function saveNarrationRate(rate: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(rate));
  } catch {
    // localStorage full / disabled — the choice just won't persist.
  }
}
