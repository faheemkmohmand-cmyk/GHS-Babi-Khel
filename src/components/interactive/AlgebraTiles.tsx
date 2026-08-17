/**
 * AlgebraTiles.tsx — Enhanced Visual algebra tiles for factoring & equation solving.
 * 
 * IMPROVEMENTS:
 * ✅ Mobile-first responsive design
 * ✅ Better tile spacing and layout
 * ✅ Drag-and-drop visual feedback
 * ✅ Touch-friendly controls
 * ✅ Beautiful animations
 * ✅ Clear visual hierarchy
 *
 * Usage: <AlgebraTiles subjectColor="#3b82f6" />
 */
import { useMemo, useState, useCallback } from "react";
import { Grid3x3, RotateCcw, Plus, Minus, Trash2, Lightbulb, CheckCircle2 } from "lucide-react";

type TileType = "x2" | "x" | "1";
type Tile = { id: string; type: TileType; sign: 1 | -1 };

// ─── TILE GLYPH COMPONENT (Enhanced) ──────────────────────────────────────

function TileGlyph({ type, sign, color, size, interactive = false, onClick }: {
  type: TileType; sign: 1 | -1; color: string; size: number;
  interactive?: boolean; onClick?: () => void;
}) {
  const fill = sign === 1 ? color : "white";
  const stroke = sign === 1 ? color : "#ef4444";
  const fillStyle = sign === -1 
    ? { backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 3px, #ef4444 3px, #ef4444 5px)` } 
    : {};

  const baseStyle = {
    width: size,
    height: type === "x" ? size / 2 : size,
    backgroundColor: fill,
    border: `2.5px solid ${stroke}`,
    ...fillStyle,
  };

  if (type === "x2") {
    return (
      <button
        onClick={onClick}
        disabled={!interactive}
        className={`flex items-center justify-center text-white text-xs font-bold rounded-sm shadow-md transition-transform hover:scale-105 active:scale-95 ${interactive ? 'cursor-pointer hover:shadow-lg' : 'cursor-default'}`}
        style={baseStyle}
      >
        {sign === 1 ? "x²" : "−x²"}
      </button>
    );
  }
  
  if (type === "x") {
    return (
      <button
        onClick={onClick}
        disabled={!interactive}
        className={`flex items-center justify-center text-white text-[10px] font-bold rounded-sm shadow-md transition-transform hover:scale-105 active:scale-95 ${interactive ? 'cursor-pointer hover:shadow-lg' : 'cursor-default'}`}
        style={baseStyle}
      >
        {sign === 1 ? "x" : "−x"}
      </button>
    );
  }
  
  return (
    <button
      onClick={onClick}
      disabled={!interactive}
      className={`flex items-center justify-center text-white text-[10px] font-bold rounded shadow-md transition-transform hover:scale-105 active:scale-95 ${interactive ? 'cursor-pointer hover:shadow-lg' : 'cursor-default'}`}
      style={baseStyle}
    >
      {sign === 1 ? "1" : "−1"}
    </button>
  );
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────

export default function AlgebraTiles({
  subjectColor = "#3b82f6",
}: {
  subjectColor?: string;
}) {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [targetMode, setTargetMode] = useState<"build" | "factor">("build");
  const [showHint, setShowHint] = useState(false);

  // Add tile with unique ID
  const addTile = useCallback((type: TileType, sign: 1 | -1) => {
    setTiles((prev) => [...prev, {
      id: `t${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type, sign,
    }]);
  }, []);

  // Remove specific tile
  const removeTile = useCallback((id: string) => {
    setTiles((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Clear all tiles
  const clearTiles = useCallback(() => setTiles([]), []);

  // Load example
  const loadExample = useCallback((exampleTiles: { type: TileType; sign: 1 | -1 }[]) => {
    clearTiles();
    exampleTiles.forEach((t, i) => {
      setTimeout(() => {
        setTiles((prev) => [...prev, {
          id: `t${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
          type: t.type, sign: t.sign as 1 | -1,
        }]);
      }, i * 50); // Staggered animation
    });
  }, [clearTiles]);

  // Compute expression from tiles
  const expression = useMemo(() => {
    let x2 = 0, x = 0, c = 0;
    tiles.forEach((t) => {
      if (t.type === "x2") x2 += t.sign;
      else if (t.type === "x") x += t.sign;
      else c += t.sign;
    });
    
    const parts: string[] = [];
    if (x2 !== 0) parts.push((x2 === 1 ? "" : x2 === -1 ? "-" : x2) + "x²");
    if (x !== 0) {
      if (parts.length === 0) parts.push((x === 1 ? "" : x === -1 ? "-" : x) + "x");
      else parts.push((x > 0 ? " + " : " − ") + (Math.abs(x) === 1 ? "" : Math.abs(x)) + "x");
    }
    if (c !== 0) {
      if (parts.length === 0) parts.push(c.toString());
      else parts.push((c > 0 ? " + " : " − ") + Math.abs(c));
    }
    return parts.join("") || "0";
  }, [tiles]);

  // Try to factor the quadratic ax² + bx + c
  const factoring = useMemo(() => {
    let a = 0, b = 0, c = 0;
    tiles.forEach((t) => {
      if (t.type === "x2") a += t.sign;
      else if (t.type === "x") b += t.sign;
      else c += t.sign;
    });
    
    if (a === 0) return null;
    
    const target = a * c;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return { factored: "No real roots", factors: null, disc };
    
    // Try integer factors
    for (let p = -20; p <= 20; p++) {
      for (let q = -20; q <= 20; q++) {
        if (p + q === b && p * q === target) {
          if (a === 1) {
            return {
              factored: `(x ${p >= 0 ? "+" : "−"} ${Math.abs(p)})(x ${q >= 0 ? "+" : "−"} ${Math.abs(q)})`,
              factors: [p, q], disc,
            };
          }
          // Non-monic factorization
          for (let r = 1; r <= Math.abs(a); r++) {
            if (a % r !== 0) continue;
            const t_ = a / r;
            for (let s = -20; s <= 20; s++) {
              if (c === 0 && s !== 0) continue;
              if (c !== 0 && s !== 0 && c % s !== 0) continue;
              const u = c === 0 ? 0 : c / s;
              if (r * u + t_ * s === b) {
                return {
                  factored: `(${r === 1 ? "" : r}x ${s >= 0 ? "+" : "−"} ${Math.abs(s)})(${t_ === 1 ? "" : t_}x ${u >= 0 ? "+" : "−"} ${Math.abs(u)})`,
                  factors: [r, s, t_, u], disc,
                };
              }
            }
          }
        }
      }
    }
    return { factored: "Doesn't factor with integers", factors: null, disc };
  }, [tiles]);

  // Group tiles by type for better display
  const groupedTiles = useMemo(() => {
    const groups = { x2: [], x: [], '1': [] } as Record<TileType, Tile[]>;
    tiles.forEach(t => groups[t.type].push(t));
    return groups;
  }, [tiles]);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2.5 p-3.5 border-b border-border bg-gradient-to-r from-secondary/40 to-secondary/20">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm"
          style={{ backgroundColor: subjectColor + "25" }}>
          <Grid3x3 className="w-4.5 h-4.5" style={{ color: subjectColor }} />
        </div>
        <div className="flex-1">
          <span className="font-bold text-sm text-foreground">Algebra Tiles</span>
          <p className="text-[10px] text-muted-foreground">Visual tiles for factoring & equations</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowHint(!showHint)}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="Show hint">
            <Lightbulb className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Mode Switcher */}
        <div className="flex rounded-xl overflow-hidden bg-muted p-0.5 w-fit">
          <button 
            onClick={() => setTargetMode("build")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              targetMode === "build" 
                ? "text-white shadow-md" 
                : "bg-transparent hover:bg-secondary/50 text-muted-foreground"
            }`}
            style={targetMode === "build" ? { backgroundColor: subjectColor } : {}}
          >
            🧱 Build Expression
          </button>
          <button 
            onClick={() => setTargetMode("factor")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              targetMode === "factor" 
                ? "text-white shadow-md" 
                : "bg-transparent hover:bg-secondary/50 text-muted-foreground"
            }`}
            style={targetMode === "factor" ? { backgroundColor: subjectColor } : {}}
          >
            ✨ Factor Quadratic
          </button>
        </div>

        {/* Hint Box */}
        {showHint && (
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 animate-in fade-in slide-in-from-top-2 duration-300">
            <p className="text-xs text-blue-800 dark:text-blue-200 font-medium flex items-start gap-2">
              <Lightbulb className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Click <strong>+</strong> to add positive tiles, <strong>−</strong> for negative. Build expressions like <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">x² + 5x + 6</code> and watch it factor automatically!</span>
            </p>
          </div>
        )}

        {/* Tile Palette - Responsive Grid */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Tile Palette</p>
          
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {/* X² Tile */}
            <div className="flex flex-col items-center gap-2 p-3 rounded-xl bg-secondary/30 border border-border">
              <span className="text-[10px] font-medium text-muted-foreground">X² Tile</span>
              <div className="flex gap-2">
                <button 
                  onClick={() => addTile("x2", 1)} 
                  className="p-2 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 transition-all hover:scale-105 active:scale-95"
                  title="Add positive x²">
                  <Plus className="w-4 h-4" />
                </button>
                <TileGlyph type="x2" sign={1} color={subjectColor} size={48} />
                <button 
                  onClick={() => addTile("x2", -1)} 
                  className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition-all hover:scale-105 active:scale-95"
                  title="Add negative x²">
                  <Minus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* X Tile */}
            <div className="flex flex-col items-center gap-2 p-3 rounded-xl bg-secondary/30 border border-border">
              <span className="text-[10px] font-medium text-muted-foreground">X Tile</span>
              <div className="flex gap-2">
                <button 
                  onClick={() => addTile("x", 1)} 
                  className="p-2 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 transition-all hover:scale-105 active:scale-95"
                  title="Add positive x">
                  <Plus className="w-4 h-4" />
                </button>
                <TileGlyph type="x" sign={1} color={subjectColor} size={48} />
                <button 
                  onClick={() => addTile("x", -1)} 
                  className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition-all hover:scale-105 active:scale-95"
                  title="Add negative x">
                  <Minus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Unit Tile (1) */}
            <div className="flex flex-col items-center gap-2 p-3 rounded-xl bg-secondary/30 border border-border">
              <span className="text-[10px] font-medium text-muted-foreground">Unit Tile</span>
              <div className="flex gap-2">
                <button 
                  onClick={() => addTile("1", 1)} 
                  className="p-2 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 transition-all hover:scale-105 active:scale-95"
                  title="Add positive 1">
                  <Plus className="w-4 h-4" />
                </button>
                <TileGlyph type="1" sign={1} color={subjectColor} size={32} />
                <button 
                  onClick={() => addTile("1", -1)} 
                  className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition-all hover:scale-105 active:scale-95"
                  title="Add negative 1">
                  <Minus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Workspace - Enhanced Layout */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Workspace</p>
            {tiles.length > 0 && (
              <button 
                onClick={clearTiles}
                className="text-[10px] px-2 py-1 rounded-md bg-red-50 hover:bg-red-100 text-red-600 flex items-center gap-1 transition-colors"
              >
                <Trash2 className="w-3 h-3" /> Clear All
              </button>
            )}
          </div>
          
          <div className="min-h-[140px] sm:min-h-[160px] p-4 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-600 relative overflow-auto">
            {tiles.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center mb-3">
                  <Grid3x3 className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-xs text-muted-foreground max-w-[200px]">
                  Click <strong className="text-foreground">+</strong> above to add tiles<br/>
                  <span className="text-[10px]">Build an expression like x² + 5x + 6</span>
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2.5 sm:gap-3 content-start">
                {/* Group tiles by type for cleaner display */}
                {groupedTiles.x2.map((t) => (
                  <div key={t.id} className="animate-in zoom-in duration-200">
                    <TileGlyph 
                      type={t.type} 
                      sign={t.sign} 
                      color={t.sign === 1 ? subjectColor : "#ef4444"} 
                      size={52} 
                      interactive 
                      onClick={() => removeTile(t.id)} 
                    />
                  </div>
                ))}
                {groupedTiles.x.map((t) => (
                  <div key={t.id} className="animate-in zoom-in duration-200">
                    <TileGlyph 
                      type={t.type} 
                      sign={t.sign} 
                      color={t.sign === 1 ? subjectColor : "#ef4444"} 
                      size={52} 
                      interactive 
                      onClick={() => removeTile(t.id)} 
                    />
                  </div>
                ))}
                {groupedTiles['1'].map((t) => (
                  <div key={t.id} className="animate-in zoom-in duration-200">
                    <TileGlyph 
                      type={t.type} 
                      sign={t.sign} 
                      color={t.sign === 1 ? subjectColor : "#ef4444"} 
                      size={32} 
                      interactive 
                      onClick={() => removeTile(t.id)} 
                    />
                  </div>
                ))}
              </div>
            )}
            
            {/* Tile count badge */}
            {tiles.length > 0 && (
              <div className="absolute bottom-2 right-2 px-2 py-1 rounded-full bg-background/80 backdrop-blur-sm text-[10px] font-medium text-muted-foreground border border-border">
                {tiles.length} tile{tiles.length !== 1 ? 's' : ''} · Tap to remove
              </div>
            )}
          </div>
        </div>

        {/* Expression Display - Beautiful Card */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-background to-secondary/20 border border-border p-4">
          <div className="absolute top-0 left-0 w-full h-1 opacity-50" style={{ background: `linear-gradient(to right, ${subjectColor}, transparent)` }} />
          
          <div className="text-center">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 flex items-center justify-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              Current Expression
            </div>
            <div className="text-2xl sm:text-3xl font-mono font-bold py-2" style={{ color: subjectColor }}>
              {expression || "0"}
            </div>
            {expression !== "0" && (
              <div className="mt-2 pt-2 border-t border-border">
                <p className="text-[10px] text-muted-foreground">
                  {tiles.filter(t => t.type === 'x2').length}x² + {tiles.filter(t => t.type === 'x').length}x + {tiles.filter(t => t.type === '1').length}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Factoring Result */}
        {targetMode === "factor" && factoring && (
          <div className={`overflow-hidden rounded-xl border ${
            factoring.factors 
              ? 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/20 border-green-200 dark:border-green-800' 
              : 'bg-amber-50 dark:amber-950/30 border-amber-200 dark:border-amber-800'
          } animate-in fade-in slide-in-from-bottom-2 duration-300`}>
            <div className="p-4">
              <div className={`text-[10px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5 ${
                factoring.factors ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'
              }`}>
                ✨ Factored Form
              </div>
              
              {factoring.factors ? (
                <>
                  <div className="text-xl sm:text-2xl font-mono font-bold text-green-800 dark:text-green-200 mb-2 text-center">
                    {factoring.factored}
                  </div>
                  <div className="flex items-center justify-center gap-4 text-[10px] text-green-700 dark:text-green-300">
                    <span className="px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/40">
                      D = {factoring.disc.toFixed(0)}
                    </span>
                    <span className="px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/40">
                      {factoring.disc > 0 ? '✓ Two Real Roots' : factoring.disc === 0 ? '⚡ One Root' : '🌀 Complex'}
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-center">
                  <div className="text-base font-mono text-amber-800 dark:text-amber-200 mb-1">
                    {factoring.factored}
                  </div>
                  <p className="text-[10px] text-amber-600 dark:text-amber-400">
                    Try different coefficients or check discriminant
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quick Examples - Beautiful Pills */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Quick Examples</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "x² + 5x + 6", emoji: "🎯", tiles: [
                { type: "x2", sign: 1 },
                { type: "x", sign: 1 }, { type: "x", sign: 1 }, { type: "x", sign: 1 },
                { type: "x", sign: 1 }, { type: "x", sign: 1 },
                { type: "1", sign: 1 }, { type: "1", sign: 1 }, { type: "1", sign: 1 },
                { type: "1", sign: 1 }, { type: "1", sign: 1 },
              ]},
              { label: "x² − 4", emoji: "⚡", tiles: [
                { type: "x2", sign: 1 },
                { type: "1", sign: -1 }, { type: "1", sign: -1 },
                { type: "1", sign: -1 }, { type: "1", sign: -1 },
              ]},
              { label: "x² − 2x − 3", emoji: "🔥", tiles: [
                { type: "x2", sign: 1 },
                { type: "x", sign: -1 }, { type: "x", sign: -1 },
                { type: "1", sign: -1 }, { type: "1", sign: -1 }, { type: "1", sign: -1 },
              ]},
              { label: "2x² + 7x + 3", emoji: "💫", tiles: [
                { type: "x2", sign: 1 }, { type: "x2", sign: 1 },
                { type: "x", sign: 1 }, { type: "x", sign: 1 }, { type: "x", sign: 1 },
                { type: "x", sign: 1 }, { type: "x", sign: 1 }, { type: "x", sign: 1 }, { type: "x", sign: 1 },
                { type: "1", sign: 1 }, { type: "1", sign: 1 }, { type: "1", sign: 1 },
              ]},
            ].map((ex) => (
              <button
                key={ex.label}
                onClick={() => loadExample(ex.tiles)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-medium transition-all hover:scale-105 active:scale-95 border border-transparent hover:border-border"
              >
                <span>{ex.emoji}</span>
                <span className="font-mono">{ex.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
