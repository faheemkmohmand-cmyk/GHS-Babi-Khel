// ── shareResultCard.ts ──────────────────────────────────────────────────────
// Generates a beautiful, professional "marks card" IMAGE for a student's
// result (school results AND BISE Peshawar board results) and shares it via
// the Web Share API — so a student can post his marks to WhatsApp,
// Instagram, or anywhere else, with the school's branding and the official
// website link baked into both the image and the caption.
//
// WHY CANVAS (instead of html2canvas / a screenshot of the on-screen card)?
//   • Pixel-perfect 1080px-wide output regardless of the visitor's screen
//     or the site's current theme (light/dark) — the shared image always
//     looks like an official document, never like a dark-mode screenshot.
//   • Fixed, hand-drawn layout = complete control over typography, gold
//     accents, subject bars and badges.
//   • Zero new dependencies — nothing is added to the bundle.
//
// SHARE STRATEGY (most-capable path first):
//   1. Web Share API Level 2 — share the PNG file itself
//      (navigator.share({ files })) so the image lands directly in a
//      WhatsApp chat / gallery. Used when navigator.canShare({ files })
//      is true (modern Android/iOS browsers, Chrome & Edge on desktop).
//   2. Web Share API text — share the marks caption + website link.
//   3. Fallback (desktop without sharing) — download the PNG and copy the
//      caption + link to the clipboard.
//
// The canvas → File conversion is fully SYNCHRONOUS (toDataURL + atob, no
// async toBlob callback), so navigator.share() is still called inside the
// browser's transient user-activation window — the #1 hidden reason file
// sharing silently fails on iOS Safari.
//
// The site URL is imported from the SEO module so the shared link can never
// drift away from the site's canonical origin.

import { SITE_URL } from "@/components/seo/SEO";
import toast from "react-hot-toast";

// The link that accompanies every shared marks card — the homepage Results
// section, where classmates can look up their own result.
export const RESULTS_SHARE_URL = `${SITE_URL}/results`;
// Companion links baked into the Roll No. Slip and Merit List share cards,
// so whoever receives a shared card lands exactly where they can look up
// their own slip / ranking.
export const ROLLSLIP_SHARE_URL = `${SITE_URL}/roll-no-slip`;
export const MERIT_SHARE_URL = `${SITE_URL}/merit-list`;

// ── Public data shapes ──────────────────────────────────────────────────────

export interface SchoolResultShareData {
  studentName: string;
  className: string;
  examLabel: string;            // e.g. "1st Semester 2026"
  rollNo: string;
  totalMarks: number | string;
  obtainedMarks: number | string;
  percentage: number | string;
  grade: string;
  isPass: boolean;
  schoolRank: number | null;    // whole-school rank (Trophy badge on screen)
  classPosition: number | null;
  subjects: { name: string; obtained: number; total: number }[];
  photoUrl?: string | null;     // optional student photo (CORS-safe load)
}

export interface BiseResultShareData {
  examTitle: string;            // live BISEP title, e.g. "SSC Annual-I Examination 2026"
  studentName: string;
  fatherName: string;
  rollNo: string;
  marks: string;                // e.g. "1028"
  grade: string;                // e.g. "A1"
  remarks: string;              // e.g. "PASS" / "PROMOTED" / ""
  subjects: {
    sr: string;
    subject: string;
    theory: string;
    practical: string;
    theoryFail?: boolean;
    practicalFail?: boolean;
  }[];
}

export interface RollSlipShareData {
  studentName: string;
  fatherName: string;           // may be "—" when not recorded
  rollNo: string;               // EXAM roll no (the one on the slip)
  className: string;            // e.g. "9"
  examLabel: string;            // e.g. "First Semester 2026"
}

export interface MeritShareData {
  studentName: string;
  rollNo: string;
  className: string;            // e.g. "9"
  position: number;             // 1 = topper
  obtainedMarks: number | string;
  totalMarks: number | string;
  percentage: number | string;
  grade: string;
  examLabel: string;            // e.g. "Class 9 · First Semester · Year 2026"
  photoUrl?: string | null;
}

export type ShareOutcome =
  | "shared-file"   // PNG image + caption shared via the share sheet
  | "shared-text"   // caption + link shared (files unsupported)
  | "downloaded"    // PNG downloaded + caption copied (desktop fallback)
  | "cancelled"     // visitor closed the share sheet — no message needed
  | "failed";       // nothing worked

// ── Palette (fixed — shared images must be theme-independent) ───────────────

const C = {
  bgTop: "#0A1228",
  bgBottom: "#102050",
  card: "#FFFFFF",
  headerTop: "#0A2463",
  headerMid: "#153E9C",
  headerBottom: "#2563EB",
  navy: "#0B1220",
  navyBottom: "#15275B",
  ink: "#0F172A",
  sub: "#475569",
  label: "#64748B",
  line: "#E2E8F0",
  track: "#EDF1F7",
  tile: "#F8FAFC",
  gold: "#E3B341",
  goldBright: "#F4C550",
  goldDark: "#B45309",
  goldBg: "#FFFBEB",
  goldBorder: "#FDE68A",
  blue: "#1D4ED8",
  blueBg: "#EFF6FF",
  blueBorder: "#BFDBFE",
  green: "#16A34A",
  greenBg: "#F0FDF4",
  greenBorder: "#BBF7D0",
  red: "#DC2626",
  redBg: "#FEF2F2",
  redBorder: "#FECACA",
  slateBg: "#F1F5F9",
  slateBorder: "#E2E8F0",
} as const;

