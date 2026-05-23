-- =============================================================================
-- Qissa — Row Level Security policies
-- =============================================================================
-- Public (anon role) can SELECT only active config rows and published stories.
-- All INSERT/UPDATE/DELETE happens server-side via the service-role client
-- (lib/supabase/admin.ts), which bypasses RLS automatically.
--
-- Tables with no SELECT policy below are entirely inaccessible to the anon
-- role: story_part_versions, ai_config, translation_jobs.
-- =============================================================================

-- Enable RLS on every table. (Service-role still bypasses it.)
alter table public.categories            enable row level security;
alter table public.subcategories         enable row level security;
alter table public.languages             enable row level security;
alter table public.tones                 enable row level security;
alter table public.stories               enable row level security;
alter table public.story_parts           enable row level security;
alter table public.story_part_versions   enable row level security;
alter table public.ai_config             enable row level security;
alter table public.translation_jobs      enable row level security;


-- -----------------------------------------------------------------------------
-- Public read policies (anonymous role)
-- -----------------------------------------------------------------------------

create policy "Anyone can read active categories"
  on public.categories
  for select
  to anon, authenticated
  using (is_active = true);

create policy "Anyone can read active subcategories"
  on public.subcategories
  for select
  to anon, authenticated
  using (is_active = true);

create policy "Anyone can read active languages"
  on public.languages
  for select
  to anon, authenticated
  using (is_active = true);

create policy "Anyone can read active tones"
  on public.tones
  for select
  to anon, authenticated
  using (is_active = true);

create policy "Anyone can read published stories"
  on public.stories
  for select
  to anon, authenticated
  using (status = 'published' and is_active = true);

create policy "Anyone can read parts of published stories"
  on public.story_parts
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.stories s
      where s.id = story_parts.story_id
        and s.status = 'published'
        and s.is_active = true
    )
  );


-- -----------------------------------------------------------------------------
-- No public access to: story_part_versions, ai_config, translation_jobs.
-- (Intentionally no policies — service-role only.)
-- -----------------------------------------------------------------------------
