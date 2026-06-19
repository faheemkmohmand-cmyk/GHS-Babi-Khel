/**
 * StepSolver.tsx
 * Mathisun-style step-by-step solver for quadratic equations.
 * Pure client-side — NO external math library (saves ~600 KB vs mathjs).
 *
 * We extract a, b, c by evaluating the LHS–RHS at x ∈ {0, 1, -1} and
 * solving the resulting 3×3 linear system:
 *   f(0)  = c
 *   f(1)  = a + b + c
 *   f(-1) = a - b + c
 *
 * Usage: <StepSolver subjectColor="#3b82f6" />
 */
import { useState } from "react";
import { Sigma, Play } from "lucide-react";

type Step = { title: string; body: string; latex?: string };

function fmt(n: number): string {
  if (Math.abs(n - Math.round(n)) < 1e-9) return Math.round(n).toString();
  return n.toFixed(4).replace(/\.?0+$/, "");
}

// Convert "2x^2 + 3x - 5 = 0" or "x^2-5x+6" into a JS function f(x).
// We never use eval() — we build a real Function with whitelisted Math APIs.
function buildFn(input: string): ((x: number) => number) {
  // Split on "=" — if there are two parts, compute (lhs) - (rhs). If only one, use as-is.
  let lhs: string, rhs: string;
  if (input.includes("=")) {
    const parts = input.split("=");
    if (parts.length !== 2) throw new Error("Only one '=' allowed");
    lhs = parts[0]; rhs = parts[1];
  } else {
    lhs = input; rhs = "0";
  }

  const toJs = (s: string): string => {
    let out = s.trim();
    // ^ → **
    out = out.replace(/\^/g, "**");
    // Insert * between digit and x: "5x" → "5*x", "2x^2" → "2*x**2"
    out = out.replace(/(\d)\s*x/gi, "$1*x");
    // Insert * between ) and x or digit: ")x" → ")*x"
    out = out.replace(/\)\s*(x|\d)/gi, ")*$1");
    // Insert * between x and digit (rare but valid): "x2" → "x*2"
    out = out.replace(/x\s*(\d)/gi, "x*$1");
    // Insert * between two variables: "xy" → "x*y" (we don't support y, but be safe)
    return out;
  };

  const lhsJs = toJs(lhs);
  const rhsJs = toJs(rhs);

  // Whitelist check — only allow x and Math.* names
  const allowed = new Set(["x", "PI", "E", "sin", "cos", "tan", "asin", "acos", "atan",
    "log", "log2", "log10", "exp", "sqrt", "abs", "floor", "ceil", "round", "sign", "pow", "min", "max"]);
  const allExpr = lhsJs + " " + rhsJs;
  const idents = allExpr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
  for (const id of idents) {
    if (!allowed.has(id)) throw new Error(`Unknown name: "${id}"`);
  }

  // eslint-disable-next-line no-new-func
  return new Function("x",
    `"use strict";
    const {PI, E, sin, cos, tan, asin, acos, atan, log, log2, log10, exp, sqrt, abs, floor, ceil, round, sign, pow, min, max} = Math;
    return (${lhsJs}) - (${rhsJs});`
  ) as (x: number) => number;
}

function tryParseEquation(input: string): { a: number; b: number; c: number } | { error: string } {
  const trimmed = input.trim();
  if (!trimmed) return { error: "Empty input" };

  let fn: (x: number) => number;
  try {
    fn = buildFn(trimmed);
  } catch (e: any) {
    return { error: e?.message || "Could not parse equation" };
  }

  // Sample at three points and solve for a, b, c assuming f(x) = a x² + b x + c
  const f0 = fn(0);
  const f1 = fn(1);
  const fm1 = fn(-1);

  // Sanity check: confirm it's actually quadratic by sampling a 4th point
  const f2 = fn(2);
  // Expected f(2) = 4a + 2b + c. Compare to predicted from a, b, c
  const a = (f1 + fm1 - 2 * f0) / 2;
  const b = (f1 - fm1) / 2;
  const c = f0;
  const predicted_f2 = 4 * a + 2 * b + c;
  if (Math.abs(predicted_f2 - f2) > 1e-6 * (1 + Math.abs(f2))) {
    return { error: "Equation is not quadratic in x (degree ≠ 2)" };
  }
  if (Math.abs(a) < 1e-10) return { error: "Not a quadratic (a = 0)" };
  return { a, b, c };
}