const FONT = `'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif`;
const W = 1080;          // canvas width — 4:5-ish portrait shares beautifully
const M = 44;            // outer background margin around the white card
const PAD = 44;          // inner card padding

// ── Small drawing helpers ───────────────────────────────────────────────────

type Ctx = CanvasRenderingContext2D;

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function setFont(ctx: Ctx, px: number, weight = 400) {
  ctx.font = `${weight} ${px}px ${FONT}`;
}

// Shrink font size until the text fits maxW (returns the final px used).
function fitText(ctx: Ctx, text: string, maxW: number, startPx: number, weight = 700, minPx = 13): number {
  let px = startPx;
  setFont(ctx, px, weight);
  while (px > minPx && ctx.measureText(text).width > maxW) {
    px -= 1;
    setFont(ctx, px, weight);
  }
  return px;
}

// Hard-truncate with an ellipsis (font must already be set).
function truncateText(ctx: Ctx, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

function drawStar(ctx: Ctx, cx: number, cy: number, r: number, color: string) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawCheck(ctx: Ctx, cx: number, cy: number, r: number, color: string, lw: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.9, cy + r * 0.05);
  ctx.lineTo(cx - r * 0.15, cy + r * 0.75);
  ctx.lineTo(cx + r * 0.95, cy - r * 0.7);
  ctx.stroke();
}

function drawCross(ctx: Ctx, cx: number, cy: number, r: number, color: string, lw: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.75, cy - r * 0.75);
  ctx.lineTo(cx + r * 0.75, cy + r * 0.75);
  ctx.moveTo(cx + r * 0.75, cy - r * 0.75);
  ctx.lineTo(cx - r * 0.75, cy + r * 0.75);
  ctx.stroke();
}

interface PillOpts {
  bg: string;
  border: string;
  fg: string;
  icon?: "star" | "check" | "cross";
  iconColor?: string;
}

const PILL_H = 54;

function pillWidth(ctx: Ctx, text: string, px = 21): number {
  setFont(ctx, px, 800);
  return Math.ceil(ctx.measureText(text).width) + (text ? 92 : 52);
}

function drawPill(ctx: Ctx, x: number, cy: number, text: string, w: number, o: PillOpts): number {
  const y = cy - PILL_H / 2;
  rr(ctx, x, y, w, PILL_H, PILL_H / 2);
  ctx.fillStyle = o.bg;
  ctx.fill();
  ctx.strokeStyle = o.border;
  ctx.lineWidth = 2;
  ctx.stroke();
  // icon
  let textX = x + 30;
  if (o.icon) {
    const icx = x + 40;
    if (o.icon === "star") drawStar(ctx, icx, cy, 13, o.iconColor ?? C.gold);
    else if (o.icon === "check") drawCheck(ctx, icx, cy, 12, o.iconColor ?? C.green, 4.5);
    else drawCross(ctx, icx, cy, 11, o.iconColor ?? C.red, 4.5);
    textX = x + 62;
  }
  setFont(ctx, 21, 800);
  ctx.fillStyle = o.fg;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, textX, cy + 1);
  return w;
}

// Draw a centred row of pills; returns the y cursor after the row.
function pillRow(ctx: Ctx, cy: number, pills: { text: string; o: PillOpts }[]) {
  const gap = 16;
  const widths = pills.map(p => pillWidth(ctx, p.text));
  const total = widths.reduce((a, b) => a + b, 0) + gap * (pills.length - 1);
  let x = (W - total) / 2;
  pills.forEach((p, i) => {
    drawPill(ctx, x, cy, p.text, widths[i], p.o);
    x += widths[i] + gap;
  });
}

// ── Chrome: background, card, header, footer (shared by both variants) ──────

function drawBackground(ctx: Ctx, H: number) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, C.bgTop);
  g.addColorStop(1, C.bgBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // soft blue glow (top-right) + gold glow (bottom-left)
  const b = ctx.createRadialGradient(W * 0.86, H * 0.1, 40, W * 0.86, H * 0.1, 480);
  b.addColorStop(0, "rgba(59,130,246,0.28)");
  b.addColorStop(1, "rgba(59,130,246,0)");
  ctx.fillStyle = b;
  ctx.fillRect(0, 0, W, H);
  const gd = ctx.createRadialGradient(W * 0.08, H * 0.92, 40, W * 0.08, H * 0.92, 520);
  gd.addColorStop(0, "rgba(227,179,65,0.20)");
  gd.addColorStop(1, "rgba(227,179,65,0)");
  ctx.fillStyle = gd;
  ctx.fillRect(0, 0, W, H);
}

function drawCard(ctx: Ctx, H: number) {
  // drop shadow
  ctx.save();
  ctx.shadowColor = "rgba(2,8,28,0.55)";
  ctx.shadowBlur = 44;
  ctx.shadowOffsetY = 18;
  rr(ctx, M, M, W - 2 * M, H - 2 * M, 40);
  ctx.fillStyle = C.card;
  ctx.fill();
  ctx.restore();
  // clip everything below to the rounded card
  ctx.save();
  rr(ctx, M, M, W - 2 * M, H - 2 * M, 40);
  ctx.clip();
}

