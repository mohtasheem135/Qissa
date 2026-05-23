import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const ADMIN_LOGIN_PATH = "/admin/login";

/**
 * The one and only authorized admin email — pinned via env so an attacker
 * who somehow signs up a Supabase Auth user still can't reach /admin.
 */
function getAdminEmail(): string {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!email) {
    throw new Error(
      "ADMIN_EMAIL is not set in environment. Add it to .env.local — see docs/02-guidance.md §2.4.",
    );
  }
  return email;
}

function isAdminUser(user: User | null): user is User {
  if (!user || !user.email) return false;
  return user.email.toLowerCase() === getAdminEmail();
}

/**
 * Gate every admin Server Action and protected page with this. If the
 * current request has no session OR the session doesn't belong to the
 * configured admin, redirect to /admin/login.
 *
 * Returns the authenticated admin user on success so callers can use the
 * user object (e.g., to render "Signed in as ...") without re-querying.
 */
export async function requireAdmin(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdminUser(user)) {
    redirect(ADMIN_LOGIN_PATH);
  }
  return user;
}

/**
 * Non-redirecting variant for places that need to *conditionally* render
 * admin-only chrome (e.g., a future "Edit" button on the public reader
 * when logged in as admin). Returns `null` instead of redirecting.
 */
export async function getAdminUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return isAdminUser(user) ? user : null;
}
