import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdmin } from "@/lib/auth/check-admin";

/**
 * Auth gate for every admin page. The login page lives outside this route
 * group (app/admin/login/page.tsx) so it skips this layout entirely — no
 * redirect loop.
 *
 * requireAdmin() throws via redirect() when the user isn't the configured
 * admin. The user object it returns is the source of truth for "who is
 * signed in" and gets passed down to the shell so we don't have to query
 * the session twice per request.
 */
export const dynamic = "force-dynamic";

export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  const user = await requireAdmin();
  return <AdminShell adminEmail={user.email ?? ""}>{children}</AdminShell>;
}