// Gold "GHS" monogram seal — the official-document touch on the header.
function drawSeal(ctx: Ctx, cx: number, cy: number) {
  ctx.save();
  // soft halo
  const halo = ctx.createRadialGradient(cx, cy, 20, cx, cy, 74);
  halo.addColorStop(0, "rgba(227,179,65,0.35)");
  halo.addColorStop(1, "rgba(227,179,65,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(cx - 74, cy - 74, 148, 148);
  // outer + inner rings
  ctx.beginPath(); ctx.arc(cx, cy, 52, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(244,197,80,0.95)"; ctx.lineWidth = 4; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 44, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(244,197,80,0.55)"; ctx.lineWidth = 1.6; ctx.stroke();
  // monogram
  setFont(ctx, 30, 800);
  ctx.fillStyle = C.goldBright;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("GHS", cx, cy - 6);
  setFont(ctx, 12, 700);
  ctx.fillStyle = "rgba(244,197,80,0.85)";
  ctx.fillText("BABI KHEL", cx, cy + 18);
  ctx.restore();
}

interface HeaderOpts { pillText: string; tone?: "blue" | "green"; }

const HEADER_H = 300;

// Two header tones keep the card family recognisable while giving each
// document its own identity: blue = results/merit lists, green = roll slips
// (the school's brand green — used sparingly, per the design brief).
const HEADER_TONES = {
  blue:  { top: C.headerTop,  mid: C.headerMid,  bottom: C.headerBottom },
  green: { top: "#064E3B",    mid: "#047857",    bottom: "#059669" },
} as const;

function drawHeader(ctx: Ctx, o: HeaderOpts) {
  const top = M;
  const tone = HEADER_TONES[o.tone ?? "blue"];
  const g = ctx.createLinearGradient(M, top, W - M, top + HEADER_H);
  g.addColorStop(0, tone.top);
  g.addColorStop(0.55, tone.mid);
  g.addColorStop(1, tone.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(M, top, W - 2 * M, HEADER_H);

  // decorative translucent circles
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath(); ctx.arc(M + 60, top + 250, 130, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(W - M - 30, top + 40, 90, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.beginPath(); ctx.arc(W * 0.5, top - 60, 110, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  drawSeal(ctx, W - M - 96, top + 96);

  // school identity
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  fitText(ctx, "GOVT. HIGH SCHOOL BABI KHEL", 700, 40, 800);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText("GOVT. HIGH SCHOOL BABI KHEL", W / 2 - 40, top + 100);
  setFont(ctx, 21, 600);
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.fillText("District Mohmand · Khyber Pakhtunkhwa", W / 2 - 40, top + 138);

  // gold hairline
  const hl = ctx.createLinearGradient(W / 2 - 130, 0, W / 2 + 130, 0);
  hl.addColorStop(0, "rgba(227,179,65,0)");
  hl.addColorStop(0.5, C.goldBright);
  hl.addColorStop(1, "rgba(227,179,65,0)");
  ctx.fillStyle = hl;
  ctx.fillRect(W / 2 - 130, top + 164, 260, 3);

  // gold pill with the exam label
  setFont(ctx, 21, 800);
  const pillText = o.pillText.toUpperCase();
  const pw = Math.ceil(ctx.measureText(pillText).width) + 72;
  const ph = 46;
  const px = (W - pw) / 2 - 40;
  const py = top + 196;
  rr(ctx, px, py, pw, ph, ph / 2);
  ctx.fillStyle = C.gold;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#1A2333";
  ctx.textBaseline = "middle";
  ctx.fillText(pillText, px + pw / 2, py + ph / 2 + 1);
  ctx.textBaseline = "alphabetic";

  // gold hairline along the header's bottom edge
  ctx.fillStyle = C.gold;
  ctx.fillRect(M, top + HEADER_H - 4, W - 2 * M, 4);
}

interface StudentOpts {
  name: string;
  subLine: string;
  rollLabel: string;
  rollNo: string;
  photo: HTMLImageElement | null;
}

const STUDENT_H = 168;

function drawStudentBand(ctx: Ctx, o: StudentOpts) {
  const y0 = M + HEADER_H;
  // avatar with gold ring
  const cx = M + PAD + 54;
  const cy = y0 + STUDENT_H / 2;
  ctx.beginPath(); ctx.arc(cx, cy, 58, 0, Math.PI * 2);
  ctx.fillStyle = C.goldBg; ctx.fill();
  ctx.strokeStyle = C.gold; ctx.lineWidth = 4; ctx.stroke();
  if (o.photo) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, 50, 0, Math.PI * 2); ctx.clip();
    // cover-fit the photo inside the circle
    const s = Math.max(100 / o.photo.width, 100 / o.photo.height);
    const dw = o.photo.width * s;
    const dh = o.photo.height * s;
    ctx.drawImage(o.photo, cx - dw / 2, cy - dh / 2, dw, dh);
    ctx.restore();
  } else {
    const ag = ctx.createLinearGradient(cx - 50, cy - 50, cx + 50, cy + 50);
    ag.addColorStop(0, C.headerMid);
    ag.addColorStop(1, C.headerBottom);
    ctx.beginPath(); ctx.arc(cx, cy, 50, 0, Math.PI * 2);
    ctx.fillStyle = ag; ctx.fill();
    setFont(ctx, 46, 800);
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((o.name || "S").charAt(0).toUpperCase(), cx, cy + 2);
    ctx.textBaseline = "alphabetic";
  }

  // name + sub line
  const textX = M + PAD + 136;
  const maxW = 500;
  const namePx = fitText(ctx, o.name, maxW, 42, 800);
  ctx.fillStyle = C.ink;
  ctx.textAlign = "left";
  ctx.fillText(o.name, textX, y0 + 78);
  setFont(ctx, Math.min(23, namePx), 600);
  ctx.fillStyle = C.sub;
  ctx.fillText(truncateText(ctx, o.subLine, maxW), textX, y0 + 116);

  // roll no block (right)
  const rightX = W - M - PAD;
  setFont(ctx, 17, 700);
  ctx.fillStyle = C.label;
  ctx.textAlign = "right";
  ctx.fillText(o.rollLabel.toUpperCase(), rightX, y0 + 60);
  fitText(ctx, o.rollNo, 270, 40, 800);
  ctx.fillStyle = C.blue;
  ctx.fillText(o.rollNo, rightX, y0 + 104);

  // divider
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(M + PAD, y0 + STUDENT_H - 16);
  ctx.lineTo(W - M - PAD, y0 + STUDENT_H - 16);
  ctx.stroke();
}

interface StatTile { label: string; value: string; color: string; bg?: string; border?: string; }

function drawStatTiles(ctx: Ctx, tiles: StatTile[], y0: number = M + HEADER_H + STUDENT_H): number {
  const y1 = y0;
  const innerW = W - 2 * M - 2 * PAD;
  const gap = 16;
  const tileW = (innerW - gap * (tiles.length - 1)) / tiles.length;
  const tileH = 104;
  tiles.forEach((t, i) => {
    const x = M + PAD + i * (tileW + gap);
    rr(ctx, x, y1 + 22, tileW, tileH, 20);
    ctx.fillStyle = t.bg ?? C.tile;
    ctx.fill();
    ctx.strokeStyle = t.border ?? C.line;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = "center";
    setFont(ctx, 16, 700);
    ctx.fillStyle = C.label;
    ctx.fillText(t.label.toUpperCase(), x + tileW / 2, y1 + 54);
    fitText(ctx, t.value, tileW - 24, 33, 800);
    ctx.fillStyle = t.color;
    ctx.fillText(t.value, x + tileW / 2, y1 + 96);
  });
  return y1 + 22 + tileH + 26; // y cursor for the next section
}

function drawSectionTitle(ctx: Ctx, y: number, title: string) {
  ctx.textAlign = "left";
  setFont(ctx, 19, 800);
  ctx.fillStyle = C.label;
  ctx.fillText(title, M + PAD, y);
  ctx.fillStyle = C.gold;
  ctx.fillRect(M + PAD, y + 12, 64, 3);
}

function drawNoteStrip(ctx: Ctx, y: number, text: string) {
  const x = M + PAD;
  const w = W - 2 * M - 2 * PAD;
  rr(ctx, x, y, w, 64, 14);
  ctx.fillStyle = C.slateBg;
  ctx.fill();
  // shrink-to-fit so longer notes never spill past the strip's edges
  fitText(ctx, text, w - 56, 20, 600, 14);
  ctx.fillStyle = C.label;
  ctx.textAlign = "center";
  ctx.fillText(text, W / 2, y + 40);
}

const FOOTER_H = 96;

function drawFooter(ctx: Ctx, linkPath = "/results") {
  const y = M + cardHeightSoFar - FOOTER_H;
  // gold hairline on top of the footer
  ctx.fillStyle = C.gold;
  ctx.fillRect(M, y, W - 2 * M, 2.5);
  const g = ctx.createLinearGradient(0, y, 0, y + FOOTER_H);
  g.addColorStop(0, C.navy);
  g.addColorStop(1, C.navyBottom);
  ctx.fillStyle = g;
  ctx.fillRect(M, y, W - 2 * M, FOOTER_H);

  const linkText = `ghsbabikhel.indevs.in${linkPath}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  setFont(ctx, 22, 600);
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillText("GHS Babi Khel — Official School Portal", M + PAD, y + FOOTER_H / 2 + 1);
  ctx.textAlign = "right";
  fitText(ctx, linkText, 430, 24, 800);
  ctx.fillStyle = C.goldBright;
  ctx.fillText(linkText, W - M - PAD, y + FOOTER_H / 2 + 1);
  ctx.textBaseline = "alphabetic";
}

// Module-level cursor so drawFooter knows the card bottom — set by builders.
let cardHeightSoFar = 0;

// ── Canvas bootstrap ────────────────────────────────────────────────────────

function createCanvas(H: number): Ctx | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  return ctx;
}

// ── SCHOOL result card ──────────────────────────────────────────────────────

function buildSchoolCanvas(d: SchoolResultShareData, photo: HTMLImageElement | null): HTMLCanvasElement | null {
  const rows = d.subjects.length;
  const subjectBlock = rows > 0 ? 52 + rows * 56 : 52 + 64 + 18;
  const badgesH = 34 + PILL_H + 30;
  cardHeightSoFar = HEADER_H + STUDENT_H + 152 + subjectBlock + badgesH + FOOTER_H;
  const H = cardHeightSoFar + 2 * M;
  const ctx = createCanvas(H);
  if (!ctx) return null;

  drawBackground(ctx, H);
  drawCard(ctx, H);
  drawHeader(ctx, { pillText: `Official Result · ${d.examLabel}` });
  drawStudentBand(ctx, {
    name: d.studentName,
    subLine: `Class ${d.className} · ${d.examLabel}`,
    rollLabel: "Exam Roll No",
    rollNo: d.rollNo,
    photo,
  });

  const ySub = drawStatTiles(ctx, [
    { label: "Total", value: String(d.totalMarks), color: C.ink },
    { label: "Obtained", value: String(d.obtainedMarks), color: C.blue },
    { label: "Percentage", value: `${d.percentage}%`, color: C.green },
    { label: "Grade", value: d.grade || "—", color: C.goldDark, bg: C.goldBg, border: C.goldBorder },
  ]);

  drawSectionTitle(ctx, ySub + 14, "SUBJECT-WISE MARKS");
  let y = ySub + 52;
  if (rows > 0) {
    const trackX = M + PAD + 330;
    const trackW = W - M - PAD - 150 - trackX;
    d.subjects.forEach((s) => {
      const cy = y + 26;
      setFont(ctx, 25, 600);
      ctx.fillStyle = C.ink;
      ctx.textAlign = "left";
      ctx.fillText(truncateText(ctx, s.name, 310), M + PAD, cy + 9);
      // track
      rr(ctx, trackX, cy - 7, trackW, 14, 7);
      ctx.fillStyle = C.track;
      ctx.fill();
      // fill
      const pct = s.total > 0 ? Math.min(Math.max(s.obtained / s.total, 0), 1) : 0;
      if (pct > 0) {
        const fg = ctx.createLinearGradient(trackX, 0, trackX + trackW, 0);
        if (pct >= 0.5) { fg.addColorStop(0, "#1D4ED8"); fg.addColorStop(1, "#60A5FA"); }
        else if (pct >= 0.33) { fg.addColorStop(0, "#D97706"); fg.addColorStop(1, "#FBBF24"); }
        else { fg.addColorStop(0, "#DC2626"); fg.addColorStop(1, "#F87171"); }
        rr(ctx, trackX, cy - 7, Math.max(trackW * pct, 14), 14, 7);
        ctx.fillStyle = fg;
        ctx.fill();
      }
      // value
      setFont(ctx, 25, 700);
      ctx.fillStyle = C.sub;
      ctx.textAlign = "right";
      ctx.fillText(`${s.obtained}/${s.total}`, W - M - PAD, cy + 9);
      y += 56;
    });
  } else {
    drawNoteStrip(ctx, y, "Detailed subject-wise marks are not entered for this result.");
    y += 82;
  }

  // badges row
  const badges: { text: string; o: PillOpts }[] = [];
  if (d.schoolRank) {
    badges.push({ text: `SCHOOL RANK #${d.schoolRank}`, o: { bg: C.goldBg, border: C.goldBorder, fg: C.goldDark, icon: "star", iconColor: C.gold } });
  }
  badges.push(
    d.isPass
      ? { text: "PASS", o: { bg: C.greenBg, border: C.greenBorder, fg: C.green, icon: "check", iconColor: C.green } }
      : { text: "FAIL", o: { bg: C.redBg, border: C.redBorder, fg: C.red, icon: "cross", iconColor: C.red } }
  );
  if (d.classPosition) {
    badges.push({ text: `CLASS POSITION #${d.classPosition}`, o: { bg: C.blueBg, border: C.blueBorder, fg: C.blue } });
  }
  pillRow(ctx, y + 34 + PILL_H / 2 - 8, badges);

  drawFooter(ctx);
  ctx.restore(); // card clip
  return ctx.canvas;
}

// ── BISE Peshawar result card ───────────────────────────────────────────────

function bisePassState(d: BiseResultShareData): boolean | null {
  if (d.subjects.some(s => s.theoryFail || s.practicalFail)) return false;
  if (/fail/i.test(d.grade || "")) return false;
  if (/^\s*(pass|promoted)/i.test(d.remarks || "")) return true;
  return null;
}

function buildBiseCanvas(d: BiseResultShareData): HTMLCanvasElement | null {
  const rows = d.subjects.length;
  const tableHeaderH = 46;
  const subjectBlock = rows > 0 ? 52 + tableHeaderH + rows * 54 + 8 : 52 + 64 + 18;
  const badgesH = 34 + PILL_H + 30;
  cardHeightSoFar = HEADER_H + STUDENT_H + 152 + subjectBlock + badgesH + FOOTER_H;
  const H = cardHeightSoFar + 2 * M;
  const ctx = createCanvas(H);
  if (!ctx) return null;

  drawBackground(ctx, H);
  drawCard(ctx, H);
  drawHeader(ctx, { pillText: "BISE Peshawar · Official Result" });
  drawStudentBand(ctx, {
    name: d.studentName,
    subLine: d.examTitle,
    rollLabel: "Board Roll No",
    rollNo: d.rollNo,
    photo: null,
  });

  const status = bisePassState(d);
  const remarksColor = status === false || /fail/i.test(d.remarks || "") ? C.red : C.green;
  const ySub = drawStatTiles(ctx, [
    { label: "Marks", value: d.marks || "—", color: C.blue },
    { label: "Grade", value: d.grade || "—", color: C.goldDark, bg: C.goldBg, border: C.goldBorder },
    { label: "Remarks", value: d.remarks || "—", color: d.remarks ? remarksColor : C.ink },
    { label: "Father Name", value: d.fatherName || "—", color: C.ink },
  ]);

  drawSectionTitle(ctx, ySub + 14, "SUBJECT-WISE MARKS");
  let y = ySub + 52;
  if (rows > 0) {
    const leftX = M + PAD;
    const innerW = W - 2 * M - 2 * PAD;
    // table header
    setFont(ctx, 17, 800);
    ctx.fillStyle = C.label;
    ctx.textAlign = "left";
    ctx.fillText("#", leftX, y + 14);
    ctx.fillText("SUBJECT", leftX + 74, y + 14);
    ctx.textAlign = "center";
    ctx.fillText("THEORY", leftX + innerW * 0.66, y + 14);
    ctx.fillText("PRACTICAL", leftX + innerW * 0.87, y + 14);
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(leftX, y + 30);
    ctx.lineTo(leftX + innerW, y + 30);
    ctx.stroke();
    y += tableHeaderH;

    d.subjects.forEach((s, i) => {
      const cy = y + 30;
      if (i % 2 === 1) {
        rr(ctx, leftX - 14, y + 4, innerW + 28, 52, 12);
        ctx.fillStyle = C.tile;
        ctx.fill();
      }
      setFont(ctx, 22, 600);
      ctx.fillStyle = C.label;
      ctx.textAlign = "left";
      ctx.fillText(truncateText(ctx, s.sr, 54), leftX, cy + 8);
      setFont(ctx, 25, 600);
      ctx.fillStyle = C.ink;
      ctx.fillText(truncateText(ctx, s.subject || "—", 400), leftX + 74, cy + 9);
      setFont(ctx, 25, 700);
      ctx.textAlign = "center";
      ctx.fillStyle = s.theoryFail ? C.red : C.ink;
      ctx.fillText(s.theory || "—", leftX + innerW * 0.66, cy + 9);
      ctx.fillStyle = s.practicalFail ? C.red : C.ink;
      ctx.fillText(s.practical || "—", leftX + innerW * 0.87, cy + 9);
      y += 54;
    });
    y += 8;
  } else {
    drawNoteStrip(ctx, y, "Subject-wise marks are not available for this result.");
    y += 82;
  }

  // badges: grade + pass/fail (+ remarks when it adds information)
  const badges: { text: string; o: PillOpts }[] = [];
  if (d.grade) {
    badges.push({ text: `GRADE ${d.grade.toUpperCase()}`, o: { bg: C.goldBg, border: C.goldBorder, fg: C.goldDark, icon: "star", iconColor: C.gold } });
  }
  if (status === true) {
    badges.push({ text: "PASS", o: { bg: C.greenBg, border: C.greenBorder, fg: C.green, icon: "check", iconColor: C.green } });
  } else if (status === false) {
    badges.push({ text: "FAIL", o: { bg: C.redBg, border: C.redBorder, fg: C.red, icon: "cross", iconColor: C.red } });
  }
  const remarks = (d.remarks || "").trim();
  if (remarks && !/^(pass|promoted|fail)$/i.test(remarks)) {
    badges.push({ text: remarks.toUpperCase(), o: { bg: C.slateBg, border: C.slateBorder, fg: C.sub } });
  }
  if (badges.length > 0) pillRow(ctx, y + 34 + PILL_H / 2 - 8, badges);

  drawFooter(ctx);
  ctx.restore(); // card clip
  return ctx.canvas;
}

// ── Roll No. Slip announcement card (green “official document” tone) ──────

function buildRollSlipCanvas(d: RollSlipShareData): HTMLCanvasElement | null {
  // sections: header + student band + stat tiles + note strip + luck pill + footer
  const afterTiles = 64 + 34 + PILL_H + 30;
  cardHeightSoFar = HEADER_H + STUDENT_H + 152 + afterTiles + FOOTER_H;
  const H = cardHeightSoFar + 2 * M;
  const ctx = createCanvas(H);
  if (!ctx) return null;

  drawBackground(ctx, H);
  drawCard(ctx, H);
  drawHeader(ctx, { pillText: `Official Slip · ${d.examLabel}`, tone: "green" });
  drawStudentBand(ctx, {
    name: d.studentName,
    subLine: `Class ${d.className} · ${d.examLabel}`,
    rollLabel: "Exam Roll No",
    rollNo: d.rollNo,
    photo: null,
  });

  drawStatTiles(ctx, [
    { label: "Exam Roll No", value: d.rollNo, color: C.blue },
    { label: "Class", value: `Class ${d.className}`, color: C.ink },
    { label: "Father Name", value: d.fatherName || "—", color: C.ink },
    { label: "Exam", value: d.examLabel, color: C.goldDark, bg: C.goldBg, border: C.goldBorder },
  ]);

  const yNote = M + HEADER_H + STUDENT_H + 152;
  drawNoteStrip(ctx, yNote, "QR code, date sheet & instructions are on the official slip — download it from our website.");
  pillRow(ctx, yNote + 64 + 34 + PILL_H / 2 - 8, [
    { text: "GOOD LUCK ON YOUR EXAMS!", o: { bg: C.goldBg, border: C.goldBorder, fg: C.goldDark, icon: "star", iconColor: C.gold } },
  ]);

  drawFooter(ctx, "/roll-no-slip");
  ctx.restore(); // card clip
  return ctx.canvas;
}

// ── Merit List position card (gold medallion, restrained palette) ──────────

const MEDALLION_H = 236;

function drawMedallion(ctx: Ctx, cx: number, cy: number, position: number) {
  // soft gold halo
  const halo = ctx.createRadialGradient(cx, cy, 30, cx, cy, 132);
  halo.addColorStop(0, "rgba(227,179,65,0.30)");
  halo.addColorStop(1, "rgba(227,179,65,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(cx - 132, cy - 132, 264, 264);
  // gold ring (gradient rim → keeps it alive without extra colours)
  const rim = ctx.createLinearGradient(cx - 92, cy - 92, cx + 92, cy + 92);
  rim.addColorStop(0, C.goldBright);
  rim.addColorStop(1, "#C6912A");
  ctx.beginPath(); ctx.arc(cx, cy, 92, 0, Math.PI * 2);
  ctx.fillStyle = rim; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, 79, 0, Math.PI * 2);
  ctx.fillStyle = C.goldBg; ctx.fill();
  ctx.strokeStyle = "rgba(198,145,42,0.35)"; ctx.lineWidth = 2; ctx.stroke();

  // star + big position number + letter-spaced label
  drawStar(ctx, cx, cy - 36, 14, C.gold);
  setFont(ctx, 56, 800);
  ctx.fillStyle = C.goldDark;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`#${position}`, cx, cy + 2);
  setFont(ctx, 13, 800);
  ctx.fillStyle = C.label;
  ctx.fillText("P O S I T I O N", cx, cy + 44);
  ctx.textBaseline = "alphabetic";
}

function buildMeritCanvas(d: MeritShareData, photo: HTMLImageElement | null): HTMLCanvasElement | null {
  const afterMedallion = 152 + 34 + PILL_H + 30;
  cardHeightSoFar = HEADER_H + STUDENT_H + MEDALLION_H + afterMedallion + FOOTER_H;
  const H = cardHeightSoFar + 2 * M;
  const ctx = createCanvas(H);
  if (!ctx) return null;

  drawBackground(ctx, H);
  drawCard(ctx, H);
  drawHeader(ctx, { pillText: "Official Merit List · School Rankings" });
  drawStudentBand(ctx, {
    name: d.studentName,
    subLine: d.examLabel,
    rollLabel: "Roll No",
    rollNo: d.rollNo,
    photo,
  });

  const cyMed = M + HEADER_H + STUDENT_H + MEDALLION_H / 2 + 6;
  drawMedallion(ctx, W / 2, cyMed, d.position);

  drawStatTiles(ctx, [
    { label: "Marks", value: `${d.obtainedMarks}/${d.totalMarks}`, color: C.ink },
    { label: "Percentage", value: `${d.percentage}%`, color: C.green },
    { label: "Grade", value: d.grade || "—", color: C.goldDark, bg: C.goldBg, border: C.goldBorder },
    { label: "Class", value: `Class ${d.className}`, color: C.blue },
  ], M + HEADER_H + STUDENT_H + MEDALLION_H);

  const yPill = M + HEADER_H + STUDENT_H + MEDALLION_H + 152;
  pillRow(ctx, yPill + 34 + PILL_H / 2 - 8, [
    d.position <= 3
      ? { text: "PODIUM FINISH!", o: { bg: C.goldBg, border: C.goldBorder, fg: C.goldDark, icon: "star", iconColor: C.gold } }
      : { text: "MERIT LIST HONOUR", o: { bg: C.slateBg, border: C.slateBorder, fg: C.sub } },
  ]);

  drawFooter(ctx, "/merit-list");
  ctx.restore(); // card clip
  return ctx.canvas;
}

// ── Photo loading (CORS-safe; failure simply falls back to the initial) ─────

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (typeof Image === "undefined") { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(null), 3500);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
}

// ── Share plumbing ──────────────────────────────────────────────────────────

// Synchronous canvas → PNG File (keeps navigator.share inside the
// user-activation window).
function canvasToPngFile(canvas: HTMLCanvasElement, fileName: string): File {
  const dataUrl = canvas.toDataURL("image/png");
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], fileName, { type: "image/png" });
}

