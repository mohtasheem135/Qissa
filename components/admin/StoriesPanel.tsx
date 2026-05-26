"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState, useTransition } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
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
import { setStoryPublished } from "@/lib/actions/stories";
import { coverUrl } from "@/lib/imagekit/url";
import { toTitleCase } from "@/lib/utils/title-case";
import { Truncate } from "@/components/shared/Truncate";

export interface StoryVariantSummary {
  id: string;
  target_language: string;
  language_name_english: string;
  tone_name: string;
  status: "draft" | "published";
  is_primary?: boolean;
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

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
const DEFAULT_PAGE_SIZE = 20;

export function StoriesPanel({ stories, languageOptions }: StoriesPanelProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);

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
        const haystack = `${toTitleCase(row.title_original)} ${row.variants
          .map((v) => v.language_name_english + " " + v.tone_name)
          .join(" ")}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [stories, search, statusFilter, languageFilter]);

  // React-19 "adjust state during render" pattern: when filters change the
  // result set can shrink under the current page; reset to page 1 by detecting
  // a signature change instead of a useEffect.
  const filterSignature = `${search}|${statusFilter}|${languageFilter}|${pageSize}`;
  const [prevFilterSignature, setPrevFilterSignature] = useState(filterSignature);
  if (filterSignature !== prevFilterSignature) {
    setPrevFilterSignature(filterSignature);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const paginated = filtered.slice(pageStart, pageStart + pageSize);
  const rangeFrom = filtered.length === 0 ? 0 : pageStart + 1;
  const rangeTo = pageStart + paginated.length;

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

      <div className="bg-background overflow-hidden rounded-md border">
        <Table className="w-full table-fixed" containerClassName="overflow-x-hidden">
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Cover</TableHead>
              <TableHead className="w-[30%]">Title</TableHead>
              <TableHead className="w-[22%]">Subcategory</TableHead>
              <TableHead className="w-32">Variants</TableHead>
              <TableHead className="w-16 text-right">Parts</TableHead>
              <TableHead className="w-24 text-center">Status</TableHead>
              <TableHead className="w-36 text-right">Actions</TableHead>
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
              paginated.map((row) => <StoryTableRow key={row.id} row={row} />)
            )}
          </TableBody>
        </Table>
      </div>

      {filtered.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground tabular-nums">
            Showing <strong>{rangeFrom}</strong>–<strong>{rangeTo}</strong> of{" "}
            <strong>{filtered.length}</strong>
            {filtered.length !== stories.length ? ` (filtered from ${stories.length})` : ""}
          </p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">Per page</span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => setPageSize(Number(value))}
              >
                <SelectTrigger className="h-8 w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Prev
              </Button>
              <span className="text-muted-foreground px-2 text-xs tabular-nums">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      ) : null}
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
      <TableCell className="min-w-0">
        <Link
          href={`/admin/stories/${row.id}`}
          className="block font-medium hover:underline"
        >
          <Truncate text={toTitleCase(row.title_original)} />
        </Link>
      </TableCell>
      <TableCell className="text-muted-foreground min-w-0 text-xs">
        <Truncate text={`${row.category_name} → ${row.subcategory_name}`} />
      </TableCell>
      <TableCell>
        <VariantSummaryCell variants={row.variants} publishedCount={publishedVariants} />
      </TableCell>
      <TableCell className="text-right tabular-nums">{row.total_parts}</TableCell>
      <TableCell className="text-center">
        <Badge variant={row.status === "published" ? "default" : "outline"}>{row.status}</Badge>
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="outline"
          size="sm"
          onClick={handleTogglePublished}
          disabled={pending}
          className="h-8 gap-1.5"
          title={row.status === "published" ? "Hide from readers" : "Make visible to readers"}
        >
          {row.status === "published" ? (
            <>
              <EyeOffIcon className="size-3.5" aria-hidden />
              Unpublish
            </>
          ) : (
            <>
              <EyeIcon className="size-3.5" aria-hidden />
              Publish
            </>
          )}
        </Button>
      </TableCell>
    </TableRow>
  );
}

/**
 * Compact variants cell: a single badge showing the total variant count plus a
 * `published/total` subline. The native tooltip lists the per-language /
 * per-tone breakdown so a 5-language story doesn't blow up the row width.
 */
function VariantSummaryCell({
  variants,
  publishedCount,
}: {
  variants: ReadonlyArray<StoryVariantSummary>;
  publishedCount: number;
}) {
  if (variants.length === 0) {
    return <span className="text-muted-foreground text-xs italic">none</span>;
  }

  const tooltip = variants
    .map((v) => {
      const star = v.is_primary ? " ★" : "";
      const pub = v.status === "published" ? "" : " (draft)";
      return `${v.language_name_english} · ${v.tone_name}${star}${pub}`;
    })
    .join("\n");

  return (
    <div className="flex flex-col gap-0.5" title={tooltip}>
      <Badge
        variant={publishedCount > 0 ? "default" : "outline"}
        className="w-fit text-[10px] font-normal tabular-nums"
      >
        {variants.length} variant{variants.length === 1 ? "" : "s"}
      </Badge>
      <span className="text-muted-foreground text-[10px] tabular-nums">
        {publishedCount}/{variants.length} published
      </span>
    </div>
  );
}
