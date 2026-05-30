"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

const NAV_ITEMS: Array<{ href: string; label: string }> = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/stories", label: "Stories" },
  { href: "/admin/requests", label: "Requests" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/tones", label: "Tones" },
  { href: "/admin/languages", label: "Languages" },
  { href: "/admin/ai-config", label: "AI config" },
  { href: "/admin/tts-config", label: "TTS / Voices" },
];

interface SidebarNavProps {
  /** Optional callback fired on every nav link click — used by the mobile drawer to close. */
  onNavigate?: () => void;
}

/**
 * Client component so we can highlight the active link via usePathname.
 * Reused inside both the desktop sidebar (AdminShell) and the mobile drawer
 * (MobileAdminNav). `onNavigate` lets the drawer close itself when the user
 * picks a destination.
 */
export function SidebarNav({ onNavigate }: SidebarNavProps = {}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-2 text-sm transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
