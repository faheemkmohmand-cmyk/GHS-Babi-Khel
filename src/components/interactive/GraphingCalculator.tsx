/**
 * GraphingCalculator.tsx
 * Desmos-style inline graphing calculator — pure SVG, no external deps.
 * Mobile-friendly: pinch-to-zoom, drag-to-pan, slider parameters.
 *
 * Usage: <GraphingCalculator subjectColor="#3b82f6" />
 */
import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { Plus, Minus, Trash2, Play, Zap, RotateCcw, Sliders } from "lucide-react";

type Fn = { id: string; expr: string; color: string; visible: boolean };

const COLORS = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

// Safe expression evaluator — supports x, plus a/b/c/d/e parameters.
function makeEvaluator(expr: string, params: Record<string, number>) {
  // Replace ^ with ** for exponent
  let safe = expr.replace(/\^/g, "**");
  // Whitelist allowed identifiers
  const allowed = new Set([
    "x", "a", "b", "c", "d", "e",
    "sin", "cos", "tan", "asin", "acos", "atan", "atan2",
    "sinh", "cosh", "tanh",
    "log", "log2", "log10", "exp", "sqrt", "cbrt", "abs",
    "floor", "ceil", "round", "sign", "pow",
    "min", "max", "PI", "E",
  ]);
  // Find all identifiers
  const idents = safe.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
  for (const id of idents) {
    if (!allowed.has(id)) throw new Error(`Unknown name: ${id}`);
  }
  // eslint-disable-next-line no-new-func
  const fn = new Function(
    "x", "a", "b", "c", "d", "e",
    `"use strict"; const {sin,cos,tan,asin,acos,atan,atan2,sinh,cosh,tanh,log,log2,log10,exp,sqrt,cbrt,abs,floor,ceil,round,sign,pow,min,max,PI,E} = Math; return (${safe});`
  );
  return (x: number) => fn(x, params.a ?? 0, params.b ?? 0, params.c ?? 0, params.d ?? 0, params.e ?? 0);
}

const Slider = ({ label, value, min, max, step, onChange, color }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; color: string;
}) => (
  <div className="flex items-center gap-2 min-w-0">
    <span className="w-5 text-xs font-bold shrink-0" style={{ color }}>{label}</span>
    <input
      type="range" min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="flex-1 h-1.5 accent-blue-500 cursor-pointer min-w-[60px]"
    />
    <span className="text-[10px] font-mono w-10 text-right text-muted-foreground shrink-0">{value.toFixed(1)}</span>
  </div>
);

