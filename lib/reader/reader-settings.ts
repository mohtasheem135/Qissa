import { DEFAULT_THEME, type ReaderTheme } from "./themes";

/**
 * One JSON blob in localStorage holds everything the settings sheet
 * mutates EXCEPT the font size — that lives separately because the A−/A+
 * buttons hit it constantly and we don't want to re-stringify the whole
 * blob on every keypress (see lib/reader/font-size.ts).
 */

const STORAGE_KEY = "qissa:reader-settings";

export type LineHeight = "compact" | "normal" | "relaxed";
export type Alignment = "left" | "justify";
export type FontVariant = "sans" | "serif";

export interface ReaderSettings {
  theme: ReaderTheme;
  lineHeight: LineHeight;
  alignment: Alignment;
  fontVariant: FontVariant;
  showOriginal: boolean;
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: DEFAULT_THEME,
  lineHeight: "normal",
  alignment: "justify",
  fontVariant: "serif",
  showOriginal: false,
};

export const LINE_HEIGHT_VALUES: Record<LineHeight, number> = {
  compact: 1.4,
  normal: 1.65,
  relaxed: 1.9,
};

export function getReaderSettings(): ReaderSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(parsed as Partial<ReaderSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveReaderSettings(next: ReaderSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage full / disabled — settings just don't persist.
  }
}
