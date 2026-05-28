# Internals — Reader State

> The reader has no backend persistence in Phase 1. Everything lives in `localStorage`. Files under [lib/reader/](../../lib/reader/).

---

## Storage keys

| Key | Shape | Written by | Read by |
|---|---|---|---|
| `qissa:reader-settings` | `ReaderSettings` JSON | [ReaderShell](../../components/reader/ReaderShell.tsx) | [ReaderShell](../../components/reader/ReaderShell.tsx) |
| `qissa:fontSize` | integer (14–32) | [ReaderShell](../../components/reader/ReaderShell.tsx) (A−/A+ + pinch) | [ReaderShell](../../components/reader/ReaderShell.tsx) |
| `qissa:progress:<storyId>:<partNumber>` | `{ scroll: 0..1, updatedAt: ISO }` | [ReaderShell](../../components/reader/ReaderShell.tsx) periodic save | [PartReadIndicator](../../components/shared/PartReadIndicator.tsx), [ReaderShell](../../components/reader/ReaderShell.tsx) restore |
| `qissa:last-read` | `{ storyId, partNumber, updatedAt }` | `savePartProgress()` | [ContinueReading](../../components/shared/ContinueReading.tsx), [InstallPrompt](../../components/shared/InstallPrompt.tsx) (gate) |
| `qissa:bookmarks` | string[] of story IDs | [bookmarks.ts](../../lib/reader/bookmarks.ts) | [BookmarkButton](../../components/shared/BookmarkButton.tsx), [BookmarksPage](../../app/(public)/bookmarks/page.tsx) |
| `qissa:vocab` | `VocabEntry[]` (`{ word, languageCode, savedAt, storyId?, variantSlug?, partNumber? }`) | [vocab.ts](../../lib/reader/vocab.ts) — written by the [DefinitionPopover](../../components/reader/DefinitionPopover.tsx) save toggle | [DefinitionPopover](../../components/reader/DefinitionPopover.tsx) header (saved-state badge), [MyWordsPage](../../app/(public)/my-words/page.tsx), bookmark page header counter |
| `qissa:highlights` | `Highlight[]` (`{ id, storyId, variantSlug, partNumber, paragraphIndex, colour, snippet, note?, createdAt }`) | [highlights.ts](../../lib/reader/highlights.ts) — written by the [HighlightMenu](../../components/reader/HighlightMenu.tsx) colour picker | [ReaderBody](../../components/reader/ReaderBody.tsx) (per-paragraph lookup + `data-highlight` attribute), [HighlightsPage](../../app/(public)/highlights/page.tsx), bookmark page header counter |
| `qissa:installPromptDismissedAt` | epoch ms | [InstallPrompt](../../components/shared/InstallPrompt.tsx) | itself |

---

## The two helpers

### [lib/reader/bookmarks.ts](../../lib/reader/bookmarks.ts)

```ts
function getBookmarks(): ReadonlyArray<string>   // cached snapshot
function isBookmarked(id: string): boolean
function addBookmark(id: string): void
function removeBookmark(id: string): void
function toggleBookmark(id: string): boolean
function subscribeBookmarks(listener: () => void): () => void
```

Two non-obvious things:

1. **Cached snapshot.** `getBookmarks()` returns the SAME `ReadonlyArray<string>` reference until the underlying localStorage string changes. This is required by `useSyncExternalStore` — returning a fresh array each call infinite-loops with:
   > "The result of getSnapshot should be cached to avoid an infinite loop"

   Implementation:
   ```ts
   let cachedRaw: string | null | undefined = undefined;
   let cachedSnapshot: ReadonlyArray<string> = EMPTY;

   export function getBookmarks(): ReadonlyArray<string> {
     if (typeof window === "undefined") return EMPTY;
     const raw = readRaw();
     if (raw === cachedRaw) return cachedSnapshot;
     cachedRaw = raw;
     cachedSnapshot = parseRaw(raw);
     return cachedSnapshot;
   }
   ```

   `EMPTY` is a frozen module-level singleton — both SSR and the empty-data case return the same reference. SSR + client snapshots both call `getBookmarks` (no separate empty-server function).

2. **Cross-tab sync.** `subscribeBookmarks(listener)` listens to both:
   - Native `storage` event (fired when ANOTHER tab writes to the same localStorage key)
   - Same-tab `CustomEvent("qissa:bookmarks-changed")` dispatched by `writeBookmarks()`

   Two BookmarkButton instances in the same tab (story landing + reader top bar) stay synced via the CustomEvent; tabs sync via `storage`.

