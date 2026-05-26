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
import { saveSubcategory } from "@/lib/actions/subcategories";
import {
  INITIAL_SUBCATEGORY_FORM_STATE,
  type SubcategoryFormState,
} from "@/lib/actions/subcategories.types";
import { toSlug } from "@/lib/utils/slug";

export interface SubcategoryRow {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  icon_emoji: string | null;
  description: string | null;
  display_order: number;
}

interface SubcategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  initialValue: SubcategoryRow | null;
}

export function SubcategoryFormDialog({
  open,
  onOpenChange,
  categoryId,
  initialValue,
}: SubcategoryFormDialogProps) {
  const isEdit = initialValue !== null;
  const [state, action] = useActionState<SubcategoryFormState, FormData>(
    saveSubcategory,
    INITIAL_SUBCATEGORY_FORM_STATE,
  );

  const [name, setName] = useState(initialValue?.name ?? "");
  const [slug, setSlug] = useState(initialValue?.slug ?? "");
  const [slugDirty, setSlugDirty] = useState(initialValue !== null);

  // Reset on open / target-row change. React 19 "adjust state during render" pattern.
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

  useEffect(() => {
    if (state.success && state.savedAt > 0) {
      toast.success(isEdit ? "Subcategory updated." : "Subcategory created.");
      onOpenChange(false);
    }
  }, [state.savedAt, state.success, isEdit, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit subcategory" : "New subcategory"}</DialogTitle>
          <DialogDescription>
            Subcategories must be unique within their parent category.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-4">
          <input type="hidden" name="category_id" value={categoryId} />
          {isEdit ? <input type="hidden" name="id" value={initialValue.id} /> : null}

          <div className="space-y-2">
            <Label htmlFor="sub-name">Name</Label>
            <Input
              id="sub-name"
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
            <Label htmlFor="sub-slug">Slug</Label>
            <Input
              id="sub-slug"
              name="slug"
              required
              value={slug}
              onChange={(event) => {
                setSlug(event.target.value);
                setSlugDirty(true);
              }}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sub-icon">Icon (emoji)</Label>
              <Input
                id="sub-icon"
                name="icon_emoji"
                defaultValue={initialValue?.icon_emoji ?? ""}
                maxLength={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sub-order">Display order</Label>
              <Input
                id="sub-order"
                name="display_order"
                type="number"
                defaultValue={initialValue?.display_order ?? 0}
                step={1}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sub-desc">Description</Label>
            <Textarea
              id="sub-desc"
              name="description"
              defaultValue={initialValue?.description ?? ""}
              rows={2}
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
