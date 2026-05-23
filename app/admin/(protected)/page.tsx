import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Dashboard",
};

interface StatCardProps {
  label: string;
  value: number;
  caption?: string;
}

function StatCard({ label, value, caption }: StatCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-foreground text-3xl font-semibold tabular-nums">{value}</p>
        {caption ? <p className="text-muted-foreground mt-1 text-xs">{caption}</p> : null}
      </CardContent>
    </Card>
  );
}

export default async function AdminDashboardPage() {
  const admin = createAdminClient();

  // Three counts in parallel: total active, drafts, published.
  const [total, drafts, published] = await Promise.all([
    admin
      .from("stories")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true)
      .then(({ count }) => count ?? 0),
    admin
      .from("stories")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("status", "draft")
      .then(({ count }) => count ?? 0),
    admin
      .from("stories")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("status", "published")
      .then(({ count }) => count ?? 0),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Welcome back. Phase 4 is the auth shell — the CRUD pages and the story workflow ship in
          phases 5–7.
        </p>
      </header>

      <section
        aria-label="Story counts"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <StatCard label="Total stories" value={total} caption="active (not soft-deleted)" />
        <StatCard label="Drafts" value={drafts} caption="not yet published" />
        <StatCard label="Published" value={published} caption="live on the public site" />
      </section>
    </div>
  );
}
