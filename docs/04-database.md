# Qissa — Database & Supabase Reference

> The full source of truth for everything that lives in Postgres / Supabase: schema, RLS, seed data, extensions, the migration workflow, the typed clients, and the smoke test. Pair this with the SQL files in [`supabase/migrations/`](../supabase/migrations/) — if anything below ever drifts, the SQL wins.

**Project ref:** `jfothpippwwqodtjybdc`
**Region:** ap-south-1 (Mumbai)
**Postgres version:** 14.5 (PostgREST `__InternalSupabase.PostgrestVersion`)
**Plan:** Free tier

---

## 1. What's in Supabase

| Layer | What we use it for |
|---|---|
| **Postgres** | All app data: 9 tables (see §4) |
| **Auth** | A single admin user, email + password; readers are anonymous in Phase 1 |
| **Storage** | Bucket `qissa-assets` exists as a fallback (covers go to ImageKit) |
| **Realtime** | Not used |
| **Edge Functions** | Not used (translation runs in Next.js Route Handlers) |

Why Postgres + Supabase: free, generous, RLS lets us safely expose reads to anonymous browsers without writing API routes for every list.

---

## 2. Local tooling

### Supabase CLI

Installed as a devDep so it's pinned with the repo:

```bash
npm install --save-dev supabase
# Current: supabase 2.101.0
```

All commands are invoked via `npx supabase …` — no global install needed.

### Project link

The CLI is linked to the remote project so `db push` / `gen types --linked` know where to talk to:

```bash
npx supabase link --project-ref jfothpippwwqodtjybdc
```

This is one-time per machine. It stores connection state in `~/.supabase/` and inside `supabase/.temp/` (which is git-ignored via [supabase/.gitignore](../supabase/.gitignore)).

### `supabase/config.toml`

Created by `supabase init`. We don't run Supabase locally (no Docker), so most of this file is unused — but the `[project]` and `[db]` sections matter when running `db reset` or local Postgres in the future. Keep it checked in.

---

## 3. Migration workflow

All schema changes live in [`supabase/migrations/`](../supabase/migrations/) as timestamped SQL files. **Never run SQL directly in the dashboard for schema changes** — it would drift from the migration history.

### Adding a new migration

```bash
# Creates supabase/migrations/<timestamp>_<name>.sql with the timestamp prefix
# the CLI expects (YYYYMMDDHHMMSS).
npx supabase migration new <descriptive_name>
```

Edit the new SQL file, then apply:

```bash
npx supabase db push
```

`db push` wraps each migration in a transaction; if it fails midway, the entire migration rolls back and is **not** marked applied — fix the SQL and re-run.

If a migration is mistakenly marked applied (e.g., a partial DDL outside a transaction), repair the history:

```bash
npx supabase migration repair --status reverted <timestamp>
# or
npx supabase migration repair --status applied <timestamp>
```

### Regenerating types after a schema change

```bash
npx supabase gen types typescript --linked --schema public > lib/supabase/types.ts
```

> ⚠️ The CLI prints `Initialising login role...` to stdout when invoked with stdout redirection, which corrupts the generated file. Strip it after generating:
>
> ```bash
> awk 'found || /^export / { found=1; print }' lib/supabase/types.ts > /tmp/t && mv /tmp/t lib/supabase/types.ts
> ```

Then run `npm run typecheck` to catch any references to renamed/dropped columns.

### Current migrations (in order)

| File | Purpose |
|---|---|
| [`20260522120001_initial.sql`](../supabase/migrations/20260522120001_initial.sql) | All 9 original tables, triggers, indexes, extensions |
| [`20260522120002_rls_policies.sql`](../supabase/migrations/20260522120002_rls_policies.sql) | Enable RLS on all tables + public read policies |
| [`20260522120003_seed_initial_data.sql`](../supabase/migrations/20260522120003_seed_initial_data.sql) | 13 languages, 28 tones, `ai_config` singleton — idempotent |
| [`20260524120000_variants_and_requests.sql`](../supabase/migrations/20260524120000_variants_and_requests.sql) | **Multi-variant translations** (`story_variants`, `story_part_translations`) + **reader requests** (`story_requests`, `story_request_votes`). Reshapes `stories` + `story_parts` to remove per-variant fields; backfills one primary variant per existing story before the column drops. See §4.10–§4.13. |
| [`20260529120000_search_stories_rpc.sql`](../supabase/migrations/20260529120000_search_stories_rpc.sql) | **Public search across original title + author + per-variant translated title.** Adds pg_trgm GIN indexes on `stories.author_original` and `story_variants.title_translated`, and defines the `search_stories(q, max_results)` RPC ranked by best-of-three trigram similarity. See [UI/public.md → /search](./UI/public.md). |

