"use client";

import { useRef } from "react";

/**
 * Small circular button rendered in the start margin of every paragraph.
 *
 * - Subtle (18% opacity) until hover (desktop) or always faintly visible
 *   (mobile). Saved highlights show it at full opacity in their colour —
 *   reader can see at-a-glance where they have highlights on the page.
 * - Tapping it computes the paragraph's bounding rect and notifies the
 *   parent ([ReaderBody]), which opens [HighlightMenu] anchored to that
 *   rect.
 * - `stopPropagation` so the click never bubbles to the article-level
 *   tap-to-define handler.
 *
 * Styling lives in [app/globals.css] under `.reader-paragraph .highlight-handle`
 * + `.reader-paragraph[data-highlight="…"] .highlight-handle` so the colour
 * stays in sync with the paragraph's `data-highlight` attribute.
 */
export function HighlightHandle({
  paragraphIndex,
  onOpen,
}: {
  paragraphIndex: number;
  onOpen: (paragraphIndex: number, rect: DOMRect) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const node = buttonRef.current;
    if (!node) return;
    onOpen(paragraphIndex, node.getBoundingClientRect());
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleClick}
      aria-label="Highlight this paragraph"
      // Empty by default so the saved-colour CSS rule sets a background;
      // otherwise the unsaved state is a translucent foreground dot.
      className="highlight-handle absolute -inset-y-0 size-2.5 self-start rounded-full bg-current text-current"
      // `inset-inline-start: -1.5rem` pulls it into the article's px-5/sm:px-8
      // padding margin without overlapping the prose. Logical property so it
      // flips automatically in RTL.
      style={{ insetInlineStart: "-1.25rem", top: "0.55em" }}
    />
  );
}
