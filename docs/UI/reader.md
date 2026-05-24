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
| `settings: ReaderSettings` (theme, lineHeight, alignment, fontVariant, showOriginal) | `qissa:reader-settings` JSON | Default theme = `day`, default font = `serif`, default alignment = `justify` |
| `fontSize: number` | `qissa:fontSize` integer (14–32) | Separate key — A−/A+ + pinch zoom hit it constantly |
| `chromeVisible: boolean` | none | Auto-hide 3s; reset on scroll/touch/mousemove |
| `settingsOpen: boolean` | none | While open, chrome auto-hide is paused (via `settingsOpenRef`) |

All defaults are in [lib/reader/reader-settings.ts](../../lib/reader/reader-settings.ts) and [lib/reader/font-size.ts](../../lib/reader/font-size.ts).

### Hydration

Server renders with `DEFAULT_SETTINGS` and `DEFAULT_FONT_SIZE` so the SSR HTML is deterministic. On mount, a `useEffect` defers `setSettings` + `setFontSize` to a microtask (React-19 lint avoidance), then swaps to persisted values. Body content is identical pre/post hydration → no hydration mismatch.

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

Top + bottom bars. Both fade together based on `visible`. Theme-aware via CSS custom properties (`var(--reader-chrome-bg)` etc.) set on the outer wrapper by [themeStyle(theme)](../../lib/reader/themes.ts).

**Top bar:** Back link to `/s/<id>` · centered "Part X / N" · settings gear · [ShareButton](../../components/shared/ShareButton.tsx) · [BookmarkButton](../../components/shared/BookmarkButton.tsx).

**Bottom bar:** prev part button (disabled with 30% opacity when first) · `X / N` counter · next part button. Both prefetch via Next `<Link prefetch>`.

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

[components/reader/FontControls.tsx](../../components/reader/FontControls.tsx) — floating A−/A+ buttons bottom-right (above the bottom chrome). Fade together with chrome via `visible` prop.

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
