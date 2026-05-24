import type { StoryCardData } from "@/components/shared/StoryCard";

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
