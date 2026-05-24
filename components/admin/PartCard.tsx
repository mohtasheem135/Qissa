"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updatePartTexts } from "@/lib/actions/story-parts";
import { wordCount } from "@/lib/utils/word-count";
import { VersionHistoryDialog, type VersionRow } from "./VersionHistoryDialog";

export type PartStatus = "pending" | "translating" | "completed" | "edited" | "failed";

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
  status: PartStatus;
  error_message: string | null;
  ai_provider: string | null;
  ai_model: string | null;
  word_count_original: number;
  word_count_translated: number;
  versions: ReadonlyArray<VersionRow>;
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
}

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
}: PartCardProps) {
  const effectiveStatus = liveStatus ?? part.status;
  const effectiveError = liveError ?? part.error_message;
  const badge = STATUS_BADGE[effectiveStatus];

  const [textTranslated, setTextTranslated] = useState(part.text_translated ?? "");
  const [savingTr, startSavingTr] = useTransition();

  // React-19 "adjust state during render" — keep textarea in sync with prop
  // refreshes after server mutations.
  const propSignature = `${part.translationId}:${part.text_translated ?? ""}`;
  const [prevPropSignature, setPrevPropSignature] = useState(propSignature);
  if (propSignature !== prevPropSignature) {
    setPrevPropSignature(propSignature);
    setTextTranslated(part.text_translated ?? "");
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

  const translatedWords = wordCount(textTranslated);

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
          <div className="bg-muted/20 max-h-72 overflow-y-auto rounded-md border p-3 font-mono text-xs whitespace-pre-wrap">
            {part.text_original || (
              <span className="text-muted-foreground italic">(empty)</span>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-muted-foreground text-xs">
            Translation ({translatedWords} words)
          </div>
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
            className="h-72 max-h-96 min-h-48 resize-y overflow-y-auto font-mono text-xs"
          />
        </div>
      </div>
    </div>
  );
}
