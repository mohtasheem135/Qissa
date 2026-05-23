"use client";

import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getBookmarks,
  subscribeBookmarks,
  toggleBookmark,
} from "@/lib/reader/bookmarks";
import { cn } from "@/lib/utils/cn";

interface BookmarkButtonProps {
  storyId: string;
  className?: string;
  /** Used by the story header — render the label next to the icon. */
  withLabel?: boolean;
}

/**
 * Heart toggle backed by localStorage. Re-renders across tabs via the
 * `storage` event + same-tab CustomEvent (see lib/reader/bookmarks.ts).
 *
 * Both snapshots use `getBookmarks` — on the server it short-circuits to
 * the same frozen EMPTY singleton, which is what useSyncExternalStore
 * needs (same reference until the data really changes).
 */
export function BookmarkButton({ storyId, className, withLabel = false }: BookmarkButtonProps) {
  const bookmarks = useSyncExternalStore(subscribeBookmarks, getBookmarks, getBookmarks);
  const isBookmarked = bookmarks.includes(storyId);

  function handleClick() {
    const nowBookmarked = toggleBookmark(storyId);
    toast.success(nowBookmarked ? "Bookmarked." : "Removed from bookmarks.");
  }

  return (
    <Button
      type="button"
      variant={isBookmarked ? "default" : "outline"}
      size={withLabel ? "sm" : "icon"}
      onClick={handleClick}
      aria-pressed={isBookmarked}
      aria-label={isBookmarked ? "Remove bookmark" : "Add bookmark"}
      className={cn(className)}
    >
      <HeartIcon filled={isBookmarked} />
      {withLabel ? (
        <span className="ml-2">{isBookmarked ? "Bookmarked" : "Bookmark"}</span>
      ) : null}
    </Button>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      aria-hidden
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinejoin="round"
    >
      <path d="M12 21s-7-4.35-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.65-9.5 9-9.5 9z" />
    </svg>
  );
}