---

## 4. Schema — the 9 tables

### Conventions used everywhere

- **Primary keys:** `uuid` defaulted via `gen_random_uuid()` (core Postgres 13+ — no `uuid-ossp` extension needed). Exception: `languages.code` is a text PK (ISO 639-1).
- **Timestamps:** every table has `created_at timestamptz not null default now()`. Mutable tables also have `updated_at`, maintained by a shared trigger:
  ```sql
  create or replace function public.set_updated_at()
  returns trigger language plpgsql as $$
  begin new.updated_at = now(); return new; end;
  $$;
  ```
  Each mutable table has a `<table>_set_updated_at` `BEFORE UPDATE` trigger calling it.
- **Soft delete:** `is_active boolean default true` on `categories`, `subcategories`, `languages`, `tones`, `stories`. Setting it to `false` hides the row from RLS reads without breaking foreign keys.
- **Hard delete:** never used in the app for the soft-delete tables. `story_parts`, `story_part_versions`, and `translation_jobs` cascade-delete from their parent story.
- **Singular vs plural:** all tables plural except `ai_config` (it's a singleton row).

### Extensions installed

| Extension | Schema | Why |
|---|---|---|
| `pg_trgm` | `extensions` | GIN trigram indexes on `stories.title_*` for fast ILIKE search (Phase 8) |
| `uuid-ossp` | `extensions` | Pre-installed by Supabase — **not used** by us; we use core `gen_random_uuid()` |
| `pgcrypto` | (core) | Source of `gen_random_uuid()` (Postgres 13+) |

The schema migration explicitly sets `search_path = public, extensions;` at the top so trigram operator classes resolve without schema qualification.

---

### 4.1 `categories`

Top-level navigation (Stories, News, Poetry, …).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `name` | `text` NOT NULL | Display name |
| `slug` | `text` NOT NULL **UNIQUE** | URL-safe; powers `/c/[categorySlug]` |
| `icon_emoji` | `text` | Single emoji for tiles |
| `description` | `text` | Optional admin-facing |
| `display_order` | `int` NOT NULL default 0 | Drag-reorderable in admin |
| `is_active` | `boolean` default true | Soft delete |
| `created_at`, `updated_at` | `timestamptz` | |

**Indexes:** `categories_active_order_idx (is_active, display_order)` — powers the public category grid.

---

### 4.2 `subcategories`

Children of a category. Two-level only — no deeper nesting per requirements §3.1.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `category_id` | `uuid` NOT NULL → `categories(id) ON DELETE CASCADE` | |
| `name` | `text` NOT NULL | |
| `slug` | `text` NOT NULL | **UNIQUE within parent** via `(category_id, slug)` |
| `icon_emoji`, `description`, `display_order`, `is_active`, timestamps | … | Same as categories |

**Unique:** `(category_id, slug)` — two categories can both have a "Mystery" subcategory.

**Indexes:** `subcategories_category_active_order_idx (category_id, is_active, display_order)`.

---

### 4.3 `languages`

Admin-managed list of supported target languages. Adding a language = inserting a row; no code change required.

| Column | Type | Notes |
|---|---|---|
| `code` | `text` PK | ISO 639-1 (or BCP-47 subtag); `CHECK ~ '^[a-z]{2,3}(-[a-z]{2,4})?$'` |
| `name_english` | `text` NOT NULL | e.g., `Hindi` |
| `name_native` | `text` NOT NULL | e.g., `हिन्दी` |
| `direction` | `text` NOT NULL default `'ltr'` | `CHECK in ('ltr','rtl')` |
| `font_family` | `text` | CSS stack for chrome/UI (sans) |
| `font_family_reading` | `text` | CSS stack for reader body (serif) |
| `is_active`, `display_order` | … | |

No `updated_at` — language metadata changes are rare; if you edit `font_family`, do it as a migration so the change is reviewed.

**Indexes:** `languages_active_order_idx (is_active, display_order)`.

---

### 4.4 `tones`

Writer-style presets per language. The `prompt_fragment` is the most important field in the entire app — it's what shapes every translation.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `language_code` | `text` NOT NULL → `languages(code) ON DELETE RESTRICT` | A tone is bound to one language |
| `name` | `text` NOT NULL | Internal key, e.g., `Premchand` |
| `display_name` | `text` | Localized, e.g., `मुंशी प्रेमचंद` |
| `description` | `text` | One-line admin-facing summary |
| `prompt_fragment` | `text` NOT NULL | **The literary brief injected into the AI prompt** |
| `is_active`, timestamps | … | |

**Unique:** `(language_code, name)`.

**Indexes:** `tones_language_active_idx (language_code, is_active)` — powers the tone dropdown in the story form (filtered by selected target language).

---

### 4.5 `stories`

The source story's metadata. **As of the 2026-05-24 variants migration, all per-variant fields (target_language, tone_id, complexity, ai_provider, ai_model, custom_instructions, title_translated, total_words_translated, estimated_reading_minutes) moved to [`story_variants`](#410-story_variants).** The table below reflects the post-migration shape.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `subcategory_id` | `uuid` NOT NULL → `subcategories(id) ON DELETE RESTRICT` | |
| `title_original` | `text` NOT NULL | The source title (variant-translated titles live on `story_variants.title_translated`) |
| `author_original` | `text` | |
| `source_url` | `text` | Where the original came from |
| `cover_image_url` | `text` | ImageKit URL |
| `status` | `text` NOT NULL default `'draft'` | `CHECK in ('draft','published')` — story-level publish; each variant has its own publish flag too |
| `is_active` | `boolean` default true | Soft delete |
| `total_parts` | `int` default 0 | Maintained server-side on part insert/delete |
| `total_words_original` | `int` default 0 | Cached for the listing UI |
| `estimated_reading_minutes` | `int` | Computed (~200 wpm) |
| `created_at`, `updated_at`, `published_at` | `timestamptz` | `published_at` set when status flips to `published` |

**Indexes:**
- `stories_published_idx (status, is_active, published_at desc)` — home page "Recently Published"
- `stories_subcategory_idx (subcategory_id)` — subcategory listing
- `stories_title_original_trgm` — pg_trgm GIN on `title_original`, powers search on the original title
- `stories_author_original_trgm` — pg_trgm GIN on `author_original` (migration 0004), used by the `search_stories` RPC for author matching

**FKs:** `subcategory_id` uses `ON DELETE RESTRICT` so you can't accidentally delete a subcategory that has stories pointing at it. Per-variant language/tone references live on `story_variants`.

---

### 4.6 `story_parts`

One row per **source** part of a story — original text only. Translated text + per-translation status live on `story_part_translations`, one row per (variant × part).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `story_id` | `uuid` NOT NULL → `stories(id) ON DELETE CASCADE` | Deleting a story deletes its parts (and every variant's translations of them, cascading further) |
| `part_number` | `int` NOT NULL | `CHECK > 0`; **UNIQUE per story** via `(story_id, part_number)` |
| `part_label` | `text` | Editable label, defaults to `"Part N"` in UI |
| `text_original` | `text` NOT NULL | Source paragraph(s); paragraph breaks preserved; shared across every variant |
| `word_count_original` | `int` default 0 | |
| `created_at`, `updated_at` | `timestamptz` | |

**Indexes:** `story_parts_story_idx (story_id, part_number)` — ordered fetch for the reader.

> **Migration note (2026-05-24):** `text_translated`, `status`, `error_message`, `last_provider_used`, `last_model_used`, `word_count_translated` all moved to [`story_part_translations`](#411-story_part_translations). The backfill creates one translation row per existing part for each story's backfilled primary variant.

---

### 4.7 `story_part_versions`

Translation history per (variant × part). Every re-translate OR admin edit writes a new row before the underlying `story_part_translations` row is updated.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `story_part_translation_id` | `uuid` NOT NULL → `story_part_translations(id) ON DELETE CASCADE` | The (variant, part) translation this version belongs to |
| `variant_id` | `uuid` NOT NULL → `story_variants(id) ON DELETE CASCADE` | Denormalized for quick filtering |
| `story_part_id` | `uuid` NOT NULL → `story_parts(id) ON DELETE CASCADE` | Kept for query convenience |
| `version_number` | `int` NOT NULL | `CHECK > 0`; **UNIQUE per translation** via `(story_part_translation_id, version_number)` — server-side increment |
| `translated_text` | `text` NOT NULL | Snapshot |
| `provider_used`, `model_used` | `text` | Snapshots at time of translation |
| `tone_id` | `uuid` → `tones(id) ON DELETE SET NULL` | Tones can be deleted later; history must not break |
| `complexity` | `text` | Snapshot |
| `custom_instructions` | `text` | Snapshot |
| `created_by` | `text` NOT NULL | `CHECK in ('ai','admin')` |
| `created_at` | `timestamptz` | |

**Indexes:** `story_part_versions_translation_idx (story_part_translation_id, version_number desc)` — powers the version-history modal.

**RLS:** **No public policy.** Admin-only via service role.

> **Migration note (2026-05-24):** Old `(story_part_id, version_number)` unique constraint was dropped — versioning is now scoped per translation row, so two variants of the same source part keep independent version timelines.

---

### 4.8 `ai_config`

Singleton row holding the admin's default AI provider/model.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | Pinned to `'00000000-0000-0000-0000-000000000001'` so upserts are trivial |
| `default_provider` | `text` NOT NULL default `'gemini'` | |
| `default_model` | `text` NOT NULL default `'gemini-2.0-flash'` | |
| `updated_at` | `timestamptz` | |

Seeded with `(gemini, gemini-2.0-flash)`.

**RLS:** No public policy — admin-only via service role.

---

### 4.9 `translation_jobs`

Per-attempt log for debugging, retries, and future cost tracking.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `story_part_id` | `uuid` NOT NULL → `story_parts(id) ON DELETE CASCADE` | |
| `variant_id` | `uuid` NOT NULL → `story_variants(id) ON DELETE CASCADE` | Which variant the attempt was for |
| `story_part_translation_id` | `uuid` NOT NULL → `story_part_translations(id) ON DELETE CASCADE` | The exact translation row touched |
| `attempt_number` | `int` NOT NULL default 1 | 1, 2, 3 (we cap at 3 with exponential backoff) |
| `status` | `text` NOT NULL | `CHECK in ('started','succeeded','failed')` |
| `provider`, `model` | `text` | Snapshot |
| `input_tokens`, `output_tokens` | `int` | When the SDK reports them |
| `duration_ms` | `int` | Wall-clock of the API call |
| `error_message` | `text` | On `failed` |
| `created_at` | `timestamptz` | |

**Indexes:**
- `translation_jobs_part_idx (story_part_id, created_at desc)` — recent attempts per source part
- `translation_jobs_translation_idx (story_part_translation_id, created_at desc)` — recent attempts per (variant × part)

**RLS:** No public policy — admin-only via service role.

---

### 4.10 `story_variants`

One row per `(story, target_language, tone)` combination. Each variant is independently translatable, publishable, and reader-selectable. The reader URL is `/s/<storyId>/<slug>/p/<partNumber>`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `story_id` | `uuid` NOT NULL → `stories(id) ON DELETE CASCADE` | |
| `target_language` | `text` NOT NULL → `languages(code) ON DELETE RESTRICT` | |
| `tone_id` | `uuid` NOT NULL → `tones(id) ON DELETE RESTRICT` | |
| `slug` | `text` NOT NULL | URL slug, e.g. `hi-premchand`; **UNIQUE per story** via `(story_id, slug)` |
| `complexity` | `text` NOT NULL default `'standard'` | `CHECK in ('daily','simple','standard','advanced','scholarly')` |
| `title_translated` | `text` | Per-variant translated title |
| `custom_instructions` | `text` | Extra prompt text |
| `ai_provider`, `ai_model` | `text` | Provider/model the queue should use for new translates |
| `status` | `text` NOT NULL default `'draft'` | `CHECK in ('draft','published')` |
| `is_active` | `boolean` default true | Soft delete |
| `is_primary` | `boolean` default false | The variant the story landing's "Start reading" button points at; **partial UNIQUE index** ensures at most one primary per story |
| `total_words_translated` | `int` default 0 | |
| `estimated_reading_minutes` | `int` | Computed from word count |
| `created_at`, `updated_at`, `published_at` | `timestamptz` | |

**Unique:** `(story_id, target_language, tone_id)` and `(story_id, slug)`.

**Indexes:** `story_variants_story_active_idx`, `story_variants_published_idx`, `story_variants_target_language_idx`, `story_variants_tone_idx`, `story_variants_title_translated_trgm` (pg_trgm GIN, migration 0004 — used by the `search_stories` RPC).

**RLS:** Anon can SELECT rows where `status='published' AND is_active=true AND` the parent story is published+active.

---

### 4.11 `story_part_translations`

One row per `(variant, story_part)` — the actual translated text plus its per-variant lifecycle (status, provider/model used, last error). The reader fetches one of these joined to its `story_part` for the original text.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `variant_id` | `uuid` NOT NULL → `story_variants(id) ON DELETE CASCADE` | |
| `story_part_id` | `uuid` NOT NULL → `story_parts(id) ON DELETE CASCADE` | |
| `text` | `text` | Filled by AI / admin edit |
| `status` | `text` NOT NULL default `'pending'` | `CHECK in ('pending','translating','completed','edited','failed')` |
| `word_count` | `int` default 0 | |
| `ai_provider`, `ai_model` | `text` | Snapshot from the last translate attempt |
| `error_message` | `text` | Last error if `status='failed'` |
| `translated_at` | `timestamptz` | Set when `status` transitions to `completed`/`edited` |
| `created_at`, `updated_at` | `timestamptz` | |

**Unique:** `(variant_id, story_part_id)` — exactly one translation per (variant, part).

**Indexes:** `story_part_translations_variant_status_idx`, `story_part_translations_part_idx`.

**RLS:** Anon can SELECT rows whose variant is published+active and whose parent story is published+active.

---

### 4.12 `story_requests`

Reader-submitted requests for a new story OR a new variant of an existing story. Created via `POST /api/requests` (anon, honeypot+rate-limited); managed in the admin `/admin/requests` triage queue.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `type` | `text` NOT NULL | `CHECK in ('new_story','new_variant')` |
| `story_id` | `uuid` → `stories(id) ON DELETE CASCADE` | Required when `type='new_variant'` |
| `requested_title` | `text` | Required when `type='new_story'` |
| `requested_author` | `text` | |
| `target_language` | `text` → `languages(code) ON DELETE SET NULL` | |
| `tone_id` | `uuid` → `tones(id) ON DELETE SET NULL` | |
| `notes` | `text` | Free-text from the requester |
| `requester_email` | `text` | Optional |
| `votes` | `int` NOT NULL default 1 | Bumped by dedupe + `/api/requests/[id]/vote` |
| `status` | `text` NOT NULL default `'open'` | `CHECK in ('open','planned','in_progress','fulfilled','declined')` |
| `fulfilled_variant_id` | `uuid` → `story_variants(id) ON DELETE SET NULL` | Set when admin links the fulfilling variant |
| `admin_notes` | `text` | Internal triage notes |
| `created_at`, `updated_at` | `timestamptz` | |

**Check constraint:** either `type='new_variant'` with `story_id` set, or `type='new_story'` with `requested_title` set.

**Indexes:** `story_requests_status_created_idx`, `story_requests_votes_idx`, `story_requests_dedup_idx (story_id, target_language, tone_id)`.

**RLS:** **No anon policies** — all reads and inserts go through service-role-backed API routes ([app/api/requests/route.ts](../app/api/requests/route.ts)) so abuse prevention (honeypot, rate-limit, dedupe) stays centralized.

---

### 4.13 `story_request_votes`

Per-IP upvote dedupe table for `story_requests`. The voter is identified by `sha256(ip + salt)` — coarse but enough to stop trivial repeat-clicks.

| Column | Type | Notes |
|---|---|---|
| `request_id` | `uuid` NOT NULL → `story_requests(id) ON DELETE CASCADE` | |
| `voter_hash` | `text` NOT NULL | |
| `created_at` | `timestamptz` | |

**PK:** `(request_id, voter_hash)` — duplicate vote attempts trip the unique error, which the API handler converts to `{ ok: true, alreadyVoted: true }`.

**RLS:** No anon policies — gated through `/api/requests/[id]/vote`.

---

## 5. Row Level Security (RLS)

RLS is **enabled on every table**. The service-role key bypasses RLS automatically, so all admin writes (Server Actions / Route Handlers using `lib/supabase/admin.ts`) ignore these policies. The anon role hits them.

### What's publicly readable

| Table | Policy |
|---|---|
| `categories` | `is_active = true` |
| `subcategories` | `is_active = true` |
| `languages` | `is_active = true` |
| `tones` | `is_active = true` |
| `stories` | `status = 'published' AND is_active = true` |
| `story_parts` | Parent story is published AND active (correlated subquery on `stories`) |

### What's invisible to the anon role

| Table | Why |
|---|---|
| `story_part_versions` | History should not leak earlier wording or failed drafts |
| `ai_config` | Admin-only settings |
| `translation_jobs` | Internal logs |

These tables have RLS enabled but **no policies** — the default-deny means the anon role gets `0 rows` from any SELECT.

### Verified live

`scripts/smoke-supabase.ts` runs four assertions on every change:
- Anon can read 13 languages
- Anon can read tones for `hi`
- Anon gets 0 rows from `ai_config` (RLS blocked)
- Service role can read `ai_config`

Re-run after any RLS change:

```bash
npx tsx --env-file=.env.local scripts/smoke-supabase.ts
```

---

## 6. Seed data

Lives in [`20260522120003_seed_initial_data.sql`](../supabase/migrations/20260522120003_seed_initial_data.sql) — applied as part of `db push` so the remote DB is always in a known state. Every insert uses `ON CONFLICT … DO NOTHING` so re-running is safe.

### Languages (13)

| Code | English | Native | Direction |
|---|---|---|---|
| en | English | English | ltr |
| hi | Hindi | हिन्दी | ltr |
| ur | Urdu | اُردُو | **rtl** |
| ar | Arabic | العربية | **rtl** |
| bn | Bengali | বাংলা | ltr |
| ta | Tamil | தமிழ் | ltr |
| or | Odia | ଓଡ଼ିଆ | ltr |
| pa | Punjabi | ਪੰਜਾਬੀ | ltr |
| mr | Marathi | मराठी | ltr |
| gu | Gujarati | ગુજરાતી | ltr |
| te | Telugu | తెలుగు | ltr |
| kn | Kannada | ಕನ್ನಡ | ltr |
| ml | Malayalam | മലയാളം | ltr |

Font stacks mirror requirements §3.11 exactly — each language has both a `font_family` (sans, for chrome) and `font_family_reading` (serif, for reader body).

### Tones (28)

| Language | Tones |
|---|---|
| Hindi (5) | Premchand · Harivansh Rai Bachchan · Phanishwar Nath Renu · Krishna Sobti · Mannu Bhandari |
| Urdu (5) | Saadat Hasan Manto · Ismat Chughtai · Mirza Ghalib · Ibn-e-Safi · Quratulain Hyder |
| Bengali (4) | Rabindranath Tagore · Sarat Chandra Chattopadhyay · Bibhutibhushan Bandyopadhyay · Mahasweta Devi |
| Arabic (3) | Naguib Mahfouz · Khalil Gibran · Tayeb Salih |
| Tamil (3) | Kalki Krishnamurthy · Pudumaipithan · Jeyamohan |
| Odia (2) | Fakir Mohan Senapati · Gopinath Mohanty |
| Punjabi (2) | Amrita Pritam · Bhai Vir Singh |
| English (4) | Ernest Hemingway · J. R. R. Tolkien · J. D. Salinger · George Orwell |

Each has a 2–3 sentence `prompt_fragment` describing the writer's literary register. These are the most important pieces of text in the app — the admin should iterate on them through Phase 5's tones UI to tune translation quality. Editing through the UI lands in the same column (it isn't a code change), so no migration needed.

### `ai_config` singleton

```
id              = 00000000-0000-0000-0000-000000000001
default_provider = gemini
default_model   = gemini-2.0-flash
```

---

## 7. Auth

### Admin user

A single user, created manually in the Supabase Dashboard during the setup in `docs/02-guidance.md` §2.4:

- Email: `admin@qissa.com` (whatever you set; mirrored in `.env.local` as `ADMIN_EMAIL`)
- Password: stored in your password manager
- Email confirmed: yes
- Public sign-ups: **disabled** in Supabase Dashboard → Authentication → Sign In/Up

### Admin gating (Phase 4)

`/admin/*` routes will check: logged in AND `user.email === process.env.ADMIN_EMAIL` (set up in Phase 4). Anything else → redirect to `/admin/login`. There is no reader login in Phase 1.

---

## 8. The three Supabase clients

All in [`lib/supabase/`](../lib/supabase/):

| File | Factory | Key used | Use from |
|---|---|---|---|
| [`client.ts`](../lib/supabase/client.ts) | `createClient()` (browser) | anon | Client Components |
| [`server.ts`](../lib/supabase/server.ts) | `async createClient()` | anon (bound to request cookies) | Server Components, Server Actions, Route Handlers — when you want the **user's** session and RLS applied |
| [`admin.ts`](../lib/supabase/admin.ts) | `createAdminClient()` | service role | Server-only, behind `requireAdmin()` — bypasses RLS |

Env values are read via [`lib/supabase/env.ts`](../lib/supabase/env.ts) which throws an explicit error if a required variable is missing — much friendlier than the SDK's "URL is required" at first request time.

All three are typed against the generated `Database` from [`lib/supabase/types.ts`](../lib/supabase/types.ts), so `.from('stories').select(...)` autocompletes column names and returns properly-typed rows.

### Common pitfalls

- **Never** import `admin.ts` from a Client Component. It has a runtime `typeof window !== 'undefined'` guard that throws if it slips into a client bundle, but the build should catch it first.
- The server client's `setAll` swallows cookie-set errors silently when called from a Server Component (where `cookies().set` is illegal). The middleware (Phase 4) is responsible for actually rotating the session.
- After any schema change: regenerate types (§3), then `npm run typecheck`. The clients are typed so referring to a renamed column will refuse to compile.

---

## 9. Common operations

### Add a column to an existing table

```bash
npx supabase migration new add_<column>_to_<table>
# Edit the new file:
#   alter table public.<table> add column <name> <type> [default ...];
npx supabase db push
npx supabase gen types typescript --linked --schema public > lib/supabase/types.ts
# strip the leading CLI noise line, then:
npm run typecheck
```

### Insert/update reference data (a new tone, a new language)

For one-off changes the admin can do through the UI in Phase 5 — that lands in the same column without a migration.

For changes that should be part of the source-controlled baseline (e.g., adding a writer that everyone deploying Qissa should get), add a new migration with an `INSERT … ON CONFLICT DO NOTHING` (idempotent).

### Inspect the live DB

```bash
# All tables:
npx supabase db dump --schema public --data-only | head -100

# Or open a psql session via the dashboard's connection string.
```

### Reset the remote DB (DANGEROUS)

Don't, on a deployed environment. For a fresh local dev DB the CLI offers `supabase db reset`, but we don't currently run a local stack.

### Verify RLS / wiring after any change

```bash
npx tsx --env-file=.env.local scripts/smoke-supabase.ts
```

---

## 10. Out of scope today (will land later)

- **Reader user accounts.** The schema doesn't include a `profiles` table yet — Phase 2 work. When we add it, we'll RLS-policy reader-owned data (bookmarks, progress) with `auth.uid()` rather than `localStorage`.
- **Storage RLS policies.** Supabase Storage's `qissa-assets` bucket exists but has no policies. Phase 7 / Phase 10 will add policies before any user-facing uploads ship.
- **Per-paragraph alignment.** The schema stores translated text as one blob per part; paragraph alignment for the reader's "Show original" toggle is enforced by the AI prompt, not the schema.
- **Glossary table.** Manual entry only in Phase 1; an auto-extracted `glossary_terms` table is Phase 1.5.
- **`translation_jobs` cost rollup.** The raw rows are written, but a dashboard view (e.g., monthly cost per provider) is Phase 1.5.

---

**End of database reference.**
