-- =============================================================================
-- Qissa — Text-to-Speech (audio narration)
-- =============================================================================
-- Mirrors the translation pipeline's schema:
--   - tts_config           singleton (like ai_config) — global default provider/voice
--   - story_variants       gains tts_provider / tts_voice_id / audio_status
--   - story_part_audio      one premium audio file per translation row (like
--                           story_part_translations is one per (variant, part))
--   - tts_jobs             per-attempt log (like translation_jobs) → cost dashboard
--
-- Audio bytes live in Cloudflare R2; we store only a provider-agnostic
-- audio_path (the R2 object key), mirroring the path-only ImageKit cover
-- decision. RLS gives anon read on audio of published+active variants —
-- copied verbatim from the story_part_translations policy.
-- =============================================================================

set search_path to public, extensions;


-- -----------------------------------------------------------------------------
-- 1. tts_config (singleton row; id pinned so updates are trivial — like ai_config)
-- -----------------------------------------------------------------------------
create table public.tts_config (
  id                    uuid primary key,
  default_tts_provider  text not null default 'sarvam',
  default_voice_id      text not null default 'anushka',
  updated_at            timestamptz not null default now()
);

create trigger tts_config_set_updated_at
  before update on public.tts_config
  for each row execute function public.set_updated_at();

insert into public.tts_config (id, default_tts_provider, default_voice_id)
values ('00000000-0000-0000-0000-000000000001', 'sarvam', 'anushka')
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- 2. story_variants — per-variant voice choice (mirrors ai_provider / ai_model)
-- -----------------------------------------------------------------------------
alter table public.story_variants
  add column tts_provider  text,
  add column tts_voice_id  text,
  add column audio_status   text;


-- -----------------------------------------------------------------------------
-- 3. story_part_audio — one premium audio file per translation row
-- -----------------------------------------------------------------------------
create table public.story_part_audio (
  id                          uuid primary key default gen_random_uuid(),
  story_part_translation_id   uuid not null unique
                                references public.story_part_translations(id) on delete cascade,
  variant_id                  uuid not null references public.story_variants(id) on delete cascade,
  story_part_id               uuid not null references public.story_parts(id) on delete cascade,
  tts_provider                text,
  voice_id                    text,
  status                      text not null default 'pending'
                                check (status in ('pending','generating','completed','failed')),
  audio_path                  text,
  mime_type                   text,
  duration_seconds            numeric,
  byte_size                   bigint,
  characters                  int,
  error_message               text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create trigger story_part_audio_set_updated_at
  before update on public.story_part_audio
  for each row execute function public.set_updated_at();

create index story_part_audio_variant_status_idx
  on public.story_part_audio (variant_id, status);

create index story_part_audio_part_idx
  on public.story_part_audio (story_part_id);


-- -----------------------------------------------------------------------------
-- 4. tts_jobs — per-attempt log (mirrors translation_jobs) → future cost dashboard
-- -----------------------------------------------------------------------------
create table public.tts_jobs (
  id                          uuid primary key default gen_random_uuid(),
  story_part_audio_id         uuid references public.story_part_audio(id) on delete cascade,
  story_part_translation_id   uuid not null
                                references public.story_part_translations(id) on delete cascade,
  variant_id                  uuid not null references public.story_variants(id) on delete cascade,
  attempt_number              int  not null default 1,
  status                      text not null check (status in ('started','succeeded','failed')),
  tts_provider                text,
  voice_id                    text,
  characters                  int,
  duration_ms                 int,
  error_message               text,
  created_at                  timestamptz not null default now()
);

create index tts_jobs_audio_idx
  on public.tts_jobs (story_part_audio_id, created_at desc);

create index tts_jobs_translation_idx
  on public.tts_jobs (story_part_translation_id, created_at desc);


-- -----------------------------------------------------------------------------
-- 5. RLS — anon read on audio of published+active variants
-- -----------------------------------------------------------------------------
-- Copied verbatim from the story_part_translations "read translations of
-- published variants" policy. tts_config + tts_jobs get NO anon policy
-- (service-role only, like ai_config / translation_jobs).
alter table public.story_part_audio enable row level security;
alter table public.tts_config       enable row level security;
alter table public.tts_jobs         enable row level security;

create policy "Anyone can read audio of published variants"
  on public.story_part_audio
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.story_variants v
      join public.stories s on s.id = v.story_id
      where v.id = story_part_audio.variant_id
        and v.status = 'published'
        and v.is_active = true
        and s.status = 'published'
        and s.is_active = true
    )
  );
