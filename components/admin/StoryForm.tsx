"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { createStory } from "@/lib/actions/stories";
import { INITIAL_STORY_FORM_STATE, type StoryFormState } from "@/lib/actions/stories.types";
import { COMPLEXITY_LEVELS } from "@/lib/ai/complexity";
import type { ProviderMeta } from "@/lib/ai/registry";
import { wordCount } from "@/lib/utils/word-count";
import { BulkImportDialog } from "./BulkImportDialog";
import { ImageUploadField } from "./ImageUploadField";

export interface CategoryWithSubsOption {
  id: string;
  name: string;
  subcategories: ReadonlyArray<{ id: string; name: string }>;
}

export interface ToneOption {
  id: string;
  name: string;
  language_code: string;
}

export interface LanguageOption {
  code: string;
  name_english: string;
}

interface StoryFormProps {
  categories: ReadonlyArray<CategoryWithSubsOption>;
  languages: ReadonlyArray<LanguageOption>;
  tones: ReadonlyArray<ToneOption>;
  providers: ReadonlyArray<ProviderMeta>;
  configuredProviderIds: ReadonlyArray<string>;
  defaultProvider: string;
  defaultModel: string;
}

interface DraftPart {
  uid: string;
  label: string;
  text: string;
}

let partUidCounter = 0;
const nextUid = () => `part-${++partUidCounter}`;

