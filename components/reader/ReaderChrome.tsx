"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookmarkButton } from "@/components/shared/BookmarkButton";
import { ShareButton } from "@/components/shared/ShareButton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface VariantOption {
  slug: string;
  label: string;
  /** Highest part_number that exists in this variant; chrome routes to
   *  min(currentPart, max) when switching to avoid 404s. */
  totalParts: number;
}

interface ReaderChromeProps {
  visible: boolean;
  storyId: string;
  storyTitle: string;
  partNumber: number;
  totalParts: number;
  prevHref: string | null;
  nextHref: string | null;
  onOpenSettings: () => void;
  /** All published variants of the story (incl. current). */
  variants: ReadonlyArray<VariantOption>;
  currentVariantSlug: string;
}

/**
 * Top + bottom bars for the reader. Both fade together based on the
 * `visible` flag managed by ReaderShell (3s auto-hide with tap-to-show).
 *
 * Colours come from CSS custom properties set by themeStyle() so the
 * chrome always contrasts with the current theme's background.
 *
 * Variant picker in the top bar lets the reader hop between translations
 * of the same story without losing their place (lands on the same part_number,
 * clamped to the target variant's part count).
 */
export function ReaderChrome({
  visible,
  storyId,
  storyTitle,
  partNumber,
  totalParts,
  prevHref,
  nextHref,
  onOpenSettings,
  variants,
  currentVariantSlug,
}: ReaderChromeProps) {
  const router = useRouter();
  const fadeClass = visible
    ? "opacity-100 translate-y-0"
    : "pointer-events-none opacity-0";

  function handleVariantChange(slug: string) {
    if (slug === currentVariantSlug) return;
    const target = variants.find((v) => v.slug === slug);
    const part = Math.min(partNumber, target?.totalParts ?? partNumber);
    router.push(`/s/${storyId}/${slug}/p/${part}`);
  }

  return (
    <>
      {/* TOP BAR */}
      <header
        aria-hidden={!visible}
        className={`fixed inset-x-0 top-0 z-40 backdrop-blur transition-all duration-200 ${
          visible ? fadeClass : `${fadeClass} -translate-y-2`
        }`}
        style={{
          backgroundColor: "var(--reader-chrome-bg)",
          color: "var(--reader-text)",
          borderBottom: "1px solid var(--reader-chrome-border)",
        }}
      >
        <div className="mx-auto flex h-12 max-w-[680px] items-center gap-2 px-3 sm:px-5">
          <Link
            href={`/s/${storyId}`}
            aria-label="Back to story"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          >
            <ChevronLeftIcon />
          </Link>

          {variants.length > 1 ? (
            <Select value={currentVariantSlug} onValueChange={handleVariantChange}>
              <SelectTrigger
                size="sm"
                aria-label="Switch translation variant"
                className="h-8 max-w-[180px] border-0 bg-transparent text-xs hover:bg-black/5 dark:hover:bg-white/5"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {variants.map((v) => (
                  <SelectItem key={v.slug} value={v.slug}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <div className="min-w-0 flex-1 text-center">
            <p
              className="truncate text-xs uppercase tracking-wide"
              style={{ color: "var(--reader-text-muted)" }}
            >
              Part {partNumber} / {totalParts}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Reader settings"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          >
            <SettingsIcon />
          </button>
          <ShareButton title={storyTitle} />
          <BookmarkButton storyId={storyId} className="h-9 w-9" />
        </div>
      </header>

      {/* BOTTOM BAR */}
      <nav
        aria-label="Part navigation"
        aria-hidden={!visible}
        className={`fixed inset-x-0 bottom-0 z-40 backdrop-blur transition-all duration-200 ${
          visible ? fadeClass : `${fadeClass} translate-y-2`
        }`}
        style={{
          backgroundColor: "var(--reader-chrome-bg)",
          color: "var(--reader-text)",
          borderTop: "1px solid var(--reader-chrome-border)",
        }}
      >
        <div className="mx-auto flex h-14 max-w-[680px] items-center justify-between gap-3 px-3 sm:px-5">
          <NavButton href={prevHref} direction="prev" label="Previous part" />
          <span
            className="text-xs tabular-nums"
            style={{ color: "var(--reader-text-muted)" }}
          >
            {partNumber} / {totalParts}
          </span>
          <NavButton href={nextHref} direction="next" label="Next part" />
        </div>
      </nav>
    </>
  );
}

function NavButton({
  href,
  direction,
  label,
}: {
  href: string | null;
  direction: "prev" | "next";
  label: string;
}) {
  const icon = direction === "prev" ? <ChevronLeftIcon /> : <ChevronRightIcon />;
  if (!href) {
    return (
      <span
        aria-label={label}
        className="inline-flex h-10 w-10 items-center justify-center rounded-md opacity-30"
      >
        {icon}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      prefetch
      className="inline-flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/5"
    >
      {icon}
    </Link>
  );
}

/* --- inline icons --- */
const ICON_PROPS = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};
function ChevronLeftIcon() {
  return (
    <svg {...ICON_PROPS}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
function ChevronRightIcon() {
  return (
    <svg {...ICON_PROPS}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
