"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SignInState = {
  error: string | null;
};

const ADMIN_DASHBOARD_PATH = "/admin";

/**
 * Sign in with email + password, then verify the email matches ADMIN_EMAIL.
 *
 * Three failure cases, each produces a distinct error message:
 *   - Missing email/password (basic validation)
 *   - Supabase rejects the credentials
 *   - Credentials valid but the user is NOT the configured admin
 *     (in which case we sign them out so no session lingers)
 *
 * On success, redirect to /admin. The redirect throws, so anything below
 * the redirect() line is unreachable — that's why there is no `return`
 * after it.
 */
export async function signIn(
  _previousState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const userEmail = data.user.email?.toLowerCase() ?? "";

  if (userEmail !== adminEmail) {
    // Don't leave a session for a non-admin user dangling.
    await supabase.auth.signOut();
    return {
      error: "Not authorized — this account is not the admin.",
    };
  }

  redirect(ADMIN_DASHBOARD_PATH);
}
