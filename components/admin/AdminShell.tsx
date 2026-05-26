import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SidebarNav } from "./SidebarNav";
import { MobileAdminNav } from "./MobileAdminNav";
import { signOut } from "@/app/admin/(protected)/actions";

interface AdminShellProps {
  children: ReactNode;
  adminEmail: string;
}

/**
 * Persistent chrome for every protected admin page.
 * - **Desktop (md+):** left sidebar with brand + section nav + sign-out.
 * - **Mobile (< md):** top bar with hamburger that opens a slide-out drawer
 *   ([MobileAdminNav](./MobileAdminNav.tsx)). The drawer reuses [SidebarNav]
 *   so nav items stay in one place.
 *
 * Sign-out uses a plain <form action={signOut}> so the flow works even
 * without client JS — no `'use client'` needed at this level.
 */
export function AdminShell({ children, adminEmail }: AdminShellProps) {
  return (
    <div className="bg-muted/20 flex h-dvh flex-col overflow-hidden md:flex-row">
      <MobileAdminNav adminEmail={adminEmail} />

      <aside className="bg-background hidden h-full w-60 shrink-0 flex-col overflow-y-auto border-r p-4 md:flex">
        <Link href="/admin" className="mb-6 block px-3 py-2">
          <span className="text-lg font-semibold tracking-tight">Qissa</span>
          <span className="text-muted-foreground ml-2 text-xs uppercase">admin</span>
        </Link>

        <SidebarNav />

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

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
      </main>
    </div>
  );
}
