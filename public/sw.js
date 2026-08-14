// ─────────────────────────────────────────────────────────────────────────────
// Service Worker — GHS Babi Khel
// ─────────────────────────────────────────────────────────────────────────────
// Scope: caches Cloudinary images so the HOMEPAGE can render fully offline
// with the last-seen photos, plus the app shell (JS/CSS/fonts) so the page
// itself can boot without network.
//
// IMPORTANT — history of two prior failures, both now fixed by simplifying:
//
//   Failure 1 (original SW, pre-this-project): served STALE cached JS
//   chunks after a deploy, hanging pages on refresh. Fixed by NEVER
//   caching JS/CSS with cache-first, and never touching navigation (HTML)
//   requests at all — those always go straight to network.
//
//   Failure 2 (v1 of this file): intercepted image requests with
//   event.respondWith() and returned whatever the SW's own fetch() got
//   back. Cross-origin opaque responses and edge cases in that logic
//   caused logo/banner/gallery images to render as broken icons — because
//   respondWith() controls EXACTLY what bytes the <img> tag receives, so
//   any mistake in that response is a broken image, full stop.
//
//   Fix: images are no longer intercepted with respondWith() at all. The
//   browser loads every image exactly as it always did — completely
//   untouched by this service worker, so it is now IMPOSSIBLE for this
//   file to break an image the way it did before. Caching for offline use
//   still happens, but passively: a separate background fetch (that the
//   page never sees or depends on) stores a copy for next time.
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_VERSION = "ghs-v10";
const IMAGE_CACHE = `${CACHE_VERSION}-images`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

const IMAGE_HOSTS = ["res.cloudinary.com"];

const OFFLINE_FALLBACK = "/offline.html";
const SHELL_URL = "/";   // Homepage shell — precached so offline PWA launch works

self.addEventListener("install", (event) => {
  self.skipWaiting();
  // Precache BOTH the offline fallback page AND the homepage shell.
  // The shell ("/") is critical: without it, a PWA launch while offline
  // after a SW update shows the generic "You're Offline" page instead of
  // the cached homepage. The install event always runs while online, so
  // fetch("/") will succeed. The .catch() handles edge cases gracefully.
  event.waitUntil(
    caches.open(ASSET_CACHE).then((cache) => {
      return Promise.all([
        cache.add(OFFLINE_FALLBACK).catch(() => {}),
        cache.add(SHELL_URL).catch(() => {}),
      ]);
    })
  );
});

// Explicit handshake with the page (see src/main.tsx): if a tab is open
// when a new version installs, the page tells us to take over immediately
// rather than waiting for every tab to close naturally — which on mobile
// can take days and leaves the OLD, buggy worker serving requests the
// whole time.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          // Delete any cache from a PREVIOUS version (ghs-v5-*) but keep
          // the current version's caches (ghs-v6-images, ghs-v6-assets,
          // ghs-v6-hall3d). This also cleans up the stale ghs-v5-hall3d
          // cache that may contain broken CDN module responses from the
          // prior buggy SW that intercepted CDN assets.
          .filter((k) => k.startsWith("ghs-") && !k.startsWith(`${CACHE_VERSION}-`))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// NOTE on precaching About/Contact/News/Notices' JS chunks: this service
// worker deliberately does NOT try to guess and precache their filenames
// here, because Vite content-hashes every chunk (e.g. About-a1b2c3.js) and
// that hash changes on every build — a static sw.js has no reliable way to
// know it. Precaching those chunks proactively (so they work offline even
// on a first visit) is instead done from the app side, in src/App.tsx,
// via ordinary import() calls once the homepage is idle — see
// prefetchOfflineRoutes() there. Those import() calls are regular fetches
// that pass through the networkFirstAsset handler below exactly like a
// real visit would, which is what actually warms the cache.

function isImageRequest(url) {
  if (IMAGE_HOSTS.includes(url.hostname)) return true;
  return /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(url.pathname);
}

function isBuildAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith("/assets/");
}

// Passive background caching — fired alongside the real request, never
// gates or replaces it. Whatever happens in here has zero effect on what
// the browser actually displays, because we never call respondWith() for
// images (see fetch handler below).
function cacheImageInBackground(request) {
  caches.open(IMAGE_CACHE).then((cache) => {
    fetch(request)
      .then((res) => {
        if (res) cache.put(request, res).catch(() => {});
      })
      .catch(() => {});
  }).catch(() => {});
}

