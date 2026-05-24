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

- ILIKE on `title_original` + `title_translated`, wildcards in the user input are escaped so `%` doesn't match-all
- pg_trgm GIN indexes from [migration 0001](../../supabase/migrations/20260522120001_initial.sql) keep this fast
- Empty `q` → prompt; no results → friendly message; otherwise the same grid

---

## `/s/[storyId]` — Story landing

**File:** [app/(public)/s/[storyId]/page.tsx](../../app/(public)/s/[storyId]/page.tsx) (`revalidate = 60`)

Sections:

1. **Breadcrumb** ← Category / Subcategory
2. **Cover image** (16:9 aspect) — composed via [heroUrl()](../../lib/imagekit/url.ts)
3. **Title block** — language + tone badges; title rendered in the target language's reading font + `dir`; original title shown small if a translated one exists
4. **Primary actions** — Start Reading (links to `/s/<id>/p/1`) · [BookmarkButton](../../components/shared/BookmarkButton.tsx) · [ShareButton](../../components/shared/ShareButton.tsx)
5. **Parts list** — `<ol>` with per-part [PartReadIndicator](../../components/shared/PartReadIndicator.tsx). Indicator re-renders live as the user reads — driven by the `qissa:progress-changed` event ([lib/reader/progress.ts](../../lib/reader/progress.ts)).
6. **Original source link** — optional, opens externally

---

## `/bookmarks` — Bookmarks

**File:** [app/(public)/bookmarks/page.tsx](../../app/(public)/bookmarks/page.tsx) — **pure Client Component** (page-level `"use client"`).

Flow:

1. `useSyncExternalStore` reads bookmark IDs via [getBookmarks()](../../lib/reader/bookmarks.ts) (cached snapshot for stability)
2. On change (also via [subscribeBookmarks](../../lib/reader/bookmarks.ts)), fetch stories via browser Supabase client using `.in("id", ids)`
3. Sort preserving the order the user bookmarked them
4. Render in the same grid as `/c/.../...`

State machine: while the fetch is in flight, `stories === null` → "Loading…"; afterwards, `[]` or the list.

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
