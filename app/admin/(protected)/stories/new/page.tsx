import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StoryForm, type CategoryWithSubsOption } from "@/components/admin/StoryForm";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConfiguredProviders, PROVIDERS } from "@/lib/ai/registry";

export const metadata: Metadata = {
  title: "New story",
};

export const dynamic = "force-dynamic";

export default async function NewStoryPage() {
  const admin = createAdminClient();

  const [
    { data: categories, error: catErr },
    { data: languages, error: langErr },
    { data: tones, error: toneErr },
    { data: aiConfig, error: cfgErr },
  ] = await Promise.all([
    admin
      .from("categories")
      .select("id, name, subcategories ( id, name, is_active )")
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
    admin
      .from("languages")
      .select("code, name_english")
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
    admin
      .from("tones")
      .select("id, name, language_code")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    admin
      .from("ai_config")
      .select("default_provider, default_model")
      .single(),
  ]);

  if (catErr) throw catErr;
  if (langErr) throw langErr;
  if (toneErr) throw toneErr;
  if (cfgErr) throw cfgErr;

  const categoryOptions: CategoryWithSubsOption[] = (categories ?? [])
    .map((c) => ({
      id: c.id,
      name: c.name,
      subcategories: (c.subcategories ?? [])
        .filter((s) => s.is_active)
        .map((s) => ({ id: s.id, name: s.name })),
    }))
    .filter((c) => c.subcategories.length > 0);

  // No subcategories anywhere = admin needs to create one first.
  if (categoryOptions.length === 0) {
    return (
      <div className="space-y-6">
        <Link href="/admin/stories" className="text-muted-foreground text-xs hover:underline">
          ← Stories
        </Link>
        <div className="bg-background space-y-3 rounded-md border p-6">
          <h1 className="text-xl font-semibold">No subcategories yet</h1>
          <p className="text-muted-foreground text-sm">
            A story must live under a subcategory. Create one first.
          </p>
          <Link
            href="/admin/categories"
            className="text-primary inline-block text-sm hover:underline"
          >
            Go to Categories →
          </Link>
        </div>
      </div>
    );
  }

  // Sanity: if defaults reference an unknown provider, fall back to a configured one.
  const configured = getConfiguredProviders();
  if (configured.length === 0) {
    redirect("/admin/ai-config");
  }
  const defaultProvider =
    PROVIDERS.find((p) => p.id === aiConfig.default_provider && configured.some((c) => c.id === p.id))
      ?.id ?? configured[0].id;
  const defaultProviderMeta = PROVIDERS.find((p) => p.id === defaultProvider)!;
  const defaultModel = defaultProviderMeta.models.includes(aiConfig.default_model)
    ? aiConfig.default_model
    : defaultProviderMeta.defaultModel;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/stories" className="text-muted-foreground text-xs hover:underline">
          ← Stories
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New story</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Metadata + original text. Translation runs on the edit page after save.
        </p>
      </div>

      <StoryForm
        categories={categoryOptions}
        languages={languages ?? []}
        tones={tones ?? []}
        providers={PROVIDERS}
        configuredProviderIds={configured.map((c) => c.id)}
        defaultProvider={defaultProvider}
        defaultModel={defaultModel}
      />
    </div>
  );
}
