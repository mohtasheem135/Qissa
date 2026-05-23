"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Per-segment error boundary for the public area. Catches uncaught
 * exceptions thrown during render of any /(public) page.
 */
export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaces in the dev console; in production this is where you'd
    // wire Sentry / your error reporter of choice.
    console.error("Public route error:", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-destructive mb-3 text-xs tracking-widest uppercase">Error</p>
      <h1 className="text-3xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-muted-foreground mt-3 text-sm">
        {error.message || "An unexpected error happened. Try again, or go back home."}
      </p>
      {error.digest ? (
        <p className="text-muted-foreground/70 mt-2 font-mono text-[11px]">
          ref: {error.digest}
        </p>
      ) : null}
      <div className="mt-8 flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </main>
  );
}
