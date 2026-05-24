# Plan: Multi-variant translations + Reader story requests

## Context

Today Qissa enforces **1 story = 1 target language + 1 tone**. The translated text and translation status live directly on `story_parts`, and the story carries `target_language` + `tone_id`. There's no path for a reader to compare "The Bet — Hindi/Premchand" vs "The Bet — Urdu/Manto", and changing tone on an existing story silently orphans the existing translations ([components/admin/EditStoryMetadataDialog.tsx:161-162](../ME%20personal/Qissa/components/admin/EditStoryMetadataDialog.tsx#L161-L162) already warns about this).

Two product gaps to close in this change:

1. **Multi-variant translations** — one source story can have N translations (cross-product of target language × tone), each independently translatable, publishable, and selectable in the reader.
2. **Reader story requests** — anonymous readers can request a new story OR a new variant of an existing story; duplicate requests aggregate into upvotes; admin sees a triage queue.

Resolved design choices (from clarification):
- New normalized tables `story_variants` + `story_part_translations` (original text stays shared on `story_parts`)
- Reader URL: `/s/{storyId}/{variantSlug}/p/{partNumber}` with per-variant slugs
- Anonymous requests with optional email, honeypot, IP rate-limit
- Duplicate requests collapse to upvotes (per-IP dedupe)

---

## Phase A — Data model (migration + types)

**New migration:** `supabase/migrations/<ts>_variants_and_requests.sql`

### A.1 New tables

```sql
-- One row per (story, target_language, tone) combination
create table story_variants (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories(id) on delete cascade,
  target_language text not null references languages(code),
  tone_id uuid not null references tones(id),
  slug text not null,                          -- e.g. "hi-premchand"
  title_translated text,
  total_words_translated integer default 0,
  status text not null default 'draft'         -- draft | published
    check (status in ('draft','published')),
  is_active boolean not null default true,
  ai_provider text,
  ai_model text,
  complexity text default 'standard',
  custom_instructions text,
  is_primary boolean not null default false,   -- which variant /s/{id} defaults to
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (story_id, target_language, tone_id),
  unique (story_id, slug)
);

-- One row per (variant, part) — the actual translated text
create table story_part_translations (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references story_variants(id) on delete cascade,
  story_part_id uuid not null references story_parts(id) on delete cascade,
  text text,
  status text not null default 'pending'       -- pending | translating | completed | edited | failed
    check (status in ('pending','translating','completed','edited','failed')),
  word_count integer default 0,
  ai_provider text,
  ai_model text,
  error_message text,
  translated_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (variant_id, story_part_id)
);

-- Reader-submitted requests
create table story_requests (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('new_story','new_variant')),
  story_id uuid references stories(id) on delete cascade,         -- set when type='new_variant'
  requested_title text,                                            -- set when type='new_story'
  requested_author text,
  target_language text references languages(code),
  tone_id uuid references tones(id),
  notes text,
  requester_email text,                                            -- optional
  votes integer not null default 1,
  status text not null default 'open'
    check (status in ('open','planned','in_progress','fulfilled','declined')),
  fulfilled_variant_id uuid references story_variants(id),
  admin_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table story_request_votes (
  request_id uuid not null references story_requests(id) on delete cascade,
  voter_hash text not null,                                        -- sha256(IP + salt)
  created_at timestamptz default now(),
  primary key (request_id, voter_hash)
);
```

### A.2 Reshape `story_parts` + `story_part_versions`

- Drop columns from `story_parts`: `text_translated`, `status`, `word_count_translated`, `ai_provider`, `ai_model`, `error_message`, `translated_at`. **Keep**: `text_original`, `part_number`, `label`, `word_count_original`. (Source-of-truth, shared across variants.)
- Add `variant_id uuid` (nullable for now, then NOT NULL) to `story_part_versions` and update its FK target to `story_part_translations.id` (or keep FK to `story_parts` and add `variant_id` for join). **Recommend**: rename to `story_part_translation_versions` and FK it to `story_part_translations`.

### A.3 Backfill (data-preserving)

In the same migration, before column drops:

