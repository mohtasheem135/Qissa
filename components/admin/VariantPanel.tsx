"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteVariant,
  setVariantPrimary,
  setVariantPublished,
  setVariantVoice,
} from "@/lib/actions/story-variants";
import { PartCard, type AudioStatus, type PartCardData, type PartStatus } from "./PartCard";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";

export interface AudioVoiceOption {
  id: string;
  name: string;
  gender: "female" | "male";
  description?: string;
  /** Provider model ids this voice belongs to (undefined = all models). */
  models?: ReadonlyArray<string>;
}
export interface AudioModelOption {
  id: string;
  name: string;
  defaultVoiceId: string;
}
export interface AudioProviderOption {
  id: string;
  name: string;
  defaultModel: string;
  models: ReadonlyArray<AudioModelOption>;
  voices: ReadonlyArray<AudioVoiceOption>;
}

export interface VariantPanelData {
  id: string;
  slug: string;
  target_language: string;
  language_name_english: string;
  tone_name: string;
  title_translated: string | null;
  status: "draft" | "published";
  is_primary: boolean;
  ai_provider: string | null;
  ai_model: string | null;
  total_words_translated: number;
  tts_provider: string | null;
  tts_model: string | null;
  tts_voice_id: string | null;
  /** TTS providers usable for this variant's language (configured + has voices). */
  audioProviders: ReadonlyArray<AudioProviderOption>;
  parts: ReadonlyArray<PartCardData>;
}

interface QueueEvent {
  type:
    | "queue_started"
    | "part_started"
    | "part_completed"
    | "part_failed"
    | "queue_done"
    | "queue_cancelled"
    | "queue_error";
  totalParts?: number;
  translationId?: string;
  partId?: string;
  partNumber?: number;
  error?: string;
  completed?: number;
  failed?: number;
  audioUrl?: string;
  durationSeconds?: number | null;
}

interface LiveState {
  status: PartStatus;
  error: string | null;
}

interface LiveAudioState {
  status: AudioStatus;
  error: string | null;
}

/** Read an SSE-over-fetch body, dispatching each `data: {…}` event. */
async function consumeSse(
  response: Response,
  onEvent: (data: QueueEvent) => void,
): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const ev of events) {
      if (!ev.startsWith("data: ")) continue;
      try {
        onEvent(JSON.parse(ev.slice(6)) as QueueEvent);
      } catch {
        // malformed event — ignore
      }
    }
  }
}

interface VariantPanelProps {
  variant: VariantPanelData;
  /** True when there are multiple variants and the user can pick a primary. */
  hasSiblings: boolean;
}

