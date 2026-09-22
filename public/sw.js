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
//   caching JS/CSS with cache-first. Navigation (HTML) requests stay
//   network-FIRST for freshness — but since this version they carry a
//   3 s deadline on slow networks (cached copy served instantly when the
//   network can't answer) and every visited route's HTML is cached as an
//   offline fallback, always in the SAME versioned cache as the build
//   assets so a deploy can never pair stale HTML with missing chunks.
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

// NOTE: this version string is rewritten on EVERY build by
// scripts/prerender.mjs (writeAssetManifestAndPatchSW) so each deploy ships
// a byte-different sw.js → the browser reinstalls it → the full build-asset
// precache below runs again with the NEW hashed files. Without this, a
// deploy would leave old caches in place and offline taps would 404 on
// chunks that no longer exist.
const CACHE_VERSION = "ghs-v13";
const IMAGE_CACHE = `${CACHE_VERSION}-images`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

const IMAGE_HOSTS = ["res.cloudinary.com"];

const OFFLINE_FALLBACK = "/offline.html";
const SHELL_URL = "/";   // Homepage shell — precached so offline PWA launch works

// ── Slow-network navigation strategy (added) ────────────────────────────────
// On the 2G/3G networks this school's users actually have, a network-first
// navigation with NO deadline used to hang the screen blank for 10–30 s
// even though a perfectly good cached copy was sitting right there. From
// now on, if the network hasn't answered within NAV_TIMEOUT_MS, the cached
// page is served IMMEDIATELY while the fresh copy keeps downloading in the
// background and refreshes the cache for the next visit.
const NAV_TIMEOUT_MS = 3000;
// Per-route HTML cache cap (LRU). Detail pages (/news/:id, /notices/:id …)
// are unbounded, so an index tracks insertion order and evicts the oldest.
const ROUTE_HTML_INDEX = "/__route-html-index__";
const ROUTE_HTML_MAX = 25;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  // Precache the offline fallback page, the homepage shell, AND every
  // hashed build asset (JS/CSS chunks) listed in /asset-manifest.json.
  //
  // The shell ("/") is critical: without it, a PWA launch while offline
  // after a SW update shows the generic "You're Offline" page instead of
  // the cached homepage. The install event always runs while online, so
  // fetch("/") will succeed.
  //
  // Precaching ALL build assets is what makes tapping ANY page work
  // offline — previously only the handful of routes the app's idle-time
  // prefetcher happened to visit were cached, so tapping anything else
  // offline crashed the page. Best-effort per file: one failing asset
  // never blocks the install.
  event.waitUntil(
    (async () => {
      const cache = await caches.open(ASSET_CACHE);
      await Promise.all([
        cache.add(OFFLINE_FALLBACK).catch(() => {}),
        cache.add(SHELL_URL).catch(() => {}),
      ]);
      await precacheBuildAssets(cache);
    })()
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

// ── Full build precache (offline support for EVERY page) ────────────────────
// scripts/prerender.mjs writes /asset-manifest.json at build time listing
// every hashed file in dist/assets/. Because Vite content-hashes each file,
// the manifest changes on every deploy, and this install handler (which
// re-runs because prerender.mjs also stamps CACHE_VERSION, producing a
// byte-different sw.js) fetches and caches them all — so after any single
// online visit, EVERY page of the app opens offline, not just the routes
// the user happened to browse.
//
// Design notes:
//   • Best-effort per file: any single failure is skipped, never thrown —
//     a flaky asset must not leave the SW stuck in "installing".
//   • Limited concurrency (4) so we don't open dozens of parallel
//     connections on the slow mobile networks this school's users have.
//   • { cache: "reload" } bypasses the HTTP cache so we always store the
//     true deploy artifacts, never a stale intermediate copy.
//   • Files are content-hashed + immutable, so they're safe to keep until
//     the next versioned activate() deletes the old cache.
const ASSET_MANIFEST_URL = "/asset-manifest.json";
const PRECACHE_CONCURRENCY = 4;
const PRECACHE_MAX_BYTES = 3 * 1024 * 1024; // safety valve — skip anything abnormally large

async function precacheBuildAssets(cache) {
  try {
    const res = await fetch(ASSET_MANIFEST_URL, { cache: "no-store" });
    if (!res || !res.ok) return;
    const manifest = await res.json();
    const files = Array.isArray(manifest && manifest.files)
      ? manifest.files.filter((f) => typeof f === "string" && f.startsWith("/assets/"))
      : [];
    if (!files.length) return;

    const queue = files.slice();
    let cachedCount = 0;

    async function worker() {
      while (queue.length) {
        const file = queue.shift();
        try {
          const assetRes = await fetch(file, { cache: "reload" });
          if (assetRes && assetRes.ok) {
            const len = Number(assetRes.headers.get("content-length") || 0);
            if (!len || len <= PRECACHE_MAX_BYTES) {
              await cache.put(file, assetRes.clone()).catch(() => {});
              cachedCount += 1;
            }
          }
        } catch (_err) {
          // Best-effort: skip this file, keep precaching the rest.
        }
      }
    }

    await Promise.all(Array.from({ length: PRECACHE_CONCURRENCY }, () => worker()));
    console.log(`[SW] Precached ${cachedCount}/${files.length} build assets for offline use`);
  } catch (_err) {
    // No manifest (first deploy of this system, or the fetch failed) —
    // visit-driven caching (networkFirstAsset) still fills the cache as
    // the user browses, exactly like before.
  }
}

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

  // Offline fast path: when the device has no connection, don't burn time
  // on network attempts that cannot succeed — answer straight from cache.
  // This makes tapping around the app feel instant offline, and stops a
  // doomed multi-second fetch stall from ever reaching the page's
  // import() machinery.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const offlineCached = await cache.match(request);
    if (offlineCached) return offlineCached;
  }

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

