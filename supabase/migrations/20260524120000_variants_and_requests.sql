-- =============================================================================
-- Qissa — multi-variant translations + reader story requests
-- =============================================================================
-- Goal: one source story can have N translations (target_language × tone). Each
-- translation is independently translatable, publishable, and reader-selectable.
-- Plus: anonymous readers can request new stories or new variants of existing
-- stories; duplicates collapse to upvotes; admin sees a triage queue.
--
-- Migration order (single transaction):
--   1. Create story_variants + story_part_translations + story_requests +
--      story_request_votes.
--   2. Backfill: for each existing story, create one primary variant + the
--      matching story_part_translations rows (preserving status / text / etc).
--   3. Add variant_id to story_part_versions + translation_jobs, backfill, make
--      NOT NULL where appropriate.
--   4. Drop legacy translation columns from stories + story_parts; drop now-
--      stale indexes.
--   5. RLS for the new tables (anon SELECT on published variants + their
--      part translations; story_requests + votes are service-role only).
-- =============================================================================

set search_path to public, extensions;


-- -----------------------------------------------------------------------------
-- 1. story_variants — one row per (story, target_language, tone)
-- -----------------------------------------------------------------------------
create table public.story_variants (
  id                        uuid primary key default gen_random_uuid(),
  story_id                  uuid not null references public.stories(id) on delete cascade,
  target_language           text not null references public.languages(code) on delete restrict,
  tone_id                   uuid not null references public.tones(id) on delete restrict,
  slug                      text not null,
  complexity                text not null default 'standard'
                              check (complexity in ('daily','simple','standard','advanced','scholarly')),
  title_translated          text,
  custom_instructions       text,
  ai_provider               text,
  ai_model                  text,
  status                    text not null default 'draft'
                              check (status in ('draft','published')),
  is_active                 boolean not null default true,
  is_primary                boolean not null default false,
  total_words_translated    int not null default 0,
  estimated_reading_minutes int,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  published_at              timestamptz,
  unique (story_id, target_language, tone_id),
  unique (story_id, slug)
);

create trigger story_variants_set_updated_at
  before update on public.story_variants
  for each row execute function public.set_updated_at();

-- At most one primary variant per story.
create unique index story_variants_one_primary_per_story
  on public.story_variants (story_id)
  where is_primary = true;

create index story_variants_story_active_idx
  on public.story_variants (story_id, is_active);

create index story_variants_published_idx
  on public.story_variants (status, is_active, published_at desc);

create index story_variants_target_language_idx
  on public.story_variants (target_language);

create index story_variants_tone_idx
  on public.story_variants (tone_id);


-- -----------------------------------------------------------------------------
-- 2. story_part_translations — one row per (variant, story_part)
-- -----------------------------------------------------------------------------
create table public.story_part_translations (
  id                     uuid primary key default gen_random_uuid(),
  variant_id             uuid not null references public.story_variants(id) on delete cascade,
  story_part_id          uuid not null references public.story_parts(id) on delete cascade,
  text                   text,
  status                 text not null default 'pending'
                           check (status in ('pending','translating','completed','edited','failed')),
  word_count             int not null default 0,
  ai_provider            text,
  ai_model               text,
  error_message          text,
  translated_at          timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (variant_id, story_part_id)
);

create trigger story_part_translations_set_updated_at
  before update on public.story_part_translations
  for each row execute function public.set_updated_at();

create index story_part_translations_variant_status_idx
  on public.story_part_translations (variant_id, status);

create index story_part_translations_part_idx
  on public.story_part_translations (story_part_id);


-- -----------------------------------------------------------------------------
-- 3. Backfill story_variants + story_part_translations from existing data
-- -----------------------------------------------------------------------------
-- One primary variant per existing story, copying its current translation
-- metadata. Slug = "<lang>-<slugified tone name>".
insert into public.story_variants (
  story_id, target_language, tone_id, slug, complexity,
  title_translated, custom_instructions, ai_provider, ai_model,
  status, is_active, is_primary, total_words_translated,
  estimated_reading_minutes, published_at, created_at, updated_at
)
select
  s.id,
  s.target_language,
  s.tone_id,
  s.target_language || '-' || regexp_replace(
    trim(both '-' from regexp_replace(lower(t.name), '[^a-z0-9]+', '-', 'g')),
    '-+', '-', 'g'
  ),
  s.complexity,
  s.title_translated,
  s.custom_instructions,
  s.ai_provider,
  s.ai_model,
  s.status,
  s.is_active,
  true,                          -- is_primary
  s.total_words_translated,
  s.estimated_reading_minutes,
  s.published_at,
  s.created_at,
  s.updated_at
from public.stories s
join public.tones t on t.id = s.tone_id;

-- One translation row per (variant, story_part), copying the existing text +
-- status + provider/model. Since each story has exactly one variant after the
-- insert above, the join on story_id is sufficient.
insert into public.story_part_translations (
  variant_id, story_part_id, text, status, word_count,
  ai_provider, ai_model, error_message, translated_at,
  created_at, updated_at
)
select
  v.id,
  sp.id,
  sp.text_translated,
  sp.status,
  sp.word_count_translated,
  sp.last_provider_used,
  sp.last_model_used,
  sp.error_message,
  -- Approximation: only set translated_at if part is in a settled translated
  -- state. Avoids inventing timestamps for pending/failed/edited rows.
  case when sp.status in ('completed','edited') then sp.updated_at end,
  sp.created_at,
  sp.updated_at
from public.story_parts sp
join public.story_variants v on v.story_id = sp.story_id;


