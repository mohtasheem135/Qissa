import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 60;

interface PageProps {
  params: Promise<{ categorySlug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { categorySlug } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("name")
    .eq("slug", categorySlug)
    .single();
  return { title: data?.name ?? "Category" };
}

export default async function CategoryPage({ params }: PageProps) {
  const { categorySlug } = await params;
  const supabase = await createClient();

  const { data: category, error } = await supabase
    .from("categories")
    .select(
      `id, name, slug, icon_emoji, description,
       subcategories ( id, name, slug, icon_emoji, description, display_order,
         stories ( id )
       )`,
    )
    .eq("slug", categorySlug)
    .eq("is_active", true)
    .single();

  if (error?.code === "PGRST116") notFound();
  if (error) throw error;
  if (!category) notFound();

  const subcategories = (category.subcategories ?? [])
    .map((sub) => ({
      slug: sub.slug,
      name: sub.name,
      icon_emoji: sub.icon_emoji,
      description: sub.description,
      display_order: sub.display_order,
      story_count: sub.stories?.length ?? 0,
    }))
    .sort((a, b) => a.display_order - b.display_order);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div className="space-y-2">
        <Link href="/" className="text-muted-foreground text-xs hover:underline">
          ← Home
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">
          <span className="mr-2" aria-hidden>
            {category.icon_emoji ?? "📖"}
          </span>
          {category.name}
        </h1>
        {category.description ? (
          <p className="text-muted-foreground max-w-prose text-sm">{category.description}</p>
        ) : null}
      </div>

      {subcategories.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No subcategories yet under {category.name}.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {subcategories.map((sub) => (
            <Link
              key={sub.slug}
              href={`/c/${category.slug}/${sub.slug}`}
              className="bg-card hover:border-primary/40 group block rounded-lg border p-5 transition-colors"
            >
              <div className="mb-3 text-2xl" aria-hidden>
                {sub.icon_emoji ?? "📁"}
              </div>
              <h3 className="text-foreground text-base font-medium">{sub.name}</h3>
              {sub.description ? (
                <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{sub.description}</p>
              ) : null}
              <p className="text-muted-foreground mt-2 text-[11px] tracking-wide uppercase">
                {sub.story_count} {sub.story_count === 1 ? "story" : "stories"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
