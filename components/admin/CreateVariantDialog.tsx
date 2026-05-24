"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createVariantFromForm } from "@/lib/actions/story-variants";
import { INITIAL_VARIANT_FORM_STATE } from "@/lib/actions/story-variants.types";
import { COMPLEXITY_LEVELS } from "@/lib/ai/complexity";
import type { ProviderMeta } from "@/lib/ai/registry";
import type { LanguageOption, ToneOption } from "./StoryForm";

interface CreateVariantDialogProps {
  storyId: string;
  /** Existing variant keys so we can disable already-used (language, tone) combos. */
  existingPairs: ReadonlyArray<{ target_language: string; tone_id: string }>;
  languages: ReadonlyArray<LanguageOption>;
  tones: ReadonlyArray<ToneOption>;
  providers: ReadonlyArray<ProviderMeta>;
  configuredProviderIds: ReadonlyArray<string>;
  defaultProvider: string;
  defaultModel: string;
  /** Hide the "Set as primary" switch (e.g. when there are no other variants). */
  canSetPrimary: boolean;
}

/**
 * Dialog form to add a new variant to an existing story. Picks language +
 * tone + complexity + optional provider/model + translated title, then
 * inserts the variant and seeds pending translation rows for every part.
 */
export function CreateVariantDialog({
  storyId,
  existingPairs,
  languages,
  tones,
  providers,
  configuredProviderIds,
  defaultProvider,
  defaultModel,
  canSetPrimary,
}: CreateVariantDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createVariantFromForm, INITIAL_VARIANT_FORM_STATE);

  const [targetLanguage, setTargetLanguage] = useState<string>(languages[0]?.code ?? "");
  const [toneId, setToneId] = useState<string>("");
  const [complexity, setComplexity] = useState<string>("standard");
  const [providerId, setProviderId] = useState<string>(defaultProvider);
  const [model, setModel] = useState<string>(defaultModel);

  const tonesForLanguage = useMemo(
    () =>
      tones
        .filter((t) => t.language_code === targetLanguage)
        .filter(
          (t) =>
            !existingPairs.some(
              (pair) => pair.target_language === targetLanguage && pair.tone_id === t.id,
            ),
        ),
    [tones, targetLanguage, existingPairs],
  );

  // Cascade: when the language changes, pick a valid tone (first available).
  const [prevLanguage, setPrevLanguage] = useState(targetLanguage);
  if (targetLanguage !== prevLanguage) {
    setPrevLanguage(targetLanguage);
    if (!tonesForLanguage.some((t) => t.id === toneId)) {
      setToneId(tonesForLanguage[0]?.id ?? "");
    }
  }
  // Reset when dialog opens.
  const signature = open ? "open" : "closed";
  const [prevSignature, setPrevSignature] = useState(signature);
  if (signature !== prevSignature) {
    setPrevSignature(signature);
    if (open) {
      setTargetLanguage(languages[0]?.code ?? "");
      setToneId("");
      setComplexity("standard");
      setProviderId(defaultProvider);
      setModel(defaultModel);
    }
  }

  const selectedProvider = providers.find((p) => p.id === providerId);
  function handleProviderChange(next: string) {
    setProviderId(next);
    const meta = providers.find((p) => p.id === next);
    if (meta) setModel(meta.defaultModel);
  }

  useEffect(() => {
    if (state.savedAt > 0 && !state.error && state.createdVariantId) {
      toast.success("Variant created. Translation queue is ready to run.");
      // Defer setState to a microtask so it isn't synchronous within the
      // effect body (react-hooks/set-state-in-effect lint rule).
      Promise.resolve().then(() => {
        setOpen(false);
        router.refresh();
      });
    }
  }, [state.savedAt, state.error, state.createdVariantId, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">+ Add variant</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add translation variant</DialogTitle>
          <DialogDescription>
            Each variant is one (language × tone) combination. Pending translation rows are
            created for every existing part — you can run the queue right after.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-4">
          <input type="hidden" name="story_id" value={storyId} />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cv-lang">Target language</Label>
              <Select value={targetLanguage} onValueChange={setTargetLanguage}>
                <SelectTrigger id="cv-lang">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.name_english}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="target_language" value={targetLanguage} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cv-tone">Tone</Label>
              <Select value={toneId} onValueChange={setToneId}>
                <SelectTrigger id="cv-tone">
                  <SelectValue placeholder="Pick a tone…" />
                </SelectTrigger>
                <SelectContent>
                  {tonesForLanguage.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      No available tones for this language
                    </SelectItem>
                  ) : (
                    tonesForLanguage.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <input type="hidden" name="tone_id" value={toneId} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cv-title-tx">Translated title (optional)</Label>
            <Input id="cv-title-tx" name="title_translated" placeholder="Auto-fillable later" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cv-complexity">Complexity</Label>
              <Select value={complexity} onValueChange={setComplexity}>
                <SelectTrigger id="cv-complexity">
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
              <input type="hidden" name="complexity" value={complexity} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cv-provider">AI provider</Label>
              <Select value={providerId} onValueChange={handleProviderChange}>
                <SelectTrigger id="cv-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => {
                    const configured = configuredProviderIds.includes(p.id);
                    return (
                      <SelectItem key={p.id} value={p.id} disabled={!configured}>
                        {p.name}
                        {configured ? "" : ` · missing ${p.envKey}`}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <input type="hidden" name="ai_provider" value={providerId} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cv-model">Model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger id="cv-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(selectedProvider?.models ?? []).map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="ai_model" value={model} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cv-custom">Custom instructions (optional)</Label>
            <Textarea id="cv-custom" name="custom_instructions" rows={2} />
          </div>

          {canSetPrimary ? (
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="cv-primary" className="text-sm">
                  Make this the primary variant
                </Label>
                <p className="text-muted-foreground text-xs">
                  The primary variant is shown first on the story landing page.
                </p>
              </div>
              <Switch id="cv-primary" name="make_primary" />
            </div>
          ) : (
            // First variant always becomes primary on the server. Hidden flag.
            <input type="hidden" name="make_primary" value="on" />
          )}

          {state.error ? (
            <p
              role="alert"
              className="text-destructive border-destructive/40 bg-destructive/5 rounded-md border px-3 py-2 text-sm"
            >
              {state.error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SaveButton disabled={!toneId} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SaveButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? "Creating…" : "Create variant"}
    </Button>
  );
}
