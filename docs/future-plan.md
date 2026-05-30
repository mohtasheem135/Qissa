# Qissa — Feature Enhancement Plan

> **Last updated: 2026-05-29** — All five Tier-1 items shipped. Tier 2 is the next sprint.
> Resume by jumping to **[§ Where I left off](#where-i-left-off)** below; everything above ✅ has working code merged on `main`.

---

## Where I left off

### Status at a glance

| Tier | Item | Status | Branch / Commit | PR |
|---|---|---|---|---|
| 1.3 | Admin Analytics dashboard | ✅ Merged | `feat/admin-analytics-dashboard` · `f8db8fb` | #7 (`3ccebcb`) |
| 1.1 | Tap-to-define popover | ✅ Merged | `feat/reader-tap-to-define` · `be5712e` | #8 (`ba0cab5`) |
| 1.5 | OG images per story | ✅ Merged | `feat/og-images` · `6362857` | #9 (`067be03`) |
| —   | OG image overflow hotfix | ✅ Merged | `fix/og-image-overflow` · `07bc281` | #10 (`7b89a0a`) |
| 1.4 | Translated-title + author search | ✅ Merged ⚠️ | `feat/search-translated-titles` · `746a2a2` | #11 (`d506b24`) |
| 1.2 | Text-selection highlights | 🟡 PR open | `feat/paragraph-highlights` · `4fb8c28` (reworked to selection-based) | — pending |

### ⚠️ Outstanding manual step

The translated-title search PR merged the code, but the matching SQL migration only takes effect after a push to the linked Supabase project. **If you haven't already done this** since merging #11, run:

```bash
npx supabase db push
# Optional — regenerate types so search_stories comes from the source schema,
# not the hand-written stub I added to lib/supabase/types.ts:
npx supabase gen types typescript --linked --schema public > lib/supabase/types.ts
awk 'found || /^export / { found=1; print }' lib/supabase/types.ts > /tmp/t && mv /tmp/t lib/supabase/types.ts
npm run typecheck
```

Until the migration is pushed, hitting `/search?q=…` will surface "missing function `search_stories`" at runtime even though the UI renders. If you verified after merge, ignore this.

### Next action

**Pick up Tier 2.** My recommendation for the next sprint is the trio in [§ Sprint recommendation](#sprint-recommendation) below: **2.5 (keyboard + a11y) → 2.2 (variant compare) → 2.7 (inline version diff)**.

You can also just say `next plan` and I'll start with 2.5.

---

## Context

Qissa is a fully shipped Phase-1 reading PWA: 5 themes, RTL, pinch-zoom, offline, multi-variant translations, admin console, request system. Tier-1 work over the last sprint surfaced data that was already in the DB but invisible, added the high-value reader retention features (tap-to-define, highlights), and lifted shared-link previews. Tier 2 is now the right scope: broader reader polish + admin QoL + the side-by-side feature that shows off what Qissa uniquely does.

Sources I leaned on: [docs/ARCHITECTURE.md](../../ME%20personal/Qissa/docs/ARCHITECTURE.md), [docs/FEATURES.md](../../ME%20personal/Qissa/docs/FEATURES.md), schema in [supabase/migrations/](../../ME%20personal/Qissa/supabase/migrations/).

---

## Patterns established during Tier 1

These conventions are now load-bearing across the codebase. When picking up Tier 2 work, reuse them rather than inventing:

- **Cached-snapshot + cross-tab CustomEvent localStorage stores.** Three modules now follow this exact shape: [bookmarks.ts](../../ME%20personal/Qissa/lib/reader/bookmarks.ts), [vocab.ts](../../ME%20personal/Qissa/lib/reader/vocab.ts), [highlights.ts](../../ME%20personal/Qissa/lib/reader/highlights.ts). Each exports `getX() / subscribeX()` plus mutators (`add/update/remove`, or `toggle` for set-like stores) with a frozen `EMPTY` singleton, a `cachedRaw / cachedSnapshot` pair, and a `qissa:<feature>-changed` CustomEvent paired with the native `storage` event. If Tier 2 needs another (e.g. `qissa:streak`), copy one of these wholesale and rename.
- **Server-only / client-shared `*.types.ts` split.** [lib/analytics/translation-stats.ts](../../ME%20personal/Qissa/lib/analytics/translation-stats.ts) (server-only) re-exports types from a sibling [translation-stats.types.ts](../../ME%20personal/Qissa/lib/analytics/translation-stats.types.ts) (client-safe). Same pattern for dictionary ([types.ts](../../ME%20personal/Qissa/lib/dictionary/types.ts) + [wiktionary.ts](../../ME%20personal/Qissa/lib/dictionary/wiktionary.ts)). Use this whenever a client component needs to import a type from a module that has `import "server-only"`.
- **Microtask-defer for state resets in effects.** React 19's `react-hooks/set-state-in-effect` lint forbids synchronous `setState` inside `useEffect`. [DefinitionPopover](../../ME%20personal/Qissa/components/reader/DefinitionPopover.tsx) and [HighlightToolbar](../../ME%20personal/Qissa/components/reader/HighlightToolbar.tsx) both wrap reset code in `Promise.resolve().then(() => { ... })`. Reuse this when an effect needs to reset transient state on prop change.
- **Popover dismissal: outside click / Escape / scroll / resize.** Established by DefinitionPopover and reused by [HighlightToolbar](../../ME%20personal/Qissa/components/reader/HighlightToolbar.tsx). Scroll dismisses because the anchor rect is stale once the page moves. Copy this `useEffect` verbatim for any new floating popover.
- **Never mutate a localStorage store inside a `setState(updater)`.** These stores emit a change event on write (`writeX → emitChange`), which makes every subscribed `useSyncExternalStore` schedule a re-render. A functional state updater (`setX(cur => …)`) runs **during render**, so calling `addHighlight()`/`saveWord()`/etc. inside one triggers a "Cannot update a component while rendering" error (hit in [ReaderBody](../../ME%20personal/Qissa/components/reader/ReaderBody.tsx) when picking a highlight colour). Do the mutation in the event-handler body, read current state from the closure (add it to the `useCallback` deps), and pass a plain value to `setX`.
- **`*-image.tsx` Open Graph routes.** Per-story OG ([opengraph-image.tsx](../../ME%20personal/Qissa/app/(public)/s/[storyId]/opengraph-image.tsx)) + matching [twitter-image.tsx](../../ME%20personal/Qissa/app/(public)/s/[storyId]/twitter-image.tsx) that re-exports it. Use `next/og` `ImageResponse` with `objectFit: "contain"` and `c-at_max` ImageKit transforms so uploaded covers never get cropped.
- **Postgres RPC for cross-table OR-filters.** The translated-title search migration ([20260529120000_search_stories_rpc.sql](../../ME%20personal/Qissa/supabase/migrations/20260529120000_search_stories_rpc.sql)) shows the pattern: `security invoker` so RLS still applies, double-filter in the body for safety, grant to `anon + authenticated`, hand-add the signature to `lib/supabase/types.ts` Functions block so typecheck passes before `db push`.
- **Inline SVG charts.** [AnalyticsCharts.tsx](../../ME%20personal/Qissa/components/admin/AnalyticsCharts.tsx) (`Sparkline` + `ProgressBar`) avoids adding a chart library. If Tier 2's admin analytics needs richer charts, extend these before reaching for `recharts`.

---

## Tier 1 — ✅ DONE

The full code, docs, and PR descriptions for these live in the project. Brief recap so you don't have to dig:

### 1.3 Admin Analytics dashboard ✅
**Shipped:** `/admin/analytics` page surfacing translation cost, success rate, latency, retry rates, admin override rate (AI vs admin from `story_part_versions.created_by`), top errors. URL-driven `?range=7d|30d|90d|all`. Pricing in editable [pricing.ts](../../ME%20personal/Qissa/lib/analytics/pricing.ts).
**Where to extend:** Add a "story-level cost" breakdown (cost per published story) — the per-job data is there.

### 1.1 Tap-to-define dictionary popover ✅
**Shipped:** Tap any word in the variant reader → popover with Wiktionary definitions, save toggle. New [/api/dictionary](../../ME%20personal/Qissa/app/api/dictionary/route.ts) proxy, [/my-words](../../ME%20personal/Qissa/app/(public)/my-words/page.tsx) page, [qissa:vocab](../../ME%20personal/Qissa/lib/reader/vocab.ts) store. Uses `Intl.Segmenter(targetLanguage)` for word resolution (Indic / RTL friendly).
**Where to extend:** Wire admin-curated terms into the popover before falling back to Wiktionary (Tier 3 item 3.3 — glossary auto-extraction).

### 1.5 OG images per story ✅ (+ 1 hotfix)
**Shipped:** [opengraph-image.tsx](../../ME%20personal/Qissa/app/(public)/s/[storyId]/opengraph-image.tsx) renders a 1200×630 card with cover + title + author + language pills. Root brand-mark OG at [app/opengraph-image.tsx](../../ME%20personal/Qissa/app/opengraph-image.tsx) covers everywhere else. Twitter cards re-export from OG.
**Lesson learned:** the original layout overflowed → footer covered the cover bottom. Now uses a two-column flex row with `objectFit: contain`. Don't go back to fixed-height covers without re-checking the math.

### 1.4 Translated-title + author search ✅ (⚠️ db push required if not done)
**Shipped:** `search_stories(q, max_results)` RPC ORs ILIKE across `stories.title_original`, `stories.author_original`, `story_variants.title_translated`. Returns ranked story IDs by best-of-three `pg_trgm.similarity`. Page fetches full STORY_CARD_COLUMNS for the IDs and reorders client-side.
**Outstanding:** ⚠️ Run `npx supabase db push` if you haven't already — see banner above.

### 1.2 Text-selection highlights 🟡 PR open
**Shipped (on `feat/paragraph-highlights`, reworked to selection-based):** Select any text while reading (drag on desktop, long-press on mobile) → a floating colour bar ([HighlightToolbar](../../ME%20personal/Qissa/components/reader/HighlightToolbar.tsx)) → pick yellow/green/blue and only the selected words get a `<mark>` tint (works on all 5 themes). Tap an existing highlight to change colour, add a note, or remove it. Each highlight stores a character range (`paragraphIndex` + `startOffset`/`endOffset`) computed by [selection.ts](../../ME%20personal/Qissa/lib/reader/selection.ts); a selection spanning paragraphs creates one per paragraph. [/highlights](../../ME%20personal/Qissa/app/(public)/highlights/page.tsx) lists every saved highlight with `#h-<paragraphIndex>` deep links that scroll back to the paragraph. [/bookmarks](../../ME%20personal/Qissa/app/(public)/bookmarks/page.tsx) header surfaces "Highlights (N)" + "My words (N)" links side-by-side. The original margin-dot/per-paragraph model (`HighlightHandle` + `HighlightMenu`) was replaced — it was nearly untappable on mobile (hover-revealed dot).
**To do:** Review the PR, merge it.

---

## Tier 2 — Big experience wins (next sprint)

### 2.1 Reading streaks + daily goal (gentle gamification)
- `qissa:streak` = `{ currentDays, longestDays, lastReadDate, dailyWordGoal, todayWords }`.
- Small flame indicator in the public top bar; "🔥 5-day streak" toast on threshold.
- Settings toggle to disable for users who hate it.
- All localStorage — no accounts needed. **Reuse the cached-snapshot store pattern** (see Patterns above).

### 2.2 Side-by-side variant comparison
- New URL: `/s/[storyId]/compare?left=hindi-simple&right=urdu-formal`.
- Two scroll-synced columns sharing the same `story_parts` row alignment.
- Brilliant for language learners and for showcasing what your project uniquely does.
- The paragraph-pair model from [pairParagraphs()](../../ME%20personal/Qissa/lib/reader/paragraphs.ts) extends naturally to two variants instead of original+translated.

### 2.3 Author pages
- `authors` table (or normalize from `stories.author_original`).
- `/a/[authorSlug]` — bio, photo, list of stories grouped by language.
- Boosts SEO surface (sitemap entries) and gives a natural home for "Read more by ___."
- Migration territory — same workflow as 1.4.

### 2.4 Explicit "Download for offline"
- Today's SW caches what you've already viewed. Add a button on story landing that pre-fetches *all parts of the primary variant* into the cache so a 3-hour flight works.
- Show a small "Available offline" pill once cached.
- Implementation: `caches.open(...)` + `fetch()` each part URL. See [public/sw.js](../../ME%20personal/Qissa/public/sw.js) for the existing cache name.

### 2.5 Reader keyboard + accessibility polish
- `J/K` paragraph nav, `←/→` part nav, `T` theme cycle, `=`/`-` font size, `?` help sheet.
- Skip-to-content link, semantic `<main>/<article>` landmarks, focus-visible rings.
- Optional **OpenDyslexic** font in the font-variant select.
- High-contrast theme #6 (AA contrast guaranteed).
- Lowest risk of the Tier-2 items, broad benefit — strong sprint-starter.

### 2.6 Admin: bulk + schedule
- Bulk select on stories list → publish/unpublish/translate (kicks N queues).
- `stories.scheduled_publish_at` column → cron-style check (Vercel cron) flips status when due.

### 2.7 Inline diff for version history
- [VersionHistoryDialog](../../ME%20personal/Qissa/components/admin/VersionHistoryDialog.tsx) currently lists versions. Add a word-level diff between two selected versions (use the `diff` npm package). Massive admin QoL when comparing AI outputs across providers.
- Now that 1.3 (analytics) surfaces admin-override rate per model, the diff view becomes the natural drill-down: "model X has a 40% override rate — let me see *what* the admin keeps changing."

---

## Tier 3 — Strategic / Phase-2 ideas

These reshape the product, not just polish it.

### 3.1 TTS (Phase 2 in your docs)
- Browser `SpeechSynthesis` works free for English/Hindi but is rough on Urdu/Arabic prose.
- Better: ElevenLabs / Google Cloud TTS per-language. Cache audio in Supabase Storage per `story_part_translations.id`. Pre-generate at publish-time; reader gets a play button.
- Costs scale with traffic — gate behind a `tts_enabled` flag per variant.

### 3.2 Reader accounts (lightweight)
- Magic-link email auth (Supabase Auth, already wired for admin — flip the public sign-up switch).
- Sync bookmarks, **highlights, vocab,** progress across devices.
- The localStorage shapes are already perfect cloud-table shapes — bookmarks → `bookmarks(user_id, story_id)`, vocab → `vocab(user_id, word, language_code, …)`, highlights → `highlights(user_id, story_id, variant_slug, part_number, paragraph_index, start_offset, end_offset, colour, …)`.
- Out-of-scope in Phase 1 docs but the natural Phase-2 unlock.

### 3.3 Glossary auto-extraction (also in your Phase 1.5 list)
- Post-translate: ask the same provider to extract 5–10 culturally specific terms with brief glosses per part.
- Store in a `story_glossary` table → surface in a "Glossary" tab on story landing.
- Feeds into 1.1 (tap-to-define) when a curated term is tapped — promote glossary hits above Wiktionary in the popover.

### 3.4 Public RSS + per-language feed
- `/feeds/all.xml`, `/feeds/[langCode].xml`.
- Indic-language podcast/reader apps and email-digest tools both consume RSS — cheap distribution.

### 3.5 Web Share Target
- Add `share_target` to `app/manifest.ts` so users can "share to Qissa" from another app to drop a URL/text in a request form. Pure config + one route.

---

## Quick wins (a few hours each)

Worth doing alongside any Tier-2 item:

- **Show author + source URL** on story landing — they're in the DB ([stories table](../../ME%20personal/Qissa/supabase/migrations/)), never rendered to readers. *(Story landing already shows author below the title — verify, and add source URL.)*
- **Reading-minutes badge** on story cards — `estimated_reading_minutes` is computed and stored on `story_variants` but only the landing uses it.
- **"More like this"** strip at the bottom of the reader — siblings from the same subcategory, same language. One query, zero new tables.
- **Recently read history** page (not just last-read) — keep a ring buffer of the last 20 in localStorage. Reuse the cached-snapshot store pattern.
- **Per-language home filter pill** — `?lang=hi` filter on `/`.
- **Story status badges** on cards — "✓ Read" / "⏳ In progress" derived from existing per-part progress.
- **Persist sidebar collapsed state** in admin.
- **Search-as-you-type** debounced suggestions in the public top bar — now possible since the `search_stories` RPC exists.
- **Promote the search RPC**: the page hits it via `await supabase.rpc(...)` once per submit. A debounced 200ms suggester would feel instant.

---

## Sprint recommendation

If I were picking three to do this next sprint (after the highlights PR merges):

1. **2.5 Keyboard + a11y polish** — broad benefit, low risk, no schema changes. The right way to start the sprint.
2. **2.2 Side-by-side variant comparison** — your single most product-differentiating feature still unbuilt. With four Tier-1 reader features now landed, the comparison UI gets a polished platform to plug into.
3. **2.7 Inline diff for version history** — natural pairing with the analytics dashboard that landed last sprint. Closes the "what specifically does the admin keep rewriting?" loop.

Then pick up **2.1 streaks** + **2.4 download-for-offline** in the following sprint.

---

## Verification checklist (every PR)

- `npm run typecheck && npm run lint && npm run build` clean.
- For reader features: test in Chrome desktop, then iOS Safari + Android Chrome PWA mode — the auto-hide chrome + pinch-zoom interactions in [ReaderShell](../../ME%20personal/Qissa/components/reader/ReaderShell.tsx) are touch-sensitive and easy to regress.
- For admin features: smoke against a published story with ≥2 variants and at least one failed `translation_jobs` row (re-run [scripts/smoke-translate.ts](../../ME%20personal/Qissa/scripts/smoke-translate.ts) with a bad key to seed one).
- For DB-touching features: write the migration, **don't run `db push` without explicit user OK**, hand-add any new RPC signatures to `lib/supabase/types.ts` Functions block, document the post-merge `db push` step in the commit body and PR description.
- For OG images: after deploy, force-refresh the WhatsApp / Twitter / Facebook share inspectors — they cache for 7 days.
- Update the docs that match the table in CLAUDE.md "Doc-update rules" — analytics → `docs/UI/admin.md`; reader features → `docs/UI/reader.md` + `docs/INTERNALS/reader-state.md`; new feature → `docs/FEATURES.md`; new module folder → `docs/ARCHITECTURE.md` module map.
- Per-branch hygiene: branch off latest `main`, commit with the `feat(scope): …` style (matches existing log), push to a fresh branch with `-u origin`, leave PR creation to the user.

---

## Git workflow notes (for future me)

- All Tier-1 PRs were branched off `main`, not stacked. Conflicts only arose where two branches both inserted rows into the same doc table (`docs/ARCHITECTURE.md` module map). Standard rebase resolves them in seconds.
- When stashing changes across branches, use `git stash push -u` to include untracked files. New files don't conflict on pop; only doc-table inserts at the same anchor do.
- Force-push with `--force-with-lease`, not `--force`, on feature branches — safer if anyone else pushed in the meantime.
- The `.next/types/validator.ts` Next-generated file references whatever pages existed when last built. After switching branches, run a clean `rm -rf .next && npm run build` before trusting `npm run typecheck` — otherwise it errors against the stale branch's pages.
