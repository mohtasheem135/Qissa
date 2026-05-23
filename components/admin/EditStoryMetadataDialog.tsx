"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from "@/components/ui/textarea";
import { ImageUploadField } from "./ImageUploadField";
import { updateStoryFromForm } from "@/lib/actions/stories";
import {
  INITIAL_STORY_EDIT_FORM_STATE,
  type StoryEditFormState,
} from "@/lib/actions/stories.types";
import { COMPLEXITY_LEVELS } from "@/lib/ai/complexity";
import type { ProviderMeta } from "@/lib/ai/registry";
import type {
  CategoryWithSubsOption,
  LanguageOption,
  ToneOption,
} from "./StoryForm";

export interface StoryMetadataInitialValue {
  id: string;
  title_original: string;
  title_translated: string | null;
  author_original: string | null;
  source_url: string | null;
  cover_image_url: string | null;
  /** Resolved from the joined subcategory row. */
  category_id: string;
  subcategory_id: string;
  target_language: string;
  tone_id: string;
  complexity: string;
  ai_provider: string | null;
  ai_model: string | null;
  custom_instructions: string | null;
}

interface EditStoryMetadataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValue: StoryMetadataInitialValue;
  categories: ReadonlyArray<CategoryWithSubsOption>;
  languages: ReadonlyArray<LanguageOption>;
  tones: ReadonlyArray<ToneOption>;
  providers: ReadonlyArray<ProviderMeta>;
  configuredProviderIds: ReadonlyArray<string>;
}

/**
 * Editable counterpart to StoryForm — same field set minus the parts
 * entry and initial-status (Publish toggle lives in the page header).
 * Pre-fills every field from initialValue and cascades the same way
 * (category → subcategory, language → tone).
 */
export function EditStoryMetadataDialog({
  open,
  onOpenChange,
  initialValue,
  categories,
  languages,
  tones,
  providers,
  configuredProviderIds,
}: EditStoryMetadataDialogProps) {
  const [state, action] = useActionState<StoryEditFormState, FormData>(
    updateStoryFromForm,
    INITIAL_STORY_EDIT_FORM_STATE,
  );

  // Controlled state for the cascading dropdowns. Initialised from
  // initialValue and reset whenever the dialog re-opens.
  const [categoryId, setCategoryId] = useState(initialValue.category_id);
  const [subcategoryId, setSubcategoryId] = useState(initialValue.subcategory_id);
  const [targetLanguage, setTargetLanguage] = useState(initialValue.target_language);
  const [toneId, setToneId] = useState(initialValue.tone_id);
  const [complexity, setComplexity] = useState(initialValue.complexity);
  const [providerId, setProviderId] = useState(initialValue.ai_provider ?? "");
  const [model, setModel] = useState(initialValue.ai_model ?? "");

  // Reset state when the dialog opens or the target row changes.
  const signature = open ? `open:${initialValue.id}` : "closed";
  const [prevSignature, setPrevSignature] = useState(signature);
  if (signature !== prevSignature) {
    setPrevSignature(signature);
    if (open) {
      setCategoryId(initialValue.category_id);
      setSubcategoryId(initialValue.subcategory_id);
      setTargetLanguage(initialValue.target_language);
      setToneId(initialValue.tone_id);
      setComplexity(initialValue.complexity);
      setProviderId(initialValue.ai_provider ?? "");
      setModel(initialValue.ai_model ?? "");
    }
  }

  const subcategoriesForCategory = useMemo(
    () => categories.find((c) => c.id === categoryId)?.subcategories ?? [],
    [categories, categoryId],
  );
  const tonesForLanguage = useMemo(
    () => tones.filter((t) => t.language_code === targetLanguage),
    [tones, targetLanguage],
  );

  // Cascade resets (same React-19 pattern as StoryForm).
  const [prevCategoryId, setPrevCategoryId] = useState(categoryId);
  if (categoryId !== prevCategoryId) {
    setPrevCategoryId(categoryId);
    if (!subcategoriesForCategory.some((s) => s.id === subcategoryId)) {
      setSubcategoryId(subcategoriesForCategory[0]?.id ?? "");
    }
  }
  const [prevLanguage, setPrevLanguage] = useState(targetLanguage);
  if (targetLanguage !== prevLanguage) {
    setPrevLanguage(targetLanguage);
    if (!tonesForLanguage.some((t) => t.id === toneId)) {
      setToneId(tonesForLanguage[0]?.id ?? "");
    }
  }

  const selectedProvider = providers.find((p) => p.id === providerId);
  function handleProviderChange(next: string) {
    setProviderId(next);
    const meta = providers.find((p) => p.id === next);
    if (meta) setModel(meta.defaultModel);
  }

  // Close + toast on successful save.
  useEffect(() => {
    if (state.savedAt > 0 && !state.error) {
      toast.success("Story details updated.");
      onOpenChange(false);
    }
  }, [state.savedAt, state.error, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit story details</DialogTitle>
          <DialogDescription>
            Update metadata, cover image, and translation defaults. Existing translations
            aren&rsquo;t affected — only future translates use the new tone / provider.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={initialValue.id} />

          <div className="space-y-2">
            <Label htmlFor="edit-title">Title (original)</Label>
            <Input
              id="edit-title"
              name="title_original"
              required
              defaultValue={initialValue.title_original}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-title-tx">Title (translated)</Label>
            <Input
              id="edit-title-tx"
              name="title_translated"
              defaultValue={initialValue.title_translated ?? ""}
              placeholder="Auto-filled after translation — editable any time"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-author">Author (optional)</Label>
              <Input
                id="edit-author"
                name="author_original"
                defaultValue={initialValue.author_original ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-source">Source URL (optional)</Label>
              <Input
                id="edit-source"
                name="source_url"
                type="url"
                defaultValue={initialValue.source_url ?? ""}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-cat">Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="edit-cat">
                  <SelectValue placeholder="…" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-sub">Subcategory</Label>
              <Select value={subcategoryId} onValueChange={setSubcategoryId}>
                <SelectTrigger id="edit-sub">
                  <SelectValue placeholder="…" />
                </SelectTrigger>
                <SelectContent>
                  {subcategoriesForCategory.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="subcategory_id" value={subcategoryId} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-lang">Target language</Label>
              <Select value={targetLanguage} onValueChange={setTargetLanguage}>
                <SelectTrigger id="edit-lang">
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
              <Label htmlFor="edit-tone">Tone</Label>
              <Select value={toneId} onValueChange={setToneId}>
                <SelectTrigger id="edit-tone">
                  <SelectValue placeholder="Pick a tone…" />
                </SelectTrigger>
                <SelectContent>
                  {tonesForLanguage.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      No tones for this language
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
            <div className="space-y-2">
              <Label htmlFor="edit-complexity">Complexity</Label>
              <Select value={complexity} onValueChange={setComplexity}>
                <SelectTrigger id="edit-complexity">
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-provider">AI provider</Label>
              <Select value={providerId} onValueChange={handleProviderChange}>
                <SelectTrigger id="edit-provider">
                  <SelectValue placeholder="Use admin default" />
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
              <Label htmlFor="edit-model">Model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger id="edit-model">
                  <SelectValue placeholder="…" />
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
            <Label htmlFor="edit-custom">Custom instructions (optional)</Label>
            <Textarea
              id="edit-custom"
              name="custom_instructions"
              rows={2}
              defaultValue={initialValue.custom_instructions ?? ""}
            />
          </div>

          <ImageUploadField
            name="cover_image_url"
            initialUrl={initialValue.cover_image_url}
          />

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
            <SaveButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}
