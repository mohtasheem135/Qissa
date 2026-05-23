import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReaderShell } from "@/components/reader/ReaderShell";
import { createClient } from "@/lib/supabase/server";
import { googleFontsUrlForLanguage } from "@/lib/reader/google-fonts";

export const revalidate = 60;

interface PageProps {
  params: Promise<{ storyId: string; partNumber: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { storyId, partNumber } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("stories")
    .select("title_original, title_translated")
    .eq("id", storyId)
    .single();
  if (!data) return {};
  return {
    title: `Part ${partNumber} · ${data.title_translated ?? data.title_original}`,
  };
}

export default async function ReaderPage({ params }: PageProps) {
  const { storyId, partNumber: partNumberRaw } = await params;
  const partNumber = Number.parseInt(partNumberRaw, 10);
  if (!Number.isInteger(partNumber) || partNumber < 1) notFound();

  const supabase = await createClient();

  const { data: story, error: storyErr } = await supabase
    .from("stories")
    .select(
      `id, title_original, title_translated, total_parts, target_language,
       language:languages!inner ( direction, font_family, font_family_reading )`,
    )
    .eq("id", storyId)
    .single();
  if (storyErr?.code === "PGRST116") notFound();
  if (storyErr) throw storyErr;
  if (!story) notFound();

  const { data: part, error: partErr } = await supabase
    .from("story_parts")
    .select("id, part_number, part_label, text_original, text_translated")
    .eq("story_id", story.id)
    .eq("part_number", partNumber)
    .single();
  if (partErr?.code === "PGRST116") notFound();
  if (partErr) throw partErr;
  if (!part) notFound();

  // The reader only renders something we'd want a reader to see if there
  // is *some* translated text. Otherwise fall back to original.
  const translated = part.text_translated ?? "";
  const original = part.text_original ?? "";
  const body = translated.length > 0 ? translated : original;
  if (!body) notFound();

  const direction = (story.language?.direction === "rtl" ? "rtl" : "ltr") as "ltr" | "rtl";

  const fontStylesheet = googleFontsUrlForLanguage(story.target_language);

  const prevHref = partNumber > 1 ? `/s/${story.id}/p/${partNumber - 1}` : null;
  const nextHref = partNumber < story.total_parts ? `/s/${story.id}/p/${partNumber + 1}` : null;

  return (
    <>
      {/* Next 16 hoists <link rel="stylesheet"> into <head> automatically.
          Loading per-language so we don't ship every Indic font on /. */}
      {fontStylesheet ? (
        <link rel="stylesheet" href={fontStylesheet} crossOrigin="anonymous" />
      ) : null}

      <ReaderShell
        story={{
          id: story.id,
          titleOriginal: story.title_original,
          titleTranslated: story.title_translated,
          totalParts: story.total_parts,
          direction,
          fontFamily: story.language?.font_family ?? null,
          fontFamilyReading: story.language?.font_family_reading ?? null,
        }}
        part={{
          id: part.id,
          partNumber: part.part_number,
          partLabel: part.part_label ?? `Part ${part.part_number}`,
          textOriginal: original,
          textTranslated: body,
        }}
        prevHref={prevHref}
        nextHref={nextHref}
      />
    </>
  );
}
