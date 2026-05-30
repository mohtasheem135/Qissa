"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createSpeechController,
  hasVoiceForLanguage,
  isSpeechSupported,
  type SpeechController,
} from "@/lib/reader/speech";
import {
  DEFAULT_NARRATION_RATE,
  getNarrationRate,
  NARRATION_SPEEDS,
  saveNarrationRate,
} from "@/lib/reader/narration-rate";

interface ListenButtonProps {
  /** Pre-generated R2 MP3 for this part, or null to use the Web Speech fallback. */
  audioUrl: string | null;
  /** The narratable (translated) text — used by the Web Speech fallback. */
  text: string;
  /** ISO language code of the text, for matching a Web Speech voice. */
  targetLanguage: string | null;
  /** Reader's chosen Web Speech voiceURI for this language, or null for auto. */
  voiceURI?: string | null;
  /** Next part's reader URL, or null on the last part — used for auto-advance. */
  nextHref?: string | null;
}

const SPEEDS = NARRATION_SPEEDS;

/** Query flag appended to the next part's URL so it resumes playing on arrival. */
const AUTOPLAY_PARAM = "play";

/**
 * "Listen" control in the reader top bar. Plays the stored premium MP3 when
 * one exists; otherwise falls back to the device's free Web Speech API so
 * Listen *always works*. Mounted in [ReaderChrome](./ReaderChrome.tsx) between
 * the variant Select and the Settings button.
 *
 * Continuous playback: when a part's narration ends it navigates to the next
 * part with `?play=1`, and a part that loads with that flag auto-resumes — so
 * pressing Listen plays the whole story part-by-part. Speed is persisted
 * (lib/reader/narration-rate.ts) so it carries across parts and sessions.
 */