function downloadFile(file: File) {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function shareCanvas(
  canvas: HTMLCanvasElement | null,
  opts: { fileName: string; title: string; text: string; url?: string },
): Promise<ShareOutcome> {
  if (!canvas) return "failed";
  const nav: Navigator | undefined = typeof navigator !== "undefined" ? navigator : undefined;
  const url = opts.url ?? RESULTS_SHARE_URL;
  const fullText = `${opts.text}\n${url}`;

  let file: File | null = null;
  try { file = canvasToPngFile(canvas, opts.fileName); } catch { file = null; }

  // 1) Best: share the actual PNG file + caption + link
  try {
    if (nav?.share && file && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: opts.title, text: fullText });
      return "shared-file";
    }
  } catch (err) {
    if ((err as { name?: string } | null)?.name === "AbortError") return "cancelled";
    // otherwise fall through to the text-only share
  }

  // 2) Share caption + link (browsers whose share sheet cannot attach files)
  try {
    if (nav?.share) {
      await nav.share({ title: opts.title, text: opts.text, url });
      return "shared-text";
    }
  } catch (err) {
    if ((err as { name?: string } | null)?.name === "AbortError") return "cancelled";
  }

  // 3) Desktop fallback: download the card + copy the caption
  try {
    if (file) downloadFile(file);
    if (nav?.clipboard) await nav.clipboard.writeText(fullText);
    return "downloaded";
  } catch {
    return "failed";
  }
}

