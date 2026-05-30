"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/check-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getTtsModelMeta,
  getTtsProviderMeta,
  getVoiceMeta,
  resolveTtsVoice,
  TTS_PROVIDERS,
  type TtsProviderId,
} from "@/lib/tts/registry";
import { INITIAL_TTS_CONFIG_FORM_STATE, type TtsConfigFormState } from "./tts-config.types";

const TTS_CONFIG_ID = "00000000-0000-0000-0000-000000000001";

function isTtsProviderId(value: string): value is TtsProviderId {
  return TTS_PROVIDERS.some((p) => p.id === value);
}

export async function saveTtsConfig(
  _previousState: TtsConfigFormState,
  formData: FormData,
): Promise<TtsConfigFormState> {
  await requireAdmin();

  const providerRaw = (formData.get("default_tts_provider")?.toString() ?? "").trim();
  const model = (formData.get("default_tts_model")?.toString() ?? "").trim();
  const voiceId = (formData.get("default_voice_id")?.toString() ?? "").trim();

  if (!providerRaw || !isTtsProviderId(providerRaw)) {
    return { ...INITIAL_TTS_CONFIG_FORM_STATE, error: "Pick a valid TTS provider." };
  }
  if (!model) {
    return { ...INITIAL_TTS_CONFIG_FORM_STATE, error: "Pick a model." };
  }
  if (!voiceId) {
    return { ...INITIAL_TTS_CONFIG_FORM_STATE, error: "Pick a default voice." };
  }

  const meta = getTtsProviderMeta(providerRaw);
  if (meta && !getTtsModelMeta(providerRaw, model)) {
    return {
      ...INITIAL_TTS_CONFIG_FORM_STATE,
      error: `Model "${model}" is not available for ${meta.name}.`,
    };
  }
  // The voice must exist AND belong to the chosen model (Sarvam voices differ
  // between v2 and v3) — resolveTtsVoice returns a different id if it doesn't.
  if (meta && (!getVoiceMeta(providerRaw, voiceId) || resolveTtsVoice(providerRaw, model, voiceId) !== voiceId)) {
    return {
      ...INITIAL_TTS_CONFIG_FORM_STATE,
      error: `Voice "${voiceId}" is not available for ${meta.name} ${model}.`,
    };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("tts_config")
    .update({ default_tts_provider: providerRaw, default_tts_model: model, default_voice_id: voiceId })
    .eq("id", TTS_CONFIG_ID);

  if (error) {
    return { ...INITIAL_TTS_CONFIG_FORM_STATE, error: error.message };
  }

  revalidatePath("/admin/tts-config");
  return { error: null, success: true, savedAt: Date.now() };
}
