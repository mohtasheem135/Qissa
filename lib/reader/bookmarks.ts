/**
 * Bookmark storage — a simple array of story IDs in localStorage.
 * Phase 1 has no reader accounts, so this is per-device.
 *
 * Phase 2 will migrate this into a `bookmarks` table keyed by auth.uid.
 * Until then the storage key is namespaced (`qissa:bookmarks`) so a
 * future migration can read and upload the local list on first sign-in.
 *
 * IMPORTANT: getBookmarks() returns a CACHED reference until the
 * underlying localStorage string changes. Required for
 * useSyncExternalStore — otherwise React thinks the snapshot changed
 * on every render and complains:
 *   "The result of getSnapshot should be cached to avoid an infinite loop"
 */

const STORAGE_KEY = "qissa:bookmarks";
const EMPTY: ReadonlyArray<string> = Object.freeze([]);

// `undefined` distinguishes "never read" from "read and got null".
let cachedRaw: string | null | undefined = undefined;
let cachedSnapshot: ReadonlyArray<string> = EMPTY;

function parseRaw(raw: string | null): ReadonlyArray<string> {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return EMPTY;
    const ids = parsed.filter((id): id is string => typeof id === "string");
    return ids.length === 0 ? EMPTY : Object.freeze(ids);
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

/**
 * Browser-safe getter. Returns the SAME array reference until the
 * underlying localStorage value changes. SSR returns the frozen EMPTY
 * array (a stable singleton).
 */
export function getBookmarks(): ReadonlyArray<string> {
  if (typeof window === "undefined") return EMPTY;
  const raw = readRaw();
  if (raw === cachedRaw) return cachedSnapshot;
  cachedRaw = raw;
  cachedSnapshot = parseRaw(raw);
  return cachedSnapshot;
}

export function isBookmarked(storyId: string): boolean {
  return getBookmarks().includes(storyId);
}

function writeBookmarks(next: ReadonlyArray<string>): void {
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

export function addBookmark(storyId: string): void {
  const current = getBookmarks();
  if (current.includes(storyId)) return;
  writeBookmarks([...current, storyId]);
}

export function removeBookmark(storyId: string): void {
  const current = getBookmarks();
  if (!current.includes(storyId)) return;
  writeBookmarks(current.filter((id) => id !== storyId));
}

export function toggleBookmark(storyId: string): boolean {
  if (isBookmarked(storyId)) {
    removeBookmark(storyId);
    return false;
  }
  addBookmark(storyId);
  return true;
}

/**
 * Light cross-tab change signal. Components that subscribe via
 * `subscribeBookmarks` re-render when any tab adds/removes a bookmark.
 * Built on the standard `storage` event plus a same-tab CustomEvent.
 */
const SAME_TAB_EVENT = "qissa:bookmarks-changed";

function emitChange(): void {
  window.dispatchEvent(new CustomEvent(SAME_TAB_EVENT));
}

export function subscribeBookmarks(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      // Invalidate the cache so the next getBookmarks() re-reads.
      cachedRaw = undefined;
      listener();
    }
  };
  const onSameTab = () => {
    // writeBookmarks() already updated the cache; just notify.
    listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(SAME_TAB_EVENT, onSameTab);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SAME_TAB_EVENT, onSameTab);
  };
}