const safeName = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "Result";

// ── Public API ──────────────────────────────────────────────────────────────

export function schoolShareText(d: SchoolResultShareData): string {
  const lines = [
    `🎓 ${d.studentName} — Class ${d.className}`,
    `📜 ${d.examLabel} · GHS Babi Khel`,
    `📋 Roll No: ${d.rollNo}`,
    `📊 Marks: ${d.obtainedMarks}/${d.totalMarks} (${d.percentage}%) · Grade: ${d.grade || "—"} · ${d.isPass ? "PASS" : "FAIL"}`,
  ];
  const extras: string[] = [];
  if (d.schoolRank) extras.push(`School Rank #${d.schoolRank}`);
  if (d.classPosition) extras.push(`Class Position #${d.classPosition}`);
  if (extras.length) lines.push(`🏆 ${extras.join(" · ")}`);
  lines.push(`🔗 ${RESULTS_SHARE_URL}`);
  return lines.join("\n");
}

export function biseShareText(d: BiseResultShareData): string {
  const status = bisePassState(d);
  const lines = [
    `🎓 ${d.studentName}`,
    `📜 ${d.examTitle} · BISE Peshawar`,
    `📋 Roll No: ${d.rollNo}`,
    `📊 Marks: ${d.marks || "—"} · Grade: ${d.grade || "—"}${status === true ? " · PASS" : status === false ? " · FAIL" : ""}`,
    `🏫 Shared via GHS Babi Khel — Govt. High School Babi Khel`,
    `🔗 ${RESULTS_SHARE_URL}`,
  ];
  return lines.join("\n");
}