export function ListenButton({
  audioUrl,
  text,
  targetLanguage,
  voiceURI,
  nextHref,
}: ListenButtonProps) {
  const mode: "stored" | "speech" = audioUrl ? "stored" : "speech";
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoplayRequested = searchParams.get(AUTOPLAY_PARAM) === "1";

  // --- shared open/active state ---
  const [open, setOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [rate, setRate] = useState(DEFAULT_NARRATION_RATE);

  // --- Web Speech state ---
  const controllerRef = useRef<SpeechController | null>(null);
  const [speaking, setSpeaking] = useState(false);
  // Some platforms have no installed voice for the language → hide the fallback.
  const [speechAvailable, setSpeechAvailable] = useState(true);

  useEffect(() => {
    if (mode !== "speech") return;
    let cancelled = false;
    // Defer the initial setState off the effect body (React-19 lint); voices
    // may also load late, so re-check when `voiceschanged` fires.
    const check = () => {
      if (!cancelled) {
        setSpeechAvailable(
          isSpeechSupported() && hasVoiceForLanguage(targetLanguage) && text.length > 0,
        );
      }
    };
    Promise.resolve().then(check);
    if (isSpeechSupported() && "onvoiceschanged" in window.speechSynthesis) {
      window.speechSynthesis.addEventListener("voiceschanged", check);
      return () => {
        cancelled = true;
        window.speechSynthesis.removeEventListener("voiceschanged", check);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [mode, targetLanguage, text]);

  // Stop any speech when the part (text) changes or on unmount.
  useEffect(() => {
    return () => {
      controllerRef.current?.stop();
      controllerRef.current = null;
    };
  }, [text]);

  // Hydrate the saved playback speed once on mount (kept out of the useState
  // initialiser to keep SSR output deterministic / avoid a hydration mismatch).
  useEffect(() => {
    Promise.resolve().then(() => setRate(getNarrationRate()));
  }, []);

  // Keep a live <audio> element in sync whenever the rate changes — covers the
  // hydration above and any rate set before the element existed.
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate]);

  // Stable ref to the latest startSpeech so the once-on-mount autoplay effect
  // can call it without taking it (and its closure) as a dependency.
  const startSpeechRef = useRef<() => void>(() => {});
  useEffect(() => {
    startSpeechRef.current = startSpeech;
  });

  // Auto-resume when this part loaded via "continue playing" (?play=1) from the
  // previous part. Runs once; strips the flag so a manual refresh won't re-fire.
  const autoplayHandledRef = useRef(false);
  useEffect(() => {
    if (!autoplayRequested || autoplayHandledRef.current) return;
    autoplayHandledRef.current = true;
    Promise.resolve().then(() => {
      if (mode === "stored") setOpen(true); // the <audio autoPlay> starts it
      else startSpeechRef.current();
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", window.location.pathname);
      }
    });
  }, [autoplayRequested, mode]);

  /** Advance to the next part and tell it to resume playing on arrival. */
  function goToNextAndPlay() {
    if (!nextHref) return;
    const sep = nextHref.includes("?") ? "&" : "?";
    router.push(`${nextHref}${sep}${AUTOPLAY_PARAM}=1`);
  }

  function applyRate(next: number) {
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
    saveNarrationRate(next); // remember for all future plays
  }

  function startSpeech() {
    const controller = createSpeechController(
      text,
      targetLanguage,
      {
        onStart: () => setSpeaking(true),
        onEnd: () => {
          setSpeaking(false);
          goToNextAndPlay();
        },
        onError: () => setSpeaking(false),
      },
      rate,
      voiceURI,
    );
    controllerRef.current = controller;
    controller.play();
  }

  function handleSpeechToggle() {
    if (speaking) {
      controllerRef.current?.stop();
      setSpeaking(false);
      return;
    }
    startSpeech();
  }

  // Don't render at all when there's nothing we can play.
  if (mode === "speech" && !speechAvailable) return null;

  // ---- Stored MP3: button toggles an inline player (native seek/play/pause) ----
  if (mode === "stored") {
    return (
      <>
        <ChromeButton
          label={open ? "Hide player" : "Listen"}
          active={open}
          onClick={() => setOpen((v) => !v)}
        />
        {open ? (
          <div
            className="fixed inset-x-0 top-12 z-40 backdrop-blur"
            style={{
              backgroundColor: "var(--reader-chrome-bg)",
              borderBottom: "1px solid var(--reader-chrome-border)",
            }}
          >
            <div className="mx-auto flex max-w-[680px] flex-wrap items-center gap-3 px-3 py-2 sm:px-5">
              <audio
                ref={audioRef}
                controls
                autoPlay
                preload="auto"
                src={audioUrl ?? undefined}
                // Browsers reset playbackRate to 1 when new media loads, so
                // reapply the chosen speed once the clip is ready.
                onLoadedData={(event) => {
                  event.currentTarget.playbackRate = rate;
                }}
                // When this part finishes, continue with the next part.
                onEnded={goToNextAndPlay}
                className="h-9 min-w-0 flex-1"
              />
              <div className="flex items-center gap-1">
                {SPEEDS.map((s) => {
                  const isActive = rate === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => applyRate(s)}
                      aria-pressed={isActive}
                      className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                        isActive ? "" : "hover:bg-black/5 dark:hover:bg-white/5"
                      }`}
                      style={{
                        // Active = a filled pill that inverts the chrome colours,
                        // so it reads clearly on every reader theme.
                        color: isActive ? "var(--reader-chrome-bg)" : "var(--reader-text)",
                        backgroundColor: isActive ? "var(--reader-text)" : undefined,
                      }}
                    >
                      {s}×
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  // ---- Web Speech fallback: button toggles play / stop ----
  return (
    <ChromeButton
      label={speaking ? "Stop narration" : "Listen"}
      active={speaking}
      onClick={handleSpeechToggle}
    />
  );
}

function ChromeButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${
        active ? "bg-black/10 dark:bg-white/15" : ""
      }`}
    >
      <HeadphonesIcon active={active} />
    </button>
  );
}

function HeadphonesIcon({ active }: { active: boolean }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={active ? "animate-pulse" : undefined}
    >
      <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
      <path d="M21 14v3a2 2 0 0 1-2 2h-1a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3zM3 14v3a2 2 0 0 0 2 2h1a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1H3z" />
    </svg>
  );
}