1. For every existing `stories` row, insert a `story_variants` row using its current `target_language` + `tone_id`, `slug = lower(target_language) || '-' || slugify(tone.name)`, `is_primary = true`, `status = stories.status`, copy `ai_provider`/`ai_model`/`title_translated`/`total_words_translated`.
2. For every `story_parts` row, insert a `story_part_translations` row keyed by the matching variant, copying `text_translated`/`status`/`word_count_translated`/`ai_provider`/`ai_model`/`error_message`/`translated_at`.
3. Update `story_part_versions.variant_id` from the join.
4. Now drop the legacy columns from `story_parts` and `stories` (`stories.target_language`, `stories.tone_id`, `stories.title_translated`, `stories.total_words_translated`, `stories.ai_provider`, `stories.ai_model` — they belong on the variant now).

### A.4 RLS policies

- `story_variants`: anon SELECT where `status='published' AND is_active=true AND EXISTS(published parent story)`. Service-role full access.
- `story_part_translations`: anon SELECT via EXISTS join to a published+active variant. Service-role full access.
- `story_requests`: **no anon SELECT or INSERT** — submissions go through `/api/requests` (service-role insert). Admin reads via service-role. *(Avoids leaking pending requests publicly and centralizes rate-limit/honeypot logic.)*
- `story_request_votes`: same — gated through `/api/requests/[id]/vote`.

### A.5 Type regen

```bash
npx supabase db push
npx supabase gen types typescript --linked --schema public > lib/supabase/types.ts
awk 'found || /^export / { found=1; print }' lib/supabase/types.ts > /tmp/t && mv /tmp/t lib/supabase/types.ts
npm run typecheck
```

---

## Phase B — Backend (Server Actions + API)

### B.1 New / refactored Server Actions ([lib/actions/](../ME%20personal/Qissa/lib/actions/))

- **`lib/actions/story-variants.ts`** (new): `createVariant({ storyId, languageCode, toneId, providerName, modelName, complexity, customInstructions })` → inserts variant + auto-creates pending `story_part_translations` rows for every existing `story_part`. `updateVariant`, `setVariantPrimary`, `setVariantPublished`, `deleteVariant` (soft via `is_active=false`).
- **`lib/actions/stories.ts`** (modify): `createStory` becomes "create source story + optionally first variant in one transaction" — accept optional `firstVariant: { languageCode, toneId, providerName, modelName }`. Strip language/tone fields off the story row itself.
- **`lib/actions/story-parts.ts`** (modify): `updatePartTexts` now takes `(storyPartId, variantId, originalText?, translatedText?)`. Original edit hits `story_parts`; translated edit hits `story_part_translations`. `moveStoryPart` / `deleteStoryPart` unaffected (operate on the part shared across variants — surface a confirmation since it deletes the part from every variant).
- **`lib/actions/story-requests.ts`** (new, admin-only): `updateRequestStatus`, `linkFulfillingVariant`, `addAdminNote`, `deleteRequest`.

### B.2 Translation pipeline ([lib/translation/run-part.ts](../ME%20personal/Qissa/lib/translation/run-part.ts))

Refactor signature: `runStoryPartTranslation({ storyPartTranslationId, providerName?, modelName? })` (instead of `storyPartId`). It now loads the `story_part_translations` row → joins to `story_variants` for language/tone/complexity/custom_instructions → joins to `story_parts` for original text. All status writes target `story_part_translations`. `translation_jobs` gains `variant_id` + `story_part_translation_id` columns (or use the new ID directly).

### B.3 API routes ([app/api/](../ME%20personal/Qissa/app/api/))

- **`/api/translate`** ([route.ts](../ME%20personal/Qissa/app/api/translate/route.ts)): accept `{ storyPartTranslationId, providerName?, modelName? }` instead of `storyPartId`.
- **`/api/translate/queue`** ([route.ts](../ME%20personal/Qissa/app/api/translate/queue/route.ts)): accept `{ variantId, fromPartNumber? }` instead of `{ storyId, ... }`. Queue iterates `story_part_translations` where `variant_id = ?` and `status IN ('pending','failed')`.
- **`/api/requests` (new)** — `POST`: validates honeypot + IP rate-limit (e.g. 5/hour/IP via in-memory or Upstash if available), optionally dedupes against open requests (same `story_id+language+tone` or fuzzy title match) and bumps `votes` instead of inserting. `GET` not exposed — admin lists via Server Component using service-role.
- **`/api/requests/[id]/vote` (new)** — `POST`: increments votes, dedupes via `story_request_votes (voter_hash)` keyed by `sha256(ip + salt)`.

### B.4 Sitemap & reader fetch helpers

