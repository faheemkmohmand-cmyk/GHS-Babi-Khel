/**
 * PhETEmbed.tsx
 * Embed PhET interactive simulations by simulation ID.
 * Free, 150+ sims covering physics, chemistry, biology, math, earth science.
 *
 * Improvements over v1:
 * - Loading spinner overlay while the sim boots (PhET takes 5-15s)
 * - Timeout detection: if iframe doesn't fire onLoad in 12s, show fallback
 * - Prominent "Open in new tab" fallback always visible below the iframe
 * - Proper `allow` + `referrerPolicy` so canvas/WebGL works on mobile
 * - Larger mobile height (was 16:10 → now 4:3 on mobile for more canvas space)
 *
 * Usage: <PhETEmbed subjectColor="#3b82f6" defaultSim="wave-on-a-string" />
 * Full list: https://phet.colorado.edu/en/simulations
 */
import { useState, useRef, useEffect } from "react";
import { Atom, ExternalLink, Loader2, AlertTriangle, RotateCcw } from "lucide-react";

const POPULAR_SIMS = [
  { id: "wave-on-a-string", title: "Wave on a String", subject: "Physics" },
  { id: "circuit-construction-kit-dc-virtual-lab", title: "Circuit Lab (DC)", subject: "Physics" },
  { id: "bending-light", title: "Bending Light (Refraction)", subject: "Physics" },
  { id: "charges-and-fields", title: "Charges and Fields", subject: "Physics" },
  { id: "ohms-law", title: "Ohm's Law", subject: "Physics" },
  { id: "balancing-act", title: "Balancing Act (Torque)", subject: "Physics" },
  { id: "projectile-motion", title: "Projectile Motion", subject: "Physics" },
  { id: "build-an-atom", title: "Build an Atom", subject: "Chemistry" },
  { id: "molecule-shapes", title: "Molecule Shapes", subject: "Chemistry" },
  { id: "ph-scale", title: "pH Scale", subject: "Chemistry" },
  { id: "states-of-matter-basics", title: "States of Matter", subject: "Chemistry" },
  { id: "acid-base-solutions", title: "Acid-Base Solutions", subject: "Chemistry" },
];

const SIM_LOAD_TIMEOUT_MS = 12000; // 12 seconds

