"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { generateNarration, updatePartTexts } from "@/lib/actions/story-parts";
import { wordCount } from "@/lib/utils/word-count";
import { VersionHistoryDialog, type VersionRow } from "./VersionHistoryDialog";

export type PartStatus = "pending" | "translating" | "completed" | "edited" | "failed";

/** Audio generation status. "none" = no audio row yet. */
export type AudioStatus = "none" | "pending" | "generating" | "completed" | "failed";

/** Narration-script (emotion_text) generation status. null = never generated. */
export type EmotionStatus = "generating" | "ready" | "failed" | null;

/**
 * One translation row, scoped to ONE variant of one source part. The original
 * text appears here too (read-only) so the admin can compare side-by-side
 * while editing the translation.
 */
export interface PartCardData {
  /** story_parts.id (shared across variants). */
  partId: string;
  /** story_part_translations.id (variant-specific). */
  translationId: string;
  part_number: number;
  part_label: string | null;
  text_original: string;
  text_translated: string | null;
  /** Expressive narration script the TTS engine narrates (reader never sees it). */
  emotion_text: string | null;
  emotion_status: EmotionStatus;
  status: PartStatus;
  error_message: string | null;
  ai_provider: string | null;
  ai_model: string | null;
  word_count_original: number;
  word_count_translated: number;
  versions: ReadonlyArray<VersionRow>;
  /** Premium-audio state for this translation (story_part_audio). */
  audio_status: AudioStatus;
  /** Render-ready R2 playback URL, or null when no audio yet. */
  audio_url: string | null;
  audio_error: string | null;
}

interface PartCardProps {
  part: PartCardData;
  /** True when this translation is the active one in a running queue. */
  isInFlight: boolean;
  /** Out-of-band status pushed in by the live queue (overrides DB status). */
  liveStatus?: PartStatus;
  liveError?: string | null;
  /** Click handler for the per-part Translate / Re-translate button. */
  onTranslate: (translationId: string) => void;
  /** True when a queue is currently running (disables Translate). */
  queueRunning: boolean;
  /** Out-of-band audio status pushed in by the live audio queue. */
  liveAudioStatus?: AudioStatus;
  liveAudioError?: string | null;
  /** Click handler for the per-part Generate / Re-generate audio button. */
  onGenerateAudio: (translationId: string) => void;
  /** True when an audio queue is currently running (disables Generate). */
  audioQueueRunning: boolean;
}

const AUDIO_BADGE: Record<
  AudioStatus,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" } | null
> = {
  none: null,
  pending: { label: "Audio pending", variant: "outline" },
  generating: { label: "Generating audio…", variant: "secondary" },
  completed: { label: "Audio ready", variant: "default" },
  failed: { label: "Audio failed", variant: "destructive" },
};

const EMOTION_BADGE: Record<
  "generating" | "ready" | "failed",
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  generating: { label: "Generating script…", variant: "secondary" },
  ready: { label: "Script ready", variant: "default" },
  failed: { label: "Script failed", variant: "destructive" },
};

const STATUS_BADGE: Record<
  PartStatus,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  pending: { label: "Pending", variant: "outline" },
  translating: { label: "Translating…", variant: "secondary" },
  completed: { label: "Translated", variant: "default" },
  edited: { label: "Edited", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
};

