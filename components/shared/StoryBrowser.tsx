"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StoryCardData } from "@/components/shared/StoryCard";
import { createClient } from "@/lib/supabase/client";
import { useHideOnScroll } from "@/lib/hooks/use-hide-on-scroll";
import { fetchStoryCards, type StoryCardFilter } from "@/lib/reader/story-cards";
import { getLastRead, type LastRead } from "@/lib/reader/progress";
import { languageFontStyle } from "@/lib/i18n/fonts";
import { thumbnailUrl } from "@/lib/imagekit/url";
import { toTitleCase } from "@/lib/utils/title-case";
import { cn } from "@/lib/utils/cn";

export interface FilterSubcategory {
  id: string;
  slug: string;
  name: string;
}

export interface FilterCategory {
  slug: string;
  name: string;
  subcategories: FilterSubcategory[];
}

export interface FilterLanguage {
  code: string;
  name_english: string;
}

interface StoryBrowserProps {
  categories: FilterCategory[];
  languages: FilterLanguage[];
  /** Server-rendered first page so the grid paints without a client round-trip. */
  initialStories: StoryCardData[];
  initialHasMore: boolean;
}

type Layout = "grid" | "list";

const ALL = "__all__";

/**
 * Home-page story browser: a sticky filter bar (category → subcategory →
 * language) + a grid/list layout toggle over an infinite-scroll list. Page 0
 * is server-rendered; subsequent pages and every filter change are fetched
 * client-side via the anon Supabase client (RLS-gated to published content).
 */
