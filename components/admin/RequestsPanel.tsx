"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Textarea } from "@/components/ui/textarea";
import {
  deleteRequest,
  linkFulfillingVariant,
  updateRequestAdminNote,
  updateRequestStatus,
} from "@/lib/actions/story-requests";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";

const STATUSES = ["open", "planned", "in_progress", "fulfilled", "declined"] as const;
type RequestStatus = (typeof STATUSES)[number];

export interface RequestRow {
  id: string;
  type: "new_story" | "new_variant";
  story_id: string | null;
  story_title_original: string | null;
  requested_title: string | null;
  requested_author: string | null;
  target_language: string | null;
  language_name_english: string | null;
  tone_name: string | null;
  votes: number;
  status: RequestStatus;
  requester_email: string | null;
  fulfilled_variant_id: string | null;
  fulfilled_variant_label: string | null;
  admin_notes: string | null;
  created_at: string;
}

interface RequestsPanelProps {
  requests: ReadonlyArray<RequestRow>;
}

export function RequestsPanel({ requests }: RequestsPanelProps) {
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter === "active") {
        if (r.status === "fulfilled" || r.status === "declined") return false;
      } else if (statusFilter !== "all" && r.status !== statusFilter) {
        return false;
      }
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (q) {
        const haystack = [
          r.story_title_original,
          r.requested_title,
          r.requested_author,
          r.language_name_english,
          r.tone_name,
          r.requester_email,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [requests, statusFilter, typeFilter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { open: 0, planned: 0, in_progress: 0, fulfilled: 0, declined: 0 };
    for (const r of requests) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [requests]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Requests</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {requests.length} total · {counts.open} open · {counts.planned} planned ·{" "}
            {counts.in_progress} in progress
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="req-search" className="text-muted-foreground text-xs">
            Search
          </label>
          <Input
            id="req-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="title, language, email…"
            className="w-64"
          />
        </div>
        <div className="space-y-1">
          <label className="text-muted-foreground text-xs">Status</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active (open + planned + in progress)</SelectItem>
              <SelectItem value="all">All</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-muted-foreground text-xs">Type</label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="new_story">New story</SelectItem>
              <SelectItem value="new_variant">New variant</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-background rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Request</TableHead>
              <TableHead>Language · Tone</TableHead>
              <TableHead className="text-right">Votes</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-12 text-center text-sm">
                  No requests match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => <RequestTableRow key={row.id} row={row} />)
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function RequestTableRow({ row }: { row: RequestRow }) {
  const [pending, startTransition] = useTransition();
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState(row.admin_notes ?? "");

  function handleStatus(next: RequestStatus) {
    startTransition(async () => {
      try {
        await updateRequestStatus(row.id, next);
        toast.success(`Marked ${next.replace("_", " ")}.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed.");
      }
    });
  }

  function handleSaveNotes() {
    startTransition(async () => {
      try {
        await updateRequestAdminNote(row.id, notes);
        toast.success("Notes saved.");
        setNotesOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed.");
      }
    });
  }

  function handleUnlink() {
    startTransition(async () => {
      try {
        await linkFulfillingVariant(row.id, null);
        toast.success("Variant unlinked.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed.");
      }
    });
  }

  const requestLabel = row.type === "new_variant"
    ? row.story_title_original ?? "(unknown story)"
    : row.requested_title ?? "(no title)";

  return (
    <>
      <TableRow>
        <TableCell>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="outline" className="text-[10px]">
                {row.type === "new_variant" ? "variant" : "new story"}
              </Badge>
              <span className="font-medium">{requestLabel}</span>
            </div>
            {row.requested_author ? (
              <p className="text-muted-foreground text-xs">by {row.requested_author}</p>
            ) : null}
            {row.story_id ? (
              <Link
                href={`/admin/stories/${row.story_id}`}
                className="text-muted-foreground text-xs hover:underline"
              >
                → open story
              </Link>
            ) : null}
            {row.admin_notes ? (
              <p className="text-muted-foreground text-xs italic">note: {row.admin_notes}</p>
            ) : null}
          </div>
        </TableCell>
        <TableCell className="text-muted-foreground text-xs">
          {row.language_name_english ?? "—"}
          {row.tone_name ? ` · ${row.tone_name}` : ""}
        </TableCell>
        <TableCell className="text-right tabular-nums">{row.votes}</TableCell>
        <TableCell>
          <Select value={row.status} onValueChange={(v) => handleStatus(v as RequestStatus)} disabled={pending}>
            <SelectTrigger size="sm" className="w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {row.fulfilled_variant_label ? (
            <p className="text-muted-foreground mt-1 text-[10px]">
              → {row.fulfilled_variant_label}
              <button
                type="button"
                onClick={handleUnlink}
                className="ml-1 hover:underline"
              >
                unlink
              </button>
            </p>
          ) : null}
        </TableCell>
        <TableCell className="text-muted-foreground text-xs">
          {row.requester_email ?? <em>anon</em>}
        </TableCell>
        <TableCell className="text-muted-foreground text-xs">
          {new Date(row.created_at).toLocaleDateString()}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="xs" onClick={() => setNotesOpen((o) => !o)}>
              {notesOpen ? "Cancel" : "Notes"}
            </Button>
            <DeleteConfirmDialog
              title="Delete this request?"
              description="Hard delete — the request and its votes are removed."
              onConfirm={() => deleteRequest(row.id)}
              successMessage="Request deleted."
            />
          </div>
        </TableCell>
      </TableRow>
      {notesOpen ? (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/20">
            <div className="flex gap-2">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="flex-1 text-xs"
                placeholder="Triage notes — internal only."
              />
              <Button size="sm" onClick={handleSaveNotes} disabled={pending}>
                Save notes
              </Button>
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
