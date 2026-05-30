"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FontControls } from "./FontControls";
import { ProgressBar } from "./ProgressBar";
import { ReaderBody } from "./ReaderBody";
import { ReaderChrome, type VariantOption } from "./ReaderChrome";
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
  /** Pre-generated R2 MP3 for this part, or null (Listen falls back to Web Speech). */
  audioUrl: string | null;
}

export interface ReaderShellStory {
  id: string;
  variantSlug: string;
  titleOriginal: string;
  titleTranslated: string | null;
  totalParts: number;
  direction: "ltr" | "rtl";
  /** Reading font stack (serif) from the seeded language metadata. */
  fontFamilyReading: string | null;
  /** UI font stack (sans) — used when settings.fontVariant === "sans". */
  fontFamily: string | null;
  /**
   * ISO language code of the translated text. Passed into [ReaderBody] so
   * tap-to-define resolves words with `Intl.Segmenter(targetLanguage)` and
   * queries the dictionary API for that language. `null` (source reader)
   * disables the tap-to-define interaction.
   */
  targetLanguage: string | null;
}

interface ReaderShellProps {
  story: ReaderShellStory;
  part: ReaderShellPart;
  prevHref: string | null;
  nextHref: string | null;
  variants: ReadonlyArray<VariantOption>;
}

const PROGRESS_SAVE_MS = 5000;
const FONT_CONTROLS_HIDE_MS = 3000;

/**
 * The reader's root client component. Owns:
 *   - theme / line-height / alignment / font-variant / show-original
 *     (persisted as one JSON blob in localStorage)
 *   - font size (separate localStorage key — A−/A+ buttons + pinch zoom)
 *   - scroll progress save (every 5s + on visibilitychange)
 *   - scroll position restore on mount
 *
 * Chrome is permanently visible (no auto-hide). `chromeVisible` is kept as
 * a constant `true` for now so a future explicit toggle can be wired in
 * without rewiring ReaderChrome / FontControls.
 *
 * Pre-hydration we render with default settings to keep the SSR HTML
 * deterministic; a microtask after mount swaps in the persisted values.
 * The save-effect is gated on `hydratedRef` so the default-state render
 * does NOT round-trip and overwrite the user's saved preferences (the
 * earlier bug — every fresh mount blew away theme/font/etc with defaults).
 */
export function ReaderShell({ story, part, prevHref, nextHref, variants }: ReaderShellProps) {
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [fontSize, setFontSize] = useState<number>(DEFAULT_FONT_SIZE);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fontControlsVisible, setFontControlsVisible] = useState(true);
  const chromeVisible = true;

  const hydratedRef = useRef(false);
  const fontControlsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      // Mark hydrated AFTER the setStates above so the save-effect below
      // skips the default-state render and only writes user-driven changes.
      hydratedRef.current = true;

      const saved = getPartProgress(story.id, story.variantSlug, part.partNumber);
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
  }, [story.id, story.variantSlug, part.partNumber]);

  // -- save reader settings whenever they change ----------------------------
  useEffect(() => {
    // Skip until hydration has loaded persisted values into state. Without
    // this gate, the first commit (with DEFAULT_SETTINGS) would overwrite
    // localStorage before the microtask reads from it.
    if (!hydratedRef.current) return;
    saveReaderSettings(settings);
  }, [settings]);

  // -- font controls auto-hide ----------------------------------------------
  // Top + bottom chrome stay visible permanently (see chromeVisible above).
  // Only the floating A−/A+ buttons fade out after 3s of idle — they're
  // visual noise once the reader has picked a comfortable size.
  const showFontControlsBriefly = useCallback(() => {
    setFontControlsVisible(true);
    if (fontControlsHideTimerRef.current) clearTimeout(fontControlsHideTimerRef.current);
    fontControlsHideTimerRef.current = setTimeout(() => {
      setFontControlsVisible(false);
    }, FONT_CONTROLS_HIDE_MS);
  }, []);

  useEffect(() => {
    // Initial hide timer (chrome starts visible via useState initial = true).
    // Wrap in setTimeout so we never call setState synchronously in the
    // effect body — the React-19 lint rule wants effects to subscribe, not
    // dispatch state.
    fontControlsHideTimerRef.current = setTimeout(() => {
      setFontControlsVisible(false);
    }, FONT_CONTROLS_HIDE_MS);

    const events: Array<keyof DocumentEventMap> = ["scroll", "touchstart", "mousemove"];
    for (const e of events) {
      document.addEventListener(e, showFontControlsBriefly, { passive: true });
    }
    return () => {
      for (const e of events) document.removeEventListener(e, showFontControlsBriefly);
      if (fontControlsHideTimerRef.current) clearTimeout(fontControlsHideTimerRef.current);
    };
  }, [showFontControlsBriefly]);

  // -- font size persistence + clamping --------------------------------------
  const updateFontSize = useCallback((next: number) => {
    const clamped = clampFontSize(next);
    setFontSize(clamped);
    saveFontSize(clamped);
    // Tapping A− / A+ counts as interaction — keep them visible for another 3s.
    showFontControlsBriefly();
  }, [showFontControlsBriefly]);

  // -- save reading progress every 5s + on tab hide --------------------------
  useEffect(() => {
    function snapshot() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? window.scrollY / max : 0;
      savePartProgress(story.id, story.variantSlug, part.partNumber, ratio);
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
  }, [story.id, story.variantSlug, part.partNumber]);

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
        onOpenSettings={() => setSettingsOpen(true)}
        variants={variants}
        currentVariantSlug={story.variantSlug}
        audioUrl={part.audioUrl}
        listenText={part.textTranslated}
        targetLanguage={story.targetLanguage}
        voiceURI={
          story.targetLanguage
            ? settings.narrationVoiceByLang[story.targetLanguage] ?? null
            : null
        }
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
        targetLanguage={story.targetLanguage}
        storyId={story.id}
        variantSlug={story.variantSlug}
      />

      <FontControls fontSize={fontSize} onChange={updateFontSize} visible={fontControlsVisible} />

      <ReaderSettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onChange={setSettings}
        originalAvailable={part.textOriginal.length > 0}
        targetLanguage={story.targetLanguage}
      />
    </div>
  );
}
