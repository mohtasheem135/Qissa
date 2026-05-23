/**
 * Bookmark storage — a simple array of story IDs in localStorage.
 * Phase 1 has no reader accounts, so this is per-device.
 *
 * Phase 2 will migrate this into a `bookmarks` table keyed by auth.uid.
 * Until then the storage key is namespaced (`qissa:bookmarks`) so a
 * future migration can read and upload the local list on first sign-in.
 */

const STORAGE_KEY = "qissa:bookmarks";

/**
 * Browser-safe getter. SSR returns an empty array — Client Components
 * should call this from useEffect / useSyncExternalStore to avoid
 * hydration mismatches.
 */
export function getBookmarks(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export function isBookmarked(storyId: string): boolean {
  return getBookmarks().includes(storyId);
}

export function addBookmark(storyId: string): void {
  if (typeof window === "undefined") return;
  const current = getBookmarks();
  if (current.includes(storyId)) return;
  const next = [...current, storyId];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  emitChange();
}

export function removeBookmark(storyId: string): void {
  if (typeof window === "undefined") return;
  const current = getBookmarks();
  if (!current.includes(storyId)) return;
  const next = current.filter((id) => id !== storyId);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  emitChange();
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
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(SAME_TAB_EVENT, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SAME_TAB_EVENT, listener);
  };
}