function solveQuadratic(a: number, b: number, c: number): Step[] {
  const steps: Step[] = [];
  steps.push({
    title: "1. Standard form",
    body: `Identified coefficients: a = ${fmt(a)}, b = ${fmt(b)}, c = ${fmt(c)}`,
    latex: `${fmt(a)}x² ${b >= 0 ? "+" : "−"} ${fmt(Math.abs(b))}x ${c >= 0 ? "+" : "−"} ${fmt(Math.abs(c))} = 0`,
  });

  const disc = b * b - 4 * a * c;
  steps.push({
    title: "2. Discriminant",
    body: `Δ = b² − 4ac = (${fmt(b)})² − 4×(${fmt(a)})×(${fmt(c)}) = ${fmt(b * b)} − ${fmt(4 * a * c)} = ${fmt(disc)}`,
    latex: `Δ = b² − 4ac = ${fmt(disc)}`,
  });

  if (disc > 0) {
    const sqrtD = Math.sqrt(disc);
    const x1 = (-b + sqrtD) / (2 * a);
    const x2 = (-b - sqrtD) / (2 * a);
    steps.push({
      title: "3. Two real roots",
      body: `Since Δ > 0, the equation has two distinct real roots. Apply the quadratic formula:`,
      latex: `x = (−b ± √Δ) / (2a) = (−(${fmt(b)}) ± √${fmt(disc)}) / (2 × ${fmt(a)})`,
    });
    steps.push({
      title: "4. Simplify",
      body: `x₁ = ${fmt(x1)},  x₂ = ${fmt(x2)}`,
      latex: `x₁ = ${fmt(x1)},  x₂ = ${fmt(x2)}`,
    });
    steps.push({
      title: "5. Factorization",
      body: `The quadratic can be factored as:`,
      latex: `${fmt(a)}(x − ${fmt(x1)})(x − ${fmt(x2)}) = 0`,
    });
  } else if (Math.abs(disc) < 1e-10) {
    const x = -b / (2 * a);
    steps.push({
      title: "3. One real root (repeated)",
      body: `Since Δ = 0, the equation has exactly one real root with multiplicity 2.`,
      latex: `x = −b / (2a) = −(${fmt(b)}) / (2 × ${fmt(a)}) = ${fmt(x)}`,
    });
    steps.push({
      title: "4. Factorization",
      body: `Perfect square trinomial:`,
      latex: `${fmt(a)}(x − ${fmt(x)})² = 0`,
    });
  } else {
    const realPart = -b / (2 * a);
    const imagPart = Math.sqrt(-disc) / (2 * a);
    steps.push({
      title: "3. Complex roots",
      body: `Since Δ < 0, the equation has two complex conjugate roots.`,
      latex: `x = (−b ± i√|Δ|) / (2a) = ${fmt(realPart)} ± ${fmt(Math.abs(imagPart))}i`,
    });
    steps.push({
      title: "4. No real factorization",
      body: `The quadratic is irreducible over the reals.`,
      latex: `${fmt(a)}(x − (${fmt(realPart)} + ${fmt(imagPart)}i))(x − (${fmt(realPart)} − ${fmt(imagPart)}i)) = 0`,
    });
  }

  return steps;
}

const EXAMPLES = [
  "x^2 - 5x + 6 = 0",
  "2x^2 + 3x - 2 = 0",
  "x^2 + 4x + 4 = 0",
  "x^2 + x + 1 = 0",
  "x^2 - 9 = 0",
];

export default function StepSolver({ subjectColor = "#3b82f6" }: { subjectColor?: string }) {
  const [input, setInput] = useState("x^2 - 5x + 6 = 0");
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  const solve = (eq: string) => {
    const result = tryParseEquation(eq);
    if ("error" in result) {
      setError(result.error);
      setSteps(null);
      return;
    }
    setError(null);
    setSteps(solveQuadratic(result.a, result.b, result.c));
    setHistory((h) => [eq, ...h.filter((x) => x !== eq)].slice(0, 5));
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 p-3 border-b border-border bg-secondary/30">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: subjectColor + "20" }}>
          <Sigma className="w-4 h-4" style={{ color: subjectColor }} />
        </div>
        <span className="font-bold text-sm text-foreground">Step-by-Step Solver</span>
        <span className="ml-auto text-[10px] text-muted-foreground hidden sm:inline">Quadratic equations</span>
      </div>

      <div className="p-3 space-y-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && solve(input)}
            placeholder="e.g. 2x^2 + 3x - 5 = 0"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-background border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            onClick={() => solve(input)}
            className="shrink-0 px-4 py-2 rounded-lg text-white text-sm font-semibold flex items-center gap-1.5 hover:opacity-90"
            style={{ backgroundColor: subjectColor }}
          >
            <Play className="w-3.5 h-3.5" /> Solve
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => { setInput(ex); solve(ex); }}
              className="text-[10px] px-2 py-1 rounded-md bg-secondary hover:bg-secondary/70 text-muted-foreground hover:text-foreground font-mono"
            >
              {ex}
            </button>
          ))}
        </div>

        {error && (
          <div className="text-xs text-red-500 bg-red-500/10 rounded-lg p-2 font-mono">⚠ {error}</div>
        )}

        {steps && (
          <div className="space-y-2">
            {steps.map((step, i) => (
              <div key={i} className="rounded-xl border border-border p-3 bg-secondary/20">
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold text-white"
                    style={{ backgroundColor: subjectColor }}>
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground mb-1">{step.title}</p>
                    <p className="text-xs text-muted-foreground font-mono break-words">{step.body}</p>
                    {step.latex && (
                      <div className="mt-2 p-2 rounded-lg bg-background border border-border overflow-x-auto">
                        <span className="text-sm text-foreground font-mono">{step.latex}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {history.length > 0 && (
          <div className="pt-2 border-t border-border">
            <p className="text-[10px] text-muted-foreground mb-1.5">Recent</p>
            <div className="flex flex-wrap gap-1.5">
              {history.map((h) => (
                <button key={h} onClick={() => { setInput(h); solve(h); }}
                  className="text-[10px] px-2 py-1 rounded-md bg-muted text-muted-foreground hover:text-foreground font-mono truncate max-w-[180px]">
                  {h}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
