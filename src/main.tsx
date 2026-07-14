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
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failing (unsupported browser, blocked, etc.) is not
      // fatal — the site just runs without offline caching, same as before.
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────

createRoot(document.getElementById("root")!).render(<App />);