export default function PhETEmbed({
  subjectColor = "#3b82f6",
  defaultSim = "",
}: {
  subjectColor?: string;
  defaultSim?: string;
}) {
  const [simId, setSimId] = useState(defaultSim);
  const [inputValue, setInputValue] = useState(defaultSim);
  const [iframeKey, setIframeKey] = useState(0); // bump to force-reload the iframe
  const [loading, setLoading] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = () => {
    const id = inputValue.trim().toLowerCase();
    if (!id) return;
    setSimId(id);
    setTimedOut(false);
    setLoading(true);
    setIframeKey((k) => k + 1); // force iframe remount
  };

  // When the iframe mounts, start a timeout. If onLoad doesn't fire in time, show fallback.
  useEffect(() => {
    if (!simId || !loading) return;
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    loadTimeoutRef.current = setTimeout(() => {
      setTimedOut(true);
      setLoading(false);
    }, SIM_LOAD_TIMEOUT_MS);
    return () => {
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    };
  }, [simId, loading, iframeKey]);

  const onIframeLoad = () => {
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    setLoading(false);
    setTimedOut(false);
  };

  const retry = () => {
    setTimedOut(false);
    setLoading(true);
    setIframeKey((k) => k + 1);
  };

  const simUrl = simId
    ? `https://phet.colorado.edu/sims/html/${simId}/latest/${simId}_en.html`
    : "";

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-border bg-secondary/30">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: subjectColor + "20" }}>
          <Atom className="w-4 h-4" style={{ color: subjectColor }} />
        </div>
        <span className="font-bold text-sm text-foreground">PhET Simulation</span>
        {simId && (
          <a href={simUrl} target="_blank" rel="noreferrer"
            className="ml-auto text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
            Open <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      <div className="p-3 space-y-3">
        {/* Input */}
        <div className="flex gap-2">
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Enter PhET sim ID (e.g. wave-on-a-string)"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-background border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            onClick={load}
            disabled={loading}
            className="shrink-0 px-4 py-2 rounded-lg text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
            style={{ backgroundColor: subjectColor }}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Load
          </button>
        </div>

        {/* Popular sims */}
        <div>
          <p className="text-[11px] text-muted-foreground mb-2">Popular simulations:</p>
          <div className="flex flex-wrap gap-1.5">
            {POPULAR_SIMS.map((sim) => (
              <button
                key={sim.id}
                onClick={() => { setInputValue(sim.id); setSimId(sim.id); setTimedOut(false); setLoading(true); setIframeKey((k) => k + 1); }}
                className={`text-[10px] px-2.5 py-1.5 rounded-lg font-medium ${
                  simId === sim.id
                    ? "text-white"
                    : "bg-secondary hover:bg-secondary/70 text-foreground"
                }`}
                style={simId === sim.id ? { backgroundColor: subjectColor } : {}}
                title={`${sim.subject} — ${sim.id}`}
              >
                {sim.title}
              </button>
            ))}
          </div>
        </div>

        {/* Iframe area with loading + timeout states */}
        {simId && (
          <>
            <div className="relative w-full overflow-hidden rounded-xl bg-white border border-border"
              style={{ aspectRatio: "4 / 3", minHeight: "320px" }}>
              {/* Loading overlay */}
              {loading && !timedOut && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-20 gap-3 p-4">
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: subjectColor }} />
                  <p className="text-sm font-semibold text-foreground text-center">
                    Loading PhET simulation…
                  </p>
                  <p className="text-[11px] text-muted-foreground text-center max-w-xs">
                    This usually takes 5-15 seconds. Please keep this tab active.
                  </p>
                </div>
              )}

              {/* Timeout fallback */}
              {timedOut && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-amber-50 z-20 gap-3 p-4">
                  <AlertTriangle className="w-8 h-8 text-amber-500" />
                  <p className="text-sm font-bold text-foreground text-center">
                    Simulation is taking too long to load
                  </p>
                  <p className="text-[11px] text-muted-foreground text-center max-w-xs">
                    Your connection may be slow or the simulation may be blocked. Try opening it in a new tab.
                  </p>
                  <div className="flex gap-2 mt-1">
                    <a href={simUrl} target="_blank" rel="noreferrer"
                      className="text-xs px-3 py-2 rounded-lg text-white font-semibold flex items-center gap-1.5"
                      style={{ backgroundColor: subjectColor }}>
                      <ExternalLink className="w-3.5 h-3.5" /> Open in New Tab
                    </a>
                    <button onClick={retry}
                      className="text-xs px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/70 text-foreground font-semibold flex items-center gap-1.5">
                      <RotateCcw className="w-3.5 h-3.5" /> Retry
                    </button>
                  </div>
                </div>
              )}

              {/* The iframe itself — note: key={iframeKey} forces a clean remount on retry */}
              {!timedOut && (
                <iframe
                  key={iframeKey}
                  src={simUrl}
                  className="w-full h-full border-0"
                  allowFullScreen
                  title={`PhET: ${simId}`}
                  loading="lazy"
                  onLoad={onIframeLoad}
                  allow="autoplay; fullscreen; accelerometer; gyroscope; gamepad; geolocation; microphone; camera; midi; encrypted-media; picture-in-picture"
                  referrerPolicy="no-referrer-when-downgrade"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals allow-downloads allow-presentation"
                />
              )}
            </div>

            {/* Always-visible fallback link below the iframe */}
            <div className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg bg-secondary/50">
              <p className="text-[11px] text-muted-foreground flex-1 min-w-0">
                Simulation not loading? Try opening it directly:
              </p>
              <a href={simUrl} target="_blank" rel="noreferrer"
                className="shrink-0 text-xs px-3 py-1.5 rounded-lg text-white font-semibold flex items-center gap-1.5"
                style={{ backgroundColor: subjectColor }}>
                <ExternalLink className="w-3.5 h-3.5" /> New Tab
              </a>
            </div>
          </>
        )}

        <p className="text-[10px] text-muted-foreground text-center">
          Browse all sims at{" "}
          <a href="https://phet.colorado.edu/en/simulations" target="_blank" rel="noreferrer"
            className="text-primary hover:underline">phet.colorado.edu</a>
        </p>
      </div>
    </div>
  );
}
