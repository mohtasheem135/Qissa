# UI — Public reader-facing pages

All under [app/(public)/](../../app/(public)/). Mobile-first; shell defined by [PublicShell](../../components/shared/PublicShell.tsx) (see [OVERVIEW.md](./OVERVIEW.md)). Every server-rendered page uses the anon Supabase client from [lib/supabase/server.ts](../../lib/supabase/server.ts) — RLS enforces "published + active".

---

## `/` — Home

**File:** [app/(public)/page.tsx](../../app/(public)/page.tsx) (`revalidate = 60`)

Sections, top to bottom:

1. **Hero** — title + tagline + [SearchBar](../../components/shared/SearchBar.tsx)
2. **Continue reading** — [ContinueReading](../../components/shared/ContinueReading.tsx) Client Component; reads `qissa:last-read`, fetches the story via the browser Supabase client, renders one [StoryCard](../../components/shared/StoryCard.tsx) + Resume link. Renders nothing if no last-read.
3. **Recently published** — 8 latest from `stories` ordered by `published_at desc`
4. **Browse by category** — active categories with story counts; de-dup'd from the embedded `subcategories(stories(id))` join

Shared query shape lives in [lib/reader/story-cards.ts](../../lib/reader/story-cards.ts) (`STORY_CARD_COLUMNS` + `toStoryCard()`) — every listing page uses it.

---

## `/browse` — All categories

**File:** [app/(public)/browse/page.tsx](../../app/(public)/browse/page.tsx) (`revalidate = 60`)

A flat grid of every active category that has at least one published story, rendered with [CategoryTile](../../components/shared/CategoryTile.tsx). Mirrors the home page's "Browse by category" query so counts match. The mobile bottom-nav Browse tab links here; the matcher in [PublicShell](../../components/shared/PublicShell.tsx) keeps the icon highlighted on `/browse` itself and on any `/c/*` page.

---

## `/c/[categorySlug]` — Category landing

**File:** [app/(public)/c/[categorySlug]/page.tsx](../../app/(public)/c/[categorySlug]/page.tsx) (`revalidate = 60`)

- Fetches one category by `slug` + active subcategories with embedded `stories(id)` for counts
- 404s via `notFound()` on missing or inactive category
- Renders subcategories as inline tiles (no separate `CategoryTile` here — they link a level deeper)

---

## `/c/[categorySlug]/[subcategorySlug]` — Story grid

**File:** [app/(public)/c/[categorySlug]/[subcategorySlug]/page.tsx](../../app/(public)/c/[categorySlug]/[subcategorySlug]/page.tsx) (`revalidate = 60`)

- Two-step lookup: parent category by `slug`, then subcategory by `(category_id, slug)`
- Lists up to 60 stories under the subcategory ordered by `published_at desc`
- No pagination yet — Phase 1.5 task

---

## `/search?q=…` — Search

**File:** [app/(public)/search/page.tsx](../../app/(public)/search/page.tsx) (`dynamic = "force-dynamic"`)

