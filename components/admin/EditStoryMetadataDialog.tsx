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
import { ImageUploadField } from "./ImageUploadField";
import { updateStoryFromForm } from "@/lib/actions/stories";
import {
  INITIAL_STORY_EDIT_FORM_STATE,
  type StoryEditFormState,
} from "@/lib/actions/stories.types";
import type { CategoryWithSubsOption } from "./StoryForm";

export interface StoryMetadataInitialValue {
  id: string;
  title_original: string;
  author_original: string | null;
  source_url: string | null;
  cover_image_url: string | null;
  /** Resolved from the joined subcategory row. */
  category_id: string;
  subcategory_id: string;
}

interface EditStoryMetadataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValue: StoryMetadataInitialValue;
  categories: ReadonlyArray<CategoryWithSubsOption>;
}

/**
 * Edit the source-story fields: title, author, source URL, cover, category,
 * subcategory. Per-variant fields (target language, tone, provider, model,
 * complexity, custom instructions, translated title) live on each variant
 * and are edited from the Variants panel — not here.
 */
export function EditStoryMetadataDialog({
  open,
  onOpenChange,
  initialValue,
  categories,
}: EditStoryMetadataDialogProps) {
  const [state, action] = useActionState<StoryEditFormState, FormData>(
    updateStoryFromForm,
    INITIAL_STORY_EDIT_FORM_STATE,
  );

  const [categoryId, setCategoryId] = useState(initialValue.category_id);
  const [subcategoryId, setSubcategoryId] = useState(initialValue.subcategory_id);

  // Reset when dialog opens or target row changes.
  const signature = open ? `open:${initialValue.id}` : "closed";
  const [prevSignature, setPrevSignature] = useState(signature);
  if (signature !== prevSignature) {
    setPrevSignature(signature);
    if (open) {
      setCategoryId(initialValue.category_id);
      setSubcategoryId(initialValue.subcategory_id);
    }
  }

  const subcategoriesForCategory = useMemo(
    () => categories.find((c) => c.id === categoryId)?.subcategories ?? [],
    [categories, categoryId],
  );

  // Cascade: when category changes, drop subcategory to a valid one.
  const [prevCategoryId, setPrevCategoryId] = useState(categoryId);
  if (categoryId !== prevCategoryId) {
    setPrevCategoryId(categoryId);
    if (!subcategoriesForCategory.some((s) => s.id === subcategoryId)) {
      setSubcategoryId(subcategoriesForCategory[0]?.id ?? "");
    }
  }

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
            Source-level fields shared across every variant. Edit per-variant fields
            (language, tone, provider, complexity, translated title) from the Variants panel.
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