export async function shareSchoolResultCard(d: SchoolResultShareData): Promise<ShareOutcome> {
  const photo = d.photoUrl ? await loadImage(d.photoUrl) : null;
  const canvas = buildSchoolCanvas(d, photo);
  return shareCanvas(canvas, {
    fileName: `GHS-Babi-Khel-Result-${safeName(d.rollNo)}-${safeName(d.studentName)}.png`,
    title: "Result Card — GHS Babi Khel",
    text: schoolShareText(d),
  });
}

export async function shareBiseResultCard(d: BiseResultShareData): Promise<ShareOutcome> {
  const canvas = buildBiseCanvas(d);
  return shareCanvas(canvas, {
    fileName: `BISE-Result-${safeName(d.rollNo)}-GHS-Babi-Khel.png`,
    title: "BISE Peshawar Result — via GHS Babi Khel",
    text: biseShareText(d),
  });
}

export function rollSlipShareText(d: RollSlipShareData): string {
  return [
    `🎫 ${d.studentName} — Class ${d.className}`,
    `🏷️ Exam Roll No: ${d.rollNo}`,
    `📜 ${d.examLabel} · GHS Babi Khel`,
    `✅ Official slip — QR code, date sheet & instructions on the printed copy`,
    `🔗 Get your slip: ${ROLLSLIP_SHARE_URL}`,
  ].join("\n");
}

