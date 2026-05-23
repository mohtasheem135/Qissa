"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteStoryPart, moveStoryPart, updatePartTexts } from "@/lib/actions/story-parts";
import { wordCount } from "@/lib/utils/word-count";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { VersionHistoryDialog, type VersionRow } from "./VersionHistoryDialog";

export type PartStatus = "pending" | "translating" | "completed" | "edited" | "failed";

export interface PartCardData {
  id: string;
  part_number: number;
  part_label: string | null;
  text_original: string;
  text_translated: string | null;
  status: PartStatus;
  error_message: string | null;
  last_provider_used: string | null;
  last_model_used: string | null;
  word_count_original: number;
  word_count_translated: number;
  versions: ReadonlyArray<VersionRow>;
}

interface PartCardProps {
  part: PartCardData;
  /** True when this part is the active one in a running queue. */
  isInFlight: boolean;
  /** Out-of-band status pushed in by the live queue (overrides DB status). */
  liveStatus?: PartStatus;
  liveError?: string | null;
  isFirst: boolean;
  isLast: boolean;
  /** Click handler for the per-part Translate / Re-translate button. */
  onTranslate: (partId: string) => void;
  /** True when a queue is currently running (disables most buttons). */
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
  isFirst,
  isLast,
  onTranslate,
  queueRunning,
}: PartCardProps) {
  const effectiveStatus = liveStatus ?? part.status;
  const effectiveError = liveError ?? part.error_message;
  const badge = STATUS_BADGE[effectiveStatus];

  const [label, setLabel] = useState(part.part_label ?? `Part ${part.part_number}`);
  const [textOriginal, setTextOriginal] = useState(part.text_original);
  const [textTranslated, setTextTranslated] = useState(part.text_translated ?? "");
  const [savingMeta, startSavingMeta] = useTransition();
  const [movingPending, startMoving] = useTransition();
  const [editingOriginal, setEditingOriginal] = useState(false);

  // React-19 "adjust state during render" pattern: when the parent
  // re-fetches the story (after a translate / re-translate), the new
  // part.text_translated arrives via props. Without this sync the
  // textarea would keep showing the stale translation until a full page
  // refresh. Comparing prop snapshots is the canonical way to do
  // "props-to-state" without useEffect — see:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const propSignature = `${part.part_label ?? ""}${part.text_original}${part.text_translated ?? ""}`;
  const [prevPropSignature, setPrevPropSignature] = useState(propSignature);
  if (propSignature !== prevPropSignature) {
    setPrevPropSignature(propSignature);
    setLabel(part.part_label ?? `Part ${part.part_number}`);
    setTextOriginal(part.text_original);
    setTextTranslated(part.text_translated ?? "");
    setEditingOriginal(false);
  }

  function handleSaveLabel() {
    if ((part.part_label ?? `Part ${part.part_number}`) === label) return;
    startSavingMeta(async () => {
      try {
        await updatePartTexts({ partId: part.id, partLabel: label });
        toast.success("Label saved.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save label.");
      }
    });
  }
  function handleSaveOriginal() {
    if (textOriginal === part.text_original) {
      setEditingOriginal(false);
      return;
    }
    startSavingMeta(async () => {
      try {
        await updatePartTexts({ partId: part.id, textOriginal });
        toast.success("Original saved.");
        setEditingOriginal(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save original.");
      }
    });
  }
  function handleSaveTranslated() {
    if (textTranslated === (part.text_translated ?? "")) return;
    startSavingMeta(async () => {
      try {
        await updatePartTexts({ partId: part.id, textTranslated });
        toast.success("Translation saved.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save translation.");
      }
    });
  }

  function handleMove(direction: "up" | "down") {
    startMoving(async () => {
      const result = await moveStoryPart(part.id, direction);
      if (result.error) toast.error(result.error);
    });
  }

  const translatedWords = wordCount(textTranslated);

  return (
    <div
      className={`bg-background space-y-3 rounded-md border p-4 ${
        isInFlight ? "ring-primary/40 ring-2" : ""
      }`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-mono tabular-nums">
          #{part.part_number}
        </Badge>
        <Input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          onBlur={handleSaveLabel}
          className="h-7 max-w-[220px] text-sm"
        />
        <Badge variant={badge.variant}>{badge.label}</Badge>
        {part.last_provider_used ? (
          <span className="text-muted-foreground text-xs">
            {part.last_provider_used}
            {part.last_model_used ? ` · ${part.last_model_used}` : ""}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={isFirst || movingPending}
            onClick={() => handleMove("up")}
            aria-label="Move up"
          >
            ↑
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={isLast || movingPending}
            onClick={() => handleMove("down")}
            aria-label="Move down"
          >
            ↓
          </Button>
        </div>
      </div>

      {effectiveError ? (
        <p className="text-destructive border-destructive/40 bg-destructive/5 rounded-md border px-3 py-2 text-xs">
          {effectiveError}
        </p>
      ) : null}

      {/* Two columns: original | translated */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <div className="text-muted-foreground flex items-center justify-between text-xs">
            <span>Original ({part.word_count_original} words)</span>
            {editingOriginal ? (
              <button
                type="button"
                onClick={handleSaveOriginal}
                disabled={savingMeta}
                className="text-primary text-xs hover:underline"
              >
                Save
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setEditingOriginal(true)}
                className="text-xs hover:underline"
              >
                Edit
              </button>
            )}
          </div>
          {editingOriginal ? (
            <Textarea
              value={textOriginal}
              onChange={(event) => setTextOriginal(event.target.value)}
              className="h-96 max-h-96 min-h-48 resize-y overflow-y-auto font-mono text-xs"
            />
          ) : (
            <div className="bg-muted/20 h-96 overflow-y-auto rounded-md border p-3 font-mono text-xs whitespace-pre-wrap">
              {textOriginal || <span className="text-muted-foreground italic">(empty)</span>}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <div className="text-muted-foreground flex items-center justify-between text-xs">
            <span>Translation ({translatedWords} words)</span>
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
            className="h-96 max-h-96 min-h-48 resize-y overflow-y-auto font-mono text-xs"
          />
        </div>
      </div>

      {/* Actions row */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => onTranslate(part.id)}
          disabled={queueRunning || effectiveStatus === "translating"}
        >
          {part.text_translated ? "Re-translate" : "Translate"}
        </Button>
        <VersionHistoryDialog partId={part.id} versions={part.versions} />
        <div className="ml-auto">
          <DeleteConfirmDialog
            title={`Delete part ${part.part_number}?`}
            description="Removes this part and its translation history. Other parts are renumbered to stay sequential."
            triggerLabel="Delete part"
            onConfirm={() => deleteStoryPart(part.id)}
            successMessage="Part deleted."
          />
        </div>
      </div>
    </div>
  );
}
