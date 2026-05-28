# Qissa — Feature Map

> Every user-facing feature mapped to the code that implements it. Cross-references back to UI / API / INTERNALS subsections so a question that names a feature can jump to the right file fast.

Source of truth for **what** features should exist: [01-requirements.md](./01-requirements.md). This doc describes **what's actually built**.

---

## Reader-facing

### Browse home page
- **URL:** `/`
- **Page:** [app/(public)/page.tsx](../app/(public)/page.tsx)
- **Components:** [SearchBar](../components/shared/SearchBar.tsx) · [ContinueReading](../components/shared/ContinueReading.tsx) · [StoryCard](../components/shared/StoryCard.tsx) · [CategoryTile](../components/shared/CategoryTile.tsx)
- **Data:** 8 latest published stories + active categories with story counts
- **Doc:** [UI/public.md](./UI/public.md)

### Continue reading
- **Component:** [ContinueReading](../components/shared/ContinueReading.tsx)
- **State:** `qissa:last-read` in localStorage; written by [savePartProgress()](../lib/reader/progress.ts)
- **Fetch:** browser Supabase client, RLS-gated to published+active
- **UX:** discriminated-union state; renders nothing if no last-read

### Browse by category
- **URLs:** `/c/[categorySlug]` → subcategories grid; `/c/[categorySlug]/[subcategorySlug]` → story grid
- **Pages:** [app/(public)/c/[categorySlug]/page.tsx](../app/(public)/c/[categorySlug]/page.tsx) · [app/(public)/c/[categorySlug]/[subcategorySlug]/page.tsx](../app/(public)/c/[categorySlug]/[subcategorySlug]/page.tsx)
- **Limits:** subcategory page caps at 60 stories (no pagination yet — Phase 1.5)
- **Doc:** [UI/public.md](./UI/public.md)

### Search
- **URL:** `/search?q=…`
- **Page:** [app/(public)/search/page.tsx](../app/(public)/search/page.tsx)
- **Backed by:** Postgres ILIKE on `stories.title_original` (pg_trgm GIN index from [migration 0001](../supabase/migrations/20260522120001_initial.sql)); per-variant translated-title search is deferred to Phase 1.5 since it needs a join-aware OR or an RPC
- **Doc:** [UI/public.md](./UI/public.md)

### Bookmarks
- **URL:** `/bookmarks`
- **Page:** [app/(public)/bookmarks/page.tsx](../app/(public)/bookmarks/page.tsx) (pure Client Component)
- **Toggle:** [BookmarkButton](../components/shared/BookmarkButton.tsx) on story landing + reader top bar
- **Storage:** [lib/reader/bookmarks.ts](../lib/reader/bookmarks.ts) — array of story IDs in localStorage, cached for `useSyncExternalStore`
- **Cross-tab sync:** native `storage` event + same-tab `CustomEvent`
- **Doc:** [INTERNALS/reader-state.md](./INTERNALS/reader-state.md)

