import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE WORKER CLEANUP
// ─────────────────────────────────────────────────────────────────────────────
// The project previously used VitePWA which registered a Service Worker.
// VitePWA was removed because the SW was serving stale/broken cached JS
// chunks, causing interactive components (Graphing, ConceptMap, etc.) to
// fail on mobile devices that had the old SW registered.
//
// Even though VitePWA is gone from the build, old SWs are STILL registered
// on users' phones from previous visits. This code unregisters ALL service
// workers on every page load, ensuring stale caches don't interfere.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        reg.unregister().then((success) => {
          if (success) {
            console.log("[SW Cleanup] Unregistered stale service worker:", reg.scope);
          }
        }).catch(() => {
          // ignore — can't do anything about it
        });
      }
      // Also clear all caches if the Cache API is available
      if ("caches" in window) {
        caches.keys().then((keys) => {
          for (const key of keys) {
            caches.delete(key).then(() => {
              console.log("[SW Cleanup] Deleted cache:", key);
            });
          }
        });
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────

createRoot(document.getElementById("root")!).render(<App />);
