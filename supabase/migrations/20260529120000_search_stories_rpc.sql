-- =============================================================================
-- Qissa — public search across original title + author + per-variant titles
-- =============================================================================
-- Goal: a Hindi reader searching for "गोदान" should find the story even when
-- only the variant's `title_translated` carries that text. Today's search page
-- ILIKEs `stories.title_original` only — the multi-variant migration
-- (20260524120000) dropped the old `stories.title_translated` column and its
-- trigram index without replacing them on `story_variants.title_translated`,
-- which is where the translated titles now live.
--
-- This migration:
--   1. Adds pg_trgm GIN indexes on `stories.author_original` and
--      `story_variants.title_translated` so ILIKE stays fast against both.
--   2. Defines `search_stories(q, max_results)` — an RPC that UNIONs matches
--      across `stories.title_original`, `stories.author_original`, and
--      `story_variants.title_translated`, returning distinct story IDs ranked
--      by best-of-three trigram similarity. The Next.js search page calls
--      this and then fetches the full STORY_CARD_COLUMNS for the matched IDs.
--
-- Security: `security invoker` so RLS still applies — anon callers only see
-- published+active rows (existing policies already enforce this on both
-- `stories` and `story_variants`). The function double-filters on
-- `status = 'published' and is_active = true` anyway so the body is correct
-- even if the policies are ever loosened.
-- =============================================================================

set search_path to public, extensions;


-- -----------------------------------------------------------------------------
-- 1. Trigram indexes for ILIKE acceleration
-- -----------------------------------------------------------------------------

create index if not exists stories_author_original_trgm
  on public.stories using gin (author_original gin_trgm_ops);

create index if not exists story_variants_title_translated_trgm
  on public.story_variants using gin (title_translated gin_trgm_ops);


-- -----------------------------------------------------------------------------
-- 2. search_stories RPC
-- -----------------------------------------------------------------------------
-- Caller must escape ILIKE wildcards (`%` and `_`) in `q` before passing them
-- in so a literal `%` doesn't match-all. The Next.js search page does this in
-- `runSearch()` — see app/(public)/search/page.tsx.
--
-- Returns at most `max_results` rows of (story_id, score) ordered by score
-- desc, then story_id asc as a deterministic tie-breaker. `score` is the
-- max of three pg_trgm similarity scores: title_original, author_original,
-- and the best matching published variant's title_translated.
-- -----------------------------------------------------------------------------

create or replace function public.search_stories(
  q text,
  max_results int default 60
)
returns table (story_id uuid, score real)
language sql
stable
security invoker
as $$
  with matches as (
    select
      s.id as story_id,
      greatest(
        similarity(s.title_original, q),
        coalesce(similarity(s.author_original, q), 0),
        coalesce(
          (
            select max(similarity(v.title_translated, q))
            from public.story_variants v
            where v.story_id = s.id
              and v.status = 'published'
              and v.is_active = true
              and v.title_translated is not null
              and v.title_translated ilike '%' || q || '%'
          ),
          0
        )
      )::real as score
    from public.stories s
    where s.status = 'published'
      and s.is_active = true
      and length(btrim(q)) > 0
      and (
        s.title_original ilike '%' || q || '%'
        or (s.author_original is not null
            and s.author_original ilike '%' || q || '%')
        or exists (
          select 1
          from public.story_variants v
          where v.story_id = s.id
            and v.status = 'published'
            and v.is_active = true
            and v.title_translated is not null
            and v.title_translated ilike '%' || q || '%'
        )
      )
  )
  select story_id, score
  from matches
  order by score desc, story_id
  limit max_results;
$$;


-- Anonymous reader can execute this; authenticated future-account users too.
grant execute on function public.search_stories(text, int) to anon, authenticated;
