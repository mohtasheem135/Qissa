# Qissa — Feature Map

> Every user-facing feature mapped to the code that implements it. Cross-references back to UI / API / INTERNALS subsections so a question that names a feature can jump to the right file fast.

Source of truth for **what** features should exist: [01-requirements.md](./01-requirements.md). This doc describes **what's actually built**.

---

## Reader-facing

### Browse home page
- **URL:** `/`
- **Page:** [app/(public)/page.tsx](../app/(public)/page.tsx)
- **Components:** [StoryBrowser](../components/shared/StoryBrowser.tsx) (no hero banner, no separate Continue-reading section — search lives in the nav)
- **Layout:** sticky filter bar (category → subcategory → language) + grid/list toggle (grid default) over an **infinite-scroll** list; each item shows cover · title · reading time only
- **Data:** server-renders page 0 of stories + the categories→subcategories tree + active languages (filter options built from `!inner` joins so they only list options with published stories); the browser client lazy-loads later pages & re-filters via `fetchStoryCards()` ([lib/reader/story-cards.ts](../lib/reader/story-cards.ts), `STORY_PAGE_SIZE = 24`)
- **Doc:** [UI/public.md](./UI/public.md)

### Continue reading (Resume badge)
- **Where:** surfaced inline in the home [StoryBrowser](../components/shared/StoryBrowser.tsx), not a separate section
- **State:** `qissa:last-read` in localStorage; written by [savePartProgress()](../lib/reader/progress.ts), read via `getLastRead()`
- **UX:** the grid/list card whose `id` matches the last-read pointer shows a clean **"Resume"** badge in the cover's top-right corner, and that card deep-links to `/s/<id>/<variantSlug>/p/<partNumber>` instead of the story landing. Read on mount (client-only), so it's absent on first server paint and appears after hydration.

### Browse by category
- **URLs:** `/c/[categorySlug]` → subcategories grid; `/c/[categorySlug]/[subcategorySlug]` → story grid
- **Pages:** [app/(public)/c/[categorySlug]/page.tsx](../app/(public)/c/[categorySlug]/page.tsx) · [app/(public)/c/[categorySlug]/[subcategorySlug]/page.tsx](../app/(public)/c/[categorySlug]/[subcategorySlug]/page.tsx)
- **Limits:** subcategory page caps at 60 stories (no pagination yet — Phase 1.5)
- **Doc:** [UI/public.md](./UI/public.md)

