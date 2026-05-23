const STORAGE_KEY = "qissa:fontSize";

export const MIN_FONT_SIZE = 14;
export const MAX_FONT_SIZE = 32;
export const STEP_FONT_SIZE = 2;
export const DEFAULT_FONT_SIZE = 18;

export function clampFontSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_FONT_SIZE;
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(value)));
}

export function getFontSize(): number {
  if (typeof window === "undefined") return DEFAULT_FONT_SIZE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FONT_SIZE;
    const parsed = Number.parseInt(raw, 10);
    return clampFontSize(parsed);
  } catch {
    return DEFAULT_FONT_SIZE;
  }
}

export function saveFontSize(value: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(clampFontSize(value)));
  } catch {
    /* swallow */
  }
}
