"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/check-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { wordCount } from "@/lib/utils/word-count";
import {
  INITIAL_STORY_EDIT_FORM_STATE,
  INITIAL_STORY_FORM_STATE,
  type StoryEditFormState,
  type StoryFormState,
} from "./stories.types";

const COMPLEXITY_VALUES = ["daily", "simple", "standard", "advanced", "scholarly"] as const;
const STATUS_VALUES = ["draft", "published"] as const;
const READING_WPM = 200;

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
 * Create a story plus its parts in one round-trip. The form lives at
 * /admin/stories/new — on success we return createdStoryId so the client
 * can redirect to the edit page.
 */
export async function createStory(
  _previousState: StoryFormState,
  formData: FormData,
): Promise<StoryFormState> {
  await requireAdmin();

  const titleOriginal = (formData.get("title_original")?.toString() ?? "").trim();
  const titleTranslated =
    (formData.get("title_translated")?.toString() ?? "").trim() || null;
  const authorOriginal =
    (formData.get("author_original")?.toString() ?? "").trim() || null;
  const sourceUrl = (formData.get("source_url")?.toString() ?? "").trim() || null;
  const coverImageUrl =
    (formData.get("cover_image_url")?.toString() ?? "").trim() || null;
  const subcategoryId = (formData.get("subcategory_id")?.toString() ?? "").trim();
  const targetLanguage = (formData.get("target_language")?.toString() ?? "").trim().toLowerCase();
  const toneId = (formData.get("tone_id")?.toString() ?? "").trim();
  const complexityRaw = (formData.get("complexity")?.toString() ?? "").trim();
  const aiProvider = (formData.get("ai_provider")?.toString() ?? "").trim() || null;
  const aiModel = (formData.get("ai_model")?.toString() ?? "").trim() || null;
  const customInstructions =
    (formData.get("custom_instructions")?.toString() ?? "").trim() || null;
  const statusRaw = (formData.get("status")?.toString() ?? "draft").trim();

  if (!titleOriginal) {
    return { ...INITIAL_STORY_FORM_STATE, error: "Title is required." };
  }
  if (!subcategoryId) {
    return { ...INITIAL_STORY_FORM_STATE, error: "Subcategory is required." };
  }
  if (!targetLanguage) {
    return { ...INITIAL_STORY_FORM_STATE, error: "Target language is required." };
  }
  if (!toneId) {
    return { ...INITIAL_STORY_FORM_STATE, error: "Tone is required." };
  }
  if (!(COMPLEXITY_VALUES as ReadonlyArray<string>).includes(complexityRaw)) {
    return { ...INITIAL_STORY_FORM_STATE, error: "Invalid complexity." };
  }
  if (!(STATUS_VALUES as ReadonlyArray<string>).includes(statusRaw)) {
    return { ...INITIAL_STORY_FORM_STATE, error: "Invalid status." };
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

  // 1) Insert the story.
  const { data: story, error: insertErr } = await admin
    .from("stories")
    .insert({
      subcategory_id: subcategoryId,
      target_language: targetLanguage,
      tone_id: toneId,
      complexity: complexityRaw as (typeof COMPLEXITY_VALUES)[number],
      title_original: titleOriginal,
      title_translated: titleTranslated,
      author_original: authorOriginal,
      source_url: sourceUrl,
      cover_image_url: coverImageUrl,
      ai_provider: aiProvider,
      ai_model: aiModel,
      custom_instructions: customInstructions,
      status,
      total_parts: parts.length,
      total_words_original: totalWordsOriginal,
      estimated_reading_minutes: Math.max(1, Math.ceil(totalWordsOriginal / READING_WPM)),
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

  const { error: partsErr } = await admin.from("story_parts").insert(partRows);
  if (partsErr) {
    // Best-effort rollback so we don't leave an orphaned story.
    await admin.from("stories").delete().eq("id", story.id);
    return {
      ...INITIAL_STORY_FORM_STATE,
      error: `Story rolled back — could not save parts: ${partsErr.message}`,
    };
  }

  revalidatePath("/admin/stories");
  return { error: null, createdStoryId: story.id, savedAt: Date.now() };
}

/**
 * Save metadata changes from the edit page (title, author, language, tone, etc).
 * Returns void; the edit page uses optimistic UI + a sonner toast.
 */
export interface UpdateStoryMetadataInput {
  id: string;
  title_original?: string;
  title_translated?: string | null;
  author_original?: string | null;
  source_url?: string | null;
  cover_image_url?: string | null;
  subcategory_id?: string;
  target_language?: string;
  tone_id?: string;
  complexity?: (typeof COMPLEXITY_VALUES)[number];
  ai_provider?: string | null;
  ai_model?: string | null;
  custom_instructions?: string | null;
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
 * useActionState in the EditStoryMetadataDialog. Mirrors createStory's
 * field validation; required fields are all required on edit too.
 */
export async function updateStoryFromForm(
  _previousState: StoryEditFormState,
  formData: FormData,
): Promise<StoryEditFormState> {
  await requireAdmin();

  const id = (formData.get("id")?.toString() ?? "").trim();
  if (!id) return { ...INITIAL_STORY_EDIT_FORM_STATE, error: "Missing story id." };

  const titleOriginal = (formData.get("title_original")?.toString() ?? "").trim();
  const titleTranslated =
    (formData.get("title_translated")?.toString() ?? "").trim() || null;
  const authorOriginal =
    (formData.get("author_original")?.toString() ?? "").trim() || null;
  const sourceUrl = (formData.get("source_url")?.toString() ?? "").trim() || null;
  const coverImageUrl =
    (formData.get("cover_image_url")?.toString() ?? "").trim() || null;
  const subcategoryId = (formData.get("subcategory_id")?.toString() ?? "").trim();
  const targetLanguage = (formData.get("target_language")?.toString() ?? "").trim().toLowerCase();
  const toneId = (formData.get("tone_id")?.toString() ?? "").trim();
  const complexityRaw = (formData.get("complexity")?.toString() ?? "").trim();
  const aiProvider = (formData.get("ai_provider")?.toString() ?? "").trim() || null;
  const aiModel = (formData.get("ai_model")?.toString() ?? "").trim() || null;
  const customInstructions =
    (formData.get("custom_instructions")?.toString() ?? "").trim() || null;

  if (!titleOriginal) {
    return { ...INITIAL_STORY_EDIT_FORM_STATE, error: "Title is required." };
  }
  if (!subcategoryId) {
    return { ...INITIAL_STORY_EDIT_FORM_STATE, error: "Subcategory is required." };
  }
  if (!targetLanguage) {
    return { ...INITIAL_STORY_EDIT_FORM_STATE, error: "Target language is required." };
  }
  if (!toneId) {
    return { ...INITIAL_STORY_EDIT_FORM_STATE, error: "Tone is required." };
  }
  if (!(COMPLEXITY_VALUES as ReadonlyArray<string>).includes(complexityRaw)) {
    return { ...INITIAL_STORY_EDIT_FORM_STATE, error: "Invalid complexity." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("stories")
    .update({
      title_original: titleOriginal,
      title_translated: titleTranslated,
      author_original: authorOriginal,
      source_url: sourceUrl,
      cover_image_url: coverImageUrl,
      subcategory_id: subcategoryId,
      target_language: targetLanguage,
      tone_id: toneId,
      complexity: complexityRaw as (typeof COMPLEXITY_VALUES)[number],
      ai_provider: aiProvider,
      ai_model: aiModel,
      custom_instructions: customInstructions,
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