### [lib/reader/vocab.ts](../../lib/reader/vocab.ts)

Same shape as `bookmarks.ts` — cached snapshot for `useSyncExternalStore` + cross-tab sync via the `qissa:vocab-changed` CustomEvent + the native `storage` event:

```ts
function getVocab(): ReadonlyArray<VocabEntry>
function isWordSaved(word, languageCode): boolean
function saveWord(entry: Omit<VocabEntry, "savedAt">): void
function removeWord(word, languageCode): void
function toggleWord(entry: Omit<VocabEntry, "savedAt">): boolean
function subscribeVocab(listener: () => void): () => void
```

`VocabEntry` carries `{ word, languageCode, savedAt, storyId?, variantSlug?, partNumber? }`. The optional context fields let [/my-words](../../app/(public)/my-words/page.tsx) deep-link back to the reader page where the word was tapped. Entries dedupe on `(languageCode, word)`.

### [lib/reader/highlights.ts](../../lib/reader/highlights.ts)

Same shape as `bookmarks.ts` + `vocab.ts` — cached snapshot for `useSyncExternalStore` + cross-tab sync via the `qissa:highlights-changed` CustomEvent + the native `storage` event:

```ts
function getHighlights(): ReadonlyArray<Highlight>
function getHighlightsForPart(storyId, variantSlug, partNumber): ReadonlyArray<Highlight>
function getHighlightForParagraph(storyId, variantSlug, partNumber, paragraphIndex): Highlight | undefined
function saveHighlight(input: SaveHighlightInput): Highlight
function removeHighlight(id: string): void
function subscribeHighlights(listener: () => void): () => void
```

`Highlight` carries `{ id, storyId, variantSlug, partNumber, paragraphIndex, colour, snippet, note?, createdAt }`. Identity is the composite key `${storyId}:${variantSlug}:${partNumber}:${paragraphIndex}` — re-highlighting the same paragraph updates colour/note in place rather than appending. `snippet` is the first ~140 chars of the paragraph captured at first save so [/highlights](../../app/(public)/highlights/page.tsx) can show context without a follow-up DB query; `createdAt` survives colour/note edits so the index ordering stays stable.

### [lib/reader/progress.ts](../../lib/reader/progress.ts)

```ts
function getPartProgress(storyId, partNumber): PartProgress | null
function getPartReadStatus(storyId, partNumber): "unread" | "in-progress" | "read"
function savePartProgress(storyId, partNumber, scroll: 0..1): void   // also updates qissa:last-read
function getLastRead(): LastRead | null
export const PROGRESS_CHANGED_EVENT = "qissa:progress-changed";
```

`savePartProgress` writes the per-part progress row, updates the last-read pointer, AND dispatches `PROGRESS_CHANGED_EVENT`. The [PartReadIndicator](../../components/shared/PartReadIndicator.tsx) subscribes to that event so indicators flip live as the user scrolls — no full refresh needed.

`getPartReadStatus` thresholds:
- `scroll < 0.02` → "unread"
- `scroll >= 0.95` → "read"
- everything else → "in-progress"

(`getPartReadStatus` returns a string, which `Object.is`-compares cleanly — no cached-snapshot machinery needed.)

---

## Reader settings — [reader-settings.ts](../../lib/reader/reader-settings.ts)

```ts
type ReaderSettings = {
  theme: "day" | "sepia" | "night" | "gray" | "focus";
  lineHeight: "compact" | "normal" | "relaxed";
  alignment: "left" | "justify";
  fontVariant: "sans" | "serif";
  showOriginal: boolean;
};

const DEFAULT_SETTINGS = { theme: "day", lineHeight: "normal", alignment: "justify", fontVariant: "serif", showOriginal: false };

function getReaderSettings(): ReaderSettings
function saveReaderSettings(next: ReaderSettings): void
```

Whole blob is one localStorage key (`qissa:reader-settings`). On `getReaderSettings`, missing fields fall back to defaults — so adding a new field later doesn't break existing users.

**Hydration gate.** [ReaderShell](../../components/reader/ReaderShell.tsx) holds a `hydratedRef = useRef(false)` and only flips it to `true` after the mount-time microtask has copied the persisted blob into state. The `useEffect` that calls `saveReaderSettings(settings)` early-returns until the ref is set. Without this gate the default-state render (which fires *before* the microtask) would round-trip defaults to localStorage, blowing away the user's theme/font/etc on every part navigation — the bug that motivated this comment.

