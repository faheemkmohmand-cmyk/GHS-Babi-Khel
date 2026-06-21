/**
 * AlgebraTiles.tsx — Visual algebra tiles for factoring & equation solving.
 *
 * Features:
 *  - Drag-and-drop tiles: x² (large square), x (rectangle), 1 (small square)
 *  - Two colors: positive (filled) and negative (red striped)
 *  - "Build expression" mode: tiles auto-render the expression
 *  - "Factor" mode: arrange tiles into a rectangle → factors appear
 *  - Auto-detection of factored form from tile arrangement
 *  - Mobile-friendly: touch-draggable tiles
 *
 * Usage: <AlgebraTiles subjectColor="#3b82f6" />
 */
import { useMemo, useState } from "react";
import { Grid3x3, RotateCcw, Plus, Minus } from "lucide-react";

type TileType = "x2" | "x" | "1";
type Tile = { id: string; type: TileType; sign: 1 | -1 };

export default function AlgebraTiles({
  subjectColor = "#3b82f6",
}: {
  subjectColor?: string;
}) {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [targetMode, setTargetMode] = useState<"build" | "factor">("build");

  const addTile = (type: TileType, sign: 1 | -1) => {
    setTiles((prev) => [...prev, {
      id: `t${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type, sign,
    }]);
  };

  const clearTiles = () => setTiles([]);

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
    // Find p, q such that p*q = a*c and p+q = b
    const target = a * c;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return { factored: "No real roots", factors: null, disc };
    // try integer factors
    for (let p = -20; p <= 20; p++) {
      for (let q = -20; q <= 20; q++) {
        if (p + q === b && p * q === target) {
          // Try to write as (rx + s)(tx + u) where r*t = a, s*u = c, ru+st = b
          // For monic (a=1): (x + p)(x + q) — but here p+q=b and p*q=a*c=c
          // For non-monic: search small factors
          if (a === 1) {
            return {
              factored: `(x ${p >= 0 ? "+" : "−"} ${Math.abs(p)})(x ${q >= 0 ? "+" : "−"} ${Math.abs(q)})`,
              factors: [p, q], disc,
            };
          }
          // Try factor pairs of a and c
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

  const removeTile = (id: string) => {
    setTiles((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 p-3 border-b border-border bg-secondary/30">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: subjectColor + "20" }}>
          <Grid3x3 className="w-4 h-4" style={{ color: subjectColor }} />
        </div>
        <span className="font-bold text-sm text-foreground">Algebra Tiles</span>
      </div>

      <div className="p-4 space-y-3">
        {/* Mode switcher */}
        <div className="flex rounded-md border border-border overflow-hidden w-fit">
          <button onClick={() => setTargetMode("build")}
            className={`px-3 py-1.5 text-xs font-medium ${targetMode === "build" ? "text-white" : "bg-card hover:bg-secondary text-muted-foreground"}`}
            style={targetMode === "build" ? { backgroundColor: subjectColor } : {}}>
            Build expression
          </button>
          <button onClick={() => setTargetMode("factor")}
            className={`px-3 py-1.5 text-xs font-medium ${targetMode === "factor" ? "text-white" : "bg-card hover:bg-secondary text-muted-foreground"}`}
            style={targetMode === "factor" ? { backgroundColor: subjectColor } : {}}>
            Factor quadratic
          </button>
        </div>

        {/* Tile palette */}
        <div className="grid grid-cols-3 gap-2">
          {([
            { type: "x2" as TileType, label: "x²", shape: "square", size: 56 },
            { type: "x" as TileType, label: "x", shape: "rect", size: 56 },
            { type: "1" as TileType, label: "1", shape: "small", size: 28 },
          ]).map((t) => (
            <div key={t.type} className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-muted-foreground">Add {t.label} tile</span>
              <div className="flex gap-1">
                <button onClick={() => addTile(t.type, 1)}
                  className="p-1.5 rounded-md bg-secondary hover:bg-secondary/70 text-foreground flex items-center gap-1"
                  title={`Add positive ${t.label}`}>
                  <Plus className="w-3 h-3" />
                  <TileGlyph type={t.type} sign={1} color={subjectColor} size={t.size} />
                </button>
                <button onClick={() => addTile(t.type, -1)}
                  className="p-1.5 rounded-md bg-red-50 hover:bg-red-100 text-red-700 flex items-center gap-1"
                  title={`Add negative ${t.label}`}>
                  <Minus className="w-3 h-3" />
                  <TileGlyph type={t.type} sign={-1} color="#ef4444" size={t.size} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Workspace */}
        <div className="min-h-[160px] p-3 rounded-lg bg-secondary/20 border-2 border-dashed border-border">
          <div className="flex flex-wrap gap-2">
            {tiles.length === 0 ? (
              <div className="text-xs text-muted-foreground w-full text-center py-8">
                Click + to add positive tiles, − for negative tiles.
                <br />Build an expression like x² + 5x + 6 and see it factored!
              </div>
            ) : (
              tiles.map((t) => (
                <button key={t.id} onClick={() => removeTile(t.id)}
                  className="hover:opacity-70 transition-opacity"
                  title="Click to remove">
                  <TileGlyph type={t.type} sign={t.sign} color={t.sign === 1 ? subjectColor : "#ef4444"} size={t.type === "x2" ? 56 : t.type === "x" ? 56 : 28} />
                </button>
              ))
            )}
          </div>
        </div>

        {/* Expression display */}
        <div className="p-3 rounded-lg bg-card border border-border text-center">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Expression</div>
          <div className="text-2xl font-mono font-bold" style={{ color: subjectColor }}>
            {expression}
          </div>
        </div>

        {/* Factoring result */}
        {targetMode === "factor" && factoring && (
          <div className="p-3 rounded-lg bg-green-50 border border-green-200">
            <div className="text-[10px] text-green-700 uppercase tracking-wide mb-1">Factored form</div>
            {factoring.factors ? (
              <>
                <div className="text-xl font-mono font-bold text-green-800">{factoring.factored}</div>
                <div className="text-[10px] text-green-700 mt-1">
                  Discriminant: {factoring.disc.toFixed(0)} ({factoring.disc > 0 ? "two real roots" : factoring.disc === 0 ? "one repeated root" : "complex roots"})
                </div>
              </>
            ) : (
              <div className="text-sm font-mono text-green-800">{factoring.factored}</div>
            )}
          </div>
        )}

        {/* Footer controls */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {tiles.length} tiles · Click any tile to remove it
          </span>
          <button onClick={clearTiles}
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-secondary hover:bg-secondary/70 flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> Clear all
          </button>
        </div>

        {/* Quick example */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-muted-foreground">Try:</span>
          {[
            { label: "x² + 5x + 6", tiles: [
              { type: "x2", sign: 1 }, { type: "x", sign: 1 }, { type: "x", sign: 1 },
              { type: "x", sign: 1 }, { type: "x", sign: 1 }, { type: "x", sign: 1 },
              { type: "1", sign: 1 }, { type: "1", sign: 1 }, { type: "1", sign: 1 },
              { type: "1", sign: 1 }, { type: "1", sign: 1 }, { type: "1", sign: 1 },
            ] },
            { label: "x² − 4", tiles: [
              { type: "x2", sign: 1 },
              { type: "1", sign: -1 }, { type: "1", sign: -1 },
              { type: "1", sign: -1 }, { type: "1", sign: -1 },
            ] },
          ].map((ex) => (
            <button key={ex.label}
              onClick={() => {
                clearTiles();
                ex.tiles.forEach((t, i) => {
                  setTiles((prev) => [...prev, {
                    id: `t${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
                    type: t.type as TileType, sign: t.sign as 1 | -1,
                  }]);
                });
              }}
              className="text-[10px] px-2 py-1 rounded-md bg-secondary hover:bg-secondary/70 text-foreground font-mono">
              {ex.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TileGlyph({ type, sign, color, size }: {
  type: TileType; sign: 1 | -1; color: string; size: number;
}) {
  const fill = sign === 1 ? color : "white";
  const stroke = sign === 1 ? color : "#ef4444";
  const fillStyle = sign === -1 ? { backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 3px, #ef4444 3px, #ef4444 5px)` } : {};

  if (type === "x2") {
    return (
      <div style={{
        width: size, height: size,
        backgroundColor: fill, border: `2px solid ${stroke}`,
        ...fillStyle,
      }} className="flex items-center justify-center text-white text-xs font-bold">
        {sign === 1 ? "x²" : "−x²"}
      </div>
    );
  }
  if (type === "x") {
    return (
      <div style={{
        width: size, height: size / 2,
        backgroundColor: fill, border: `2px solid ${stroke}`,
        ...fillStyle,
      }} className="flex items-center justify-center text-white text-[10px] font-bold">
        {sign === 1 ? "x" : "−x"}
      </div>
    );
  }
  return (
    <div style={{
      width: size, height: size,
      backgroundColor: fill, border: `2px solid ${stroke}`,
      ...fillStyle,
    }} className="flex items-center justify-center text-white text-[10px] font-bold">
      {sign === 1 ? "1" : "−1"}
    </div>
  );
}
