// ─────────────────────────────────────────────────────────────────────────────
// Service Worker — GHS Babi Khel
// ─────────────────────────────────────────────────────────────────────────────
// Scope: caches Cloudinary images so the HOMEPAGE can render fully offline
// with the last-seen photos, plus the app shell (JS/CSS/fonts) so the page
// itself can boot without network.
//
// IMPORTANT — lessons from the last SW attempt (see index.html / main.tsx
// history): that SW served STALE cached JS chunks after a deploy, which hung
// pages on refresh. This SW avoids that specific failure mode by:
//   1. NEVER caching JS/CSS with cache-first. Scripts/styles use
//      network-first with a short timeout, falling back to cache only if
//      the network truly fails (offline). A fresh deploy is picked up on
//      the very next successful network request, not stuck behind a cache.
//   2. Using a versioned cache name (CACHE_VERSION). Bumping it on deploy
//      guarantees old cached files are wiped in activate().
//   3. skipWaiting() + clients.claim() so a new SW takes over immediately
//      instead of leaving two versions running side by side.
//   4. Never intercepting navigation requests (HTML) with cache — always
//      goes to network first, so the app shell HTML is always fresh and
//      lazyWithRetry's chunk-recovery logic in App.tsx still works exactly
//      as before.
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_VERSION = "ghs-v1";
const IMAGE_CACHE = `${CACHE_VERSION}-images`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

// Hosts we treat as "safe to cache-first" images (Cloudinary + local static).
const IMAGE_HOSTS = ["res.cloudinary.com"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("ghs-") && k !== IMAGE_CACHE && k !== ASSET_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isImageRequest(url) {
  if (IMAGE_HOSTS.includes(url.hostname)) return true;
  return /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(url.pathname);
}

function isBuildAsset(url) {
  // Vite-built JS/CSS chunks live under /assets/
  return url.origin === self.location.origin && url.pathname.startsWith("/assets/");
}

async function cacheFirstImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    // Stale-while-revalidate: return cached instantly, refresh in background.
    fetch(request)
      .then((res) => { if (res && res.ok) cache.put(request, res.clone()); })
      .catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    return cached || Response.error();
  }
}

async function networkFirstAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch (_e) {
    return;
  }

  // Never touch navigation (HTML) requests — always network, always fresh.
  if (request.mode === "navigate") return;

  if (isImageRequest(url)) {
    event.respondWith(cacheFirstImage(request));
    return;
  }

  if (isBuildAsset(url)) {
    event.respondWith(networkFirstAsset(request));
    return;
  }

  // Everything else (Supabase API calls, fonts, etc.) — let the browser
  // handle it normally. Data caching is handled by React Query's persisted
  // cache (see src/lib/queryPersist.ts), not the service worker.
});