async function networkFirstAsset(request) {
  const cache = await caches.open(ASSET_CACHE);

  // Small retry helper — mobile networks (switching WiFi <-> 4G, brief
  // signal drops) frequently cause a SINGLE fetch attempt to fail with a
  // generic TypeError even though the network is fine a moment later.
  // Previously this function had only ONE fallback fetch with no retry,
  // so a momentary hiccup rejected straight through to whatever called
  // fetch() — for JS chunks loaded via dynamic import() (e.g. the
  // GraphingCalculator / ConceptMap interactive blocks), that meant
  // React.lazy saw a rejected promise and the block's error boundary
  // fired, even though the app's own retryableImport() retry logic never
  // got a chance to run because the failure happened here, one layer
  // below it. Retrying INSIDE the service worker means the page-level
  // code never even observes the transient failure.
  async function fetchWithRetry(req, attempts = 3) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(req.clone ? req.clone() : req);
        if (res && res.ok) return res;
        // Non-OK response (e.g. a transient 5xx from a CDN edge) — treat
        // like a failure and retry rather than caching/returning it.
        lastErr = new Error(`Bad response: ${res && res.status}`);
      } catch (err) {
        lastErr = err;
      }
      if (i < attempts - 1) {
        // Short, fixed backoff — these are JS chunks blocking a visible
        // UI element, so we keep total retry time small (≈450ms worst
        // case) rather than doing slow exponential backoff.
        await new Promise((r) => setTimeout(r, 150 * (i + 1)));
      }
    }
    throw lastErr;
  }

  try {
    const res = await fetchWithRetry(request);
    cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Last resort — one final unguarded attempt so the browser's own
    // error (not ours) is what ultimately surfaces, if it must.
    return fetch(request);
  }
}

async function networkFirstNavigation(request) {
  try {
    // Fire the real network request FIRST, with nothing in front of it.
    // (Previously this awaited caches.open() before fetching at all, which
    // added a real, measurable delay to every single navigation — even
    // fast online ones — because it forced the browser to wait on the
    // Cache API before starting the network request instead of the two
    // racing. That was the cause of the extra load delay after tapping a
    // Google search result.)
    const res = await fetch(request);

    // Only touch the cache AFTER we already have the network response in
    // hand — this can't slow down what the browser is waiting for, since
    // we return `res` immediately and cache-writing happens in the
    // background without being awaited.
    if (res && res.ok) {
      const url = new URL(request.url);
      if (url.pathname === "/" || url.pathname === "/index.html") {
        caches.open(ASSET_CACHE).then((cache) => {
          cache.put(SHELL_URL, res.clone()).catch(() => {});
        }).catch(() => {});
      }
    }
    return res;
  } catch (err) {
    // Genuinely offline. Per product decision: any offline landing (typed
    // URL, bookmark, hard refresh — regardless of path) shows the
    // HOMEPAGE, not the originally-requested route. Once there, in-app
    // clicks to About/News/Notices/Contact work instantly and offline,
    // because those become client-side route swaps inside the already
    // -loaded SPA (no new navigation request), with data already restored
    // from IndexedDB (src/lib/queryPersist.ts) and their JS chunks cached
    // by networkFirstAsset from any prior visit.
    //
    // A plain cached-HTML response would keep the browser's address bar on
    // the original URL (e.g. /about), and BrowserRouter reads that address
    // bar on mount — so it would render About, not the homepage. To
    // actually land on the homepage, redirect the navigation to "/" first;
    // the browser then requests "/", which this same handler serves from
    // cache below.
    const url = new URL(request.url);
    if (url.pathname !== "/" && url.pathname !== "/index.html") {
      return Response.redirect(SHELL_URL, 302);
    }
    const cache = await caches.open(ASSET_CACHE);
    const cachedShell = await cache.match(SHELL_URL);
    if (cachedShell) return cachedShell;
    // No shell cached yet — serve the offline fallback page instead of
    // throwing an error (which shows "This site can't be reached").
    // This is critical for PWA launches when the user has never visited
    // while online, or after a cache clear.
    const offlineFallback = await cache.match(OFFLINE_FALLBACK);
    if (offlineFallback) return offlineFallback;
    // Absolute last resort: if even the offline page isn't cached,
    // try a direct fetch (will fail and show browser's own offline page).
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch (_e) {
    return;
  }

  // Navigation requests (typed URL, bookmark, hard refresh, or the very
  // first load): try network first for freshness, fall back to the cached
  // homepage shell only if genuinely offline. See networkFirstNavigation.
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isImageRequest(url)) {
    // Do NOT call event.respondWith() for images. Let the browser load the
    // image exactly as it normally would — this service worker never sits
    // between the page and the image response, so it CANNOT break an
    // image the way the previous version did. We only piggyback a
    // best-effort background copy into cache for offline use later.
    cacheImageInBackground(request.clone());
    return;
  }

  if (isBuildAsset(url)) {
    event.respondWith(networkFirstAsset(request));
    return;
  }

  // Everything else (Supabase API calls, fonts, CDN module/script fetches
  // for the 3D Hall, etc.) — let the browser handle it normally. The
  // browser's HTTP cache handles repeat-visit speed for static CDN
  // assets; data caching for the app is handled by React Query's
  // persisted cache (see src/lib/queryPersist.ts).
});
