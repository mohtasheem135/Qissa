# Qissa — Architecture

> System-level view of how the codebase fits together. Pair with [04-database.md](./04-database.md) for the data layer and [FEATURES.md](./FEATURES.md) for the feature-to-code map.

> **Multi-variant translations (2026-05-24).** A story is now a source-only object; its translations live as `story_variants` (one per language × tone) with `story_part_translations` holding the actual text. The reader URL is `/s/<storyId>/<variantSlug>/p/<partNumber>` with a redirect at the old `/s/<storyId>/p/<n>` shape to the story's primary variant. Reader requests live in `story_requests` (managed in `/admin/requests`). See §3.3, §5, §8, and [04-database.md §4.10–§4.13](./04-database.md#410-story_variants).

---

## 1. Bird's-eye view

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                    │
│    Reader PWA (public) ──── service worker (public/sw.js)   │
│    Admin Console        ──── auth-gated via proxy.ts        │
└────────────┬────────────────────────────┬───────────────────┘
             │ Public reads (anon + RLS)  │ Admin writes (service role)
             ▼                            ▼
   ┌──────────────────┐         ┌────────────────────────┐
   │  Supabase        │         │  Next.js Server        │
   │  (Postgres + RLS │◄────────┤  Route Handlers +      │
   │   + Auth)        │         │  Server Actions        │
   └──────────────────┘         └────────────┬───────────┘
                                             │
                  ┌──────────────────────────┼──────────────────┐
                  │                          │                  │
          ┌───────▼────────┐       ┌─────────▼────────┐  ┌──────▼────────┐
          │ AI providers   │       │ ImageKit         │  │ Reader        │
          │ (5 adapters)   │       │ (cover uploads)  │  │ localStorage  │
          │ lib/ai/        │       │ lib/imagekit/    │  │ lib/reader/   │
          └────────────────┘       └──────────────────┘  └───────────────┘
