# Internals — Supabase Clients

> Three clients, one env helper, generated types. Schema docs live in [04-database.md](../04-database.md).

---

## Files

```
lib/supabase/
  env.ts          required(), getSupabaseUrl/AnonKey/ServiceRoleKey — explicit errors
  types.ts        Database type — REGENERATED, do not hand-edit
  client.ts       createClient() — browser
  server.ts       createClient() — server with request cookies
  admin.ts        createAdminClient() — service role; throws if called from browser
  middleware.ts   updateSession() — used by proxy.ts to rotate JWT cookie
```

---

## When to use which client

| Need | Use | Key | Where |
|---|---|---|---|
| Anything in a Client Component | [client.ts](../../lib/supabase/client.ts) `createClient()` | anon | RLS-gated reads |
| Server Component / Server Action / Route Handler reading per-user data | [server.ts](../../lib/supabase/server.ts) `await createClient()` | anon (bound to request cookies) | RLS-gated |
| Admin mutation (insert / update / delete) | [admin.ts](../../lib/supabase/admin.ts) `createAdminClient()` | service role | **bypasses RLS** — always behind `requireAdmin()` |

The service-role client has a runtime guard that throws if `typeof window !== "undefined"`. The Next.js bundler should catch this earlier (server-only import graph) but the guard is belt-and-braces.

---

## env.ts

```ts
function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Add it to .env.local — see .env.example and docs/02-guidance.md.`,
    );
  }
  return value;
}
```

Centralized so a missing env var fails with a clear message at first use, not a cryptic "URL is required" from the SDK at request time.

---

## server.ts — the cookies plumbing

Uses `createServerClient` from `@supabase/ssr`. Two callbacks:

- `getAll()` — returns `cookies().getAll()` from `next/headers`
- `setAll(cookiesToSet)` — tries to `cookieStore.set(name, value, options)` for each; swallows errors

The swallow is important: `cookies().set()` throws when called from a Server Component context. That's expected — Next.js doesn't allow mutating cookies during render. The session refresh happens in the middleware (proxy) instead, so the next request sees the rotated cookie.

Next 15+ makes `cookies()` async; this factory is async too.

---

## admin.ts — service role

```ts
return createSupabaseClient<Database>(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
```

Service role bypasses RLS — every row is visible. The auth flags are all false because this client is per-request, never authenticated as a user.

**Never import from a Client Component.** TypeScript won't catch it; runtime will throw with the `window` guard.

---

## middleware.ts — the proxy helper

`updateSession(request)`:

1. Open a `NextResponse.next({ request })`
2. Build a `createServerClient<Database>` with cookies bound to the request
3. `setAll` updates both the request's cookies (so anything else in this request sees fresh values) AND the response's outgoing cookies (so the browser stores the rotated JWT)
4. Call `await supabase.auth.getUser()` — this is the whole point; it rotates the JWT if it's close to expiring
5. Return the response

> ⚠️ Do not add intermediate awaits between `createServerClient()` and `getUser()`. They can desynchronize the cookie state.

Wired into [proxy.ts](../../proxy.ts) at the project root. The matcher excludes static assets, image extensions, and Next internals so we don't burn cycles on every PNG request.

---

## Type regeneration

The `Database` type in [lib/supabase/types.ts](../../lib/supabase/types.ts) is GENERATED:

```bash
npx supabase gen types typescript --linked --schema public > lib/supabase/types.ts
```

> ⚠️ The CLI emits `Initialising login role...` to stdout, polluting the first line. Strip it with awk after generation:
> ```bash
> awk 'found || /^export / { found=1; print }' lib/supabase/types.ts > /tmp/t && mv /tmp/t lib/supabase/types.ts
> ```

Regenerate whenever a migration changes columns / table names. Then `npm run typecheck` catches downstream references that broke.

All three clients are typed: `createBrowserClient<Database>`, `createServerClient<Database>`, `createClient<Database>` (for admin). So `.from("stories").select("...")` autocompletes column names and returns row types with the right shapes.

---

## RLS recap

Full list in [04-database.md](../04-database.md) §5. TL;DR:

- **Public read:** `categories`, `subcategories`, `languages`, `tones` (active only); `stories` (published+active); `story_parts` (of published+active stories via correlated subquery)
- **Service-role only:** `story_part_versions`, `ai_config`, `translation_jobs` (no policies → default deny for anon)

The anon client reads on `/`, `/c/...`, `/s/...`, `/search` are RLS-gated to published content. There's no application-level check anywhere — defense-in-depth via the database.

Verified live by [scripts/smoke-supabase.ts](../../scripts/smoke-supabase.ts):

```bash
npx tsx --env-file=.env.local scripts/smoke-supabase.ts
```

Four assertions:
1. Anon can read 13 languages
2. Anon can read Hindi tones
3. Anon gets 0 rows from `ai_config` (RLS blocks)
4. Service role can read `ai_config`

---

## Common errors

| Error | Cause | Fix |
|---|---|---|
| `Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL` | env not set in this process | Add to `.env.local` (dev) or Vercel env (prod) |
| `Database type does not include "stories" column "x"` | types.ts is stale relative to schema | Regenerate types (see above) |
| `createAdminClient() must not be called from the browser` | service-role module slipped into a client bundle | Remove the import; switch to `client.ts` or `server.ts` |
| Empty result on what should be a published story | RLS blocking — story isn't `status='published' AND is_active=true` | Publish it, or use the admin client for admin views |
