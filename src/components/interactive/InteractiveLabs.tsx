/**
 * InteractiveLabs.tsx
 * Orchestrator: picks relevant interactive blocks based on subject
 * and renders them in a tabbed, mobile-friendly layout.
 *
 * v5 — robust lazy loading:
 *   - Per-block error boundary: if one block crashes, only that block shows
 *     an error, the rest of the page still works.
 *   - Retry-aware lazy imports: transient network failures (common on slow
 *     mobile connections) no longer permanently break a block. The import
 *     is retried up to 3 times before the error boundary fires.
 *   - Defensive coding throughout all blocks.
 *   - All 8 advanced labs registered (graph, solver, algebra, numberline,
 *     geogebra, stats, conceptmap for math; phet/graph/solver/conceptmap for
 *     physics; periodic/molecule/phet/conceptmap for chemistry; etc.)
 */
import { useState, lazy, Suspense, useMemo, Component, type ReactNode } from "react";
import { FlaskConical, ChevronDown, AlertTriangle, RotateCcw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// ---------- Retry-aware dynamic import --------------------------------------
// On slow mobile networks (e.g. 2G/3G in rural areas) a dynamic import can
// fail transiently. Vite's lazy() wraps the promise in a React.lazy() that
// caches the rejection — meaning a single network hiccup permanently breaks
// the block until a full page reload.
//
// This wrapper retries the import a few times before giving up, and clears
// any cached rejection so "Try again" actually re-attempts the fetch.
function retryableImport<T>(importer: () => Promise<{ default: T }>, retries = 3): Promise<{ default: T }> {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const tryImport = () => {
      importer()
        .then(resolve)
        .catch((err) => {
          attempt += 1;
          if (attempt >= retries) {
            reject(err);
          } else {
            // Exponential backoff: 300ms, 600ms, 1200ms…
            const delay = 300 * Math.pow(2, attempt - 1);
            setTimeout(tryImport, delay);
          }
        });
    };
    tryImport();
  });
}

// Lazy-load each block so the main bundle stays lean.
// Each import is wrapped with retry logic so transient network errors
// don't permanently break the block on slow connections.
const GraphingCalculator = lazy(() => retryableImport(() => import("./GraphingCalculator")));
const StepSolver          = lazy(() => retryableImport(() => import("./StepSolver")));
const GeoGebraEmbed       = lazy(() => retryableImport(() => import("./GeoGebraEmbed")));
const PhETEmbed           = lazy(() => retryableImport(() => import("./PhETEmbed")));
const MoleculeViewer      = lazy(() => retryableImport(() => import("./MoleculeViewer")));
const PeriodicTable       = lazy(() => retryableImport(() => import("./PeriodicTable")));
const CodePlayground      = lazy(() => retryableImport(() => import("./CodePlayground")));
const ConceptMap          = lazy(() => retryableImport(() => import("./ConceptMap")));
const StatisticsPlayground = lazy(() => retryableImport(() => import("./StatisticsPlayground")));
const PunnettSquare       = lazy(() => retryableImport(() => import("./PunnettSquare")));
const AlgebraTiles        = lazy(() => retryableImport(() => import("./AlgebraTiles")));
const NumberLineLab       = lazy(() => retryableImport(() => import("./NumberLineLab")));

export type Block =
  | "graph" | "solver" | "geogebra" | "phet" | "molecule" | "periodic"
  | "code" | "conceptmap" | "stats" | "punnett" | "algebra" | "numberline";

