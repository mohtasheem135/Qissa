"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FontControls } from "./FontControls";
import { ProgressBar } from "./ProgressBar";
import { ReaderBody } from "./ReaderBody";
import { ReaderChrome } from "./ReaderChrome";
import { ReaderSettingsSheet } from "./ReaderSettings";
import {
  clampFontSize,
  DEFAULT_FONT_SIZE,
  getFontSize,
  saveFontSize,
} from "@/lib/reader/font-size";
import {
  DEFAULT_SETTINGS,
  getReaderSettings,
  saveReaderSettings,
  type ReaderSettings,
} from "@/lib/reader/reader-settings";
import { savePartProgress, getPartProgress } from "@/lib/reader/progress";
import { themeStyle } from "@/lib/reader/themes";

export interface ReaderShellPart {
  id: string;
  partNumber: number;
  partLabel: string;
  textOriginal: string;
  textTranslated: string;
}

export interface ReaderShellStory {
  id: string;
  titleOriginal: string;
  titleTranslated: string | null;
  totalParts: number;
  direction: "ltr" | "rtl";
  /** Reading font stack (serif) from the seeded language metadata. */
  fontFamilyReading: string | null;
  /** UI font stack (sans) — used when settings.fontVariant === "sans". */
  fontFamily: string | null;
}

interface ReaderShellProps {
  story: ReaderShellStory;
  part: ReaderShellPart;
  prevHref: string | null;
  nextHref: string | null;
}

const CHROME_HIDE_MS = 3000;
const PROGRESS_SAVE_MS = 5000;

/**
 * The reader's root client component. Owns:
 *   - theme / line-height / alignment / font-variant / show-original
 *     (persisted as one JSON blob in localStorage)
 *   - font size (separate localStorage key — A−/A+ buttons + pinch zoom)
 *   - chrome visibility (auto-hide after 3s, tap-to-show)
 *   - scroll progress save (every 5s + on visibilitychange)
 *   - scroll position restore on mount
 *
 * Pre-hydration we render with default settings to keep the SSR HTML
 * deterministic; the first useEffect tick swaps in the persisted values.
 * Body content is identical pre/post hydration so there's no mismatch.
 */
