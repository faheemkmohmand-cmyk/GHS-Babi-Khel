import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MoonStar, Share2, Loader2, Sparkles, X } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
   CONSTELLATION OF TOPPERS — THE NIGHT SKY  (/merit-list)

   The merit list, retold as a sky. Every ranked student becomes a star:
   the higher the marks, the brighter it burns. The five brightest are
   joined by faint gold lines — the school's own constellation. Tap any
   star and it expands into the student's card: name, marks, photo and
   their one-line message to the juniors.

   Astronomy, honestly done:
   • The sky turns once per SIDEREAL day — 23h 56m 4.09s — the true time
     the heavens take to return to the same position. One tiny formula:
         angle = (now / 86_164_090.5 ms) % 1 × 360°
     Applied as a GPU transform every 5 s (≈0.02° per step — imperceptible
     but real), so the constellation genuinely sits elsewhere each night.
   • On 21 December — the longest night of the year — every star of
     Babi Khel stands in one line across the sky.

   Engineering (this site's GPU rules from index.css):
   • No backdrop-filter, no hover:scale / translate-* Tailwind classes —
     all motion is inline transforms (refs, zero re-renders) or canvas.
   • Star twinkle is OPACITY-ONLY CSS (same rule as the lantern ambience).
   • Background dust: one canvas at ~15 fps, paused when the tab is
     hidden, drawn once and frozen under prefers-reduced-motion.
   ═══════════════════════════════════════════════════════════════════════ */

// ─── Types ───────────────────────────────────────────────────────────────────
export interface ConstellationEntry {
  student_id: string;
  full_name: string;
  roll_number: string;
  class: string;
  photo_url: string | null;
  obtained_marks: number;
  total_marks: number;
  percentage: number;
  grade: string;
  position: number;
  /** Optional admin-written line; when absent a curated line is chosen deterministically. */
  message?: string;
}

interface StarNode extends ConstellationEntry {
  x: number;            // map units 0–100 (map is a square)
  y: number;
  size: number;         // visual star diameter, px
  hit: number;          // tappable button diameter, px (≥26 for fingers)
  glow: number;         // 0–1 brightness → box-shadow strength
  twinkleDur: number;   // seconds
  twinkleDelay: number; // negative seconds → desynchronised twinkle
  flare: boolean;       // position #1 gets 4-point diffraction spikes
}

// ─── Constants ───────────────────────────────────────────────────────────────
const SIDEREAL_DAY_MS = 86_164_090.5;  // 23h 56m 4.09s — one true turn of the sky
const MAX_STARS = 160;                 // DOM budget; the ranked table below still lists everyone
const SAFE_RADIUS = 44;                // star zone radius (map units) — everything stays on-panel while rotating
const CORE_RADIUS = 9;                 // keep the exact centre clear
const MIN_DIST_SQ = 6.4 * 6.4;         // min spacing between star centres (map units, squared)

// ─── Deterministic PRNG (stars keep their place between visits) ─────────────
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── The tiny formula ────────────────────────────────────────────────────────
function skyRotationDeg(nowMs: number): number {
  return ((nowMs / SIDEREAL_DAY_MS) % 1) * 360;
}
function isLongestNight(d: Date): boolean {
  return d.getMonth() === 11 && d.getDate() === 21;
}

// ─── One-line messages to the juniors (deterministic per student) ────────────
const JUNIOR_MESSAGES: readonly string[] = [
  "One page every night is enough — just never skip the night.",
  "Ask your question the day it appears; doubts collect interest.",
  "Your roll number decides nothing. Your routine decides everything.",
  "Books first, phone last — the marks quietly follow.",
  "Write it by hand. The memory follows the pen.",
  "Borrowed sleep is a loan; tiredness charges interest on every mark.",
  "Past papers are maps — walk them before the real journey.",
  "The topper is not the cleverest in the room, only the most consistent.",
  "Fear the exam less, respect the syllabus more.",
  "Small wins, every single day. That is the entire secret.",
  "Read it aloud once — the ear remembers what the eye forgets.",
  "Start early, end calm. Panic has never written a good answer.",
];
function messageFor(e: ConstellationEntry): string {
  const own = typeof e.message === "string" ? e.message.trim() : "";
  if (own) return own;
  return JUNIOR_MESSAGES[hashStr(`${e.student_id}|msg`) % JUNIOR_MESSAGES.length];
}

// ─── Star layout (pure) ──────────────────────────────────────────────────────
function layoutStars(entries: ConstellationEntry[], aligned: boolean): StarNode[] {
  const list = entries.slice(0, MAX_STARS);
  const n = list.length;
  if (n === 0) return [];
  const safe = (v: number) => (Number.isFinite(v) ? v : 0);
  const pcts = list.map((e) => safe(e.percentage));
  const min = Math.min(...pcts);
  const max = Math.max(...pcts);
  const span = max - min || 1;

  const placed: { x: number; y: number }[] = [];

  // 21 December — the whole school stands in one line across the sky.
  // Line half-length ≤ 38 units so even the end stars keep their name tags on-panel.
  const phi = (-16 * Math.PI) / 180;
  const spacing = Math.min(3.2, 76 / Math.max(n - 1, 1));

  return list.map((e, i) => {
    const p = (safe(e.percentage) - min) / span; // 0 → 1 brightness within this list
    let x = 50;
    let y = 50;
    if (aligned) {
      const t = (i - (n - 1) / 2) * spacing;
      x = 50 + t * Math.cos(phi);
      y = 50 + t * Math.sin(phi);
    } else {
      // Seeded placement — every student keeps a fixed star in this sky.
      // Constellation stars (top 5) orbit nearer the centre so their
      // name tags always stay inside the panel, on any screen.
      const rng = mulberry32(hashStr(`${e.student_id}|${e.full_name}`));
      const outer = i < 5 ? 33 : SAFE_RADIUS;
      for (let attempt = 0; attempt < 48; attempt++) {
        const ang = rng() * Math.PI * 2;
        const rad = CORE_RADIUS + rng() * (outer - CORE_RADIUS);
        const cx = 50 + rad * Math.cos(ang);
        const cy = 50 + rad * Math.sin(ang);
        x = cx;
        y = cy;
        if (placed.every((q) => (q.x - cx) ** 2 + (q.y - cy) ** 2 >= MIN_DIST_SQ)) break;
      }
    }
    placed.push({ x, y });

    const tw = mulberry32(hashStr(`twinkle|${e.student_id}`));
    const size = 5 + p * 9 + (i === 0 ? 3.5 : 0); // 5px → ~17.5px for the brightest
    return {
      ...e,
      x, y,
      size,
      hit: Math.max(26, size + 16),
      glow: 0.28 + p * 0.72,
      twinkleDur: 3.1 + tw() * 3.6,
      twinkleDelay: -tw() * 6.2,
      flare: i === 0,
    };
  });
}

// ─── Background star dust (canvas, ~15 fps, hidden-tab safe) ─────────────────
function StarDust() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !parent || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dust: { x: number; y: number; r: number; f: number; ph: number; a: number; col: string }[] = [];
    let w = 0;
    let h = 0;
    let raf = 0;
    let disposed = false;

    const build = () => {
      // Same seed → the far sky keeps its shape across resizes.
      const rng = mulberry32(20251221);
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, Math.round(rect.width));
      h = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(150, Math.round((w * h) / 6800));
      dust = Array.from({ length: count }, () => ({
        x: rng() * w,
        y: rng() * h,
        r: 0.4 + rng() * 1.05,
        f: 0.35 + rng() * 0.85,
        ph: rng() * Math.PI * 2,
        a: 0.18 + rng() * 0.42,
        col: rng() < 0.16 ? "#bcd2ff" : "#e9d9ae",
      }));
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const d of dust) {
        const tw = reduced ? 0.9 : 0.72 + 0.28 * Math.sin(d.f * (t / 1000) + d.ph);
        ctx.globalAlpha = Math.max(0.05, d.a * tw);
        ctx.fillStyle = d.col;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    build();
    draw(performance.now());

    const ro = new ResizeObserver(() => {
      build();
      draw(performance.now());
    });
    ro.observe(parent);

    if (!reduced) {
      let last = 0;
      const loop = (t: number) => {
        if (disposed) return;
        if (!document.hidden && t - last >= 66) { // ~15 fps is plenty for distant dust
          draw(t);
          last = t;
        }
        raf = window.requestAnimationFrame(loop);
      };
      raf = window.requestAnimationFrame(loop);
    }

    return () => {
      disposed = true;
      window.cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 z-0" />;
}

// ─── Card photo with graceful monogram fallback ──────────────────────────────
function ConstellationAvatar({ photoUrl, fullName }: { photoUrl: string | null; fullName: string }) {
  const [err, setErr] = useState(false);
  return (
    <span className="inline-flex h-14 w-14 shrink-0 rounded-full bg-gradient-to-br from-[#f4d08f] to-[#b98a1d] p-[2.5px] shadow-card">
      {photoUrl && !err ? (
        <img
          src={photoUrl}
          alt={`${fullName}'s photo`}
          className="h-full w-full rounded-full object-cover"
          onError={() => setErr(true)}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-emerald-700 to-emerald-900 text-lg font-black text-amber-50">
          {(fullName || "?")[0]}
        </span>
      )}
    </span>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function ConstellationOfToppers({
  entries,
  showClass,
  onShareEntry,
  sharingKey,
}: {
  entries: ConstellationEntry[];
  showClass: boolean;
  onShareEntry?: (e: ConstellationEntry) => void;
  sharingKey?: string | null;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const aligned = useMemo(() => isLongestNight(new Date()), []);
  // First paint already carries the true sidereal angle — no flash, no jump.
  const [initialDeg] = useState(() => skyRotationDeg(Date.now()));

  const stars = useMemo<StarNode[]>(() => layoutStars(entries, aligned), [entries, aligned]);
  const linePoints = useMemo(
    () => stars.slice(0, 5).map((s) => `${s.x.toFixed(2)},${s.y.toFixed(2)}`).join(" "),
    [stars]
  );
  const active = useMemo(() => stars.find((s) => s.student_id === activeId) || null, [stars, activeId]);

  // The sky turns — one style write every 5 s, zero re-renders.
  useEffect(() => {
    const apply = () => {
      const deg = skyRotationDeg(Date.now());
      if (mapRef.current) {
        mapRef.current.style.transform = `translate(-50%, -50%) rotate(${deg.toFixed(3)}deg)`;
      }
      for (const el of labelRefs.current) {
        // Counter-rotate the top-5 name tags so the words stay level.
        if (el) el.style.transform = `translate(-50%, 7px) rotate(${(-deg).toFixed(3)}deg)`;
      }
    };
    apply();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; // the sky stands still
    const id = window.setInterval(() => {
      if (!document.hidden) apply();
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  // Esc closes the star card; focus lands on Close for keyboard users.
  useEffect(() => {
    if (!active) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setActiveId(null);
    };
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => closeRef.current?.focus(), 60);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [active]);

  if (stars.length === 0) return null;

  const sharing = sharingKey != null && active != null && sharingKey === active.student_id;
  const pctText = active ? (Number.isFinite(active.percentage) ? active.percentage : 0).toFixed(1) : "";
  const msg = active ? messageFor(active) : "";

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      aria-label="Constellation of Toppers — the night sky"
      className="cosmos-panel relative overflow-hidden rounded-3xl border border-[#2b3d57] shadow-elevated"
    >
      <StarDust />

      {/* ── Header ── */}
      <div className="relative z-10 flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-5 sm:px-7 sm:pt-6">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[#c9a35c] sm:text-[11px]">
            {aligned ? <Sparkles className="h-3.5 w-3.5" /> : <MoonStar className="h-3.5 w-3.5" />}
            {aligned ? "21 December · The Longest Night" : "The Night Sky"}
          </p>
          <h3 className="mt-1.5 font-heading text-lg font-bold leading-tight text-amber-50 sm:text-2xl">
            Constellation of Toppers
          </h3>
          <p className="mt-1 max-w-md text-[11px] leading-relaxed text-[#8fa3bd] sm:text-xs">
            Every topper is a star — the brighter it burns, the higher the marks.
            Tap any star to meet the student behind it.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#e9c46a]/30 bg-[#e9c46a]/10 px-3 py-1.5 text-[10px] font-bold text-[#e9c46a]">
          {aligned ? <Sparkles className="h-3 w-3" /> : <MoonStar className="h-3 w-3" />}
          {aligned ? "All stars aligned" : "1 turn / 23h 56m — true sidereal"}
        </span>
      </div>

      {/* ── The sky ── */}
      <div className="relative" style={{ height: "clamp(300px, 70vw, 600px)" }}>
        <div
          ref={mapRef}
          className="cosmos-map"
          style={{ transform: `translate(-50%, -50%) rotate(${initialDeg.toFixed(3)}deg)` }}
        >
          {/* Faint gold lines — the constellation of the top 5 */}
          <svg
            viewBox="0 0 100 100"
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          >
            {stars.length >= 2 && (
              <>
                <polyline
                  points={linePoints}
                  fill="none"
                  stroke="rgba(233, 196, 106, 0.07)"
                  strokeWidth={1.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points={linePoints}
                  fill="none"
                  stroke="rgba(233, 196, 106, 0.35)"
                  strokeWidth={0.26}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}
          </svg>

          {/* The stars */}
          {stars.map((s, i) => (
            <button
              key={`${s.student_id}-${s.position}`}
              type="button"
              onClick={() => setActiveId(s.student_id)}
              aria-label={`${s.full_name}, position ${s.position} of ${stars.length}, ${
                (Number.isFinite(s.percentage) ? s.percentage : 0).toFixed(1)
              } percent${i < 5 ? ", constellation star" : ""}`}
              className="cosmos-star"
              style={
                {
                  left: `${s.x}%`,
                  top: `${s.y}%`,
                  width: s.hit,
                  height: s.hit,
                  zIndex: 200 - i,
                  animationDuration: `${s.twinkleDur.toFixed(2)}s`,
                  animationDelay: `${s.twinkleDelay.toFixed(2)}s`,
                  "--glow": s.glow,
                } as CSSProperties
              }
            >
              <span className="cosmos-star-core" style={{ inset: (s.hit - s.size) / 2 }}>
                {s.flare && <span className="cosmos-flare" aria-hidden />}
              </span>
              {i < 5 && (
                <span
                  ref={(el) => {
                    labelRefs.current[i] = el;
                  }}
                  className="cosmos-star-label"
                  style={{ transform: `translate(-50%, 7px) rotate(${(-initialDeg).toFixed(3)}deg)` }}
                >
                  {s.full_name}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Expanded star card ── */}
        <AnimatePresence>
          {active && (
            <motion.div
              key="cosmos-card"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="absolute inset-0 z-30 flex items-center justify-center p-4 sm:p-6"
            >
              <button
                type="button"
                aria-label="Close card"
                onClick={() => setActiveId(null)}
                className="absolute inset-0 cursor-default border-0 bg-[#030914]/70 p-0"
                style={{ WebkitTapHighlightColor: "transparent" }}
              />
              <motion.div
                role="dialog"
                aria-label={`${active.full_name}'s star card`}
                initial={{ opacity: 0, scale: 0.7, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.78, y: 10 }}
                transition={{ type: "spring", stiffness: 330, damping: 26 }}
                className="relative z-10 w-[min(100%,350px)] overflow-hidden rounded-2xl border border-[#3c5170] bg-[#0a1626] shadow-elevated"
              >
                <div className="h-[3px] w-full bg-gradient-to-r from-transparent via-[#e9c46a]/80 to-transparent" />
                <button
                  ref={closeRef}
                  type="button"
                  onClick={() => setActiveId(null)}
                  aria-label="Close"
                  className="absolute right-3 top-4 z-10 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[#3c5170] bg-[#0f2036] text-[#a9bccf] transition-colors hover:border-[#e9c46a]/50 hover:text-amber-50"
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="px-5 pb-5 pt-4">
                  <div className="flex items-center gap-3.5 pr-9">
                    <ConstellationAvatar photoUrl={active.photo_url} fullName={active.full_name} />
                    <div className="min-w-0">
                      <p className="break-words font-heading text-base font-bold leading-snug text-amber-50">
                        {active.full_name}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#8fa3bd]">
                        {showClass ? `Class ${active.class} · ` : ""}Roll {active.roll_number}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-[#e9c46a]/15 px-2.5 py-1 text-[10px] font-bold text-[#f4d08f]">
                      Position #{active.position}
                    </span>
                    <span className="rounded-full border border-[#3c5170] px-2.5 py-1 text-[10px] font-bold text-[#c8d5e4]">
                      Grade {active.grade}
                    </span>
                    <span className="rounded-full border border-[#3c5170] px-2.5 py-1 text-[10px] font-bold text-[#c8d5e4]">
                      {active.obtained_marks}/{active.total_marks}
                    </span>
                  </div>

                  <div className="mt-3.5 flex items-end justify-between gap-3 rounded-xl border border-[#2b3d57] bg-[#081221] px-4 py-3">
                    <div>
                      <p className="text-2xl font-black leading-none tabular-nums text-[#f4d08f]">
                        {pctText}%
                      </p>
                      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7d92ad]">
                        Final score
                      </p>
                    </div>
                    <p className="text-right text-[11px] leading-snug text-[#8fa3bd]">
                      {active.obtained_marks} of {active.total_marks}
                      <br />
                      marks
                    </p>
                  </div>

                  <div className="mt-3.5 rounded-xl border border-[#e9c46a]/25 bg-[#e9c46a]/[0.06] px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#c9a35c]">
                      To the juniors of Babi Khel
                    </p>
                    <p className="mt-1.5 text-[13px] italic leading-relaxed text-amber-50/90">
                      &ldquo;{msg}&rdquo;
                    </p>
                  </div>

                  {onShareEntry && (
                    <button
                      type="button"
                      onClick={() => onShareEntry(active)}
                      disabled={sharing}
                      className="mt-4 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#e9c46a]/40 bg-[#e9c46a]/10 px-4 py-2.5 text-xs font-bold text-[#f4d08f] transition-colors hover:bg-[#e9c46a]/20 disabled:opacity-60"
                    >
                      {sharing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
                      Share this star
                    </button>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Footer legend ── */}
      <div className="relative z-10 flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pb-5 text-[10px] text-[#7d92ad] sm:px-7 sm:pb-6 sm:text-[11px]">
        <span className="font-semibold text-[#a9bccf]">{stars.length} stars in this sky</span>
        <span aria-hidden>·</span>
        <span>Top {Math.min(5, stars.length)} joined by faint gold lines</span>
        <span aria-hidden>·</span>
        <span>New stars join every season — the Babi Khel zodiac grows</span>
      </div>
    </motion.section>
  );
}
