"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

/**
 * Browser-side Supabase client. Use inside Client Components.
 *
 * Only exposes the anon key, which is safe to ship to the browser — all admin
 * mutations go through Server Actions / Route Handlers that use the
 * service-role client (lib/supabase/admin.ts) and are gated by requireAdmin().
 */
export function createClient() {
  return createBrowserClient<Database>(getSupabaseUrl(), getSupabaseAnonKey());
}
