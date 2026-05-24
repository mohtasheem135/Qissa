import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BookmarkButton } from "@/components/shared/BookmarkButton";
import { PartReadIndicator } from "@/components/shared/PartReadIndicator";
import { RequestStoryDialog } from "@/components/shared/RequestStoryDialog";
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
  const { data: story } = await supabase
    .from("stories")
    .select("title_original")
    .eq("id", storyId)
    .maybeSingle();
  if (!story) return {};
  return {
    title: story.title_original,
  };
}

export default async function StoryLandingPage({ params }: PageProps) {
  const { storyId } = await params;
  const supabase = await createClient();

  const [{ data: story, error }, { data: languages }, { data: tones }] = await Promise.all([
    supabase
      .from("stories")
      .select(
      `id, title_original, author_original, cover_image_url,
       total_parts, published_at, source_url,
       subcategory:subcategories!inner ( name, slug, category:categories!inner ( name, slug ) ),
       parts:story_parts ( id, part_number, part_label, word_count_original ),
       variants:story_variants (
         id, slug, target_language, title_translated, is_primary,
         estimated_reading_minutes, total_words_translated,
         language:languages!inner ( name_english, name_native, direction, font_family, font_family_reading ),
         tone:tones!inner ( name, display_name )
       )`,
    )
    .eq("id", storyId)
    .eq("variants.status", "published")
    .eq("variants.is_active", true)
    .single(),
    supabase
      .from("languages")
      .select("code, name_english")
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
    supabase
      .from("tones")
      .select("id, name, language_code")
      .eq("is_active", true),
  ]);

  if (error?.code === "PGRST116") notFound();
  if (error) throw error;
  if (!story) notFound();

  const parts = [...(story.parts ?? [])].sort((a, b) => a.part_number - b.part_number);
  const cover = heroUrl(story.cover_image_url);

  // Sort: primary first, then alphabetical by language label.
  const variants = [...(story.variants ?? [])].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return Number(b.is_primary) - Number(a.is_primary);
    const la = a.language?.name_english ?? a.target_language;
    const lb = b.language?.name_english ?? b.target_language;
    return la.localeCompare(lb);
  });
  const primaryVariant = variants[0] ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6">
      <Link
        href={`/c/${story.subcategory.category.slug}/${story.subcategory.slug}`}
        className="text-muted-foreground text-xs hover:underline"
      >
        ← {story.subcategory.category.name} · {story.subcategory.name}
      </Link>

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

      <div className="space-y-3">
        <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
          {story.title_original}
        </h1>
        {story.author_original ? (
          <p className="text-muted-foreground text-sm">
            by <span className="text-foreground">{story.author_original}</span>
          </p>
        ) : null}
        <p className="text-muted-foreground text-xs">
          {story.total_parts} part{story.total_parts === 1 ? "" : "s"}
        </p>
      </div>

      {/* Primary actions */}
      <div className="flex flex-wrap items-center gap-2">
        {primaryVariant ? (
          <Button asChild size="lg" className="flex-1 sm:flex-initial">
            <Link href={`/s/${story.id}/${primaryVariant.slug}/p/1`}>Start reading</Link>
          </Button>
        ) : (
          <Button size="lg" disabled className="flex-1 sm:flex-initial">
            No translations yet
          </Button>
        )}
        <BookmarkButton storyId={story.id} />
        <ShareButton title={story.title_original} />
      </div>

      {/* Available variants */}
      <section aria-labelledby="variants-heading" className="space-y-3">
        <h2 id="variants-heading" className="text-lg font-semibold tracking-tight">
          Available in
        </h2>
        {variants.length === 0 ? (
          <p className="text-muted-foreground text-sm">No published translations yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {variants.map((v) => {
              const titleStyle = languageFontStyle(v.language, "reading");
              const title = v.title_translated ?? story.title_original;
              return (
                <Card key={v.id} className="p-4">
                  <Link
                    href={`/s/${story.id}/${v.slug}/p/1`}
                    className="block space-y-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">
                        {v.language?.name_english} ({v.language?.name_native})
                      </Badge>
                      <Badge variant="outline">
                        {v.tone?.display_name ?? v.tone?.name}
                      </Badge>
                      {v.is_primary ? (
                        <Badge variant="default" className="text-[10px]">
                          primary
                        </Badge>
                      ) : null}
                    </div>
                    <p
                      className="line-clamp-2 text-base leading-snug"
                      style={titleStyle}
                      dir={v.language?.direction ?? "ltr"}
                    >
                      {title}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {v.estimated_reading_minutes
                        ? `${v.estimated_reading_minutes} min read · `
                        : ""}
                      Start reading →
                    </p>
                  </Link>
                </Card>
              );
            })}
          </div>
        )}
        <div className="pt-2">
          <RequestStoryDialog
            storyId={story.id}
            storyTitle={story.title_original}
            allowTypeToggle={false}
            triggerLabel="Request another translation"
            triggerVariant="outline"
            languages={languages ?? []}
            tones={tones ?? []}
          />
        </div>
      </section>

      {/* Parts list — anchored to the primary variant so URLs work */}
      {primaryVariant ? (
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
                    href={`/s/${story.id}/${primaryVariant.slug}/p/${part.part_number}`}
                    className="hover:bg-accent/40 flex items-center gap-3 px-4 py-3 transition-colors"
                  >
                    <PartReadIndicator
                      storyId={story.id}
                      variantSlug={primaryVariant.slug}
                      partNumber={part.part_number}
                    />
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
      ) : null}

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
