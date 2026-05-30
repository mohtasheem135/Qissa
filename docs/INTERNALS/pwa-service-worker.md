# Internals — PWA / Service Worker

> Manual `public/sw.js` (no @serwist/next yet). Manifest via `app/manifest.ts`. Install prompt is gated.

---

## Files

| File | Purpose |
|---|---|
| [public/sw.js](../../public/sw.js) | The service worker — runtime caching strategies |
| [components/shared/ServiceWorkerRegistration.tsx](../../components/shared/ServiceWorkerRegistration.tsx) | Registers `sw.js` (production only) — mounted in root layout |
| [components/shared/InstallPrompt.tsx](../../components/shared/InstallPrompt.tsx) | Gated install banner — mounted in root layout |
| [app/manifest.ts](../../app/manifest.ts) | PWA manifest served at `/manifest.webmanifest` |
| [app/favicon.ico](../../app/favicon.ico), [app/icon0.svg](../../app/icon0.svg), [app/icon1.png](../../app/icon1.png), [app/apple-icon.png](../../app/apple-icon.png), [public/icons/*](../../public/icons/) | Icons — generated via realfavicongenerator.net |
| [app/(public)/offline/page.tsx](../../app/(public)/offline/page.tsx) | Fallback page the SW serves when nav fails |

---

## Why manual SW (not @serwist/next)

Serwist provides nice-to-haves like build-asset precaching and Workbox internals, but Next 16 compat wasn't settled at MVP time. The manual SW is ~80 lines, has no build coupling, and covers all our needs:

- Runtime caching of HTML / images / static assets
- Network-only for admin + API + RSC navs (we don't want stale admin pages)
- Offline fallback via a pre-rendered `/offline` route

Trade-off: the first visit to each new route still has to fetch JS chunks (no precaching). For our scale, acceptable. Phase 1.5 can switch to Serwist if precaching becomes useful.

---

## Caching strategy

```js
const CACHE_VERSION = "qissa-v5";
const HTML_CACHE = `${CACHE_VERSION}-html`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;
const AUDIO_CACHE = `${CACHE_VERSION}-audio`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const OFFLINE_URL = "/offline";
```

Bumping the version (now `v5`) invalidates all caches — the `activate` handler deletes any cache whose name doesn't start with the current prefix.

Per-request decision tree in `fetch` handler:

```
if method !== GET           → don't intercept
if /admin/* or /api/*       → don't intercept (network-only)
if RSC nav (header RSC=1)   → don't intercept
if navigation request       → network-first → cache fallback → /offline
if ImageKit OR image dest   → cache-first
if R2 host OR audio dest    → cache-first (premium narration replays offline)
if script/style/font dest   → stale-while-revalidate
otherwise                   → don't intercept (default fetch)
```

**Audio note:** `handleAudio` matches by URL and, on a cache miss, fetches a
**full (non-range) copy** to cache (`fetch(request.url)` drops the `Range`
header) — media elements accept a 200 full body even when they sent a range
request, and a fully-cached file is what replays offline. R2 hosts are matched
by `r2.dev` / `r2.cloudflarestorage.com` (the SW can't read `NEXT_PUBLIC_*`).
It's an ordinary (cors) `fetch`, so the **R2 bucket's CORS policy must allow the
app origins** (`http://localhost:3000`, `https://*.vercel.app`) for `GET`/`HEAD`,
allow the `Range` request header, and expose `Content-Range` / `Accept-Ranges` /
`Content-Length`. Without that the SW fetch is blocked (a `sw.js`-initiated
`CORS error` on the `.wav`/`.mp3` while the direct request is 200) — fix the
bucket policy.

`/offline` is added to the HTML cache during `install` so it's available even if the user is offline on their first SW activation.

---

## Registration

[components/shared/ServiceWorkerRegistration.tsx](../../components/shared/ServiceWorkerRegistration.tsx) is a Client Component that:

1. Skips on the server (`typeof window === "undefined"`)
2. Skips in dev (`process.env.NODE_ENV !== "production"`) — so HMR + Turbopack don't fight a stale cache
3. Registers `/sw.js` after the `load` event (or immediately if already loaded)

To test locally: `npm run build && npm run start`, then DevTools → Application → Service Workers.

---

## Install prompt — [components/shared/InstallPrompt.tsx](../../components/shared/InstallPrompt.tsx)

Custom banner shown bottom-of-viewport. Gating, all client-side:

1. Skip if already installed: `window.matchMedia("(display-mode: standalone)").matches`
2. Skip if dismissed in the last 7 days: `qissa:installPromptDismissedAt` cooldown
3. Skip if user hasn't read a story yet: `qissa:last-read === null`
4. Otherwise listen for the browser's `beforeinstallprompt` event; when it fires, render

On "Install" click, calls `deferred.prompt()` and awaits `deferred.userChoice`. Either outcome resets the 7-day cooldown so we don't re-prompt soon. On "Not now" / X, only the cooldown is set.

> The `beforeinstallprompt` event is Chromium-only. Safari (desktop + iOS) never fires it, so the banner is silent there — iOS users install via Share → Add to Home Screen. The manifest's `appleWebApp` metadata (set in [app/layout.tsx](../../app/layout.tsx)) makes that flow work properly.

---

## Manifest — [app/manifest.ts](../../app/manifest.ts)

```ts
{
  name: "Qissa — Stories, translated with soul",
  short_name: "Qissa",
  start_url: "/",
  display: "standalone",
  background_color: "#f5d399",
  theme_color: "#f5d399",
  orientation: "portrait",
  categories: ["books", "education", "lifestyle"],
  icons: [
    { src: "/icons/web-app-manifest-192x192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/icons/web-app-manifest-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
}
```

`theme_color` matches the viewport `themeColor` set in [app/layout.tsx](../../app/layout.tsx) → drives the Android address bar color.

---

## Icons

| File | Used as | Notes |
|---|---|---|
| [app/favicon.ico](../../app/favicon.ico) | Legacy favicon (auto-injected by Next) | Multi-resolution ICO bundle |
| [app/icon0.svg](../../app/icon0.svg) | Favicon (`<link rel="icon">` auto-injected by Next) | Vector with embedded raster — ~2.5 MB |
| [app/icon1.png](../../app/icon1.png) | Raster favicon fallback (auto-injected, alongside icon0) | 96×96 |
| [app/apple-icon.png](../../app/apple-icon.png) | `apple-touch-icon` (auto-injected) | 180×180, no rounded corners (iOS adds them) |
| [public/icons/web-app-manifest-192x192.png](../../public/icons/web-app-manifest-192x192.png) | Manifest icon | 192×192, maskable |
| [public/icons/web-app-manifest-512x512.png](../../public/icons/web-app-manifest-512x512.png) | Manifest icon | 512×512, maskable — source artwork pads the 80% safe zone so Android adaptive masks crop cleanly |

Generated via [realfavicongenerator.net](https://realfavicongenerator.net) on 2026-05-28 from the brand artwork (book + calligraphic qaf, warm parchment `#f5d399`).

---

## Offline page — [app/(public)/offline/page.tsx](../../app/(public)/offline/page.tsx)

Statically pre-rendered. Served by the SW when nav fails AND the requested URL isn't cached. Has Home + Bookmarks links (Bookmarks works offline because it's pure client-side localStorage).

---

## How to verify

After `npm run build && npm run start`:

1. **DevTools → Application → Manifest** — Qissa name, theme color, icons present
2. **DevTools → Application → Service Workers** — `sw.js` registered + activated
3. **DevTools → Network → throttle to Offline** → reload the page → previously-visited URL serves from cache; new URL falls back to `/offline`
4. **Read one story** then reload — install prompt appears within seconds (Chromium only)
5. **DevTools → Application → Storage → Cache Storage** — four caches: `qissa-v5-html`, `qissa-v5-images`, `qissa-v5-audio`, `qissa-v5-static`

---

## Phase 1.5 polish

- PNG icon variants (192/512/maskable/Apple)
- Switch to `@serwist/next` for build-asset precaching → faster first-visit for chunks
- Add `background_sync` for bookmark / progress writes (currently localStorage-only)
- Push notifications for new stories (the manifest doesn't request them yet)
