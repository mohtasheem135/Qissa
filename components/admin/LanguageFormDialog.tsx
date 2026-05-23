"use client";

import { useActionState, useEffect } from "react";
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
import { saveLanguage } from "@/lib/actions/languages";
import {
  INITIAL_LANGUAGE_FORM_STATE,
  type LanguageFormState,
} from "@/lib/actions/languages.types";

export interface LanguageRow {
  code: string;
  name_english: string;
  name_native: string;
  direction: string;
  font_family: string | null;
  font_family_reading: string | null;
  display_order: number;
  is_active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValue: LanguageRow | null;
}

export function LanguageFormDialog({ open, onOpenChange, initialValue }: Props) {
  const isEdit = initialValue !== null;
  const [state, action] = useActionState<LanguageFormState, FormData>(
    saveLanguage,
    INITIAL_LANGUAGE_FORM_STATE,
  );

  useEffect(() => {
    if (state.success && state.savedAt > 0) {
      toast.success(isEdit ? "Language updated." : "Language created.");
      onOpenChange(false);
    }
  }, [state.savedAt, state.success, isEdit, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit language" : "New language"}</DialogTitle>
          <DialogDescription>
            Adding a language requires its code, native name, and font stacks.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-4">
          {isEdit ? <input type="hidden" name="original_code" value={initialValue.code} /> : null}

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="lang-code">Code</Label>
              <Input
                id="lang-code"
                name="code"
                required
                placeholder="hi"
                defaultValue={initialValue?.code ?? ""}
                autoFocus={!isEdit}
                pattern="[a-z]{2,3}(-[a-z]{2,4})?"
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label htmlFor="lang-en">English name</Label>
              <Input
                id="lang-en"
                name="name_english"
                required
                placeholder="Hindi"
                defaultValue={initialValue?.name_english ?? ""}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2 col-span-2">
              <Label htmlFor="lang-native">Native name</Label>
              <Input
                id="lang-native"
                name="name_native"
                required
                placeholder="हिन्दी"
                defaultValue={initialValue?.name_native ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lang-direction">Direction</Label>
              <Select name="direction" defaultValue={initialValue?.direction ?? "ltr"}>
                <SelectTrigger id="lang-direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ltr">LTR</SelectItem>
                  <SelectItem value="rtl">RTL</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lang-font">Font family (UI / sans)</Label>
            <Input
              id="lang-font"
              name="font_family"
              defaultValue={initialValue?.font_family ?? ""}
              placeholder='"Noto Sans Devanagari", system-ui, sans-serif'
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lang-font-reading">Font family (reader / serif)</Label>
            <Input
              id="lang-font-reading"
              name="font_family_reading"
              defaultValue={initialValue?.font_family_reading ?? ""}
              placeholder='"Tiro Devanagari Hindi", "Noto Serif Devanagari", serif'
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lang-order">Display order</Label>
            <Input
              id="lang-order"
              name="display_order"
              type="number"
              defaultValue={initialValue?.display_order ?? 0}
              step={1}
              className="max-w-32"
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
