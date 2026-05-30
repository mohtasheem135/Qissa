"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { Trash2Icon } from "lucide-react";
import {
  getHighlights,
  removeHighlight,
  subscribeHighlights,
  type Highlight,
  type HighlightColour,
} from "@/lib/reader/highlights";
import { formatDateTime } from "@/lib/utils/format-datetime";
import { cn } from "@/lib/utils/cn";

/**
 * /highlights — every paragraph the reader has highlighted from the reader.
 *
 * Pure client-rendered. Highlights live in `qissa:highlights` localStorage;
 * subscribing via `useSyncExternalStore` keeps the count + list live across
 * tabs and reflects deletes done from here.
 *
 * Each row deep-links back to the exact paragraph using `#h-<paragraphIndex>`
 * — [ReaderBody] picks up that hash on mount and `scrollIntoView`-s the
 * matching `[data-paragraph]` element to viewport centre.
 */
export default function HighlightsPage() {
  const highlights = useSyncExternalStore(
    subscribeHighlights,
    getHighlights,
    getHighlights,
  );

  // Newest first.
  const entries = useMemo(
    () => [...highlights].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [highlights],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Highlights</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Passages you highlighted while reading. {highlights.length}{" "}
          {highlights.length === 1 ? "highlight" : "highlights"} on this device.
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Select any text while reading, then pick a colour to highlight it. Your highlights
          will appear here.
        </p>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <HighlightRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}

const COLOUR_STYLES: Record<HighlightColour, string> = {
  yellow: "bg-[rgba(245,200,50,0.22)]",
  green: "bg-[rgba(120,200,130,0.2)]",
  blue: "bg-[rgba(110,165,235,0.22)]",
};

const COLOUR_DOT: Record<HighlightColour, string> = {
  yellow: "bg-[rgb(225,175,40)]",
  green: "bg-[rgb(95,175,110)]",
  blue: "bg-[rgb(90,145,215)]",
};

function HighlightRow({ entry }: { entry: Highlight }) {
  const deepLink = `/s/${entry.storyId}/${entry.variantSlug}/p/${entry.partNumber}#h-${entry.paragraphIndex}`;
  return (
    <li
      className={cn(
        "group rounded-lg border p-3",
        COLOUR_STYLES[entry.colour],
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", COLOUR_DOT[entry.colour])}
        />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-foreground text-sm leading-snug" dir="auto">
            &ldquo;{entry.snippet}&rdquo;
          </p>
          {entry.note ? (
            <p className="text-muted-foreground text-xs italic" dir="auto">
              {entry.note}
            </p>
          ) : null}
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span>Part {entry.partNumber}</span>
            <span>·</span>
            <time dateTime={entry.createdAt} title={entry.createdAt}>
              {formatDateTime(entry.createdAt)}
            </time>
            <Link href={deepLink} className="text-primary ms-auto underline">
              Back to the paragraph
            </Link>
          </div>
        </div>
        <button
          type="button"
          onClick={() => removeHighlight(entry.id)}
          aria-label="Remove highlight"
          className="text-muted-foreground hover:bg-muted hover:text-destructive shrink-0 rounded p-2 opacity-60 transition-opacity group-hover:opacity-100"
        >
          <Trash2Icon className="size-4" />
        </button>
      </div>
    </li>
  );
}
