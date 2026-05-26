"use client";

import Link from "next/link";
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
import { deleteCategory, setCategoryActive } from "@/lib/actions/categories";
import { CategoryFormDialog, type CategoryRow } from "./CategoryFormDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";

interface CategoryWithCounts extends CategoryRow {
  is_active: boolean;
  subcategory_count: number;
}

interface CategoriesPanelProps {
  categories: ReadonlyArray<CategoryWithCounts>;
}

export function CategoriesPanel({ categories }: CategoriesPanelProps) {
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Top-level navigation. Click a row to manage its subcategories.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} className="w-full sm:w-auto">
          New category
        </Button>
      </header>

      <div className="bg-background rounded-md border">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Icon</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead className="text-right">Subcategories</TableHead>
              <TableHead className="text-right">Order</TableHead>
              <TableHead className="w-20 text-center">Active</TableHead>
              <TableHead className="w-40 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-8 text-center text-sm">
                  No categories yet. Create your first one.
                </TableCell>
              </TableRow>
            ) : (
              categories.map((row) => (
                <CategoryTableRow
                  key={row.id}
                  row={row}
                  onEdit={() => setEditing(row)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CategoryFormDialog open={creating} onOpenChange={setCreating} initialValue={null} />
      <CategoryFormDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        initialValue={editing}
      />
    </div>
  );
}

interface CategoryTableRowProps {
  row: CategoryWithCounts;
  onEdit: () => void;
}

function CategoryTableRow({ row, onEdit }: CategoryTableRowProps) {
  const [pending, startTransition] = useTransition();

  function handleToggleActive(next: boolean) {
    startTransition(async () => {
      try {
        await setCategoryActive(row.id, next);
        toast.success(next ? "Activated." : "Deactivated.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update.");
      }
    });
  }

  return (
    <TableRow data-inactive={!row.is_active ? "" : undefined}>
      <TableCell className="text-xl">{row.icon_emoji ?? "—"}</TableCell>
      <TableCell>
        <Link href={`/admin/categories/${row.id}`} className="font-medium hover:underline">
          {row.name}
        </Link>
        {row.description ? (
          <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">{row.description}</p>
        ) : null}
      </TableCell>
      <TableCell>
        <code className="text-muted-foreground text-xs">{row.slug}</code>
      </TableCell>
      <TableCell className="text-right tabular-nums">{row.subcategory_count}</TableCell>
      <TableCell className="text-right tabular-nums">{row.display_order}</TableCell>
      <TableCell className="text-center">
        <Switch
          checked={row.is_active}
          onCheckedChange={handleToggleActive}
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
            description="This deactivates the category and hides it from readers. Subcategories and stories under it are not removed."
            onConfirm={() => deleteCategory(row.id)}
            successMessage="Category deleted."
          />
        </div>
      </TableCell>
    </TableRow>
  );
}
