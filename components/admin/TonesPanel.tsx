"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteTone, setToneActive } from "@/lib/actions/tones";
import { ToneFormDialog, type ToneRow, type LanguageOption } from "./ToneFormDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";

const ALL = "all";

interface TonesPanelProps {
  tones: ReadonlyArray<ToneRow>;
  languages: ReadonlyArray<LanguageOption>;
}

export function TonesPanel({ tones, languages }: TonesPanelProps) {
  const [filter, setFilter] = useState<string>(ALL);
  const [editing, setEditing] = useState<ToneRow | null>(null);
  const [creating, setCreating] = useState(false);

  const filteredTones = useMemo(() => {
    if (filter === ALL) return tones;
    return tones.filter((t) => t.language_code === filter);
  }, [tones, filter]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tones</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Writer-style presets per language. The prompt fragment is the most important field —
            iterate on it to tune translations.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="tone-filter" className="text-muted-foreground text-xs">
              Filter
            </label>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger id="tone-filter" className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All languages</SelectItem>
                {languages.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.name_english}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => setCreating(true)}>New tone</Button>
        </div>
      </header>

      <div className="bg-background rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Language</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-20 text-center">Active</TableHead>
              <TableHead className="w-40 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTones.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-8 text-center text-sm">
                  No tones for this language. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              filteredTones.map((row) => (
                <ToneTableRow
                  key={row.id}
                  row={row}
                  languages={languages}
                  onEdit={() => setEditing(row)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ToneFormDialog
        open={creating}
        onOpenChange={setCreating}
        languages={languages}
        defaultLanguageCode={filter === ALL ? null : filter}
        initialValue={null}
      />
      <ToneFormDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        languages={languages}
        defaultLanguageCode={null}
        initialValue={editing}
      />
    </div>
  );
}

interface ToneTableRowProps {
  row: ToneRow;
  languages: ReadonlyArray<LanguageOption>;
  onEdit: () => void;
}

function ToneTableRow({ row, languages, onEdit }: ToneTableRowProps) {
  const [pending, startTransition] = useTransition();
  const langName = languages.find((l) => l.code === row.language_code)?.name_english ?? row.language_code;

  function handleToggle(next: boolean) {
    startTransition(async () => {
      try {
        await setToneActive(row.id, next);
        toast.success(next ? "Activated." : "Deactivated.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update.");
      }
    });
  }

  return (
    <TableRow>
      <TableCell>
        <Badge variant="secondary">{langName}</Badge>
      </TableCell>
      <TableCell>
        <div className="font-medium">{row.name}</div>
        {row.display_name ? (
          <p className="text-muted-foreground mt-0.5 text-xs">{row.display_name}</p>
        ) : null}
      </TableCell>
      <TableCell className="text-muted-foreground max-w-md text-sm">
        <p className="line-clamp-2">{row.description ?? row.prompt_fragment}</p>
      </TableCell>
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
            title={`Delete tone "${row.name}"?`}
            description="This deactivates the tone and hides it from new stories. Existing stories using it are unaffected."
            onConfirm={() => deleteTone(row.id)}
            successMessage="Tone deleted."
          />
        </div>
      </TableCell>
    </TableRow>
  );
}
