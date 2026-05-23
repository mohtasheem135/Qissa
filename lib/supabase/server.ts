import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

/**
 * Server-side Supabase client bound to the incoming request's cookies.
 *
 * Use this in Server Components, Server Actions, and Route Handlers when you
 * want the *user's* session — RLS will scope reads to the logged-in user (or
 * anonymous, for the public reader pages). For admin mutations that need to
 * bypass RLS, use lib/supabase/admin.ts instead.
 *
 * Next.js 15+ makes `cookies()` async, so this factory is async too.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // `cookies().set()` can only be called from a Server Action or
          // Route Handler. When invoked from a Server Component the throw is
          // expected — the session is refreshed in middleware.ts (Phase 4).
        }
      },
    },
  });
}
