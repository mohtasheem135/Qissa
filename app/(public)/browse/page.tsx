import type { Metadata } from "next";
import { CategoryTile, type CategoryTileData } from "@/components/shared/CategoryTile";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Browse — Qissa",
  description: "Browse every category of stories on Qissa.",
};

export const revalidate = 60;

export default async function BrowsePage() {
  const supabase = await createClient();

  const { data: categories, error } = await supabase
    .from("categories")
    .select(
      `slug, name, icon_emoji, description, display_order,
       subcategories!inner ( stories!inner ( id ) )`,
    )
    .order("display_order", { ascending: true });

  if (error) throw error;

  // De-dup categories (embedded join can repeat rows) + count stories.
  const tiles: CategoryTileData[] = [];
  const seen = new Set<string>();
  for (const row of categories ?? []) {
    if (seen.has(row.slug)) continue;
    seen.add(row.slug);
    const storyCount = (row.subcategories ?? []).reduce(
      (sum, sub) => sum + (sub.stories?.length ?? 0),
      0,
    );
    tiles.push({
      slug: row.slug,
      name: row.name,
      icon_emoji: row.icon_emoji,
      description: row.description,
      story_count: storyCount,
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Browse stories</h1>
        <p className="text-muted-foreground max-w-prose text-sm">
          Every category with published stories. Pick a shelf to dive in.
        </p>
      </header>

      {tiles.length === 0 ? (
        <p className="text-muted-foreground text-sm">No categories with stories yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((category) => (
            <CategoryTile key={category.slug} category={category} />
          ))}
        </div>
      )}
    </div>
  );
}
