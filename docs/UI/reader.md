# UI — Reader

> The cockpit at `/s/[storyId]/p/[partNumber]`. The showpiece of the product.

**Page:** [app/(public)/s/[storyId]/p/[partNumber]/page.tsx](../../app/(public)/s/[storyId]/p/[partNumber]/page.tsx) (server component)

The page fetches story + part + language metadata, computes prev/next hrefs, emits a per-language `<link rel="stylesheet">` (so we don't ship every Indic font on `/`), and renders [ReaderShell](../../components/reader/ReaderShell.tsx). The [PublicShell](../../components/shared/PublicShell.tsx) detects this route and renders no top bar / bottom nav (the reader has its own chrome).

---

## Component tree

```
<ReaderShell>                                   components/reader/ReaderShell.tsx
  <ProgressBar />                               components/reader/ProgressBar.tsx
  <ReaderChrome>                                components/reader/ReaderChrome.tsx
    Top: ← back / "Part X / N" / settings / share / heart
    Bottom: ← prev / "X / N" / next →
  </ReaderChrome>
  <ReaderBody>                                  components/reader/ReaderBody.tsx
    <article dir={direction} data-theme={theme}>
      <header>Part X of N · {partLabel}</header>
      <div className="space-y-5">
        {paragraphs.map(p => (
          <div data-paragraph>
            <p>{translated}</p>
            {showOriginal && <p className="reader-original">{original}</p>}
          </div>
        ))}
      </div>
    </article>
  </ReaderBody>
  <FontControls />                              components/reader/FontControls.tsx
  <ReaderSettingsSheet />                       components/reader/ReaderSettings.tsx
</ReaderShell>
```

---

## State owned by ReaderShell

| State | Persisted | Notes |
|---|---|---|
| `settings: ReaderSettings` (theme, lineHeight, alignment, fontVariant, showOriginal) | `qissa:reader-settings` JSON | Default theme = `day`, default font = `serif`, default alignment = `justify`, `showOriginal: false` (translation-only by default) |
| `fontSize: number` | `qissa:fontSize` integer (14–32) | Separate key — A−/A+ + pinch zoom hit it constantly |
| `settingsOpen: boolean` | none | Settings sheet open/close |
| `fontControlsVisible: boolean` | none | Auto-hide 3s; resets on scroll / touchstart / mousemove (and on A−/A+ taps) |

Top + bottom chrome are permanently visible — `chromeVisible` is pinned to `true` and the prop is still threaded through so a future explicit toggle can be wired in without rewiring [ReaderChrome](../../components/reader/ReaderChrome.tsx). The floating A−/A+ buttons get their own `fontControlsVisible` state with a 3s auto-hide so they don't sit on top of the prose once the reader has picked a size.

All defaults are in [lib/reader/reader-settings.ts](../../lib/reader/reader-settings.ts) and [lib/reader/font-size.ts](../../lib/reader/font-size.ts).

### Hydration

Server renders with `DEFAULT_SETTINGS` and `DEFAULT_FONT_SIZE` so the SSR HTML is deterministic. On mount, a `useEffect` defers `setSettings` + `setFontSize` to a microtask (React-19 lint avoidance), then swaps to persisted values. Body content is identical pre/post hydration → no hydration mismatch.

A `hydratedRef = useRef(false)` flips to `true` *after* the microtask writes persisted state. The save-effect for `settings` gates on this ref — without it, the first commit (with `DEFAULT_SETTINGS`) would overwrite localStorage *before* the microtask reads from it, destroying the user's saved preferences on every part navigation. A ref (not state) avoids triggering an extra render / hydration mismatch.

### Progress save / restore

- `setInterval(snapshot, 5000)` saves scroll ratio to `qissa:progress:<storyId>:<partNumber>` and updates `qissa:last-read`
- `visibilitychange → hidden` triggers a save
- `useEffect` cleanup also saves (so navigating to the next part captures the final position)
- On mount, [getPartProgress()](../../lib/reader/progress.ts) restores via `window.scrollTo` inside `requestAnimationFrame` (one frame after layout)

### Pinch-to-zoom

`touchstart` with `touches.length === 2` snapshots the initial finger distance + current font size. `touchmove` computes `ratio = current / initial` and clamps `initialFontSize * ratio` to [14, 32]. `touchend` persists the final font size.

`event.preventDefault()` on `touchmove` requires `passive: false`. Other touch listeners stay passive for scroll perf.

---

## ReaderChrome

Top + bottom bars. Always visible (the `visible` prop is wired but ReaderShell pins it to `true` — see "State owned by ReaderShell" above). Theme-aware via CSS custom properties (`var(--reader-chrome-bg)` etc.) set on the outer wrapper by [themeStyle(theme)](../../lib/reader/themes.ts).

**Top bar:** Back link to `/s/<id>` · variant picker (when ≥2 published variants) · centered "Part X / N" · settings gear · [ShareButton](../../components/shared/ShareButton.tsx) · [BookmarkButton](../../components/shared/BookmarkButton.tsx). The share title runs through [toTitleCase()](../../lib/utils/title-case.ts).

**Bottom bar:** prev part button (disabled with 30% opacity when first) · `X / N` counter · next part button. Both prefetch via Next `<Link prefetch>`. Each link wraps an inner component that calls `useLinkStatus()` so the chevron swaps for a spinner (and `aria-busy` flips) while the next part is loading — the global [NavProgress](../../components/shared/NavProgress.tsx) bar is hidden inside the reader, so this is where pending feedback comes from.

---

## ReaderBody

The `<article>`. Three things worth knowing:

### Paragraph pairing for "Show original"

[pairParagraphs(original, translated)](../../lib/reader/paragraphs.ts) splits each text on `\n{2,}` and zips them index-by-index. If counts mismatch (the AI sometimes merges paragraphs), orphans surface alone — we never silently drop content.

The original paragraph renders below the translated one, italic, in a muted color, using the **language's UI sans font** (intentional — distinguishes from the translated reading-font). `border-s-2 ps-3` uses logical properties so RTL stories get the border on the right.

### Focus mode

When `settings.theme === "focus"`, a scroll-driven `requestAnimationFrame` loop finds the paragraph whose center is closest to viewport center and tags it `data-focus="active"`. CSS in [app/globals.css](../../app/globals.css):

```css
.reader-article[data-theme="focus"] .reader-paragraph {
  opacity: var(--reader-focus-dim, 0.25);
  transition: opacity 200ms ease-out;
}
.reader-article[data-theme="focus"] .reader-paragraph[data-focus="active"] {
  opacity: 1;
}
```

When the theme isn't `focus`, the effect cleans up (removes the attribute, removes listeners). Single observer for the whole part — cheaper than per-paragraph IntersectionObservers on long parts.

### RTL

`<article dir={direction}>` flips inline-direction across the body. The `border-s-2 ps-3` on the original paragraph and the prev/next button positions in the bottom bar use **logical properties** so they automatically flip in RTL.

### Tap-to-define dictionary popover

When `targetLanguage` is set (variant reader — the source reader passes `null`), a click on body text opens [DefinitionPopover](../../components/reader/DefinitionPopover.tsx) anchored to the tapped word's bounding rect.

Resolution flow inside [ReaderBody](../../components/reader/ReaderBody.tsx):

1. `document.caretPositionFromPoint(x, y)` (or `caretRangeFromPoint` on older WebKit) → `{ node, offset }`.
2. `Intl.Segmenter(targetLanguage, { granularity: 'word' })` walks the text node's value, picking the first `isWordLike` segment whose range contains `offset`. Handles Devanagari, Arabic, Tamil etc.; falls back to a Unicode-property regex when `Intl.Segmenter` is unavailable.
3. A throw-away `Range` over `[start, end]` produces the popover's anchor `DOMRect`.
4. We bail out if `window.getSelection()` is non-collapsed — long-press / drag-select must still surface the native copy menu.

The popover handles its own fetch state machine (loading / loaded / empty / error), dismisses on outside-click / Escape / scroll / resize, and uses a 24-hour `Cache-Control` on the proxy response so popular words are cheap. Backing API: [/api/dictionary](../API/dictionary.md). Save toggle writes to [qissa:vocab](../INTERNALS/reader-state.md) — surfaced at `/my-words`.

The save state in the popover header subscribes to the vocab store via `useSyncExternalStore` so saves in one tab flip the icon in another.

---

## ReaderSettings (dialog)

[components/reader/ReaderSettings.tsx](../../components/reader/ReaderSettings.tsx) — a Dialog (not a Sheet) for simplicity.

Sections:

1. **Theme** — 5 swatch buttons (mini "Aa" preview in the theme's own colors)
2. **Line spacing** — segmented control (compact / normal / relaxed)
3. **Alignment** — segmented control (left / justify)
4. **Font** — segmented control (serif / sans)
5. **Show original text** — Switch (disabled with hint when the part has no original)

`onChange` calls back into ReaderShell which writes the whole `settings` blob to localStorage.

---

## FontControls

[components/reader/FontControls.tsx](../../components/reader/FontControls.tsx) — floating A−/A+ buttons bottom-right (above the bottom chrome).

**Auto-hide.** Driven by `fontControlsVisible` in [ReaderShell](../../components/reader/ReaderShell.tsx): starts `true`, hides 3s after the last interaction (scroll / touchstart / mousemove document listeners + an explicit reset inside `updateFontSize` so tapping A−/A+ also re-arms the timer). The top + bottom chrome do NOT share this state — only the floating buttons fade.

Disabled at boundaries: A+ disabled when fontSize === 32, A− when 14.

---

## ProgressBar

[components/reader/ProgressBar.tsx](../../components/reader/ProgressBar.tsx) — fixed 0.5px bar at top. Listens to `scroll` + `resize` (passive). Width = `(scrollY / (documentHeight − innerHeight)) * 100%`.

Uses `color-mix(in srgb, var(--reader-accent) 18%, transparent)` for the rail and `var(--reader-accent)` for the fill.

---

## Fonts

Per-language Google Fonts URL is computed in [lib/reader/google-fonts.ts](../../lib/reader/google-fonts.ts) (`googleFontsUrlForLanguage(code)`) and emitted as a `<link rel="stylesheet">` in the page. English falls back to `Lora` / `Inter` loaded globally via `next/font` in the root layout.

The actual `font-family` value applied to the article comes from the **seeded languages.font_family_reading** (when `fontVariant === "serif"`) or `--font-sans` (when `"sans"`). See [languageFontStyle](../../lib/i18n/fonts.ts).

---

## Cross-references

- Theme + settings storage: [INTERNALS/reader-state.md](../INTERNALS/reader-state.md)
- Service worker caches the reader HTML on first visit: [INTERNALS/pwa-service-worker.md](../INTERNALS/pwa-service-worker.md)
