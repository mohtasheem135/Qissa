# UI Overview

> Routing structure, shells, and which file owns what visually.

The App Router file tree under [app/](../../app/) drives all routing. Two top-level surfaces share the root layout but mount different shells.

---

## Routing tree

```
/                                ─ Home                       app/(public)/page.tsx
/browse                          ─ All categories             app/(public)/browse/page.tsx
/c/[categorySlug]                ─ Category landing           app/(public)/c/[categorySlug]/page.tsx
/c/[categorySlug]/[subcategorySlug] ─ Story grid              app/(public)/c/[categorySlug]/[subcategorySlug]/page.tsx
/s/[storyId]                     ─ Story landing              app/(public)/s/[storyId]/page.tsx
/s/[storyId]/p/[partNumber]      ─ Reader (legacy redirect)   app/(public)/s/[storyId]/p/[partNumber]/page.tsx
/s/[storyId]/[variantSlug]/p/[partNumber] ─ Variant reader    app/(public)/s/[storyId]/[variantSlug]/p/[partNumber]/page.tsx
/s/[storyId]/source/p/[partNumber] ─ Source reader            app/(public)/s/[storyId]/source/p/[partNumber]/page.tsx
/search                          ─ Search                     app/(public)/search/page.tsx
/bookmarks                       ─ Bookmarks (client-only)    app/(public)/bookmarks/page.tsx
/offline                         ─ SW fallback                app/(public)/offline/page.tsx

/admin/login                     ─ Login (no auth gate)       app/admin/login/page.tsx
/admin                           ─ Dashboard                  app/admin/(protected)/page.tsx
/admin/categories                ─ Categories list            app/admin/(protected)/categories/page.tsx
/admin/categories/[id]           ─ Subcategories              app/admin/(protected)/categories/[id]/page.tsx
/admin/languages                 ─ Languages CRUD             app/admin/(protected)/languages/page.tsx
/admin/tones                     ─ Tones CRUD                 app/admin/(protected)/tones/page.tsx
/admin/ai-config                 ─ Default provider/model     app/admin/(protected)/ai-config/page.tsx
/admin/stories                   ─ Stories list               app/admin/(protected)/stories/page.tsx
/admin/stories/new               ─ Create story               app/admin/(protected)/stories/new/page.tsx
/admin/stories/[id]              ─ Edit + translate           app/admin/(protected)/stories/[id]/page.tsx

POST /api/translate              ─ Single-part translate      app/api/translate/route.ts
POST /api/translate/queue        ─ SSE batch translate        app/api/translate/queue/route.ts
POST /api/upload                 ─ ImageKit cover upload      app/api/upload/route.ts
POST /api/ai/test                ─ Test connection            app/api/ai/test/route.ts

/manifest.webmanifest            ─ PWA manifest               app/manifest.ts
/sitemap.xml                     ─ Sitemap                    app/sitemap.ts
/robots.txt                      ─ Robots                     app/robots.ts
/favicon.ico, /icon0, /icon1,    ─ Icons                      app/favicon.ico, app/icon0.svg,
/apple-icon                                                   app/icon1.png, app/apple-icon.png
```

---

## Layouts

### Root: [app/layout.tsx](../../app/layout.tsx)

- Loads Inter (`--font-sans`) and Lora (`--font-serif`) via `next/font`
- Mounts [ServiceWorkerRegistration](../../components/shared/ServiceWorkerRegistration.tsx) + [InstallPrompt](../../components/shared/InstallPrompt.tsx) + sonner `<Toaster />`
- Sets `metadataBase` from `NEXT_PUBLIC_APP_URL`; ships OpenGraph + Twitter + appleWebApp metadata
- Sets viewport `themeColor: "#4F46E5"` and allows pinch-zoom (`userScalable: true`) — the reader uses it

### Public: [app/(public)/layout.tsx](../../app/(public)/layout.tsx)

A thin wrapper that mounts [PublicShell](../../components/shared/PublicShell.tsx).

#### [PublicShell](../../components/shared/PublicShell.tsx)

- **Top bar**: brand `Qissa` on the left; md+ shows nav links (Home / Search / Bookmarks)
- **Bottom nav**: 4-icon dock, mobile-only (`md:hidden`)
- **Reader-route special case:** regex `^/s/<id>(/<variantSlug>)?/p/<n>` matches both the current variant URL and the legacy single-segment shape → renders only `<main>` (no top bar, no bottom nav, no [NavProgress](../../components/shared/NavProgress.tsx)). The reader has its own [ReaderChrome](../../components/reader/ReaderChrome.tsx). The optional variant segment in the regex matters — without it, the actual reader URL falls through to the public shell and double-renders chrome.

### Admin: [app/admin/(protected)/layout.tsx](../../app/admin/(protected)/layout.tsx)

