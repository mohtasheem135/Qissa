# Reader UX fixes — title casing, persistent chrome, Browse tab, settings persistence, show-original default, loading states

## Context

Six reader-facing issues surfaced from a homepage screenshot + a usability pass:

1. **Title casing inconsistency.** Some stories were ingested with ALL-CAPS titles (`KING BEAN`, `THE DANCING WATER, THE SINGING APPLE, AND THE…`). Admin-entered DB values are the source of truth, but reader surfaces should normalize to per-word Title Case ("first letter capital, rest small") for visual consistency.
2. **Reader chrome auto-hides.** Top/bottom bars hide after 3s of idle in [components/reader/ReaderShell.tsx](components/reader/ReaderShell.tsx#L138-L155), forcing readers to touch the screen to reveal navigation. The user wants chrome always visible.
3. **Mobile "Browse" tab is dead.** In [components/shared/PublicShell.tsx:108](components/shared/PublicShell.tsx#L108), Browse's `href` is silently rewritten to `/` on mobile because `/browse` doesn't exist — so tapping Browse just goes Home. User chose: create a real `/browse` page that lists all categories.
4. **Reader settings reset on every part navigation.** There's a real persistence bug (not what an initial scan suggested): the save-effect at [ReaderShell.tsx:112-116](components/reader/ReaderShell.tsx#L112-L116) writes the *default* settings to localStorage synchronously on mount — *before* the hydration microtask at line 90 reads localStorage. Result: every fresh mount of `ReaderShell` (every part navigation, every refresh) overwrites the user's saved preferences with defaults, then "hydrates" by reading those same defaults back. The comment says "Skip first render" but the code doesn't.
5. **Source/original text hidden by default.** [lib/reader/reader-settings.ts:29](lib/reader/reader-settings.ts#L29) sets `showOriginal: false`, so readers only see the translation unless they dig into settings. The user wants the source to appear by default; the toggle stays so power users can hide it. Original text is always present in DB (NOT NULL `story_parts.text_original`), already paired per paragraph by [lib/reader/paragraphs.ts](lib/reader/paragraphs.ts), and already rendered (stacked, demoted styling) when the flag is on — so this is a one-line default change, no layout work.
6. **No loading feedback on navigation.** None of the public routes have `loading.tsx` Suspense boundaries; reader prev/next, story cards, variant select, and search all use plain `<Link>`/`router.push()` with no pending UI. Users click again because nothing visibly happens until the destination renders.

---

## Issue 1 — Title Case helper

### New file
- [lib/utils/title-case.ts](lib/utils/title-case.ts) — single export `toTitleCase(s: string): string`.
  - Lowercase the string, then capitalize the first letter of each whitespace-separated word (use `\p{L}` regex so it works with accented Latin chars; non-Latin scripts like Devanagari/Arabic are case-less so the function is a no-op for them — confirm with a quick check in the function body).
  - Trim safely; preserve internal punctuation (commas, ellipses) — they're not letters so the per-word capitalize logic ignores them.
  - Keep it tiny (~10 lines). No deps, no library.

### Apply at render in reader-facing surfaces only

| File | Line | Change |
|---|---|---|
| [components/shared/StoryCard.tsx](components/shared/StoryCard.tsx#L75) | 75 | Wrap `{story.title_translated ?? story.title_original}` with `toTitleCase(...)` |
| [app/(public)/s/[storyId]/page.tsx](app/(public)/s/[storyId]/page.tsx#L111) | 111 | Wrap the `<h1>` title |
| [app/(public)/s/[storyId]/page.tsx](app/(public)/s/[storyId]/page.tsx#L149) | 149, 174 | Wrap variant-card titles |
| [components/reader/ReaderChrome.tsx](components/reader/ReaderChrome.tsx#L233) | wherever `storyTitle` is rendered/passed | Wrap before passing to ShareButton |

**Do NOT touch:**
- Admin tables / forms ([components/admin/StoriesPanel.tsx](components/admin/StoriesPanel.tsx), [components/admin/VariantPanel.tsx](components/admin/VariantPanel.tsx)) — admin should see raw DB values
- Metadata `<title>` exports (search-engine surfaces) — leave the raw value so SEO matches DB
- The DB itself — no migration; this is a presentation-only normalization

Tailwind's `capitalize` class won't work — CSS `text-transform: capitalize` only capitalizes first letters, doesn't lowercase the rest, so `KING BEAN` stays `KING BEAN`.

---

## Issue 2 — Reader chrome always visible

[components/reader/ReaderShell.tsx](components/reader/ReaderShell.tsx):

- **Delete** the auto-hide `useEffect` at lines 138-155 (the one that sets a `setTimeout` to hide and adds `scroll/touchstart/mousemove` listeners).
- **Delete** the `showChromeBriefly` callback (lines 129-136), the `hideTimerRef` ref (line 75), and the `CHROME_HIDE_MS` constant (line 53) — all dead once auto-hide is gone.
- **Keep** `chromeVisible` state for now (initial `true`) and continue passing `visible={chromeVisible}` to `ReaderChrome` — leaves room for a future explicit toggle without rewiring. But since nothing flips it to `false` anymore, the bars stay visible permanently. The `settingsOpenRef` plumbing was only there for the auto-hide; remove that too (lines 76-81) along with the `settingsOpenRef.current` reads.
- **Keep** the visible-vs-hidden CSS in [ReaderChrome.tsx:74-158](components/reader/ReaderChrome.tsx#L74-L158) — harmless; just always renders in the visible state now.

### Layout follow-up (small but important)
With chrome permanently on screen, the reader body needs to clear the top + bottom bars so the first paragraph isn't hidden under the top bar and the last paragraph isn't hidden under the bottom bar. Check [components/reader/ReaderBody.tsx](components/reader/ReaderBody.tsx) — likely needs additional top/bottom padding (currently it probably assumed chrome would hide). Measure the bars (h-12 ish each based on the header markup) and add `pt-14 pb-14` (or whatever matches) so content has breathing room.

### Doc updates
- [docs/UI/reader.md](docs/UI/reader.md) line ~46 — remove "Auto-hide 3s; reset on scroll/touch/mousemove".
- [docs/INTERNALS/reader-state.md](docs/INTERNALS/reader-state.md) lines ~42-48 — drop the `chromeVisible` auto-hide note.

---

## Issue 3 — Real `/browse` page

### New file
[app/(public)/browse/page.tsx](app/(public)/browse/page.tsx) — server component, mirror the categories section from [app/(public)/page.tsx:99-113](app/(public)/page.tsx#L99-L113):

- Query the same `categories` + `subcategories!inner ( stories!inner ( id ) )` join used on home (extract that query into a tiny helper if it's worth deduping; otherwise inline copy is fine — three similar lines beats premature abstraction).
- Build the same `CategoryTileData[]` array with story counts.
- Render with `<CategoryTile>` in a grid. Add a short page header ("Browse stories" + subtitle).
- `export const revalidate = 60;` matching home.
- Add `metadata` export.

### Fix the mobile-only hack
[components/shared/PublicShell.tsx:108](components/shared/PublicShell.tsx#L108):
```ts
const href = item.href === "/browse" ? "/" : item.href;
```
Delete this line and use `item.href` directly. The matcher on line 24 already correctly highlights Browse for `/c/*` paths — extend it to also match `/browse` itself: `(p) => p === "/browse" || p.startsWith("/c")`.

Also revisit line 74's desktop nav: it currently filters out Browse on desktop (`item.href !== "/browse"`). With a real /browse page, we can include it on desktop too — but that's a small judgment call; default to keeping the filter so desktop nav stays compact unless the user wants Browse visible there.

### Doc updates
- [docs/UI/OVERVIEW.md](docs/UI/OVERVIEW.md) — add `/browse` to the routing tree.
- [docs/UI/public.md](docs/UI/public.md) — new section describing the browse page.

---

## Issue 4 — Reader settings persistence bug

**Root cause** (verified by re-reading [ReaderShell.tsx:84-116](components/reader/ReaderShell.tsx#L84-L116) carefully):

`useEffect`s fire in source order after commit:
1. The hydration effect at line 84 **queues a microtask** via `Promise.resolve().then(...)` — the microtask body hasn't run yet.
2. The save effect at line 112 runs **synchronously next** and calls `saveReaderSettings(settings)` where `settings` is still `DEFAULT_SETTINGS`. **localStorage is now overwritten with defaults.**
3. The microtask from step 1 finally runs, calls `getReaderSettings()`, reads the freshly-overwritten defaults, and "hydrates" state with them.

The user's saved theme/font/alignment/etc. is destroyed every time `ReaderShell` mounts.

### Fix
Add a hydration gate. In [components/reader/ReaderShell.tsx](components/reader/ReaderShell.tsx):

- Add a `hydratedRef = useRef(false)` near the other refs.
- In the hydration microtask (line 90's `Promise.resolve().then(...)`), set `hydratedRef.current = true` *after* the `setSettings`/`setFontSize` calls.
- Gate the save effect:
  ```ts
  useEffect(() => {
    if (!hydratedRef.current) return;
    saveReaderSettings(settings);
  }, [settings]);
  ```
- Remove the misleading comment that already claims this guard exists.

### Why a ref and not a state
Using a `hydrated` state would trigger an extra render and a hydration mismatch warning (server renders pre-hydration, client renders post-hydration). A ref doesn't trigger re-renders and keeps SSR HTML deterministic.

### Audit the sibling case — font size
[ReaderShell.tsx:119-123](components/reader/ReaderShell.tsx#L119-L123) `updateFontSize` only writes when explicitly called (A−/A+, pinch), so it doesn't have this bug. No change needed there.

### Doc update
- [docs/INTERNALS/reader-state.md](docs/INTERNALS/reader-state.md) — add a sentence in the hydration section about the `hydratedRef` gate and why (the bug history is worth one line of comment in the code too, since the failure mode is non-obvious).

---

## Issue 5 — Default `showOriginal` to true; keep toggle

Single-line behavior change. The rendering pipeline already supports it perfectly.

### Change
[lib/reader/reader-settings.ts:29](lib/reader/reader-settings.ts#L29):
```ts
export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: DEFAULT_THEME,
  lineHeight: "normal",
  alignment: "justify",
  fontVariant: "serif",
  showOriginal: true,   // was false
};
```

### Why nothing else needs to change
- [components/reader/ReaderBody.tsx](components/reader/ReaderBody.tsx) lines ~53-156 already conditionally render `p.original` below `p.translated` with demoted styling (smaller, italic, muted, left-border accent) when `showOriginal && p.original`. RTL handles via CSS logical props (`border-s-2 ps-3`) and `dir="auto"` on the original paragraph.
- [components/reader/ReaderSettings.tsx](components/reader/ReaderSettings.tsx) lines ~107-123 already render a "Show original text" switch wired to `settings.showOriginal`. The switch is automatically disabled when the part has no original (`!originalAvailable`), and helper copy already explains both states. With the default flipped, existing users who had previously toggled it off will keep their persisted `false` (the issue-4 fix preserves their choice). New users — and anyone who never touched the setting — get original on by default.
- Stacked layout (original below translated, per-paragraph) is preserved; we are explicitly NOT moving to side-by-side per the user's choice.

### Adjacent polish (do only if it falls out cheaply)
- Confirm the "Show original text" helper copy still reads well now that on-by-default is the norm. Currently it says "Display each original paragraph below its translation." That's fine.

---

## Issue 6 — Loading states everywhere users wait

Two complementary layers: per-route `loading.tsx` Suspense skeletons + a global top progress bar.

### Layer A — Per-route `loading.tsx` skeletons

Next.js App Router auto-wraps the page in `<Suspense>` when a sibling `loading.tsx` exists. No imports, no boilerplate beyond the file itself.

| New file | What it should render |
|---|---|
| [app/(public)/s/[storyId]/loading.tsx](app/(public)/s/[storyId]/loading.tsx) | Cover-image placeholder block + title/byline lines + a parts-list skeleton (use Tailwind `animate-pulse bg-muted` blocks shaped like the real page). |
| [app/(public)/s/[storyId]/[variantSlug]/p/[partNumber]/loading.tsx](app/(public)/s/[storyId]/[variantSlug]/p/[partNumber]/loading.tsx) | Render the same `ReaderChrome` shell shape (top + bottom bars as static placeholders) plus ~8 paragraph-shaped pulse blocks. Important: respect the persisted theme's background if cheap; otherwise a neutral muted backdrop is fine. |
| [app/(public)/search/loading.tsx](app/(public)/search/loading.tsx) | Search bar (live) + 6-8 story-card pulse blocks in the grid. |
| [app/(public)/c/[categorySlug]/loading.tsx](app/(public)/c/[categorySlug]/loading.tsx) | Category header skeleton + story-card grid pulse blocks. |
| [app/(public)/c/[categorySlug]/[subcategorySlug]/loading.tsx](app/(public)/c/[categorySlug]/[subcategorySlug]/loading.tsx) | Same as above. |
| [app/(public)/browse/loading.tsx](app/(public)/browse/loading.tsx) | Categories-grid pulse (mirroring the real `/browse` page from issue 3). |
| [app/(public)/bookmarks/loading.tsx](app/(public)/bookmarks/loading.tsx) | Header + 4-6 story-card pulse blocks. |
| [app/(public)/loading.tsx](app/(public)/loading.tsx) | Generic fallback for the home page itself — a centered Qissa wordmark with a thin pulsing line is plenty. |

#### New shared skeleton primitives
Add a tiny module to keep these consistent and avoid copy-paste:
- [components/shared/skeletons.tsx](components/shared/skeletons.tsx) — exports:
  - `<StoryCardSkeleton />` — matches `StoryCard` dimensions (aspect-[4/3] cover + 2 text lines).
  - `<CategoryTileSkeleton />` — matches `CategoryTile`.
  - `<ReaderParagraphSkeleton count={n} />` — renders `n` paragraph-shaped pulse blocks.
  - `<TextLine className="..." />` — primitive used by the others.

All use plain Tailwind: `animate-pulse rounded bg-muted/60`. No external dependency.

### Layer B — Global top progress bar

A 2px bar that animates across the top during route transitions. Use the Next.js 16 / React 19 pattern: `useLinkStatus` (from `next/link`) inside link wrappers, OR — simpler and more universal — a tiny client component that listens to `usePathname()` + `useSearchParams()` changes and animates a `<div>` width.

Recommendation: build it pathname-driven so it fires for every nav (including `router.push` from SearchBar and the variant select), not just `<Link>` clicks.

#### New file
[components/shared/NavProgress.tsx](components/shared/NavProgress.tsx):

- Client component.
- Holds `progress: number` (0-1) and `phase: "idle" | "starting" | "running" | "finishing"` state.
- Watches `usePathname()` + `useSearchParams()` with `useEffect`. On change, start animation: jump to 0.1, then easing toward 0.85 over ~600ms via `requestAnimationFrame`. When the new route commits (i.e., on the next pathname-stable render after the change), animate to 1.0 and fade out.
- Renders a fixed `<div className="fixed top-0 inset-x-0 z-50 h-0.5 pointer-events-none">` with an inner bar whose `width` is `${progress*100}%` and `background` is `var(--primary)`.
- Hide entirely inside the reader (the reader has its own chrome and theme; a generic primary-color bar will clash) — gate with the same `isReader` check used by [PublicShell.tsx:52](components/shared/PublicShell.tsx#L52). Alternative: have the bar pick up the theme color via CSS var, but gating is simpler.

#### Wire-up
Add `<NavProgress />` once at the top of [components/shared/PublicShell.tsx:56-62](components/shared/PublicShell.tsx#L56-L62), inside the fragment, above `<TopBar />`. Since it self-gates on `isReader`, it can sit outside the `if (isReader) return ...` early-return.

### Layer C — Targeted button pending state (only one place)

The reader's Prev/Next part navigation is special: the user is *inside* a route that has its own permanent chrome (issue 2), so the global progress bar is hidden. Without feedback there, users tapping Next on a slow connection still see nothing.

In [components/reader/ReaderChrome.tsx](components/reader/ReaderChrome.tsx), convert the prev/next `<Link>` elements (around lines 149, 156) to use Next's `useLinkStatus` hook (from `next/link`) inside a child component — or wrap with `useTransition` triggered via `router.push`. On pending, swap the icon for a small spinner (`<Spinner />` — animate a tailwind border circle) and add `aria-busy="true"`. Keep `prefetch` for fast hops.

Don't bother with pending states for the variant `<Select>` (it's a relatively rare action and the global bar isn't visible inside the reader — accept the brief delay), or do the same `useTransition` treatment if it falls out naturally.

### What we are explicitly NOT doing
- Not adding a third-party progress library (nprogress, etc.). The component is < 60 lines.
- Not converting plain Links to buttons-with-useTransition everywhere — `loading.tsx` + the global bar cover 95% of the felt pain.
- Not adding skeletons inside `ContinueReading.tsx` for now; it's a fast localStorage read and the current `return null` is fine. Note for future polish.

### Doc updates
- [docs/UI/OVERVIEW.md](docs/UI/OVERVIEW.md) — add a "Loading & progress" subsection describing the two layers (loading.tsx + NavProgress) and the reader's local prev/next spinner.
- [docs/UI/reader.md](docs/UI/reader.md) — note the prev/next pending behavior.

---

## Critical files modified

| Path | Change type |
|---|---|
| [lib/utils/title-case.ts](lib/utils/title-case.ts) | **new** |
| [app/(public)/browse/page.tsx](app/(public)/browse/page.tsx) | **new** |
| [components/shared/StoryCard.tsx](components/shared/StoryCard.tsx) | apply `toTitleCase` |
| [app/(public)/s/[storyId]/page.tsx](app/(public)/s/[storyId]/page.tsx) | apply `toTitleCase` |
| [components/reader/ReaderChrome.tsx](components/reader/ReaderChrome.tsx) | apply `toTitleCase` to share title |
| [components/reader/ReaderShell.tsx](components/reader/ReaderShell.tsx) | remove auto-hide; add `hydratedRef` gate |
| [components/reader/ReaderBody.tsx](components/reader/ReaderBody.tsx) | adjust top/bottom padding for always-visible chrome |
| [components/shared/PublicShell.tsx](components/shared/PublicShell.tsx) | remove `/browse → /` hack; widen Browse matcher |
| [docs/UI/reader.md](docs/UI/reader.md) | drop auto-hide note |
| [docs/INTERNALS/reader-state.md](docs/INTERNALS/reader-state.md) | drop auto-hide; note `hydratedRef` |
| [docs/UI/OVERVIEW.md](docs/UI/OVERVIEW.md) | add `/browse`, loading & progress notes |
| [docs/UI/public.md](docs/UI/public.md) | document `/browse` |
| [lib/reader/reader-settings.ts](lib/reader/reader-settings.ts) | flip `showOriginal` default to `true` |
| [app/(public)/loading.tsx](app/(public)/loading.tsx) | **new** (home fallback) |
| [app/(public)/s/[storyId]/loading.tsx](app/(public)/s/[storyId]/loading.tsx) | **new** |
| [app/(public)/s/[storyId]/[variantSlug]/p/[partNumber]/loading.tsx](app/(public)/s/[storyId]/[variantSlug]/p/[partNumber]/loading.tsx) | **new** |
| [app/(public)/search/loading.tsx](app/(public)/search/loading.tsx) | **new** |
| [app/(public)/c/[categorySlug]/loading.tsx](app/(public)/c/[categorySlug]/loading.tsx) | **new** |
| [app/(public)/c/[categorySlug]/[subcategorySlug]/loading.tsx](app/(public)/c/[categorySlug]/[subcategorySlug]/loading.tsx) | **new** |
| [app/(public)/browse/loading.tsx](app/(public)/browse/loading.tsx) | **new** |
| [app/(public)/bookmarks/loading.tsx](app/(public)/bookmarks/loading.tsx) | **new** |
| [components/shared/skeletons.tsx](components/shared/skeletons.tsx) | **new** (shared pulse primitives) |
| [components/shared/NavProgress.tsx](components/shared/NavProgress.tsx) | **new** (global top progress bar) |
| [components/shared/PublicShell.tsx](components/shared/PublicShell.tsx) | mount `<NavProgress />` |
| [components/reader/ReaderChrome.tsx](components/reader/ReaderChrome.tsx) | prev/next pending spinner + `toTitleCase` for share |

---

## Verification

```bash
npm run typecheck && npm run lint && npm run build
```

Then `npm run dev` and manually check:

1. **Title casing.** Home `/` — confirm `KING BEAN` renders as `King Bean` and `THE DANCING WATER, THE SINGING APPLE, AND THE…` renders as `The Dancing Water, The Singing Apple, And The…`. Spot-check `/s/[id]` and search results. Verify admin `/admin/stories` still shows raw DB values.
2. **Always-visible chrome.** Open a reader part `/s/<id>/<variant>/p/1`. Wait 5+ seconds without touching. Confirm top + bottom bars stay visible. Scroll up and down — bars don't disappear. First paragraph isn't clipped under the top bar; last isn't hidden behind the bottom bar.
3. **Browse tab works.** Resize browser to mobile width (or use device emulation). Tap "Browse" in the bottom dock — should land on `/browse` showing the categories grid. URL bar shows `/browse`, not `/`. Active highlight on the Browse icon persists while on `/browse` and on any `/c/*` page.
4. **Settings persistence.** On the reader, open settings, change theme (e.g. Sepia), line height, font, alignment, font size. Navigate to next part — settings stick. Close and reopen the tab — settings stick. Open DevTools → Application → localStorage → confirm `qissa:reader-settings` contains the chosen values, not defaults.

Edge case to double-check on the settings fix: hard-refresh while on a reader part with cached localStorage values — confirm the page paints with the persisted theme (or briefly defaults then swaps; either is acceptable as long as the final state is the persisted one and localStorage is **not** overwritten).

5. **Show original by default.** Clear `localStorage` (DevTools → Application → Clear storage) and open any reader part. Confirm the original paragraphs appear below each translated paragraph automatically, with the demoted styling. Open settings → toggle off → confirm originals disappear and the choice persists across part navigation (this also re-verifies issue 4).

6. **Loading feedback.**
   - Throttle network to "Slow 3G" in DevTools.
   - Click a story card on home → confirm the story-landing skeleton appears immediately, then the global progress bar animates from left to right.
   - On the story landing, click "Start reading" → confirm the reader skeleton + progress bar appear before the part renders.
   - In the reader, tap Next → confirm the prev/next button shows a spinner and `aria-busy` briefly before the next part loads. (Global bar should stay hidden inside the reader.)
   - Submit a query in the search bar → confirm the search skeleton + progress bar.
   - Tap Browse in the mobile dock → confirm browse skeleton + progress bar.
   - Verify no double-renders or skeleton flash on already-prefetched routes (some flicker is OK; outright duplicate fetches are not).