- [app/sitemap.ts](../ME%20personal/Qissa/app/sitemap.ts): emit one entry per published variant (using new URL shape) instead of per story.
- New `lib/variants/url.ts` helper: `variantUrl({ storyId, variantSlug, partNumber })` so URL composition lives in one place.

---

## Phase C — Admin UI

### C.1 Story edit page rework ([app/admin/(protected)/stories/[id]/page.tsx](../ME%20personal/Qissa/app/admin/(protected)/stories/[id]/page.tsx) + [components/admin/StoryEditShell.tsx](../ME%20personal/Qissa/components/admin/StoryEditShell.tsx))

- The shell now has two sections: **Source** (parts list with original text + reorder/delete) and **Variants** (list of variants with status + progress + actions).
- **Variants list**: each row shows `[lang • tone] [progress: n/N translated] [status badge] [primary star] [actions: Translate / Cancel / Edit / Publish / Set Primary / Delete]`.
- "Add variant" button → new `CreateVariantDialog` (language + tone + provider + model). On submit it inserts the variant and auto-creates pending part-translation rows.
- "Translate" on a variant row opens the existing SSE flow but with `{ variantId }`. PartCard for that variant pulls its row from `story_part_translations`.

### C.2 PartCard becomes variant-scoped ([components/admin/PartCard.tsx](../ME%20personal/Qissa/components/admin/PartCard.tsx))

Two display modes:
- **Source mode** (in the Source section): show only original text + reorder/delete.
- **Translation mode** (under each expanded variant): show translated text + per-part Re-translate + version history. Receives `(part, translation)` instead of just `part`.

A `VariantPartList` (new) renders translation-mode PartCards for one variant.

### C.3 EditStoryMetadataDialog ([components/admin/EditStoryMetadataDialog.tsx](../ME%20personal/Qissa/components/admin/EditStoryMetadataDialog.tsx))

Remove language/tone/provider/model from this dialog — those are now per-variant. Keep: title_original, author_original, category, subcategory, cover, source_language. (Drop the "translations not affected" warning — no longer applicable.)

### C.4 Stories list panel ([components/admin/StoriesPanel.tsx](../ME%20personal/Qissa/components/admin/StoriesPanel.tsx))

Each row now shows: title, subcategory, **variants count** (e.g. "3 variants · 2 published"), instead of single language/tone. Filters: status + source language. (Detail page is where variant-level info lives.)

### C.5 Story requests admin page (new)

