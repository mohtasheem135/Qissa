import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookmarkButton } from "@/components/shared/BookmarkButton";
import { PartReadIndicator } from "@/components/shared/PartReadIndicator";
import { ShareButton } from "@/components/shared/ShareButton";
import { createClient } from "@/lib/supabase/server";
import { heroUrl } from "@/lib/imagekit/url";
import { languageFontStyle } from "@/lib/i18n/fonts";

export const revalidate = 60;

interface PageProps {
  params: Promise<{ storyId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { storyId } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("stories")
    .select("title_original, title_translated")
    .eq("id", storyId)
    .single();
  if (!data) return {};
  return {
    title: data.title_translated ?? data.title_original,
  };
}

export default async function StoryLandingPage({ params }: PageProps) {
  const { storyId } = await params;
  const supabase = await createClient();

  const { data: story, error } = await supabase
    .from("stories")
    .select(
      `id, title_original, title_translated, author_original, cover_image_url,
       total_parts, estimated_reading_minutes, published_at, source_url,
       subcategory:subcategories!inner ( name, slug, category:categories!inner ( name, slug ) ),
       tone:tones!inner ( name, display_name ),
       language:languages!inner ( code, name_english, name_native, direction, font_family, font_family_reading ),
       parts:story_parts ( id, part_number, part_label, word_count_original )`,
    )
    .eq("id", storyId)
    .single();

  if (error?.code === "PGRST116") notFound();
  if (error) throw error;
  if (!story) notFound();

  const parts = [...(story.parts ?? [])].sort((a, b) => a.part_number - b.part_number);
  const cover = heroUrl(story.cover_image_url);

  const titleTranslated = story.title_translated ?? story.title_original;
  const titleFontStyle = languageFontStyle(story.language, "reading");

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6">
      <Link
        href={`/c/${story.subcategory.category.slug}/${story.subcategory.slug}`}
        className="text-muted-foreground text-xs hover:underline"
      >
        ← {story.subcategory.category.name} · {story.subcategory.name}
      </Link>

      {/* Cover */}
      {cover ? (
        <div className="bg-muted/40 relative aspect-[16/9] w-full overflow-hidden rounded-lg border">
          <Image
            src={cover}
            alt=""
            fill
            sizes="(min-width: 768px) 800px, 100vw"
            className="object-cover"
            priority
            unoptimized
          />
        </div>
      ) : null}

      {/* Title block */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {story.language.name_english} ({story.language.name_native})
          </Badge>
          <Badge variant="outline">{story.tone.display_name ?? story.tone.name}</Badge>
        </div>
        <h1
          className="text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl"
          style={titleFontStyle}
          dir={story.language.direction}
        >
          {titleTranslated}
        </h1>
        {story.title_translated ? (
          <p className="text-muted-foreground text-sm">Original: {story.title_original}</p>
        ) : null}
        {story.author_original ? (
          <p className="text-muted-foreground text-sm">
            by <span className="text-foreground">{story.author_original}</span>
          </p>
        ) : null}
        <p className="text-muted-foreground text-xs">
          {story.total_parts} part{story.total_parts === 1 ? "" : "s"}
          {story.estimated_reading_minutes
            ? ` · ${story.estimated_reading_minutes} min read`
            : ""}
        </p>
      </div>

      {/* Primary actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="lg" className="flex-1 sm:flex-initial">
          <Link href={`/s/${story.id}/p/1`}>Start reading</Link>
        </Button>
        <BookmarkButton storyId={story.id} />
        <ShareButton title={titleTranslated} />
      </div>

      {/* Parts list */}
      <section aria-labelledby="parts" className="space-y-3">
        <h2 id="parts" className="text-lg font-semibold tracking-tight">
          Parts
        </h2>
        {parts.length === 0 ? (
          <p className="text-muted-foreground text-sm">This story has no parts yet.</p>
        ) : (
          <ol className="bg-card divide-y rounded-md border">
            {parts.map((part) => (
              <li key={part.id}>
                <Link
                  href={`/s/${story.id}/p/${part.part_number}`}
                  className="hover:bg-accent/40 flex items-center gap-3 px-4 py-3 transition-colors"
                >
                  <PartReadIndicator storyId={story.id} partNumber={part.part_number} />
                  <span className="text-muted-foreground w-6 text-xs tabular-nums">
                    {part.part_number}
                  </span>
                  <span className="flex-1 text-sm">
                    {part.part_label ?? `Part ${part.part_number}`}
                  </span>
                  {part.word_count_original ? (
                    <span className="text-muted-foreground text-xs">
                      {part.word_count_original} words
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      {story.source_url ? (
        <p className="text-muted-foreground text-xs">
          Original source:{" "}
          <a
            href={story.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {new URL(story.source_url).hostname}
          </a>
        </p>
      ) : null}
    </div>
  );
}
