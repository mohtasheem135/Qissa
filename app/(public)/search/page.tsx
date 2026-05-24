import type { Metadata } from "next";
import { SearchBar } from "@/components/shared/SearchBar";
import { StoryCard } from "@/components/shared/StoryCard";
import { createClient } from "@/lib/supabase/server";
import { STORY_CARD_COLUMNS, toStoryCard } from "@/lib/reader/story-cards";

export const metadata: Metadata = { title: "Search" };

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const cards = await runSearch(query);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <SearchBar initialValue={query} />
      </header>

      {query === "" ? (
        <p className="text-muted-foreground text-sm">Type a title and press Enter.</p>
      ) : cards.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No published stories match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <>
          <p className="text-muted-foreground text-xs">
            {cards.length} result{cards.length === 1 ? "" : "s"} for &ldquo;{query}&rdquo;
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {cards.map((story) => (
              <StoryCard key={story.id} story={story} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

async function runSearch(query: string) {
  if (!query) return [];
  const supabase = await createClient();

  // Escape ILIKE wildcards in the user input so a literal '%' doesn't match
  // everything. Then `.or()` against both title columns.
  const safe = query.replace(/[%_]/g, "\\$&");
  const pattern = `%${safe}%`;

  // We search original-title only for now; cross-variant translated-title
  // search needs a join-aware OR which Postgrest doesn't express cleanly.
  // Phase 1.5 can swap this for a /rpc fts query that unions both columns.
  const { data, error } = await supabase
    .from("stories")
    .select(STORY_CARD_COLUMNS)
    .ilike("title_original", pattern)
    .order("published_at", { ascending: false })
    .limit(60);

  if (error) throw error;
  return (data ?? [])
    .map(toStoryCard)
    .filter((s): s is NonNullable<typeof s> => s !== null);
}
