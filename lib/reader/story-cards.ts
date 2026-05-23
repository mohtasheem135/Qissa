import type { StoryCardData } from "@/components/shared/StoryCard";

/**
 * Standard column list every public-facing page uses to fetch story
 * cards. Keep this in sync with `toStoryCard` below.
 */
export const STORY_CARD_COLUMNS = `id, title_original, title_translated, cover_image_url, total_parts,
  estimated_reading_minutes, published_at,
  language:languages!inner ( name_english, font_family, font_family_reading ),
  tone:tones!inner ( name )` as const;

interface StoryCardQueryRow {
  id: string;
  title_original: string;
  title_translated: string | null;
  cover_image_url: string | null;
  total_parts: number;
  estimated_reading_minutes: number | null;
  language: {
    name_english: string;
    font_family: string | null;
    font_family_reading: string | null;
  } | null;
  tone: { name: string } | null;
}

/**
 * Shape a `STORY_CARD_COLUMNS` query row into StoryCardData. The shared
 * embedded-join shape lets every listing page use the same mapping.
 */
export function toStoryCard(row: StoryCardQueryRow): StoryCardData {
  return {
    id: row.id,
    title_original: row.title_original,
    title_translated: row.title_translated,
    cover_image_url: row.cover_image_url,
    total_parts: row.total_parts,
    estimated_reading_minutes: row.estimated_reading_minutes,
    language_name_english: row.language?.name_english ?? "",
    language_font_family: row.language?.font_family ?? null,
    language_font_family_reading: row.language?.font_family_reading ?? null,
    tone_name: row.tone?.name ?? null,
  };
}
