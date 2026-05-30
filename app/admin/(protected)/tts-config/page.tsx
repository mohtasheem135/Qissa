import type { Metadata } from "next";
import {
  TtsConfigForm,
  type TtsProviderOption,
  type TtsVoiceOption,
} from "@/components/admin/TtsConfigForm";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getConfiguredTtsProviders,
  TTS_PROVIDERS,
  VOICE_CATALOG,
} from "@/lib/tts/registry";

export const metadata: Metadata = {
  title: "TTS / Voices",
};

export const dynamic = "force-dynamic";

export default async function TtsConfigPage() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tts_config")
    .select("default_tts_provider, default_tts_model, default_voice_id")
    .single();

  if (error) throw error;

  const configuredProviderIds = getConfiguredTtsProviders().map((p) => p.id);

  // Strip the registry meta down to serializable fields for the client form.
  const allProviders: TtsProviderOption[] = TTS_PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    envKey: p.envKey,
    defaultModel: p.defaultModel,
    defaultVoiceId: p.defaultVoiceId,
    freeTier: p.freeTier,
    models: p.models.map((m) => ({ id: m.id, name: m.name, defaultVoiceId: m.defaultVoiceId })),
  }));

  const voiceCatalog: Record<string, TtsVoiceOption[]> = Object.fromEntries(
    TTS_PROVIDERS.map((p) => [
      p.id,
      VOICE_CATALOG[p.id].map((v) => ({
        id: v.id,
        name: v.name,
        gender: v.gender,
        description: v.description,
        models: v.models ? [...v.models] : undefined,
      })),
    ]),
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">TTS / Voices</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          The default text-to-speech provider and voice used when generating audio narration.
        </p>
      </header>

      <TtsConfigForm
        current={data}
        allProviders={allProviders}
        configuredProviderIds={configuredProviderIds}
        voiceCatalog={voiceCatalog}
      />
    </div>
  );
}
