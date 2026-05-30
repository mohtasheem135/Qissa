"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_TARGET_WORDS, smartSplit } from "@/lib/stories/smart-split";
import { wordCount } from "@/lib/utils/word-count";

interface ParsedPart {
  label: string;
  text: string;
}

interface BulkImportDialogProps {
  triggerLabel?: string;
  onImport: (parts: ParsedPart[]) => void;
}

const DEFAULT_SEPARATOR = "---";

type ImportMode = "separator" | "auto";

export function BulkImportDialog({
  triggerLabel = "Bulk import",
  onImport,
}: BulkImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ImportMode>("separator");
  const [separator, setSeparator] = useState(DEFAULT_SEPARATOR);
  const [text, setText] = useState("");
  const [targetWords, setTargetWords] = useState(DEFAULT_TARGET_WORDS);

  const parts = useMemo<ParsedPart[]>(() => {
    if (!text.trim()) return [];
    if (mode === "auto") {
      return smartSplit(text, { targetWords: targetWords > 0 ? targetWords : DEFAULT_TARGET_WORDS });
    }
    if (!separator.trim()) return [];
    // Match the separator on its own line (most natural for prose).
    const pattern = new RegExp(
      `\\n\\s*${escapeForRegex(separator)}\\s*\\n`,
      "g",
    );
    return text
      .split(pattern)
      .map((chunk, idx) => ({
        label: `Part ${idx + 1}`,
        text: chunk.trim(),
      }))
      .filter((p) => p.text.length > 0);
  }, [mode, text, separator, targetWords]);

  function handleConfirm() {
    onImport(parts);
    setOpen(false);
    setText("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk import parts</DialogTitle>
          <DialogDescription>
            Paste the whole story and split it into parts. Confirming replaces the current
            parts list.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mode toggle */}
          <div className="bg-muted/40 inline-flex w-full rounded-md border p-0.5">
            {(["separator", "auto"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`flex-1 rounded px-2 py-1.5 text-xs transition-colors ${
                  mode === m
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "separator" ? "By separator" : "Auto-split"}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
            {mode === "separator" ? (
              <div className="space-y-2 sm:w-32">
                <Label htmlFor="bulk-sep">Separator</Label>
                <Input
                  id="bulk-sep"
                  value={separator}
                  onChange={(event) => setSeparator(event.target.value)}
                  placeholder="---"
                />
              </div>
            ) : (
              <div className="space-y-2 sm:w-44">
                <Label htmlFor="bulk-target">Target words per part</Label>
                <Input
                  id="bulk-target"
                  type="number"
                  min={50}
                  step={50}
                  value={targetWords}
                  onChange={(event) => setTargetWords(Number(event.target.value))}
                  placeholder={String(DEFAULT_TARGET_WORDS)}
                />
              </div>
            )}
            <p className="text-muted-foreground text-xs sm:pb-2">
              Detected: <strong>{parts.length}</strong> part{parts.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulk-text">Pasted text</Label>
            <Textarea
              id="bulk-text"
              rows={8}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={
                mode === "auto"
                  ? "Paste the whole story. Parts split at paragraph boundaries near your target length."
                  : "Part 1 text here…\n\n---\n\nPart 2 text here…"
              }
              className="font-mono text-xs sm:min-h-72"
            />
          </div>

          {parts.length > 0 ? (
            <div className="bg-muted/30 max-h-48 space-y-2 overflow-auto rounded-md p-3 text-xs">
              {parts.map((p, i) => (
                <div key={i}>
                  <strong>{p.label}</strong>{" "}
                  <span className="text-muted-foreground tabular-nums">
                    ({wordCount(p.text)} words):
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {p.text.slice(0, 120)}
                    {p.text.length > 120 ? "…" : ""}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={parts.length === 0} onClick={handleConfirm}>
            Use {parts.length} part{parts.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function escapeForRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
