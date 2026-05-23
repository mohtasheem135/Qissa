import type { Metadata } from "next";
import { CategoriesPanel } from "@/components/admin/CategoriesPanel";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Categories",
};

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const admin = createAdminClient();

  // Fetch all categories (active + inactive — admin sees everything) and
  // count subcategories per category in a single round-trip via PostgREST's
  // related-resource embed with `count`.
  const { data, error } = await admin
    .from("categories")
    .select("id, name, slug, icon_emoji, description, display_order, is_active, subcategories(count)")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  const categories = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    icon_emoji: row.icon_emoji,
    description: row.description,
    display_order: row.display_order,
    is_active: row.is_active,
    // PostgREST shape: subcategories: [{ count: 3 }]
    subcategory_count: row.subcategories?.[0]?.count ?? 0,
  }));

  return <CategoriesPanel categories={categories} />;
}
