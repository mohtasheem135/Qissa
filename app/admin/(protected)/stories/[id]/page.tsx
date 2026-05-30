import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StoryEditShell, type StoryEditData } from "@/components/admin/StoryEditShell";
import type { PartCardData, PartStatus } from "@/components/admin/PartCard";
import type {
  CategoryWithSubsOption,
  LanguageOption,
  ToneOption,
} from "@/components/admin/StoryForm";
import type { StoryMetadataInitialValue } from "@/components/admin/EditStoryMetadataDialog";
import type { VariantPanelData } from "@/components/admin/VariantPanel";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConfiguredProviders, PROVIDERS } from "@/lib/ai/registry";
import { getConfiguredTtsProviders, getVoicesForLanguage } from "@/lib/tts/registry";
import { audioUrl } from "@/lib/r2/url";

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
    { data: story, error: storyErr },
    { data: partsRows, error: partsErr },
    { data: variantsRows, error: variantsErr },
    { data: categoryRows, error: catErr },
    { data: languageRows, error: langErr },
    { data: toneRows, error: toneErr },
    { data: aiConfig },
  ] = await Promise.all([
    admin
      .from("stories")
      .select(
        `id, title_original, author_original, source_url, cover_image_url,
         status, total_words_original, subcategory_id,
         subcategory:subcategories!inner ( id, category_id, name, category:categories!inner ( id, name ) )`,
      )
      .eq("id", id)
      .single(),
    admin
      .from("story_parts")
      .select("id, part_number, part_label, text_original, word_count_original")
      .eq("story_id", id)
      .order("part_number", { ascending: true }),
    admin
      .from("story_variants")
      .select(
        `id, slug, target_language, tone_id, title_translated, status, is_primary,
         ai_provider, ai_model, total_words_translated, tts_provider, tts_model, tts_voice_id,
         language:languages!inner ( name_english ),
         tone:tones!inner ( name ),
         translations:story_part_translations (
           id, story_part_id, status, text, emotion_text, emotion_status, word_count, ai_provider, ai_model, error_message,
           audio:story_part_audio ( status, audio_path, voice_id, error_message ),
           versions:story_part_versions (
             id, version_number, translated_text, provider_used, model_used, created_by, created_at
           )
         )`,
      )
      .eq("story_id", id)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
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
    admin.from("ai_config").select("default_provider, default_model").maybeSingle(),
  ]);

  if (storyErr?.code === "PGRST116") notFound();
  if (storyErr) throw storyErr;
  if (!story) notFound();
  if (partsErr) throw partsErr;
  if (variantsErr) throw variantsErr;
  if (catErr) throw catErr;
  if (langErr) throw langErr;
  if (toneErr) throw toneErr;

  const parts = (partsRows ?? []).map((p) => ({
    id: p.id,
    part_number: p.part_number,
    part_label: p.part_label,
    text_original: p.text_original,
    word_count_original: p.word_count_original,
  }));

  // Build a quick (part_id → source part) lookup for variant assembly.
  const partById = new Map(parts.map((p) => [p.id, p] as const));

  const variants: VariantPanelData[] = (variantsRows ?? [])
    .map((v) => {
      const translations = (v.translations ?? [])
        .filter((t) => partById.has(t.story_part_id))
        .map<PartCardData>((t) => {
          const part = partById.get(t.story_part_id)!;
          const audioRow = Array.isArray(t.audio) ? t.audio[0] : t.audio;
          return {
            partId: part.id,
            translationId: t.id,
            part_number: part.part_number,
            part_label: part.part_label,
            text_original: part.text_original,
            text_translated: t.text,
            emotion_text: t.emotion_text,
            emotion_status: (t.emotion_status as PartCardData["emotion_status"]) ?? null,
            status: (t.status as PartStatus) ?? "pending",
            error_message: t.error_message,
            ai_provider: t.ai_provider,
            ai_model: t.ai_model,
            word_count_original: part.word_count_original,
            word_count_translated: t.word_count ?? 0,
            audio_status: (audioRow?.status as PartCardData["audio_status"]) ?? "none",
            audio_url: audioUrl(audioRow?.audio_path),
            audio_error: audioRow?.error_message ?? null,
            versions: (t.versions ?? []).map((ver) => ({
              id: ver.id,
              version_number: ver.version_number,
              translated_text: ver.translated_text,
              provider_used: ver.provider_used,
              model_used: ver.model_used,
              created_by: ver.created_by as "ai" | "admin",
              created_at: ver.created_at,
            })),
          };
        })
        .sort((a, b) => a.part_number - b.part_number);

      // TTS providers usable for this variant's language (configured + have a
      // voice for the language — e.g. Sarvam is excluded for Urdu/Arabic).
      const audioProviders = getConfiguredTtsProviders()
        .map((p) => ({
          id: p.id,
          name: p.name,
          defaultModel: p.defaultModel,
          models: p.models.map((m) => ({ id: m.id, name: m.name, defaultVoiceId: m.defaultVoiceId })),
          voices: getVoicesForLanguage(p.id, v.target_language).map((vc) => ({
            id: vc.id,
            name: vc.name,
            gender: vc.gender,
            description: vc.description,
            models: vc.models ? [...vc.models] : undefined,
          })),
        }))
        .filter((p) => p.voices.length > 0);

      return {
        id: v.id,
        slug: v.slug,
        target_language: v.target_language,
        language_name_english: v.language?.name_english ?? v.target_language,
        tone_name: v.tone?.name ?? "—",
        title_translated: v.title_translated,
        status: (v.status === "published" ? "published" : "draft") as VariantPanelData["status"],
        is_primary: v.is_primary,
        ai_provider: v.ai_provider,
        ai_model: v.ai_model,
        total_words_translated: v.total_words_translated,
        tts_provider: v.tts_provider,
        tts_model: v.tts_model,
        tts_voice_id: v.tts_voice_id,
        audioProviders,
        parts: translations,
      };
    })
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary));

  const storyData: StoryEditData = {
    id: story.id,
    title_original: story.title_original,
    cover_image_url: story.cover_image_url,
    category_name: story.subcategory?.category?.name ?? "—",
    subcategory_name: story.subcategory?.name ?? "—",
    status: (story.status === "published" ? "published" : "draft") as StoryEditData["status"],
    total_words_original: story.total_words_original,
    parts,
    variants,
  };

  // ---- Options for the dialogs ---------------------------------------------
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
    id: story.id,
    title_original: story.title_original,
    author_original: story.author_original,
    source_url: story.source_url,
    cover_image_url: story.cover_image_url,
    category_id: story.subcategory?.category?.id ?? "",
    subcategory_id: story.subcategory_id,
  };

  return (
    <StoryEditShell
      story={storyData}
      editInitial={editInitial}
      categories={categories}
      languages={languages}
      tones={tones}
      providers={PROVIDERS}
      configuredProviderIds={getConfiguredProviders().map((p) => p.id)}
      defaultProvider={aiConfig?.default_provider ?? "gemini"}
      defaultModel={aiConfig?.default_model ?? "gemini-2.0-flash"}
    />
  );
}
