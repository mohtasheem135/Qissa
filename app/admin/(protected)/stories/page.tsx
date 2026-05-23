import type { Metadata } from "next";
import { StoriesPanel, type StoryRow } from "@/components/admin/StoriesPanel";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Stories",
};

export const dynamic = "force-dynamic";

export default async function StoriesPage() {
  const admin = createAdminClient();

  // Single round-trip: stories + joined subcategory + category + tone +
  // language + embedded parts (just `status` so we can compute completed
  // counts client-side). For Phase 1 sizes this is plenty.
  const [{ data: stories, error }, { data: languages, error: langErr }] = await Promise.all([
    admin
      .from("stories")
      .select(
        `id, title_original, title_translated, cover_image_url, target_language,
         status, total_parts, ai_provider, updated_at,
         subcategory:subcategories!inner ( name, category:categories!inner ( name ) ),
         tone:tones!inner ( name ),
         language:languages!inner ( name_english ),
         parts:story_parts ( status )`,
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
    const completed = (row.parts ?? []).filter(
      (p) => p.status === "completed" || p.status === "edited",
    ).length;
    const status = (row.status === "published" ? "published" : "draft") as StoryRow["status"];
    return {
      id: row.id,
      title_original: row.title_original,
      title_translated: row.title_translated,
      cover_image_url: row.cover_image_url,
      target_language: row.target_language,
      status,
      total_parts: row.total_parts,
      completed_parts: completed,
      ai_provider: row.ai_provider,
      updated_at: row.updated_at,
      subcategory_name: row.subcategory?.name ?? "—",
      category_name: row.subcategory?.category?.name ?? "—",
      tone_name: row.tone?.name ?? "—",
      language_name_english: row.language?.name_english ?? row.target_language,
    };
  });

  const languageOptions = (languages ?? []).map((l) => ({
    value: l.code,
    label: l.name_english,
  }));

  return <StoriesPanel stories={rows} languageOptions={languageOptions} />;
}
