"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/check-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { wordCount } from "@/lib/utils/word-count";
import { composeVariantSlug } from "@/lib/variants/url";
import {
  INITIAL_STORY_EDIT_FORM_STATE,
  INITIAL_STORY_FORM_STATE,
  type StoryEditFormState,
  type StoryFormState,
} from "./stories.types";

const COMPLEXITY_VALUES = ["daily", "simple", "standard", "advanced", "scholarly"] as const;
type Complexity = (typeof COMPLEXITY_VALUES)[number];
const STATUS_VALUES = ["draft", "published"] as const;

interface ParsedPart {
  label: string | null;
  text: string;
}

/**
 * Pull the manually-entered or bulk-imported parts out of the form data.
 * The create form serializes parts as:
 *   parts[0].label, parts[0].text, parts[1].label, parts[1].text, ...
 * Empty parts (no text) are dropped.
 */
function readParts(formData: FormData): ParsedPart[] {
  const indices = new Set<number>();
  for (const key of formData.keys()) {
    const match = key.match(/^parts\[(\d+)\]\.(label|text)$/);
    if (match) indices.add(Number(match[1]));
  }
  return [...indices]
    .sort((a, b) => a - b)
    .map((i) => ({
      label: (formData.get(`parts[${i}].label`)?.toString() ?? "").trim() || null,
      text: (formData.get(`parts[${i}].text`)?.toString() ?? "").trim(),
    }))
    .filter((p) => p.text.length > 0);
}

/**
 * Create a story (source-only fields) plus its parts plus, optionally, one
 * initial variant. The form lives at /admin/stories/new — on success we
 * return createdStoryId so the client can redirect to the edit page where
 * the variant's translation queue can be started.
 *
 * Per-variant fields (target_language, tone, complexity, provider, model,
 * custom_instructions, title_translated) live on story_variants now and are
 * grouped into the optional firstVariant block of the form. If supplied,
 * one variant + N pending story_part_translations are inserted alongside.
 */