### Search
- **URL:** `/search?q=…`
- **Page:** [app/(public)/search/page.tsx](../app/(public)/search/page.tsx)
- **Backed by:** the `search_stories(q, max_results)` Postgres RPC ([migration 0004](../supabase/migrations/20260529120000_search_stories_rpc.sql)) — ORs ILIKE across `stories.title_original`, `stories.author_original`, and per-variant `story_variants.title_translated` (published variants only). Returns ranked story IDs by best-of-three `pg_trgm.similarity` score; the page then fetches the full STORY_CARD_COLUMNS for those IDs and reorders to preserve the RPC ranking
- **Indexes:** pg_trgm GIN on `stories.title_original` ([migration 0001](../supabase/migrations/20260522120001_initial.sql)), plus `stories.author_original` and `story_variants.title_translated` (migration 0004)
- **Wildcard safety:** `%`, `_`, and `\` in user input are escaped client-side before being concatenated into the RPC's ILIKE patterns
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
- **No standalone Parts list:** readers enter via the variant or source cards; per-variant progress is tracked in localStorage and surfaced as the home Resume badge
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

### Tap-to-define dictionary popover
- **URL:** any variant reader page (`/s/[storyId]/[variantSlug]/p/[partNumber]`)
- **Trigger:** single tap on a body paragraph word (with no active text selection — long-press / drag-select still surface the system copy menu)
- **Resolver:** `Intl.Segmenter(targetLanguage, { granularity: 'word' })` in [ReaderBody](../components/reader/ReaderBody.tsx) — handles Devanagari, Arabic, Tamil etc.; falls back to a Unicode `\p{Letter}\p{Mark}\p{Number}` regex on older browsers
- **Popover:** [DefinitionPopover](../components/reader/DefinitionPopover.tsx) — anchored to the word's bounding rect, flips above/below to fit the viewport, dismisses on outside click / Escape / scroll / resize
- **Source:** [/api/dictionary](../app/api/dictionary/route.ts) proxies English Wiktionary's REST definition API; returns `primary` (target-language sections) + `others` (cross-language fallbacks) — see [API/dictionary.md](./API/dictionary.md)
- **Save toggle:** stores `{ word, languageCode, savedAt, storyId, variantSlug, partNumber }` in `qissa:vocab` ([lib/reader/vocab.ts](../lib/reader/vocab.ts)) — surfaced at `/my-words`
- **Source reader excluded:** the source reader passes `targetLanguage: null`, which disables the popover (we don't know the source language per story)
- **Doc:** [UI/reader.md](./UI/reader.md) · [API/dictionary.md](./API/dictionary.md) · [INTERNALS/reader-state.md](./INTERNALS/reader-state.md)

### My words (saved vocab)
- **URL:** `/my-words`
- **Page:** [app/(public)/my-words/page.tsx](../app/(public)/my-words/page.tsx)
- **Storage:** [lib/reader/vocab.ts](../lib/reader/vocab.ts) — mirrors the bookmarks pattern (cached snapshot + cross-tab sync via `qissa:vocab-changed` + native `storage` event)
- **UX:** newest-first list; each row links back to the reader page where the word was tapped (if context was captured) and to the Wiktionary entry; trash button removes
- **Discoverable from:** the `/bookmarks` page header surfaces "My words (N)" link

### Text-selection highlights
- **URL:** any reader page (variant + source)
- **Trigger:** select text while reading (mouse drag on desktop, long-press on mobile) — a small floating colour bar ([HighlightToolbar](../components/reader/HighlightToolbar.tsx)) appears above the selection. The live selection is read via [getSelectionSegments](../lib/reader/selection.ts)
- **Colours:** yellow · green · blue. Tapping a swatch tints only the selected words and clears the selection. A selection spanning multiple paragraphs creates one highlight per paragraph it touches
- **Edit:** tap an existing highlight (`<mark>`) to reopen the toolbar in edit mode — change colour, add/edit a note (persisted on blur), or remove
- **Note (optional):** plain text on a highlight, edited in the popover
- **Visual:** each stored range renders as a `<mark class="reader-highlight" data-colour=…>` in the translated text; translucent per-colour backgrounds (~0.34–0.38 alpha) read across all 5 themes including Night and Focus — see [globals.css](../app/globals.css)
- **Source reader supported:** unlike tap-to-define, highlights work in the source reader too (no language dependency)
- **Storage:** [lib/reader/highlights.ts](../lib/reader/highlights.ts) — `qissa:highlights` array of `{ id, storyId, variantSlug, partNumber, paragraphIndex, startOffset, endOffset, colour, snippet, note?, createdAt }`. `addHighlight` appends a range, `updateHighlight` patches colour/note, `removeHighlight` deletes; cross-tab sync via the same pattern as bookmarks/vocab
- **Doc:** [UI/reader.md](./UI/reader.md) · [INTERNALS/reader-state.md](./INTERNALS/reader-state.md)

### Highlights index
- **URL:** `/highlights`
- **Page:** [app/(public)/highlights/page.tsx](../app/(public)/highlights/page.tsx) (pure Client Component)
- **UX:** newest-first list of every saved highlight with the colour-tinted snippet, optional note, part number, save date, "Back to the paragraph" deep link, and trash button. Deep link goes to `/s/<id>/<slug>/p/<n>#h-<paragraphIndex>` — [ReaderBody](../components/reader/ReaderBody.tsx) picks up that hash on mount and `scrollIntoView`-s the matching `[data-paragraph]` to viewport centre
- **Discoverable from:** the `/bookmarks` page header surfaces "Highlights (N)" link alongside "My words (N)"

### Share button
- **Component:** [ShareButton](../components/shared/ShareButton.tsx)
- **Used on:** story landing + reader top bar
- **API:** Web Share API with clipboard fallback