### Story landing
- **URL:** `/s/[storyId]`
- **Page:** [app/(public)/s/[storyId]/page.tsx](../app/(public)/s/[storyId]/page.tsx)
- **Shows:** cover (heroUrl), source title (titlecased), author, Start Reading button (routes to the primary variant's part 1), **"Available in" grid** with one card per published variant + a trailing **Source card** linking to `/s/<id>/source/p/1`, Bookmark + Share, **"Request another translation" CTA** ([RequestStoryDialog](../components/shared/RequestStoryDialog.tsx))
- **No standalone Parts list:** readers enter via the variant or source cards; per-variant progress is tracked in localStorage and surfaced on home's Continue Reading
- **Doc:** [UI/public.md](./UI/public.md)

### Source reader
- **URL:** `/s/[storyId]/source/p/[partNumber]`
- **Page:** [app/(public)/s/[storyId]/source/p/[partNumber]/page.tsx](../app/(public)/s/[storyId]/source/p/[partNumber]/page.tsx)
- **What:** original `story_parts.text_original` rendered through [ReaderShell](../components/reader/ReaderShell.tsx), passed as `textTranslated` with `textOriginal` empty — single-column prose, "Show original" toggle auto-disabled (no parallel text)
- **Progress isolation:** `variantSlug = "source"` so progress lives at `qissa:progress:<storyId>:source:<n>`, separate from translation progress
- **Doc:** [UI/public.md](./UI/public.md)

### Reader experience (the showpiece)
- **URL:** `/s/[storyId]/[variantSlug]/p/[partNumber]` (the old `/s/[storyId]/p/[partNumber]` redirects to the primary variant)
- **Page:** [app/(public)/s/[storyId]/[variantSlug]/p/[partNumber]/page.tsx](../app/(public)/s/[storyId]/[variantSlug]/p/[partNumber]/page.tsx)
- **Legacy redirect:** [app/(public)/s/[storyId]/p/[partNumber]/page.tsx](../app/(public)/s/[storyId]/p/[partNumber]/page.tsx) — 307s to the primary published variant; if none exists, 307s to the story landing `/s/<id>` instead of 404-ing
- **Variant picker:** [ReaderChrome](../components/reader/ReaderChrome.tsx) renders a `<Select>` in the top bar when the story has ≥2 published variants; switching navigates to the same part number in the target variant (clamped to its totalParts)
- **Orchestrator:** [ReaderShell](../components/reader/ReaderShell.tsx)
- **Sub-components:** [ReaderChrome](../components/reader/ReaderChrome.tsx) · [ReaderBody](../components/reader/ReaderBody.tsx) · [ReaderSettings](../components/reader/ReaderSettings.tsx) · [FontControls](../components/reader/FontControls.tsx) · [ProgressBar](../components/reader/ProgressBar.tsx)
- **5 themes:** [lib/reader/themes.ts](../lib/reader/themes.ts) (Day · Sepia · Night · Gray · Focus)
- **Per-language fonts:** [lib/reader/google-fonts.ts](../lib/reader/google-fonts.ts) → `<link rel=stylesheet>` per story
- **Settings persisted:** `qissa:reader-settings` + `qissa:fontSize`
- **Auto-hide chrome:** 3s timer, reset on scroll/touch/mousemove
- **Progress save:** every 5s + on visibilitychange + on unmount
- **Pinch-to-zoom:** 2-finger touchmove computes distance ratio, clamps font size to [14, 32]
- **Focus mode:** RAF-driven scan picks paragraph nearest viewport centre → `data-focus="active"`; CSS in [globals.css](../app/globals.css) dims the rest
- **Show original:** [lib/reader/paragraphs.ts](../lib/reader/paragraphs.ts) zips original ↔ translated by paragraph
- **Doc:** [UI/reader.md](./UI/reader.md)

### Share button
- **Component:** [ShareButton](../components/shared/ShareButton.tsx)
- **Used on:** story landing + reader top bar
- **API:** Web Share API with clipboard fallback

### Offline support
- **Service worker:** [public/sw.js](../public/sw.js) — registered by [ServiceWorkerRegistration](../components/shared/ServiceWorkerRegistration.tsx) in production only
- **Strategies:** network-first HTML / cache-first images / SWR static / network-only admin+API
- **Fallback page:** [app/(public)/offline/page.tsx](../app/(public)/offline/page.tsx)
- **Doc:** [INTERNALS/pwa-service-worker.md](./INTERNALS/pwa-service-worker.md)

### Install as PWA
- **Banner:** [InstallPrompt](../components/shared/InstallPrompt.tsx) — mounted in root layout
- **Gating:** user has read ≥1 story (`qissa:last-read` exists) AND hasn't dismissed in 7d
- **Manifest:** [app/manifest.ts](../app/manifest.ts), icons under [public/icons/](../public/icons/)
- **Doc:** [INTERNALS/pwa-service-worker.md](./INTERNALS/pwa-service-worker.md)

### Request a translation / new story
- **Dialog:** [RequestStoryDialog](../components/shared/RequestStoryDialog.tsx) — language + tone selects, optional title/author/notes/email, hidden honeypot
- **API:** [`POST /api/requests`](../app/api/requests/route.ts) — honeypot, in-memory IP rate-limit (5/hr), dedupe (matching open requests bump votes instead of inserting)
- **Vote API:** [`POST /api/requests/[id]/vote`](../app/api/requests/[id]/vote/route.ts) — per-IP `sha256(ip+salt)` dedupe via `story_request_votes`
- **Triggered from:** story landing page "Request another translation" CTA (preset to `type='new_variant'`)
- **Doc:** [04-database.md §4.12–§4.13](./04-database.md#412-story_requests)

---

## Admin-facing

### Admin login
- **URL:** `/admin/login`
- **Page:** [app/admin/login/page.tsx](../app/admin/login/page.tsx)
- **Action:** [signIn](../app/admin/login/actions.ts) — three distinct error paths (empty / bad credentials / wrong email → sign out)
- **Form:** [LoginForm](../components/admin/LoginForm.tsx) — `useActionState` + `useFormStatus`
- **Doc:** [UI/auth.md](./UI/auth.md)

### Admin gating / sign-out
- **Helper:** [lib/auth/check-admin.ts](../lib/auth/check-admin.ts) — `requireAdmin()` + `getAdminUser()`
- **Layout:** [app/admin/(protected)/layout.tsx](../app/admin/(protected)/layout.tsx) — awaits `requireAdmin()` before rendering `AdminShell`
- **Shell:** [AdminShell](../components/admin/AdminShell.tsx) — sidebar nav + email + sign-out form
- **Sign out:** [app/admin/(protected)/actions.ts](../app/admin/(protected)/actions.ts) → `signOut()`
- **Middleware:** [proxy.ts](../proxy.ts) + [lib/supabase/middleware.ts](../lib/supabase/middleware.ts) — refresh JWT cookie each request
- **Doc:** [UI/auth.md](./UI/auth.md)

### Admin dashboard
- **URL:** `/admin`
- **Page:** [app/admin/(protected)/page.tsx](../app/admin/(protected)/page.tsx)
- **Shows:** 3 stat cards (total / drafts / published) via PostgREST `count: 'exact', head: true`

### Admin analytics
- **URL:** `/admin/analytics` (URL-driven range: `?range=7d|30d|90d|all`, default `30d`)
- **Page:** [app/admin/(protected)/analytics/page.tsx](../app/admin/(protected)/analytics/page.tsx)
- **Queries:** [lib/analytics/translation-stats.ts](../lib/analytics/translation-stats.ts) (server-only) + [lib/analytics/translation-stats.types.ts](../lib/analytics/translation-stats.types.ts) (client-safe types)
- **Pricing:** [lib/analytics/pricing.ts](../lib/analytics/pricing.ts) — editable per-1M-token table keyed by `<provider>:<model>`
- **Sections:** KPIs (attempts · success rate · avg latency · est. cost) · daily activity sparkline · cost trend sparkline · provider/model breakdown (desktop table + mobile cards) · admin override rate per model (quality signal) · top errors with last-seen
- **Data sources:** `translation_jobs` (per-attempt log: tokens, latency, provider, model, status, error) + `story_part_versions` (`created_by ∈ {ai, admin}` drives override rate)
- **Charts:** inline SVG [Sparkline](../components/admin/AnalyticsCharts.tsx) + [ProgressBar](../components/admin/AnalyticsCharts.tsx) — no chart library dependency
- **Doc:** [UI/admin.md](./UI/admin.md)

### Categories CRUD
- **URLs:** `/admin/categories` · `/admin/categories/[id]`
- **Pages:** [list](../app/admin/(protected)/categories/page.tsx) · [detail](../app/admin/(protected)/categories/[id]/page.tsx)
- **Panels:** [CategoriesPanel](../components/admin/CategoriesPanel.tsx) · [SubcategoriesPanel](../components/admin/SubcategoriesPanel.tsx)
- **Dialogs:** [CategoryFormDialog](../components/admin/CategoryFormDialog.tsx) · [SubcategoryFormDialog](../components/admin/SubcategoryFormDialog.tsx)
- **Actions:** [lib/actions/categories.ts](../lib/actions/categories.ts) · [lib/actions/subcategories.ts](../lib/actions/subcategories.ts)
- **Soft delete only:** sets `is_active = false`; FK ON DELETE CASCADE would wipe children, so UI never offers hard delete
- **Slug auto-fill:** name → slug via [toSlug()](../lib/utils/slug.ts) until user manually edits
- **Doc:** [UI/admin.md](./UI/admin.md)

### Languages CRUD
- **URL:** `/admin/languages`
- **Page:** [app/admin/(protected)/languages/page.tsx](../app/admin/(protected)/languages/page.tsx)
- **Panel:** [LanguagesPanel](../components/admin/LanguagesPanel.tsx) · Dialog: [LanguageFormDialog](../components/admin/LanguageFormDialog.tsx)
- **Action:** [lib/actions/languages.ts](../lib/actions/languages.ts) — UPDATE keyed by `original_code` hidden input so code can be renamed
- **Edit-only:** no delete button; only deactivate
- **Doc:** [UI/admin.md](./UI/admin.md)

### Tones CRUD (writer-style presets)
- **URL:** `/admin/tones`
- **Page:** [app/admin/(protected)/tones/page.tsx](../app/admin/(protected)/tones/page.tsx)
- **Panel:** [TonesPanel](../components/admin/TonesPanel.tsx) · Dialog: [ToneFormDialog](../components/admin/ToneFormDialog.tsx)
- **Filter by language** at the top
- **Big prompt_fragment editor** with min-length validation (40 chars)
- **Live preview:** combines prompt_fragment + selected complexity from [lib/ai/complexity.ts](../lib/ai/complexity.ts)
- **Action:** [lib/actions/tones.ts](../lib/actions/tones.ts) — language locked in edit mode (uniqueness scope)
- **Doc:** [UI/admin.md](./UI/admin.md)

### AI config
- **URL:** `/admin/ai-config`
- **Page:** [app/admin/(protected)/ai-config/page.tsx](../app/admin/(protected)/ai-config/page.tsx)
- **Form:** [AiConfigForm](../components/admin/AiConfigForm.tsx)
- **Action:** [lib/actions/ai-config.ts](../lib/actions/ai-config.ts) → updates the pinned singleton row `00000000-0000-0000-0000-000000000001`
- **Provider list:** [lib/ai/registry.ts](../lib/ai/registry.ts) — unconfigured providers (missing env key) are disabled with hint
- **Test Connection:** [/api/ai/test](../app/api/ai/test/route.ts) — sends a real Premchand-style Hindi translation as the test prompt
- **Doc:** [UI/admin.md](./UI/admin.md) · [API/ai-test.md](./API/ai-test.md)

### Story listing
- **URL:** `/admin/stories`
- **Page:** [app/admin/(protected)/stories/page.tsx](../app/admin/(protected)/stories/page.tsx)
- **Panel:** [StoriesPanel](../components/admin/StoriesPanel.tsx) — desktop (`md:` and up) renders a `table-fixed` 7-column table; mobile (`< md`) hides the table and renders stacked `StoryMobileCard`s instead (cover · title · category → subcategory · status badge · variant count + tooltip · parts count · Publish/Unpublish). Both render off the same data and filter logic. Cover thumb composed via [coverUrl()](../lib/imagekit/url.ts); title rendered through [toTitleCase()](../lib/utils/title-case.ts) and clipped via shared [Truncate](../components/shared/Truncate.tsx) (single-line ellipsis, full text on hover); title/variant search; status + language filters; variants summary collapsed to a single "N variants" badge + `<pub>/<total>` subline (per-language tooltip on hover); per-row Publish/Unpublish only. Delete is intentionally not exposed in the row — it lives inside the story edit page behind [DeleteConfirmDialog](../components/admin/DeleteConfirmDialog.tsx)
- **Pagination:** client-side over the loaded set (Phase 1 200-story cap). Default 20/page, selector for 10/20/50, Prev/Next + Page X of Y; auto-reset to page 1 on filter or page-size change via the React-19 adjust-state-during-render pattern.
- **Sidebar scroll:** [AdminShell](../components/admin/AdminShell.tsx) is locked to `h-dvh`; only `<main>` scrolls so long tables don't drag the nav off-screen
- **Doc:** [UI/admin.md](./UI/admin.md)

### New story
- **URL:** `/admin/stories/new`
- **Page:** [app/admin/(protected)/stories/new/page.tsx](../app/admin/(protected)/stories/new/page.tsx)
- **Form:** [StoryForm](../components/admin/StoryForm.tsx) — single dense form (no wizard)
- **Cascades:** category → subcategory, language → tone, provider → model
- **Cover upload:** [ImageUploadField](../components/admin/ImageUploadField.tsx) → `/api/upload` returns path
- **Parts entry:** manual rows OR [BulkImportDialog](../components/admin/BulkImportDialog.tsx) (separator default `---`, live preview)
- **Action:** [createStory](../lib/actions/stories.ts) — atomic story+parts insert with rollback on parts failure
- **Doc:** [UI/admin.md](./UI/admin.md)

### Edit story (source + variants + translation)
- **URL:** `/admin/stories/[id]`
- **Page:** [app/admin/(protected)/stories/[id]/page.tsx](../app/admin/(protected)/stories/[id]/page.tsx)
- **Shell:** [StoryEditShell](../components/admin/StoryEditShell.tsx) — **tabbed layout** (built on [components/ui/tabs.tsx](../components/ui/tabs.tsx)): one **Source** tab + one tab per variant; tab labels show `Language · Tone`, a ★ on the primary variant, and a `translatedCount/totalParts` progress badge; **+ Add variant** trigger sits next to the tab strip; the active variant tab defaults to the primary
- **Source tab:** [SourcePartRow](../components/admin/SourcePartRow.tsx) list — label, original text, reorder ↑↓, delete (cascades to every variant's translation of that part) — plus **+ Add empty part**
- **Variant tab:** [VariantPanel](../components/admin/VariantPanel.tsx) — translate queue (SSE), publish toggle, set primary, delete variant, per-(variant, part) [PartCard](../components/admin/PartCard.tsx) editor with autosave on blur, per-part Re-translate, version history
- **Variant tabs use `forceMount`** ([StoryEditShell.tsx](../components/admin/StoryEditShell.tsx)) so a running translate queue isn't aborted when switching tabs
- **Add variant:** [CreateVariantDialog](../components/admin/CreateVariantDialog.tsx) — language + tone + complexity + provider/model + optional "set as primary"
- **Metadata dialog:** [EditStoryMetadataDialog](../components/admin/EditStoryMetadataDialog.tsx) — source fields only (title, author, source URL, category, subcategory, cover); per-variant fields are edited inside each VariantPanel
- **Version history:** [VersionHistoryDialog](../components/admin/VersionHistoryDialog.tsx) — per (variant, part); Restore creates a new version with old text
- **Actions:** [updatePartTexts](../lib/actions/story-parts.ts), [moveStoryPart](../lib/actions/story-parts.ts), [deleteStoryPart](../lib/actions/story-parts.ts), [restorePartVersion](../lib/actions/story-parts.ts), [updateStoryFromForm](../lib/actions/stories.ts), [setStoryPublished](../lib/actions/stories.ts), [deleteStory](../lib/actions/stories.ts), [createVariant / setVariantPublished / setVariantPrimary / deleteVariant](../lib/actions/story-variants.ts)
- **Doc:** [UI/admin.md](./UI/admin.md)

### Translation queue (live)
- **API:** [/api/translate/queue](../app/api/translate/queue/route.ts) — SSE; client uses `fetch().body.getReader()`. Body: `{ variantId, fromPartNumber? }`
- **Core:** [lib/translation/run-part.ts](../lib/translation/run-part.ts) — shared per-(variant, part) flow; input is a `story_part_translations.id`
- **Doc:** [API/translate.md](./API/translate.md)

### Story requests — admin triage
- **URL:** `/admin/requests`
- **Page:** [app/admin/(protected)/requests/page.tsx](../app/admin/(protected)/requests/page.tsx)
- **Panel:** [RequestsPanel](../components/admin/RequestsPanel.tsx) — desktop renders a `table-fixed` 7-column layout (same convention as stories); mobile (`< md`) hides the table and renders stacked `RequestMobileCard`s (label + type badge · language · tone · votes · email · created · status select · Notes · delete). Both render off the same filter logic. Titles/authors normalized via [toTitleCase()](../lib/utils/title-case.ts); long titles/notes/emails clipped on desktop via shared [Truncate](../components/shared/Truncate.tsx) (full value on hover) and wrapped on mobile; Created column shows date + time via shared [formatDateTime()](../lib/utils/format-datetime.ts) with the raw ISO on hover; Notes button shows a `•` indicator when a note exists; inline status dropdown · expandable notes editor · linked-variant pill · delete
- **Actions:** [updateRequestStatus / linkFulfillingVariant / updateRequestAdminNote / deleteRequest](../lib/actions/story-requests.ts)
- **Sidebar entry:** [SidebarNav](../components/admin/SidebarNav.tsx) "Requests"
- **Doc:** [04-database.md §4.12](./04-database.md#412-story_requests)

---

## Cross-cutting

### PWA install + offline
See [INTERNALS/pwa-service-worker.md](./INTERNALS/pwa-service-worker.md).

### Error pages
- **404:** [app/not-found.tsx](../app/not-found.tsx)
- **Public segment error:** [app/(public)/error.tsx](../app/(public)/error.tsx)

### SEO
- **Sitemap:** [app/sitemap.ts](../app/sitemap.ts) — static entries + each active category/subcategory + each published story landing + **one entry per published variant** (`/s/<id>/<slug>/p/1`); ISR revalidate 1h
- **Robots:** [app/robots.ts](../app/robots.ts) — allow `/`, disallow `/admin` + `/api`
- **Metadata:** root layout sets OpenGraph + Twitter + appleWebApp + `metadataBase` from `NEXT_PUBLIC_APP_URL`
- **Per-page titles:** every page exports `generateMetadata` or `metadata`

---

## Out of scope (Phase 1)

Per [01-requirements.md](./01-requirements.md) §4:
- Reader accounts / profiles / login
- Comments / reactions / ratings
- Multi-admin support
- TTS (Phase 2)
- Per-paragraph alignment UI (data structure supports it; UI deferred)
- Translation-cost dashboard
- Background translation queue
- Glossary auto-extraction (manual entry only)
- A/B comparison view of two providers
- Translation memory across stories
- Multi-target translation of one story
