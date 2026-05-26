"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarNav } from "./SidebarNav";
import { signOut } from "@/app/admin/(protected)/actions";

interface MobileAdminNavProps {
  adminEmail: string;
}

/**
 * Mobile-only top bar + slide-out drawer. Mirrors the desktop sidebar but
 * stays out of the way until the admin taps the hamburger. The drawer reuses
 * SidebarNav (with onNavigate) and the same signOut server action, so there's
 * one source of truth for nav items.
 */
export function MobileAdminNav({ adminEmail }: MobileAdminNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on Escape and lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Close the drawer whenever the route changes (covers form submits and
  // any other programmatic nav that isn't a direct link click). React-19
  // "adjust state during render" pattern — see project notes in CLAUDE.md.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (open) setOpen(false);
  }

  return (
    <>
      <div className="bg-background sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b px-4 md:hidden">
        <Link href="/admin" className="flex items-baseline gap-1.5">
          <span className="text-base font-semibold tracking-tight">Qissa</span>
          <span className="text-muted-foreground text-[10px] uppercase">admin</span>
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="h-9 w-9 p-0"
        >
          <MenuIcon className="size-5" aria-hidden />
        </Button>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Admin menu"
        >
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="bg-foreground/40 absolute inset-0 animate-in fade-in-0"
          />
          <aside className="bg-background animate-in slide-in-from-left absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r p-4 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="flex items-baseline gap-1.5 px-1"
              >
                <span className="text-lg font-semibold tracking-tight">Qissa</span>
                <span className="text-muted-foreground text-xs uppercase">admin</span>
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="h-9 w-9 p-0"
              >
                <XIcon className="size-5" aria-hidden />
              </Button>
            </div>

            <SidebarNav onNavigate={() => setOpen(false)} />

            <div className="mt-auto space-y-2 border-t pt-4">
              <p
                className="text-muted-foreground truncate px-3 text-xs"
                title={adminEmail}
                aria-label="Signed in as"
              >
                {adminEmail}
              </p>
              <form action={signOut}>
                <Button type="submit" variant="outline" size="sm" className="w-full">
                  Sign out
                </Button>
              </form>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
