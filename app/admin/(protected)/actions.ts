"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_LOGIN_PATH } from "@/lib/auth/check-admin";

/**
 * Sign out the current Supabase session and bounce to the login page.
 * Wired to a <form action={signOut}> in the AdminShell so no client JS
 * is required for the logout flow.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(ADMIN_LOGIN_PATH);
}