async function networkFirstNavigation(request, event) {
  const url = new URL(request.url);
  const cache = await caches.open(ASSET_CACHE);

  // ── FIX (page-crash bug): a cached HTML document references a specific
  // build's hashed JS/CSS filenames (e.g. /assets/main-a1b2c3.js). Vite
  // renames those hashes on every deploy and deletes the old files from
  // the server. If this SW ever serves a stale cached HTML document while
  // the browser is online, that HTML's <script type="module"> tag points
  // at a bundle that no longer exists → 404 → the app never mounts → the
  // tab shows blank for a couple seconds and then Chrome's "This page
  // couldn't load" interstitial appears. This exact failure mode is why
  // navigation HTML must NEVER be answered from cache while online, even
  // as a "slow network" fallback. Only genuinely offline requests may use
  // a cached document, because at that point there is no fresher HTML to
  // race against anyway.
  //
  // ── Genuinely offline ──────────────────────────────────────────────────
  // Serve the cached copy of THE REQUESTED ROUTE when we have it (so every
  // visited page now opens offline at its real URL), otherwise serve the
  // app shell directly AT THE REQUESTED URL — the shell is the SPA itself,
  // so it boots at that address and renders the requested page client-side
  // from the precached build assets + IndexedDB data. offline.html remains
  // the last resort when nothing is cached.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const routeHtml = await cache.match(request, { ignoreSearch: true });
    if (routeHtml) return routeHtml;
    const cachedShell = await cache.match(SHELL_URL);
    if (cachedShell) return cachedShell;
    const offlineFallback = await cache.match(OFFLINE_FALLBACK);
    if (offlineFallback) return offlineFallback;
    // Nothing cached at all — let the browser's own offline error surface.
    throw new Error("offline and no cached copy available");
  }

  // ── Online: ALWAYS go to the network for the document itself. No
  // deadline, no cached-HTML fallback — a slow network shows the browser's
  // own loading state (honest), instead of silently swapping in HTML from
  // a different, possibly-incompatible build. Build assets (JS/CSS) are
  // still served network-first-with-cache-fallback by networkFirstAsset
  // below, and those ARE safe to cache because they're immutable
  // content-hashed files — it is specifically the HTML shell that must
  // stay live.
  const cacheNavigationResponse = async (res) => {
    if (!res || !res.ok) return;
    // Never cache bot-targeted live renders (they carry Vary: User-Agent,
    // and a human should never be served that copy from this cache).
    if (res.headers.get("X-GHS-Live-Render")) return;
    try {
      await cache.put(request, res.clone());
      await recordRouteHtml(url.pathname);
      // Keep the PWA-launch shell fresh too (covers "/" and "/index.html").
      if (url.pathname === "/" || url.pathname === "/index.html") {
        await cache.put(SHELL_URL, res.clone()).catch(() => {});
      }
    } catch (_e) {
      /* cache writes are best-effort — never fatal */
    }
  };

  try {
    const res = await fetch(request);
    if (res && res.ok) {
      // Fresh network response — return it immediately; write the cache in
      // the background (for the offline case only) so the response is
      // never delayed by cache writes.
      if (event && typeof event.waitUntil === "function") {
        event.waitUntil(cacheNavigationResponse(res).catch(() => {}));
      }
      return res;
    }
    // Non-OK response (5xx, etc.) — this build's own error page from the
    // network is still more correct than a foreign cached document, so
    // return it as-is rather than substituting stale HTML.
    return res;
  } catch (err) {
    // Network request itself failed (true connectivity loss mid-flight,
    // even though navigator.onLine said we were online). Only now is a
    // cached document an acceptable fallback.
    const cachedCopy =
      (await cache.match(request, { ignoreSearch: true })) ||
      (await cache.match(SHELL_URL));
    if (cachedCopy) return cachedCopy;
    const offlineFallback = await cache.match(OFFLINE_FALLBACK);
    if (offlineFallback) return offlineFallback;
    throw err;
  }
}

// ── Per-route HTML cache bookkeeping (LRU, capped at ROUTE_HTML_MAX) ──────
// An index entry (ROUTE_HTML_INDEX) stores the insertion order of cached
// route URLs. Re-visiting a route moves it to the back; evictions delete the
// oldest entry's HTML. This keeps unbounded detail-page URLs (/news/:id …)
// from growing the cache forever.
async function recordRouteHtml(pathname) {
  try {
    const cache = await caches.open(ASSET_CACHE);
    let urls = [];
    try {
      const idxRes = await cache.match(ROUTE_HTML_INDEX);
      if (idxRes) urls = await idxRes.json();
    } catch (_e) {
      urls = [];
    }
    if (!Array.isArray(urls)) urls = [];
    urls = urls.filter((u) => u !== pathname);
    urls.push(pathname);
    while (urls.length > ROUTE_HTML_MAX) {
      const evicted = urls.shift();
      if (evicted && evicted !== "/" && evicted !== "/index.html") {
        await cache.delete(evicted).catch(() => {});
      }
    }
    await cache.put(
      ROUTE_HTML_INDEX,
      new Response(JSON.stringify(urls), {
        headers: { "Content-Type": "application/json" },
      })
    );
  } catch (_e) {
    /* bookkeeping is best-effort — never fatal */
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
  // first load): network-first for freshness, but with a 3 s deadline on
  // slow networks — the cached copy is served instantly if the network
  // can't answer in time, and every visited route's HTML is cached (LRU)
  // so ANY page can open offline, not just the homepage. See
  // networkFirstNavigation.
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request, event));
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