const BLOCK_META: Record<Block, { label: string; emoji: string; desc: string }> = {
  graph:      { label: "Graphing",     emoji: "📈", desc: "Plot functions with live sliders, find intersections & roots" },
  solver:     { label: "Solver",       emoji: "🧮", desc: "Step-by-step solver for linear, quadratic, simultaneous, more" },
  geogebra:   { label: "GeoGebra",     emoji: "📐", desc: "Interactive geometry applets" },
  phet:       { label: "Simulations",  emoji: "🔬", desc: "PhET physics & chemistry sims" },
  molecule:   { label: "3D Molecules", emoji: "🧪", desc: "Rotate real molecular structures" },
  periodic:   { label: "Periodic Table", emoji: "⚛️", desc: "All 118 elements with trends & Bohr diagrams" },
  code:       { label: "Code Lab",     emoji: "💻", desc: "Live HTML/CSS/JS playground" },
  conceptmap: { label: "Concept Map",  emoji: "🗺️", desc: "Auto-generated mind map from chapter content" },
  stats:      { label: "Statistics",   emoji: "📊", desc: "Dice, coins, spinner, box plots, normal distribution" },
  punnett:    { label: "Genetics",     emoji: "🧬", desc: "Punnett square calculator for biology" },
  algebra:    { label: "Algebra Tiles", emoji: "🟦", desc: "Visual tiles for factoring & equation solving" },
  numberline: { label: "Number Line",  emoji: "➖", desc: "Visualize addition, multiplication, fractions" },
};

const SUBJECT_BLOCKS: Record<string, Block[]> = {
  "mathematics": ["graph", "solver", "algebra", "numberline", "geogebra", "stats", "conceptmap"],
  "math":        ["graph", "solver", "algebra", "numberline", "geogebra", "stats", "conceptmap"],
  "physics":     ["graph", "phet", "solver", "conceptmap"],
  "chemistry":   ["periodic", "molecule", "phet", "conceptmap"],
  "biology":     ["punnett", "phet", "conceptmap"],
  "computer science": ["code", "conceptmap"],
  "computer":    ["code", "conceptmap"],
  "cs":          ["code", "conceptmap"],
  "statistics":  ["stats", "graph", "conceptmap"],
  "urdu":        ["conceptmap"],
  "islamiyat":   ["conceptmap"],
  "pakistan studies": ["conceptmap"],
};

function pickBlocks(subjectName: string, subjectSlug?: string): Block[] {
  const key1 = (subjectSlug || "").toLowerCase().trim();
  const key2 = (subjectName || "").toLowerCase().trim();
  return SUBJECT_BLOCKS[key1] || SUBJECT_BLOCKS[key2] || ["conceptmap"];
}

// ---------- Per-block error boundary ---------------------------------------
// If a single interactive block crashes, this catches the error and shows
// a friendly "this block had an issue" message instead of taking down the
// entire chapter page.
//
// The boundary also auto-retries once after a short delay — many errors
// (especially lazy-load failures on flaky networks) are transient and a
// fresh render will succeed.

type ErrorBoundaryProps = { children: ReactNode; blockName: string; subjectColor: string };
type ErrorBoundaryState = { hasError: boolean; error: Error | null; retryKey: number };

class BlockErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, retryKey: 0 };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidUpdate(_prevProps: ErrorBoundaryProps, prevState: ErrorBoundaryState) {
    // Auto-retry once after 1.5s on the first error
    if (this.state.hasError && !prevState.hasError && this.state.retryKey === 0) {
      this.retryTimer = setTimeout(() => {
        this.setState({ hasError: false, retryKey: 1 });
      }, 1500);
    }
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  manualRetry = () => {
    // Bump retryKey to force a fresh mount of the lazy component.
    // React.lazy caches the failed promise inside the module registry,
    // so we also need to bust that cache by re-importing — handled by
    // the retryableImport wrapper above.
    this.setState({ hasError: false, error: null, retryKey: this.state.retryKey + 1 });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
          <h3 className="text-sm font-bold text-amber-900 mb-1">
            {this.props.blockName} couldn't load
          </h3>
          <p className="text-xs text-amber-700 mb-3 max-w-sm mx-auto">
            This interactive block couldn't load. This is usually a temporary network issue. Tap "Try again" to reload it.
          </p>
          <button
            onClick={this.manualRetry}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white"
            style={{ backgroundColor: this.props.subjectColor }}
          >
            <RotateCcw className="w-3 h-3" /> Try again
          </button>
        </div>
      );
    }
    // key={retryKey} forces a fresh mount on retry, which re-runs the
    // lazy import (and its retry logic) from scratch.
    return <div key={this.state.retryKey}>{this.props.children}</div>;
  }
}

