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

interface ParsedPart {
  label: string;
  text: string;
}

interface BulkImportDialogProps {
  triggerLabel?: string;
  onImport: (parts: ParsedPart[]) => void;
}

const DEFAULT_SEPARATOR = "---";

export function BulkImportDialog({
  triggerLabel = "Bulk import",
  onImport,
}: BulkImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [separator, setSeparator] = useState(DEFAULT_SEPARATOR);
  const [text, setText] = useState("");

  const parts = useMemo<ParsedPart[]>(() => {
    if (!text.trim() || !separator.trim()) return [];
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
  }, [text, separator]);

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
            Paste the whole story, separated by a line containing only the separator below.
            Confirming replaces the current parts list.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
            <div className="space-y-2 sm:w-32">
              <Label htmlFor="bulk-sep">Separator</Label>
              <Input
                id="bulk-sep"
                value={separator}
                onChange={(event) => setSeparator(event.target.value)}
                placeholder="---"
              />
            </div>
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
              placeholder={"Part 1 text here…\n\n---\n\nPart 2 text here…"}
              className="font-mono text-xs sm:min-h-72"
            />
          </div>

          {parts.length > 0 ? (
            <div className="bg-muted/30 max-h-48 space-y-2 overflow-auto rounded-md p-3 text-xs">
              {parts.map((p, i) => (
                <div key={i}>
                  <strong>{p.label}:</strong>{" "}
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
