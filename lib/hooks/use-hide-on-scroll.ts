"use client";

import { useEffect, useState } from "react";

/**
 * Returns `true` while the page is being scrolled *down* past `threshold`px,
 * and `false` near the top or while scrolling *up*. Used to slide the top
 * navbar out of view on scroll-down and reveal it again on scroll-up.
 *
 * The hook is self-contained (it reads `window.scrollY` directly), so multiple
 * components — the navbar and the home filter bar — can call it independently
 * and stay perfectly in sync without any shared state or context.
 */
export function useHideOnScroll(threshold = 72): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;

    function update() {
      const y = window.scrollY;
      if (y < threshold) {
        // Always reveal near the top of the page.
        setHidden(false);
      } else if (Math.abs(y - lastY) > 4) {
        // Ignore sub-pixel jitter; hide on down, reveal on up.
        setHidden(y > lastY);
      }
      lastY = y;
      ticking = false;
    }

    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return hidden;
}
