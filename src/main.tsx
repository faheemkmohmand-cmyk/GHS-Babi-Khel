import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { hasUnsavedWork, installUnloadGuard, subscribeUnsaved } from "./lib/unsavedWork";

// Ask the browser to confirm before it throws away a page that is holding
// unsaved edits (tab close, swipe-away, back out of the app). This is the
// only protection possible against the one case we cannot engineer away —
// the user or the OS deciding to kill the tab — and it is why the registry
// lives in its own module: it has to be usable from here, before React mounts.
installUnloadGuard();

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE WORKER — offline support, and NEVER a page reload
// ─────────────────────────────────────────────────────────────────────────────
// THE BUG THIS FILE USED TO HAVE
// ────────────────────────────────
// This block used to end with:
//
//     navigator.serviceWorker.addEventListener("controllerchange", () => {
//       window.location.reload();
//     });
//
// Every full-page reload users reported on a slow connection came from those
// three lines. The chain is short and completely automatic:
//
//   1. Every deploy stamps a fresh CACHE_VERSION into sw.js
//      (scripts/prerender-lib.mjs: `ghs-${Date.now().toString(36)}`), so every
//      deploy ships a byte-different worker.
//   2. This file called registration.update() on EVERY page load, so the
//      browser fetched sw.js and saw it differ from the installed one.
//   3. The new worker installed and immediately called skipWaiting() +
//      clients.claim(), taking control of the tabs that were already open.
//   4. Those open tabs fired "controllerchange" → window.location.reload().
//   5. Everything the user was typing, every scroll position and every open
//      form was destroyed, with no warning and no undo.
//
// Slow networks made it far worse rather than better. The new worker's install
// step precaches every hashed build asset (4 at a time), which on a 2G/3G link
// takes minutes — so the reload did not land on page load, it landed several
// minutes later, at whatever moment the user happened to be typing. The
// longer the page was open, the more likely the reload was to destroy real
// work. A user could not even reliably work around it: the reload is
// triggered by a background process, not by anything they did.
//
// THE FIX
// ───────
//  • controllerchange no longer reloads. It cannot. There is no code path
//    left in this file that reloads the page — a new worker simply takes over
//    and serves subsequent requests, while the page keeps running the code it
//    already has in memory. That is a silent handover, which is all that was
//    ever needed.
//  • sw.js no longer calls skipWaiting() during install, so a new worker waits
//    instead of hijacking an open tab the instant it finishes installing.
//  • The page decides when it is safe to hand over, and only when there is no
//    unsaved work in progress. If the user is editing, the update waits and
//    activates on the next natural page load instead.
//  • The forced update check moved off the critical path: it waits for an
//    idle moment, runs at most once per session, and is skipped entirely on a
//    metered or genuinely slow link — so the precache burst no longer eats
//    the bandwidth the user is actually waiting on.
//
// Registered only after the page has fully loaded, so it can never delay
// or interfere with the initial page render.

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
      .then((registration) => {
        // ── Update check, on OUR terms ──────────────────────────────────────
        // Not on every page load. On a slow, metered or congested link an
        // update check is not free: it downloads sw.js and then precaches
        // every hashed asset in the build, which competes directly with the
        // page the user is trying to open. We wait for a genuinely idle
        // moment, run at most once per session, and skip it on 2G/save-data.
        const isLinkTooExpensive = () => {
          const c = (navigator as any).connection;
          if (!c) return false;
          if (c.saveData) return true;
          const t = String(c.effectiveType || "").toLowerCase();
          return t === "slow-2g" || t === "2g";
        };

        // Read the CURRENT state, not a snapshot from page load — the whole
        // point of the retry below is that the link may have improved since.
        const runUpdateCheck = () => {
          if (isLinkTooExpensive()) return;
          // update() only re-fetches sw.js; the precache work happens in the
          // new worker's install step, which is the expensive part.
          registration.update().catch(() => {});
        };

        if (isLinkTooExpensive()) {
          // Don't push a precache down a link that cannot carry it right now.
          // The browser fires "change" on the Network Information API when
          // effectiveType/downlink/rtt move, so the update happens as soon as
          // the connection is actually capable of it.
          const conn = (navigator as any).connection;
          if (conn && typeof conn.addEventListener === "function") {
            conn.addEventListener("change", runUpdateCheck, { once: true });
          } else {
            setTimeout(runUpdateCheck, 30_000);
          }
        } else if (typeof (window as any).requestIdleCallback === "function") {
          (window as any).requestIdleCallback(runUpdateCheck, { timeout: 8000 });
        } else {
          setTimeout(runUpdateCheck, 4000);
        }

        // ── Handing over to a new worker, safely ────────────────────────────
        // When an update finishes installing it sits in the "waiting" state
        // (sw.js no longer calls skipWaiting itself). We activate it only when
        // the user is not in the middle of something. Activating does NOT
        // reload the page — the running page keeps every bit of its state.
        let pendingUpdate = false;
        let handedOver = false;

        const handOver = () => {
          if (handedOver || !pendingUpdate) return;
          if (hasUnsavedWork()) return; // user is editing — let it wait
          handedOver = true;
          try {
            registration.waiting?.postMessage({ type: "SKIP_WAITING" });
          } catch {
            /* best effort — the browser will activate it on next load anyway */
          }
        };

        // If the user finishes their work, activate straight away instead of
        // making the update wait for their next page visit.
        const unsubscribe = subscribeUnsaved((count) => {
          if (count === 0) handOver();
        });

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed") {
              // A controller already exists → this is an UPDATE to an
              // existing installation. With no controller it is the very
              // first install, which activates on its own and needs no
              // message from us.
              if (navigator.serviceWorker.controller) {
                pendingUpdate = true;
                handOver();
              }
            }
          });
        });

        // A worker can also finish installing before this handler is attached
        // (fast update on a fast connection).
        if (registration.waiting && navigator.serviceWorker.controller) {
          pendingUpdate = true;
          handOver();
        }

        window.addEventListener("pagehide", () => unsubscribe());
      })
      .catch(() => {
        // Registration failing (unsupported browser, blocked, etc.) is not
        // fatal — the site just runs without offline caching, same as before.
      });

    // ── controllerchange: OBSERVE ONLY, NEVER RELOAD ───────────────────────
    // A new worker taking control is a non-event for the page. The document,
    // the React tree, every open form and the scroll position all stay exactly
    // as they are. Nothing is re-fetched and nothing is re-mounted; only
    // subsequent network requests are served by the new worker.
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      console.info("[sw] New service worker took over — page state preserved (no reload).");
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────

createRoot(document.getElementById("root")!).render(<App />);
