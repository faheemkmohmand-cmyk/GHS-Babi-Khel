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
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch(() => {
        // Registration failing (unsupported browser, blocked, etc.) is not
        // fatal — the site just runs without offline caching, same as before.
      });

    // When the new worker takes control, do a ONE-TIME silent reload so
    // every open tab is guaranteed to be served by the latest sw.js
    // (with its retry logic) rather than continuing to run against the
    // old one for the rest of the session.
    let refreshed = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshed) return;
      refreshed = true;
      window.location.reload();
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────

createRoot(document.getElementById("root")!).render(<App />);
