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
import { Textarea } from "@/components/ui/textarea";
import {
  INITIAL_CATEGORY_FORM_STATE,
  saveCategory,
  type CategoryFormState,
} from "@/lib/actions/categories";
import { toSlug } from "@/lib/utils/slug";

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  icon_emoji: string | null;
  description: string | null;
  display_order: number;
}

interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValue: CategoryRow | null;
}

export function CategoryFormDialog({ open, onOpenChange, initialValue }: CategoryFormDialogProps) {
  const isEdit = initialValue !== null;
  const [state, action] = useActionState<CategoryFormState, FormData>(
    saveCategory,
    INITIAL_CATEGORY_FORM_STATE,
  );

  // Auto-fill slug from name unless the user has edited slug manually.
  const [name, setName] = useState(initialValue?.name ?? "");
  const [slug, setSlug] = useState(initialValue?.slug ?? "");
  const [slugDirty, setSlugDirty] = useState(initialValue !== null);

  // React-19-idiomatic "reset state on prop change" — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  // Fires when the dialog opens, or when the target row changes while open.
  const signature = open ? `open:${initialValue?.id ?? "new"}` : "closed";
  const [prevSignature, setPrevSignature] = useState(signature);
  if (signature !== prevSignature) {
    setPrevSignature(signature);
    if (open) {
      setName(initialValue?.name ?? "");
      setSlug(initialValue?.slug ?? "");
      setSlugDirty(initialValue !== null);
    }
  }

  // Close the dialog and toast on every successful save.
  useEffect(() => {
    if (state.success && state.savedAt > 0) {
      toast.success(isEdit ? "Category updated." : "Category created.");
      onOpenChange(false);
    }
  }, [state.savedAt, state.success, isEdit, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit category" : "New category"}</DialogTitle>
          <DialogDescription>
            Categories are the top level of navigation. The slug is used in URLs.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-4">
          {isEdit ? <input type="hidden" name="id" value={initialValue.id} /> : null}

          <div className="space-y-2">
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
              name="name"
              required
              autoFocus
              value={name}
              onChange={(event) => {
                const next = event.target.value;
                setName(next);
                if (!slugDirty) setSlug(toSlug(next));
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cat-slug">Slug</Label>
            <Input
              id="cat-slug"
              name="slug"
              required
              value={slug}
              onChange={(event) => {
                setSlug(event.target.value);
                setSlugDirty(true);
              }}
              placeholder="auto-from-name"
            />
            <p className="text-muted-foreground text-xs">Lowercase, digits, hyphens.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cat-icon">Icon (emoji)</Label>
              <Input
                id="cat-icon"
                name="icon_emoji"
                defaultValue={initialValue?.icon_emoji ?? ""}
                maxLength={4}
                placeholder="📖"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-order">Display order</Label>
              <Input
                id="cat-order"
                name="display_order"
                type="number"
                defaultValue={initialValue?.display_order ?? 0}
                step={1}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cat-desc">Description</Label>
            <Textarea
              id="cat-desc"
              name="description"
              defaultValue={initialValue?.description ?? ""}
              rows={2}
              placeholder="Optional — shown on the category landing page."
            />
          </div>

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
