"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/check-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import { composeVariantSlug } from "@/lib/variants/url";
import {
  INITIAL_VARIANT_FORM_STATE,
  type VariantFormState,
} from "./story-variants.types";

const COMPLEXITY_VALUES = ["daily", "simple", "standard", "advanced", "scholarly"] as const;
type Complexity = (typeof COMPLEXITY_VALUES)[number];

interface CreateVariantInput {
  storyId: string;
  targetLanguage: string;
  toneId: string;
  complexity: Complexity;
  customInstructions?: string | null;
  aiProvider?: string | null;
  aiModel?: string | null;
  titleTranslated?: string | null;
  makePrimary?: boolean;
}

/**
 * Create one new variant for an existing story. Inserts the variant + one
 * pending story_part_translation per existing story_part, so the admin's
 * Translate queue can immediately pick it up.
 *
 * Returns the inserted variant's id (and slug) so the caller can navigate.
 */
export async function createVariant(
  input: CreateVariantInput,
): Promise<{ id: string; slug: string }> {
  await requireAdmin();
  const admin = createAdminClient();

  // Need the tone's name for the slug.
  const { data: tone, error: toneErr } = await admin
    .from("tones")
    .select("id, name, language_code")
    .eq("id", input.toneId)
    .single();
  if (toneErr || !tone) throw new Error(toneErr?.message ?? "Tone not found.");
  if (tone.language_code !== input.targetLanguage) {
    throw new Error("Tone does not belong to the selected target language.");
  }

  const slug = composeVariantSlug(input.targetLanguage, tone.name);

  if (input.makePrimary) {
    // Clear existing primary on this story first; the partial unique index on
    // (story_id) WHERE is_primary will otherwise reject the insert.
    await admin
      .from("story_variants")
      .update({ is_primary: false })
      .eq("story_id", input.storyId)
      .eq("is_primary", true);
  }

  const { data: variant, error: insertErr } = await admin
    .from("story_variants")
    .insert({
      story_id: input.storyId,
      target_language: input.targetLanguage,
      tone_id: input.toneId,
      slug,
      complexity: input.complexity,
      custom_instructions: input.customInstructions ?? null,
      ai_provider: input.aiProvider ?? null,
      ai_model: input.aiModel ?? null,
      title_translated: input.titleTranslated ?? null,
      is_primary: input.makePrimary ?? false,
    })
    .select("id, slug")
    .single();

  if (insertErr || !variant) {
    throw new Error(insertErr?.message ?? "Could not create variant.");
  }

  // Auto-create pending translation rows for every existing part of this story.
  const { data: parts } = await admin
    .from("story_parts")
    .select("id")
    .eq("story_id", input.storyId)
    .order("part_number", { ascending: true });

  if (parts && parts.length > 0) {
    const translationRows = parts.map((p) => ({
      variant_id: variant.id,
      story_part_id: p.id,
      status: "pending" as const,
    }));
    const { error: trErr } = await admin
      .from("story_part_translations")
      .insert(translationRows);
    if (trErr) {
      // Roll back the variant so the story doesn't end up with an empty variant.
      await admin.from("story_variants").delete().eq("id", variant.id);
      throw new Error(`Variant rolled back — could not seed translations: ${trErr.message}`);
    }
  }

  revalidatePath(`/admin/stories/${input.storyId}`);
  return { id: variant.id, slug: variant.slug };
}

/**
 * FormData-shaped wrapper for createVariant — for use with React 19
 * useActionState in CreateVariantDialog.
 */
