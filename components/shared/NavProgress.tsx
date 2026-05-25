"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Thin top-of-viewport progress bar. Fires on every pathname / query
 * change — covers `<Link>` clicks, `router.push`, and form submits alike.
 *
 * Self-gated to the public, non-reader routes via the parent
 * `PublicShell`. Inside the reader the bar would clash with the
 * theme-tinted chrome, so it's only mounted outside of it.
 */
export function NavProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);
  const lastKeyRef = useRef<string>(`${pathname}?${search}`);

  const startProgress = useCallback(() => {
    if (finishTimerRef.current) {
      clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    startTimeRef.current = performance.now();
    setVisible(true);
    setProgress(0.08);

    const tick = (now: number) => {
      const elapsed = now - startTimeRef.current;
      // Ease toward 0.85 over ~700ms, then idle until commit.
      const eased = 0.85 * (1 - Math.exp(-elapsed / 300));
      setProgress((current) => (eased > current ? eased : current));
      if (eased < 0.84) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const finishProgress = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setVisible(true);
    setProgress(1);
    finishTimerRef.current = setTimeout(() => {
      setVisible(false);
      // Reset for the next nav after the fade-out.
      resetTimerRef.current = setTimeout(() => setProgress(0), 180);
    }, 180);
  }, []);

  // Start on click of any in-app link. We hook document-level so we don't
  // need to wrap every Link.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = (event.target as HTMLElement | null)?.closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (target.target && target.target !== "_self") return;
      try {
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname && url.search === window.location.search) {
          return;
        }
      } catch {
        return;
      }
      startProgress();
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [startProgress]);

  // Whenever the pathname/search actually changes, finish the bar.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      lastKeyRef.current = `${pathname}?${search}`;
      return;
    }
    const key = `${pathname}?${search}`;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    finishProgress();
  }, [pathname, search, finishProgress]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 180ms ease" }}
    >
      <div
        className="bg-primary h-full origin-left"
        style={{
          width: `${Math.min(100, Math.max(0, progress * 100))}%`,
          transition: "width 180ms ease",
        }}
      />
    </div>
  );
}
