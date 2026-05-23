-- =============================================================================
-- Qissa — initial schema
-- =============================================================================
-- 9 tables: categories, subcategories, languages, tones, stories, story_parts,
-- story_part_versions, ai_config, translation_jobs.
--
-- Design notes:
--   - All ids are uuid (auto-generated via gen_random_uuid()).
--   - Soft delete via is_active where applicable (categories/subcategories/
--     tones/stories). Hard delete only via cascade from the parent.
--   - Updated_at maintained by the shared set_updated_at() trigger function.
--   - Indexes target the read patterns in docs/01-requirements.md §3.8/§3.10.
--   - All title search uses pg_trgm GIN indexes so Phase 8's ILIKE search is
--     index-backed even on a large table.
-- =============================================================================

-- Supabase installs extensions in the `extensions` schema, which is NOT in
-- the default search_path. Add it so we can reference operator classes like
-- gin_trgm_ops without explicit schema qualification.
set search_path to public, extensions;

-- pg_trgm gives us GIN indexes for fast ILIKE on story titles (Phase 8 search).
-- gen_random_uuid() is core Postgres 13+ — no uuid-ossp needed.
create extension if not exists pg_trgm with schema extensions;

-- Shared updated_at trigger function. Reused across every table that has an
-- updated_at column.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 1. categories (top-level)
-- -----------------------------------------------------------------------------
create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  icon_emoji    text,
  description   text,
  display_order int  not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create index categories_active_order_idx
  on public.categories (is_active, display_order);


-- -----------------------------------------------------------------------------
-- 2. subcategories (children of categories)
-- -----------------------------------------------------------------------------
create table public.subcategories (
  id            uuid primary key default gen_random_uuid(),
  category_id   uuid not null references public.categories(id) on delete cascade,
  name          text not null,
  slug          text not null,
  icon_emoji    text,
  description   text,
  display_order int  not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (category_id, slug)
);

create trigger subcategories_set_updated_at
  before update on public.subcategories
  for each row execute function public.set_updated_at();

create index subcategories_category_active_order_idx
  on public.subcategories (category_id, is_active, display_order);


-- -----------------------------------------------------------------------------
-- 3. languages (admin-managed; supports adding new ones without code changes)
-- -----------------------------------------------------------------------------
create table public.languages (
  code                 text primary key
                         check (code ~ '^[a-z]{2,3}(-[a-z]{2,4})?$'),
  name_english         text not null,
  name_native          text not null,
  direction            text not null default 'ltr'
                         check (direction in ('ltr','rtl')),
  font_family          text,
  font_family_reading  text,
  is_active            boolean not null default true,
  display_order        int  not null default 0
);

create index languages_active_order_idx
  on public.languages (is_active, display_order);


-- -----------------------------------------------------------------------------
-- 4. tones (writer-style presets per language)
-- -----------------------------------------------------------------------------
create table public.tones (
  id               uuid primary key default gen_random_uuid(),
  language_code    text not null references public.languages(code) on delete restrict,
  name             text not null,
  display_name     text,
  description      text,
  prompt_fragment  text not null,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (language_code, name)
);

create trigger tones_set_updated_at
  before update on public.tones
  for each row execute function public.set_updated_at();

create index tones_language_active_idx
  on public.tones (language_code, is_active);


-- -----------------------------------------------------------------------------
-- 5. stories
-- -----------------------------------------------------------------------------
create table public.stories (
  id                      uuid primary key default gen_random_uuid(),
  subcategory_id          uuid not null references public.subcategories(id) on delete restrict,
  target_language         text not null references public.languages(code) on delete restrict,
  tone_id                 uuid not null references public.tones(id) on delete restrict,
  complexity              text not null default 'standard'
                            check (complexity in ('daily','simple','standard','advanced','scholarly')),

  title_original          text not null,
  title_translated        text,
  author_original         text,
  source_url              text,
  cover_image_url         text,

  ai_provider             text,
  ai_model                text,
  custom_instructions     text,

  status                  text not null default 'draft'
                            check (status in ('draft','published')),
  is_active               boolean not null default true,

  total_parts             int not null default 0,
  total_words_original    int not null default 0,
  total_words_translated  int not null default 0,
  estimated_reading_minutes int,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  published_at            timestamptz
);

create trigger stories_set_updated_at
  before update on public.stories
  for each row execute function public.set_updated_at();

-- Public listing: latest published, filtered by subcategory / language.
create index stories_published_idx
  on public.stories (status, is_active, published_at desc);
create index stories_subcategory_idx
  on public.stories (subcategory_id);
create index stories_target_language_idx
  on public.stories (target_language);
create index stories_tone_idx
  on public.stories (tone_id);

-- Search by title (Phase 8 ILIKE) — trigram indexes keep it fast.
create index stories_title_original_trgm
  on public.stories using gin (title_original gin_trgm_ops);
create index stories_title_translated_trgm
  on public.stories using gin (title_translated gin_trgm_ops);


-- -----------------------------------------------------------------------------
-- 6. story_parts
-- -----------------------------------------------------------------------------
create table public.story_parts (
  id                       uuid primary key default gen_random_uuid(),
  story_id                 uuid not null references public.stories(id) on delete cascade,
  part_number              int  not null check (part_number > 0),
  part_label               text,
  text_original            text not null,
  text_translated          text,
  status                   text not null default 'pending'
                             check (status in ('pending','translating','completed','edited','failed')),
  error_message            text,
  last_provider_used       text,
  last_model_used          text,
  word_count_original      int not null default 0,
  word_count_translated    int not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (story_id, part_number)
);

create trigger story_parts_set_updated_at
  before update on public.story_parts
  for each row execute function public.set_updated_at();

create index story_parts_story_idx
  on public.story_parts (story_id, part_number);


-- -----------------------------------------------------------------------------
-- 7. story_part_versions (translation history; per-part auto-incrementing)
-- -----------------------------------------------------------------------------
create table public.story_part_versions (
  id                      uuid primary key default gen_random_uuid(),
  story_part_id           uuid not null references public.story_parts(id) on delete cascade,
  version_number          int  not null check (version_number > 0),
  translated_text         text not null,
  provider_used           text,
  model_used              text,
  tone_id                 uuid references public.tones(id) on delete set null,
  complexity              text,
  custom_instructions     text,
  created_by              text not null check (created_by in ('ai','admin')),
  created_at              timestamptz not null default now(),
  unique (story_part_id, version_number)
);

create index story_part_versions_part_idx
  on public.story_part_versions (story_part_id, version_number desc);


-- -----------------------------------------------------------------------------
-- 8. ai_config (singleton row; id pinned so upserts are trivial)
-- -----------------------------------------------------------------------------
create table public.ai_config (
  id                uuid primary key,
  default_provider  text not null default 'gemini',
  default_model     text not null default 'gemini-2.0-flash',
  updated_at        timestamptz not null default now()
);

create trigger ai_config_set_updated_at
  before update on public.ai_config
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 9. translation_jobs (per-attempt log for debugging + cost tracking)
-- -----------------------------------------------------------------------------
create table public.translation_jobs (
  id              uuid primary key default gen_random_uuid(),
  story_part_id   uuid not null references public.story_parts(id) on delete cascade,
  attempt_number  int  not null default 1,
  status          text not null check (status in ('started','succeeded','failed')),
  provider        text,
  model           text,
  input_tokens    int,
  output_tokens   int,
  duration_ms     int,
  error_message   text,
  created_at      timestamptz not null default now()
);

create index translation_jobs_part_idx
  on public.translation_jobs (story_part_id, created_at desc);
