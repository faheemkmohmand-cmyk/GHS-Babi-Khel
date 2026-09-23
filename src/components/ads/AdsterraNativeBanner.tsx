import { useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// AdsterraNativeBanner — reusable in-content ad slot (Native Banner)
// ─────────────────────────────────────────────────────────────────────────────
// Official Adsterra code this component wraps:
//
//   <script async="async" data-cfasync="false"
//     src="https://pl31469023.profitableratecpmnetwork.com/ba494b840ae1c8562d3bce44307dfca7/invoke.js"></script>
//   <div id="container-ba494b840ae1c8562d3bce44307dfca7"></div>
//
// WHY IT IS BUILT THIS WAY (read before "simplifying" it):
//
// 1. FIXED CONTAINER ID — Adsterra's invoke.js hunts the DOM for the exact
//    id below, so the <div> must keep that exact id. Because the id is
//    global, only ONE instance of this component may exist per page. A
//    module-level counter enforces that: extra instances on the same route
//    render nothing instead of producing duplicate ids.
//
// 2. SPA (react-router) LIFECYCLE — this is a single-page app: navigating
//    between routes never reloads the document. A <script> tag rendered in
//    JSX would execute exactly once for the whole session and the banner
//    would vanish forever after the first unmount. So instead the component
//    injects a fresh <script> node into <body> on every mount and REMOVES it
//    on unmount. Re-adding the node re-executes invoke.js (served from the
//    browser's HTTP cache, so it costs no extra download), which re-scans
//    for the (recreated) container and fills it again. This is the standard
//    pattern for Adsterra native banners inside React SPAs.
//
// 3. PWA / OFFLINE SAFETY — the script is created with async + data-cfasync
//    "false", injected AFTER mount (never blocking render, the service
//    worker, or first paint), and:
//      • skipped entirely while the device is offline (navigator.onLine),
//      • injected automatically if connectivity returns while mounted,
//      • a load failure just leaves the container empty — no error UI, no
//        crash, no interference with the offline app shell.
//    The service worker (public/sw.js) never intercepts cross-origin
//    scripts, so this request passes through untouched.
// ─────────────────────────────────────────────────────────────────────────────

const ADSTERRA_INVOKE_SRC =
  "https://pl31469023.profitableratecpmnetwork.com/ba494b840ae1c8562d3bce44307dfca7/invoke.js";

// The exact container id Adsterra issued for this native banner zone.
const CONTAINER_ID = "container-ba494b840ae1c8562d3bce44307dfca7";

// Number of instances currently mounted. > 0 means one already owns the
// fixed container id on this page.
let mountedInstances = 0;

interface AdsterraNativeBannerProps {
  /** Optional layout/spacing classes for the outer wrapper (Tailwind). */
  className?: string;
  /**
   * Invisible "Advertisement" caption for screen readers and ad-policy
   * transparency. sr-only = zero visual footprint, and no empty box is
   * ever reserved when the network (or the ad) is unavailable.
   */
  label?: string;
}

const AdsterraNativeBanner = ({
  className = "",
  label = "Advertisement",
}: AdsterraNativeBannerProps) => {
  // Only the instance that "owns" the slot renders the container div.
  const [ownsSlot, setOwnsSlot] = useState(false);
  const ownsRef = useRef(false);

  useEffect(() => {
    // Another instance on this route already owns the fixed container id —
    // render nothing to avoid duplicate ids / duplicate scripts.
    if (mountedInstances > 0) return;
    mountedInstances += 1;
    ownsRef.current = true;
    setOwnsSlot(true);

    let cancelled = false;
    let script: HTMLScriptElement | null = null;
    const cleanups: (() => void)[] = [];

    const inject = () => {
      if (cancelled || script) return;
      // PWA safety: never fire a doomed request while offline. If the
      // connection comes back while this instance is still mounted, the
      // "online" listener below injects it then.
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;

      script = document.createElement("script");
      script.src = ADSTERRA_INVOKE_SRC;
      script.async = true;
      // Same attribute as the official snippet (Cloudflare Rocket Loader hint).
      script.setAttribute("data-cfasync", "false");
      // Offline / blocked / ad-blocker: fail gracefully — the container
      // simply stays empty and the rest of the app is unaffected.
      script.onerror = () => {};
      document.body.appendChild(script);
    };

    // Wait one animation frame so the container <div> from THIS commit is
    // guaranteed to be in the DOM before the (network-async) invoke script
    // starts looking for it.
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      inject();
      const handleOnline = () => inject();
      window.addEventListener("online", handleOnline);
      cleanups.push(() => window.removeEventListener("online", handleOnline));
    });
    cleanups.push(() => cancelAnimationFrame(raf));

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
      // Remove the script node so the next mount re-executes invoke.js and
      // re-fills the freshly recreated container (see note 2 above).
      if (script && script.parentNode) script.parentNode.removeChild(script);
      script = null;
      mountedInstances -= 1;
      ownsRef.current = false;
    };
  }, []);

  if (!ownsSlot) return null;

  return (
    <div
      className={`adsterra-native-banner w-full ${className}`}
      role="complementary"
      aria-label={label}
    >
      {/* Screen-reader-only caption — zero visual footprint, keeps the page
          honest about sponsored content without reserving an empty box when
          the network (or the ad) is unavailable. */}
      <span className="sr-only">{label}</span>
      {/* Adsterra requires this EXACT id — do not change it. */}
      <div id={CONTAINER_ID} />
    </div>
  );
};

export default AdsterraNativeBanner;
