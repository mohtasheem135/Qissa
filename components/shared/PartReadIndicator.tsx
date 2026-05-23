"use client";

import { useSyncExternalStore } from "react";
import {
  getPartReadStatus,
  PROGRESS_CHANGED_EVENT,
  type ReadStatus,
} from "@/lib/reader/progress";

interface PartReadIndicatorProps {
  storyId: string;
  partNumber: number;
}

function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key && event.key.startsWith("qissa:progress:")) listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(PROGRESS_CHANGED_EVENT, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(PROGRESS_CHANGED_EVENT, listener);
  };
}

/**
 * Tiny per-part read indicator. Reads localStorage progress and renders
 * one of three icons. SSR snapshot is always "unread" — the icon may
 * flip once after hydration if there is progress for this part, no
 * hydration mismatch because both render the same SSR HTML.
 */
export function PartReadIndicator({ storyId, partNumber }: PartReadIndicatorProps) {
  const status = useSyncExternalStore(
    subscribe,
    () => getPartReadStatus(storyId, partNumber),
    () => "unread" as ReadStatus,
  );

  if (status === "read") {
    return (
      <span
        aria-label="Read"
        className="text-primary inline-flex h-5 w-5 items-center justify-center text-base"
      >
        ✓
      </span>
    );
  }
  if (status === "in-progress") {
    return (
      <span
        aria-label="In progress"
        className="bg-primary/40 inline-block h-2 w-2 rounded-full"
      />
    );
  }
  return (
    <span
      aria-label="Unread"
      className="border-muted-foreground/40 inline-block h-2 w-2 rounded-full border"
    />
  );
}