-- -----------------------------------------------------------------------------
-- 4. story_part_versions — add variant_id + story_part_translation_id
-- -----------------------------------------------------------------------------
-- Keep story_part_id for query convenience; add the two new keys. Backfill
-- using the single variant that now exists per story, then make NOT NULL.
alter table public.story_part_versions
  add column variant_id uuid references public.story_variants(id) on delete cascade,
  add column story_part_translation_id uuid references public.story_part_translations(id) on delete cascade;

update public.story_part_versions v
set
  variant_id = t.variant_id,
  story_part_translation_id = t.id
from public.story_part_translations t
where t.story_part_id = v.story_part_id;

alter table public.story_part_versions
  alter column variant_id set not null,
  alter column story_part_translation_id set not null;

-- Versioning is now scoped per translation; old (story_part_id, version_number)
-- unique constraint no longer makes sense across variants.
alter table public.story_part_versions
  drop constraint story_part_versions_story_part_id_version_number_key;

alter table public.story_part_versions
  add constraint story_part_versions_translation_version_unique
    unique (story_part_translation_id, version_number);

create index story_part_versions_translation_idx
  on public.story_part_versions (story_part_translation_id, version_number desc);


-- -----------------------------------------------------------------------------
-- 5. translation_jobs — add variant_id + story_part_translation_id
-- -----------------------------------------------------------------------------
alter table public.translation_jobs
  add column variant_id uuid references public.story_variants(id) on delete cascade,
  add column story_part_translation_id uuid references public.story_part_translations(id) on delete cascade;

update public.translation_jobs j
set
  variant_id = t.variant_id,
  story_part_translation_id = t.id
from public.story_part_translations t
where t.story_part_id = j.story_part_id;

-- New rows must populate these. Existing rows are backfilled above.
alter table public.translation_jobs
  alter column variant_id set not null,
  alter column story_part_translation_id set not null;

create index translation_jobs_translation_idx
  on public.translation_jobs (story_part_translation_id, created_at desc);


-- -----------------------------------------------------------------------------
-- 6. Drop legacy translation columns now that variants own them
-- -----------------------------------------------------------------------------
drop index if exists stories_target_language_idx;
drop index if exists stories_tone_idx;

alter table public.stories
  drop column target_language,
  drop column tone_id,
  drop column complexity,
  drop column title_translated,
  drop column custom_instructions,
  drop column ai_provider,
  drop column ai_model,
  drop column total_words_translated,
  drop column estimated_reading_minutes;

-- title_translated trigram index referenced a now-dropped column.
drop index if exists stories_title_translated_trgm;

-- story_parts: keep only what's shared across variants (original text + label
-- + order + original word count).
alter table public.story_parts
  drop column text_translated,
  drop column status,
  drop column error_message,
  drop column last_provider_used,
  drop column last_model_used,
  drop column word_count_translated;


-- -----------------------------------------------------------------------------
-- 7. story_requests — reader-submitted requests for new stories / variants
-- -----------------------------------------------------------------------------
create table public.story_requests (
  id                     uuid primary key default gen_random_uuid(),
  type                   text not null check (type in ('new_story','new_variant')),
  story_id               uuid references public.stories(id) on delete cascade,
  requested_title        text,
  requested_author       text,
  target_language        text references public.languages(code) on delete set null,
  tone_id                uuid references public.tones(id) on delete set null,
  notes                  text,
  requester_email        text,
  votes                  int not null default 1,
  status                 text not null default 'open'
                           check (status in ('open','planned','in_progress','fulfilled','declined')),
  fulfilled_variant_id   uuid references public.story_variants(id) on delete set null,
  admin_notes            text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- Either it's for an existing story (new_variant) or it names a new story.
  check (
    (type = 'new_variant' and story_id is not null) or
    (type = 'new_story'   and requested_title is not null)
  )
);

create trigger story_requests_set_updated_at
  before update on public.story_requests
  for each row execute function public.set_updated_at();

create index story_requests_status_created_idx
  on public.story_requests (status, created_at desc);

create index story_requests_votes_idx
  on public.story_requests (status, votes desc);

create index story_requests_dedup_idx
  on public.story_requests (story_id, target_language, tone_id);


-- -----------------------------------------------------------------------------
-- 8. story_request_votes — per-IP dedupe for upvotes
-- -----------------------------------------------------------------------------
create table public.story_request_votes (
  request_id   uuid not null references public.story_requests(id) on delete cascade,
  voter_hash   text not null,
  created_at   timestamptz not null default now(),
  primary key (request_id, voter_hash)
);


-- -----------------------------------------------------------------------------
-- 9. RLS for new tables
-- -----------------------------------------------------------------------------
alter table public.story_variants          enable row level security;
alter table public.story_part_translations enable row level security;
alter table public.story_requests          enable row level security;
alter table public.story_request_votes     enable row level security;

-- Anon can read published variants of published, active stories.
create policy "Anyone can read published variants"
  on public.story_variants
  for select
  to anon, authenticated
  using (
    status = 'published'
    and is_active = true
    and exists (
      select 1 from public.stories s
      where s.id = story_variants.story_id
        and s.status = 'published'
        and s.is_active = true
    )
  );

-- Anon can read translation rows of published variants of published stories.
create policy "Anyone can read translations of published variants"
  on public.story_part_translations
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.story_variants v
      join public.stories s on s.id = v.story_id
      where v.id = story_part_translations.variant_id
        and v.status = 'published'
        and v.is_active = true
        and s.status = 'published'
        and s.is_active = true
    )
  );

-- story_requests + story_request_votes: NO anon policies. Submissions go through
-- /api/requests (service-role insert with honeypot + IP rate limit); admin reads
-- via service-role. This keeps in-flight requests private and centralizes
-- abuse-prevention logic in one place.
