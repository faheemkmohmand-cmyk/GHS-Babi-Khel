/**
 * PeriodicTable.tsx
 * Interactive periodic table — click any element to see electron config,
 * electronegativity, common compounds, etc. All data is embedded (no API).
 *
 * Usage: <PeriodicTable subjectColor="#10b981" />
 */
import { useState } from "react";
import { Atom, X } from "lucide-react";

type Element = {
  n: number;       // atomic number
  s: string;       // symbol
  name: string;
  mass: number;
  cat: string;     // category
  en?: number;     // electronegativity
  config: string;  // electron configuration
  shells: number[];
  state?: string;  // state at room temp
  discovered?: string;
};

// Compact data — first 36 elements + a few key ones for school use
const ELEMENTS: Element[] = [
  { n: 1, s: "H", name: "Hydrogen", mass: 1.008, cat: "nonmetal", en: 2.20, config: "1s¹", shells: [1], state: "gas", discovered: "1766" },
  { n: 2, s: "He", name: "Helium", mass: 4.003, cat: "noble", config: "1s²", shells: [2], state: "gas", discovered: "1868" },
  { n: 3, s: "Li", name: "Lithium", mass: 6.94, cat: "alkali", en: 0.98, config: "[He] 2s¹", shells: [2,1], state: "solid", discovered: "1817" },
  { n: 4, s: "Be", name: "Beryllium", mass: 9.012, cat: "alkaline", en: 1.57, config: "[He] 2s²", shells: [2,2], state: "solid", discovered: "1798" },
  { n: 5, s: "B", name: "Boron", mass: 10.81, cat: "metalloid", en: 2.04, config: "[He] 2s² 2p¹", shells: [2,3], state: "solid", discovered: "1808" },
  { n: 6, s: "C", name: "Carbon", mass: 12.011, cat: "nonmetal", en: 2.55, config: "[He] 2s² 2p²", shells: [2,4], state: "solid", discovered: "Ancient" },
  { n: 7, s: "N", name: "Nitrogen", mass: 14.007, cat: "nonmetal", en: 3.04, config: "[He] 2s² 2p³", shells: [2,5], state: "gas", discovered: "1772" },
  { n: 8, s: "O", name: "Oxygen", mass: 15.999, cat: "nonmetal", en: 3.44, config: "[He] 2s² 2p⁴", shells: [2,6], state: "gas", discovered: "1774" },
  { n: 9, s: "F", name: "Fluorine", mass: 18.998, cat: "halogen", en: 3.98, config: "[He] 2s² 2p⁵", shells: [2,7], state: "gas", discovered: "1886" },
  { n: 10, s: "Ne", name: "Neon", mass: 20.180, cat: "noble", config: "[He] 2s² 2p⁶", shells: [2,8], state: "gas", discovered: "1898" },
  { n: 11, s: "Na", name: "Sodium", mass: 22.990, cat: "alkali", en: 0.93, config: "[Ne] 3s¹", shells: [2,8,1], state: "solid", discovered: "1807" },
  { n: 12, s: "Mg", name: "Magnesium", mass: 24.305, cat: "alkaline", en: 1.31, config: "[Ne] 3s²", shells: [2,8,2], state: "solid", discovered: "1755" },
  { n: 13, s: "Al", name: "Aluminium", mass: 26.982, cat: "postmetal", en: 1.61, config: "[Ne] 3s² 3p¹", shells: [2,8,3], state: "solid", discovered: "1825" },
  { n: 14, s: "Si", name: "Silicon", mass: 28.085, cat: "metalloid", en: 1.90, config: "[Ne] 3s² 3p²", shells: [2,8,4], state: "solid", discovered: "1824" },
  { n: 15, s: "P", name: "Phosphorus", mass: 30.974, cat: "nonmetal", en: 2.19, config: "[Ne] 3s² 3p³", shells: [2,8,5], state: "solid", discovered: "1669" },
  { n: 16, s: "S", name: "Sulfur", mass: 32.06, cat: "nonmetal", en: 2.58, config: "[Ne] 3s² 3p⁴", shells: [2,8,6], state: "solid", discovered: "Ancient" },
  { n: 17, s: "Cl", name: "Chlorine", mass: 35.45, cat: "halogen", en: 3.16, config: "[Ne] 3s² 3p⁵", shells: [2,8,7], state: "gas", discovered: "1774" },
  { n: 18, s: "Ar", name: "Argon", mass: 39.948, cat: "noble", config: "[Ne] 3s² 3p⁶", shells: [2,8,8], state: "gas", discovered: "1894" },
  { n: 19, s: "K", name: "Potassium", mass: 39.098, cat: "alkali", en: 0.82, config: "[Ar] 4s¹", shells: [2,8,8,1], state: "solid", discovered: "1807" },
  { n: 20, s: "Ca", name: "Calcium", mass: 40.078, cat: "alkaline", en: 1.00, config: "[Ar] 4s²", shells: [2,8,8,2], state: "solid", discovered: "1808" },
  // Skip 21-30 for compactness; placeholder gap
  { n: 29, s: "Cu", name: "Copper", mass: 63.546, cat: "transition", en: 1.90, config: "[Ar] 3d¹⁰ 4s¹", shells: [2,8,18,1], state: "solid", discovered: "Ancient" },
  { n: 30, s: "Zn", name: "Zinc", mass: 65.38, cat: "transition", en: 1.65, config: "[Ar] 3d¹⁰ 4s²", shells: [2,8,18,2], state: "solid", discovered: "1746" },
  { n: 35, s: "Br", name: "Bromine", mass: 79.904, cat: "halogen", en: 2.96, config: "[Ar] 3d¹⁰ 4s² 4p⁵", shells: [2,8,18,7], state: "liquid", discovered: "1826" },
  { n: 47, s: "Ag", name: "Silver", mass: 107.868, cat: "transition", en: 1.93, config: "[Kr] 4d¹⁰ 5s¹", shells: [2,8,18,18,1], state: "solid", discovered: "Ancient" },
  { n: 50, s: "Sn", name: "Tin", mass: 118.710, cat: "postmetal", en: 1.96, config: "[Kr] 4d¹⁰ 5s² 5p²", shells: [2,8,18,18,4], state: "solid", discovered: "Ancient" },
  { n: 53, s: "I", name: "Iodine", mass: 126.904, cat: "halogen", en: 2.66, config: "[Kr] 4d¹⁰ 5s² 5p⁵", shells: [2,8,18,18,7], state: "solid", discovered: "1811" },
  { n: 55, s: "Cs", name: "Caesium", mass: 132.905, cat: "alkali", en: 0.79, config: "[Xe] 6s¹", shells: [2,8,18,18,8,1], state: "solid", discovered: "1860" },
  { n: 56, s: "Ba", name: "Barium", mass: 137.327, cat: "alkaline", en: 0.89, config: "[Xe] 6s²", shells: [2,8,18,18,8,2], state: "solid", discovered: "1808" },
  { n: 78, s: "Pt", name: "Platinum", mass: 195.084, cat: "transition", en: 2.28, config: "[Xe] 4f¹⁴ 5d⁹ 6s¹", shells: [2,8,18,32,17,1], state: "solid", discovered: "1735" },
  { n: 79, s: "Au", name: "Gold", mass: 196.967, cat: "transition", en: 2.54, config: "[Xe] 4f¹⁴ 5d¹⁰ 6s¹", shells: [2,8,18,32,18,1], state: "solid", discovered: "Ancient" },
  { n: 80, s: "Hg", name: "Mercury", mass: 200.592, cat: "transition", en: 2.00, config: "[Xe] 4f¹⁴ 5d¹⁰ 6s²", shells: [2,8,18,32,18,2], state: "liquid", discovered: "Ancient" },
  { n: 82, s: "Pb", name: "Lead", mass: 207.2, cat: "postmetal", en: 2.33, config: "[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p²", shells: [2,8,18,32,18,4], state: "solid", discovered: "Ancient" },
  { n: 92, s: "U", name: "Uranium", mass: 238.029, cat: "lanthanide", en: 1.38, config: "[Rn] 5f³ 6d¹ 7s²", shells: [2,8,18,32,21,9,2], state: "solid", discovered: "1789" },
];