export function PartCard({
  part,
  isInFlight,
  liveStatus,
  liveError,
  onTranslate,
  queueRunning,
  liveAudioStatus,
  liveAudioError,
  onGenerateAudio,
  audioQueueRunning,
}: PartCardProps) {
  const effectiveStatus = liveStatus ?? part.status;
  const effectiveError = liveError ?? part.error_message;
  const badge = STATUS_BADGE[effectiveStatus];

  const effectiveAudioStatus = liveAudioStatus ?? part.audio_status;
  const effectiveAudioError = liveAudioError ?? part.audio_error;
  const audioBadge = AUDIO_BADGE[effectiveAudioStatus];
  // Audio can only be generated once there's translated text to narrate.
  const canGenerateAudio = effectiveStatus === "completed" || effectiveStatus === "edited";
  const audioGenerating = effectiveAudioStatus === "generating";

  const [view, setView] = useState<"reading" | "narration">("reading");
  const [textTranslated, setTextTranslated] = useState(part.text_translated ?? "");
  const [emotionText, setEmotionText] = useState(part.emotion_text ?? "");
  const [savingTr, startSavingTr] = useTransition();
  const [generatingNarration, startGenerateNarration] = useTransition();

  const effectiveEmotionStatus: EmotionStatus = generatingNarration
    ? "generating"
    : part.emotion_status;

  // React-19 "adjust state during render" — keep both textareas in sync with
  // prop refreshes after server mutations.
  const propSignature = `${part.translationId}:${part.text_translated ?? ""}:${part.emotion_text ?? ""}`;
  const [prevPropSignature, setPrevPropSignature] = useState(propSignature);
  if (propSignature !== prevPropSignature) {
    setPrevPropSignature(propSignature);
    setTextTranslated(part.text_translated ?? "");
    setEmotionText(part.emotion_text ?? "");
  }

  function handleSaveTranslated() {
    if (textTranslated === (part.text_translated ?? "")) return;
    startSavingTr(async () => {
      try {
        await updatePartTexts({
          partId: part.partId,
          translationId: part.translationId,
          textTranslated,
        });
        toast.success("Translation saved.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save translation.");
      }
    });
  }

  function handleSaveEmotion() {
    if (emotionText === (part.emotion_text ?? "")) return;
    startSavingTr(async () => {
      try {
        await updatePartTexts({
          partId: part.partId,
          translationId: part.translationId,
          emotionText,
        });
        toast.success("Narration script saved.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save narration script.");
      }
    });
  }

  function handleGenerateNarration() {
    startGenerateNarration(async () => {
      const result = await generateNarration(part.translationId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Narration script generated.");
      }
    });
  }

  const showingNarration = view === "narration";
  const boundValue = showingNarration ? emotionText : textTranslated;
  const translatedWords = wordCount(boundValue);

  return (
    <div
      className={`bg-background space-y-3 rounded-md border p-4 ${
        isInFlight ? "ring-primary/40 ring-2" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-mono tabular-nums">
          #{part.part_number}
        </Badge>
        <span className="text-foreground text-sm">
          {part.part_label ?? `Part ${part.part_number}`}
        </span>
        <Badge variant={badge.variant}>{badge.label}</Badge>
        {audioBadge ? <Badge variant={audioBadge.variant}>{audioBadge.label}</Badge> : null}
        {part.ai_provider ? (
          <span className="text-muted-foreground text-xs">
            {part.ai_provider}
            {part.ai_model ? ` · ${part.ai_model}` : ""}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => onTranslate(part.translationId)}
            disabled={queueRunning || effectiveStatus === "translating" || savingTr}
          >
            {part.text_translated ? "Re-translate" : "Translate"}
          </Button>
          <VersionHistoryDialog translationId={part.translationId} versions={part.versions} />
        </div>
      </div>

      {effectiveError ? (
        <p className="text-destructive border-destructive/40 bg-destructive/5 rounded-md border px-3 py-2 text-xs">
          {effectiveError}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <div className="text-muted-foreground text-xs">
            Original ({part.word_count_original} words)
          </div>
          <div className="bg-muted/20 max-h-48 overflow-y-auto rounded-md border p-3 font-mono text-xs whitespace-pre-wrap sm:max-h-72">
            {part.text_original || (
              <span className="text-muted-foreground italic">(empty)</span>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="bg-muted/40 inline-flex rounded-md border p-0.5">
              {(["reading", "narration"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setView(mode)}
                  aria-pressed={view === mode}
                  className={`rounded px-2 py-1 text-xs transition-colors ${
                    view === mode
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {mode === "reading" ? "Reading" : "Narration"}
                </button>
              ))}
            </div>
            <span className="text-muted-foreground text-xs">{translatedWords} words</span>
            {effectiveEmotionStatus ? (
              <Badge variant={EMOTION_BADGE[effectiveEmotionStatus].variant} className="text-[10px]">
                {EMOTION_BADGE[effectiveEmotionStatus].label}
              </Badge>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto h-7 text-xs"
              onClick={handleGenerateNarration}
              disabled={!canGenerateAudio || generatingNarration}
              title={canGenerateAudio ? undefined : "Translate this part first."}
            >
              {generatingNarration
                ? "Generating…"
                : part.emotion_text
                  ? "Re-generate script"
                  : "Generate narration script"}
            </Button>
          </div>
          {showingNarration ? (
            <Textarea
              value={emotionText}
              onChange={(event) => setEmotionText(event.target.value)}
              onBlur={handleSaveEmotion}
              placeholder={
                effectiveEmotionStatus === "generating"
                  ? "Generating narration script…"
                  : "The expressive TTS narration script. Generate it, or write your own."
              }
              disabled={effectiveEmotionStatus === "generating"}
              className="h-48 max-h-96 min-h-40 resize-y overflow-y-auto font-mono text-xs sm:h-72 sm:min-h-48"
            />
          ) : (
            <Textarea
              value={textTranslated}
              onChange={(event) => setTextTranslated(event.target.value)}
              onBlur={handleSaveTranslated}
              placeholder={
                effectiveStatus === "translating"
                  ? "Translating…"
                  : "Click Translate or paste a manual translation."
              }
              disabled={effectiveStatus === "translating"}
              className="h-48 max-h-96 min-h-40 resize-y overflow-y-auto font-mono text-xs sm:h-72 sm:min-h-48"
            />
          )}
          {showingNarration ? (
            <p className="text-muted-foreground text-[11px]">
              Narrated by the TTS engine instead of the reading text. The reader still sees the
              plain translation.
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t pt-3">
        <span className="text-muted-foreground text-xs">Audio narration</span>
        {part.audio_url && effectiveAudioStatus === "completed" ? (
          <audio controls preload="none" src={part.audio_url} className="h-9 max-w-full" />
        ) : null}
        {effectiveAudioError ? (
          <span className="text-destructive text-xs">{effectiveAudioError}</span>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => onGenerateAudio(part.translationId)}
          disabled={!canGenerateAudio || audioQueueRunning || audioGenerating}
          title={canGenerateAudio ? undefined : "Translate this part first."}
        >
          {audioGenerating
            ? "Generating…"
            : effectiveAudioStatus === "completed"
              ? "Re-generate audio"
              : "Generate audio"}
        </Button>
      </div>
    </div>
  );
}
