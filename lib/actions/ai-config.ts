"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/check-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProviderMeta, type ProviderId } from "@/lib/ai/registry";

const AI_CONFIG_ID = "00000000-0000-0000-0000-000000000001";

export type AiConfigFormState = {
  error: string | null;
  success: boolean;
  savedAt: number;
};

export const INITIAL_AI_CONFIG_FORM_STATE: AiConfigFormState = {
  error: null,
  success: false,
  savedAt: 0,
};

const KNOWN_PROVIDERS: ReadonlyArray<ProviderId> = [
  "gemini",
  "groq",
  "openrouter",
  "openai",
  "anthropic",
];

function isProviderId(value: string): value is ProviderId {
  return (KNOWN_PROVIDERS as ReadonlyArray<string>).includes(value);
}

export async function saveAiConfig(
  _previousState: AiConfigFormState,
  formData: FormData,
): Promise<AiConfigFormState> {
  await requireAdmin();

  const providerRaw = (formData.get("default_provider")?.toString() ?? "").trim();
  const model = (formData.get("default_model")?.toString() ?? "").trim();

  if (!providerRaw || !isProviderId(providerRaw)) {
    return { ...INITIAL_AI_CONFIG_FORM_STATE, error: "Pick a valid provider." };
  }
  if (!model) {
    return { ...INITIAL_AI_CONFIG_FORM_STATE, error: "Pick a model." };
  }

  // Sanity-check model is known for this provider (we trust the dropdown but
  // a stale form submit could send a stale model).
  const meta = getProviderMeta(providerRaw);
  if (meta && !meta.models.includes(model)) {
    return {
      ...INITIAL_AI_CONFIG_FORM_STATE,
      error: `Model "${model}" is not in the known list for ${meta.name}.`,
    };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("ai_config")
    .update({ default_provider: providerRaw, default_model: model })
    .eq("id", AI_CONFIG_ID);

  if (error) {
    return { ...INITIAL_AI_CONFIG_FORM_STATE, error: error.message };
  }

  revalidatePath("/admin/ai-config");
  return { error: null, success: true, savedAt: Date.now() };
}
