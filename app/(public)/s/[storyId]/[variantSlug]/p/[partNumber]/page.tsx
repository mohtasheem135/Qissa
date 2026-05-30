import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReaderShell } from "@/components/reader/ReaderShell";
import type { VariantOption } from "@/components/reader/ReaderChrome";
import { createClient } from "@/lib/supabase/server";
import { googleFontsUrlForLanguage } from "@/lib/reader/google-fonts";
import { audioUrl } from "@/lib/r2/url";

export const revalidate = 60;

interface PageProps {
  params: Promise<{ storyId: string; variantSlug: string; partNumber: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { storyId, variantSlug, partNumber } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("story_variants")
    .select(
      `title_translated, story:stories!inner ( title_original )`,
    )
    .eq("story_id", storyId)
    .eq("slug", variantSlug)
    .eq("status", "published")
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return {};
  const title = data.title_translated ?? data.story?.title_original ?? "";
  return {
    title: `Part ${partNumber} · ${title}`,
  };
}

export default async function ReaderPage({ params }: PageProps) {
  const { storyId, variantSlug, partNumber: partNumberRaw } = await params;
  const partNumber = Number.parseInt(partNumberRaw, 10);
  if (!Number.isInteger(partNumber) || partNumber < 1) notFound();

  const supabase = await createClient();

  // 1) Load the variant + its parent story (RLS: published+active).
  const { data: variant, error: variantErr } = await supabase
    .from("story_variants")
    .select(
      `id, slug, target_language, title_translated,
       story:stories!inner ( id, title_original, total_parts ),
       language:languages!inner ( direction, font_family, font_family_reading )`,
    )
    .eq("story_id", storyId)
    .eq("slug", variantSlug)
    .eq("status", "published")
    .eq("is_active", true)
    .maybeSingle();
  if (variantErr) throw variantErr;
  if (!variant || !variant.story) notFound();

  // 2) Translation row + shared part text.
  const { data: translation, error: trErr } = await supabase
    .from("story_part_translations")
    .select(
      `text,
       audio:story_part_audio ( status, audio_path ),
       part:story_parts!inner ( id, part_number, part_label, text_original )`,
    )
    .eq("variant_id", variant.id)
    .eq("part.story_id", storyId)
    .eq("part.part_number", partNumber)
    .maybeSingle();
  if (trErr) throw trErr;
  if (!translation || !translation.part) notFound();

  const translated = translation.text ?? "";
  const original = translation.part.text_original ?? "";
  const body = translated.length > 0 ? translated : original;
  if (!body) notFound();

  // Premium audio for this part, if the admin has generated it (RLS: published).
  const audioRow = Array.isArray(translation.audio) ? translation.audio[0] : translation.audio;
  const partAudioUrl =
    audioRow?.status === "completed" ? audioUrl(audioRow.audio_path) : null;

  // 3) Sibling variants for the picker chip.
  const { data: siblings } = await supabase
    .from("story_variants")
    .select(
      `slug, target_language,
       language:languages!inner ( name_english ),
       tone:tones!inner ( name )`,
    )
    .eq("story_id", storyId)
    .eq("status", "published")
    .eq("is_active", true);

  const variants: VariantOption[] = (siblings ?? []).map((v) => ({
    slug: v.slug,
    label: `${v.language?.name_english ?? v.target_language} · ${v.tone?.name ?? ""}`,
    totalParts: variant.story?.total_parts ?? partNumber,
  }));

  const direction = (variant.language?.direction === "rtl" ? "rtl" : "ltr") as "ltr" | "rtl";
  const fontStylesheet = googleFontsUrlForLanguage(variant.target_language);

  const prevHref =
    partNumber > 1 ? `/s/${storyId}/${variantSlug}/p/${partNumber - 1}` : null;
  const nextHref =
    partNumber < (variant.story.total_parts ?? partNumber)
      ? `/s/${storyId}/${variantSlug}/p/${partNumber + 1}`
      : null;

  return (
    <>
      {fontStylesheet ? (
        <link rel="stylesheet" href={fontStylesheet} crossOrigin="anonymous" />
      ) : null}

      <ReaderShell
        story={{
          id: storyId,
          variantSlug,
          titleOriginal: variant.story.title_original,
          titleTranslated: variant.title_translated,
          totalParts: variant.story.total_parts,
          direction,
          fontFamily: variant.language?.font_family ?? null,
          fontFamilyReading: variant.language?.font_family_reading ?? null,
          targetLanguage: variant.target_language,
        }}
        part={{
          id: translation.part.id,
          partNumber: translation.part.part_number,
          partLabel: translation.part.part_label ?? `Part ${translation.part.part_number}`,
          textOriginal: original,
          textTranslated: body,
          audioUrl: partAudioUrl,
        }}
        prevHref={prevHref}
        nextHref={nextHref}
        variants={variants}
      />
    </>
  );
}
