"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { INITIAL_TONE_FORM_STATE, saveTone, type ToneFormState } from "@/lib/actions/tones";
import { COMPLEXITY_LEVELS } from "@/lib/ai/complexity";

export interface ToneRow {
  id: string;
  language_code: string;
  name: string;
  display_name: string | null;
  description: string | null;
  prompt_fragment: string;
  is_active: boolean;
}

export interface LanguageOption {
  code: string;
  name_english: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  languages: ReadonlyArray<LanguageOption>;
  defaultLanguageCode: string | null;
  initialValue: ToneRow | null;
}

export function ToneFormDialog({
  open,
  onOpenChange,
  languages,
  defaultLanguageCode,
  initialValue,
}: Props) {
  const isEdit = initialValue !== null;
  const [state, action] = useActionState<ToneFormState, FormData>(
    saveTone,
    INITIAL_TONE_FORM_STATE,
  );

  const [languageCode, setLanguageCode] = useState<string>(
    initialValue?.language_code ?? defaultLanguageCode ?? languages[0]?.code ?? "",
  );
  const [promptFragment, setPromptFragment] = useState<string>(initialValue?.prompt_fragment ?? "");
  // Preview = which complexity to splice into the example prompt. Defaults to
  // "standard" but the admin can flick through all 5 to see how the final
  // prompt comes together.
  const [previewComplexity, setPreviewComplexity] = useState<string>("standard");

  // Reset on open / target-row change. React 19 "adjust state during render" pattern.
  const signature = open ? `open:${initialValue?.id ?? "new"}` : "closed";
  const [prevSignature, setPrevSignature] = useState(signature);
  if (signature !== prevSignature) {
    setPrevSignature(signature);
    if (open) {
      setLanguageCode(
        initialValue?.language_code ?? defaultLanguageCode ?? languages[0]?.code ?? "",
      );
      setPromptFragment(initialValue?.prompt_fragment ?? "");
      setPreviewComplexity("standard");
    }
  }

  useEffect(() => {
    if (state.success && state.savedAt > 0) {
      toast.success(isEdit ? "Tone updated." : "Tone created.");
      onOpenChange(false);
    }
  }, [state.savedAt, state.success, isEdit, onOpenChange]);

  const complexity = COMPLEXITY_LEVELS.find((c) => c.key === previewComplexity);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit tone" : "New tone"}</DialogTitle>
          <DialogDescription>
            The prompt fragment is the literary brief injected into every translation. Iterate on
            it to tune output quality.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-4">
          {isEdit ? <input type="hidden" name="id" value={initialValue.id} /> : null}

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tone-lang">Language</Label>
              <Select
                name="language_code"
                value={languageCode}
                onValueChange={setLanguageCode}
                disabled={isEdit}
              >
                <SelectTrigger id="tone-lang">
                  <SelectValue placeholder="Pick…" />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name_english}{" "}
                      <span className="text-muted-foreground ml-1 text-xs">({lang.code})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Hidden mirror to ensure the value is in formData even when the
                  Select is disabled in edit mode (RHF-style Selects can drop
                  values when disabled). */}
              {isEdit ? (
                <input type="hidden" name="language_code" value={languageCode} />
              ) : null}
            </div>
            <div className="space-y-2 col-span-2">
              <Label htmlFor="tone-name">Name (internal)</Label>
              <Input
                id="tone-name"
                name="name"
                required
                placeholder="Premchand"
                defaultValue={initialValue?.name ?? ""}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tone-display">Display name (native script, optional)</Label>
            <Input
              id="tone-display"
              name="display_name"
              placeholder="मुंशी प्रेमचंद"
              defaultValue={initialValue?.display_name ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tone-desc">Description (admin-facing summary)</Label>
            <Input
              id="tone-desc"
              name="description"
              placeholder="Foundational Hindi-Urdu realist; rural Indian life, moral weight, plain diction."
              defaultValue={initialValue?.description ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tone-fragment">Prompt fragment ★</Label>
            <Textarea
              id="tone-fragment"
              name="prompt_fragment"
              required
              rows={6}
              value={promptFragment}
              onChange={(event) => setPromptFragment(event.target.value)}
              placeholder='Write in the style of … : describe rhythm, diction, vocabulary register, what to avoid.'
              className="font-mono text-sm"
            />
            <p className="text-muted-foreground text-xs">
              ~2–3 sentences. The whole prompt is built from this + a complexity fragment +
              optional custom instructions. Preview below.
            </p>
          </div>

          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">Preview final prompt</summary>
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">With complexity:</span>
                <Select value={previewComplexity} onValueChange={setPreviewComplexity}>
                  <SelectTrigger className="h-7 w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPLEXITY_LEVELS.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <pre className="bg-muted/40 text-foreground/80 max-h-64 overflow-auto rounded-md p-3 font-mono text-[11px] whitespace-pre-wrap">
{`STYLE INSTRUCTIONS:
${promptFragment || "(empty)"}

COMPLEXITY:
${complexity?.fragment ?? ""}`}
              </pre>
            </div>
          </details>

          {state.error ? (
            <p
              role="alert"
              className="text-destructive border-destructive/40 bg-destructive/5 rounded-md border px-3 py-2 text-sm"
            >
              {state.error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <SaveButton isEdit={isEdit} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SaveButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : isEdit ? "Save changes" : "Create"}
    </Button>
  );
}