- **Two-step query.** The page calls the `search_stories(q, max_results)` RPC ([migration 0004](../../supabase/migrations/20260529120000_search_stories_rpc.sql)), which ORs ILIKE across `stories.title_original`, `stories.author_original`, and `story_variants.title_translated` (published variants only) and returns ranked story IDs by best-of-three `pg_trgm.similarity` score. The page then fetches the full `STORY_CARD_COLUMNS` for those IDs and re-orders client-side to preserve the RPC ranking (`.in()` doesn't preserve input order).
- **Why an RPC?** A Hindi reader typing "गोदान" should find the story even when only the variant's `title_translated` carries it. PostgREST's `.or()` doesn't express the join-aware OR cleanly, so the RPC encapsulates the union + score.
- **Indexes.** pg_trgm GIN indexes on `stories.title_original` (migration 0001), plus `stories.author_original` and `story_variants.title_translated` (migration 0004) keep the ILIKEs fast.
- **Wildcard safety.** `%`, `_`, and `\` in user input are escaped client-side before being concatenated into the RPC's ILIKE patterns so a literal `%` doesn't match-all.
- **Empty `q`** → prompt; no results → friendly message; otherwise the same grid.

---

## `/s/[storyId]` — Story landing

**File:** [app/(public)/s/[storyId]/page.tsx](../../app/(public)/s/[storyId]/page.tsx) (`revalidate = 60`)

Sections:

1. **Breadcrumb** ← Category / Subcategory
2. **Cover image** (16:9 aspect) — composed via [heroUrl()](../../lib/imagekit/url.ts)
3. **Title block** — source title (run through [toTitleCase()](../../lib/utils/title-case.ts)), author, parts count
4. **Primary actions** — Start Reading (links to `/s/<id>/<primaryVariantSlug>/p/1`) · [BookmarkButton](../../components/shared/BookmarkButton.tsx) · [ShareButton](../../components/shared/ShareButton.tsx)
5. **Available in** — grid of cards, one per published variant + a trailing **Source card**. Variant cards link to `/s/<id>/<slug>/p/1` and show language + tone badges, the primary marker, and estimated reading minutes. The Source card carries a `Source` badge + author and links to `/s/<id>/source/p/1` so readers can open the original prose directly. A "Request another translation" CTA sits below the grid.
6. **Original source link** — optional, opens externally if `source_url` is set

(No standalone Parts list — readers enter via the cards. Progress is tracked per (story × variant), surfaced on the Continue Reading card on home.)

**Open Graph / Twitter card image (1200×630)** is auto-wired by the co-located [opengraph-image.tsx](../../app/(public)/s/[storyId]/opengraph-image.tsx) + [twitter-image.tsx](../../app/(public)/s/[storyId]/twitter-image.tsx) (which re-exports the OG image). The renderer queries published + active story + variants, then composes cover (ImageKit `w-360,h-480` transform) + title (auto-scaled to fit) + author + up to 4 language pills + Qissa wordmark via `next/og`'s `ImageResponse`. A stale or unpublished link falls back to a brand mark so a broken link still produces a clean preview. The root [app/opengraph-image.tsx](../../app/opengraph-image.tsx) covers every page without its own OG.

---

## `/s/[storyId]/source/p/[partNumber]` — Source reader

**File:** [app/(public)/s/[storyId]/source/p/[partNumber]/page.tsx](../../app/(public)/s/[storyId]/source/p/[partNumber]/page.tsx) (`revalidate = 60`)

The original story rendered through the same [ReaderShell](../../components/reader/ReaderShell.tsx) the variant reader uses. Two implementation notes:

- Source text comes from `story_parts.text_original`; it's passed in `textTranslated` (with `textOriginal` empty) so ReaderBody renders one column of prose and the "Show original" toggle is auto-disabled — there's no parallel column to surface.
- Variant slug is the literal `"source"`. Progress keys (`qissa:progress:<storyId>:source:<n>`) stay isolated from any translation's progress, so reading the source doesn't muddy the in-progress badges on translated variants.

Layout matches the variant reader: theme-aware top/bottom chrome, prev/next part navigation, `revalidate = 60`. No variant picker (single-entry).

---

## `/bookmarks` — Bookmarks

**File:** [app/(public)/bookmarks/page.tsx](../../app/(public)/bookmarks/page.tsx) — **pure Client Component** (page-level `"use client"`).

Flow:

1. `useSyncExternalStore` reads bookmark IDs via [getBookmarks()](../../lib/reader/bookmarks.ts) (cached snapshot for stability)
2. On change (also via [subscribeBookmarks](../../lib/reader/bookmarks.ts)), fetch stories via browser Supabase client using `.in("id", ids)`
3. Sort preserving the order the user bookmarked them
4. Render in the same grid as `/c/.../...`

State machine: while the fetch is in flight, `stories === null` → "Loading…"; afterwards, `[]` or the list.

The page header surfaces "Highlights (N)" and "My words (N)" links alongside each other so readers can find any of their saved-on-this-device collections from the same surface.

---

## `/my-words` — Saved vocab

**File:** [app/(public)/my-words/page.tsx](../../app/(public)/my-words/page.tsx) — pure Client Component.

Lists every word the reader has saved from the [DefinitionPopover](../../components/reader/DefinitionPopover.tsx) — newest first. Each row shows the word, its language code, the date saved (via [formatDateTime()](../../lib/utils/format-datetime.ts)), a link back to the reader page that captured the word (when the popover stored context), a Wiktionary link, and a delete button.

Subscribes to the vocab store via `useSyncExternalStore`, so a save / unsave anywhere (popover, other tab, this page's delete) updates the count + list live without a refresh. Storage details + the `VocabEntry` shape live in [INTERNALS/reader-state.md](../INTERNALS/reader-state.md).

---

## `/highlights` — Highlights index

**File:** [app/(public)/highlights/page.tsx](../../app/(public)/highlights/page.tsx) — pure Client Component.

Lists every paragraph the reader has highlighted from the [HighlightMenu](../../components/reader/HighlightMenu.tsx) — newest first. Each row shows the colour-tinted snippet (captured at save time so paragraph re-flows don't invalidate the preview), the optional note, part number, save date, a "Back to the paragraph" deep link, and a trash button.

The deep link is `/s/<storyId>/<variantSlug>/p/<partNumber>#h-<paragraphIndex>` — [ReaderBody](../../components/reader/ReaderBody.tsx) picks up that hash on mount and `scrollIntoView`-s the matching `[data-paragraph]` element inside `requestAnimationFrame` (so the article has laid out at its final font size first).

Subscribes to the highlights store via `useSyncExternalStore`. Storage shape + the cross-tab sync pattern live in [INTERNALS/reader-state.md](../INTERNALS/reader-state.md).

---

## `/offline` — SW fallback

**File:** [app/(public)/offline/page.tsx](../../app/(public)/offline/page.tsx) (statically pre-rendered)

Served by [public/sw.js](../../public/sw.js) when navigation fails and the target URL isn't cached. Has Home and Bookmarks links (Bookmarks works offline because it's client-side localStorage + cached image responses).

---

## Cross-cutting

- All pages have per-route `generateMetadata` or `metadata` for `<title>` chain
- Cover images go through [next/image](https://nextjs.org/docs/app/api-reference/components/image) with `unoptimized` (ImageKit already optimizes); host allowlisted in [next.config.ts](../../next.config.ts)
- Font for the translated title comes from the **language's seeded `font_family_reading`** applied inline via [languageFontStyle()](../../lib/i18n/fonts.ts)
- For per-language fonts on the reader page proper, see [reader.md](./reader.md)
