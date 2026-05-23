"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

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
    // /browse doesn't exist as its own page in Phase 1 — we link to the
    // category prefix instead. Match anything under /c.
    match: (p) => p.startsWith("/c"),
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
 * Phase 9 will auto-hide the bottom nav while inside the reader; today
 * the reader route doesn't exist yet so the nav is always shown.
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopBar />
      <main className="flex-1 pb-20 md:pb-0">{children}</main>
      <BottomNav />
    </>
  );
}

function TopBar() {
  const pathname = usePathname();
  return (
    <header className="bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-base font-semibold tracking-tight">
          Qissa
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
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                )}
              >
                {item.label}
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
      className="bg-background fixed inset-x-0 bottom-0 z-30 border-t md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {NAV_ITEMS.map((item) => {
          const active = item.match(pathname);
          const href = item.href === "/browse" ? "/" : item.href;
          return (
            <li key={item.label}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2.5 text-[10px]",
                  active ? "text-primary" : "text-muted-foreground",
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
