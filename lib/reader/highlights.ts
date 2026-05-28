/**
 * Per-paragraph highlight storage for the reader. Mirrors [bookmarks.ts] +
 * [vocab.ts]: cached snapshot for `useSyncExternalStore`, cross-tab sync via
 * the `qissa:highlights-changed` CustomEvent + native `storage` event.
 *
 * Highlights are keyed by (storyId, variantSlug, partNumber, paragraphIndex) —
 * one highlight per paragraph max. Re-highlighting the same paragraph
 * replaces the existing colour/note instead of adding a duplicate.
 *
 * A `snippet` (first ~120 chars of the paragraph) is captured at save time
 * so the /highlights index can show context without a follow-up DB query.
 * If the underlying translation is later regenerated and paragraphs shift,
 * the snippet stays accurate even though the deep-link target may have
 * drifted — acceptable for v0.
 *
 * Phase 2 will migrate this into a `highlights` table keyed by auth.uid
 * when reader accounts arrive. The localStorage key stays namespaced
 * (`qissa:highlights`) so the future migration can read and upload the
 * local list on first sign-in.
 */

const STORAGE_KEY = "qissa:highlights";
const SNIPPET_MAX = 140;

export type HighlightColour = "yellow" | "green" | "blue";

export const HIGHLIGHT_COLOURS: ReadonlyArray<HighlightColour> = [
  "yellow",
  "green",
  "blue",
];

export interface Highlight {
  /** Stable identity: `${storyId}:${variantSlug}:${partNumber}:${paragraphIndex}`. */
  id: string;
  storyId: string;
  variantSlug: string;
  partNumber: number;
  paragraphIndex: number;
  colour: HighlightColour;
  /** First ~140 chars of the paragraph, captured at save time for the index page. */
  snippet: string;
  note?: string;
  /** ISO timestamp of first save (not updated on colour/note edits). */
  createdAt: string;
}

const EMPTY: ReadonlyArray<Highlight> = Object.freeze([]);

let cachedRaw: string | null | undefined = undefined;
let cachedSnapshot: ReadonlyArray<Highlight> = EMPTY;

function isColour(value: unknown): value is HighlightColour {
  return value === "yellow" || value === "green" || value === "blue";
}

function parseRaw(raw: string | null): ReadonlyArray<Highlight> {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return EMPTY;
    const out: Highlight[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const r = item as Record<string, unknown>;
      const id = typeof r.id === "string" ? r.id : null;
      const storyId = typeof r.storyId === "string" ? r.storyId : null;
      const variantSlug = typeof r.variantSlug === "string" ? r.variantSlug : null;
      const partNumber = typeof r.partNumber === "number" ? r.partNumber : null;
      const paragraphIndex = typeof r.paragraphIndex === "number" ? r.paragraphIndex : null;
      const colour = isColour(r.colour) ? r.colour : null;
      const snippet = typeof r.snippet === "string" ? r.snippet : null;
      const createdAt = typeof r.createdAt === "string" ? r.createdAt : null;
      if (
        !id ||
        !storyId ||
        !variantSlug ||
        partNumber === null ||
        paragraphIndex === null ||
        !colour ||
        snippet === null ||
        !createdAt
      ) {
        continue;
      }
      out.push({
        id,
        storyId,
        variantSlug,
        partNumber,
        paragraphIndex,
        colour,
        snippet,
        createdAt,
        note: typeof r.note === "string" && r.note.length > 0 ? r.note : undefined,
      });
    }
    return out.length === 0 ? EMPTY : Object.freeze(out);
  } catch {
    return EMPTY;
  }
}

function readRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Browser-safe getter. Same cached-reference contract as `getBookmarks`. */
export function getHighlights(): ReadonlyArray<Highlight> {
  if (typeof window === "undefined") return EMPTY;
  const raw = readRaw();
  if (raw === cachedRaw) return cachedSnapshot;
  cachedRaw = raw;
  cachedSnapshot = parseRaw(raw);
  return cachedSnapshot;
}

export function highlightId(
  storyId: string,
  variantSlug: string,
  partNumber: number,
  paragraphIndex: number,
): string {
  return `${storyId}:${variantSlug}:${partNumber}:${paragraphIndex}`;
}

export function getHighlightsForPart(
  storyId: string,
  variantSlug: string,
  partNumber: number,
): ReadonlyArray<Highlight> {
  return getHighlights().filter(
    (h) =>
      h.storyId === storyId &&
      h.variantSlug === variantSlug &&
      h.partNumber === partNumber,
  );
}

export function getHighlightForParagraph(
  storyId: string,
  variantSlug: string,
  partNumber: number,
  paragraphIndex: number,
): Highlight | undefined {
  const target = highlightId(storyId, variantSlug, partNumber, paragraphIndex);
  return getHighlights().find((h) => h.id === target);
}

function writeHighlights(next: ReadonlyArray<Highlight>): void {
  if (typeof window === "undefined") return;
  try {
    const json = JSON.stringify(next);
    window.localStorage.setItem(STORAGE_KEY, json);
    cachedRaw = json;
    cachedSnapshot = next.length === 0 ? EMPTY : Object.freeze([...next]);
  } catch {
    return;
  }
  emitChange();
}

export interface SaveHighlightInput {
  storyId: string;
  variantSlug: string;
  partNumber: number;
  paragraphIndex: number;
  colour: HighlightColour;
  text: string;
  note?: string;
}

/**
 * Insert or update the highlight for a paragraph. When an existing highlight
 * for the same (storyId, variantSlug, partNumber, paragraphIndex) is present,
 * the colour and note are updated but `createdAt` and `snippet` stay
 * (snippet stays so paragraph re-flows don't silently invalidate index
 * previews; createdAt stays so the ordering on /highlights is stable).
 */
export function saveHighlight(input: SaveHighlightInput): Highlight {
  const id = highlightId(
    input.storyId,
    input.variantSlug,
    input.partNumber,
    input.paragraphIndex,
  );
  const current = getHighlights();
  const existing = current.find((h) => h.id === id);

  const next: Highlight = existing
    ? {
        ...existing,
        colour: input.colour,
        note: input.note?.trim() ? input.note.trim() : undefined,
      }
    : {
        id,
        storyId: input.storyId,
        variantSlug: input.variantSlug,
        partNumber: input.partNumber,
        paragraphIndex: input.paragraphIndex,
        colour: input.colour,
        snippet: input.text.trim().slice(0, SNIPPET_MAX),
        note: input.note?.trim() ? input.note.trim() : undefined,
        createdAt: new Date().toISOString(),
      };

  writeHighlights(
    existing ? current.map((h) => (h.id === id ? next : h)) : [...current, next],
  );
  return next;
}

export function removeHighlight(id: string): void {
  const current = getHighlights();
  const next = current.filter((h) => h.id !== id);
  if (next.length === current.length) return;
  writeHighlights(next);
}

const SAME_TAB_EVENT = "qissa:highlights-changed";

function emitChange(): void {
  window.dispatchEvent(new CustomEvent(SAME_TAB_EVENT));
}

export function subscribeHighlights(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      cachedRaw = undefined;
      listener();
    }
  };
  const onSameTab = () => listener();
  window.addEventListener("storage", onStorage);
  window.addEventListener(SAME_TAB_EVENT, onSameTab);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SAME_TAB_EVENT, onSameTab);
  };
}
