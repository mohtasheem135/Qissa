/**
 * Selection-range highlight storage for the reader. Mirrors [bookmarks.ts] +
 * [vocab.ts]: cached snapshot for `useSyncExternalStore`, cross-tab sync via
 * the `qissa:highlights-changed` CustomEvent + native `storage` event.
 *
 * A highlight marks an **exact character range** inside one paragraph:
 * (storyId, variantSlug, partNumber, paragraphIndex, startOffset, endOffset).
 * Offsets are indices into that paragraph's translated text. A selection that
 * spans several paragraphs is stored as one highlight per paragraph it touches
 * (see lib/reader/selection.ts). Multiple highlights per paragraph are allowed.
 *
 * `snippet` (the highlighted text, ≤140 chars) is captured at save time so the
 * /highlights index can show context without re-deriving it. If the underlying
 * translation is later regenerated and offsets drift, the snippet stays
 * accurate even though the on-page span may shift — acceptable for v1.
 *
 * Phase 2 will migrate this into a `highlights` table keyed by auth.uid when
 * reader accounts arrive; the localStorage key stays namespaced
 * (`qissa:highlights`) so the migration can read + upload the local list.
 */

const STORAGE_KEY = "qissa:highlights";
const SNIPPET_MAX = 140;

export type HighlightColour = "yellow" | "green" | "blue";

export const HIGHLIGHT_COLOURS: ReadonlyArray<HighlightColour> = ["yellow", "green", "blue"];

export interface Highlight {
  /** Stable random id (one per stored range). */
  id: string;
  storyId: string;
  variantSlug: string;
  partNumber: number;
  paragraphIndex: number;
  /** Inclusive char offset of the range start within the paragraph's text. */
  startOffset: number;
  /** Exclusive char offset of the range end. */
  endOffset: number;
  colour: HighlightColour;
  /** The highlighted text (≤140 chars), captured at save time for the index. */
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
      // Records without offsets are the old paragraph-level model — dropped
      // (the reader opted into selection highlights, replacing those).
      const startOffset = typeof r.startOffset === "number" ? r.startOffset : null;
      const endOffset = typeof r.endOffset === "number" ? r.endOffset : null;
      const colour = isColour(r.colour) ? r.colour : null;
      const snippet = typeof r.snippet === "string" ? r.snippet : null;
      const createdAt = typeof r.createdAt === "string" ? r.createdAt : null;
      if (
        !id ||
        !storyId ||
        !variantSlug ||
        partNumber === null ||
        paragraphIndex === null ||
        startOffset === null ||
        endOffset === null ||
        endOffset <= startOffset ||
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
        startOffset,
        endOffset,
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

/**
 * Server snapshot for `useSyncExternalStore` — always `EMPTY`. Highlights live
 * only in localStorage, so the server renders none; React also calls this for
 * the client's hydration render, so returning `getHighlights` here (which reads
 * real localStorage on the client) would render `<mark>`s during hydration and
 * mismatch the plain-text server HTML. Returning `EMPTY` keeps hydration in sync
 * and the real highlights paint in on the very next commit.
 */
export function getServerHighlights(): ReadonlyArray<Highlight> {
  return EMPTY;
}

export function getHighlightsForPart(
  storyId: string,
  variantSlug: string,
  partNumber: number,
): ReadonlyArray<Highlight> {
  return getHighlights().filter(
    (h) => h.storyId === storyId && h.variantSlug === variantSlug && h.partNumber === partNumber,
  );
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

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export interface AddHighlightInput {
  storyId: string;
  variantSlug: string;
  partNumber: number;
  paragraphIndex: number;
  startOffset: number;
  endOffset: number;
  colour: HighlightColour;
  /** The selected text — captured (trimmed, truncated) as the snippet. */
  text: string;
  note?: string;
}

/** Create a new highlight for a selected range. Returns the stored row. */
export function addHighlight(input: AddHighlightInput): Highlight {
  const next: Highlight = {
    id: newId(),
    storyId: input.storyId,
    variantSlug: input.variantSlug,
    partNumber: input.partNumber,
    paragraphIndex: input.paragraphIndex,
    startOffset: input.startOffset,
    endOffset: input.endOffset,
    colour: input.colour,
    snippet: input.text.trim().slice(0, SNIPPET_MAX),
    note: input.note?.trim() ? input.note.trim() : undefined,
    createdAt: new Date().toISOString(),
  };
  writeHighlights([...getHighlights(), next]);
  return next;
}

/** Patch an existing highlight's colour and/or note. */
export function updateHighlight(
  id: string,
  patch: { colour?: HighlightColour; note?: string | null },
): void {
  const current = getHighlights();
  let changed = false;
  const next = current.map((h) => {
    if (h.id !== id) return h;
    changed = true;
    return {
      ...h,
      colour: patch.colour ?? h.colour,
      note:
        patch.note === undefined
          ? h.note
          : patch.note && patch.note.trim().length > 0
            ? patch.note.trim()
            : undefined,
    };
  });
  if (changed) writeHighlights(next);
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
