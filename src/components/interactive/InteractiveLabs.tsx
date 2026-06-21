/**
 * InteractiveLabs.tsx
 * Orchestrator: picks relevant interactive blocks based on subject
 * and renders them in a tabbed, mobile-friendly layout.
 *
 * v3 — expanded with new advanced labs:
 *   - Advanced Graphing Calculator (Desmos-style, multi-function, sliders, intersections)
 *   - Editable Concept Map (Coggle-style drag/edit, multiple layouts, outline view)
 *   - Multi-type Step Solver (linear, quadratic, simultaneous, inequalities, fractions, radicals, logs)
 *   - Complete Periodic Table (all 118 elements, trends heatmap, Bohr diagrams)
 *   - Statistics Playground (dice, coins, spinner, box plot, histogram, normal dist)
 *   - Punnett Square Calculator (biology genetics)
 *   - Algebra Tiles (visual factoring)
 *   - Number Line Lab (junior math manipulatives)
 *
 * Drop into ChapterPage after the chart section:
 *
 *   <InteractiveLabs
 *     subjectName={subject.name}
 *     subjectSlug={subject.slug}
 *     subjectColor={subject.color}
 *     chapterTitle={chapter.title}
 *     chapterContent={chapter.content || ""}
 *   />
 */
import { useState, lazy, Suspense, useMemo } from "react";
import { FlaskConical, ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// Lazy-load each block so the main bundle stays lean
const GraphingCalculator = lazy(() => import("./GraphingCalculator"));
const StepSolver          = lazy(() => import("./StepSolver"));
const GeoGebraEmbed       = lazy(() => import("./GeoGebraEmbed"));
const PhETEmbed           = lazy(() => import("./PhETEmbed"));
const MoleculeViewer      = lazy(() => import("./MoleculeViewer"));
const PeriodicTable       = lazy(() => import("./PeriodicTable"));
const CodePlayground      = lazy(() => import("./CodePlayground"));
const ConceptMap          = lazy(() => import("./ConceptMap"));
const StatisticsPlayground = lazy(() => import("./StatisticsPlayground"));
const PunnettSquare       = lazy(() => import("./PunnettSquare"));
const AlgebraTiles        = lazy(() => import("./AlgebraTiles"));
const NumberLineLab       = lazy(() => import("./NumberLineLab"));

export type Block =
  | "graph"        // Math: Desmos-style graphing calculator
  | "solver"       // Math: Mathisfun-style step solver
  | "geogebra"     // Math/geometry: GeoGebra applet embed
  | "phet"         // Physics/Chem/Bio: PhET simulations
  | "molecule"     // Chemistry: 3D molecule viewer
  | "periodic"     // Chemistry: interactive periodic table
  | "code"         // Computer Science: live code playground
  | "conceptmap"   // Universal: auto mind map from chapter
  | "stats"        // Math: statistics playground
  | "punnett"      // Biology: genetics calculator
  | "algebra"      // Math: visual algebra tiles
  | "numberline";  // Math (junior): number line manipulatives

const BLOCK_META: Record<Block, { label: string; emoji: string; desc: string }> = {
  graph:      { label: "Graphing",     emoji: "📈", desc: "Plot functions with live sliders, find intersections & roots" },
  solver:     { label: "Solver",       emoji: "🧮", desc: "Step-by-step solver for linear, quadratic, simultaneous, more" },
  geogebra:   { label: "GeoGebra",     emoji: "📐", desc: "Interactive geometry applets" },
  phet:       { label: "Simulations",  emoji: "🔬", desc: "PhET physics & chemistry sims" },
  molecule:   { label: "3D Molecules", emoji: "🧪", desc: "Rotate real molecular structures" },
  periodic:   { label: "Periodic Table", emoji: "⚛️", desc: "All 118 elements with trends & Bohr diagrams" },
  code:       { label: "Code Lab",     emoji: "💻", desc: "Live HTML/CSS/JS playground" },
  conceptmap: { label: "Concept Map",  emoji: "🗺️", desc: "Editable mind map — drag, add, color, export" },
  stats:      { label: "Statistics",   emoji: "📊", desc: "Dice, coins, spinner, box plots, normal distribution" },
  punnett:    { label: "Genetics",     emoji: "🧬", desc: "Punnett square calculator for biology" },
  algebra:    { label: "Algebra Tiles", emoji: "🟦", desc: "Visual tiles for factoring & equation solving" },
  numberline: { label: "Number Line",  emoji: "➖", desc: "Visualize addition, multiplication, fractions" },
};

// Subject → recommended blocks (order matters — first one is default tab)
const SUBJECT_BLOCKS: Record<string, Block[]> = {
  // Match by subject.slug (lowercased). We also do fallback matching on name below.
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
      {/* Section header */}
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
          {/* Tab bar */}
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

          {/* Active block description */}
          <p className="text-[11px] text-muted-foreground mb-2 px-1">
            {BLOCK_META[active].emoji} {BLOCK_META[active].desc}
          </p>

          {/* Active block (lazy-loaded) */}
          <Suspense fallback={<BlockSkeleton />}>
            <div className="interactive-block-wrapper">
              {renderBlock(active)}
            </div>
          </Suspense>

          {/* Other blocks preview (collapsible, on mobile especially) */}
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