export async function createStory(
  _previousState: StoryFormState,
  formData: FormData,
): Promise<StoryFormState> {
  await requireAdmin();

  const titleOriginal = (formData.get("title_original")?.toString() ?? "").trim();
  const authorOriginal =
    (formData.get("author_original")?.toString() ?? "").trim() || null;
  const sourceUrl = (formData.get("source_url")?.toString() ?? "").trim() || null;
  const coverImageUrl =
    (formData.get("cover_image_url")?.toString() ?? "").trim() || null;
  const subcategoryId = (formData.get("subcategory_id")?.toString() ?? "").trim();
  const statusRaw = (formData.get("status")?.toString() ?? "draft").trim();

  // First variant (optional). Empty values mean "don't seed a variant yet".
  const targetLanguage = (formData.get("target_language")?.toString() ?? "").trim().toLowerCase();
  const toneId = (formData.get("tone_id")?.toString() ?? "").trim();
  const complexityRaw = (formData.get("complexity")?.toString() ?? "standard").trim();
  const aiProvider = (formData.get("ai_provider")?.toString() ?? "").trim() || null;
  const aiModel = (formData.get("ai_model")?.toString() ?? "").trim() || null;
  const customInstructions =
    (formData.get("custom_instructions")?.toString() ?? "").trim() || null;
  const titleTranslated =
    (formData.get("title_translated")?.toString() ?? "").trim() || null;

  const wantsVariant = Boolean(targetLanguage && toneId);

  if (!titleOriginal) {
    return { ...INITIAL_STORY_FORM_STATE, error: "Title is required." };
  }
  if (!subcategoryId) {
    return { ...INITIAL_STORY_FORM_STATE, error: "Subcategory is required." };
  }
  if (!(STATUS_VALUES as ReadonlyArray<string>).includes(statusRaw)) {
    return { ...INITIAL_STORY_FORM_STATE, error: "Invalid status." };
  }
  if (wantsVariant && !(COMPLEXITY_VALUES as ReadonlyArray<string>).includes(complexityRaw)) {
    return { ...INITIAL_STORY_FORM_STATE, error: "Invalid complexity." };
  }
  if ((targetLanguage && !toneId) || (toneId && !targetLanguage)) {
    return {
      ...INITIAL_STORY_FORM_STATE,
      error: "Pick both target language and tone, or leave both blank to skip the first variant.",
    };
  }

  const parts = readParts(formData);
  if (parts.length === 0) {
    return {
      ...INITIAL_STORY_FORM_STATE,
      error: "Add at least one part (or paste a full story via Bulk import).",
    };
  }

  const totalWordsOriginal = parts.reduce((sum, p) => sum + wordCount(p.text), 0);
  const status = statusRaw as (typeof STATUS_VALUES)[number];

  const admin = createAdminClient();

  // 1) Insert the source story.
  const { data: story, error: insertErr } = await admin
    .from("stories")
    .insert({
      subcategory_id: subcategoryId,
      title_original: titleOriginal,
      author_original: authorOriginal,
      source_url: sourceUrl,
      cover_image_url: coverImageUrl,
      status,
      total_parts: parts.length,
      total_words_original: totalWordsOriginal,
      published_at: status === "published" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (insertErr || !story) {
    return {
      ...INITIAL_STORY_FORM_STATE,
      error: `Could not create story: ${insertErr?.message ?? "unknown error"}`,
    };
  }

  // 2) Insert all parts.
  const partRows = parts.map((p, idx) => ({
    story_id: story.id,
    part_number: idx + 1,
    part_label: p.label ?? `Part ${idx + 1}`,
    text_original: p.text,
    word_count_original: wordCount(p.text),
  }));

  const { data: insertedParts, error: partsErr } = await admin
    .from("story_parts")
    .insert(partRows)
    .select("id");
  if (partsErr || !insertedParts) {
    // Best-effort rollback so we don't leave an orphaned story.
    await admin.from("stories").delete().eq("id", story.id);
    return {
      ...INITIAL_STORY_FORM_STATE,
      error: `Story rolled back — could not save parts: ${partsErr?.message ?? "unknown"}`,
    };
  }

  // 3) Optionally seed the first variant + its pending translations.
  if (wantsVariant) {
    const { data: tone } = await admin
      .from("tones")
      .select("name")
      .eq("id", toneId)
      .single();
    const slug = composeVariantSlug(targetLanguage, tone?.name ?? targetLanguage);

    const { data: variant, error: vErr } = await admin
      .from("story_variants")
      .insert({
        story_id: story.id,
        target_language: targetLanguage,
        tone_id: toneId,
        slug,
        complexity: complexityRaw as Complexity,
        title_translated: titleTranslated,
        custom_instructions: customInstructions,
        ai_provider: aiProvider,
        ai_model: aiModel,
        status,
        is_primary: true,
        published_at: status === "published" ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (vErr || !variant) {
      await admin.from("stories").delete().eq("id", story.id);
      return {
        ...INITIAL_STORY_FORM_STATE,
        error: `Story rolled back — could not create first variant: ${vErr?.message ?? "unknown"}`,
      };
    }

    const translationRows = insertedParts.map((p) => ({
      variant_id: variant.id,
      story_part_id: p.id,
      status: "pending" as const,
    }));
    const { error: trErr } = await admin
      .from("story_part_translations")
      .insert(translationRows);
    if (trErr) {
      await admin.from("stories").delete().eq("id", story.id);
      return {
        ...INITIAL_STORY_FORM_STATE,
        error: `Story rolled back — could not seed translations: ${trErr.message}`,
      };
    }
  }

  revalidatePath("/admin/stories");
  return { error: null, createdStoryId: story.id, savedAt: Date.now() };
}

/**
 * Edit (metadata-only) update of a source story. Per-variant fields live on
 * story_variants and are edited via story-variants actions.
 */
export interface UpdateStoryMetadataInput {
  id: string;
  title_original?: string;
  author_original?: string | null;
  source_url?: string | null;
  cover_image_url?: string | null;
  subcategory_id?: string;
}

export async function updateStoryMetadata(input: UpdateStoryMetadataInput): Promise<void> {
  await requireAdmin();
  const { id, ...rest } = input;
  const admin = createAdminClient();
  const { error } = await admin.from("stories").update(rest).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/stories");
  revalidatePath(`/admin/stories/${id}`);
}

/**
 * FormData wrapper around updateStoryMetadata for use with React 19's
 * useActionState in the EditStoryMetadataDialog.
 */
export async function updateStoryFromForm(
  _previousState: StoryEditFormState,
  formData: FormData,
): Promise<StoryEditFormState> {
  await requireAdmin();

  const id = (formData.get("id")?.toString() ?? "").trim();
  if (!id) return { ...INITIAL_STORY_EDIT_FORM_STATE, error: "Missing story id." };

  const titleOriginal = (formData.get("title_original")?.toString() ?? "").trim();
  const authorOriginal =
    (formData.get("author_original")?.toString() ?? "").trim() || null;
  const sourceUrl = (formData.get("source_url")?.toString() ?? "").trim() || null;
  const coverImageUrl =
    (formData.get("cover_image_url")?.toString() ?? "").trim() || null;
  const subcategoryId = (formData.get("subcategory_id")?.toString() ?? "").trim();

  if (!titleOriginal) {
    return { ...INITIAL_STORY_EDIT_FORM_STATE, error: "Title is required." };
  }
  if (!subcategoryId) {
    return { ...INITIAL_STORY_EDIT_FORM_STATE, error: "Subcategory is required." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("stories")
    .update({
      title_original: titleOriginal,
      author_original: authorOriginal,
      source_url: sourceUrl,
      cover_image_url: coverImageUrl,
      subcategory_id: subcategoryId,
    })
    .eq("id", id);

  if (error) {
    return { ...INITIAL_STORY_EDIT_FORM_STATE, error: error.message };
  }

  revalidatePath("/admin/stories");
  revalidatePath(`/admin/stories/${id}`);
  return { error: null, savedAt: Date.now() };
}

export async function setStoryPublished(id: string, published: boolean): Promise<void> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("stories")
    .update({
      status: published ? "published" : "draft",
      published_at: published ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/stories");
  revalidatePath(`/admin/stories/${id}`);
}

export async function deleteStory(id: string): Promise<{ error: string | null }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    // Soft delete keeps the FK chain intact (story_parts cascades only on
    // hard delete). Per requirements, soft delete is the only removal.
    const { error } = await admin
      .from("stories")
      .update({ is_active: false, status: "draft" })
      .eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/admin/stories");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}
