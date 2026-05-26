"use client";

import { useState, useTransition } from "react";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface DeleteConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel?: string;
  triggerLabel?: string;
  onConfirm: () => Promise<{ error?: string | null } | void>;
  successMessage?: string;
  /** Tooltip on the trigger. Defaults to the title. */
  triggerTooltip?: string;
}

/**
 * Shared destructive-action confirmation. Renders an outline "Delete" button
 * with a trash icon (matches the admin CTA convention) that opens an
 * AlertDialog; on confirm, calls the provided server action and surfaces
 * success/error via sonner.
 *
 * The action receiver is responsible for revalidatePath() so the table
 * re-renders without the row.
 */
export function DeleteConfirmDialog({
  title,
  description,
  confirmLabel = "Delete",
  triggerLabel = "Delete",
  onConfirm,
  successMessage = "Deleted.",
  triggerTooltip,
}: DeleteConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await onConfirm();
      if (result && "error" in result && result.error) {
        toast.error(result.error);
      } else {
        toast.success(successMessage);
        setOpen(false);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive hover:border-destructive/40 h-8 gap-1.5"
          title={triggerTooltip ?? title}
        >
          <Trash2Icon className="size-3.5" aria-hidden />
          {triggerLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              handleConfirm();
            }}
          >
            {pending ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
