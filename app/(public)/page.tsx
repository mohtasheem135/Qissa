import type { Metadata } from "next";
import { CategoryTile, type CategoryTileData } from "@/components/shared/CategoryTile";
import { ContinueReading } from "@/components/shared/ContinueReading";
import { SearchBar } from "@/components/shared/SearchBar";
import { StoryCard } from "@/components/shared/StoryCard";
import { createClient } from "@/lib/supabase/server";
import { STORY_CARD_COLUMNS, toStoryCard } from "@/lib/reader/story-cards";

export const metadata: Metadata = {
  title: "Qissa — Stories, translated with soul",
  description:
    "Curated stories translated into Urdu, Hindi, Bengali, Arabic, Tamil and more — in the prose style of legendary writers.",
};

export const revalidate = 60;

export default async function HomePage() {
  const supabase = await createClient();

  const [{ data: recent, error: recentErr }, { data: categories, error: catErr }] =
    await Promise.all([
      supabase
        .from("stories")
        .select(STORY_CARD_COLUMNS)
        .order("published_at", { ascending: false })
        .limit(8),
      supabase
        .from("categories")
        .select(
          `slug, name, icon_emoji, description, display_order,
           subcategories!inner ( stories!inner ( id ) )`,
        )
        .order("display_order", { ascending: true }),
    ]);

  if (recentErr) throw recentErr;
  if (catErr) throw catErr;

  const stories = (recent ?? []).map(toStoryCard);

  // De-dup categories (embedded join can repeat rows) + count stories.
  const categoryRows: CategoryTileData[] = [];
  const seen = new Set<string>();
  for (const row of categories ?? []) {
    if (seen.has(row.slug)) continue;
    seen.add(row.slug);
    const storyCount = (row.subcategories ?? []).reduce(
      (sum, sub) => sum + (sub.stories?.length ?? 0),
      0,
    );
    categoryRows.push({
      slug: row.slug,
      name: row.name,
      icon_emoji: row.icon_emoji,
      description: row.description,
      story_count: storyCount,
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      {/* Hero */}
      <section className="space-y-4 py-8 text-center sm:py-12">
        <p className="text-muted-foreground text-xs tracking-widest uppercase">Qissa</p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
          Stories, translated with soul.
        </h1>
        <p className="text-muted-foreground mx-auto max-w-prose text-sm sm:text-base">
          Literary translations of curated stories into Urdu, Hindi, Bengali, Arabic, Tamil and
          more — written in the prose style of legendary authors.
        </p>
        <div className="mx-auto max-w-md pt-2">
          <SearchBar />
        </div>
      </section>

      <div className="space-y-12">
        {/* Continue reading (client; collapses if no last-read) */}
        <ContinueReading />

        {/* Recently published */}
        <section aria-labelledby="recent" className="space-y-4">
          <h2 id="recent" className="text-lg font-semibold tracking-tight">
            Recently published
          </h2>
          {stories.length === 0 ? (
            <p className="text-muted-foreground text-sm">No stories yet — check back soon.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {stories.map((story) => (
                <StoryCard key={story.id} story={story} />
              ))}
            </div>
          )}
        </section>

        {/* Categories */}
        <section aria-labelledby="categories" className="space-y-4">
          <h2 id="categories" className="text-lg font-semibold tracking-tight">
            Browse by category
          </h2>
          {categoryRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">No categories with stories yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categoryRows.map((category) => (
                <CategoryTile key={category.slug} category={category} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
