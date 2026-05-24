"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { StoryCard, type StoryCardData } from "@/components/shared/StoryCard";
import { createClient } from "@/lib/supabase/client";
import { getBookmarks, subscribeBookmarks } from "@/lib/reader/bookmarks";

export default function BookmarksPage() {
  // Both snapshots use getBookmarks — on the server it returns the same
  // frozen EMPTY singleton, satisfying useSyncExternalStore's "same
  // reference until data changes" contract.
  const bookmarkIds = useSyncExternalStore(subscribeBookmarks, getBookmarks, getBookmarks);
  const [stories, setStories] = useState<StoryCardData[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (bookmarkIds.length === 0) {
      // Defer the empty transition to a microtask so the setState isn't
      // synchronous within the effect body (React 19 lint rule).
      Promise.resolve().then(() => {
        if (!cancelled) setStories([]);
      });
      return () => {
        cancelled = true;
      };
    }
    const supabase = createClient();
    supabase
      .from("stories")
      .select(
        `id, title_original, cover_image_url, total_parts,
         variants:story_variants!inner (
           slug, title_translated, estimated_reading_minutes, is_primary,
           language:languages!inner ( name_english, font_family, font_family_reading ),
           tone:tones!inner ( name )
         )`,
      )
      .in("id", bookmarkIds)
      .eq("status", "published")
      .eq("is_active", true)
      .eq("variants.status", "published")
      .eq("variants.is_active", true)
      .then(({ data }) => {
        if (cancelled) return;
        const next: StoryCardData[] = [];
        for (const row of data ?? []) {
          const variants = row.variants ?? [];
          if (variants.length === 0) continue;
          const variant = variants.find((v) => v.is_primary) ?? variants[0];
          next.push({
            id: row.id,
            variant_slug: variant.slug,
            title_original: row.title_original,
            title_translated: variant.title_translated,
            cover_image_url: row.cover_image_url,
            total_parts: row.total_parts,
            estimated_reading_minutes: variant.estimated_reading_minutes,
            language_name_english: variant.language?.name_english ?? "",
            language_font_family: variant.language?.font_family ?? null,
            language_font_family_reading: variant.language?.font_family_reading ?? null,
            tone_name: variant.tone?.name ?? null,
          });
        }
        // Preserve the order in which the user bookmarked them.
        next.sort(
          (a, b) => bookmarkIds.indexOf(a.id) - bookmarkIds.indexOf(b.id),
        );
        setStories(next);
      });
    return () => {
      cancelled = true;
    };
  }, [bookmarkIds]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Bookmarks</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Saved on this device. {bookmarkIds.length} bookmark
          {bookmarkIds.length === 1 ? "" : "s"}.
        </p>
      </header>

      {stories === null ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : stories.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          You haven&rsquo;t bookmarked any stories yet. Tap the heart on a story page to save it.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {stories.map((story) => (
            <StoryCard key={story.id} story={story} />
          ))}
        </div>
      )}
    </div>
  );
}
