import type { Metadata } from "next";
import { ContinueReading } from "@/components/shared/ContinueReading";
import {
  StoryBrowser,
  type FilterCategory,
  type FilterLanguage,
} from "@/components/shared/StoryBrowser";
import { createClient } from "@/lib/supabase/server";
import { fetchStoryCards } from "@/lib/reader/story-cards";

export const metadata: Metadata = {
  title: "Qissa — Stories, translated with soul",
  description:
    "Curated stories translated into Urdu, Hindi, Bengali, Arabic, Tamil and more — in the prose style of legendary writers.",
};

export const revalidate = 60;

export default async function HomePage() {
  const supabase = await createClient();

  const [{ cards, hasMore }, { data: categories, error: catErr }, { data: languages, error: langErr }] =
    await Promise.all([
      fetchStoryCards(supabase, { page: 0 }),
      // Only categories/subcategories that actually have published stories — the
      // `!inner` joins drop empties so the filter bar never offers a dead end.
      supabase
        .from("categories")
        .select(
          `slug, name, display_order,
           subcategories!inner ( id, slug, name, display_order, stories!inner ( id ) )`,
        )
        .eq("is_active", true)
        .order("display_order", { ascending: true }),
      supabase
        .from("languages")
        .select("code, name_english, display_order")
        .eq("is_active", true)
        .order("display_order", { ascending: true }),
    ]);

  if (catErr) throw catErr;
  if (langErr) throw langErr;

  // De-dup categories + subcategories (the embedded `stories` join repeats rows).
  const categoryRows: FilterCategory[] = [];
  const seenCat = new Set<string>();
  for (const row of categories ?? []) {
    if (seenCat.has(row.slug)) continue;
    seenCat.add(row.slug);

    const subs: FilterCategory["subcategories"] = [];
    const seenSub = new Set<string>();
    for (const sub of (row.subcategories ?? [])
      .slice()
      .sort((a, b) => a.display_order - b.display_order)) {
      if (seenSub.has(sub.id)) continue;
      seenSub.add(sub.id);
      subs.push({ id: sub.id, slug: sub.slug, name: sub.name });
    }
    categoryRows.push({ slug: row.slug, name: row.name, subcategories: subs });
  }

  const languageRows: FilterLanguage[] = (languages ?? []).map((l) => ({
    code: l.code,
    name_english: l.name_english,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6">
      {/* Continue reading (client; collapses if no last-read) */}
      <ContinueReading />

      {/* Filterable, infinite-scroll story browser */}
      <StoryBrowser
        categories={categoryRows}
        languages={languageRows}
        initialStories={cards}
        initialHasMore={hasMore}
      />
    </div>
  );
}
