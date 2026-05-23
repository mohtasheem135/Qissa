"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: ReadonlyArray<string>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = "qissa:installPromptDismissedAt";
const DISMISS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const LAST_READ_KEY = "qissa:last-read";

/**
 * Custom install banner.
 *
 * Gating rules (per docs/03-implementation-plan.md §Phase 10.D):
 *   - User has read at least one story (qissa:last-read exists)
 *   - User hasn't dismissed in the last 7 days
 *   - Browser fired `beforeinstallprompt`
 *
 * Renders nothing pre-hydration and on hosts that don't fire the
 * event (iOS Safari, desktop without PWA support).
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Hard skip if already installed (Chrome reports this via display-mode).
    if (window.matchMedia?.("(display-mode: standalone)").matches) return;

    const dismissedAt = Number(window.localStorage.getItem(DISMISS_KEY) ?? "0");
    if (Date.now() - dismissedAt < DISMISS_WINDOW_MS) return;

    const hasReadAStory = window.localStorage.getItem(LAST_READ_KEY) !== null;
    if (!hasReadAStory) return;

    function onBeforeInstall(event: Event) {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  if (!deferred) return null;

  async function handleInstall() {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } finally {
      // Either path — mark dismissed so we don't re-prompt for a week.
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
      setDeferred(null);
    }
  }

  function handleDismiss() {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDeferred(null);
  }

  return (
    <div
      role="dialog"
      aria-labelledby="install-prompt-title"
      className="bg-card fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-start gap-3 rounded-lg border p-4 shadow-lg md:bottom-6"
    >
      <span className="text-2xl" aria-hidden>
        📖
      </span>
      <div className="flex-1 space-y-2">
        <p id="install-prompt-title" className="text-sm font-medium">
          Install Qissa for offline reading
        </p>
        <p className="text-muted-foreground text-xs">
          Add Qissa to your home screen — works offline once a story is opened.
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleInstall}>
            Install
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDismiss}>
            Not now
          </Button>
        </div>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss install prompt"
        className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 p-1 text-lg leading-none"
      >
        ×
      </button>
    </div>
  );
}