export function VariantPanel({ variant, hasSiblings }: VariantPanelProps) {
  const router = useRouter();
  const [liveByTranslation, setLiveByTranslation] = useState<Record<string, LiveState>>({});
  const [queueRunning, setQueueRunning] = useState(false);
  const [queueSummary, setQueueSummary] = useState<{ completed: number; failed: number } | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);
  const [publishPending, startPublish] = useTransition();
  const [primaryPending, startPrimary] = useTransition();

  // ---- Audio (TTS) state ----------------------------------------------------
  const [liveAudioByTranslation, setLiveAudioByTranslation] = useState<
    Record<string, LiveAudioState>
  >({});
  const [audioQueueRunning, setAudioQueueRunning] = useState(false);
  const [audioQueueSummary, setAudioQueueSummary] = useState<{
    completed: number;
    failed: number;
  } | null>(null);
  const audioAbortRef = useRef<AbortController | null>(null);

  const [ttsProvider, setTtsProvider] = useState<string>(
    variant.tts_provider ?? variant.audioProviders[0]?.id ?? "",
  );
  const selectedAudioProvider = variant.audioProviders.find((p) => p.id === ttsProvider);
  const [ttsModel, setTtsModel] = useState<string>(
    variant.tts_model ?? selectedAudioProvider?.defaultModel ?? variant.audioProviders[0]?.defaultModel ?? "",
  );
  const [ttsVoiceId, setTtsVoiceId] = useState<string>(
    variant.tts_voice_id ?? variant.audioProviders[0]?.voices[0]?.id ?? "",
  );
  // Voices scoped to the chosen model (Sarvam v2/v3 have different speakers).
  const modelVoices = (selectedAudioProvider?.voices ?? []).filter(
    (v) => !v.models || v.models.includes("*") || v.models.includes(ttsModel),
  );
  const audioSupported = variant.audioProviders.length > 0;

  const pendingCount = variant.parts.filter((p) => {
    const status = liveByTranslation[p.translationId]?.status ?? p.status;
    return status === "pending" || status === "failed";
  }).length;

  // Audio is "pending" for any part that has translated text but no finished MP3.
  const audioPendingCount = variant.parts.filter((p) => {
    const trStatus = liveByTranslation[p.translationId]?.status ?? p.status;
    const audStatus = liveAudioByTranslation[p.translationId]?.status ?? p.audio_status;
    return (trStatus === "completed" || trStatus === "edited") && audStatus !== "completed";
  }).length;

  const handleEvent = useCallback(
    (data: QueueEvent) => {
      if (data.type === "queue_started") {
        toast.message(
          `Translating ${data.totalParts ?? 0} part(s) for ${variant.language_name_english}/${variant.tone_name}…`,
        );
      } else if (data.type === "part_started" && data.translationId) {
        setLiveByTranslation((prev) => ({
          ...prev,
          [data.translationId!]: { status: "translating", error: null },
        }));
      } else if (data.type === "part_completed" && data.translationId) {
        setLiveByTranslation((prev) => ({
          ...prev,
          [data.translationId!]: { status: "completed", error: null },
        }));
      } else if (data.type === "part_failed" && data.translationId) {
        setLiveByTranslation((prev) => ({
          ...prev,
          [data.translationId!]: { status: "failed", error: data.error ?? "Translation failed." },
        }));
      } else if (data.type === "queue_done" || data.type === "queue_cancelled") {
        setQueueSummary({ completed: data.completed ?? 0, failed: data.failed ?? 0 });
        if (data.type === "queue_done") {
          toast.success(`Queue done: ${data.completed ?? 0} translated, ${data.failed ?? 0} failed.`);
        }
      } else if (data.type === "queue_error") {
        toast.error(`Queue error: ${data.error ?? "unknown"}`);
      }
    },
    [variant.language_name_english, variant.tone_name],
  );

  const runQueue = useCallback(
    async (fromPartNumber?: number) => {
      if (queueRunning) return;
      const controller = new AbortController();
      abortRef.current = controller;
      setQueueRunning(true);
      setQueueSummary(null);
      setLiveByTranslation({});

      try {
        const response = await fetch("/api/translate/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ variantId: variant.id, fromPartNumber }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const errText = await response.text().catch(() => "");
          toast.error(`Queue failed: ${response.status} ${errText.slice(0, 200)}`);
          return;
        }

        await consumeSse(response, handleEvent);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") {
          toast.message("Translation cancelled.");
        } else {
          toast.error(err instanceof Error ? err.message : "Queue error.");
        }
      } finally {
        setQueueRunning(false);
        abortRef.current = null;
        router.refresh();
      }
    },
    [queueRunning, variant.id, router, handleEvent],
  );

  function handleCancel() {
    abortRef.current?.abort();
  }

  // ---- Audio queue ----------------------------------------------------------
  const handleAudioEvent = useCallback(
    (data: QueueEvent) => {
      if (data.type === "queue_started") {
        toast.message(`Generating audio for ${data.totalParts ?? 0} part(s)…`);
      } else if (data.type === "part_started" && data.translationId) {
        setLiveAudioByTranslation((prev) => ({
          ...prev,
          [data.translationId!]: { status: "generating", error: null },
        }));
      } else if (data.type === "part_completed" && data.translationId) {
        setLiveAudioByTranslation((prev) => ({
          ...prev,
          [data.translationId!]: { status: "completed", error: null },
        }));
      } else if (data.type === "part_failed" && data.translationId) {
        setLiveAudioByTranslation((prev) => ({
          ...prev,
          [data.translationId!]: { status: "failed", error: data.error ?? "Audio failed." },
        }));
      } else if (data.type === "queue_done" || data.type === "queue_cancelled") {
        setAudioQueueSummary({ completed: data.completed ?? 0, failed: data.failed ?? 0 });
        if (data.type === "queue_done") {
          toast.success(
            `Audio done: ${data.completed ?? 0} generated, ${data.failed ?? 0} failed.`,
          );
        }
      } else if (data.type === "queue_error") {
        toast.error(`Audio queue error: ${data.error ?? "unknown"}`);
      }
    },
    [],
  );

  const runAudioQueue = useCallback(async () => {
    if (audioQueueRunning || !ttsProvider || !ttsVoiceId) return;
    const controller = new AbortController();
    audioAbortRef.current = controller;
    setAudioQueueRunning(true);
    setAudioQueueSummary(null);
    setLiveAudioByTranslation({});

    try {
      const response = await fetch("/api/tts/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantId: variant.id,
          providerName: ttsProvider,
          model: ttsModel,
          voiceId: ttsVoiceId,
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const errText = await response.text().catch(() => "");
        toast.error(`Audio queue failed: ${response.status} ${errText.slice(0, 200)}`);
        return;
      }
      await consumeSse(response, handleAudioEvent);
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") {
        toast.message("Audio generation cancelled.");
      } else {
        toast.error(err instanceof Error ? err.message : "Audio queue error.");
      }
    } finally {
      setAudioQueueRunning(false);
      audioAbortRef.current = null;
      router.refresh();
    }
  }, [audioQueueRunning, ttsProvider, ttsModel, ttsVoiceId, variant.id, router, handleAudioEvent]);

  function handleAudioCancel() {
    audioAbortRef.current?.abort();
  }

  function handleProviderChange(next: string) {
    setTtsProvider(next);
    const provider = variant.audioProviders.find((p) => p.id === next);
    const nextModel = provider?.defaultModel ?? "";
    const modelMeta = provider?.models.find((m) => m.id === nextModel);
    const firstVoice =
      provider?.voices.find((v) => v.id === modelMeta?.defaultVoiceId)?.id ??
      provider?.voices.find((v) => !v.models || v.models.includes(nextModel))?.id ??
      "";
    setTtsModel(nextModel);
    setTtsVoiceId(firstVoice);
    if (firstVoice) void persistVoice(next, nextModel, firstVoice);
  }

  function handleModelChange(next: string) {
    setTtsModel(next);
    const provider = variant.audioProviders.find((p) => p.id === ttsProvider);
    const modelMeta = provider?.models.find((m) => m.id === next);
    // Reset the voice to the new model's default (voices are model-specific).
    const firstVoice =
      provider?.voices.find((v) => v.id === modelMeta?.defaultVoiceId)?.id ??
      provider?.voices.find((v) => !v.models || v.models.includes(next))?.id ??
      "";
    setTtsVoiceId(firstVoice);
    if (firstVoice) void persistVoice(ttsProvider, next, firstVoice);
  }

  function handleVoiceChange(next: string) {
    setTtsVoiceId(next);
    if (ttsProvider) void persistVoice(ttsProvider, ttsModel, next);
  }

  async function persistVoice(provider: string, model: string, voiceId: string) {
    try {
      await setVariantVoice(variant.id, provider, model, voiceId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save voice.");
    }
  }

  async function handleGenerateAudioOne(translationId: string) {
    if (audioQueueRunning || !ttsProvider || !ttsVoiceId) return;
    setLiveAudioByTranslation((prev) => ({
      ...prev,
      [translationId]: { status: "generating", error: null },
    }));
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyPartTranslationId: translationId,
          providerName: ttsProvider,
          model: ttsModel,
          voiceId: ttsVoiceId,
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (res.ok && data.ok) {
        setLiveAudioByTranslation((prev) => ({
          ...prev,
          [translationId]: { status: "completed", error: null },
        }));
        toast.success("Audio generated.");
      } else {
        setLiveAudioByTranslation((prev) => ({
          ...prev,
          [translationId]: { status: "failed", error: data.error ?? "Audio failed." },
        }));
        toast.error(data.error ?? `Audio failed (${res.status}).`);
      }
    } catch (err) {
      setLiveAudioByTranslation((prev) => ({
        ...prev,
        [translationId]: {
          status: "failed",
          error: err instanceof Error ? err.message : "Network error.",
        },
      }));
    } finally {
      router.refresh();
    }
  }

  function handleTogglePublished(next: boolean) {
    startPublish(async () => {
      try {
        await setVariantPublished(variant.id, next);
        toast.success(next ? "Variant published." : "Variant unpublished.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update.");
      }
    });
  }

  function handleSetPrimary() {
    if (variant.is_primary) return;
    startPrimary(async () => {
      try {
        await setVariantPrimary(variant.id);
        toast.success("Marked as primary.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to set primary.");
      }
    });
  }

  async function handleTranslateOne(translationId: string) {
    if (queueRunning) return;
    setLiveByTranslation((prev) => ({
      ...prev,
      [translationId]: { status: "translating", error: null },
    }));
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyPartTranslationId: translationId }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (res.ok && data.ok) {
        setLiveByTranslation((prev) => ({
          ...prev,
          [translationId]: { status: "completed", error: null },
        }));
        toast.success("Translated.");
      } else {
        setLiveByTranslation((prev) => ({
          ...prev,
          [translationId]: { status: "failed", error: data.error ?? "Translation failed." },
        }));
        toast.error(data.error ?? `Translation failed (${res.status}).`);
      }
    } catch (err) {
      setLiveByTranslation((prev) => ({
        ...prev,
        [translationId]: {
          status: "failed",
          error: err instanceof Error ? err.message : "Network error.",
        },
      }));
    } finally {
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col items-start gap-3 space-y-0 lg:flex-row lg:flex-wrap lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">
              {variant.language_name_english} · {variant.tone_name}
            </CardTitle>
            <Badge variant={variant.status === "published" ? "default" : "outline"}>
              {variant.status}
            </Badge>
            {variant.is_primary ? <Badge variant="secondary">primary</Badge> : null}
            <code className="text-muted-foreground text-xs">/{variant.slug}/</code>
          </div>
          <p className="text-muted-foreground text-xs">
            {variant.title_translated ?? <em>untitled translation</em>}
            {" · "}
            {variant.total_words_translated} words
            {variant.ai_provider ? ` · ${variant.ai_provider}` : ""}
            {variant.ai_model ? ` · ${variant.ai_model}` : ""}
          </p>
          <p className="text-muted-foreground text-xs">
            {pendingCount > 0
              ? `${pendingCount} pending / failed part${pendingCount === 1 ? "" : "s"}.`
              : "All parts translated."}
            {queueSummary
              ? ` Last run: ${queueSummary.completed} ok, ${queueSummary.failed} failed.`
              : ""}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:gap-3 lg:w-auto">
          {queueRunning ? (
            <Button variant="outline" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
          ) : (
            <Button size="sm" disabled={pendingCount === 0} onClick={() => runQueue()}>
              Translate {pendingCount > 0 ? `${pendingCount} ` : ""}pending
            </Button>
          )}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">Published</span>
            <Switch
              checked={variant.status === "published"}
              onCheckedChange={handleTogglePublished}
              disabled={publishPending}
              aria-label="Publish variant"
            />
          </div>
          {hasSiblings && !variant.is_primary ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSetPrimary}
              disabled={primaryPending}
            >
              Set primary
            </Button>
          ) : null}
          <DeleteConfirmDialog
            title="Delete this variant?"
            description="Soft delete — hides the variant from readers and the reader URL. Translations are preserved and can be undeleted via SQL."
            triggerLabel="Delete variant"
            onConfirm={() => deleteVariant(variant.id)}
            successMessage="Variant deleted."
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="bg-muted/20 space-y-3 rounded-md border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">Audio narration</span>
            <span className="text-muted-foreground text-xs">
              {!audioSupported
                ? "No TTS voice available for this language."
                : audioPendingCount > 0
                  ? `${audioPendingCount} part${audioPendingCount === 1 ? "" : "s"} without audio.`
                  : "All translated parts have audio."}
              {audioQueueSummary
                ? ` Last run: ${audioQueueSummary.completed} ok, ${audioQueueSummary.failed} failed.`
                : ""}
            </span>
          </div>

          {audioSupported ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs" htmlFor={`tts-provider-${variant.id}`}>
                  Provider
                </Label>
                <Select value={ttsProvider} onValueChange={handleProviderChange}>
                  <SelectTrigger id={`tts-provider-${variant.id}`} size="sm" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {variant.audioProviders.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(selectedAudioProvider?.models.length ?? 0) > 1 ? (
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor={`tts-model-${variant.id}`}>
                    Model
                  </Label>
                  <Select value={ttsModel} onValueChange={handleModelChange}>
                    <SelectTrigger id={`tts-model-${variant.id}`} size="sm" className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(selectedAudioProvider?.models ?? []).map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="space-y-1">
                <Label className="text-xs" htmlFor={`tts-voice-${variant.id}`}>
                  Voice
                </Label>
                <Select value={ttsVoiceId} onValueChange={handleVoiceChange}>
                  <SelectTrigger id={`tts-voice-${variant.id}`} size="sm" className="w-56 max-w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {modelVoices.map((v) => (
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
              {audioQueueRunning ? (
                <Button variant="outline" size="sm" onClick={handleAudioCancel}>
                  Cancel
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={audioPendingCount === 0 || !ttsVoiceId}
                  onClick={() => runAudioQueue()}
                >
                  Generate audio {audioPendingCount > 0 ? `(${audioPendingCount}) ` : ""}
                </Button>
              )}
            </div>
          ) : null}
        </div>

        {variant.parts.length === 0 ? (
          <p className="text-muted-foreground text-sm">No parts yet — add some in the Source section above.</p>
        ) : (
          variant.parts.map((part) => {
            const live = liveByTranslation[part.translationId];
            const liveAudio = liveAudioByTranslation[part.translationId];
            return (
              <PartCard
                key={part.translationId}
                part={part}
                isInFlight={live?.status === "translating"}
                liveStatus={live?.status}
                liveError={live?.error}
                onTranslate={handleTranslateOne}
                queueRunning={queueRunning}
                liveAudioStatus={liveAudio?.status}
                liveAudioError={liveAudio?.error}
                onGenerateAudio={handleGenerateAudioOne}
                audioQueueRunning={audioQueueRunning}
              />
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
