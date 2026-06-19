/**
 * PhETEmbed.tsx
 * Embed PhET interactive simulations by simulation ID.
 * Free, 150+ sims covering physics, chemistry, biology, math, earth science.
 *
 * Usage: <PhETEmbed subjectColor="#3b82f6" defaultSim="wave-on-a-string" />
 *
 * Full list: https://phet.colorado.edu/en/simulations
 */
import { useState } from "react";
import { Atom, ExternalLink } from "lucide-react";

const POPULAR_SIMS = [
  { id: "wave-on-a-string", title: "Wave on a String", subject: "Physics" },
  { id: "circuit-construction-kit-dc", title: "Circuit Construction Kit (DC)", subject: "Physics" },
  { id: "bending-light", title: "Bending Light (Refraction)", subject: "Physics" },
  { id: "charges-and-fields", title: "Charges and Fields", subject: "Physics" },
  { id: "ohms-law", title: "Ohm's Law", subject: "Physics" },
  { id: "balancing-act", title: "Balancing Act (Torque)", subject: "Physics" },
  { id: "projectile-motion", title: "Projectile Motion", subject: "Physics" },
  { id: "build-an-atom", title: "Build an Atom", subject: "Chemistry" },
  { id: "molecule-shapes", title: "Molecule Shapes", subject: "Chemistry" },
  { id: "ph-scale", title: "pH Scale", subject: "Chemistry" },
  { id: "states-of-matter", title: "States of Matter", subject: "Chemistry" },
  { id: "acid-base-solutions", title: "Acid-Base Solutions", subject: "Chemistry" },
];

export default function PhETEmbed({
  subjectColor = "#3b82f6",
  defaultSim = "",
}: {
  subjectColor?: string;
  defaultSim?: string;
}) {
  const [simId, setSimId] = useState(defaultSim);
  const [inputValue, setInputValue] = useState(defaultSim);

  const load = () => setSimId(inputValue.trim().toLowerCase());

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 p-3 border-b border-border bg-secondary/30">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: subjectColor + "20" }}>
          <Atom className="w-4 h-4" style={{ color: subjectColor }} />
        </div>
        <span className="font-bold text-sm text-foreground">PhET Simulation</span>
        {simId && (
          <a href={`https://phet.colorado.edu/sims/html/${simId}/latest/${simId}_en.html`}
            target="_blank" rel="noreferrer"
            className="ml-auto text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
            Open <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      <div className="p-3 space-y-3">
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
            className="shrink-0 px-4 py-2 rounded-lg text-white text-sm font-semibold hover:opacity-90"
            style={{ backgroundColor: subjectColor }}
          >
            Load
          </button>
        </div>

        <div>
          <p className="text-[11px] text-muted-foreground mb-2">Popular simulations:</p>
          <div className="flex flex-wrap gap-1.5">
            {POPULAR_SIMS.map((sim) => (
              <button
                key={sim.id}
                onClick={() => { setSimId(sim.id); setInputValue(sim.id); }}
                className={`text-[10px] px-2.5 py-1.5 rounded-lg font-medium ${
                  simId === sim.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary hover:bg-secondary/70 text-foreground"
                }`}
                title={`${sim.subject} — ${sim.id}`}
              >
                {sim.title}
              </button>
            ))}
          </div>
        </div>

        {simId && (
          <div className="relative w-full overflow-hidden rounded-xl bg-white"
            style={{ aspectRatio: "16 / 10" }}>
            <iframe
              src={`https://phet.colorado.edu/sims/html/${simId}/latest/${simId}_en.html`}
              className="w-full h-full border-0"
              allowFullScreen
              title="PhET Simulation"
              loading="lazy"
              allow="autoplay; fullscreen"
            />
          </div>
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
