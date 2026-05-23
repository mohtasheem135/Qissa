import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StoryCard } from "@/components/shared/StoryCard";
import { createClient } from "@/lib/supabase/server";
import { STORY_CARD_COLUMNS, toStoryCard } from "@/lib/reader/story-cards";

export const revalidate = 60;

interface PageProps {
  params: Promise<{ categorySlug: string; subcategorySlug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { subcategorySlug } = await params;
  return { title: subcategorySlug };
}

export default async function SubcategoryPage({ params }: PageProps) {
  const { categorySlug, subcategorySlug } = await params;
  const supabase = await createClient();

  // First find the subcategory by slug + parent slug. The seed schema lets
  // the same subcategory slug live under multiple categories.
  const { data: parent } = await supabase
    .from("categories")
    .select("id, name, slug")
    .eq("slug", categorySlug)
    .eq("is_active", true)
    .single();
  if (!parent) notFound();

  const { data: subcategory, error } = await supabase
    .from("subcategories")
    .select("id, name, slug, description, icon_emoji")
    .eq("category_id", parent.id)
    .eq("slug", subcategorySlug)
    .eq("is_active", true)
    .single();
  if (error?.code === "PGRST116") notFound();
  if (error) throw error;
  if (!subcategory) notFound();

  const { data: stories, error: storiesErr } = await supabase
    .from("stories")
    .select(STORY_CARD_COLUMNS)
    .eq("subcategory_id", subcategory.id)
    .order("published_at", { ascending: false })
    .limit(60);
  if (storiesErr) throw storiesErr;

  const cards = (stories ?? []).map(toStoryCard);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div className="space-y-2">
        <Link
          href={`/c/${parent.slug}`}
          className="text-muted-foreground text-xs hover:underline"
        >
          ← {parent.name}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">
          <span className="mr-2" aria-hidden>
            {subcategory.icon_emoji ?? "📁"}
          </span>
          {subcategory.name}
        </h1>
        {subcategory.description ? (
          <p className="text-muted-foreground max-w-prose text-sm">{subcategory.description}</p>
        ) : null}
      </div>

      {cards.length === 0 ? (
        <p className="text-muted-foreground text-sm">No published stories yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {cards.map((story) => (
            <StoryCard key={story.id} story={story} />
          ))}
        </div>
      )}
    </div>
  );
}