export function meritShareText(d: MeritShareData): string {
  return [
    `🏆 ${d.studentName} — Position #${d.position}`,
    `📊 Marks: ${d.obtainedMarks}/${d.totalMarks} (${d.percentage}%) · Grade: ${d.grade || "—"}`,
    `📜 ${d.examLabel} · GHS Babi Khel`,
    `🏫 Official Merit List — see all rankings: ${MERIT_SHARE_URL}`,
  ].join("\n");
}

export async function shareRollSlipCard(d: RollSlipShareData): Promise<ShareOutcome> {
  const canvas = buildRollSlipCanvas(d);
  return shareCanvas(canvas, {
    fileName: `GHS-Babi-Khel-Roll-No-Slip-${safeName(d.rollNo)}-${safeName(d.studentName)}.png`,
    title: "Exam Roll No. Slip — GHS Babi Khel",
    text: rollSlipShareText(d),
    url: ROLLSLIP_SHARE_URL,
  });
}

export async function shareMeritCard(d: MeritShareData): Promise<ShareOutcome> {
  const photo = d.photoUrl ? await loadImage(d.photoUrl) : null;
  const canvas = buildMeritCanvas(d, photo);
  return shareCanvas(canvas, {
    fileName: `GHS-Babi-Khel-Merit-Position-${safeName(String(d.position))}-${safeName(d.studentName)}.png`,
    title: "Merit List — GHS Babi Khel",
    text: meritShareText(d),
    url: MERIT_SHARE_URL,
  });
}

// Consistent toast feedback for every share outcome (works for results,
// roll slips and merit cards alike).
export function toastShareOutcome(outcome: ShareOutcome) {
  switch (outcome) {
    case "shared-file":
      toast.success("Shared — beautiful card image + your website link sent!");
      break;
    case "shared-text":
      toast.success("Shared with your website link!");
      break;
    case "downloaded":
      toast.success("Card image downloaded & link copied — paste anywhere to share!");
      break;
    case "failed":
      toast.error("Sharing is not available on this device");
      break;
    case "cancelled":
    default:
      break;
  }
}