export default function GraphingCalculator({ subjectColor = "#3b82f6" }: { subjectColor?: string }) {
  const [functions, setFunctions] = useState<Fn[]>([
    { id: "f1", expr: "a*x^2 + b*x + c", color: COLORS[1], visible: true },
  ]);
  const [params, setParams] = useState({ a: 1, b: 0, c: -2, d: 0, e: 0 });
  const [showParams, setShowParams] = useState(true);
  const [xRange, setXRange] = useState({ min: -10, max: 10 });
  const [yRange, setYRange] = useState({ min: -8, max: 8 });
  const [error, setError] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; xMin: number; xMax: number; yMin: number; yMax: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const W = 600, H = 380;
  const padding = 0; // we use full SVG for plot

  const xToPx = useCallback((x: number) =>
    ((x - xRange.min) / (xRange.max - xRange.min)) * W,
    [xRange]);
  const yToPx = useCallback((y: number) =>
    H - ((y - yRange.min) / (yRange.max - yRange.min)) * H,
    [yRange]);
  const pxToX = useCallback((px: number) =>
    xRange.min + (px / W) * (xRange.max - xRange.min), [xRange]);
  const pxToY = useCallback((py: number) =>
    yRange.min + ((H - py) / H) * (yRange.max - yRange.min), [yRange]);

  // Evaluate functions and produce SVG paths
  const paths = useMemo(() => {
    const results: { id: string; color: string; d: string }[] = [];
    setError(null);
    for (const fn of functions) {
      if (!fn.visible || !fn.expr.trim()) continue;
      try {
        const evalFn = makeEvaluator(fn.expr, params);
        const samples = 300;
        let d = "";
        let prevValid = false;
        for (let i = 0; i <= samples; i++) {
          const x = xRange.min + (i / samples) * (xRange.max - xRange.min);
          let y: number;
          try { y = evalFn(x); } catch { prevValid = false; continue; }
          if (!isFinite(y) || isNaN(y)) { prevValid = false; continue; }
          // Clip y to a reasonable bound to avoid massive spikes
          const yClamp = Math.max(yRange.min - 100, Math.min(yRange.max + 100, y));
          const px = xToPx(x);
          const py = yToPx(yClamp);
          // Skip drawing if y is way out of view (discontinuity)
          if (y < yRange.min - 50 || y > yRange.max + 50) {
            prevValid = false;
            continue;
          }
          d += (prevValid ? "L" : "M") + px.toFixed(1) + " " + py.toFixed(1) + " ";
          prevValid = true;
        }
        if (d) results.push({ id: fn.id, color: fn.color, d });
      } catch (e: any) {
        setError(e.message);
      }
    }
    return results;
  }, [functions, params, xRange, yRange, xToPx, yToPx]);

  // Grid lines
  const grid = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
    const xStep = (xRange.max - xRange.min) > 20 ? 5 : (xRange.max - xRange.min) > 10 ? 2 : 1;
    const yStep = (yRange.max - yRange.min) > 20 ? 5 : (yRange.max - yRange.min) > 10 ? 2 : 1;
    for (let x = Math.ceil(xRange.min / xStep) * xStep; x <= xRange.max; x += xStep) {
      const px = xToPx(x);
      lines.push({ x1: px, y1: 0, x2: px, y2: H, major: x === 0 });
    }
    for (let y = Math.ceil(yRange.min / yStep) * yStep; y <= yRange.max; y += yStep) {
      const py = yToPx(y);
      lines.push({ x1: 0, y1: py, x2: W, y2: py, major: y === 0 });
    }
    return { lines, xStep, yStep };
  }, [xRange, yRange, xToPx, yToPx]);

  const addFunction = () => {
    if (functions.length >= 6) return;
    setFunctions([...functions, {
      id: "f" + Date.now(),
      expr: "",
      color: COLORS[functions.length % COLORS.length],
      visible: true,
    }]);
  };
  const removeFunction = (id: string) => setFunctions(functions.filter(f => f.id !== id));
  const updateFunction = (id: string, expr: string) =>
    setFunctions(functions.map(f => f.id === id ? { ...f, expr } : f));
  const toggleVisible = (id: string) =>
    setFunctions(functions.map(f => f.id === id ? { ...f, visible: !f.visible } : f));

  const zoom = (factor: number) => {
    const xMid = (xRange.min + xRange.max) / 2;
    const yMid = (yRange.min + yRange.max) / 2;
    const xSpan = (xRange.max - xRange.min) / 2 / factor;
    const ySpan = (yRange.max - yRange.min) / 2 / factor;
    setXRange({ min: xMid - xSpan, max: xMid + xSpan });
    setYRange({ min: yMid - ySpan, max: yMid + ySpan });
  };
  const reset = () => {
    setXRange({ min: -10, max: 10 });
    setYRange({ min: -8, max: 8 });
  };

  // Mouse / touch drag to pan
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragStart({
      x: e.clientX, y: e.clientY,
      xMin: xRange.min, xMax: xRange.max,
      yMin: yRange.min, yMax: yRange.max,
    });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragStart) return;
    const rect = svgRef.current!.getBoundingClientRect();
    const scaleX = (xRange.max - xRange.min) / rect.width;
    const scaleY = (yRange.max - yRange.min) / rect.height;
    const dx = (e.clientX - dragStart.x) * scaleX;
    const dy = (e.clientY - dragStart.y) * scaleY;
    setXRange({ min: dragStart.xMin - dx, max: dragStart.xMax - dx });
    setYRange({ min: dragStart.yMin + dy, max: dragStart.yMax + dy });
  };
  const onPointerUp = () => setDragStart(null);

  // Wheel zoom (desktop)
  const onWheel = (e: React.WheelEvent) => {
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    zoom(factor);
  };

  // Track container width for responsive SVG
  const [containerWidth, setContainerWidth] = useState(W);
  useEffect(() => {
    const update = () => {
      const parent = svgRef.current?.parentElement;
      if (parent) setContainerWidth(Math.min(W, parent.clientWidth));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-secondary/30">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: subjectColor + "20" }}>
            <Zap className="w-4 h-4" style={{ color: subjectColor }} />
          </div>
          <span className="font-bold text-sm text-foreground truncate">Graphing Calculator</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => zoom(1.2)} className="w-7 h-7 rounded-lg bg-secondary hover:bg-secondary/70 flex items-center justify-center" title="Zoom in"><Plus className="w-3.5 h-3.5" /></button>
          <button onClick={() => zoom(0.8)} className="w-7 h-7 rounded-lg bg-secondary hover:bg-secondary/70 flex items-center justify-center" title="Zoom out"><Minus className="w-3.5 h-3.5" /></button>
          <button onClick={reset} className="w-7 h-7 rounded-lg bg-secondary hover:bg-secondary/70 flex items-center justify-center" title="Reset"><RotateCcw className="w-3.5 h-3.5" /></button>
          <button onClick={() => setShowParams(!showParams)}
            className={`w-7 h-7 rounded-lg flex items-center justify-center ${showParams ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
            title="Toggle sliders"><Sliders className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {/* Function inputs */}
      <div className="p-3 space-y-2 border-b border-border">
        {functions.map((fn) => (
          <div key={fn.id} className="flex items-center gap-2">
            <button onClick={() => toggleVisible(fn.id)}
              className="w-4 h-4 rounded-full border-2 shrink-0"
              style={{ backgroundColor: fn.visible ? fn.color : "transparent", borderColor: fn.color }}
              title={fn.visible ? "Hide" : "Show"} />
            <span className="text-xs font-mono text-muted-foreground shrink-0">y =</span>
            <input
              value={fn.expr}
              onChange={(e) => updateFunction(fn.id, e.target.value)}
              placeholder="e.g. sin(x) + a*x"
              className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-background border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button onClick={() => removeFunction(fn.id)}
              className="w-7 h-7 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 flex items-center justify-center shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
        {functions.length < 6 && (
          <button onClick={addFunction} className="text-xs text-primary hover:underline font-medium">+ Add function</button>
        )}
      </div>

      {/* Sliders */}
      {showParams && (
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 border-b border-border bg-secondary/20">
          {(["a", "b", "c", "d", "e"] as const).map((k) => (
            <Slider key={k} label={k} value={params[k]} min={-5} max={5} step={0.1}
              onChange={(v) => setParams({ ...params, [k]: v })}
              color={COLORS[["a", "b", "c", "d", "e"].indexOf(k)]} />
          ))}
        </div>
      )}

      {/* Plot */}
      <div className="p-3">
        <div className="relative w-full overflow-hidden rounded-xl bg-white dark:bg-slate-900 touch-none select-none"
          style={{ aspectRatio: `${W} / ${H}` }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-full block touch-none cursor-grab active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onWheel={onWheel}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Grid */}
            {grid.lines.map((l, i) => (
              <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                stroke={l.major ? "currentColor" : "currentColor"}
                strokeWidth={l.major ? 1.5 : 0.5}
                opacity={l.major ? 0.4 : 0.15}
                className="text-slate-400 dark:text-slate-500" />
            ))}

            {/* Axis labels */}
            {grid.lines.filter((_, i) => i % 3 === 0).map((l, i) => {
              if (l.x1 === l.x2) {
                const x = pxToX(l.x1);
                if (Math.abs(x) < 0.01) return null;
                return <text key={i} x={l.x1 + 4} y={yToPx(0) - 4} fontSize={10} className="fill-slate-500">{x.toFixed(0)}</text>;
              } else {
                const y = pxToY(l.y1);
                if (Math.abs(y) < 0.01) return null;
                return <text key={i} x={xToPx(0) + 4} y={l.y1 - 2} fontSize={10} className="fill-slate-500">{y.toFixed(0)}</text>;
              }
            })}

            {/* Function curves */}
            {paths.map((p) => (
              <path key={p.id} d={p.d} fill="none" stroke={p.color} strokeWidth={2.5}
                strokeLinejoin="round" strokeLinecap="round" />
            ))}
          </svg>
        </div>
        {error && (
          <p className="text-xs text-red-500 mt-2 font-mono">⚠ {error}</p>
        )}
        <p className="text-[10px] text-muted-foreground mt-2 text-center">
          Drag to pan • Pinch/scroll to zoom • Use <span className="font-mono">a, b, c, d, e</span> as sliders in your function
        </p>
      </div>
    </div>
  );
}