export function StoryForm({
  categories,
  languages,
  tones,
  providers,
  configuredProviderIds,
  defaultProvider,
  defaultModel,
}: StoryFormProps) {
  const router = useRouter();
  const [state, action] = useActionState<StoryFormState, FormData>(
    createStory,
    INITIAL_STORY_FORM_STATE,
  );

  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id ?? "");
  const [subcategoryId, setSubcategoryId] = useState<string>(
    categories[0]?.subcategories[0]?.id ?? "",
  );
  const [targetLanguage, setTargetLanguage] = useState<string>(
    languages.find((l) => l.code === "hi")?.code ?? languages[0]?.code ?? "",
  );
  const [toneId, setToneId] = useState<string>("");
  const [complexity, setComplexity] = useState<string>("standard");
  const [providerId, setProviderId] = useState<string>(defaultProvider);
  const [model, setModel] = useState<string>(defaultModel);
  const [status, setStatus] = useState<"draft" | "published">("draft");

  const [parts, setParts] = useState<DraftPart[]>(() => [
    { uid: nextUid(), label: "Part 1", text: "" },
  ]);

  // Subcategories depend on the selected category.
  const subcategoriesForCategory = useMemo(
    () => categories.find((c) => c.id === categoryId)?.subcategories ?? [],
    [categories, categoryId],
  );
  // Tones depend on the selected language.
  const tonesForLanguage = useMemo(
    () => tones.filter((t) => t.language_code === targetLanguage),
    [tones, targetLanguage],
  );

  // React-19 "adjust state during render" pattern: when the parent (category
  // or language) changes such that the child selection is no longer valid,
  // reset the child here, NOT in a useEffect. See:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
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
  // Also seed toneId once if it's still empty after the initial render
  // (initial state for toneId was "" until we knew the available tones).
  if (toneId === "" && tonesForLanguage.length > 0) {
    setToneId(tonesForLanguage[0].id);
  }

  // When provider changes, reset model to the provider's default.
  function handleProviderChange(next: string) {
    setProviderId(next);
    const meta = providers.find((p) => p.id === next);
    if (meta) setModel(meta.defaultModel);
  }
  const selectedProvider = providers.find((p) => p.id === providerId);

  // After successful create: redirect to the edit page so the admin can
  // translate the parts they just entered.
  useEffect(() => {
    if (state.createdStoryId) {
      toast.success("Story created.");
      router.push(`/admin/stories/${state.createdStoryId}`);
    }
  }, [state.createdStoryId, router]);

  function addPart() {
    setParts((prev) => [...prev, { uid: nextUid(), label: `Part ${prev.length + 1}`, text: "" }]);
  }
  function removePart(uid: string) {
    setParts((prev) => prev.filter((p) => p.uid !== uid));
  }
  function updatePart(uid: string, patch: Partial<DraftPart>) {
    setParts((prev) => prev.map((p) => (p.uid === uid ? { ...p, ...patch } : p)));
  }
  function handleBulkImport(imported: Array<{ label: string; text: string }>) {
    setParts(imported.map((p) => ({ uid: nextUid(), ...p })));
    toast.success(`Imported ${imported.length} part${imported.length === 1 ? "" : "s"}.`);
  }

  const totalWords = parts.reduce((sum, p) => sum + wordCount(p.text), 0);

  return (
    <form action={action} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Story metadata</CardTitle>
          <CardDescription>
            Translation target + provider. You can override per-part after creation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title (original language)</Label>
            <Input id="title" name="title_original" required autoFocus />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="author">Author (original, optional)</Label>
              <Input id="author" name="author_original" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="source">Source URL (optional)</Label>
              <Input id="source" name="source_url" type="url" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cat">Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="cat">
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
              <Label htmlFor="sub">Subcategory</Label>
              <Select value={subcategoryId} onValueChange={setSubcategoryId}>
                <SelectTrigger id="sub">
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="lang">Target language</Label>
              <Select value={targetLanguage} onValueChange={setTargetLanguage}>
                <SelectTrigger id="lang">
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
              <Label htmlFor="tone">Tone</Label>
              <Select value={toneId} onValueChange={setToneId}>
                <SelectTrigger id="tone">
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
              <Label htmlFor="complexity">Complexity</Label>
              <Select value={complexity} onValueChange={setComplexity}>
                <SelectTrigger id="complexity">
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="provider">AI provider</Label>
              <Select value={providerId} onValueChange={handleProviderChange}>
                <SelectTrigger id="provider">
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
              <Label htmlFor="model">Model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger id="model">
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
            <Label htmlFor="custom">Custom instructions (optional)</Label>
            <Textarea
              id="custom"
              name="custom_instructions"
              rows={2}
              placeholder="Extra guidance for this story (e.g., 'Keep proper nouns in the Roman script.')"
            />
          </div>

          <ImageUploadField name="cover_image_url" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Parts</CardTitle>
            <CardDescription>
              Enter each part in its own field, or paste a separated dump. Total: {totalWords}{" "}
              word{totalWords === 1 ? "" : "s"}.
            </CardDescription>
          </div>
          <BulkImportDialog onImport={handleBulkImport} />
        </CardHeader>
        <CardContent className="space-y-4">
          {parts.map((part, idx) => (
            <div key={part.uid} className="bg-background space-y-2 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Label htmlFor={`label-${part.uid}`} className="text-xs">
                  #{idx + 1}
                </Label>
                <Input
                  id={`label-${part.uid}`}
                  name={`parts[${idx}].label`}
                  value={part.label}
                  onChange={(event) => updatePart(part.uid, { label: event.target.value })}
                  className="h-8 text-sm"
                />
                <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                  {wordCount(part.text)} words
                </span>
                {parts.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="text-destructive"
                    onClick={() => removePart(part.uid)}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              <Textarea
                name={`parts[${idx}].text`}
                rows={4}
                value={part.text}
                onChange={(event) => updatePart(part.uid, { text: event.target.value })}
                placeholder="Original-language text for this part. Paragraphs separated by blank lines are preserved."
                className="font-mono text-xs sm:min-h-40"
              />
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" onClick={addPart}>
            + Add part
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Save</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex items-center gap-3">
              <Label className="text-xs">Initial status:</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as "draft" | "published")}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
              <input type="hidden" name="status" value={status} />
            </div>
            <p className="text-muted-foreground text-xs">
              Drafts are not visible to readers. You can publish after translating.
            </p>
          </div>

          {state.error ? (
            <p
              role="alert"
              className="text-destructive border-destructive/40 bg-destructive/5 rounded-md border px-3 py-2 text-sm"
            >
              {state.error}
            </p>
          ) : null}

          <div className="flex justify-end">
            <SaveButton />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Create story"}
    </Button>
  );
}