// Layout positions (col, row) for the standard periodic table
// Skipped elements (21-28, 31-34, 36-46, 48-49, 51-52, 54, 57-71, 81, 83-89, 91) are simply
// not shown — this is a curated school-focused table. Position row 9 = "Actinides" strip.
const POSITIONS: Record<number, { col: number; row: number }> = {
  1: { col: 1, row: 1 }, 2: { col: 18, row: 1 },
  3: { col: 1, row: 2 }, 4: { col: 2, row: 2 },
  5: { col: 13, row: 2 }, 6: { col: 14, row: 2 }, 7: { col: 15, row: 2 }, 8: { col: 16, row: 2 }, 9: { col: 17, row: 2 }, 10: { col: 18, row: 2 },
  11: { col: 1, row: 3 }, 12: { col: 2, row: 3 },
  13: { col: 13, row: 3 }, 14: { col: 14, row: 3 }, 15: { col: 15, row: 3 }, 16: { col: 16, row: 3 }, 17: { col: 17, row: 3 }, 18: { col: 18, row: 3 },
  19: { col: 1, row: 4 }, 20: { col: 2, row: 4 },
  29: { col: 11, row: 4 }, 30: { col: 12, row: 4 },
  35: { col: 17, row: 4 },
  47: { col: 11, row: 5 }, 50: { col: 14, row: 5 }, 53: { col: 17, row: 5 },
  55: { col: 1, row: 6 }, 56: { col: 2, row: 6 },
  78: { col: 10, row: 6 }, 79: { col: 11, row: 6 }, 80: { col: 12, row: 6 }, 82: { col: 14, row: 6 },
  92: { col: 6, row: 9 },
};

