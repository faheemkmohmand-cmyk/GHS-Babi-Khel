/**
 * GeoGebraEmbed.tsx
 * Embed any GeoGebra applet by ID (from geogebra.org/materials).
 * Teachers can paste a URL like https://www.geogebra.org/m/abc123 and we extract the ID.
 *
 * Usage: <GeoGebraEmbed subjectColor="#3b82f6" appId="abc123" />
 * Or pass `defaultId` to pre-fill.
 */
import { useState } from "react";
import { ExternalLink, Globe } from "lucide-react";

const DEFAULT_APPS = [
  { id: "RxdYK6Pdu", title: "Quadratic Function Explorer", subject: "Math" },
  { id: "sZMBhD2BE", title: "Trigonometry Unit Circle", subject: "Math" },
  { id: "FXkPq5X3", title: "Triangle Properties", subject: "Math" },
  { id: "UdYQHhNP", title: "Coordinate Geometry", subject: "Math" },
];

export default function GeoGebraEmbed({
  subjectColor = "#3b82f6",
  defaultId = "",
}: {
  subjectColor?: string;
  defaultId?: string;
}) {
  const [appId, setAppId] = useState(defaultId);
  const [inputValue, setInputValue] = useState(defaultId);

  const extractId = (s: string): string => {
    // Accept URL like https://www.geogebra.org/m/abc123 or just the ID
    const match = s.match(/geogebra\.org\/m\/([A-Za-z0-9]+)/);
    if (match) return match[1];
    return s.trim();
  };

  const load = () => setAppId(extractId(inputValue));

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 p-3 border-b border-border bg-secondary/30">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: subjectColor + "20" }}>
          <Globe className="w-4 h-4" style={{ color: subjectColor }} />
        </div>
        <span className="font-bold text-sm text-foreground">GeoGebra Interactive</span>
        <a href={`https://www.geogebra.org/m/${appId}`} target="_blank" rel="noreferrer"
          className="ml-auto text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
          Open <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="p-3 space-y-3">
        <div className="flex gap-2">
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Paste GeoGebra URL or ID (e.g. RxdYK6Pdu)"
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

        {!appId && (
          <div>
            <p className="text-[11px] text-muted-foreground mb-2">Try a curated applet:</p>
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_APPS.map((app) => (
                <button
                  key={app.id}
                  onClick={() => { setAppId(app.id); setInputValue(app.id); }}
                  className="text-[10px] px-2.5 py-1.5 rounded-lg bg-secondary hover:bg-secondary/70 text-foreground font-medium"
                  title={app.subject}
                >
                  {app.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {appId && (
          <div className="relative w-full overflow-hidden rounded-xl bg-white"
            style={{ aspectRatio: "16 / 10" }}>
            <iframe
              src={`https://www.geogebra.org/material/iframe/id/${appId}/width/800/height/500/border/888888/smb/false/stb/false/stbh/false/ai/false/asb/false/sri/true/rc/false/ld/false/sdz/false/ctl/false`}
              className="w-full h-full border-0"
              allowFullScreen
              title="GeoGebra Applet"
              loading="lazy"
            />
          </div>
        )}
        <p className="text-[10px] text-muted-foreground text-center">
          Browse 1M+ free applets at{" "}
          <a href="https://www.geogebra.org/materials" target="_blank" rel="noreferrer" className="text-primary hover:underline">
            geogebra.org/materials
          </a>
        </p>
      </div>
    </div>
  );
}
