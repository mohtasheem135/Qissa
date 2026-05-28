import type { Metadata } from "next";
import { SearchBar } from "@/components/shared/SearchBar";
import { StoryCard, type StoryCardData } from "@/components/shared/StoryCard";
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
        <p className="text-muted-foreground text-sm">
          Type a title, author, or translated title and press Enter.
        </p>
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

const MAX_RESULTS = 60;

/**
 * Calls the `search_stories` RPC (defined in
 * [migration 0004](../../supabase/migrations/20260529120000_search_stories_rpc.sql)),
 * which returns ranked story IDs from a trigram-similarity search across
 *   - `stories.title_original`
 *   - `stories.author_original`
 *   - `story_variants.title_translated` (published variants only)
 *
 * We then fetch the full STORY_CARD_COLUMNS for those IDs and re-order them
 * locally to match the RPC ranking (`.in()` doesn't preserve input order).
 * Wildcards (`%`, `_`) in user input are escaped before being concatenated
 * into the RPC's ILIKE patterns.
 */
async function runSearch(query: string): Promise<StoryCardData[]> {
  if (!query) return [];
  const supabase = await createClient();

  // Escape ILIKE wildcards — literal `%` should match a percent sign, not
  // every story in the catalogue.
  const safe = query.replace(/[\\%_]/g, "\\$&");

  const { data: matches, error: rpcError } = await supabase.rpc("search_stories", {
    q: safe,
    max_results: MAX_RESULTS,
  });
  if (rpcError) throw rpcError;

  const ranked = matches ?? [];
  if (ranked.length === 0) return [];

  const ids = ranked.map((m) => m.story_id);

  const { data: stories, error: storyError } = await supabase
    .from("stories")
    .select(STORY_CARD_COLUMNS)
    .in("id", ids);
  if (storyError) throw storyError;

  // Restore the RPC's score ordering — `.in()` returns rows in DB order.
  const orderMap = new Map(ids.map((id, idx) => [id, idx]));
  return (stories ?? [])
    .map(toStoryCard)
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => (orderMap.get(a.id) ?? MAX_RESULTS) - (orderMap.get(b.id) ?? MAX_RESULTS));
}
