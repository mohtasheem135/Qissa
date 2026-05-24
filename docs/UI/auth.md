# UI — Auth

> One admin per environment, no public sign-up, no reader login.

---

## The admin user

- Created **manually** in Supabase Dashboard (see [02-guidance.md](../02-guidance.md) §2.4)
- Email pinned via env: `ADMIN_EMAIL`
- Public sign-ups must be DISABLED in Supabase Auth settings — even if a user signs up, they can't reach `/admin` because the gate checks `user.email === ADMIN_EMAIL`

---

## Login page

**URL:** `/admin/login`
**Files:**
- Page: [app/admin/login/page.tsx](../../app/admin/login/page.tsx)
- Server Action: [app/admin/login/actions.ts](../../app/admin/login/actions.ts) → `signIn`
- Client form: [LoginForm](../../components/admin/LoginForm.tsx)

UX:

- Visiting `/admin/login` while already signed in as admin redirects to `/admin` (via [getAdminUser()](../../lib/auth/check-admin.ts))
- Form is a shadcn Card with email + password; React-19 `useActionState` + `useFormStatus` for pending state and inline error

The action handles three distinct error paths so the user gets a useful message:

1. **Missing fields** — "Email and password are required."
2. **Supabase rejects credentials** — surface `error.message` directly
3. **Valid credentials but wrong email** — sign out and surface "Not authorized — this account is not the admin."

Sits **outside** the `(protected)/` route group, so the auth-gating layout doesn't apply here. No redirect loop.

---

## Session refresh — the middleware (proxy)

**Files:** [proxy.ts](../../proxy.ts) (project root) + [lib/supabase/middleware.ts](../../lib/supabase/middleware.ts)

Next 16 renamed `middleware.ts` → `proxy.ts`. Same feature: a function that runs before every matched request and may return a `NextResponse`.

Our `proxy.ts` does exactly one thing: call `updateSession(request)` from [lib/supabase/middleware.ts](../../lib/supabase/middleware.ts). That follows `@supabase/ssr`'s prescribed pattern:

1. Read cookies from the incoming request
2. Create a server-bound Supabase client with those cookies
3. Call `supabase.auth.getUser()` — this transparently rotates the JWT cookie if it's near expiry
4. Forward the (possibly rotated) cookies on the outgoing response

This is what makes [lib/supabase/server.ts](../../lib/supabase/server.ts)'s `setAll` cookie-write no-op in a Server Component context safe — the middleware has already taken care of rotation for the **next** request.

Matcher excludes `_next/static`, `_next/image`, common image extensions, and a few obvious paths so the SW + asset endpoints don't pay for session work.

---

## Per-page gate

**File:** [lib/auth/check-admin.ts](../../lib/auth/check-admin.ts)

Two exports:

- `requireAdmin(): Promise<User>` — gets the current user, redirects to `/admin/login` if missing or email doesn't match `ADMIN_EMAIL`. Used at the top of every admin Server Action and in [app/admin/(protected)/layout.tsx](../../app/admin/(protected)/layout.tsx).
- `getAdminUser(): Promise<User | null>` — non-redirecting variant. Used by the login page to redirect signed-in admins to `/admin`, and would be used by any future "if admin, show Edit pencil on public page" feature.

Both source the user via [createClient()](../../lib/supabase/server.ts) (server client bound to request cookies). The admin email comparison is case-insensitive (`.toLowerCase()` on both sides).

---

## Sign out

**File:** [app/admin/(protected)/actions.ts](../../app/admin/(protected)/actions.ts) → `signOut`

Mounted in [AdminShell](../../components/admin/AdminShell.tsx)'s sidebar as:

```tsx
<form action={signOut}>
  <Button type="submit">Sign out</Button>
</form>
```

Plain form action — works without client JS. Calls `supabase.auth.signOut()` and `redirect("/admin/login")`.

---

## What's NOT here (Phase 1)

| Feature | Status | Where it'll land |
|---|---|---|
| Reader user accounts | out of scope | Phase 2 |
| Magic-link login | not implemented (plan mentions as fallback) | trivial to add — Supabase Auth supports it; just add a button to login form |
| Multi-admin / roles | out of scope | Phase 2 |
| Password reset UI | not implemented; admin can use Supabase Dashboard | – |
| Account profile / settings | out of scope | Phase 2 |

The schema is forward-compatible — adding `profiles` keyed by `auth.uid` for readers in Phase 2 doesn't require touching anything we shipped.
