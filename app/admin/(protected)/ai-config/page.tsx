import type { Metadata } from "next";
import { AiConfigForm } from "@/components/admin/AiConfigForm";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConfiguredProviders, PROVIDERS } from "@/lib/ai/registry";

export const metadata: Metadata = {
  title: "AI config",
};

export const dynamic = "force-dynamic";

export default async function AiConfigPage() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_config")
    .select("default_provider, default_model")
    .single();

  if (error) throw error;

  const configuredProviderIds = getConfiguredProviders().map((p) => p.id);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">AI config</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          The default provider and model used when creating a new story.
        </p>
      </header>

      <AiConfigForm
        current={data}
        allProviders={PROVIDERS}
        configuredProviderIds={configuredProviderIds}
      />
    </div>
  );
}
