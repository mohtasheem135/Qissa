/**
 * Saved-word storage for the tap-to-define popover. Mirrors the bookmark
 * pattern in [bookmarks.ts]: same cross-tab subscription, same cached-snapshot
 * contract for `useSyncExternalStore`. Entries are keyed by
 * `<languageCode>:<word>` so the same word in two languages can coexist.
 *
 * Phase 2 will migrate this into a `vocab` table keyed by auth.uid when reader
 * accounts arrive. The localStorage key stays namespaced (`qissa:vocab`) so
 * a future migration can read and upload the local list on first sign-in.
 */

const STORAGE_KEY = "qissa:vocab";

export interface VocabEntry {
  /** The exact word the reader tapped, lower-cased for Indic scripts where
   * case doesn't apply but kept verbatim for scripts where it does. */
  word: string;
  /** ISO 639-1-ish language code at the time of saving (e.g. "hi"). */
  languageCode: string;
  /** ISO timestamp of when the reader saved it. */
  savedAt: string;
  /** Optional context for the saved page. */
  storyId?: string;
  variantSlug?: string;
  partNumber?: number;
}

const EMPTY: ReadonlyArray<VocabEntry> = Object.freeze([]);

let cachedRaw: string | null | undefined = undefined;
let cachedSnapshot: ReadonlyArray<VocabEntry> = EMPTY;

function parseRaw(raw: string | null): ReadonlyArray<VocabEntry> {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return EMPTY;
    const out: VocabEntry[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const r = item as Record<string, unknown>;
      const word = typeof r.word === "string" ? r.word : null;
      const languageCode = typeof r.languageCode === "string" ? r.languageCode : null;
      const savedAt = typeof r.savedAt === "string" ? r.savedAt : null;
      if (!word || !languageCode || !savedAt) continue;
      out.push({
        word,
        languageCode,
        savedAt,
        storyId: typeof r.storyId === "string" ? r.storyId : undefined,
        variantSlug: typeof r.variantSlug === "string" ? r.variantSlug : undefined,
        partNumber: typeof r.partNumber === "number" ? r.partNumber : undefined,
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

/** Browser-safe getter. Same cached-reference contract as [getBookmarks]. */
export function getVocab(): ReadonlyArray<VocabEntry> {
  if (typeof window === "undefined") return EMPTY;
  const raw = readRaw();
  if (raw === cachedRaw) return cachedSnapshot;
  cachedRaw = raw;
  cachedSnapshot = parseRaw(raw);
  return cachedSnapshot;
}

function key(word: string, languageCode: string): string {
  return `${languageCode.toLowerCase()}:${word}`;
}

export function isWordSaved(word: string, languageCode: string): boolean {
  const target = key(word, languageCode);
  return getVocab().some((e) => key(e.word, e.languageCode) === target);
}

function writeVocab(next: ReadonlyArray<VocabEntry>): void {
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

export function saveWord(entry: Omit<VocabEntry, "savedAt">): void {
  const target = key(entry.word, entry.languageCode);
  const current = getVocab();
  // De-dupe: if already saved, leave the existing savedAt + context alone.
  if (current.some((e) => key(e.word, e.languageCode) === target)) return;
  writeVocab([
    ...current,
    {
      ...entry,
      savedAt: new Date().toISOString(),
    },
  ]);
}

export function removeWord(word: string, languageCode: string): void {
  const target = key(word, languageCode);
  const current = getVocab();
  const next = current.filter((e) => key(e.word, e.languageCode) !== target);
  if (next.length === current.length) return;
  writeVocab(next);
}

export function toggleWord(entry: Omit<VocabEntry, "savedAt">): boolean {
  if (isWordSaved(entry.word, entry.languageCode)) {
    removeWord(entry.word, entry.languageCode);
    return false;
  }
  saveWord(entry);
  return true;
}

const SAME_TAB_EVENT = "qissa:vocab-changed";

function emitChange(): void {
  window.dispatchEvent(new CustomEvent(SAME_TAB_EVENT));
}

export function subscribeVocab(listener: () => void): () => void {
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