`LINE_HEIGHT_VALUES = { compact: 1.4, normal: 1.65, relaxed: 1.9 }` — used directly in [ReaderBody](../../components/reader/ReaderBody.tsx) `style.lineHeight`.

---

## Font size — [font-size.ts](../../lib/reader/font-size.ts)

```ts
const MIN_FONT_SIZE = 14;
const MAX_FONT_SIZE = 32;
const STEP_FONT_SIZE = 2;
const DEFAULT_FONT_SIZE = 18;
function clampFontSize(value): number
function getFontSize(): number
function saveFontSize(value): void
```

Why a separate key from `reader-settings`: A−/A+ buttons + pinch-zoom hit it constantly. Persisting the whole settings blob on every keystroke is wasteful when only one field changes.

---

## Themes — [themes.ts](../../lib/reader/themes.ts)

5 themes (Day / Sepia / Night / Gray / Focus), each a `ThemeVars` object of CSS custom-property values:

```ts
{
  "--reader-bg": "#FFFFFF",
  "--reader-text": "#1A1A1A",
  "--reader-text-muted": "#666666",
  "--reader-accent": "#4F46E5",
  "--reader-chrome-bg": "rgba(255, 255, 255, 0.92)",
  "--reader-chrome-border": "rgba(0, 0, 0, 0.08)",
  "--reader-focus-dim": "1",
}
```

`themeStyle(theme)` projects onto a `style` prop applied to the outer wrapper in [ReaderShell](../../components/reader/ReaderShell.tsx). Body, chrome, progress bar, A-/A+ buttons all consume via `var(--reader-…)`.

The **Focus** theme uses the same colors as Day, but sets `--reader-focus-dim: 0.25`. CSS in [globals.css](../../app/globals.css) dims non-active paragraphs to that opacity (`data-theme="focus"` on the article + per-paragraph `data-focus="active"` selection logic).

---

## Per-language Google Fonts — [google-fonts.ts](../../lib/reader/google-fonts.ts)

`googleFontsUrlForLanguage(code)` returns the right Google Fonts stylesheet URL for a language, or null (English falls back to fonts loaded via `next/font` in the root layout).

```ts
const FAMILIES_BY_LANGUAGE: Record<string, ReadonlyArray<string>> = {
  hi: ["Tiro Devanagari Hindi", "Noto Sans Devanagari", "Noto Serif Devanagari"],
  ur: ["Noto Nastaliq Urdu"],
  ar: ["Noto Naskh Arabic", "Amiri"],
  // ... 9 more
};
```

The reader page emits `<link rel="stylesheet" href={url}>` in JSX. Next 16's React-19 stylesheet hoisting moves it into `<head>`.

This map MUST stay in sync with the seeded `languages.font_family` / `font_family_reading` columns ([04-database.md](../04-database.md) §6).

---

## Paragraph pairing — [paragraphs.ts](../../lib/reader/paragraphs.ts)

```ts
function splitParagraphs(text: string): string[]
function pairParagraphs(original: string, translated: string): PairedParagraph[]
```

Both split on `\n{2,}` (blank-line separated). `pairParagraphs` zips by index; mismatched counts surface orphans alone rather than dropping content. Used in [ReaderBody](../../components/reader/ReaderBody.tsx) for the "Show original" toggle.

The AI prompt explicitly instructs "preserve paragraph breaks exactly (one paragraph in = one paragraph out)" so in practice counts match.

---

## Story-card query shape — [story-cards.ts](../../lib/reader/story-cards.ts)

```ts
export const STORY_CARD_COLUMNS = `id, title_original, title_translated, cover_image_url, total_parts,
  estimated_reading_minutes, published_at,
  language:languages!inner ( name_english, font_family, font_family_reading ),
  tone:tones!inner ( name )` as const;

export function toStoryCard(row: ...): StoryCardData;
```

Every public listing page (home, subcategory, search, bookmarks) uses this constant + mapping. Adding a column to cards = touch one file.

---

## Phase 2 migration path

When user accounts ship in Phase 2:

| Today | Tomorrow |
|---|---|
| `qissa:bookmarks` | `bookmarks` table keyed by `auth.uid` |
| `qissa:progress:*` | `reading_progress` table keyed by `(user_id, story_id, part_number)` |
| `qissa:last-read` | derived from `reading_progress` (max `updated_at`) |
| `qissa:reader-settings` + `qissa:fontSize` | `user_preferences` JSON column on `profiles` |

The localStorage helpers are intentionally namespaced (`qissa:*`) so a one-shot migration script on first sign-in can read the local lists and upload them to the new tables before clearing them. No data is lost.
