import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoryCardData } from "@/components/shared/StoryCard";
import type { Database } from "@/lib/supabase/types";

/**
 * Columns every public listing pulls to render a story card. Each card
 * represents one *story* (not variant) but renders the primary variant's
 * language/tone/title/reading-time so readers see the most relevant
 * preview. PostgREST's `!inner` join + the `.eq('variants.is_primary',...)`
 * filter in the query enforce "has at least one published primary variant".
 */
export const STORY_CARD_COLUMNS = `id, title_original, cover_image_url, total_parts, published_at,
  variants:story_variants!inner (
    slug, title_translated, estimated_reading_minutes, is_primary,
    language:languages!inner ( name_english, font_family, font_family_reading ),
    tone:tones!inner ( name )
  )` as const;

interface StoryCardQueryRow {
  id: string;
  title_original: string;
  cover_image_url: string | null;
  total_parts: number;
  variants:
    | {
        slug: string;
        title_translated: string | null;
        estimated_reading_minutes: number | null;
        is_primary: boolean;
        language: {
          name_english: string;
          font_family: string | null;
          font_family_reading: string | null;
        } | null;
        tone: { name: string } | null;
      }[]
    | null;
}

/**
 * Shape a STORY_CARD_COLUMNS row into StoryCardData. Picks the primary
 * variant if present, falls back to the first one. Returns null when the
 * story has no published variants (PostgREST !inner already filters those
 * out for the public anon client, but keep the guard for typing).
 */
export function toStoryCard(row: StoryCardQueryRow): StoryCardData | null {
  const variants = row.variants ?? [];
  if (variants.length === 0) return null;
  const variant = variants.find((v) => v.is_primary) ?? variants[0];
  return {
    id: row.id,
    variant_slug: variant.slug,
    title_original: row.title_original,
    title_translated: variant.title_translated,
    cover_image_url: row.cover_image_url,
    total_parts: row.total_parts,
    estimated_reading_minutes: variant.estimated_reading_minutes,
    language_name_english: variant.language?.name_english ?? "",
    language_font_family: variant.language?.font_family ?? null,
    language_font_family_reading: variant.language?.font_family_reading ?? null,
    tone_name: variant.tone?.name ?? null,
  };
}

/** Page size for the home-page infinite-scroll listing. */
export const STORY_PAGE_SIZE = 24;

export interface StoryCardFilter {
  /**
   * Restrict to stories in these subcategories. Resolve a selected category to
   * all of its subcategory ids, or a selected subcategory to a single id.
   * `null`/empty means "no subcategory filter".
   */
  subcategoryIds?: string[] | null;
  /** Restrict to stories that have a published variant in this language code. */
  language?: string | null;
}

/**
 * Fetch one page of story cards with optional category/subcategory/language
 * filters, newest first. Works with either the server or browser Supabase
 * client (RLS gates both to published + active content), so the home page can
 * render page 0 on the server and the client can lazy-load the rest on scroll.
 */
export async function fetchStoryCards(
  supabase: SupabaseClient<Database>,
  { filter, page }: { filter?: StoryCardFilter; page: number },
): Promise<{ cards: StoryCardData[]; hasMore: boolean }> {
  const from = page * STORY_PAGE_SIZE;
  const to = from + STORY_PAGE_SIZE - 1;

  let query = supabase
    .from("stories")
    .select(STORY_CARD_COLUMNS)
    .order("published_at", { ascending: false })
    .range(from, to);

  if (filter?.subcategoryIds && filter.subcategoryIds.length > 0) {
    query = query.in("subcategory_id", filter.subcategoryIds);
  }
  if (filter?.language) {
    // Filtering the embedded `variants` relation (which is an `!inner` join)
    // both narrows each story's variants to the chosen language and drops
    // stories that have no such variant.
    query = query.eq("variants.target_language", filter.language);
  }

  const { data, error } = await query;
  if (error) throw error;

  const cards = (data ?? [])
    .map(toStoryCard)
    .filter((s): s is StoryCardData => s !== null);

  // A full page back implies there may be more; a short page means we're done.
  return { cards, hasMore: (data?.length ?? 0) === STORY_PAGE_SIZE };
}
