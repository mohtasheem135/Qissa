import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ storyId: string; partNumber: string }>;
}

/**
 * Legacy reader URL: /s/[storyId]/p/[partNumber]
 *
 * Variant-aware URLs are `/s/[storyId]/[variantSlug]/p/[partNumber]`. We keep
 * this old shape as a redirect to the story's primary published variant so
 * old bookmarks / SW-cached entries still resolve.
 */
export default async function LegacyReaderRedirect({ params }: PageProps) {
  const { storyId, partNumber: partNumberRaw } = await params;
  const partNumber = Number.parseInt(partNumberRaw, 10);
  if (!Number.isInteger(partNumber) || partNumber < 1) notFound();

  const supabase = await createClient();
  // Prefer the primary variant; fall back to any published one.
  const { data: variant } = await supabase
    .from("story_variants")
    .select("slug, is_primary")
    .eq("story_id", storyId)
    .eq("status", "published")
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (variant) {
    redirect(`/s/${storyId}/${variant.slug}/p/${partNumber}`);
  }

  // No published variant (story may be draft, or has only draft variants).
  // Land the reader on the story page rather than a hard 404; the landing
  // page itself shows the appropriate state (or 404s if even the story is
  // hidden from the anon client).
  redirect(`/s/${storyId}`);
}
