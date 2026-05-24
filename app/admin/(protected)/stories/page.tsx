import type { Metadata } from "next";
import { StoriesPanel, type StoryRow } from "@/components/admin/StoriesPanel";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Stories",
};

export const dynamic = "force-dynamic";

export default async function StoriesPage() {
  const admin = createAdminClient();

  const [{ data: stories, error }, { data: languages, error: langErr }] = await Promise.all([
    admin
      .from("stories")
      .select(
        `id, title_original, cover_image_url, status, total_parts, updated_at,
         subcategory:subcategories!inner ( name, category:categories!inner ( name ) ),
         variants:story_variants (
           id, target_language, status,
           language:languages!inner ( name_english ),
           tone:tones!inner ( name )
         )`,
      )
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(200),
    admin
      .from("languages")
      .select("code, name_english")
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
  ]);

  if (error) throw error;
  if (langErr) throw langErr;

  const rows: StoryRow[] = (stories ?? []).map((row) => {
    const status = (row.status === "published" ? "published" : "draft") as StoryRow["status"];
    return {
      id: row.id,
      title_original: row.title_original,
      cover_image_url: row.cover_image_url,
      status,
      total_parts: row.total_parts,
      updated_at: row.updated_at,
      subcategory_name: row.subcategory?.name ?? "—",
      category_name: row.subcategory?.category?.name ?? "—",
      variants: (row.variants ?? []).map((v) => ({
        id: v.id,
        target_language: v.target_language,
        language_name_english: v.language?.name_english ?? v.target_language,
        tone_name: v.tone?.name ?? "—",
        status: (v.status === "published" ? "published" : "draft") as "draft" | "published",
      })),
    };
  });

  const languageOptions = (languages ?? []).map((l) => ({
    value: l.code,
    label: l.name_english,
  }));

  return <StoriesPanel stories={rows} languageOptions={languageOptions} />;
}
