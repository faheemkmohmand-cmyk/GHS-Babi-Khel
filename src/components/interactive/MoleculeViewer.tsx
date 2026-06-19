/**
 * MoleculeViewer.tsx
 * 3D molecule viewer using 3Dmol.js (loaded from CDN to avoid bundle bloat).
 * Search by name (via PubChem) or load directly from a SMILES / PDB / URL.
 *
 * Usage: <MoleculeViewer subjectColor="#10b981" />
 */
import { useState, useRef, useEffect } from "react";
import { Atom, Search, Loader2, ExternalLink } from "lucide-react";

declare global {
  interface Window { $3Dmol: any; }
}

const CDN_URL = "https://cdnjs.cloudflare.com/ajax/libs/3Dmol/2.0.5/3Dmol.min.js";

let loadPromise: Promise<any> | null = null;
function load3Dmol(): Promise<any> {
  if (window.$3Dmol) return Promise.resolve(window.$3Dmol);
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CDN_URL;
    script.async = true;
    script.onload = () => resolve(window.$3Dmol);
    script.onerror = () => reject(new Error("Failed to load 3Dmol.js"));
    document.head.appendChild(script);
  });
  return loadPromise;
}

const POPULAR_MOLECULES = [
  { name: "Water", query: "O" },
  { name: "Methane", query: "C" },
  { name: "Ethanol", query: "CCO" },
  { name: "Benzene", query: "c1ccccc1" },
  { name: "Glucose", query: "OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O" },
  { name: "Aspirin", query: "CC(=O)OC1=CC=CC=C1C(=O)O" },
  { name: "Caffeine", query: "CN1C=NC2=C1C(=O)N(C(=O)N2C)C" },
  { name: "NaCl", query: "[Na+].[Cl-]" },
];

export default function MoleculeViewer({ subjectColor = "#10b981" }: { subjectColor?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [query, setQuery] = useState("c1ccccc1");
  const [inputValue, setInputValue] = useState("benzene");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [style, setStyle] = useState<"stick" | "sphere" | "cartoon" | "line">("stick");

  // Convert a name to SMILES via PubChem
  const nameToSmiles = async (name: string): Promise<string | null> => {
    try {
      const res = await fetch(
        `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/property/CanonicalSMILES/JSON`
      );
      if (!res.ok) return null;
      const json = await res.json();
      const smiles = json?.PropertyTable?.Properties?.[0]?.CanonicalSMILES;
      return smiles || null;
    } catch {
      return null;
    }
  };

  const renderMolecule = async (smiles: string) => {
    if (!containerRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const $3Dmol = await load3Dmol();
      // Clean up previous viewer
      if (viewerRef.current) {
        viewerRef.current.clear();
        viewerRef.current = null;
      }
      // Fetch 3D structure from PubChem
      const sdfUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodeURIComponent(smiles)}/SDF?record_type=3d`;
      const resp = await fetch(sdfUrl);
      if (!resp.ok) throw new Error("Could not fetch 3D structure. Try a simpler molecule.");
      const sdf = await resp.text();

      const element = containerRef.current;
      element.innerHTML = "";
      const config = { backgroundColor: "white" };
      const viewer = $3Dmol.createViewer(element, config);
      viewerRef.current = viewer;
      viewer.addModel(sdf, "sdf");
      viewer.setStyle({}, {
        stick: style === "stick" ? { radius: 0.15 } : undefined,
        sphere: style === "sphere" ? { scale: 0.3 } : undefined,
        line: style === "line" ? {} : undefined,
      } as any);
      if (style === "cartoon") {
        viewer.setStyle({}, { cartoon: {} } as any);
      }
      viewer.zoomTo();
      viewer.render();
      viewer.zoom(1.5, 200);
    } catch (e: any) {
      setError(e?.message || "Failed to load molecule");
    } finally {
      setLoading(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (viewerRef.current) {
        try { viewerRef.current.clear(); } catch { /* noop */ }
        viewerRef.current = null;
      }
    };
  }, []);

  const load = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    // If input looks like SMILES (contains C, O, N, brackets, etc.) use it directly
    const looksLikeSmiles = /^[A-Za-z0-9\[\]\(\)\\\/@+=\-#.:]+$/.test(trimmed) && /[CNOScnos\[\]]/.test(trimmed);
    let smiles = trimmed;
    if (!looksLikeSmiles) {
      const result = await nameToSmiles(trimmed);
      if (!result) {
        setError(`Could not find molecule "${trimmed}". Try a SMILES string instead.`);
        setLoading(false);
        return;
      }
      smiles = result;
    }
    setQuery(smiles);
    await renderMolecule(smiles);
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 p-3 border-b border-border bg-secondary/30">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: subjectColor + "20" }}>
          <Atom className="w-4 h-4" style={{ color: subjectColor }} />
        </div>
        <span className="font-bold text-sm text-foreground">3D Molecule Viewer</span>
        <a href="https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/" target="_blank" rel="noreferrer"
          className="ml-auto text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
          PubChem <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="p-3 space-y-3">
        <div className="flex gap-2">
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Molecule name (e.g. benzene) or SMILES"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            onClick={load}
            disabled={loading}
            className="shrink-0 px-4 py-2 rounded-lg text-white text-sm font-semibold flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: subjectColor }}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Load</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {POPULAR_MOLECULES.map((m) => (
            <button
              key={m.name}
              onClick={() => { setInputValue(m.name); setQuery(m.query); renderMolecule(m.query); }}
              className="text-[10px] px-2.5 py-1.5 rounded-lg bg-secondary hover:bg-secondary/70 text-foreground font-medium"
            >
              {m.name}
            </button>
          ))}
        </div>

        {/* Style switcher */}
        <div className="flex gap-1.5">
          {(["stick", "sphere", "line", "cartoon"] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setStyle(s); if (query) renderMolecule(query); }}
              className={`text-[10px] px-2 py-1 rounded-md capitalize font-medium ${
                style === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div
          ref={containerRef}
          className="relative w-full rounded-xl bg-white overflow-hidden touch-none"
          style={{ aspectRatio: "1 / 1", minHeight: "300px" }}
        >
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}
          {error && !loading && (
            <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
              <p className="text-xs text-red-500">{error}</p>
            </div>
          )}
          {!loading && !error && !query && (
            <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
              <p className="text-xs text-muted-foreground">Pick a molecule above or search by name</p>
            </div>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground text-center">
          Drag to rotate • Scroll/pinch to zoom • Powered by 3Dmol.js + PubChem
        </p>
      </div>
    </div>
  );
}