```

**Two app surfaces sharing the same Next.js app, both behind one middleware (proxy):**

- **Public PWA** — `app/(public)/*`. Reads via the anon Supabase client (RLS-gated to published+active rows). No user accounts in Phase 1 — bookmarks + reading progress live in `localStorage`.
- **Admin console** — `app/admin/*`. Auth-gated by [lib/auth/check-admin.ts](../lib/auth/check-admin.ts), writes via the service-role Supabase client (bypasses RLS). One configured admin email per environment.

---

## 2. Module map

| Layer | Folder | What it owns |
|---|---|---|
| Public reader UI | [app/(public)/](../app/(public)/) | Home, browse, search, story landing, reader, bookmarks, offline |
| Admin UI | [app/admin/](../app/admin/) | Login + auth-gated CRUD + story workflow |
| API routes | [app/api/](../app/api/) | `/translate`, `/translate/queue` (SSE), `/upload`, `/ai/test` |
| Server Actions | [lib/actions/](../lib/actions/) | Form submits + mutations for every CRUD entity |
| Supabase clients | [lib/supabase/](../lib/supabase/) | Browser / server-with-cookies / service-role + env helpers |
| AI provider adapter | [lib/ai/](../lib/ai/) | `TranslationProvider` interface + 5 implementations + prompt builder + retry |
| Translation flow | [lib/translation/run-part.ts](../lib/translation/run-part.ts) | Shared per-part translate (used by single + queue endpoints) |
| ImageKit | [lib/imagekit/](../lib/imagekit/) | Upload + URL composition (path-only storage) |
| Analytics | [lib/analytics/](../lib/analytics/) | Server-only aggregations + pricing table for the `/admin/analytics` dashboard (`translation_jobs` + `story_part_versions`) |
| Dictionary | [lib/dictionary/](../lib/dictionary/) | Server-only Wiktionary REST proxy + shared client types — powers tap-to-define popover in the reader via `/api/dictionary` |
| Reader runtime | [lib/reader/](../lib/reader/) | Themes, settings, font size, progress, bookmarks, paragraph pairing |
| Shared UI | [components/shared/](../components/shared/) | StoryCard, CategoryTile, SearchBar, BookmarkButton, PublicShell |
| Reader UI | [components/reader/](../components/reader/) | ReaderShell, ReaderChrome, ReaderBody, ReaderSettings, FontControls, ProgressBar |
| Admin UI | [components/admin/](../components/admin/) | Per-entity FormDialogs + Panels + StoryEditShell + PartCard + [MobileAdminNav](../components/admin/MobileAdminNav.tsx) (hamburger drawer for `< md`) |
| shadcn primitives | [components/ui/](../components/ui/) | button, card, dialog, input, label, select, switch, table, tabs, textarea, badge, alert-dialog, sonner |
| DB | [supabase/migrations/](../supabase/migrations/) | Schema + RLS + seed in 3 timestamped migrations |
| PWA | [public/sw.js](../public/sw.js), [app/manifest.ts](../app/manifest.ts), [public/icons/](../public/icons/) | Manual service worker + manifest + icons |
| Cross-cutting | [middleware](../proxy.ts) (`proxy.ts`) | Supabase session refresh on every request |

---

## 3. Request lifecycles

### 3.1 Reader visit (cold, no SW)

1. `GET /` → Next renders [app/(public)/page.tsx](../app/(public)/page.tsx) on the server
2. Server uses [lib/supabase/server.ts](../lib/supabase/server.ts) to fetch published stories (RLS enforces "published + active")
3. HTML streams down; [components/shared/PublicShell.tsx](../components/shared/PublicShell.tsx) wraps it with top bar + bottom nav
4. Root layout mounts [ServiceWorkerRegistration](../components/shared/ServiceWorkerRegistration.tsx) (production-only) → `public/sw.js` installs
5. [ContinueReading](../components/shared/ContinueReading.tsx) reads `qissa:last-read` from `localStorage` and fetches that story via the browser client if present

### 3.2 Reader → reader page → cached

1. `GET /s/<id>/<variantSlug>/p/1` → [app/(public)/s/[storyId]/[variantSlug]/p/[partNumber]/page.tsx](../app/(public)/s/[storyId]/[variantSlug]/p/[partNumber]/page.tsx) fetches the variant + its `story_part_translations` row for this part + parent story + language
2. Per-language Google Fonts stylesheet is emitted via `<link>` from [lib/reader/google-fonts.ts](../lib/reader/google-fonts.ts) (keyed on the variant's `target_language`)
3. Sibling published variants are fetched too and passed into [ReaderChrome](../components/reader/ReaderChrome.tsx) for the in-reader variant picker
4. [ReaderShell](../components/reader/ReaderShell.tsx) hydrates from `localStorage` (theme, font size, settings); progress is variant-scoped via `qissa:progress:<storyId>:<variantSlug>:<partNumber>`
5. Service worker caches the HTML + any ImageKit thumb under that URL
6. Airplane mode → next visit: SW serves cached HTML; if not cached, falls back to `/offline`
7. **Legacy URL fallback:** `GET /s/<id>/p/1` hits [app/(public)/s/[storyId]/p/[partNumber]/page.tsx](../app/(public)/s/[storyId]/p/[partNumber]/page.tsx), which looks up the primary published variant and 307s to the variant URL above. If no published variant exists (e.g. story is still draft) it 307s to the story landing `/s/<id>` instead of 404-ing — the landing page itself handles draft/missing-translation states.

### 3.3 Admin translates a 4-part variant

1. On `/admin/stories/<id>`, the admin picks the variant tab (one tab per variant in [StoryEditShell](../components/admin/StoryEditShell.tsx)) and clicks **Translate 4 pending**
2. [VariantPanel](../components/admin/VariantPanel.tsx) opens `fetch("/api/translate/queue")` with `{ variantId }`. Sibling variant tabs stay mounted (`forceMount`) so a running queue isn't aborted by switching tabs
3. [app/api/translate/queue/route.ts](../app/api/translate/queue/route.ts) returns a `text/event-stream` `ReadableStream`
4. Server iterates pending `story_part_translations` rows for that variant (ordered by parent `story_parts.part_number`). For each: calls [lib/translation/run-part.ts](../lib/translation/run-part.ts) → `runStoryPartTranslation`
5. `runStoryPartTranslation` loads the translation row + parent variant + shared `story_parts` row + previous-part context (same variant), marks the translation `translating`, runs [lib/ai/translate.ts](../lib/ai/translate.ts) → `withRetry(provider.translate(input))`, logs each attempt to `translation_jobs` (with `variant_id` + `story_part_translation_id`), inserts a new `story_part_versions` row, updates `story_part_translations`
6. Each per-part event is `JSON.stringify` + `data: …\n\n` chunk on the stream
7. Client consumes via `response.body.getReader()`; PartCard badges flip live; `router.refresh()` on settle reconciles
8. Cancellation: `AbortController` on the client → `request.signal.aborted` server-side stops the queue at the next translation boundary

### 3.4 Admin uploads a cover

1. [ImageUploadField](../components/admin/ImageUploadField.tsx) → `fetch("/api/upload", { multipart })`
2. [app/api/upload/route.ts](../app/api/upload/route.ts) validates type + size, calls [lib/imagekit/upload.ts](../lib/imagekit/upload.ts) → ImageKit SDK
3. Response returns `{ path: "/covers/the_bet_xxx.png" }` — **never the full URL**
4. Stored in `stories.cover_image_url`; render-side composition happens in [lib/imagekit/url.ts](../lib/imagekit/url.ts) via `coverUrl(path, transform)` using `NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT`

---

## 4. Auth model

- One env-pinned admin email — `ADMIN_EMAIL` in `.env.local` / Vercel env
- Supabase Auth public sign-ups are **disabled** in dashboard
- Admin user created manually in Supabase Dashboard once (per `docs/02-guidance.md` §2.4)
- [proxy.ts](../proxy.ts) (Next 16's renamed middleware) refreshes the JWT cookie on every request via [lib/supabase/middleware.ts](../lib/supabase/middleware.ts) → `updateSession`
- Per-page gate: [lib/auth/check-admin.ts](../lib/auth/check-admin.ts) → `requireAdmin()` reads the session and redirects to `/admin/login` if email ≠ ADMIN_EMAIL
- `app/admin/(protected)/layout.tsx` calls `requireAdmin()`; `app/admin/login/` lives OUTSIDE the `(protected)` route group → no redirect loop
- Every Server Action and admin Route Handler calls `requireAdmin()` first

---

## 5. Translation pipeline

```
[admin clicks Translate]
   ▼
/api/translate          (single part)        /api/translate/queue   (SSE queue)
   ▼                                            ▼
   └──────────────► lib/translation/run-part.ts ◄──────────────┘
                              ▼
                   lib/ai/translate.ts
                       (getProvider + withRetry)
                              ▼
                   lib/ai/providers/<provider>.ts
                       (concrete adapter)
                              ▼
                   lib/ai/prompt-builder.ts
                       (system + user prompt assembly)
                              ▼
                   DB writes:
                     - story_parts.update (text, status, word_count, provider, model)
                     - story_part_versions.insert (new version row)
                     - translation_jobs.insert (per attempt: succeeded / failed)
```

- **One core function**, [`runStoryPartTranslation`](../lib/translation/run-part.ts), is the source of truth for "translate one (variant × part) end-to-end". Both endpoints delegate to it. Its input is a `story_part_translations.id`.
- **Five providers**, all implementing [`TranslationProvider`](../lib/ai/types.ts). Lazy-instantiated via [`getProvider`](../lib/ai/registry.ts). Add a new provider = one file + one switch `case`.
- **Retry** is uniform — [`withRetry`](../lib/ai/retry.ts) — `[1000, 3000, 9000]` ms backoff, only on `ProviderError.isRetryable` (429 / 5xx / network).
- **Failures** never throw out of the route. The translation row's status becomes `failed` with `error_message`; admin can retry from the UI.
- **Variant-scoped:** the previous-part coherence anchor is fetched from the *same variant* — switching between variants doesn't leak context across them.

---

## 6. State persistence

| State | Where | Why there |
|---|---|---|
| Story data, parts, tones, etc. | Supabase Postgres | Shared, indexed, RLS-gated |
| Admin session | Supabase Auth cookie (refreshed in middleware) | Standard JWT flow |
| Reader settings (theme, line-height, alignment, font variant, show-original) | `qissa:reader-settings` JSON in `localStorage` | Per-device, no account model in Phase 1 |
| Reader font size | `qissa:fontSize` integer in `localStorage` | Separate from settings — A−/A+ buttons hit it constantly, isolating avoids re-serializing the whole blob |
| Per-part reading progress | `qissa:progress:<storyId>:<variantSlug>:<partNumber>` | Variant-scoped — switching variants doesn't carry progress; drives ✓/⏳ indicators on story landing |
| Last-read pointer | `qissa:last-read` (`{ storyId, variantSlug, partNumber, updatedAt }`) | Drives "Continue Reading" on home |
| Bookmarks | `qissa:bookmarks` array | Module-level cache so `useSyncExternalStore` doesn't infinite-loop |
| Install banner cooldown | `qissa:installPromptDismissedAt` | 7-day re-prompt window |

All localStorage helpers live in [lib/reader/](../lib/reader/) and are **SSR-safe** (return defaults when `window` is undefined). See [INTERNALS/reader-state.md](./INTERNALS/reader-state.md).

---

## 7. PWA strategy

| Request | Strategy |
|---|---|
| `/admin/*` | Network-only (skipped by SW) |
| `/api/*` | Network-only |
| RSC navigation (`RSC: 1` header) | Network-only |
| Navigation (HTML) | Network-first → cache → `/offline` fallback |
| ImageKit + any `image` destination | Cache-first |
| `script` / `style` / `font` destinations | Stale-while-revalidate |

SW source: [public/sw.js](../public/sw.js). Registered by [components/shared/ServiceWorkerRegistration.tsx](../components/shared/ServiceWorkerRegistration.tsx), production-only. Manifest at [app/manifest.ts](../app/manifest.ts). See [INTERNALS/pwa-service-worker.md](./INTERNALS/pwa-service-worker.md).

---

## 8. Design decisions worth knowing

| Decision | Where | Why |
|---|---|---|
| Use Next 16's `proxy.ts` (not deprecated `middleware.ts`) | [proxy.ts](../proxy.ts) | Future-proof; same feature, new convention |
| Route group `app/admin/(protected)/` | dirs | Lets `/admin/login` and `/admin` share the prefix without sharing the auth-gating layout → no redirect loop |
| Form-state types separated from Server Action files | `*.types.ts` siblings to `*.ts` | Next 16 forbids non-function exports from `"use server"` files; types live in plain modules |
| Reader settings: **JSON blob + separate fontSize key** | [lib/reader/reader-settings.ts](../lib/reader/reader-settings.ts) + [lib/reader/font-size.ts](../lib/reader/font-size.ts) | A−/A+ + pinch zoom hit fontSize constantly; isolating avoids re-serializing the whole settings blob on every keypress |
| React-19 "adjust state during render" pattern instead of `useEffect` for prop-to-state | Multiple FormDialogs, PartCard, StoryForm | `react-hooks/set-state-in-effect` lint rule; canonical replacement per React docs |
| `useSyncExternalStore` snapshot caching | [lib/reader/bookmarks.ts](../lib/reader/bookmarks.ts) | Returning a fresh array each call triggers infinite loop; module-level cache keyed by raw localStorage string |
| Cover URLs stored as **path only** | [lib/imagekit/upload.ts](../lib/imagekit/upload.ts) + [lib/imagekit/url.ts](../lib/imagekit/url.ts) | Decouples DB from ImageKit endpoint; switching CDNs requires no migration |
| Single `runStoryPartTranslation` for both single + queue paths | [lib/translation/run-part.ts](../lib/translation/run-part.ts) | Retry policy + version trail + job logging can never drift |
| Story edit page uses tabs (Source + one per variant) with `forceMount` on variant content | [components/admin/StoryEditShell.tsx](../components/admin/StoryEditShell.tsx) | Keeps each [VariantPanel](../components/admin/VariantPanel.tsx) mounted while inactive so an in-flight SSE translate queue isn't aborted when the admin clicks another tab |
| Legacy reader URL redirects to landing on no-variant, not 404 | [app/(public)/s/[storyId]/p/[partNumber]/page.tsx](../app/(public)/s/[storyId]/p/[partNumber]/page.tsx) | Old bookmarks always land somewhere useful; the landing page itself surfaces draft/no-translation state |
| Manual `public/sw.js` over `@serwist/next` | [public/sw.js](../public/sw.js) | Avoids Next-16-compat uncertainty; trade-off documented: no build-asset precaching (Phase 1.5 can switch) |
| SSE via `fetch().body.getReader()` not `EventSource` | [app/api/translate/queue/route.ts](../app/api/translate/queue/route.ts) | `EventSource` doesn't send custom auth headers; we need the admin session cookie |
| Admin shell renders two layouts (sidebar on `md+`, hamburger drawer on `< md`) | [AdminShell](../components/admin/AdminShell.tsx) + [MobileAdminNav](../components/admin/MobileAdminNav.tsx) | Admin is used from phones too; a 240px persistent sidebar wastes ~60% of a 375px viewport. Drawer reuses [SidebarNav](../components/admin/SidebarNav.tsx) with an `onNavigate` callback so the link list stays in one place |
| Stories + Requests panels render dual desktop-table / mobile-card views in one component | [StoriesPanel](../components/admin/StoriesPanel.tsx) + [RequestsPanel](../components/admin/RequestsPanel.tsx) | `table-fixed` 7-col layouts collapse to ~50px columns on a phone. Hidden below `md:` and replaced by stacked tap-target cards driven off the same filtered data — no separate route, no duplicated filter state |

---

## 9. Where things deploy

- **App + API:** Vercel (Next.js auto-detected)
- **DB + Auth:** Supabase (ap-south-1 / Mumbai)
- **Image CDN:** ImageKit (covers under `/covers/*`)
- **AI:** Provider-side (Gemini / Groq / OpenRouter / OpenAI / Anthropic). No edge functions of our own.

Deploy steps: [README.md](../README.md) → "Production Deployment (Vercel)".
