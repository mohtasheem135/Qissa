import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SidebarNav } from "./SidebarNav";
import { signOut } from "@/app/admin/(protected)/actions";

interface AdminShellProps {
  children: ReactNode;
  adminEmail: string;
}

/**
 * Persistent two-pane chrome for every protected admin page.
 * - Left: brand + section nav.
 * - Right: page content (passed via children).
 * - Top-right of sidebar: who's signed in + sign-out form.
 *
 * Sign-out uses a plain <form action={signOut}> so the flow works even
 * without client JS — no `'use client'` needed at this level.
 */
export function AdminShell({ children, adminEmail }: AdminShellProps) {
  return (
    <div className="bg-muted/20 flex min-h-dvh">
      <aside className="bg-background flex w-60 shrink-0 flex-col border-r p-4">
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

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
