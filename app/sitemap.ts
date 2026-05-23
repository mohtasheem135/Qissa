import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * Generated at request time (App Router will cache per-revalidate). The
 * anon Supabase client only sees published+active rows thanks to RLS,
 * so we never accidentally expose draft URLs.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();

  const [{ data: stories }, { data: categories }] = await Promise.all([
    supabase
      .from("stories")
      .select("id, updated_at, published_at")
      .order("published_at", { ascending: false })
      .limit(1000),
    supabase
      .from("categories")
      .select("slug, updated_at, subcategories ( slug, updated_at, is_active )")
      .order("display_order", { ascending: true }),
  ]);

  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${APP_URL}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${APP_URL}/search`, lastModified: now, changeFrequency: "weekly", priority: 0.4 },
    {
      url: `${APP_URL}/bookmarks`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.2,
    },
  ];

  const storyEntries: MetadataRoute.Sitemap = (stories ?? []).map((story) => ({
    url: `${APP_URL}/s/${story.id}`,
    lastModified: new Date(story.updated_at ?? story.published_at ?? now),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const categoryEntries: MetadataRoute.Sitemap = [];
  for (const category of categories ?? []) {
    categoryEntries.push({
      url: `${APP_URL}/c/${category.slug}`,
      lastModified: new Date(category.updated_at ?? now),
      changeFrequency: "weekly",
      priority: 0.6,
    });
    for (const sub of category.subcategories ?? []) {
      if (!sub.is_active) continue;
      categoryEntries.push({
        url: `${APP_URL}/c/${category.slug}/${sub.slug}`,
        lastModified: new Date(sub.updated_at ?? now),
        changeFrequency: "weekly",
        priority: 0.5,
      });
    }
  }

  return [...staticEntries, ...categoryEntries, ...storyEntries];
}