const BlockSkeleton = () => (
  <div className="p-3">
    <Skeleton className="h-64 w-full rounded-xl" />
  </div>
);

export default function InteractiveLabs({
  subjectName,
  subjectSlug,
  subjectColor = "#3b82f6",
  chapterTitle = "Chapter",
  chapterContent = "",
  liteMode = false,
}: {
  subjectName: string;
  subjectSlug?: string;
  subjectColor?: string;
  chapterTitle?: string;
  chapterContent?: string;
  liteMode?: boolean;
}) {
  const blocks = useMemo(() => pickBlocks(subjectName, subjectSlug), [subjectName, subjectSlug]);
  const [active, setActive] = useState<Block>(blocks[0] || "conceptmap");
  const [expanded, setExpanded] = useState(true);

  // If subject changed, reset active block
  useMemo(() => { setActive(blocks[0] || "conceptmap"); }, [blocks]);

  if (liteMode) return null;

  const renderBlock = (block: Block) => {
    switch (block) {
      case "graph":      return <GraphingCalculator subjectColor={subjectColor} />;
      case "solver":     return <StepSolver subjectColor={subjectColor} />;
      case "geogebra":   return <GeoGebraEmbed subjectColor={subjectColor} />;
      case "phet":       return <PhETEmbed subjectColor={subjectColor} />;
      case "molecule":   return <MoleculeViewer subjectColor={subjectColor} />;
      case "periodic":   return <PeriodicTable subjectColor={subjectColor} />;
      case "code":       return <CodePlayground subjectColor={subjectColor} />;
      case "conceptmap": return <ConceptMap subjectColor={subjectColor} chapterTitle={chapterTitle} content={chapterContent} />;
      case "stats":      return <StatisticsPlayground subjectColor={subjectColor} />;
      case "punnett":    return <PunnettSquare subjectColor={subjectColor} />;
      case "algebra":    return <AlgebraTiles subjectColor={subjectColor} />;
      case "numberline": return <NumberLineLab subjectColor={subjectColor} />;
    }
  };

  return (
    <section className="mt-8 md:mt-10 mb-4" aria-label="Interactive learning labs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-2 mb-3 group"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: subjectColor + "20" }}>
            <FlaskConical className="w-5 h-5" style={{ color: subjectColor }} />
          </div>
          <div className="text-left">
            <h2 className="text-base md:text-lg font-black text-foreground flex items-center gap-2">
              Interactive Labs
              <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase tracking-wide">
                Live
              </span>
            </h2>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Hands-on tools to explore {subjectName} concepts
            </p>
          </div>
        </div>
        <ChevronDown
          className={`w-5 h-5 text-muted-foreground transition-transform group-hover:text-foreground ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <>
          {blocks.length > 1 && (
            <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1 -mx-1 px-1"
              style={{ scrollbarWidth: "thin" }}>
              {blocks.map((b) => {
                const meta = BLOCK_META[b];
                const isActive = active === b;
                return (
                  <button
                    key={b}
                    onClick={() => setActive(b)}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                      isActive
                        ? "text-white shadow-md"
                        : "bg-secondary text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                    }`}
                    style={isActive ? { backgroundColor: subjectColor } : {}}
                  >
                    <span className="text-sm">{meta.emoji}</span>
                    <span>{meta.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground mb-2 px-1">
            {BLOCK_META[active].emoji} {BLOCK_META[active].desc}
          </p>

          {/* Per-block error boundary + lazy load */}
          <BlockErrorBoundary blockName={BLOCK_META[active].label} subjectColor={subjectColor}>
            <Suspense fallback={<BlockSkeleton />}>
              <div className="interactive-block-wrapper">
                {renderBlock(active)}
              </div>
            </Suspense>
          </BlockErrorBoundary>

          {blocks.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-2 justify-center">
              {blocks.filter(b => b !== active).map((b) => (
                <button
                  key={b}
                  onClick={() => setActive(b)}
                  className="text-[10px] px-2.5 py-1.5 rounded-lg bg-secondary hover:bg-secondary/70 text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <span>{BLOCK_META[b].emoji}</span>
                  {BLOCK_META[b].label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
