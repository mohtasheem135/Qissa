/**
 * Qissa service worker.
 *
 * Strategy summary (per docs/03-implementation-plan.md §Phase 10):
 *   - /admin/*, /api/*       network-only (skip)
 *   - navigation requests    network-first → cache → /offline
 *   - ImageKit / images      cache-first (long-lived)
 *   - R2 / audio             cache-first (premium narration replays offline)
 *   - JS / CSS / fonts       stale-while-revalidate
 *
 * Bump CACHE_VERSION to invalidate all caches on the next activation.
 * The `activate` handler deletes caches that don't start with this prefix.
 */

const CACHE_VERSION = "qissa-v2";
const HTML_CACHE = `${CACHE_VERSION}-html`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;
const AUDIO_CACHE = `${CACHE_VERSION}-audio`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(HTML_CACHE).then((cache) => cache.add(OFFLINE_URL)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(CACHE_VERSION))
            .map((key) => caches.delete(key)),
        ),
      ),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Don't intercept admin / API / RSC payloads or Next's HMR endpoints.
  if (url.pathname.startsWith("/admin")) return;
  if (url.pathname.startsWith("/api")) return;
  if (url.pathname.startsWith("/_next/webpack-hmr")) return;
  // RSC requests for navigation (Next 16): keep network-only.
  if (request.headers.get("RSC") === "1") return;

  // 1) Navigation requests → network-first, fallback to cache, then /offline.
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(handleNavigation(request));
    return;
  }

  // 2) ImageKit / generic images → cache-first.
  if (url.hostname.includes("imagekit.io") || request.destination === "image") {
    event.respondWith(handleImage(request));
    return;
  }

  // 2b) R2 / audio → cache-first so premium narration replays offline.
  if (
    request.destination === "audio" ||
    url.hostname.includes("r2.dev") ||
    url.hostname.includes("r2.cloudflarestorage.com")
  ) {
    event.respondWith(handleAudio(request));
    return;
  }

  // 3) JS / CSS / fonts → stale-while-revalidate.
  if (
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "font"
  ) {
    event.respondWith(handleStaticAsset(request));
    return;
  }
});

async function handleNavigation(request) {
  try {
    const fresh = await fetch(request);
    if (fresh.ok) {
      const cache = await caches.open(HTML_CACHE);
      cache.put(request, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

async function handleImage(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh.ok) {
      const cache = await caches.open(IMAGE_CACHE);
      cache.put(request, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch {
    return cached || Response.error();
  }
}

async function handleAudio(request) {
  const cache = await caches.open(AUDIO_CACHE);
  // Match by URL so a ranged replay still resolves the cached full file.
  const cached = await cache.match(request.url);
  if (cached) return cached;
  try {
    // Fetch a full (non-range) copy so the file is replayable offline. Media
    // elements accept a 200 full body even when they sent a Range request.
    const fresh = await fetch(request.url);
    if (fresh.ok) {
      cache.put(request.url, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch {
    return cached || Response.error();
  }
}

async function handleStaticAsset(request) {
  const cached = await caches.match(request);
  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) {
        caches
          .open(STATIC_CACHE)
          .then((cache) => cache.put(request, response.clone()))
          .catch(() => {});
      }
      return response;
    })
    .catch(() => cached);
  return cached || networkFetch;
}
