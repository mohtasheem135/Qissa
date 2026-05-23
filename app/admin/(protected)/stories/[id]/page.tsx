import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StoryEditShell, type StoryEditData } from "@/components/admin/StoryEditShell";
import type {
  CategoryWithSubsOption,
  LanguageOption,
  ToneOption,
} from "@/components/admin/StoryForm";
import type { StoryMetadataInitialValue } from "@/components/admin/EditStoryMetadataDialog";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConfiguredProviders, PROVIDERS } from "@/lib/ai/registry";

export const metadata: Metadata = {
  title: "Edit story",
};

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function StoryEditPage({ params }: PageProps) {
  const { id } = await params;
  const admin = createAdminClient();

  const [
    { data, error },
    { data: categoryRows, error: catErr },
    { data: languageRows, error: langErr },
    { data: toneRows, error: toneErr },
  ] = await Promise.all([
    admin
      .from("stories")
      .select(
        `id, title_original, title_translated, author_original, source_url,
         cover_image_url, status, complexity, custom_instructions,
         total_words_original, total_words_translated,
         ai_provider, ai_model, target_language, tone_id, subcategory_id,
         subcategory:subcategories!inner ( id, category_id, name, category:categories!inner ( id, name ) ),
         tone:tones!inner ( name ),
         language:languages!inner ( name_english ),
         parts:story_parts (
           id, part_number, part_label, text_original, text_translated,
           status, error_message, last_provider_used, last_model_used,
           word_count_original, word_count_translated,
           versions:story_part_versions (
             id, version_number, translated_text, provider_used, model_used, created_by, created_at
           )
         )`,
      )
      .eq("id", id)
      .single(),
    admin
      .from("categories")
      .select("id, name, subcategories ( id, name, is_active )")
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
    admin
      .from("languages")
      .select("code, name_english")
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
    admin
      .from("tones")
      .select("id, name, language_code")
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  if (error?.code === "PGRST116") notFound();
  if (error) throw error;
  if (!data) notFound();
  if (catErr) throw catErr;
  if (langErr) throw langErr;
  if (toneErr) throw toneErr;

  const parts = (data.parts ?? [])
    .map((p) => ({
      id: p.id,
      part_number: p.part_number,
      part_label: p.part_label,
      text_original: p.text_original,
      text_translated: p.text_translated,
      status: p.status as StoryEditData["parts"][number]["status"],
      error_message: p.error_message,
      last_provider_used: p.last_provider_used,
      last_model_used: p.last_model_used,
      word_count_original: p.word_count_original,
      word_count_translated: p.word_count_translated,
      versions: (p.versions ?? []).map((v) => ({
        id: v.id,
        version_number: v.version_number,
        translated_text: v.translated_text,
        provider_used: v.provider_used,
        model_used: v.model_used,
        created_by: v.created_by as "ai" | "admin",
        created_at: v.created_at,
      })),
    }))
    .sort((a, b) => a.part_number - b.part_number);

  const story: StoryEditData = {
    id: data.id,
    title_original: data.title_original,
    title_translated: data.title_translated,
    cover_image_url: data.cover_image_url,
    category_name: data.subcategory?.category?.name ?? "—",
    subcategory_name: data.subcategory?.name ?? "—",
    language_name_english: data.language?.name_english ?? data.target_language,
    tone_name: data.tone?.name ?? "—",
    ai_provider: data.ai_provider,
    ai_model: data.ai_model,
    status: (data.status === "published" ? "published" : "draft") as "draft" | "published",
    total_words_original: data.total_words_original,
    total_words_translated: data.total_words_translated,
    parts,
  };

  // ---- Options for the EditStoryMetadataDialog -----------------------------
  const categories: CategoryWithSubsOption[] = (categoryRows ?? [])
    .map((c) => ({
      id: c.id,
      name: c.name,
      subcategories: (c.subcategories ?? [])
        .filter((s) => s.is_active)
        .map((s) => ({ id: s.id, name: s.name })),
    }))
    .filter((c) => c.subcategories.length > 0);
  const languages: LanguageOption[] = languageRows ?? [];
  const tones: ToneOption[] = toneRows ?? [];

  const editInitial: StoryMetadataInitialValue = {
    id: data.id,
    title_original: data.title_original,
    title_translated: data.title_translated,
    author_original: data.author_original,
    source_url: data.source_url,
    cover_image_url: data.cover_image_url,
    category_id: data.subcategory?.category?.id ?? "",
    subcategory_id: data.subcategory_id,
    target_language: data.target_language,
    tone_id: data.tone_id,
    complexity: data.complexity,
    ai_provider: data.ai_provider,
    ai_model: data.ai_model,
    custom_instructions: data.custom_instructions,
  };

  return (
    <StoryEditShell
      story={story}
      editInitial={editInitial}
      categories={categories}
      languages={languages}
      tones={tones}
      providers={PROVIDERS}
      configuredProviderIds={getConfiguredProviders().map((p) => p.id)}
    />
  );
}