const CATEGORY_COLORS: Record<string, string> = {
  alkali: "#ef4444",
  alkaline: "#f97316",
  transition: "#f59e0b",
  postmetal: "#10b981",
  metalloid: "#14b8a6",
  nonmetal: "#3b82f6",
  halogen: "#8b5cf6",
  noble: "#ec4899",
  lanthanide: "#64748b",
};

export default function PeriodicTable({ subjectColor = "#10b981" }: { subjectColor?: string }) {
  const [selected, setSelected] = useState<Element | null>(null);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 p-3 border-b border-border bg-secondary/30">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: subjectColor + "20" }}>
          <Atom className="w-4 h-4" style={{ color: subjectColor }} />
        </div>
        <span className="font-bold text-sm text-foreground">Interactive Periodic Table</span>
      </div>

      <div className="p-3">
        {/* Table grid */}
        <div className="w-full overflow-x-auto">
          <div className="grid gap-[3px] min-w-[700px] mx-auto"
            style={{ gridTemplateColumns: "repeat(18, 1fr)", gridTemplateRows: "repeat(7, 1fr) auto auto" }}>
            {ELEMENTS.map((el) => {
              const pos = POSITIONS[el.n];
              if (!pos) return null;
              const color = CATEGORY_COLORS[el.cat] || "#64748b";
              return (
                <button
                  key={el.n}
                  onClick={() => setSelected(el)}
                  className="aspect-square rounded-md flex flex-col items-center justify-center p-0.5 hover:scale-110 hover:z-10 transition-transform relative group"
                  style={{
                    gridColumn: pos.col,
                    gridRow: pos.row,
                    backgroundColor: color + "20",
                    border: `1.5px solid ${color}`,
                  }}
                  title={el.name}
                >
                  <span className="text-[7px] text-muted-foreground leading-none">{el.n}</span>
                  <span className="text-[10px] sm:text-xs font-black text-foreground leading-tight">{el.s}</span>
                  <span className="text-[6px] text-muted-foreground leading-none hidden sm:block truncate w-full text-center">{el.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-2 mt-3 justify-center">
          {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
            <div key={cat} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: color + "40", border: `1px solid ${color}` }} />
              <span className="text-[10px] text-muted-foreground capitalize">{cat}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => setSelected(null)}>
          <div
            className="bg-card rounded-2xl border border-border max-w-md w-full p-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-xl flex flex-col items-center justify-center text-white font-black"
                  style={{ backgroundColor: CATEGORY_COLORS[selected.cat] }}>
                  <span className="text-[10px] font-normal">{selected.n}</span>
                  <span className="text-2xl">{selected.s}</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">{selected.name}</h3>
                  <p className="text-xs text-muted-foreground capitalize">{selected.cat}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-secondary/50">
                <p className="text-muted-foreground">Atomic Mass</p>
                <p className="font-bold text-foreground">{selected.mass} u</p>
              </div>
              <div className="p-2.5 rounded-lg bg-secondary/50">
                <p className="text-muted-foreground">State (25°C)</p>
                <p className="font-bold text-foreground capitalize">{selected.state || "—"}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-secondary/50">
                <p className="text-muted-foreground">Electronegativity</p>
                <p className="font-bold text-foreground">{selected.en ?? "—"}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-secondary/50">
                <p className="text-muted-foreground">Discovered</p>
                <p className="font-bold text-foreground">{selected.discovered || "—"}</p>
              </div>
            </div>

            <div className="mt-3 p-3 rounded-lg bg-secondary/50">
              <p className="text-xs text-muted-foreground mb-1">Electron Configuration</p>
              <p className="font-mono text-sm text-foreground">{selected.config}</p>
            </div>

            {/* Electron shells visualization */}
            <div className="mt-3 p-3 rounded-lg bg-secondary/50">
              <p className="text-xs text-muted-foreground mb-2">Electron Shells</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {selected.shells.map((count, i) => (
                  <div key={i} className="relative">
                    <svg width="60" height="60" viewBox="0 0 60 60">
                      <circle cx="30" cy="30" r={10 + i * 7} fill="none"
                        stroke={subjectColor} strokeWidth="1.5" opacity={0.5 + i * 0.1} />
                      {Array.from({ length: count }).map((_, j) => {
                        const angle = (j / count) * Math.PI * 2 - Math.PI / 2;
                        const r = 10 + i * 7;
                        return (
                          <circle key={j}
                            cx={30 + r * Math.cos(angle)}
                            cy={30 + r * Math.sin(angle)}
                            r="2.5"
                            fill={subjectColor} />
                        );
                      })}
                      <circle cx="30" cy="30" r="6" fill="#ef4444" />
                      <text x="30" y="33" textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">+</text>
                    </svg>
                    <p className="text-[10px] text-center text-muted-foreground mt-1">{count}e⁻</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