export function StoryBrowser({
  categories,
  languages,
  initialStories,
  initialHasMore,
}: StoryBrowserProps) {
  const [layout, setLayout] = useState<Layout>("grid");

  // Mirror the navbar's scroll behaviour: when the navbar slides away, the
  // filter bar slides up to fill the gap so it stays pinned at the very top.
  const navHidden = useHideOnScroll();

  // The reader's last-read pointer (localStorage) lets us badge the matching
  // card with a "Resume" deep link, in place of a separate Continue-reading
  // section. Read on mount and deferred to a microtask so React 19's
  // set-state-in-effect lint stays happy (same trick as ContinueReading did).
  const [lastRead, setLastRead] = useState<LastRead | null>(null);
  useEffect(() => {
    const stored = getLastRead();
    if (stored) Promise.resolve().then(() => setLastRead(stored));
  }, []);

  const [categorySlug, setCategorySlug] = useState<string>(ALL);
  const [subcategoryId, setSubcategoryId] = useState<string>(ALL);
  const [language, setLanguage] = useState<string>(ALL);

  const [stories, setStories] = useState<StoryCardData[]>(initialStories);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);

  const supabase = useMemo(() => createClient(), []);
  // Guards against out-of-order responses when filters change mid-flight.
  const requestRef = useRef(0);

  const activeCategory = useMemo(
    () => categories.find((c) => c.slug === categorySlug) ?? null,
    [categories, categorySlug],
  );

  const filter = useMemo<StoryCardFilter>(() => {
    let subcategoryIds: string[] | null = null;
    if (subcategoryId !== ALL) {
      subcategoryIds = [subcategoryId];
    } else if (activeCategory) {
      subcategoryIds = activeCategory.subcategories.map((s) => s.id);
    }
    return {
      subcategoryIds,
      language: language === ALL ? null : language,
    };
  }, [activeCategory, subcategoryId, language]);

  // Whether the current filter state differs from the server-rendered default.
  const isFiltered =
    categorySlug !== ALL || subcategoryId !== ALL || language !== ALL;

  // Refetch page 0 whenever the filter changes. Skip the very first run so we
  // keep the server-rendered initial stories.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const reqId = ++requestRef.current;
    setLoading(true);
    fetchStoryCards(supabase, { filter, page: 0 })
      .then(({ cards, hasMore: more }) => {
        if (reqId !== requestRef.current) return;
        setStories(cards);
        setPage(0);
        setHasMore(more);
      })
      .catch(() => {
        if (reqId !== requestRef.current) return;
        setStories([]);
        setHasMore(false);
      })
      .finally(() => {
        if (reqId === requestRef.current) setLoading(false);
      });
  }, [supabase, filter]);

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    const reqId = requestRef.current;
    const next = page + 1;
    setLoading(true);
    fetchStoryCards(supabase, { filter, page: next })
      .then(({ cards, hasMore: more }) => {
        // Drop the response if a filter change superseded this request.
        if (reqId !== requestRef.current) return;
        setStories((prev) => [...prev, ...cards]);
        setPage(next);
        setHasMore(more);
      })
      .catch(() => {
        if (reqId === requestRef.current) setHasMore(false);
      })
      .finally(() => {
        if (reqId === requestRef.current) setLoading(false);
      });
  }, [supabase, filter, page, hasMore, loading]);

  // Infinite scroll: load the next page when the sentinel scrolls into view.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore]);

  function handleCategoryChange(value: string) {
    setCategorySlug(value);
    setSubcategoryId(ALL); // subcategories are scoped to the chosen category
  }

  return (
    <section aria-labelledby="browse" className="space-y-4">
      <h2 id="browse" className="sr-only">
        Browse stories
      </h2>

      {/* Filter bar — pinned below the 56px navbar, or at the very top once the
          navbar scrolls away. On mobile it's a fixed 2-column grid (Category /
          Subcategory on row 1; Language / layout-toggle on row 2); on sm+ it
          collapses to a single inline row with the toggle pushed right. */}
      <div
        className={cn(
          "bg-background/80 supports-[backdrop-filter]:bg-background/65 sticky z-20 -mx-4 grid grid-cols-2 items-center gap-2 border-b px-4 py-3 backdrop-blur-md transition-[top] duration-300 ease-out sm:flex sm:flex-wrap",
          navHidden ? "top-0" : "top-14",
        )}
      >
        <Select value={categorySlug} onValueChange={handleCategoryChange}>
          <SelectTrigger
            size="sm"
            className="w-full sm:w-auto"
            aria-label="Filter by category"
          >
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.slug} value={c.slug}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={subcategoryId}
          onValueChange={setSubcategoryId}
          disabled={!activeCategory || activeCategory.subcategories.length === 0}
        >
          <SelectTrigger
            size="sm"
            className="w-full sm:w-auto"
            aria-label="Filter by subcategory"
          >
            <SelectValue placeholder="Subcategory" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All subcategories</SelectItem>
            {(activeCategory?.subcategories ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger
            size="sm"
            className="w-full sm:w-auto"
            aria-label="Filter by language"
          >
            <SelectValue placeholder="Language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All languages</SelectItem>
            {languages.map((l) => (
              <SelectItem key={l.code} value={l.code}>
                {l.name_english}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Grid / list toggle */}
        <div className="flex shrink-0 items-center gap-1 justify-self-end rounded-md border p-0.5 sm:ml-auto sm:justify-self-auto">
          <LayoutButton
            active={layout === "grid"}
            label="Grid view"
            onClick={() => setLayout("grid")}
          >
            <GridIcon />
          </LayoutButton>
          <LayoutButton
            active={layout === "list"}
            label="List view"
            onClick={() => setLayout("list")}
          >
            <ListIcon />
          </LayoutButton>
        </div>
      </div>

      {/* Results */}
      {stories.length === 0 && !loading ? (
        <p className="text-muted-foreground py-12 text-center text-sm">
          {isFiltered
            ? "No stories match these filters."
            : "No stories yet — check back soon."}
        </p>
      ) : layout === "grid" ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {stories.map((story) => (
            <li key={story.id}>
              <GridItem
                story={story}
                resume={lastRead?.storyId === story.id ? lastRead : null}
              />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="divide-border divide-y rounded-lg border">
          {stories.map((story) => (
            <li key={story.id}>
              <ListItem
                story={story}
                resume={lastRead?.storyId === story.id ? lastRead : null}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Infinite-scroll sentinel + status */}
      <div ref={sentinelRef} aria-hidden className="h-px w-full" />
      {loading ? (
        <p className="text-muted-foreground py-4 text-center text-xs">Loading…</p>
      ) : !hasMore && stories.length > 0 ? (
        <p className="text-muted-foreground py-4 text-center text-xs">
          You&rsquo;ve reached the end.
        </p>
      ) : null}
    </section>
  );
}

function titleFor(story: StoryCardData) {
  return toTitleCase(story.title_translated ?? story.title_original);
}

function readingLabel(story: StoryCardData) {
  return story.estimated_reading_minutes
    ? `${story.estimated_reading_minutes} min read`
    : null;
}

/** Deep-link to where the reader left off, else the story landing. */
function storyHref(story: StoryCardData, resume: LastRead | null) {
  return resume
    ? `/s/${story.id}/${resume.variantSlug}/p/${resume.partNumber}`
    : `/s/${story.id}`;
}

/** Prominent "Continue" chip — marks the card the reader last left off in. */
function ResumeBadge({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "bg-brand text-brand-foreground inline-flex items-center justify-center gap-1 font-bold uppercase shadow-md ring-1 ring-black/15",
        compact
          ? "size-5 rounded-full"
          : "rounded-full px-2.5 py-1 text-[11px] tracking-wide",
        className,
      )}
    >
      <PlayIcon />
      {compact ? null : "Continue"}
    </span>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3 shrink-0" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function GridItem({ story, resume }: { story: StoryCardData; resume: LastRead | null }) {
  const cover = thumbnailUrl(story.cover_image_url);
  const fontStyle = languageFontStyle(
    {
      font_family: story.language_font_family,
      font_family_reading: story.language_font_family_reading,
    },
    "reading",
  );
  const reading = readingLabel(story);

  return (
    <Link
      href={storyHref(story, resume)}
      className="group focus-visible:ring-ring block rounded-lg focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <div className="bg-muted/40 relative aspect-[3/2] w-full overflow-hidden rounded-lg border">
        {cover ? (
          <Image
            src={cover}
            alt=""
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            unoptimized
          />
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
            no cover
          </div>
        )}
        {resume ? <ResumeBadge className="absolute top-2 right-2 z-10" /> : null}
      </div>
      <div className="space-y-0.5 px-0.5 pt-2">
        <h3
          className="text-foreground line-clamp-2 text-sm leading-snug font-medium"
          style={fontStyle}
        >
          {titleFor(story)}
        </h3>
        {reading ? (
          <p className="text-muted-foreground text-xs">{reading}</p>
        ) : null}
      </div>
    </Link>
  );
}

function ListItem({ story, resume }: { story: StoryCardData; resume: LastRead | null }) {
  const cover = thumbnailUrl(story.cover_image_url);
  const fontStyle = languageFontStyle(
    {
      font_family: story.language_font_family,
      font_family_reading: story.language_font_family_reading,
    },
    "reading",
  );
  const reading = readingLabel(story);

  return (
    <Link
      href={storyHref(story, resume)}
      className="hover:bg-muted/40 focus-visible:ring-ring flex items-center gap-3 p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <div className="bg-muted/40 relative aspect-[3/2] w-20 shrink-0 overflow-hidden rounded border">
        {cover ? (
          <Image
            src={cover}
            alt=""
            fill
            sizes="80px"
            className="object-cover"
            unoptimized
          />
        ) : null}
        {resume ? <ResumeBadge compact className="absolute top-1 right-1 z-10" /> : null}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="min-w-0 space-y-0.5">
          <h3
            className="text-foreground line-clamp-1 text-sm font-medium"
            style={fontStyle}
          >
            {titleFor(story)}
          </h3>
          {reading ? (
            <p className="text-muted-foreground text-xs">{reading}</p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function LayoutButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-md transition-colors",
        active
          ? "bg-brand text-brand-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}
