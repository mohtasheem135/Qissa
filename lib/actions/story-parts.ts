"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/check-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import { wordCount } from "@/lib/utils/word-count";
import {
  syncAllVariantAggregatesForStory,
  syncStoryAggregates,
  syncVariantAggregates,
} from "@/lib/translation/aggregates";

type StoryPartUpdate = Database["public"]["Tables"]["story_parts"]["Update"];
type TranslationUpdate = Database["public"]["Tables"]["story_part_translations"]["Update"];

interface UpdatePartTextsInput {
  partId: string;
  /** When supplied, edits the shared original text + label on story_parts. */
  textOriginal?: string;
  partLabel?: string | null;
  /**
   * When supplied, edits one variant's translation (story_part_translations).
   * Requires translationId so the edit targets the right (variant, part) row.
   */
  translationId?: string;
  textTranslated?: string | null;
}

/**
 * Save edits to a part's text fields. Original/label edits hit story_parts
 * (shared across all variants). Translation edits hit one specific
 * story_part_translations row, flip its status to 'edited', and snapshot the
 * prior translation as a story_part_versions row (history preserved).
 */
export async function updatePartTexts(input: UpdatePartTextsInput): Promise<void> {
  await requireAdmin();
  const admin = createAdminClient();

  // 1) Original / label updates on the shared part row.
  const partUpdates: StoryPartUpdate = {};
  if (typeof input.partLabel !== "undefined") partUpdates.part_label = input.partLabel;
  if (typeof input.textOriginal === "string") {
    partUpdates.text_original = input.textOriginal;
    partUpdates.word_count_original = wordCount(input.textOriginal);
  }

  let storyId: string | null = null;

  if (Object.keys(partUpdates).length > 0) {
    const { data: updated, error: updateErr } = await admin
      .from("story_parts")
      .update(partUpdates)
      .eq("id", input.partId)
      .select("story_id")
      .single();
    if (updateErr) throw new Error(updateErr.message);
    storyId = updated?.story_id ?? null;
  }

  // 2) Translation edit on one specific variant's translation row.
  if (typeof input.textTranslated !== "undefined") {
    if (!input.translationId) {
      throw new Error("translationId is required when editing translated text.");
    }
    const { data: existing, error: fetchErr } = await admin
      .from("story_part_translations")
      .select("text, variant_id, ai_provider, ai_model, story_part_id, part:story_parts!inner(story_id)")
      .eq("id", input.translationId)
      .single();
    if (fetchErr || !existing) {
      throw new Error(fetchErr?.message ?? "Translation row not found.");
    }
    if (existing.story_part_id !== input.partId) {
      throw new Error("translationId does not belong to the supplied partId.");
    }
    storyId = storyId ?? existing.part?.story_id ?? null;

    const next = input.textTranslated ?? "";
    if (next !== (existing.text ?? "")) {
      const updates: TranslationUpdate = {
        text: next,
        word_count: wordCount(next),
        status: next.length > 0 ? "edited" : "pending",
      };
      const { error: trErr } = await admin
        .from("story_part_translations")
        .update(updates)
        .eq("id", input.translationId);
      if (trErr) throw new Error(trErr.message);

      // Snapshot the previous translation only when it was non-empty.
      if (existing.text && existing.text.length > 0) {
        const { data: latest } = await admin
          .from("story_part_versions")
          .select("version_number")
          .eq("story_part_translation_id", input.translationId)
          .order("version_number", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextVersion = (latest?.version_number ?? 0) + 1;

        await admin.from("story_part_versions").insert({
          story_part_id: input.partId,
          story_part_translation_id: input.translationId,
          variant_id: existing.variant_id,
          version_number: nextVersion,
          translated_text: next,
          provider_used: existing.ai_provider,
          model_used: existing.ai_model,
          created_by: "admin",
        });
      }

      await syncVariantAggregates(existing.variant_id);
    }
  }

  if (storyId) revalidatePath(`/admin/stories/${storyId}`);
}

/**
 * Add an empty trailing part. Inserts the shared story_parts row AND seeds a
 * pending story_part_translations row for every active variant of this story
 * so the queue can pick it up uniformly.
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

  const { data: newPart, error } = await admin
    .from("story_parts")
    .insert({
      story_id: storyId,
      part_number: nextNumber,
      part_label: `Part ${nextNumber}`,
      text_original: "",
    })
    .select("id")
    .single();
  if (error || !newPart) throw new Error(error?.message ?? "Could not add part.");

  // Seed pending translations for every active variant.
  const { data: variants } = await admin
    .from("story_variants")
    .select("id")
    .eq("story_id", storyId)
    .eq("is_active", true);

  if (variants && variants.length > 0) {
    const rows = variants.map((v) => ({
      variant_id: v.id,
      story_part_id: newPart.id,
      status: "pending" as const,
    }));
    await admin.from("story_part_translations").insert(rows);
  }

  await syncStoryAggregates(storyId);
  revalidatePath(`/admin/stories/${storyId}`);
  return { partId: newPart.id };
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

    // Cascade deletes story_part_translations for every variant.
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
    await syncAllVariantAggregatesForStory(part.story_id);
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
 * (creates a NEW version that holds the old text) so the audit trail is
 * preserved. Operates per-translation (i.e. one specific variant's history).
 */
export async function restorePartVersion(
  translationId: string,
  versionId: string,
): Promise<{ error: string | null }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();

    const { data: version, error: fetchErr } = await admin
      .from("story_part_versions")
      .select(
        "translated_text, provider_used, model_used, tone_id, complexity, custom_instructions, story_part_id, variant_id",
      )
      .eq("id", versionId)
      .single();
    if (fetchErr || !version) return { error: fetchErr?.message ?? "Version not found." };

    const { data: latest } = await admin
      .from("story_part_versions")
      .select("version_number")
      .eq("story_part_translation_id", translationId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (latest?.version_number ?? 0) + 1;

    await admin.from("story_part_versions").insert({
      story_part_id: version.story_part_id,
      story_part_translation_id: translationId,
      variant_id: version.variant_id,
      version_number: nextVersion,
      translated_text: version.translated_text,
      provider_used: version.provider_used,
      model_used: version.model_used,
      tone_id: version.tone_id,
      complexity: version.complexity,
      custom_instructions: version.custom_instructions,
      created_by: "admin",
    });

    await admin
      .from("story_part_translations")
      .update({
        text: version.translated_text,
        status: "edited",
        word_count: wordCount(version.translated_text),
      })
      .eq("id", translationId);

    const { data: tr } = await admin
      .from("story_part_translations")
      .select("variant_id, part:story_parts!inner(story_id)")
      .eq("id", translationId)
      .single();

    if (tr?.variant_id) await syncVariantAggregates(tr.variant_id);
    if (tr?.part?.story_id) revalidatePath(`/admin/stories/${tr.part.story_id}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error." };
  }
}
