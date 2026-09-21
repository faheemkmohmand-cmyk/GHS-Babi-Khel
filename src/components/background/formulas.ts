import * as THREE from "three";

/* ════════════════════════════════════════════════════════════════════════
   FORMULA SPRITES — canvas-painted "glowing ink" textures for the bubbles
   ────────────────────────────────────────────────────────────────────────
   Each bubble holds one faint, glowing glyph at its heart. Instead of
   expensive 3D text geometry, every glyph is painted ONCE onto a small
   offscreen canvas (256×128) and uploaded as a THREE.CanvasTexture. The
   whole set costs ~1.5 MB of VRAM and is generated a single time per
   theme, then SHARED by every bubble — zero per-frame texture work.

   The set: π · ∫ · E=mc² · √x · ∑ · a²+b²=c² · πr² · λ · Δ
           + three science glyphs drawn with strokes:
             an atom (nucleus + three orbits), a DNA double helix,
             and a geometry medallion (circle / triangle / square).

   Ink colours follow the theme: warm espresso-azure-tangerine on the
   Solar Cream light background, lifted pastel versions on dark/lantern.
   ════════════════════════════════════════════════════════════════════════ */

export type FormulaTheme = "light" | "dark";

const W = 256;
const H = 128;

/** Theme-tuned ink pairs: [azure, tangerine]. Light = deep enough to read
 *  faintly on cream paper; dark = lifted pastels that glow on cocoa. */
const INK: Record<FormulaTheme, { azure: string; tangerine: string }> = {
  light: { azure: "rgba(46, 116, 158, 1)", tangerine: "rgba(196, 105, 40, 1)" },
  dark: { azure: "rgba(126, 190, 226, 1)", tangerine: "rgba(240, 168, 100, 1)" },
};

type Ctx = CanvasRenderingContext2D;

/** Big serif glyph centred on the card. */
function drawGlyph(ctx: Ctx, text: string, ink: string, size = 86, dy = 0) {
  ctx.font = `600 ${size}px Georgia, 'Times New Roman', serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = ink;
  ctx.shadowBlur = 22;
  ctx.fillStyle = ink;
  ctx.fillText(text, W / 2, H / 2 + dy);
  // Second pass without shadow sharpens the core stroke.
  ctx.shadowBlur = 0;
  ctx.fillText(text, W / 2, H / 2 + dy);
}

/** E=mc² — needs a hand-set superscript (canvas has no rich text). */
function drawEmc(ctx: Ctx, ink: string) {
  ctx.font = "600 64px Georgia, 'Times New Roman', serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = ink;
  ctx.shadowBlur = 20;
  ctx.fillStyle = ink;
  const base = H / 2 + 4;
  ctx.fillText("E=mc", W / 2 - 12, base);
  ctx.font = "600 40px Georgia, 'Times New Roman', serif";
  ctx.fillText("2", W / 2 + 62, base - 22);
  ctx.shadowBlur = 0;
  ctx.fillText("2", W / 2 + 62, base - 22);
}

/** Atom: nucleus + three elliptical orbits rotated 60° apart. */
function drawAtom(ctx: Ctx, ink: string) {
  const cx = W / 2;
  const cy = H / 2;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 3;
  ctx.shadowColor = ink;
  ctx.shadowBlur = 14;
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((Math.PI / 3) * i);
    ctx.beginPath();
    ctx.ellipse(0, 0, 78, 30, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  // Nucleus — a small glowing cluster.
  ctx.fillStyle = ink;
  for (const [dx, dy, r] of [
    [-5, -3, 7],
    [5, 3, 7],
    [0, 0, 5],
  ]) {
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Electron dots riding the orbits.
  ctx.beginPath();
  ctx.arc(cx + 78, cy, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - 39, cy - 26, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

/** DNA: two sine strands + connecting rungs. */
function drawDna(ctx: Ctx, ink: string) {
  const midY = H / 2;
  const amp = 34;
  const wavelength = 110;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 3.5;
  ctx.shadowColor = ink;
  ctx.shadowBlur = 14;
  const strand = (phase: number) => {
    ctx.beginPath();
    for (let x = 38; x <= W - 38; x += 3) {
      const y = midY + Math.sin(((x + phase) / wavelength) * Math.PI * 2) * amp;
      if (x === 38) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  strand(0);
  strand(wavelength / 2);
  // Rungs where the strands are farthest apart.
  ctx.lineWidth = 2.5;
  for (let x = 60; x <= W - 60; x += 27) {
    const s = Math.sin((x / wavelength) * Math.PI * 2);
    if (Math.abs(s) < 0.55) continue;
    const y1 = midY + s * amp;
    const y2 = midY - s * amp;
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y2);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
}

/** Geometry medallion: circle, inscribed triangle, bounding square. */
function drawGeometry(ctx: Ctx, ink: string) {
  const cx = W / 2;
  const cy = H / 2;
  const R = 46;
  ctx.strokeStyle = ink;
  ctx.shadowColor = ink;
  ctx.shadowBlur = 14;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, R + 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
    const x = cx + Math.cos(a) * R;
    const y = cy + Math.sin(a) * R;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - R - 12, cy - R - 12, (R + 12) * 2, (R + 12) * 2);
  ctx.shadowBlur = 0;
}

/** One radial-gradient sprite used by the pop flash + soft halo. */
export function createGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255, 255, 255, 1)");
  g.addColorStop(0.35, "rgba(255, 255, 255, 0.55)");
  g.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface FormulaSet {
  textures: THREE.CanvasTexture[];
  dispose: () => void;
}

/** Build the whole glyph set for a theme. Each painter picks azure or
 *  tangerine ink so the formulas alternate between the two brand tones. */
export function createFormulaTextures(theme: FormulaTheme): FormulaSet {
  const ink = INK[theme];
  const painters: Array<(ctx: Ctx) => void> = [
    (c) => drawGlyph(c, "π", ink.azure),
    (c) => drawGlyph(c, "∫", ink.tangerine, 96),
    (c) => drawEmc(c, ink.azure),
    (c) => drawGlyph(c, "√x", ink.tangerine, 78),
    (c) => drawGlyph(c, "∑", ink.azure, 92),
    (c) => drawGlyph(c, "a²+b²=c²", ink.tangerine, 44),
    (c) => drawGlyph(c, "πr²", ink.azure, 72),
    (c) => drawGlyph(c, "λ", ink.tangerine, 90),
    (c) => drawGlyph(c, "Δ", ink.azure, 88),
    (c) => drawAtom(c, ink.tangerine),
    (c) => drawDna(c, ink.azure),
    (c) => drawGeometry(c, ink.azure),
  ];

  const textures: THREE.CanvasTexture[] = [];
  for (const paint of painters) {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    // Fully transparent card — the glyph alone floats inside the bubble.
    ctx.clearRect(0, 0, W, H);
    paint(ctx);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 2;
    tex.needsUpdate = true;
    textures.push(tex);
  }

  return {
    textures,
    dispose: () => textures.forEach((t) => t.dispose()),
  };
}
