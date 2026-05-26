"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteStoryPart, moveStoryPart, updatePartTexts } from "@/lib/actions/story-parts";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";

export interface SourcePartData {
  id: string;
  part_number: number;
  part_label: string | null;
  text_original: string;
  word_count_original: number;
}

interface SourcePartRowProps {
  part: SourcePartData;
  isFirst: boolean;
  isLast: boolean;
}

/**
 * Source-part editor — original text + label + reorder + delete. Original
 * text is shared across every variant; editing it does NOT touch any
 * translation's `status`, but it does invalidate the existing translations
 * (the admin should re-translate after a meaningful edit).
 */
export function SourcePartRow({ part, isFirst, isLast }: SourcePartRowProps) {
  const [label, setLabel] = useState(part.part_label ?? `Part ${part.part_number}`);
  const [textOriginal, setTextOriginal] = useState(part.text_original);
  const [editingOriginal, setEditingOriginal] = useState(false);
  const [savingMeta, startSavingMeta] = useTransition();
  const [movingPending, startMoving] = useTransition();

  // React-19 "adjust state during render" — keep local state in sync with prop
  // refreshes after server mutations.
  const propSignature = `${part.part_label ?? ""}${part.text_original}`;
  const [prevPropSignature, setPrevPropSignature] = useState(propSignature);
  if (propSignature !== prevPropSignature) {
    setPrevPropSignature(propSignature);
    setLabel(part.part_label ?? `Part ${part.part_number}`);
    setTextOriginal(part.text_original);
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
        toast.success("Original saved. Re-translate affected variants.");
        setEditingOriginal(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save original.");
      }
    });
  }
  function handleMove(direction: "up" | "down") {
    startMoving(async () => {
      const result = await moveStoryPart(part.id, direction);
      if (result.error) toast.error(result.error);
    });
  }

  return (
    <div className="bg-background space-y-3 rounded-md border p-4">
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
        <span className="text-muted-foreground text-xs">
          {part.word_count_original} words
        </span>
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
          <DeleteConfirmDialog
            title={`Delete part ${part.part_number}?`}
            description="Removes this part and every variant's translation of it. Remaining parts are renumbered."
            triggerLabel="Delete"
            onConfirm={() => deleteStoryPart(part.id)}
            successMessage="Part deleted."
          />
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-muted-foreground flex items-center justify-between text-xs">
          <span>Original text</span>
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
            className="h-44 max-h-96 min-h-32 resize-y overflow-y-auto font-mono text-xs sm:h-64"
          />
        ) : (
          <div className="bg-muted/20 max-h-44 overflow-y-auto rounded-md border p-3 font-mono text-xs whitespace-pre-wrap sm:max-h-64">
            {textOriginal || <span className="text-muted-foreground italic">(empty)</span>}
          </div>
        )}
      </div>
    </div>
  );
}
