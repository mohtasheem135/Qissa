import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReaderShell } from "@/components/reader/ReaderShell";
import type { VariantOption } from "@/components/reader/ReaderChrome";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 60;

/**
 * Source reader. Renders `story_parts.text_original` through the same
 * ReaderShell the variant reader uses, with two simplifications:
 *
 *  - `textTranslated` is set to the source text and `textOriginal` is empty
 *    so ReaderBody renders one column of prose and the "Show original"
 *    toggle is automatically disabled (no parallel text to surface).
 *  - The variant slug is the literal "source" — progress keys stay
 *    isolated from any translation's progress
 *    (`qissa:progress:<storyId>:source:<n>`).
 */

interface PageProps {
  params: Promise<{ storyId: string; partNumber: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { storyId, partNumber } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("stories")
    .select("title_original")
    .eq("id", storyId)
    .maybeSingle();
  if (!data) return {};
  return { title: `Part ${partNumber} · ${data.title_original} (source)` };
}

export default async function SourceReaderPage({ params }: PageProps) {
  const { storyId, partNumber: partNumberRaw } = await params;
  const partNumber = Number.parseInt(partNumberRaw, 10);
  if (!Number.isInteger(partNumber) || partNumber < 1) notFound();

  const supabase = await createClient();

  const { data: story, error } = await supabase
    .from("stories")
    .select(
      `id, title_original, total_parts,
       part:story_parts!inner ( id, part_number, part_label, text_original )`,
    )
    .eq("id", storyId)
    .eq("part.part_number", partNumber)
    .maybeSingle();
  if (error) throw error;
  if (!story) notFound();

  // `part` is an array on embedded reads even when `!inner` filters to one.
  const part = Array.isArray(story.part) ? story.part[0] : story.part;
  if (!part) notFound();

  const sourceText = part.text_original ?? "";
  if (!sourceText) notFound();

  const prevHref = partNumber > 1 ? `/s/${storyId}/source/p/${partNumber - 1}` : null;
  const nextHref =
    partNumber < (story.total_parts ?? partNumber)
      ? `/s/${storyId}/source/p/${partNumber + 1}`
      : null;

  // Single-entry picker → ReaderChrome auto-hides the dropdown.
  const variants: VariantOption[] = [
    { slug: "source", label: "Source", totalParts: story.total_parts ?? partNumber },
  ];

  return (
    <ReaderShell
      story={{
        id: storyId,
        variantSlug: "source",
        titleOriginal: story.title_original,
        titleTranslated: null,
        totalParts: story.total_parts,
        direction: "ltr",
        fontFamily: null,
        fontFamilyReading: null,
      }}
      part={{
        id: part.id,
        partNumber: part.part_number,
        partLabel: part.part_label ?? `Part ${part.part_number}`,
        textOriginal: "",
        textTranslated: sourceText,
      }}
      prevHref={prevHref}
      nextHref={nextHref}
      variants={variants}
    />
  );
}
