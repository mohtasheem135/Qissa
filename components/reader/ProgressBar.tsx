"use client";

import { useEffect, useState } from "react";

/**
 * Thin top progress bar that tracks scroll within the current part.
 * Reads window.scrollY against document.body.scrollHeight on every
 * scroll event (passive listener), throttled implicitly by the browser.
 */
export function ProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    function compute() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const next = max > 0 ? Math.max(0, Math.min(1, window.scrollY / max)) : 0;
      setProgress(next);
    }
    compute();
    window.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5"
      style={{ backgroundColor: "color-mix(in srgb, var(--reader-accent) 18%, transparent)" }}
    >
      <div
        className="h-full transition-[width] duration-150 ease-out"
        style={{
          width: `${progress * 100}%`,
          backgroundColor: "var(--reader-accent)",
        }}
      />
    </div>
  );
}
