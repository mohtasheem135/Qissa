/**
 * Reading progress + last-read tracking, in localStorage.
 *
 * Variant-aware: each (story, variant, part) tracks its own scroll. Switching
 * variants of the same story does NOT carry progress over.
 *
 * Keys:
 *   qissa:progress:<storyId>:<variantSlug>:<partNumber>  -> PartProgress
 *   qissa:last-read                                       -> LastRead
 */

const PROGRESS_PREFIX = "qissa:progress:";
const LAST_READ_KEY = "qissa:last-read";

export interface PartProgress {
  scroll: number; // 0..1
  updatedAt: string;
}

export interface LastRead {
  storyId: string;
  variantSlug: string;
  partNumber: number;
  updatedAt: string;
}

export type ReadStatus = "unread" | "in-progress" | "read";

const READ_THRESHOLD = 0.95;

function progressKey(storyId: string, variantSlug: string, partNumber: number): string {
  return `${PROGRESS_PREFIX}${storyId}:${variantSlug}:${partNumber}`;
}

export function getPartProgress(
  storyId: string,
  variantSlug: string,
  partNumber: number,
): PartProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(progressKey(storyId, variantSlug, partNumber));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "scroll" in parsed &&
      typeof (parsed as PartProgress).scroll === "number"
    ) {
      return parsed as PartProgress;
    }
    return null;
  } catch {
    return null;
  }
}

export function getPartReadStatus(
  storyId: string,
  variantSlug: string,
  partNumber: number,
): ReadStatus {
  const progress = getPartProgress(storyId, variantSlug, partNumber);
  if (!progress) return "unread";
  if (progress.scroll >= READ_THRESHOLD) return "read";
  if (progress.scroll > 0.02) return "in-progress";
  return "unread";
}

export function savePartProgress(
  storyId: string,
  variantSlug: string,
  partNumber: number,
  scroll: number,
): void {
  if (typeof window === "undefined") return;
  const clamped = Math.max(0, Math.min(1, scroll));
  const payload: PartProgress = { scroll: clamped, updatedAt: new Date().toISOString() };
  try {
    window.localStorage.setItem(
      progressKey(storyId, variantSlug, partNumber),
      JSON.stringify(payload),
    );
    const lastRead: LastRead = {
      storyId,
      variantSlug,
      partNumber,
      updatedAt: payload.updatedAt,
    };
    window.localStorage.setItem(LAST_READ_KEY, JSON.stringify(lastRead));
  } catch {
    // localStorage full / disabled — silently ignore. Reading still works.
  }
  // Notify same-tab subscribers (PartReadIndicator, ContinueReading).
  window.dispatchEvent(new CustomEvent(SAME_TAB_EVENT));
}

/**
 * Same-tab change signal. PartReadIndicator and ContinueReading subscribe
 * via this event + the cross-tab `storage` event.
 */
export const PROGRESS_CHANGED_EVENT = "qissa:progress-changed" as const;
const SAME_TAB_EVENT = PROGRESS_CHANGED_EVENT;

export function getLastRead(): LastRead | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_READ_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "storyId" in parsed &&
      "variantSlug" in parsed &&
      "partNumber" in parsed &&
      typeof (parsed as LastRead).storyId === "string" &&
      typeof (parsed as LastRead).variantSlug === "string"
    ) {
      return parsed as LastRead;
    }
    return null;
  } catch {
    return null;
  }
}
