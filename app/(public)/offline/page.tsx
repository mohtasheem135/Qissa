import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Offline",
};

/**
 * The service worker serves this page when navigation fails AND the
 * requested URL isn't cached. Pre-rendered statically so it works even
 * when nothing else does.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-muted-foreground mb-3 text-xs tracking-widest uppercase">Offline</p>
      <h1 className="text-foreground text-3xl font-semibold tracking-tight">
        You&rsquo;re offline
      </h1>
      <p className="text-muted-foreground mt-3 text-sm">
        This page hasn&rsquo;t been cached yet. Stories you&rsquo;ve opened before remain
        available — try the bookmarks or recently-read list.
      </p>
      <div className="mt-8 flex gap-2">
        <Button asChild>
          <Link href="/">Home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/bookmarks">Bookmarks</Link>
        </Button>
      </div>
    </main>
  );
}
