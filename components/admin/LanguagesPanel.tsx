"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { setLanguageActive } from "@/lib/actions/languages";
import { LanguageFormDialog, type LanguageRow } from "./LanguageFormDialog";

interface LanguagesPanelProps {
  languages: ReadonlyArray<LanguageRow>;
}

export function LanguagesPanel({ languages }: LanguagesPanelProps) {
  const [editing, setEditing] = useState<LanguageRow | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Languages</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Editable list; deactivate to hide from new stories. Languages can be edited but
            not deleted — soft delete is the only removal.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} className="w-full sm:w-auto">
          New language
        </Button>
      </header>

      <div className="bg-background rounded-md border">
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Code</TableHead>
              <TableHead>English</TableHead>
              <TableHead>Native</TableHead>
              <TableHead className="w-20 text-center">Dir</TableHead>
              <TableHead>Reading font</TableHead>
              <TableHead className="text-right">Order</TableHead>
              <TableHead className="w-20 text-center">Active</TableHead>
              <TableHead className="w-20 text-right">Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {languages.map((row) => (
              <LanguageTableRow key={row.code} row={row} onEdit={() => setEditing(row)} />
            ))}
          </TableBody>
        </Table>
      </div>

      <LanguageFormDialog open={creating} onOpenChange={setCreating} initialValue={null} />
      <LanguageFormDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        initialValue={editing}
      />
    </div>
  );
}

interface LanguageTableRowProps {
  row: LanguageRow;
  onEdit: () => void;
}

function LanguageTableRow({ row, onEdit }: LanguageTableRowProps) {
  const [pending, startTransition] = useTransition();

  function handleToggle(next: boolean) {
    startTransition(async () => {
      try {
        await setLanguageActive(row.code, next);
        toast.success(next ? "Activated." : "Deactivated.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update.");
      }
    });
  }

  return (
    <TableRow>
      <TableCell>
        <code className="text-xs">{row.code}</code>
      </TableCell>
      <TableCell className="font-medium">{row.name_english}</TableCell>
      <TableCell style={{ fontFamily: row.font_family_reading ?? undefined }}>
        {row.name_native}
      </TableCell>
      <TableCell className="text-center">
        <Badge variant={row.direction === "rtl" ? "outline" : "secondary"} className="uppercase">
          {row.direction}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground max-w-[280px] truncate font-mono text-xs" title={row.font_family_reading ?? ""}>
        {row.font_family_reading ?? "—"}
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
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Edit
        </Button>
      </TableCell>
    </TableRow>
  );
}