export async function createVariantFromForm(
  _previousState: VariantFormState,
  formData: FormData,
): Promise<VariantFormState> {
  await requireAdmin();
  const storyId = (formData.get("story_id")?.toString() ?? "").trim();
  const targetLanguage = (formData.get("target_language")?.toString() ?? "").trim().toLowerCase();
  const toneId = (formData.get("tone_id")?.toString() ?? "").trim();
  const complexityRaw = (formData.get("complexity")?.toString() ?? "standard").trim();
  const titleTranslated =
    (formData.get("title_translated")?.toString() ?? "").trim() || null;
  const customInstructions =
    (formData.get("custom_instructions")?.toString() ?? "").trim() || null;
  const aiProvider = (formData.get("ai_provider")?.toString() ?? "").trim() || null;
  const aiModel = (formData.get("ai_model")?.toString() ?? "").trim() || null;
  const makePrimary = formData.get("make_primary") === "on";

  if (!storyId) return { ...INITIAL_VARIANT_FORM_STATE, error: "Missing story id." };
  if (!targetLanguage) {
    return { ...INITIAL_VARIANT_FORM_STATE, error: "Target language is required." };
  }
  if (!toneId) return { ...INITIAL_VARIANT_FORM_STATE, error: "Tone is required." };
  if (!(COMPLEXITY_VALUES as ReadonlyArray<string>).includes(complexityRaw)) {
    return { ...INITIAL_VARIANT_FORM_STATE, error: "Invalid complexity." };
  }

  try {
    const result = await createVariant({
      storyId,
      targetLanguage,
      toneId,
      complexity: complexityRaw as Complexity,
      customInstructions,
      aiProvider,
      aiModel,
      titleTranslated,
      makePrimary,
    });
    return { error: null, createdVariantId: result.id, savedAt: Date.now() };
  } catch (err) {
    return {
      ...INITIAL_VARIANT_FORM_STATE,
      error: err instanceof Error ? err.message : "Unknown error.",
    };
  }
}

export interface UpdateVariantInput {
  id: string;
  titleTranslated?: string | null;
  complexity?: Complexity;
  customInstructions?: string | null;
  aiProvider?: string | null;
  aiModel?: string | null;
}

export async function updateVariant(input: UpdateVariantInput): Promise<void> {
  await requireAdmin();
  const admin = createAdminClient();

  type VariantUpdate = Database["public"]["Tables"]["story_variants"]["Update"];
  const updates: VariantUpdate = {};
  if (typeof input.titleTranslated !== "undefined") {
    updates.title_translated = input.titleTranslated;
  }
  if (typeof input.complexity !== "undefined") updates.complexity = input.complexity;
  if (typeof input.customInstructions !== "undefined") {
    updates.custom_instructions = input.customInstructions;
  }
  if (typeof input.aiProvider !== "undefined") updates.ai_provider = input.aiProvider;
  if (typeof input.aiModel !== "undefined") updates.ai_model = input.aiModel;

  if (Object.keys(updates).length === 0) return;

  const { data: variant, error } = await admin
    .from("story_variants")
    .update(updates)
    .eq("id", input.id)
    .select("story_id")
    .single();
  if (error) throw new Error(error.message);
  if (variant?.story_id) revalidatePath(`/admin/stories/${variant.story_id}`);
}

export async function setVariantPublished(id: string, published: boolean): Promise<void> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("story_variants")
    .update({
      status: published ? "published" : "draft",
      published_at: published ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .select("story_id")
    .single();
  if (error) throw new Error(error.message);
  if (data?.story_id) {
    revalidatePath(`/admin/stories/${data.story_id}`);
    revalidatePath(`/s/${data.story_id}`);
  }
}

export async function setVariantPrimary(id: string): Promise<void> {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: target, error: fetchErr } = await admin
    .from("story_variants")
    .select("story_id, is_primary")
    .eq("id", id)
    .single();
  if (fetchErr || !target) throw new Error(fetchErr?.message ?? "Variant not found.");
  if (target.is_primary) return;

  await admin
    .from("story_variants")
    .update({ is_primary: false })
    .eq("story_id", target.story_id)
    .eq("is_primary", true);

  const { error: setErr } = await admin
    .from("story_variants")
    .update({ is_primary: true })
    .eq("id", id);
  if (setErr) throw new Error(setErr.message);

  revalidatePath(`/admin/stories/${target.story_id}`);
  revalidatePath(`/s/${target.story_id}`);
}

export async function deleteVariant(id: string): Promise<{ error: string | null }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    // Soft delete; hard delete would cascade-wipe story_part_translations +
    // story_part_versions, losing history. Soft delete just hides it.
    const { data, error } = await admin
      .from("story_variants")
      .update({ is_active: false, status: "draft", is_primary: false })
      .eq("id", id)
      .select("story_id")
      .single();
    if (error) return { error: error.message };
    if (data?.story_id) {
      revalidatePath(`/admin/stories/${data.story_id}`);
      revalidatePath(`/s/${data.story_id}`);
    }
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error." };
  }
}

