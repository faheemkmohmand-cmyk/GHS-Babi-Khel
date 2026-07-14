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

const CACHE_VERSION = "ghs-v6";
const IMAGE_CACHE = `${CACHE_VERSION}-images`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

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
  try {
    const res = await fetch(request.clone());
    if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return fetch(request);
  }
}

const SHELL_URL = "/";

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
    // No shell cached yet (first-ever visit was offline) — nothing we can
    // do, let the browser show its normal offline error.
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3D Hall fast-loader — stale-while-revalidate for Hall_3D.html ONLY
// ─────────────────────────────────────────────────────────────────────────────
// The 3D Hall (public/Hall_3D.html) is a single ~820 KB static HTML file.
// On a slow connection (100 KB/s), that's ~8 seconds of blocking download
// before the 3D scene can even start building.
//
// This handler uses the stale-while-revalidate strategy for the HTML file
// itself: on every navigation to /Hall_3D.html, check the cache FIRST. If
// there's a cached copy, return it IMMEDIATELY (instant load) AND fire a
// background fetch to update the cache for next time. If there's no cached
// copy (first visit), go to the network and cache the response.
//
// CRITICAL — what we do NOT cache here, and why:
//   ✗ We do NOT cache the Three.js / OrbitControls / BufferGeometryUtils /
//     qrcode-generator CDN module/script fetches.
//
//   Reason: ES module imports are EXTREMELY strict about response headers
//   (Content-Type MUST be application/javascript, CORS headers must be
//   exactly right, etc.). A service-worker-cached response with slightly
//   different headers — even just a missing Access-Control-Allow-Origin —
//   makes the import SILENTLY HANG. No error, no fallback, just "Building
//   3D Hall…" forever. This was the cause of the hang on refresh.
//
//   Instead, we let the browser fetch CDN modules normally. jsdelivr
//   already sends Cache-Control: public, max-age=31536000, immutable for
//   versioned npm packages (three@0.160.0, qrcode-generator@1.4.4), so
//   the browser's built-in HTTP cache handles repeat-visit speed for the
//   libs perfectly — no service worker needed, and no hang risk.
//
// This does NOT touch the existing navigation handler for /, /about,
// /news, etc. — those still use networkFirstNavigation. It only
// short-circuits /Hall_3D.html specifically.
const HALL3D_CACHE = `${CACHE_VERSION}-hall3d`;
const HALL3D_HTML_PATH = "/Hall_3D.html";

function isHall3DNavigation(url) {
  return url.pathname === HALL3D_HTML_PATH || url.pathname === HALL3D_HTML_PATH.toLowerCase();
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(HALL3D_CACHE);
  const cached = await cache.match(request);

  // Fire the background revalidate (non-blocking). Whatever happens here
  // has zero effect on the response we return below.
  const networkFetch = fetch(request).then((res) => {
    // Only cache valid responses. For HTML navigations, res.ok (status
    // 200-299) is the right check — we do NOT want to cache error pages
    // or opaque redirects.
    if (res && res.ok && res.type !== "opaque") {
      cache.put(request, res.clone()).catch(() => {});
    }
    return res;
  }).catch(() => null);

  // Return cached instantly if we have it; otherwise wait for network.
  if (cached) {
    return cached;
  }
  // First-ever visit: no cache, must wait for network.
  const networkRes = await networkFetch;
  if (networkRes) return networkRes;
  // Network failed and no cache — let the browser show its error.
  throw new Error("Network failed and no cache available for " + request.url);
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

  // ── 3D Hall fast-loader: stale-while-revalidate for /Hall_3D.html ONLY.
  // This MUST come before the navigation check below, because /Hall_3D.html
  // IS a navigation request — we want to short-circuit it here with SWR
  // instead of letting it fall through to networkFirstNavigation (which
  // would redirect offline users to the homepage shell, breaking the 3D
  // Hall on offline repeat visits).
  //
  // NOTE: CDN module/script requests (three.module.js, qrcode.min.js) are
  // intentionally NOT intercepted here — see the comment above
  // staleWhileRevalidate for why. They fall through to the browser's
  // normal fetch (which uses jsdelivr's HTTP cache for repeat visits).
  if (isHall3DNavigation(url)) {
    event.respondWith(staleWhileRevalidate(request));
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
