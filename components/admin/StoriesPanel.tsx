"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState, useTransition } from "react";
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
import { deleteStory, setStoryPublished } from "@/lib/actions/stories";
import { coverUrl } from "@/lib/imagekit/url";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";

export interface StoryVariantSummary {
  id: string;
  target_language: string;
  language_name_english: string;
  tone_name: string;
  status: "draft" | "published";
}

export interface StoryRow {
  id: string;
  title_original: string;
  cover_image_url: string | null;
  status: "draft" | "published";
  total_parts: number;
  updated_at: string;
  subcategory_name: string;
  category_name: string;
  variants: ReadonlyArray<StoryVariantSummary>;
}

interface FilterOption {
  value: string;
  label: string;
}

interface StoriesPanelProps {
  stories: ReadonlyArray<StoryRow>;
  languageOptions: ReadonlyArray<FilterOption>;
}

const STATUS_OPTIONS: ReadonlyArray<FilterOption> = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
];

export function StoriesPanel({ stories, languageOptions }: StoriesPanelProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [languageFilter, setLanguageFilter] = useState("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stories.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (
        languageFilter !== "all" &&
        !row.variants.some((v) => v.target_language === languageFilter)
      ) {
        return false;
      }
      if (q) {
        const haystack = `${row.title_original} ${row.variants
          .map((v) => v.language_name_english + " " + v.tone_name)
          .join(" ")}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [stories, search, statusFilter, languageFilter]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stories</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {stories.length} total · {stories.filter((s) => s.status === "published").length} published
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/stories/new">New story</Link>
        </Button>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="story-search" className="text-muted-foreground text-xs">
            Search title / variant
          </label>
          <Input
            id="story-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="…"
            className="w-64"
          />
        </div>
        <div className="space-y-1">
          <label className="text-muted-foreground text-xs">Status</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-muted-foreground text-xs">Has variant in</label>
          <Select value={languageFilter} onValueChange={setLanguageFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All languages</SelectItem>
              {languageOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-background rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Cover</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Subcategory</TableHead>
              <TableHead>Variants</TableHead>
              <TableHead className="text-right">Parts</TableHead>
              <TableHead className="w-24 text-center">Status</TableHead>
              <TableHead className="w-44 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-12 text-center text-sm">
                  {stories.length === 0
                    ? "No stories yet — create your first."
                    : "No stories match the current filters."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => <StoryTableRow key={row.id} row={row} />)
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function StoryTableRow({ row }: { row: StoryRow }) {
  const [pending, startTransition] = useTransition();

  function handleTogglePublished() {
    const next = row.status !== "published";
    startTransition(async () => {
      try {
        await setStoryPublished(row.id, next);
        toast.success(next ? "Published." : "Unpublished.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update.");
      }
    });
  }

  const thumbSrc = coverUrl(row.cover_image_url, "w-80,h-80,c-maintain_ratio");
  const publishedVariants = row.variants.filter((v) => v.status === "published").length;

  return (
    <TableRow>
      <TableCell>
        {thumbSrc ? (
          <Image
            src={thumbSrc}
            alt=""
            width={48}
            height={48}
            className="rounded object-cover"
            unoptimized
          />
        ) : (
          <div className="bg-muted text-muted-foreground flex h-12 w-12 items-center justify-center rounded text-xs">
            —
          </div>
        )}
      </TableCell>
      <TableCell>
        <Link
          href={`/admin/stories/${row.id}`}
          className="block font-medium hover:underline"
        >
          {row.title_original}
        </Link>
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">
        {row.category_name} → {row.subcategory_name}
      </TableCell>
      <TableCell>
        {row.variants.length === 0 ? (
          <span className="text-muted-foreground text-xs italic">none</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.variants.slice(0, 3).map((v) => (
              <Badge
                key={v.id}
                variant={v.status === "published" ? "default" : "outline"}
                className="text-[10px]"
                title={`${v.language_name_english} · ${v.tone_name} · ${v.status}`}
              >
                {v.language_name_english} · {v.tone_name}
              </Badge>
            ))}
            {row.variants.length > 3 ? (
              <Badge variant="secondary" className="text-[10px]">
                +{row.variants.length - 3}
              </Badge>
            ) : null}
            <span className="text-muted-foreground self-center text-[10px]">
              {publishedVariants}/{row.variants.length} pub
            </span>
          </div>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">{row.total_parts}</TableCell>
      <TableCell className="text-center">
        <Badge variant={row.status === "published" ? "default" : "outline"}>{row.status}</Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={handleTogglePublished} disabled={pending}>
            {row.status === "published" ? "Unpublish" : "Publish"}
          </Button>
          <DeleteConfirmDialog
            title={`Delete "${row.title_original}"?`}
            description="The story (and all variants) is hidden from readers. Translations are preserved."
            onConfirm={() => deleteStory(row.id)}
            successMessage="Story deleted."
          />
        </div>
      </TableCell>
    </TableRow>
  );
}
