"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { Trash2Icon } from "lucide-react";
import { getVocab, removeWord, subscribeVocab, type VocabEntry } from "@/lib/reader/vocab";
import { formatDateTime } from "@/lib/utils/format-datetime";

/**
 * /my-words — every word the reader has saved from a [DefinitionPopover].
 *
 * Pure client-rendered. Vocab lives in localStorage (`qissa:vocab`); we
 * subscribe via `useSyncExternalStore` so deleting a word here updates the
 * count in real time and any open popover flips its save state across tabs.
 *
 * Each entry deep-links back to the page where it was saved (if context
 * was captured) and the corresponding Wiktionary entry.
 */
export default function MyWordsPage() {
  const vocab = useSyncExternalStore(subscribeVocab, getVocab, getVocab);

  // Sort newest first so what the reader just saved is right at the top.
  const entries = useMemo(
    () => [...vocab].sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
    [vocab],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">My words</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Words you tapped in the reader and saved for later. {vocab.length}{" "}
          {vocab.length === 1 ? "word" : "words"} on this device.
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Tap a word while reading and hit the bookmark icon in the popover to save it. Your saved
          words will appear here.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {entries.map((entry) => (
            <VocabRow key={`${entry.languageCode}:${entry.word}`} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}

function VocabRow({ entry }: { entry: VocabEntry }) {
  const wiktionaryHref = `https://en.wiktionary.org/wiki/${encodeURIComponent(entry.word)}`;
  const readerHref =
    entry.storyId && entry.variantSlug && entry.partNumber
      ? `/s/${entry.storyId}/${entry.variantSlug}/p/${entry.partNumber}`
      : null;

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium" dir="auto">
          {entry.word}
        </p>
        <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
          <span className="uppercase tracking-wide">{entry.languageCode}</span>
          <span>·</span>
          <time dateTime={entry.savedAt} title={entry.savedAt}>
            {formatDateTime(entry.savedAt)}
          </time>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <a
            href={wiktionaryHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            Open in Wiktionary
          </a>
          {readerHref ? (
            <Link href={readerHref} className="text-primary underline">
              Back to the reader
            </Link>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={() => removeWord(entry.word, entry.languageCode)}
        aria-label={`Remove ${entry.word}`}
        className="text-muted-foreground hover:bg-muted hover:text-destructive shrink-0 rounded p-2"
      >
        <Trash2Icon className="size-4" />
      </button>
    </li>
  );
}