- Server Component
- Awaits [requireAdmin()](../../lib/auth/check-admin.ts) → redirects to `/admin/login` if not the admin
- Renders [AdminShell](../../components/admin/AdminShell.tsx) with the user email passed in

#### [AdminShell](../../components/admin/AdminShell.tsx)

- Sidebar nav (Dashboard, Stories, Categories, Tones, Languages, AI config) via [SidebarNav](../../components/admin/SidebarNav.tsx) Client Component (uses `usePathname` for active state)
- Email + Sign out at the bottom (plain `<form action={signOut}>`, no client JS)

Login at `/admin/login` is **outside** `(protected)/` — no redirect loop.

---

## Shared UI primitives

shadcn primitives under [components/ui/](../../components/ui/): `button`, `card`, `dialog`, `input`, `label`, `select`, `switch`, `table`, `textarea`, `badge`, `alert-dialog`, `sonner`. All import `cn` from [lib/utils/cn.ts](../../lib/utils/cn.ts) (`clsx + tailwind-merge`).

Reader-agnostic shared components under [components/shared/](../../components/shared/):

| Component | Used in | What it does |
|---|---|---|
| [StoryCard](../../components/shared/StoryCard.tsx) | home, browse, search, bookmarks | cover thumb + title in target language's reading font + tone/parts/time meta |
| [CategoryTile](../../components/shared/CategoryTile.tsx) | home, category landing | emoji + name + story count |
| [SearchBar](../../components/shared/SearchBar.tsx) | home + search | client form posting `?q=` |
| [BookmarkButton](../../components/shared/BookmarkButton.tsx) | story landing + reader top bar | heart toggle via `useSyncExternalStore` |
| [ShareButton](../../components/shared/ShareButton.tsx) | story landing + reader top bar | Web Share API + clipboard fallback |
| [ContinueReading](../../components/shared/ContinueReading.tsx) | home | localStorage-driven Resume card |
| [PartReadIndicator](../../components/shared/PartReadIndicator.tsx) | story landing parts list | ✓ / ⏳ / ○ per part |
| [InstallPrompt](../../components/shared/InstallPrompt.tsx) | root layout | Gated PWA install banner |
| [ServiceWorkerRegistration](../../components/shared/ServiceWorkerRegistration.tsx) | root layout | Registers `/sw.js` in prod |
| [Loader / PageLoader](../../components/shared/Loader.tsx) | `app/(public)/loading.tsx` + any client pending state | dotLottie animation from [public/animations/qissa-loader.lottie](../../public/animations/qissa-loader.lottie) via `@lottiefiles/dotlottie-react`. Prefer skeletons (see `components/shared/skeletons.tsx`) for SSR streaming; use Loader only where no layout exists to scaffold |

---

## Per-area docs

- [public.md](./public.md) — home, category, subcategory, search, story landing, bookmarks
- [reader.md](./reader.md) — the cockpit at `/s/<id>/p/<n>`
- [admin.md](./admin.md) — admin shell + every CRUD + story workflow
- [auth.md](./auth.md) — login, middleware (proxy), `requireAdmin()`

---

## Loading & progress

Two complementary layers give felt feedback on every navigation:

1. **Per-route [`loading.tsx`](https://nextjs.org/docs/app/api-reference/file-conventions/loading) skeletons.** Every public route has a sibling `loading.tsx` rendering a pulse-block stand-in for that page's layout. Shared primitives (`StoryCardSkeleton`, `CategoryTileSkeleton`, `ReaderParagraphSkeleton`, `TextLine`) live in [components/shared/skeletons.tsx](../../components/shared/skeletons.tsx) so per-route files stay tiny.
2. **Top progress bar — [NavProgress](../../components/shared/NavProgress.tsx).** Mounted once inside [PublicShell](../../components/shared/PublicShell.tsx) (wrapped in `<Suspense>` because it uses `useSearchParams()`). Starts on any same-origin link click, finishes when the pathname or query actually changes. **Hidden inside the reader** — the reader has its own theme-tinted chrome and a fixed primary-color bar at the top would clash. Inside the reader, prev/next links use `useLinkStatus()` to swap their chevron for a spinner instead.



| State | Owner | Doc |
|---|---|---|
| Reader settings + font size + progress + bookmarks | [lib/reader/](../../lib/reader/) | [INTERNALS/reader-state.md](../INTERNALS/reader-state.md) |
| Form/dialog local state | individual `*Dialog.tsx` files | React-19 "adjust state during render" pattern (see [INTERNALS/server-actions.md](../INTERNALS/server-actions.md)) |
| Live translate queue | [StoryEditShell](../../components/admin/StoryEditShell.tsx) `liveByPart` | [API/translate.md](../API/translate.md) |
