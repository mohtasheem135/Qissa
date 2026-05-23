import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 renamed "middleware" -> "proxy". Same feature: a function that
 * runs before every matched request and may return a NextResponse.
 *
 * Our job here is exactly one thing: refresh the Supabase session cookie so
 * server-side auth checks see the current user. All gating decisions live
 * downstream in lib/auth/check-admin.ts.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /**
     * Match all request paths except:
     *   - _next/static (Next.js static files)
     *   - _next/image (Next.js image optimization)
     *   - favicon.ico, robots.txt, sitemap.xml
     *   - common image extensions
     */
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
