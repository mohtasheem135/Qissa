/**
 * The five reader themes (docs/01-requirements.md §3.11). Each defines a
 * set of CSS custom properties that the ReaderShell sets on its outer
 * wrapper. Body + chrome consume them via var(--reader-…).
 */

export type ReaderTheme = "day" | "sepia" | "night" | "gray" | "focus";

export interface ThemeVars {
  /** background of the scrollable reading area */
  "--reader-bg": string;
  /** primary text colour */
  "--reader-text": string;
  /** dimmed text — used for original-paragraph overlays and chrome */
  "--reader-text-muted": string;
  /** accent colour for links, progress bar, current focus paragraph */
  "--reader-accent": string;
  /** chrome (top + bottom bars) background — must contrast with reader-bg */
  "--reader-chrome-bg": string;
  /** chrome divider colour */
  "--reader-chrome-border": string;
  /** "focus" mode dims non-current paragraphs to this opacity */
  "--reader-focus-dim": string;
}

export const THEMES: Record<ReaderTheme, { label: string; vars: ThemeVars }> = {
  day: {
    label: "Day",
    vars: {
      "--reader-bg": "#FFFFFF",
      "--reader-text": "#1A1A1A",
      "--reader-text-muted": "#666666",
      "--reader-accent": "#4F46E5",
      "--reader-chrome-bg": "rgba(255, 255, 255, 0.92)",
      "--reader-chrome-border": "rgba(0, 0, 0, 0.08)",
      "--reader-focus-dim": "1",
    },
  },
  sepia: {
    label: "Sepia",
    vars: {
      "--reader-bg": "#F4ECD8",
      "--reader-text": "#5B4636",
      "--reader-text-muted": "#8C7A60",
      "--reader-accent": "#8B4513",
      "--reader-chrome-bg": "rgba(244, 236, 216, 0.94)",
      "--reader-chrome-border": "rgba(91, 70, 54, 0.12)",
      "--reader-focus-dim": "1",
    },
  },
  night: {
    label: "Night",
    vars: {
      "--reader-bg": "#0A0A0A",
      "--reader-text": "#E8E8E8",
      "--reader-text-muted": "#888888",
      "--reader-accent": "#818CF8",
      "--reader-chrome-bg": "rgba(10, 10, 10, 0.92)",
      "--reader-chrome-border": "rgba(255, 255, 255, 0.08)",
      "--reader-focus-dim": "1",
    },
  },
  gray: {
    label: "Gray",
    vars: {
      "--reader-bg": "#1A1B26",
      "--reader-text": "#A9B1D6",
      "--reader-text-muted": "#6E7591",
      "--reader-accent": "#7DCFFF",
      "--reader-chrome-bg": "rgba(26, 27, 38, 0.92)",
      "--reader-chrome-border": "rgba(169, 177, 214, 0.12)",
      "--reader-focus-dim": "1",
    },
  },
  focus: {
    // Same palette as Day, but ReaderBody dims non-active paragraphs.
    label: "Focus",
    vars: {
      "--reader-bg": "#FFFFFF",
      "--reader-text": "#0F0F0F",
      "--reader-text-muted": "#DDDDDD",
      "--reader-accent": "#4F46E5",
      "--reader-chrome-bg": "rgba(255, 255, 255, 0.94)",
      "--reader-chrome-border": "rgba(0, 0, 0, 0.06)",
      "--reader-focus-dim": "0.25",
    },
  },
};

/** Project a theme's vars into a `style` object for inline application. */
export function themeStyle(theme: ReaderTheme): React.CSSProperties {
  return THEMES[theme].vars as unknown as React.CSSProperties;
}

export const DEFAULT_THEME: ReaderTheme = "day";
export const THEME_KEYS: ReadonlyArray<ReaderTheme> = ["day", "sepia", "night", "gray", "focus"];
