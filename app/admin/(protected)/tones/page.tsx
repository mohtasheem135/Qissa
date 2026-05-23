import type { Metadata } from "next";
import { TonesPanel } from "@/components/admin/TonesPanel";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Tones",
};

export const dynamic = "force-dynamic";

export default async function TonesPage() {
  const admin = createAdminClient();

  const [{ data: tones, error: tonesError }, { data: languages, error: langError }] =
    await Promise.all([
      admin
        .from("tones")
        .select("id, language_code, name, display_name, description, prompt_fragment, is_active")
        .order("language_code", { ascending: true })
        .order("name", { ascending: true }),
      admin
        .from("languages")
        .select("code, name_english")
        .eq("is_active", true)
        .order("display_order", { ascending: true }),
    ]);

  if (tonesError) throw tonesError;
  if (langError) throw langError;

  return <TonesPanel tones={tones ?? []} languages={languages ?? []} />;
}