### Listen to this page (audio narration)
- **Control:** [ListenButton](../components/reader/ListenButton.tsx) in the reader top bar (right of the variant picker)
- **Stored audio:** plays the admin-generated R2 MP3 (play/pause/seek + speed) when present
- **Free fallback:** the device's Web Speech API ([lib/reader/speech.ts](../lib/reader/speech.ts)) narrates in the variant's language when there's no stored audio — so Listen always works
- **Data:** the part page fetches the completed [`story_part_audio`](./04-database.md#416-story_part_audio) row; URL composed by [audioUrl()](../lib/r2/url.ts)
- **Offline:** premium audio replays from the SW cache after one play
- **Scope:** variant readers only (source reader has no tracked language — deferred)
- **Doc:** [UI/reader.md](./UI/reader.md) · [INTERNALS/tts-provider-adapter.md](./INTERNALS/tts-provider-adapter.md)

### Choose narration voice (Web Speech)
- **Where:** reader settings dialog → "Narration voice" section ([ReaderSettings](../components/reader/ReaderSettings.tsx))
- **What:** a per-language Select of the device's installed voices for the variant's language ([listVoicesForLanguage()](../lib/reader/speech.ts)) + "Auto (default)", refreshed on `voiceschanged`
- **Storage:** `settings.narrationVoiceByLang[langCode] = voiceURI` in `qissa:reader-settings` ([reader-settings.ts](../lib/reader/reader-settings.ts)); back-compat via the existing defaults merge
- **Threading:** [ReaderShell](../components/reader/ReaderShell.tsx) → [ReaderChrome](../components/reader/ReaderChrome.tsx) → [ListenButton](../components/reader/ListenButton.tsx) → `createSpeechController(..., voiceURI)`; `pickVoice` honours the saved URI if it still exists
- **Scope:** the **free** Web Speech fallback only — stored studio audio is unaffected
- **Doc:** [UI/reader.md](./UI/reader.md) · [INTERNALS/reader-state.md](./INTERNALS/reader-state.md)

### Offline support
- **Service worker:** [public/sw.js](../public/sw.js) — registered by [ServiceWorkerRegistration](../components/shared/ServiceWorkerRegistration.tsx) in production only
- **Strategies:** network-first HTML / cache-first images + audio / SWR static / network-only admin+API
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
- **Queries:** [lib/analytics/translation-stats.ts](../lib/analytics/translation-stats.ts) + [lib/analytics/audio-stats.ts](../lib/analytics/audio-stats.ts) (server-only) + [lib/analytics/translation-stats.types.ts](../lib/analytics/translation-stats.types.ts) (client-safe types, shared `RangeKey`)
- **Pricing:** [lib/analytics/pricing.ts](../lib/analytics/pricing.ts) — editable per-1M-token table (`<provider>:<model>`) + per-1M-char TTS table `TTS_PRICES_PER_MILLION_CHARS`
- **Sections:** KPIs (attempts · success rate · avg latency · est. cost) · daily activity sparkline · cost trend sparkline · provider/model breakdown (desktop table + mobile cards) · admin override rate per model (quality signal) · top errors with last-seen
- **Data sources:** `translation_jobs` (per-attempt log: tokens, latency, provider, model, status, error) + `story_part_versions` (`created_by ∈ {ai, admin}` drives override rate)
- **Charts:** inline SVG [Sparkline](../components/admin/AnalyticsCharts.tsx) + [ProgressBar](../components/admin/AnalyticsCharts.tsx) — no chart library dependency
- **Doc:** [UI/admin.md](./UI/admin.md)

### Audio-model usage analytics (cost + characters per model/voice)
- **Where:** the **Audio narration** section of `/admin/analytics`, below the translation one (same range filter)
- **Query:** [lib/analytics/audio-stats.ts](../lib/analytics/audio-stats.ts) `fetchAudioAnalytics(range)` — reads `tts_jobs` (provider, `tts_model`, voice, status, characters, latency, error), capped at 10k rows
- **Sections:** KPIs (runs · success rate · characters · avg latency · est. cost) · provider/model usage table · voice usage list · top audio errors
- **Pricing:** char-based (TTS bills by characters, not tokens) — [pricing.ts](../lib/analytics/pricing.ts) `estimateTtsCost(provider, model, characters)` vs `TTS_PRICES_PER_MILLION_CHARS` (key `"<provider>:<model>"`, e.g. `"sarvam:bulbul:v3"`) — rough placeholder rates the admin should edit
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

### TTS / Voices config
- **URL:** `/admin/tts-config`
- **Page:** [app/admin/(protected)/tts-config/page.tsx](../app/admin/(protected)/tts-config/page.tsx)
- **Form:** [TtsConfigForm](../components/admin/TtsConfigForm.tsx) — Provider · **Model** · Voice selects (voice scoped to model)
- **Action:** [lib/actions/tts-config.ts](../lib/actions/tts-config.ts) → updates the pinned `tts_config` singleton (`default_tts_provider` + `default_tts_model` + `default_voice_id`)
- **Providers/voices:** [lib/tts/registry.ts](../lib/tts/registry.ts) — Sarvam + ElevenLabs; unconfigured providers disabled with "missing ENV_KEY" hint
- **Test Connection:** [/api/tts/test](../app/api/tts/test/route.ts) — synthesizes a short sample and plays it inline
- **Sidebar entry:** [SidebarNav](../components/admin/SidebarNav.tsx) "TTS / Voices"
- **Doc:** [UI/admin.md](./UI/admin.md) · [API/tts.md](./API/tts.md) · [INTERNALS/tts-provider-adapter.md](./INTERNALS/tts-provider-adapter.md)

### Choose TTS model (Sarvam v2/v3, ElevenLabs variants)
- **What:** each provider exposes a **list** of synthesis engines; the admin picks a global default in `/tts-config` and can override per variant (mirrors provider/voice). Voices are **model-specific** — Sarvam `bulbul:v3` (audiobook, 36 voices) and `bulbul:v2` (legacy, 7 voices) have entirely different speakers, so the voice picker is scoped to the chosen model everywhere; ElevenLabs models (`eleven_multilingual_v2` default, `eleven_turbo_v2_5`, `eleven_flash_v2_5`) are model-agnostic
- **Registry:** [lib/tts/registry.ts](../lib/tts/registry.ts) — `TtsModel`, `TTS_PROVIDERS[].models`/`defaultModel`, `getVoicesForLanguage(provider, lang, model?)`, resolvers `getTtsModelMeta`/`resolveTtsModel`/`resolveTtsVoice`
- **Resolution (synthesis):** [runStoryPartAudio](../lib/tts/run-part.ts) picks model = explicit override > `variant.tts_model` > `tts_config.default_tts_model` > provider default, then the voice **scoped to that model**; writes `tts_model` to [`story_part_audio`](./04-database.md#416-story_part_audio) + [`tts_jobs`](./04-database.md#417-tts_jobs)
- **Persistence:** `tts_config.default_tts_model` + `story_variants.tts_model` ([migration](../supabase/migrations/20260530150000_tts_model_selection.sql)); `model` accepted by [/api/tts](../app/api/tts/route.ts), [/api/tts/queue](../app/api/tts/queue/route.ts), [/api/tts/test](../app/api/tts/test/route.ts)
- **Doc:** [INTERNALS/tts-provider-adapter.md](./INTERNALS/tts-provider-adapter.md) · [API/tts.md](./API/tts.md) · [UI/admin.md](./UI/admin.md)

### Per-variant audio generation
- **Where:** the Audio section in each [VariantPanel](../components/admin/VariantPanel.tsx) (provider + **model** + voice picker — model shown only when a provider has >1, voice scoped to model — "Generate audio (N)" → SSE queue, Cancel) + per-part Generate/Re-generate + ▶ preview in [PartCard](../components/admin/PartCard.tsx)
- **API:** [/api/tts](../app/api/tts/route.ts) (single) · [/api/tts/queue](../app/api/tts/queue/route.ts) (SSE)
- **Core:** [lib/tts/run-part.ts](../lib/tts/run-part.ts) — `runStoryPartAudio(translationId)`; stores to R2, rows in [`story_part_audio`](./04-database.md#416-story_part_audio)
- **Voice persistence:** [setVariantVoice](../lib/actions/story-variants.ts)`(id, provider, model, voiceId)` writes `story_variants.tts_provider` + `tts_model` + `tts_voice_id`
- **Doc:** [UI/admin.md](./UI/admin.md) · [API/tts.md](./API/tts.md)

### Emotion narration script (expressive TTS)
- **What:** a second per-translation script (`story_part_translations.emotion_text`) that audio narrates instead of the clean reading `text` — emotion via punctuation/pacing + `<break time="…"/>` tags only, never read aloud. Keeps the reading translation byte-for-byte identical
- **Prompt:** [lib/ai/prompt-builder.ts](../lib/ai/prompt-builder.ts) narration-director branch, selected by `TranslationInput.task === "narrate"`; [narrate()](../lib/ai/translate.ts) wraps `translate()` with zero provider changes
- **Generation:** [runStoryPartNarration()](../lib/translation/run-narration.ts) — lazy (run by [runStoryPartAudio](../lib/tts/run-part.ts) when `emotion_text` is empty, or via the admin [generateNarration](../lib/actions/story-parts.ts) action). Audio falls back to plain `text` if the script is empty/failed — never blocks
- **Admin UI:** [PartCard](../components/admin/PartCard.tsx) "Reading | Narration" segmented toggle (each column autosaves on blur) + "Generate narration script" button + status badge (generating/ready/failed)
- **Schema:** `emotion_text` + `emotion_status` on [`story_part_translations`](./04-database.md#411-story_part_translations) ([migration](../supabase/migrations/20260530130000_emotion_narration.sql)); **not versioned** in v1 (future work)
- **Doc:** [INTERNALS/tts-provider-adapter.md](./INTERNALS/tts-provider-adapter.md) · [INTERNALS/ai-provider-adapter.md](./INTERNALS/ai-provider-adapter.md) · [UI/admin.md](./UI/admin.md)

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
- **Parts entry:** manual rows OR [BulkImportDialog](../components/admin/BulkImportDialog.tsx) — **By separator** (default `---`) or **Auto-split** mode, both with live preview
- **Action:** [createStory](../lib/actions/stories.ts) — atomic story+parts insert with rollback on parts failure
- **Doc:** [UI/admin.md](./UI/admin.md)

### Smart auto-split (story creation)
- **Where:** [BulkImportDialog](../components/admin/BulkImportDialog.tsx) "Auto-split" mode — a "Target words per part" input (default 800) + live per-part word-count preview
- **Core:** [smartSplit(text, { targetWords })](../lib/stories/smart-split.ts) — splits paragraphs ([splitParagraphs](../lib/reader/paragraphs.ts)), pre-splits any oversized paragraph on sentence boundaries (same Latin + Devanagari danda regex as [lib/tts/chunk.ts](../lib/tts/chunk.ts)), greedily packs into near-equal parts, merges a runt trailing part. Never breaks mid-sentence → TTS-smooth
- **Flow:** reuses the existing `onImport(parts)` callback into [StoryForm](../components/admin/StoryForm.tsx) + [createStory](../lib/actions/stories.ts); no schema/action changes. **Creation-only** (an "append to existing story" tool could reuse `smartSplit` later)
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
- **Open Graph / Twitter card images (1200×630):**
  - **Per-story:** [app/(public)/s/[storyId]/opengraph-image.tsx](../app/(public)/s/[storyId]/opengraph-image.tsx) — composes cover (via ImageKit `w-360,h-480` transform) + title (auto-scaled by length) + author + up to 4 published-language pills + Qissa wordmark. Edge-runtime via `next/og` `ImageResponse`. Twitter card re-exports it from [twitter-image.tsx](../app/(public)/s/[storyId]/twitter-image.tsx).
  - **Root brand mark:** [app/opengraph-image.tsx](../app/opengraph-image.tsx) + [twitter-image.tsx](../app/twitter-image.tsx) — covers `/`, `/c/*`, `/search`, anywhere without its own OG. Same 1200×630 layout as the per-story fallback.
  - **Why:** generic OG meta from the root layout lifted every share to a text-only preview. The per-story image makes a share into the actual cover + title social platforms can render — major click-through lift on the same share button surface.

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
