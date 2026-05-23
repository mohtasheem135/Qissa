"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface ShareButtonProps {
  title: string;
  url?: string; // defaults to window.location.href
}

/**
 * Uses the native Web Share API when available, falls back to copying
 * the URL to the clipboard. No-op on the server.
 */
export function ShareButton({ title, url }: ShareButtonProps) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const shareUrl = url ?? (typeof window !== "undefined" ? window.location.href : "");
      if (!shareUrl) return;
      try {
        const nav = typeof navigator !== "undefined" ? navigator : undefined;
        if (nav?.share) {
          await nav.share({ title, url: shareUrl });
          return;
        }
        if (nav?.clipboard) {
          await nav.clipboard.writeText(shareUrl);
          toast.success("Link copied to clipboard.");
        }
      } catch (err) {
        const e = err as { name?: string };
        if (e?.name === "AbortError") return; // user dismissed sheet
        toast.error("Could not share. Copy the URL manually.");
      }
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={handleClick}
      disabled={pending}
      aria-label="Share"
    >
      <svg
        viewBox="0 0 24 24"
        width={18}
        height={18}
        aria-hidden
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
        <polyline points="16 6 12 2 8 6" />
        <line x1="12" y1="2" x2="12" y2="15" />
      </svg>
    </Button>
  );
}
