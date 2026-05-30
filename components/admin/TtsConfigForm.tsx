"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveTtsConfig } from "@/lib/actions/tts-config";
import {
  INITIAL_TTS_CONFIG_FORM_STATE,
  type TtsConfigFormState,
} from "@/lib/actions/tts-config.types";

/** Serializable shapes passed from the server page (no env-reading helpers). */
export interface TtsModelOption {
  id: string;
  name: string;
  defaultVoiceId: string;
}
export interface TtsProviderOption {
  id: string;
  name: string;
  envKey: string;
  defaultModel: string;
  defaultVoiceId: string;
  freeTier: string;
  models: ReadonlyArray<TtsModelOption>;
}
export interface TtsVoiceOption {
  id: string;
  name: string;
  gender: "female" | "male";
  description?: string;
  /** Provider model ids this voice belongs to (undefined = all models). */
  models?: ReadonlyArray<string>;
}

interface TtsConfigFormProps {
  current: { default_tts_provider: string; default_tts_model: string; default_voice_id: string };
  allProviders: ReadonlyArray<TtsProviderOption>;
  configuredProviderIds: ReadonlyArray<string>;
  /** provider id → its voice catalog. */
  voiceCatalog: Record<string, ReadonlyArray<TtsVoiceOption>>;
}

interface TestResult {
  ok: boolean;
  error?: string;
  latencyMs?: number;
  provider?: string;
  voiceUsed?: string;
  characters?: number;
  mimeType?: string;
  audioBase64?: string;
}

export function TtsConfigForm({
  current,
  allProviders,
  configuredProviderIds,
  voiceCatalog,
}: TtsConfigFormProps) {
  const [state, action] = useActionState<TtsConfigFormState, FormData>(
    saveTtsConfig,
    INITIAL_TTS_CONFIG_FORM_STATE,
  );

  const [providerId, setProviderId] = useState<string>(current.default_tts_provider);
  const [modelId, setModelId] = useState<string>(current.default_tts_model);
  const [voiceId, setVoiceId] = useState<string>(current.default_voice_id);

  useEffect(() => {
    if (state.success && state.savedAt > 0) {
      toast.success("TTS config saved.");
    }
  }, [state.success, state.savedAt]);

  const provider = useMemo(
    () => allProviders.find((p) => p.id === providerId),
    [allProviders, providerId],
  );
  const models = provider?.models ?? [];
  // Voices scoped to the chosen model (Sarvam v2/v3 have different speakers).
  const voices = useMemo(
    () =>
      (voiceCatalog[providerId] ?? []).filter(
        (v) => !v.models || v.models.includes("*") || v.models.includes(modelId),
      ),
    [voiceCatalog, providerId, modelId],
  );

  function handleProviderChange(next: string) {
    setProviderId(next);
    const meta = allProviders.find((p) => p.id === next);
    // Reset model + voice to the new provider's defaults whenever it switches.
    const nextModel = meta?.defaultModel ?? "";
    setModelId(nextModel);
    const modelMeta = meta?.models.find((m) => m.id === nextModel);
    setVoiceId(modelMeta?.defaultVoiceId ?? meta?.defaultVoiceId ?? "");
  }

  function handleModelChange(next: string) {
    setModelId(next);
    // Reset the voice to the new model's default (voices are model-specific).
    const modelMeta = provider?.models.find((m) => m.id === next);
    if (modelMeta) setVoiceId(modelMeta.defaultVoiceId);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Default TTS provider & voice</CardTitle>
          <CardDescription>
            Used as the default when generating audio for a variant. The admin can override the
            voice per-variant in the story workflow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="tts-provider">Provider</Label>
                <Select
                  name="default_tts_provider"
                  value={providerId}
                  onValueChange={handleProviderChange}
                >
                  <SelectTrigger id="tts-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allProviders.map((p) => {
                      const configured = configuredProviderIds.includes(p.id);
                      return (
                        <SelectItem key={p.id} value={p.id} disabled={!configured}>
                          {p.name}{" "}
                          <span className="text-muted-foreground ml-1 text-xs">
                            {configured ? `· ${p.freeTier}` : `· missing ${p.envKey}`}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tts-model">Model</Label>
                <Select name="default_tts_model" value={modelId} onValueChange={handleModelChange}>
                  <SelectTrigger id="tts-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tts-voice">Default voice</Label>
                <Select name="default_voice_id" value={voiceId} onValueChange={setVoiceId}>
                  <SelectTrigger id="tts-voice">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {voices.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                        <span className="text-muted-foreground ml-1 text-xs">
                          · {v.gender}
                          {v.description ? ` · ${v.description}` : ""}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {state.error ? (
              <p
                role="alert"
                className="text-destructive border-destructive/40 bg-destructive/5 rounded-md border px-3 py-2 text-sm"
              >
                {state.error}
              </p>
            ) : null}

            <div className="flex justify-end">
              <SaveButton />
            </div>
          </form>
        </CardContent>
      </Card>

      <TestConnectionCard providerId={providerId} modelId={modelId} voiceId={voiceId} />

      <Card>
        <CardHeader>
          <CardTitle>Provider status</CardTitle>
          <CardDescription>From environment variables in .env.local.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {allProviders.map((p) => {
            const configured = configuredProviderIds.includes(p.id);
            return (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium">{p.name}</span>
                  <span className="text-muted-foreground ml-2 font-mono text-xs">{p.envKey}</span>
                </div>
                <Badge variant={configured ? "default" : "outline"}>
                  {configured ? "Configured" : "Missing"}
                </Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

function TestConnectionCard({
  providerId,
  modelId,
  voiceId,
}: {
  providerId: string;
  modelId: string;
  voiceId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<TestResult | null>(null);

  function handleTest() {
    setResult(null);
    startTransition(async () => {
      const started = performance.now();
      try {
        const res = await fetch("/api/tts/test", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ providerName: providerId, model: modelId, voiceId }),
        });
        const data = (await res.json()) as TestResult;
        const elapsed = Math.round(performance.now() - started);
        setResult({ ...data, latencyMs: data.latencyMs ?? elapsed });
      } catch (err) {
        setResult({ ok: false, error: err instanceof Error ? err.message : "Network error" });
      }
    });
  }

  const audioSrc =
    result?.ok && result.audioBase64
      ? `data:${result.mimeType ?? "audio/mpeg"};base64,${result.audioBase64}`
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test connection</CardTitle>
        <CardDescription>
          Synthesizes a short sample with the selected provider + voice and plays it here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button variant="outline" onClick={handleTest} disabled={pending}>
          {pending ? "Synthesizing…" : "Send test request"}
        </Button>

        {audioSrc ? <audio controls src={audioSrc} className="w-full" /> : null}

        {result ? (
          <pre
            className={`rounded-md border px-3 py-2 font-mono text-xs whitespace-pre-wrap ${
              result.ok
                ? "bg-muted/40"
                : "text-destructive border-destructive/40 bg-destructive/5"
            }`}
          >
{JSON.stringify({ ...result, audioBase64: result.audioBase64 ? "<omitted>" : undefined }, null, 2)}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  );
}