- `/admin/requests` ([app/admin/(protected)/requests/page.tsx](../ME%20personal/Qissa/app/admin/(protected)/requests/page.tsx)) + `RequestsPanel` component.
- Columns: type, requested story/title, language, tone, votes, status, requester_email, created_at, actions.
- Filters: status (default: open + planned), type, language.
- Actions per row: status transitions, "Link variant" (search-and-pick once you've published the fulfilling variant), notes editor.
- Sidebar nav entry in [AdminShell](../ME%20personal/Qissa/components/admin/AdminShell.tsx) with unread/open count badge.

---

## Phase D — Reader UI

### D.1 Story landing ([app/(public)/s/[storyId]/page.tsx](../ME%20personal/Qissa/app/(public)/s/[storyId]/page.tsx))

- Replace the single language/tone badge with a **"Available in"** section: a grid of variant cards (language native name + tone name + "N parts" + Start Reading link to the primary part of that variant).
- Default Start Reading button points at the primary (or most-recently-updated) variant's part 1.
- Bookmark/share buttons unchanged — bookmark is at story level.
- "Request this in another language/tone" CTA → opens `RequestStoryDialog` pre-filled with `{ type: 'new_variant', storyId }`.

### D.2 Reader page ([app/(public)/s/[storyId]/p/[partNumber]/page.tsx](../ME%20personal/Qissa/app/(public)/s/[storyId]/p/[partNumber]/page.tsx))

- **New URL**: `/s/[storyId]/[variantSlug]/p/[partNumber]` — restructure the route folder accordingly. Add a redirect at the old path: `/s/[storyId]/p/[partNumber]` → primary variant's same part number.
- Server fetch joins `stories → story_variants(by slug) → story_part_translations(by part_number) + story_parts(text_original)`.
- [ReaderChrome](../ME%20personal/Qissa/components/reader/ReaderChrome.tsx): add a variant picker (small chip in the top bar; opens a sheet listing other variants with one-tap switch — preserves current `partNumber` if that part exists in the target variant, else routes to part 1).
- "Show original" toggle keeps working (reads `text_original` shared across variants).
- Per-part progress key changes: `qissa:progress:<storyId>:<variantSlug>:<partNumber>` so progress is per-variant. Last-read pointer becomes `{ storyId, variantSlug, partNumber }`. Migration in [lib/reader/progress.ts](../ME%20personal/Qissa/lib/reader/progress.ts): one-shot upgrade reads any old-shape values and rewrites under the primary variant slug.

### D.3 Reader font selection

`lib/reader/google-fonts.ts` already keys on language code, which now comes from the variant. Pass `variant.target_language` instead of `story.target_language`.

### D.4 Request UI

- **`RequestStoryDialog` (new, [components/shared/RequestStoryDialog.tsx](../ME%20personal/Qissa/components/shared/RequestStoryDialog.tsx))**: language + tone selects, optional title/author (when `type='new_story'`), notes, optional email, hidden honeypot. Submits to `POST /api/requests`. On 200, shows toast + offers upvote link if the response indicated a dedup match.
- Triggered from: (a) "Request this in another language/tone" on story landing, (b) "Request a story" link in [PublicShell](../ME%20personal/Qissa/components/shared/PublicShell.tsx) footer or bottom nav.
- Public `/requests` page (optional but recommended) — read-only list of open requests with upvote button, sorted by votes desc. Adds social proof and reduces duplicates.

---

## Phase E — Docs (per CLAUDE.md doc-update rules)

Update in the same PR:
- [docs/04-database.md](../ME%20personal/Qissa/docs/04-database.md) — new tables + reshape note + backfill summary.
- [docs/ARCHITECTURE.md](../ME%20personal/Qissa/docs/ARCHITECTURE.md) — §1 diagram and §5 pipeline updated (variant_id flows through everything); §3.3 (admin translate) rewritten around variants.
- [docs/FEATURES.md](../ME%20personal/Qissa/docs/FEATURES.md) — new entries: "Variant picker (reader)", "Manage variants (admin)", "Story requests (reader)", "Request triage (admin)".
- [docs/API/translate.md](../ME%20personal/Qissa/docs/API/translate.md) — new payload shape.
- [docs/API/](../ME%20personal/Qissa/docs/API/) — new file `requests.md`.
- [docs/UI/admin.md](../ME%20personal/Qissa/docs/UI/admin.md), [docs/UI/public.md](../ME%20personal/Qissa/docs/UI/public.md), [docs/UI/reader.md](../ME%20personal/Qissa/docs/UI/reader.md) — variant-aware flows.
- [docs/INTERNALS/reader-state.md](../ME%20personal/Qissa/docs/INTERNALS/reader-state.md) — new localStorage key shapes + one-shot migration.
- [docs/INTERNALS/server-actions.md](../ME%20personal/Qissa/docs/INTERNALS/server-actions.md) — new `story-variants.ts` + `story-requests.ts`.

---

## Critical files to modify

**Schema / types**
- `supabase/migrations/<new-timestamp>_variants_and_requests.sql` (new, ~250 lines)
- [lib/supabase/types.ts](../ME%20personal/Qissa/lib/supabase/types.ts) (regenerated)

**Backend**
- [lib/translation/run-part.ts](../ME%20personal/Qissa/lib/translation/run-part.ts) — operate on `story_part_translations`
- [app/api/translate/route.ts](../ME%20personal/Qissa/app/api/translate/route.ts) + [app/api/translate/queue/route.ts](../ME%20personal/Qissa/app/api/translate/queue/route.ts)
- [lib/actions/stories.ts](../ME%20personal/Qissa/lib/actions/stories.ts), [lib/actions/story-parts.ts](../ME%20personal/Qissa/lib/actions/story-parts.ts)
- `lib/actions/story-variants.ts` (new), `lib/actions/story-requests.ts` (new)
- `app/api/requests/route.ts` (new), `app/api/requests/[id]/vote/route.ts` (new)
- `lib/variants/url.ts` (new), [app/sitemap.ts](../ME%20personal/Qissa/app/sitemap.ts)

**Admin UI**
- [components/admin/StoryEditShell.tsx](../ME%20personal/Qissa/components/admin/StoryEditShell.tsx), [components/admin/PartCard.tsx](../ME%20personal/Qissa/components/admin/PartCard.tsx)
- [components/admin/EditStoryMetadataDialog.tsx](../ME%20personal/Qissa/components/admin/EditStoryMetadataDialog.tsx), [components/admin/StoriesPanel.tsx](../ME%20personal/Qissa/components/admin/StoriesPanel.tsx), [components/admin/StoryForm.tsx](../ME%20personal/Qissa/components/admin/StoryForm.tsx)
- `components/admin/VariantsPanel.tsx` (new), `components/admin/CreateVariantDialog.tsx` (new), `components/admin/VariantPartList.tsx` (new)
- `components/admin/RequestsPanel.tsx` (new), `app/admin/(protected)/requests/page.tsx` (new)
- [components/admin/AdminShell.tsx](../ME%20personal/Qissa/components/admin/AdminShell.tsx) — sidebar entry

**Reader UI**
- Route move: `app/(public)/s/[storyId]/p/[partNumber]/` → `app/(public)/s/[storyId]/[variantSlug]/p/[partNumber]/` (plus legacy redirect)
- [app/(public)/s/[storyId]/page.tsx](../ME%20personal/Qissa/app/(public)/s/[storyId]/page.tsx) — variant grid
- [components/reader/ReaderChrome.tsx](../ME%20personal/Qissa/components/reader/ReaderChrome.tsx) — variant picker chip
- [lib/reader/progress.ts](../ME%20personal/Qissa/lib/reader/progress.ts), [lib/reader/bookmarks.ts](../ME%20personal/Qissa/lib/reader/bookmarks.ts) — variant-keyed shapes + migration
- `components/shared/RequestStoryDialog.tsx` (new), `app/(public)/requests/page.tsx` (new, optional)

**Reuse (do NOT reinvent)**
- [lib/ai/translate.ts](../ME%20personal/Qissa/lib/ai/translate.ts) + [withRetry](../ME%20personal/Qissa/lib/ai/retry.ts) + [getProvider](../ME%20personal/Qissa/lib/ai/registry.ts) — unchanged
- [lib/ai/prompt-builder.ts](../ME%20personal/Qissa/lib/ai/prompt-builder.ts) — unchanged; receives the same language+tone+complexity inputs, just sourced from variant
- [lib/utils/slug.ts](../ME%20personal/Qissa/lib/utils/slug.ts) — reused for variant slug
- [coverUrl()](../ME%20personal/Qissa/lib/imagekit/url.ts) — cover stays at story level
- shadcn primitives in [components/ui/](../ME%20personal/Qissa/components/ui/)

---

## Suggested execution order

1. **A** schema + backfill + types regen (`npm run typecheck` will surface every spot that breaks — fix those before moving on).
2. **B** translation pipeline + APIs (verify with `scripts/smoke-translate.ts` updated to pass `variantId`).
3. **C** admin: variants panel + create-variant dialog + part list rework. Manually exercise: create a 2nd variant of an existing story, translate it.
4. **D** reader: route move + variant picker + progress migration. Smoke the legacy URL redirect.
5. **E** requests: DB + API + dialog + admin queue. Test rate-limit + dedup.
6. **Docs** updated in same PR.

---

## Verification

Local:
- `npm run typecheck && npm run lint && npm run build`
- `npx tsx --env-file=.env.local scripts/smoke-supabase.ts`
- `npx tsx --env-file=.env.local scripts/smoke-translate.ts` (update to pass `variantId`)

Manual (with `npm run start` so SW is active):

**Variants**
- Existing story still renders (backfilled primary variant). Old URL `/s/{id}/p/1` redirects to `/s/{id}/{primarySlug}/p/1`.
- Create a 2nd variant in admin, translate it, publish. Landing page shows both variants. Reader picker switches between them and preserves part number.
- Toggle "Show original" in either variant — original text is identical (proves sharing).
- Per-variant reading progress: read part 1 in variant A, switch to variant B — variant B shows no progress for part 1.

**Requests**
- Submit a request as anon user (with + without email). Honeypot field rejection works. Submitting 6 in one hour from one IP gets rate-limited on the 6th.
- Submit a duplicate (same story+lang+tone) → API returns `{ matched: true, requestId }` and bumps votes; UI shows upvote toast.
- Admin `/admin/requests` lists it; status transitions work; "Link variant" picker finds the published variant and stores `fulfilled_variant_id`.

**Regression**
- Reader bookmarks still work (story-level; unchanged).
- Sitemap contains per-variant URLs and no longer 404s on old ones.
- Service worker offline behavior: cached old-URL reader page still resolves (redirect path also cached).
