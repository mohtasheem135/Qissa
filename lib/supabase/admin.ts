import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "./env";

/**
 * Service-role Supabase client. **Server-only.**
 *
 * Bypasses RLS — use ONLY for admin Server Actions / Route Handlers, always
 * behind requireAdmin() (lib/auth/check-admin.ts, Phase 4). Never import this
 * from a Client Component or any browser-bound module.
 *
 * The runtime guard below throws if this file is somehow evaluated in the
 * browser. Next.js's bundler should already error first because the import
 * graph for `next/headers` style guarantees aren't applied here — the guard
 * is belt-and-braces.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error(
      "createAdminClient() must not be called from the browser. " +
        "It uses the Supabase service-role key, which bypasses RLS.",
    );
  }

  return createSupabaseClient<Database>(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
