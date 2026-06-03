"use client";

import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { useHideOnScroll } from "@/lib/hooks/use-hide-on-scroll";
import { NavProgress } from "./NavProgress";

const NAV_ITEMS: ReadonlyArray<{
  href: string;
  label: string;
  match: (pathname: string) => boolean;
  icon: React.ReactNode;
}> = [
  {
    href: "/",
    label: "Home",
    match: (p) => p === "/",
    icon: <HomeIcon />,
  },
  {
    href: "/browse",
    label: "Browse",
    // Highlight on /browse itself and on any category-tree path.
    match: (p) => p === "/browse" || p.startsWith("/c"),
    icon: <BrowseIcon />,
  },
  {
    href: "/search",
    label: "Search",
    match: (p) => p.startsWith("/search"),
    icon: <SearchIcon />,
  },
  {
    href: "/bookmarks",
    label: "Bookmarks",
    match: (p) => p.startsWith("/bookmarks"),
    icon: <HeartIcon />,
  },
];

/**
 * Mobile-first chrome for the reader-facing routes.
 *
 * - Top bar: brand on the left + nav links on md+ (hidden on mobile).
 * - Bottom nav: 4-icon dock, mobile-only (md:hidden).
 *
 * On /s/<id>/p/<n> we render *no* chrome — the reader has its own
 * theme-aware top + bottom bars (ReaderChrome) that auto-hide.
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Matches both URL shapes:
  //   /s/<id>/p/<n>                       (legacy redirect target)
  //   /s/<id>/<variantSlug>/p/<n>         (current)
  const isReader = /^\/s\/[^/]+(?:\/[^/]+)?\/p\/\d+/.test(pathname);
  if (isReader) {
    return <main className="flex-1">{children}</main>;
  }
  return (
    <>
      <Suspense fallback={null}>
        <NavProgress />
      </Suspense>
      <TopBar />
      <main className="flex-1 pb-20 md:pb-0">{children}</main>
      <BottomNav />
    </>
  );
}

function TopBar() {
  const pathname = usePathname();
  const hidden = useHideOnScroll();
  return (
    <header
      className={cn(
        "bg-background/70 sticky top-0 z-30 border-b backdrop-blur-md transition-transform duration-300 ease-out",
        hidden && "-translate-y-full",
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          aria-label="Qissa — home"
          className="group flex items-center gap-2.5 focus-visible:outline-none"
        >
          <Image
            src="/icons/web-app-manifest-192x192.png"
            alt=""
            width={32}
            height={32}
            priority
            className="ring-border size-8 rounded-lg ring-1 transition-transform group-hover:scale-105"
          />
          <span className="font-serif text-xl leading-none font-semibold tracking-tight">
            Qissa
          </span>
        </Link>
        <nav aria-label="Primary" className="hidden md:flex md:items-center md:gap-1">
          {NAV_ITEMS.filter((item) => item.href !== "/browse").map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
                )}
              >
                {item.label}
                {active ? (
                  <span
                    aria-hidden
                    className="bg-brand absolute inset-x-3 -bottom-px h-0.5 rounded-full"
                  />
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary mobile"
      className="bg-background/90 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-md md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {NAV_ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <li key={item.label}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors",
                  active ? "text-brand" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className={cn(active ? "scale-110" : undefined, "transition-transform")}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* --- inline svg icons (smaller bundle than lucide) ------------------- */

const ICON_PROPS = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function HomeIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}
function BrowseIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="3" y="4" width="7" height="7" rx="1" />
      <rect x="14" y="4" width="7" height="7" rx="1" />
      <rect x="3" y="15" width="7" height="5" rx="1" />
      <rect x="14" y="15" width="7" height="5" rx="1" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}
function HeartIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 21s-7-4.35-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.65-9.5 9-9.5 9z" />
    </svg>
  );
}
