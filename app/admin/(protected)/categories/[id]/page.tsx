import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SubcategoriesPanel } from "@/components/admin/SubcategoriesPanel";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Subcategories",
};

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CategoryDetailPage({ params }: PageProps) {
  const { id } = await params;
  const admin = createAdminClient();

  const [{ data: category, error: catError }, { data: subcategories, error: subError }] =
    await Promise.all([
      admin
        .from("categories")
        .select("id, name, slug, icon_emoji, description, is_active")
        .eq("id", id)
        .single(),
      admin
        .from("subcategories")
        .select("id, category_id, name, slug, icon_emoji, description, display_order, is_active")
        .eq("category_id", id)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

  if (catError && catError.code === "PGRST116") notFound();
  if (catError) throw catError;
  if (subError) throw subError;
  if (!category) notFound();

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <Link
          href="/admin/categories"
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          ← All categories
        </Link>
        <div className="flex items-baseline gap-3">
          <span className="text-2xl">{category.icon_emoji ?? "📁"}</span>
          <h1 className="text-2xl font-semibold tracking-tight">{category.name}</h1>
          {!category.is_active ? <Badge variant="secondary">Inactive</Badge> : null}
        </div>
        {category.description ? (
          <p className="text-muted-foreground text-sm">{category.description}</p>
        ) : null}
        <p className="text-muted-foreground text-xs">
          Slug: <code>{category.slug}</code>
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/categories">Edit category metadata</Link>
        </Button>
      </header>

      <SubcategoriesPanel categoryId={category.id} subcategories={subcategories ?? []} />
    </div>
  );
}
