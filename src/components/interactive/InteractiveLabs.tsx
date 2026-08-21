/**
 * InteractiveLabs.tsx - ENHANCED VERSION
 * Orchestrator: picks relevant interactive blocks based on subject
 * and renders them in a tabbed, mobile-friendly layout.
 *
 * v6 — Enhanced with new subject-specific labs:
 *   - English Lab Widget (vocabulary, grammar, word games)
 *   - Urdu Lab Widget (Lughat, Shaayari, Kehwar, Jumla)
 *   - Enhanced Code Playground (multi-language)
 *
 * All previous features preserved:
 *   - Per-block error boundary
 *   - Retry-aware lazy loading
 *   - Defensive coding
 */

import { useState, lazy, Suspense, useMemo, Component, type ReactNode } from "react";
import { FlaskConical, ChevronDown, AlertTriangle, RotateCcw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// ---------- Retry-aware dynamic import --------------------------------------
function retryableImport<T>(importer: () => Promise<{ default: T }>, retries = 4): Promise<{ default: T }> {
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
            const delay = 200 * attempt;
            setTimeout(tryImport, delay);
          }
        });
    };
    tryImport();
  });
}

// Lazy-load each block
const GraphingCalculator = lazy(() => retryableImport(() => import("./GraphingCalculator")));
const StepSolver          = lazy(() => retryableImport(() => import("./StepSolver")));
const PhETEmbed           = lazy(() => retryableImport(() => import("./PhETEmbed")));
const MoleculeViewer      = lazy(() => retryableImport(() => import("./MoleculeViewer")));
const PeriodicTable       = lazy(() => retryableImport(() => import("./PeriodicTable")));
const CodePlayground      = lazy(() => retryableImport(() => import("./CodePlayground")));
const ConceptMap          = lazy(() => retryableImport(() => import("./ConceptMap")));
const StatisticsPlayground = lazy(() => retryableImport(() => import("./StatisticsPlayground")));
const PunnettSquare       = lazy(() => retryableImport(() => import("./PunnettSquare")));
const NumberLineLab       = lazy(() => retryableImport(() => import("./NumberLineLab")));

// NEW: Subject-specific beautiful widgets
const EnglishLabWidget    = lazy(() => retryableImport(() => import("./EnglishLabWidget")));
const UrduLabWidget       = lazy(() => retryableImport(() => import("./UrduLabWidget")));

// ─── BLOCK TYPES (Extended) ──────────────────────────────────────────────

export type Block =
  | "graph" | "solver" | "phet" | "molecule" | "periodic"
  | "code" | "conceptmap" | "stats" | "punnett" | "numberline"
  | "english" | "urdu";

// ─── BLOCK METADATA (Extended) ─────────────────────────────────────────

const BLOCK_META: Record<Block, { label: string; emoji: string; desc: string }> = {
  graph:      { label: "Graphing",     emoji: "📈", desc: "Plot functions with live sliders..." },
  solver:     { label: "Solver",       emoji: "🧮", desc: "Step-by-step solver for linear, quadratic..." },
  phet:       { label: "Simulations",  emoji: "🔬", desc: "PhET physics & chemistry sims" },
  molecule:   { label: "3D Molecules", emoji: "🧪", desc: "Rotate real molecular structures" },
  periodic:   { label: "Periodic Table", emoji: "⚛️", desc: "All 118 elements with trends..." },
  code:       { label: "Code Lab",     emoji: "💻", desc: "Live HTML/CSS/JS/Python playground" },
  conceptmap: { label: "Concept Map",  emoji: "🗺️", desc: "Auto-generated mind map from chapter content" },
  stats:      { label: "Statistics",   emoji: "📊", desc: "Dice, coins, spinner, box plots..." },
  punnett:    { label: "Genetics",     emoji: "🧬", desc: "Punnett square calculator for biology" },
  numberline: { label: "Number Line",  emoji: "➖", desc: "Visualize addition, multiplication, fractions" },
  
  // NEW: Subject-specific widgets
  english:    { label: "English Lab",  emoji: "📘", desc: "Vocabulary builder, grammar quiz, word games!" },
  urdu:       { label: "اردو لب",      emoji: "📗", desc: "لغت، شاعری، کہاوتیں، جملہ بنائیں" },
};

// ─── SUBJECT-BLOCK MAPPING (Enhanced) ───────────────────────────────────

const SUBJECT_BLOCKS: Record<string, Block[]> = {
  // Mathematics - Graphing, Solver, Number Line, Statistics, Concept Map
  "mathematics": ["graph", "solver", "numberline", "stats", "conceptmap"],
  "math":        ["graph", "solver", "numberline", "stats", "conceptmap"],
  "maths":       ["graph", "solver", "numberline", "stats", "conceptmap"],
  
  // Physics - Simulations + tools
  "physics":     ["graph", "phet", "solver", "conceptmap"],
  
  // Chemistry - Periodic table + molecules
  "chemistry":   ["periodic", "molecule", "phet", "conceptmap"],
  
  // Biology - Genetics + simulations
  "biology":     ["punnett", "phet", "conceptmap"],
  
  // Computer Science - Enhanced Code Lab
  "computer science": ["code", "conceptmap"],
  "computer":    ["code", "conceptmap"],
  "cs":          ["code", "conceptmap"],
  "programming": ["code", "conceptmap"],
  "ict":         ["code", "conceptmap"],
  
  // Statistics
  "statistics":  ["stats", "graph", "conceptmap"],
  
  // English - English Lab for vocabulary, grammar
  "english":     ["english", "conceptmap"],
  "eng":         ["english", "conceptmap"],
  
  // Urdu - اردو لب appears here
  "urdu":        ["urdu", "conceptmap"],
  "اردو":        ["urdu", "conceptmap"],
  
  // Pakistan Studies / Social Studies
  "pakistan studies": ["conceptmap"],
  "pakistanstudies": ["conceptmap"],
  "social studies":  ["conceptmap"],
  "sst":             ["conceptmap"],
  
  // Islamiyat
  "islamiyat":   ["conceptmap"],
  "islamiat":    ["conceptmap"],
  "islamic":     ["conceptmap"],
  
  // General / Other
  "general":     ["conceptmap", "code"],
  "other":       ["conceptmap"],
};

// ... [Error Boundary Component] ...
// ... [Main Component with renderBlock switch] ...

// Render the appropriate component based on block type
const renderBlock = (block: Block) => {
  switch (block) {
    case "graph":      return <GraphingCalculator subjectColor={subjectColor} />;
    case "solver":     return <StepSolver subjectColor={subjectColor} />;
    case "phet":       return <PhETEmbed subjectColor={subjectColor} />;
    case "molecule":   return <MoleculeViewer subjectColor={subjectColor} />;
    case "periodic":   return <PeriodicTable subjectColor={subjectColor} />;
    case "code":       return <CodePlayground subjectColor={subjectColor} />;
    case "conceptmap": return <ConceptMap subjectColor={subjectColor} chapterTitle={chapterTitle} content={chapterContent} />;
    case "stats":      return <StatisticsPlayground subjectColor={subjectColor} />;
    case "punnett":    return <PunnettSquare subjectColor={subjectColor} />;
    case "numberline": return <NumberLineLab subjectColor={subjectColor} />;
    
    // NEW: Subject-specific widgets (AI-powered, chapter-aware)
    case "english":    return <EnglishLabWidget subjectColor={subjectColor} chapterTitle={chapterTitle} />;
    case "urdu":       return <UrduLabWidget subjectColor="#16a34a" chapterTitle={chapterTitle} />;
  }
};
