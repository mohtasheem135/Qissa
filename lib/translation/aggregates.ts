import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Recompute story.total_parts + total_words_original from the live
 * story_parts rows. The "original" fields are story-level because the
 * source text is shared across all variants.
 */
export async function syncStoryAggregates(storyId: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("story_parts")
    .select("word_count_original")
    .eq("story_id", storyId);

  const totalWordsOriginal = (data ?? []).reduce(
    (s, p) => s + (p.word_count_original ?? 0),
    0,
  );
  const totalParts = data?.length ?? 0;

  await admin
    .from("stories")
    .update({
      total_parts: totalParts,
      total_words_original: totalWordsOriginal,
    })
    .eq("id", storyId);
}

/**
 * Recompute story_variants.total_words_translated + estimated_reading_minutes
 * from the live story_part_translations rows. Called after edits, deletes,
 * or part additions that affect this variant's word counts.
 */
export async function syncVariantAggregates(variantId: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("story_part_translations")
    .select("word_count")
    .eq("variant_id", variantId);
  const total = (data ?? []).reduce((s, t) => s + (t.word_count ?? 0), 0);
  await admin
    .from("story_variants")
    .update({
      total_words_translated: total,
      estimated_reading_minutes: total > 0 ? Math.max(1, Math.ceil(total / 200)) : null,
    })
    .eq("id", variantId);
}

/**
 * Run syncVariantAggregates for every active variant of a story. Use after a
 * shared change (e.g. a story_part was added/removed) that affects all
 * variants in lockstep.
 */
export async function syncAllVariantAggregatesForStory(storyId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: variants } = await admin
    .from("story_variants")
    .select("id")
    .eq("story_id", storyId);
  if (!variants) return;
  await Promise.all(variants.map((v) => syncVariantAggregates(v.id)));
}
