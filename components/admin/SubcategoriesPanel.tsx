"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteSubcategory, setSubcategoryActive } from "@/lib/actions/subcategories";
import { SubcategoryFormDialog, type SubcategoryRow } from "./SubcategoryFormDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";

interface SubcategoryWithMeta extends SubcategoryRow {
  is_active: boolean;
}

interface SubcategoriesPanelProps {
  categoryId: string;
  subcategories: ReadonlyArray<SubcategoryWithMeta>;
}

export function SubcategoriesPanel({ categoryId, subcategories }: SubcategoriesPanelProps) {
  const [editing, setEditing] = useState<SubcategoryRow | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-lg font-semibold">Subcategories</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Two-level navigation only — no nesting under subcategories.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>New subcategory</Button>
      </div>

      <div className="bg-background rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Icon</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead className="text-right">Order</TableHead>
              <TableHead className="w-20 text-center">Active</TableHead>
              <TableHead className="w-40 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subcategories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-8 text-center text-sm">
                  No subcategories yet.
                </TableCell>
              </TableRow>
            ) : (
              subcategories.map((row) => (
                <SubcategoryTableRow key={row.id} row={row} onEdit={() => setEditing(row)} />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <SubcategoryFormDialog
        open={creating}
        onOpenChange={setCreating}
        categoryId={categoryId}
        initialValue={null}
      />
      <SubcategoryFormDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        categoryId={categoryId}
        initialValue={editing}
      />
    </div>
  );
}

interface SubcategoryRowProps {
  row: SubcategoryWithMeta;
  onEdit: () => void;
}

function SubcategoryTableRow({ row, onEdit }: SubcategoryRowProps) {
  const [pending, startTransition] = useTransition();

  function handleToggle(next: boolean) {
    startTransition(async () => {
      try {
        await setSubcategoryActive(row.id, next);
        toast.success(next ? "Activated." : "Deactivated.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update.");
      }
    });
  }

  return (
    <TableRow>
      <TableCell className="text-xl">{row.icon_emoji ?? "—"}</TableCell>
      <TableCell>
        <div className="font-medium">{row.name}</div>
        {row.description ? (
          <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">{row.description}</p>
        ) : null}
      </TableCell>
      <TableCell>
        <code className="text-muted-foreground text-xs">{row.slug}</code>
      </TableCell>
      <TableCell className="text-right tabular-nums">{row.display_order}</TableCell>
      <TableCell className="text-center">
        <Switch
          checked={row.is_active}
          onCheckedChange={handleToggle}
          disabled={pending}
          aria-label={row.is_active ? "Deactivate" : "Activate"}
        />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <DeleteConfirmDialog
            title={`Delete "${row.name}"?`}
            description="This deactivates the subcategory and hides it from readers. Stories under it are not removed."
            onConfirm={() => deleteSubcategory(row.id)}
            successMessage="Subcategory deleted."
          />
        </div>
      </TableCell>
    </TableRow>
  );
}
