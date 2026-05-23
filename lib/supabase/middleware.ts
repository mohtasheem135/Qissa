import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./types";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

/**
 * Refreshes the user's Supabase session on every matched request.
 *
 * The implementation follows @supabase/ssr's prescribed pattern:
 *   - Read cookies from the incoming request.
 *   - Bind them to a Supabase client.
 *   - Call getUser(), which transparently refreshes the access token if it
 *     is close to expiring.
 *   - Forward the (possibly rotated) cookies on the response.
 *
 * This is what makes server.ts's `cookies().set()` safe to no-op inside a
 * Server Component context — the middleware has already taken care of
 * rotation for the *next* request.
 *
 * NOTE: do NOT add logic between createServerClient() and getUser() — any
 * intermediate awaits can desynchronize the cookie state. Auth gating lives
 * in lib/auth/check-admin.ts; this file only refreshes.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // 1) Update the request's cookies so anything else in this request
        //    (notably server.ts) sees the fresh values.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        // 2) Recreate the response so the outgoing cookie headers are set.
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // This call is the whole point of the middleware: it refreshes the JWT
  // when needed and writes new cookies via the setAll callback above.
  await supabase.auth.getUser();

  return response;
}
