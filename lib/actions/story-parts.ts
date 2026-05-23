"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/check-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import { wordCount } from "@/lib/utils/word-count";

type StoryPartUpdate = Database["public"]["Tables"]["story_parts"]["Update"];

interface UpdatePartTextsInput {
  partId: string;
  textOriginal?: string;
  textTranslated?: string | null;
  partLabel?: string | null;
}

/**
 * Save edits to a part's text fields. Translated edits mark status='edited'
 * AND create a new story_part_versions row (so the prior AI translation
 * stays accessible via the version history). Original edits don't make a
 * version; they're considered source-of-truth changes.
 */
export async function updatePartTexts(input: UpdatePartTextsInput): Promise<void> {
  await requireAdmin();
  const admin = createAdminClient();

  // Pull the current row so we know if text_translated actually changed
  // (avoids creating no-op versions when the admin just touched the original).
  const { data: existing, error: fetchErr } = await admin
    .from("story_parts")
    .select("story_id, text_translated, last_provider_used, last_model_used")
    .eq("id", input.partId)
    .single();
  if (fetchErr || !existing) {
    throw new Error(fetchErr?.message ?? "Story part not found.");
  }

  const updates: StoryPartUpdate = {};
  let translatedChanged = false;

  if (typeof input.partLabel !== "undefined") {
    updates.part_label = input.partLabel;
  }
  if (typeof input.textOriginal === "string") {
    updates.text_original = input.textOriginal;
    updates.word_count_original = wordCount(input.textOriginal);
  }
  if (typeof input.textTranslated !== "undefined") {
    const next = input.textTranslated ?? "";
    if (next !== (existing.text_translated ?? "")) {
      updates.text_translated = next;
      updates.word_count_translated = wordCount(next);
      updates.status = next.length > 0 ? "edited" : "pending";
      translatedChanged = true;
    }
  }

  if (Object.keys(updates).length === 0) return;

  const { error: updateErr } = await admin
    .from("story_parts")
    .update(updates)
    .eq("id", input.partId);
  if (updateErr) throw new Error(updateErr.message);

  // Snapshot the previous translation as a version *only* when the
  // translated text actually changed and the prior value was non-empty.
  if (translatedChanged && existing.text_translated && existing.text_translated.length > 0) {
    const { data: latest } = await admin
      .from("story_part_versions")
      .select("version_number")
      .eq("story_part_id", input.partId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (latest?.version_number ?? 0) + 1;

    await admin.from("story_part_versions").insert({
      story_part_id: input.partId,
      version_number: nextVersion,
      translated_text: input.textTranslated ?? "",
      provider_used: existing.last_provider_used,
      model_used: existing.last_model_used,
      created_by: "admin",
    });
  }

  revalidatePath(`/admin/stories/${existing.story_id}`);
}

/**
 * Add an empty trailing part. The admin fills text on the edit page,
 * then translates from the new part onward.
 */
export async function addStoryPart(storyId: string): Promise<{ partId: string }> {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: last } = await admin
    .from("story_parts")
    .select("part_number")
    .eq("story_id", storyId)
    .order("part_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextNumber = (last?.part_number ?? 0) + 1;

  const { data, error } = await admin
    .from("story_parts")
    .insert({
      story_id: storyId,
      part_number: nextNumber,
      part_label: `Part ${nextNumber}`,
      text_original: "",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not add part.");

  await syncStoryAggregates(storyId);
  revalidatePath(`/admin/stories/${storyId}`);
  return { partId: data.id };
}

export async function deleteStoryPart(partId: string): Promise<{ error: string | null }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const { data: part } = await admin
      .from("story_parts")
      .select("story_id")
      .eq("id", partId)
      .single();
    if (!part) return { error: "Part not found." };

    const { error: delErr } = await admin.from("story_parts").delete().eq("id", partId);
    if (delErr) return { error: delErr.message };

    // Renumber remaining parts so part_number stays a dense sequence.
    const { data: remaining } = await admin
      .from("story_parts")
      .select("id, part_number")
      .eq("story_id", part.story_id)
      .order("part_number", { ascending: true });

    if (remaining) {
      for (let i = 0; i < remaining.length; i++) {
        const expected = i + 1;
        if (remaining[i].part_number !== expected) {
          await admin
            .from("story_parts")
            .update({ part_number: expected })
            .eq("id", remaining[i].id);
        }
      }
    }

    await syncStoryAggregates(part.story_id);
    revalidatePath(`/admin/stories/${part.story_id}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error." };
  }
}

/**
 * Swap two parts' positions. Used by the ⬆ / ⬇ buttons on the edit page.
 * Two-step update via temporary part_number to dodge the (story_id,
 * part_number) UNIQUE constraint.
 */
export async function moveStoryPart(
  partId: string,
  direction: "up" | "down",
): Promise<{ error: string | null }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();

    const { data: target } = await admin
      .from("story_parts")
      .select("id, story_id, part_number")
      .eq("id", partId)
      .single();
    if (!target) return { error: "Part not found." };

    const neighborNumber = direction === "up" ? target.part_number - 1 : target.part_number + 1;
    if (neighborNumber < 1) return { error: null }; // already first

    const { data: neighbor } = await admin
      .from("story_parts")
      .select("id, part_number")
      .eq("story_id", target.story_id)
      .eq("part_number", neighborNumber)
      .maybeSingle();
    if (!neighbor) return { error: null }; // already last

    // Park `target` at -1 to free up its slot, then swap.
    await admin.from("story_parts").update({ part_number: -1 }).eq("id", target.id);
    await admin
      .from("story_parts")
      .update({ part_number: target.part_number })
      .eq("id", neighbor.id);
    await admin
      .from("story_parts")
      .update({ part_number: neighbor.part_number })
      .eq("id", target.id);

    revalidatePath(`/admin/stories/${target.story_id}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error." };
  }
}

/**
 * Restore a previous translation version. Bumps the version_number forward
 * (i.e., creates a NEW version that happens to hold old text) so the
 * audit trail is preserved.
 */
export async function restorePartVersion(
  partId: string,
  versionId: string,
): Promise<{ error: string | null }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();

    const { data: version, error: fetchErr } = await admin
      .from("story_part_versions")
      .select("translated_text, provider_used, model_used, tone_id, complexity, custom_instructions")
      .eq("id", versionId)
      .single();
    if (fetchErr || !version) return { error: fetchErr?.message ?? "Version not found." };

    const { data: latest } = await admin
      .from("story_part_versions")
      .select("version_number")
      .eq("story_part_id", partId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (latest?.version_number ?? 0) + 1;

    await admin.from("story_part_versions").insert({
      story_part_id: partId,
      version_number: nextVersion,
      translated_text: version.translated_text,
      provider_used: version.provider_used,
      model_used: version.model_used,
      tone_id: version.tone_id,
      complexity: version.complexity,
      custom_instructions: version.custom_instructions,
      created_by: "admin",
    });

    const { data: part } = await admin
      .from("story_parts")
      .select("story_id")
      .eq("id", partId)
      .single();

    await admin
      .from("story_parts")
      .update({
        text_translated: version.translated_text,
        status: "edited",
        word_count_translated: wordCount(version.translated_text),
      })
      .eq("id", partId);

    if (part?.story_id) revalidatePath(`/admin/stories/${part.story_id}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error." };
  }
}

/**
 * Recompute `stories.total_parts`, total_words_*, estimated_reading_minutes
 * from the live story_parts rows. Called whenever parts change in
 * cardinality or word count.
 */
async function syncStoryAggregates(storyId: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("story_parts")
    .select("word_count_original, word_count_translated")
    .eq("story_id", storyId);

  const totalWordsOriginal = (data ?? []).reduce((s, p) => s + (p.word_count_original ?? 0), 0);
  const totalWordsTranslated = (data ?? []).reduce(
    (s, p) => s + (p.word_count_translated ?? 0),
    0,
  );
  const totalParts = data?.length ?? 0;

  await admin
    .from("stories")
    .update({
      total_parts: totalParts,
      total_words_original: totalWordsOriginal,
      total_words_translated: totalWordsTranslated,
      estimated_reading_minutes: Math.max(1, Math.ceil(totalWordsOriginal / 200)),
    })
    .eq("id", storyId);
}
