import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE WORKER — re-enabled for homepage offline support
// ─────────────────────────────────────────────────────────────────────────────
// History: VitePWA's SW previously served stale/broken cached JS chunks,
// breaking interactive components on mobile. It was removed and every load
// force-unregistered any leftover SW.
//
// This is a NEW, hand-written SW (public/sw.js) built specifically to avoid
// that failure mode: it never cache-first's JS/CSS or HTML navigation, only
// Cloudinary images (cache-first + background refresh) and build assets
// (network-first, cache only as an offline fallback). See public/sw.js for
// the full reasoning.
//
// CRITICAL FIX FOR PAGE REFRESH ISSUE:
// Previously, this file called window.location.reload() when the service worker
// controller changed. This caused the ENTIRE page to refresh whenever:
// - A new service worker was installed
// - The service worker updated
// - Network conditions triggered a SW update check
//
// This was the #1 cause of unwanted page refreshes during editing/interaction.
// The new approach uses "soft activation" — the new SW takes over silently
// without disturbing the user's current work. The next natural navigation
// (page load, link click) will use the new SW automatically.
//
// Registered only after the page has fully loaded, so it can never delay
// or interfere with the initial page render.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
      .then((registration) => {
        // Force an update check every time — otherwise a mobile browser
        // that never fully closes its tabs can keep running an OLD
        // service worker for days, silently missing bug fixes shipped in
        // a new sw.js (this was the actual cause of interactive blocks
        // like Graphing/Concept Map intermittently failing to load: the
        // stale v6 worker — with no retry logic — kept serving those
        // requests even after v7 was deployed, because it was never
        // told to take over).
        registration.update().catch(() => {});

        // If a new worker finishes installing while this tab is open,
        // activate it immediately instead of waiting for a future
        // reload that may never happen on mobile.
        //
        // FIXED: We NO longer call window.location.reload() here.
        // Instead, we just tell the new worker to skip waiting and
        // take over silently. The user's current state (forms, edits,
        // scroll position) is preserved completely.
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              // Soft activation — no page reload
              newWorker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch(() => {
        // Registration failing (unsupported browser, blocked, etc.) is not
        // fatal — the site just runs without offline caching, same as before.
      });

    // FIXED: Removed automatic window.location.reload() on controllerchange.
    //
    // OLD BEHAVIOR (CAUSED THE REFRESH BUG):
    // When the new service worker took control, we immediately reloaded
    // the entire page. This happened whenever:
    // 1. User was editing something in admin/user dashboard
    // 2. Service worker checked for updates (happens periodically)
    // 3. Network conditions changed (switching WiFi/cellular)
    // 4. Any background SW update completed
    //
    // The result: users lost their form data, scroll position, and context
    // at random intervals. On slow connections, this was especially painful
    // because SW updates would queue up and trigger multiple reloads.
    //
    // NEW BEHAVIOR (SOFT ACTIVATION):
    // We now listen for controllerchange but do NOTHING visible. The new
    // service worker simply takes over in the background. All future
    // requests will use the new SW, but the current page state is preserved.
    //
    // The only time a reload happens now is:
    // 1. User manually clicks a refresh button (explicit intent)
    // 2. A genuinely stale chunk error that can't be recovered (extremely rare)
    // FIX (page-crash bug, see public/sw.js): "soft activation" without a
    // reload means a tab that was already open keeps running on the OLD
    // worker's already-in-flight logic/cache for the rest of that session.
    // That was fine for ordinary asset updates, but it is exactly how a
    // buggy worker (one serving stale HTML paired with old, now-deleted JS
    // bundle hashes) could keep breaking navigations even after a fixed
    // sw.js was deployed. A one-time reload the moment a NEW worker takes
    // control guarantees every tab is always running the current worker
    // before it navigates again — this fires only once, right when the
    // update completes, not repeatedly.
    let reloadingForNewWorker = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadingForNewWorker) return;
      reloadingForNewWorker = true;
      window.location.reload();
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────

createRoot(document.getElementById("root")!).render(<App />);
