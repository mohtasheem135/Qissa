import type { Metadata } from "next";
import { LanguagesPanel } from "@/components/admin/LanguagesPanel";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Languages",
};

export const dynamic = "force-dynamic";

export default async function LanguagesPage() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("languages")
    .select(
      "code, name_english, name_native, direction, font_family, font_family_reading, display_order, is_active",
    )
    .order("display_order", { ascending: true })
    .order("code", { ascending: true });

  if (error) throw error;

  return <LanguagesPanel languages={data ?? []} />;
}