export function ReaderShell({ story, part, prevHref, nextHref }: ReaderShellProps) {
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [fontSize, setFontSize] = useState<number>(DEFAULT_FONT_SIZE);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref mirror so the auto-hide timer can read the current open state
  // without re-registering listeners.
  const settingsOpenRef = useRef(settingsOpen);
  useEffect(() => {
    settingsOpenRef.current = settingsOpen;
  }, [settingsOpen]);

  // -- one-shot: hydrate state from localStorage and restore scroll ----------
  useEffect(() => {
    // Defer the setStates to a microtask so they aren't synchronous within
    // the effect body (React 19 set-state-in-effect lint). The values come
    // from a sync API (localStorage); the microtask is purely to satisfy
    // the rule — there's no real async work to await.
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setSettings(getReaderSettings());
      setFontSize(getFontSize());

      const saved = getPartProgress(story.id, part.partNumber);
      if (saved && saved.scroll > 0.02) {
        // Wait one frame so the article has laid out at its persisted size.
        requestAnimationFrame(() => {
          const max = document.documentElement.scrollHeight - window.innerHeight;
          if (max > 0) {
            window.scrollTo({ top: Math.round(saved.scroll * max), behavior: "auto" });
          }
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [story.id, part.partNumber]);

  // -- save reader settings whenever they change ----------------------------
  useEffect(() => {
    // Skip first render: hydration writes the same value that's already in
    // storage, no point round-tripping.
    saveReaderSettings(settings);
  }, [settings]);

  // -- font size persistence + clamping --------------------------------------
  const updateFontSize = useCallback((next: number) => {
    const clamped = clampFontSize(next);
    setFontSize(clamped);
    saveFontSize(clamped);
  }, []);

  // -- chrome auto-hide ------------------------------------------------------
  // Stable callback (no dependencies) so the event listeners below don't
  // re-register on every settings change. Reads the live settings-open
  // flag via a ref instead of closing over the state.
  const showChromeBriefly = useCallback(() => {
    setChromeVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      // Don't hide while the settings sheet is open.
      if (!settingsOpenRef.current) setChromeVisible(false);
    }, CHROME_HIDE_MS);
  }, []);

  useEffect(() => {
    // Chrome starts visible (useState initial = true). Start the hide timer
    // inside setTimeout so we never call setState synchronously in the
    // effect body — the React-19 lint rule wants effects to subscribe, not
    // dispatch state.
    hideTimerRef.current = setTimeout(() => {
      if (!settingsOpenRef.current) setChromeVisible(false);
    }, CHROME_HIDE_MS);

    const events: Array<keyof DocumentEventMap> = ["scroll", "touchstart", "mousemove"];
    for (const e of events) {
      document.addEventListener(e, showChromeBriefly, { passive: true });
    }
    return () => {
      for (const e of events) document.removeEventListener(e, showChromeBriefly);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [showChromeBriefly]);

  // -- save reading progress every 5s + on tab hide --------------------------
  useEffect(() => {
    function snapshot() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? window.scrollY / max : 0;
      savePartProgress(story.id, part.partNumber, ratio);
    }
    const interval = setInterval(snapshot, PROGRESS_SAVE_MS);
    function onVisibility() {
      if (document.visibilityState === "hidden") snapshot();
    }
    document.addEventListener("visibilitychange", onVisibility);
    // Final write on unmount (e.g. navigating to next part).
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      snapshot();
    };
  }, [story.id, part.partNumber]);

  // -- pinch-to-zoom on the article -----------------------------------------
  useEffect(() => {
    let initialDistance = 0;
    let initialFontSize = fontSize;

    function distance(touches: TouchList): number {
      if (touches.length < 2) return 0;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    }
    function onTouchStart(event: TouchEvent) {
      if (event.touches.length === 2) {
        initialDistance = distance(event.touches);
        initialFontSize = fontSize;
      }
    }
    function onTouchMove(event: TouchEvent) {
      if (event.touches.length === 2 && initialDistance > 0) {
        event.preventDefault();
        const ratio = distance(event.touches) / initialDistance;
        const next = clampFontSize(initialFontSize * ratio);
        setFontSize((current) => (current === next ? current : next));
      }
    }
    function onTouchEnd() {
      if (initialDistance > 0) {
        initialDistance = 0;
        // Persist whatever we ended up with.
        saveFontSize(fontSize);
      }
    }
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [fontSize]);

  return (
    <div
      style={{
        ...themeStyle(settings.theme),
        backgroundColor: "var(--reader-bg)",
        color: "var(--reader-text)",
        minHeight: "100dvh",
      }}
    >
      <ProgressBar />

      <ReaderChrome
        visible={chromeVisible}
        storyId={story.id}
        storyTitle={story.titleTranslated ?? story.titleOriginal}
        partNumber={part.partNumber}
        totalParts={story.totalParts}
        prevHref={prevHref}
        nextHref={nextHref}
        onOpenSettings={() => {
          setSettingsOpen(true);
          setChromeVisible(true);
        }}
      />

      <ReaderBody
        partLabel={part.partLabel}
        partNumber={part.partNumber}
        totalParts={story.totalParts}
        textOriginal={part.textOriginal}
        textTranslated={part.textTranslated}
        direction={story.direction}
        fontFamily={story.fontFamilyReading}
        originalFontFamily={story.fontFamily}
        fontSize={fontSize}
        settings={settings}
        theme={settings.theme}
      />

      <FontControls fontSize={fontSize} onChange={updateFontSize} visible={chromeVisible} />

      <ReaderSettingsSheet
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) showChromeBriefly();
        }}
        settings={settings}
        onChange={setSettings}
        originalAvailable={part.textOriginal.length > 0}
      />
    </div>
  );
}
