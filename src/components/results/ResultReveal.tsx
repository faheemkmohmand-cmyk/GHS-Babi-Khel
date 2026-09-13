import { useState, useEffect, useLayoutEffect, useRef, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowLeft, Sparkles, ArrowDown, Wand2, Ticket, MousePointer2, Sparkle, Download } from "lucide-react";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RESULT REVEAL THEATER — cinematic result moment for GHS Babi Khel
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Two reveal modes for a freshly searched result (school OR BISE Peshawar),
// plus a plain skip:
//   1. THE GRAND REVEAL — an emerald-velvet curtain with the gold school
//      crest lifts (~2.6s, with a tiny tug of anticipation first), a soft
//      light sweep crosses the card, then the marks stagger in row by row.
//      Pass → crest glows antique gold. Fail → a soft, respectful teal glow
//      and one kind sentence. No red.
//   2. SCRATCH & SHINE — a champagne-silver foil painted on <canvas> with
//      noise; the student rubs it away with finger/cursor to reveal marks.
//
// SMOOTHNESS CONTRACT (why it never hangs on a low-end phone):
//   • All reveal motion is transform/opacity only — progress bars animate
//     scaleX (GPU) instead of width (layout), the crest glow is a blurred
//     div fading opacity instead of an animated drop-shadow filter.
//   • ONE rAF loop drives both counters (~30fps number ticks), and the
//     subject rows are memoized so count-up re-renders stay cheap.
//   • The curtain uses a short 350ms beat + 0.22s tug (anticipation) then a
//     2.6s lift with an ease that starts moving immediately — no frozen feel.
//
// SAFETY RULES (the "don't distract / don't break anything" contract):
//   • Appears ONLY after the student actively searches — never on page load.
//   • Always skippable in one tap; full result cards stay below, untouched.
//   • Gentle celebration sounds are synthesized on-device (WebAudio, no audio
//     files, modest volume) — a soft thump + ta-da chime at the payoff, with
//     a gold confetti burst (pass) or a calm teal sparkle drift (fail).
//   • prefers-reduced-motion users bypass straight to a calm summary card.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface RevealSubject {
  name: string;
  obtained: number;
  /** Total marks for the subject — null when the board doesn't publish per-subject totals (e.g. BISE Peshawar theory/practical columns). */
  total: number | null;
  /** Raw theory marks string (BISE Peshawar) — shown as a chip when there is no bar. */
  theory?: string | null;
  /** Raw practical marks string (BISE Peshawar) — shown as a chip when there is no bar. */
  practical?: string | null;
}

export interface RevealResultData {
  studentName: string;
  /** Class label — null/omitted for board results where the class isn't part of the record. */
  className?: string | null;
  examLabel: string;
  rollNo?: string | null;
  /** null when the source only offers a raw marks string (BISE Peshawar). */
  obtained: number | null;
  total: number | null;
  percentage: number | null;
  grade: string;
  isPass: boolean;
  subjects: RevealSubject[];
  photoUrl?: string | null;
  /** Raw marks line (e.g. "455/550") shown when obtained/total can't be split. */
  marksLine?: string | null;
  /** Board remarks (e.g. "PROMOTED") shown in the compact stats row. */
  remarksLine?: string | null;
  /** Class rank, when known — 1 triggers the Aurora shooting star for the class topper. School results only; board (BISE) results omit this. */
  classPosition?: number | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data: RevealResultData;
}

type Stage = "choose" | "theater" | "scratch" | "aurora" | "summary";
type CelebrationMode = "gold" | "calm";
type PlayFn = (kind: "roll" | "thump" | "tada") => void;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// ── Tiny rAF count-up (marks & percentage tick up when revealed) ────────────
// ONE loop per number, updating at ~30fps — numerals read identically at this
// speed but cost half the React renders, which matters on low-end phones.
function useCountUp(target: number, active: boolean, duration = 950) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let frame = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      if ((frame++ & 1) === 0 || p >= 1) setVal(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setVal(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, duration]);
  return active ? val : 0;
}

// ── Celebration audio — synthesized with WebAudio, zero audio assets ────────
// Always on (the old on/off toggle is gone). Deliberately gentle: a soft
// filtered noise roll under the curtain, one deep-but-quiet thump at the
// payoff, then a short bright ta-da chime. Modest gains throughout.
function useRevealAudio(): { play: PlayFn; prime: () => void } {
  const ctxRef = useRef<AudioContext | null>(null);

  const prime = useCallback(() => {
    try {
      if (!ctxRef.current) {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AC) ctxRef.current = new AC();
      }
      if (ctxRef.current && ctxRef.current.state === "suspended") {
        void ctxRef.current.resume();
      }
    } catch { /* audio unavailable — stay silent */ }
  }, []);

  const play = useCallback<PlayFn>((kind) => {
    try {
      prime();
      const ctx = ctxRef.current;
      if (!ctx) return;
      const now = ctx.currentTime;

      if (kind === "roll") {
        // Soft snare-roll shimmer (0.9s, fades out) under the curtain lift
        const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.9), ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.6);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const f = ctx.createBiquadFilter();
        f.type = "lowpass"; f.frequency.value = 900;
        const g = ctx.createGain(); g.gain.value = 0.08;
        src.connect(f); f.connect(g); g.connect(ctx.destination);
        src.start(now);
      } else if (kind === "thump") {
        // Deep-but-quiet cinematic landing
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(150, now);
        o.frequency.exponentialRampToValueAtTime(44, now + 0.3);
        g.gain.setValueAtTime(0.3, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
        o.connect(g); g.connect(ctx.destination);
        o.start(now); o.stop(now + 0.4);
      } else {
        // ta-da — short bright chime arpeggio + one sparkle ping
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, i) => {
          const t = now + i * 0.085;
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = "triangle";
          o.frequency.value = freq;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
          o.connect(g); g.connect(ctx.destination);
          o.start(t); o.stop(t + 0.6);
        });
        const o2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        o2.type = "sine";
        o2.frequency.value = 1567.98;
        g2.gain.setValueAtTime(0.0001, now + 0.34);
        g2.gain.exponentialRampToValueAtTime(0.07, now + 0.37);
        g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
        o2.connect(g2); g2.connect(ctx.destination);
        o2.start(now + 0.34); o2.stop(now + 0.95);
      }
    } catch { /* audio unavailable — stay silent */ }
  }, [prime]);

  return { play, prime };
}

// ── School crest — gold hexagon frame, emerald shield, GHS monogram ─────────
// The glow is a blurred radial div fading by OPACITY (compositor-only) —
// animating a drop-shadow filter repaints every frame and was a major source
// of the reveal jank on low-end phones.
const Crest = ({ size = 72, glow }: { size?: number; glow: "gold" | "teal" | "none" }) => (
  <div className="relative shrink-0" style={{ width: size, height: size }}>
    <div
      className="absolute inset-0 rounded-full pointer-events-none"
      style={{
        background:
          glow === "teal"
            ? "radial-gradient(circle, rgba(94,210,189,0.45) 0%, rgba(94,210,189,0) 65%)"
            : "radial-gradient(circle, rgba(244,208,111,0.55) 0%, rgba(244,208,111,0) 65%)",
        transform: "scale(1.9)",
        opacity: glow === "none" ? 0 : 1,
        transition: "opacity 1.1s ease",
      }}
    />
    <svg viewBox="0 0 64 64" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg" className="relative">
      <defs>
        <linearGradient id="crestGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F4D06F" />
          <stop offset="55%" stopColor="#D9A83C" />
          <stop offset="100%" stopColor="#A87B1D" />
        </linearGradient>
        <linearGradient id="crestField" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#14432F" />
          <stop offset="100%" stopColor="#0A2B1F" />
        </linearGradient>
      </defs>
      {/* Hexagon frame */}
      <path d="M32 3 L57 16.5 V47.5 L32 61 L7 47.5 V16.5 Z" fill="url(#crestGold)" />
      <path d="M32 8 L52.5 18.9 V45.1 L32 56 L11.5 45.1 V18.9 Z" fill="url(#crestField)" />
      <path d="M32 10.8 L50.2 20.4 V43.6 L32 53.2 L13.8 43.6 V20.4 Z" fill="none" stroke="#E3B341" strokeOpacity="0.5" strokeWidth="1" />
      {/* Star */}
      <path d="M32 14.5 l1.7 3.4 3.8 0.5 -2.75 2.65 0.65 3.75 -3.4 -1.8 -3.4 1.8 0.65 -3.75 -2.75 -2.65 3.8 -0.5 Z" fill="#F4D06F" opacity="0.95" />
      {/* Open book + GHS */}
      <path d="M20 40 c4 -2.4 8 -2.4 12 0 c4 -2.4 8 -2.4 12 0 v6 c-4 -2.4 -8 -2.4 -12 0 c-4 -2.4 -8 -2.4 -12 0 Z" fill="#F4D06F" opacity="0.9" />
      <text x="32" y="36.4" textAnchor="middle" fontFamily="Georgia, serif" fontWeight="700" fontSize="10.5" fill="#FBEFD0" letterSpacing="1">GHS</text>
    </svg>
  </div>
);

// ── Subject rows — memoized so count-up re-renders never touch them ─────────
// Bars animate scaleX (transform, GPU-composited) instead of width (layout) —
// animating width reflows the page for every row on every frame.
const SubjectRows = memo(function SubjectRows({ subjects, visible, animate }: {
  subjects: RevealSubject[]; visible: boolean; animate: boolean;
}) {
  if (subjects.length === 0) return null;
  return (
    <div className="mt-4 space-y-1.5 text-left">
      {subjects.map((s, i) => {
        const hasBar = s.total != null && s.total > 0;
        const pct = hasBar ? Math.min(Math.round(((s.obtained || 0) / (s.total as number)) * 100), 100) : 0;
        return (
          <motion.div
            key={`${s.name}-${i}`}
            initial={{ opacity: 0, x: -12 }}
            animate={visible ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: animate ? 0.75 + i * 0.045 : 0, duration: 0.4 }}
            className="flex items-center gap-2.5"
          >
            <span className="text-[11.5px] text-foreground w-24 shrink-0 truncate font-medium" title={s.name}>{s.name}</span>
            {hasBar ? (
              <>
                <div className="flex-1 bg-secondary rounded-full h-1.5 overflow-hidden">
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={visible ? { scaleX: pct / 100 } : {}}
                    transition={{ delay: animate ? 0.85 + i * 0.045 : 0, duration: 0.55, ease: "easeOut" }}
                    style={{ transformOrigin: "left center", willChange: "transform" }}
                    className={`h-full w-full rounded-full ${pct < 33 ? "bg-gradient-to-r from-rose-500 to-rose-400" : "bg-gradient-to-r from-emerald-600 to-teal-400"}`}
                  />
                </div>
                <span className="text-[11px] font-bold text-foreground w-14 text-right tabular-nums shrink-0">{s.obtained}/{s.total}</span>
              </>
            ) : (
              <div className="flex-1 flex justify-end gap-1.5 min-w-0">
                {s.theory && s.theory !== "—" && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-secondary border border-border text-foreground whitespace-nowrap">Theory {s.theory}</span>
                )}
                {s.practical && s.practical !== "—" && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-secondary border border-border text-foreground whitespace-nowrap">Prac {s.practical}</span>
                )}
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
});

// ── Shared summary card — the actual result, styled premium ─────────────────
// mode "hidden"   → stats/subjects invisible (theater pre-reveal)
// mode "animate"  → count-up + stagger + light sweep (theater reveal)
// mode "static"   → everything plainly visible (scratch payoff / calm mode)
const SummaryCard = ({ data, mode, celebrate }: { data: RevealResultData; mode: "hidden" | "animate" | "static"; celebrate?: boolean }) => {
  const animate = mode === "animate";
  const visible = mode !== "hidden";
  const hasFullMarks = data.obtained != null && data.total != null;
  const obtainedAnim = useCountUp(data.obtained ?? 0, animate && hasFullMarks);
  const pctAnim = useCountUp(data.percentage ?? 0, animate && data.percentage != null);
  const glow = !visible ? "none" : data.isPass ? "gold" : "teal";
  const firstName = data.studentName.split(" ")[0];

  // School results have obtained/total/percent; board (BISE Peshawar) results
  // fall back to the raw marks line + grade + remarks.
  const stats = hasFullMarks
    ? [
        { l: "Obtained", v: animate ? obtainedAnim : data.obtained, c: "text-blue-600 dark:text-blue-400" },
        { l: "Total", v: data.total, c: "text-foreground" },
        { l: "Percent", v: animate ? `${pctAnim}%` : `${data.percentage}%`, c: "text-emerald-600 dark:text-emerald-400" },
        { l: "Grade", v: data.grade, c: "text-amber-600 dark:text-amber-400" },
      ]
    : [
        { l: "Marks", v: data.marksLine || "—", c: "text-blue-600 dark:text-blue-400" },
        { l: "Grade", v: data.grade, c: "text-amber-600 dark:text-amber-400" },
        { l: "Remarks", v: data.remarksLine || "—", c: "text-emerald-600 dark:text-emerald-400" },
      ];

  return (
    <div className="relative bg-card rounded-3xl border border-border shadow-2xl overflow-hidden w-[min(92vw,400px)]">
      {/* Gold hairline */}
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-[#E3B341] to-transparent" />
      {/* Light sweep on reveal (theater) or finished scratching */}
      {((animate && !celebrate) || (celebrate && mode === "static")) && (
        <motion.div
          key="sweep"
          initial={{ x: "-130%" }}
          animate={{ x: "130%" }}
          transition={{ duration: 1.25, ease: "easeInOut", delay: 0.15 }}
          className="absolute inset-0 pointer-events-none z-20"
          style={{ background: "linear-gradient(105deg, transparent 42%, rgba(255,255,255,0.35) 50%, transparent 58%)" }}
        />
      )}

      <div className="px-6 pt-6 pb-5 text-center relative">
        {/* Crest + school */}
        <div className="flex flex-col items-center">
          <Crest size={72} glow={glow} />
          <p className="mt-2.5 text-[11px] font-bold tracking-[0.22em] uppercase text-muted-foreground">GHS Babi Khel</p>
          <span className="mt-1.5 inline-flex items-center bg-secondary border border-border rounded-full px-3 py-0.5 text-[10px] font-bold tracking-wide uppercase text-secondary-foreground">
            {data.examLabel}{data.className ? ` · Class ${data.className}` : ""}
          </span>
        </div>

        {/* Student — premium monogram: antique-gold ring, emerald core, star pin */}
        <div className="mt-4 flex items-center justify-center gap-3">
          {data.photoUrl ? (
            <motion.div
              initial={{ scale: 0.4, opacity: 0 }}
              animate={visible ? { scale: 1, opacity: 1 } : {}}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: animate ? 0.1 : 0 }}
              className="shrink-0 rounded-full p-[2.5px]"
              style={{ background: "linear-gradient(135deg,#F6DE8D 0%,#D9A83C 45%,#A87B1D 100%)", boxShadow: "0 5px 16px -5px rgba(217,168,60,0.6)" }}
            >
              <img src={data.photoUrl} alt="" className="w-11 h-11 rounded-full object-cover" />
            </motion.div>
          ) : (
            <motion.div
              initial={{ scale: 0.4, opacity: 0 }}
              animate={visible ? { scale: 1, opacity: 1 } : {}}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: animate ? 0.1 : 0 }}
              className="relative shrink-0"
            >
              <div
                className="w-12 h-12 rounded-full p-[2.5px]"
                style={{ background: "linear-gradient(135deg,#F6DE8D 0%,#D9A83C 45%,#A87B1D 100%)", boxShadow: "0 5px 16px -5px rgba(217,168,60,0.6)" }}
              >
                <div
                  className="w-full h-full rounded-full flex items-center justify-center"
                  style={{ background: "linear-gradient(160deg,#1E6247 0%,#0F3D2B 100%)" }}
                >
                  <span className="text-white text-lg font-black font-heading leading-none">{firstName.charAt(0)}</span>
                </div>
              </div>
              <span
                className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                style={{ background: "linear-gradient(135deg,#F6DE8D,#D9A83C)", boxShadow: "0 1px 5px rgba(217,168,60,0.65)" }}
              >
                <svg viewBox="0 0 10 10" className="w-2 h-2" aria-hidden>
                  <path d="M5 0 l1.2 3.8 L10 5 6.2 6.2 5 10 3.8 6.2 0 5 3.8 3.8 Z" fill="#fff" />
                </svg>
              </span>
            </motion.div>
          )}
          <div className="text-left min-w-0">
            {data.isPass ? (
              <h3 className="font-heading font-extrabold text-lg text-foreground leading-tight">
                Congratulations, {firstName}! <span aria-hidden>🎉</span>
              </h3>
            ) : (
              <h3 className="font-heading font-extrabold text-lg text-foreground leading-tight">
                Your result is here, {firstName}
              </h3>
            )}
            <p className="text-xs text-muted-foreground truncate">
              {data.rollNo ? <>Roll No <span className="font-mono font-bold text-foreground">{data.rollNo}</span></> : data.studentName}
            </p>
          </div>
        </div>

        {/* Respectful support line for the hard days — no red, no shame */}
        {!data.isPass && visible && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: animate ? 0.9 : 0, duration: 0.5 }}
            className="mt-3 mx-auto max-w-[300px] rounded-xl bg-teal-50 dark:bg-teal-900/25 border border-teal-200/70 dark:border-teal-800/60 px-3.5 py-2">
            <p className="text-[11.5px] leading-relaxed font-medium text-teal-800 dark:text-teal-300">
              Every result is a step. Talk to your teacher tomorrow.
            </p>
          </motion.div>
        )}

        {/* Stats — stagger in */}
        <div className={`mt-5 grid ${hasFullMarks ? "grid-cols-4" : "grid-cols-3"} divide-x divide-border rounded-2xl border border-border bg-background/60`}>
          {stats.map((s, i) => (
            <motion.div key={s.l} initial={{ opacity: 0, y: 10 }} animate={visible ? { opacity: 1, y: 0 } : {}} transition={{ delay: animate ? 0.35 + i * 0.08 : 0, duration: 0.45 }} className="py-2.5 px-1">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">{s.l}</p>
              <p className={`text-base sm:text-lg font-extrabold tabular-nums ${s.c}`}>{s.v}</p>
            </motion.div>
          ))}
        </div>

        {/* Subject rows — one at a time, 0.045s stagger */}
        <SubjectRows subjects={data.subjects} visible={visible} animate={animate} />
      </div>
    </div>
  );
};

// ── Mode chooser — three beautiful tiles + skip (sound toggle removed) ─────
const ChooseStage = ({ name, onPick, onSkip }: {
  name: string; onPick: (m: "theater" | "scratch" | "aurora") => void; onSkip: () => void;
}) => (
  <div className="w-[min(92vw,460px)]">
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
      className="bg-card rounded-3xl border border-border shadow-2xl overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-[#E3B341] to-transparent" />
      <div className="px-6 pt-7 pb-6 text-center">
        <div className="flex justify-center"><Crest size={58} glow="none" /></div>
        <h3 className="mt-3 font-heading font-extrabold text-xl text-foreground">
          {name.split(" ")[0]}, your result is ready
        </h3>
        <p className="text-xs text-muted-foreground mt-1">Pick how you want to see it — or skip straight to the card.</p>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {/* Theater tile */}
          <button onClick={() => onPick("theater")}
            className="group relative rounded-2xl border border-border bg-background p-4 text-left hover:border-[#E3B341]/60 hover:shadow-lg transition-all">
            <div className="h-16 rounded-xl overflow-hidden relative mb-3" style={{ background: "linear-gradient(180deg,#123a2c 0%,#0a241b 100%)" }}>
              <div className="absolute inset-0 opacity-60" style={{ background: "repeating-linear-gradient(90deg, rgba(255,255,255,0.07) 0 6px, transparent 6px 16px, rgba(0,0,0,0.28) 16px 22px, transparent 22px 30px)" }} />
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#F4D06F] to-[#A87B1D]" />
              <motion.div initial={{ y: 14 }} animate={{ y: 0 }} transition={{ repeat: Infinity, repeatType: "reverse", repeatDelay: 1.6, duration: 1.2 }}
                className="absolute inset-x-4 bottom-0 h-3 rounded-t-md bg-gradient-to-t from-[#F4D06F]/70 to-transparent" />
            </div>
            <p className="font-heading font-bold text-sm text-foreground flex items-center gap-1.5"><Wand2 className="w-3.5 h-3.5 text-[#B8860B]" /> The Grand Reveal</p>
            <p className="text-[10.5px] text-muted-foreground mt-0.5 leading-snug">A cinematic curtain lift with your crest glowing.</p>
          </button>

          {/* Scratch tile */}
          <button onClick={() => onPick("scratch")}
            className="group relative rounded-2xl border border-border bg-background p-4 text-left hover:border-[#E3B341]/60 hover:shadow-lg transition-all">
            <div className="h-16 rounded-xl relative mb-3 overflow-hidden flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#eef0f4 0%,#cdd2da 55%,#b9bfca 100%)" }}>
              <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(rgba(90,96,110,0.35) 0.6px, transparent 0.7px)", backgroundSize: "5px 5px" }} />
              <span className="relative text-[9px] font-black tracking-[0.28em] text-slate-500">SCRATCH ME</span>
              <MousePointer2 className="absolute right-2.5 bottom-2 w-3.5 h-3.5 text-slate-500" />
            </div>
            <p className="font-heading font-bold text-sm text-foreground flex items-center gap-1.5"><Ticket className="w-3.5 h-3.5 text-[#B8860B]" /> Scratch &amp; Shine</p>
            <p className="text-[10.5px] text-muted-foreground mt-0.5 leading-snug">Rub the silver foil like a lucky card.</p>
          </button>

          {/* Aurora tile */}
          <button onClick={() => onPick("aurora")}
            className="group relative rounded-2xl border border-border bg-background p-4 text-left hover:border-[#E3B341]/60 hover:shadow-lg transition-all col-span-2 sm:col-span-1">
            <div className="h-16 rounded-xl relative mb-3 overflow-hidden" style={{ background: "linear-gradient(180deg,#050912 0%,#0a1224 55%,#0e1830 100%)" }}>
              {/* Tiny static aurora preview — cheap CSS gradient, no WebGL here */}
              <div className="absolute inset-x-0 bottom-0 h-11 opacity-80" style={{
                background: "radial-gradient(60% 100% at 30% 100%, rgba(52,211,153,0.55), transparent 70%), radial-gradient(50% 90% at 65% 100%, rgba(129,140,248,0.5), transparent 70%), radial-gradient(45% 80% at 85% 100%, rgba(244,208,111,0.4), transparent 70%)",
                filter: "blur(2px)",
              }} />
              <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.55) 0.5px, transparent 0.6px)", backgroundSize: "14px 14px", opacity: 0.35 }} />
              <span className="absolute top-1.5 right-2 text-[9px] font-black tracking-[0.22em] text-white/70">🌠</span>
            </div>
            <p className="font-heading font-bold text-sm text-foreground flex items-center gap-1.5"><Sparkle className="w-3.5 h-3.5 text-[#B8860B]" /> Aurora</p>
            <p className="text-[10.5px] text-muted-foreground mt-0.5 leading-snug">Your marks, painted as northern lights.</p>
          </button>
        </div>

        <p className="mt-3.5 text-[10.5px] text-muted-foreground">All three end with a little celebration 🎉</p>

        <div className="mt-3">
          <button onClick={onSkip} className="text-xs font-semibold text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors">
            Skip — show my result directly
          </button>
        </div>
      </div>
    </motion.div>
  </div>
);

// ── THE GRAND REVEAL — velvet curtain lift ──────────────────────────────────
// Timeline: 350ms beat → 0.22s tug down (anticipation — the curtain "grips")
// → 2.6s lift with an ease that starts moving right away. Total ≈ 3.2s of
// pure transform animation. The old version waited 900ms doing nothing and
// used a 3.9s ease whose first second barely moved — that read as "hanging".
const TheaterStage = ({ data, play, onCelebrate, onDone }: {
  data: RevealResultData; play: PlayFn; onCelebrate: (m: CelebrationMode) => void;
  /** "View Full Result Card" — goes straight to the result, not through an
      extra "summary" stage click (that extra hop was the bug where the
      button needed two taps). */
  onDone: () => void;
}) => {
  // idle → curtain closed · tug → anticipation dip · lifting → animating up · revealed → card live
  const [phase, setPhase] = useState<"idle" | "tug" | "lifting" | "revealed">("idle");
  const firedRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setPhase("tug"), 350);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (phase === "tug") {
      const t = setTimeout(() => { setPhase("lifting"); play("roll"); }, 230);
      return () => clearTimeout(t);
    }
    if (phase === "lifting") {
      const t = setTimeout(() => {
        setPhase("revealed");
        if (!firedRef.current) {
          firedRef.current = true;
          play("thump");
          window.setTimeout(() => play("tada"), 150);
          onCelebrate(data.isPass ? "gold" : "calm");
        }
      }, 2600);
      return () => clearTimeout(t);
    }
  }, [phase, play, onCelebrate, data.isPass]);

  const revealed = phase === "revealed";

  return (
    <div className="relative w-[min(92vw,430px)] flex flex-col items-center">
      {/* Summary card underneath (revealed by the curtain) */}
      <SummaryCard data={data} mode={revealed ? "animate" : "hidden"} />

      {revealed && (
        <motion.button onClick={onDone} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
          className="mt-5 inline-flex items-center gap-2 rounded-2xl px-6 py-3 font-bold text-sm text-white shadow-lg transition-transform hover:-translate-y-0.5"
          style={{ background: "linear-gradient(135deg, hsl(160 45% 16%), hsl(160 40% 24%))" }}>
          View Full Result Card <ArrowDown className="w-4 h-4" />
        </motion.button>
      )}

      {/* ── The curtain ──
          Anchored across the card, but the curtain itself is sticky with
          viewport height: on TALL cards (BISE with ~20 rows) the crest,
          the name and "Presenting your result" stay centred in exactly
          what the student sees for the whole lift — and if they scroll
          mid-show, the show stays in view instead of sliding away. */}
      {!revealed && (
        <div className="absolute inset-0 z-30">
          <motion.div
            initial={{ y: 0 }}
            animate={{ y: phase === "idle" ? 0 : phase === "tug" ? 8 : "-104%" }}
            transition={
              phase === "tug"
                ? { duration: 0.22, ease: "easeInOut" }
                : { duration: 2.6, ease: [0.3, 0, 0.16, 1] }
            }
            className="sticky top-0 h-screen rounded-3xl overflow-hidden"
            style={{ height: "100dvh", willChange: "transform", transform: "translateZ(0)", boxShadow: "0 26px 50px -18px rgba(0,0,0,0.5)" }}
          >
          {/* Velvet body */}
          <div className="absolute inset-0" style={{
            background:
              "repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0) 18px, rgba(0,0,0,0.20) 36px, rgba(0,0,0,0) 54px)," +
              "linear-gradient(180deg, #143d2e 0%, #0c2b21 48%, #071e17 100%)",
          }} />
          {/* Warm center spotlight so the crest pops */}
          <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 50% 34%, rgba(244,208,111,0.14), transparent 52%)" }} />
          {/* Gold rod */}
          <div className="absolute top-0 inset-x-0 h-2.5" style={{ background: "linear-gradient(180deg,#F4D06F,#A87B1D)" }} />
          <div className="absolute top-1 -left-1 w-4 h-4 rounded-full" style={{ background: "radial-gradient(circle at 35% 35%, #F7DC8A, #A87B1D)" }} />
          <div className="absolute top-1 -right-1 w-4 h-4 rounded-full" style={{ background: "radial-gradient(circle at 35% 35%, #F7DC8A, #A87B1D)" }} />
          {/* Scalloped hem */}
          <div className="absolute bottom-0 inset-x-0 h-4" style={{ background: "radial-gradient(circle at 11px 0px, #0a241b 10px, transparent 11px)", backgroundSize: "22px 16px", backgroundRepeat: "repeat-x" }} />

          {/* Crest + presenting text, rides up with the curtain */}
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
            <Crest size={92} glow="none" />
            <p className="mt-4 text-[10px] font-bold tracking-[0.3em] uppercase text-[#E3B341]/90">GHS Babi Khel</p>
            <p className="mt-1.5 font-heading font-extrabold text-xl text-[#FBEFD0] leading-snug">{data.studentName}</p>
            <p className="mt-1 text-[11px] text-white/55">{data.examLabel}{data.className ? ` · Class ${data.className}` : ""}</p>
            <motion.p initial={{ opacity: 0.4 }} animate={{ opacity: [0.4, 0.9, 0.4] }} transition={{ repeat: Infinity, duration: 1.6 }}
              className="mt-5 text-[10px] tracking-[0.25em] uppercase text-white/60">
              Presenting your result
            </motion.p>
          </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

// ── SCRATCH & SHINE — canvas foil with pointer erase ────────────────────────
const ScratchStage = ({ data, play, onCelebrate, onDone }: {
  data: RevealResultData; play: PlayFn; onCelebrate: (m: CelebrationMode) => void; onDone: () => void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const drawing = useRef(false);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  const checkedRef = useRef(false);
  const lastCheckRef = useRef(0);
  const [done, setDone] = useState(false);

  const complete = useCallback(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    setDone(true);
    play("thump");
    window.setTimeout(() => play("tada"), 150);
    onCelebrate(data.isPass ? "gold" : "calm");
    // No auto-close here — stay on the revealed card with the "View Full
    // Result Card" button, same as The Grand Reveal, instead of closing
    // itself a second after the scratch finishes.
  }, [play, onCelebrate, data.isPass]);

  // Paint the champagne-silver foil once the canvas has layout
  useLayoutEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;

    // Base foil
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#f0f2f6"); g.addColorStop(0.5, "#ccd1da"); g.addColorStop(1, "#b7bdc9");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Noise flakes
    for (let i = 0; i < (w * h) / 38; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = Math.random() * 1.3 + 0.3;
      ctx.fillStyle = `rgba(${90 + Math.random() * 60 | 0},${95 + Math.random() * 60 | 0},${110 + Math.random() * 60 | 0},${Math.random() * 0.16 + 0.04})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // Diagonal sheen bands
    ctx.save();
    ctx.translate(w / 2, h / 2); ctx.rotate(-Math.PI / 7);
    for (const [off, alpha] of [[-w * 0.28, 0.16], [w * 0.18, 0.1]] as const) {
      const band = ctx.createLinearGradient(off - 40, 0, off + 40, 0);
      band.addColorStop(0, "rgba(255,255,255,0)"); band.addColorStop(0.5, `rgba(255,255,255,${alpha})`); band.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = band; ctx.fillRect(off - 40, -h, 80, h * 2);
    }
    ctx.restore();
    // Label
    ctx.fillStyle = "rgba(84,90,104,0.85)";
    ctx.textAlign = "center";
    ctx.font = "800 15px 'Plus Jakarta Sans', system-ui, sans-serif";
    ctx.fillText("S C R A T C H   T O   R E V E A L", w / 2, h / 2 - 4);
    ctx.font = "600 10.5px 'Inter', system-ui, sans-serif";
    ctx.fillStyle = "rgba(84,90,104,0.6)";
    ctx.fillText("use your finger or cursor", w / 2, h / 2 + 16);
  }, []);

  const eraseAt = (x: number, y: number, r: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "destination-out";
    if (!lastPt.current) {
      // First touch — a zero-length stroke draws nothing in some browsers,
      // so punch an explicit hole.
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(lastPt.current.x, lastPt.current.y);
      ctx.lineTo(x, y);
      ctx.lineWidth = r * 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    }
    lastPt.current = { x, y };
  };

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const radiusFor = (e: React.PointerEvent<HTMLCanvasElement>) => (e.pointerType === "touch" ? 30 : 22);

  // Sampled against a small OFFSCREEN copy of the canvas (fixed ~64px-wide),
  // not the full-resolution foil — reading the full canvas via getImageData
  // on a tall, high-DPR foil (e.g. a 1500px BISE sheet at 2x) blocks the
  // main thread for a noticeable beat on low-end phones, which is what
  // produced the "stuck and hanging" freeze while scratching.
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const checkProgress = () => {
    const canvas = canvasRef.current;
    if (!canvas || checkedRef.current) return;
    const sw = 48;
    const sh = Math.max(1, Math.round(sw * (canvas.height / canvas.width)));
    let sample = sampleCanvasRef.current;
    if (!sample) { sample = document.createElement("canvas"); sampleCanvasRef.current = sample; }
    if (sample.width !== sw || sample.height !== sh) { sample.width = sw; sample.height = sh; }
    const sctx = sample.getContext("2d", { willReadFrequently: true });
    if (!sctx) return;
    sctx.clearRect(0, 0, sw, sh);
    sctx.drawImage(canvas, 0, 0, sw, sh);
    const img = sctx.getImageData(0, 0, sw, sh).data;
    let clear = 0, total = 0;
    for (let i = 3; i < img.length; i += 4) { total++; if (img[i] < 24) clear++; }
    // Threshold scales with foil height: a school card (~600px) needs the
    // classic 50%; a tall BISE sheet (20 rows ≈ 1500px) needs proportionally
    // less, so it still pops after a satisfying rub instead of a marathon.
    const threshold = Math.min(0.5, Math.max(0.14, 0.5 * (620 / Math.max(1, canvas.height / (Math.min(window.devicePixelRatio || 1, 2))))));
    if (total > 0 && clear / total > threshold) complete();
  };
  // Progress is ALSO checked mid-stroke every ~120ms, so the card can pop
  // while the finger is still down instead of waiting for a perfect release.
  // The cheap downscaled sample above is what makes this frequency safe.
  const maybeCheck = () => {
    const now = performance.now();
    if (now - lastCheckRef.current > 120) {
      lastCheckRef.current = now;
      checkProgress();
    }
  };

  return (
    <div className="relative w-[min(92vw,430px)] flex flex-col items-center">
      <div ref={wrapRef} className="relative rounded-3xl">
        <SummaryCard data={data} mode="static" celebrate={done} />
        {/* Foil layer */}
        <canvas
          ref={canvasRef}
          onPointerDown={e => { if (done) return; drawing.current = true; lastPt.current = null; e.currentTarget.setPointerCapture(e.pointerId); const p = pos(e); eraseAt(p.x, p.y, radiusFor(e)); }}
          onPointerMove={e => { if (!drawing.current || done) return; const p = pos(e); eraseAt(p.x, p.y, radiusFor(e)); maybeCheck(); }}
          onPointerUp={() => { drawing.current = false; lastPt.current = null; checkProgress(); }}
          onPointerLeave={() => { if (drawing.current) { drawing.current = false; lastPt.current = null; checkProgress(); } }}
          onPointerCancel={() => { drawing.current = false; lastPt.current = null; checkProgress(); }}
          className="absolute inset-0 z-20 rounded-3xl transition-opacity duration-700"
          style={{ touchAction: "none", cursor: done ? "default" : "grab", opacity: done ? 0 : 1, pointerEvents: done ? "none" : "auto", width: "100%", height: "100%" }}
        />
        {!done && (
          <motion.p animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.8 }}
            className="absolute -bottom-7 inset-x-0 text-center text-[11px] font-semibold text-white/85 z-10 flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Rub the foil to reveal your marks
          </motion.p>
        )}
      </div>
      {done && (
        <motion.button onClick={onDone} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
          className="mt-5 inline-flex items-center gap-2 rounded-2xl px-6 py-3 font-bold text-sm text-white shadow-lg transition-transform hover:-translate-y-0.5"
          style={{ background: "linear-gradient(135deg, hsl(160 45% 16%), hsl(160 40% 24%))" }}>
          View Full Result Card <ArrowDown className="w-4 h-4" />
        </motion.button>
      )}
      {!done && (
        <button onClick={complete} className="mt-9 text-[10.5px] font-medium text-white/50 hover:text-white/80 underline underline-offset-2">
          reveal instantly
        </button>
      )}
    </div>
  );
};

// ── AURORA RESULTS — marks painted as northern lights ───────────────────────
// A real WebGL fragment shader: each subject becomes an independent aurora
// ribbon driven by simplex noise, whose frequency/amplitude/colour respond
// to that subject's percentage. The whole sky's overall brightness/palette
// responds to the OVERALL result — so the shape of the sky is the shape of
// the result, exactly as asked for. Runs ~20s, then freezes on a still
// frame (cheap: we just stop the rAF loop, the canvas keeps its last paint).
//
// PERFORMANCE CONTRACT (same spirit as the rest of this file):
//   • ONE WebGL context, ONE compiled program, ONE rAF loop — no React
//     re-renders drive the animation; only uniforms are pushed per frame.
//   • Canvas backing size is capped independent of devicePixelRatio (see
//     MAX_DPR) so a tall phone doesn't push a huge fragment-shader
//     resolution on a low-end GPU.
//   • If WebGL isn't available (very old device / restricted webview) we
//     fall back to a static CSS gradient sky — never a blank/broken screen.
const AURORA_VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// Subject ribbons are packed as a small uniform array: each ribbon gets a
// base y-position, a percentage (0-1), and a colour computed on the CPU
// side (so the shader stays generic and the palette logic lives in JS,
// where it's easy to read/tune).
const MAX_RIBBONS = 24;
const AURORA_FRAG = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform float uOverall;      // 0..1 overall percentage — drives sky brightness/palette
uniform float uDistinction;  // 1.0 if pass-with-distinction (gold/white event)
uniform int uCount;
uniform vec4 uRibbon[${MAX_RIBBONS}];   // x=yPos(0..1) y=pct(0..1) z=seed w=unused
uniform vec3 uColor[${MAX_RIBBONS}];

// ── simplex-ish 2D noise (Ashima-style, compact) ──
vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                      -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
          + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes.xy;
  // Night sky base — deeper and cooler at the top, faint horizon glow.
  vec3 skyTop = mix(vec3(0.01,0.02,0.05), vec3(0.02,0.03,0.08), uOverall);
  vec3 skyBot = mix(vec3(0.03,0.05,0.10), vec3(0.05,0.07,0.14), uOverall);
  vec3 col = mix(skyBot, skyTop, uv.y);

  // Stars — cheap hashed dots, denser/dimmer than the aurora so it doesn't distract.
  vec2 starUv = floor(uv * uRes.xy / 3.0);
  float starHash = fract(sin(dot(starUv, vec2(12.9898,78.233))) * 43758.5453);
  if (starHash > 0.9975) {
    float tw = 0.5 + 0.5 * sin(uTime * 2.0 + starHash * 40.0);
    col += vec3(0.8, 0.85, 1.0) * tw * 0.6;
  }

  // Each ribbon: a horizontal noise-driven band whose height/brightness
  // scales with that subject's percentage. Higher pct → taller, brighter,
  // faster-moving band; lower pct → shorter, dimmer, slower.
  for (int i = 0; i < ${MAX_RIBBONS}; i++) {
    if (i >= uCount) break;
    vec4 r = uRibbon[i];
    float yPos = r.x;
    float pct = r.y;
    float seed = r.z;
    float freq = mix(1.6, 4.2, pct);
    float speed = mix(0.05, 0.22, pct);
    float amp = mix(0.03, 0.11, pct);
    float n = snoise(vec2(uv.x * freq + seed * 11.0, uTime * speed + seed * 7.0));
    float band = yPos + n * amp;
    float thickness = mix(0.02, 0.075, pct);
    float d = abs(uv.y - band);
    float intensity = smoothstep(thickness, 0.0, d);
    // Vertical falloff so ribbons feel like they rise from the band, not
    // a symmetric blob.
    float riseMask = smoothstep(band - thickness * 2.6, band + thickness * 0.4, uv.y);
    intensity *= mix(1.0, riseMask, 0.65);
    col += uColor[i] * intensity * mix(0.35, 1.0, pct) * 0.9;
  }

  // Distinction event — the whole sky gets a soft gold/white wash.
  col = mix(col, col + vec3(0.25, 0.20, 0.08), uDistinction * 0.5);

  col = pow(col, vec3(0.92)); // gentle gamma lift so darks aren't crushed
  gl_FragColor = vec4(col, 1.0);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

// Percentage-based colour temperature — gold/emerald (high), teal/violet
// (mid), soft blue (low). No shame palette: even the lowest band is a
// calm, real aurora colour, never grey or muted-to-nothing.
function ribbonColor(pct: number): [number, number, number] {
  if (pct >= 0.8) return [0.95, 0.82, 0.35]; // gold
  if (pct >= 0.65) return [0.25, 0.85, 0.55]; // emerald
  if (pct >= 0.45) return [0.30, 0.75, 0.70]; // teal
  if (pct >= 0.3) return [0.55, 0.45, 0.90]; // violet
  return [0.35, 0.55, 0.85]; // soft blue
}

const AuroraStage = ({ data, play, onCelebrate, onDone }: {
  data: RevealResultData; play: PlayFn; onCelebrate: (m: CelebrationMode) => void; onDone: () => void;
}) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [frozen, setFrozen] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [showStar, setShowStar] = useState(false);
  const celebratedRef = useRef(false);

  // Ribbon data derived from the marks — one per subject, matching the
  // "each subject is a separate ribbon" brief for BOTH school results
  // (obtained/total known) and BISE Peshawar results (only raw theory +
  // practical marks are published, no per-subject maximum). For the BISE
  // case we can't compute a true percentage per subject, so each ribbon's
  // height is scaled relative to the strongest subject in *this* result —
  // still genuinely per-subject and shaped by the student's own marks,
  // just normalised instead of against an unknown denominator.
  const { ribbons, overall, isDistinction, isTopper } = (() => {
    const withTotal = data.subjects.filter(s => s.total != null && s.total > 0);
    const rawMarksOf = (s: RevealSubject) =>
      (parseFloat(s.theory || "0") || 0) + (parseFloat(s.practical || "0") || 0);

    const overallPct = data.percentage != null
      ? Math.max(0, Math.min(1, data.percentage / 100))
      : withTotal.length
        ? withTotal.reduce((a, s) => a + Math.max(0, Math.min(1, (s.obtained || 0) / (s.total as number))), 0) / withTotal.length
        : (data.isPass ? 0.6 : 0.35);

    let subjectPcts: number[];
    if (withTotal.length) {
      subjectPcts = withTotal.map(s => Math.max(0, Math.min(1, (s.obtained || 0) / (s.total as number))));
    } else if (data.subjects.length) {
      // BISE fallback — normalise each subject's raw marks against this
      // result's own strongest subject, then blend gently toward the
      // overall percentage so one anomalous subject doesn't dominate.
      const raws = data.subjects.map(rawMarksOf);
      const max = Math.max(1, ...raws);
      subjectPcts = raws.map(r => Math.max(0.05, Math.min(1, 0.4 * (r / max) + 0.6 * overallPct)));
    } else {
      subjectPcts = [overallPct];
    }

    const list = subjectPcts.length ? subjectPcts : [overallPct];
    const n = Math.min(list.length, MAX_RIBBONS);
    const ribbons = list.slice(0, n).map((pct, i) => ({
      yPos: 0.22 + (i / Math.max(1, n - 1 || 1)) * 0.5,
      pct,
      seed: i * 3.7 + 1.3,
      color: ribbonColor(pct),
    }));
    return {
      ribbons,
      overall: overallPct,
      isDistinction: data.isPass && overallPct >= 0.8,
      isTopper: data.isPass && data.classPosition === 1,
    };
  })();

  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const gl = (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) { setWebglFailed(true); return; }

    const vs = compileShader(gl, gl.VERTEX_SHADER, AURORA_VERT);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, AURORA_FRAG);
    if (!vs || !fs) { setWebglFailed(true); return; }
    const program = gl.createProgram();
    if (!program) { setWebglFailed(true); return; }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { setWebglFailed(true); return; }
    gl.useProgram(program);

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, "uRes");
    const uTime = gl.getUniformLocation(program, "uTime");
    const uOverall = gl.getUniformLocation(program, "uOverall");
    const uDistinction = gl.getUniformLocation(program, "uDistinction");
    const uCount = gl.getUniformLocation(program, "uCount");
    const uRibbon = gl.getUniformLocation(program, "uRibbon[0]");
    const uColor = gl.getUniformLocation(program, "uColor[0]");

    const ribbonData = new Float32Array(MAX_RIBBONS * 4);
    const colorData = new Float32Array(MAX_RIBBONS * 3);
    ribbons.forEach((r, i) => {
      ribbonData[i * 4] = r.yPos;
      ribbonData[i * 4 + 1] = r.pct;
      ribbonData[i * 4 + 2] = r.seed;
      ribbonData[i * 4 + 3] = 0;
      colorData[i * 3] = r.color[0];
      colorData[i * 3 + 1] = r.color[1];
      colorData[i * 3 + 2] = r.color[2];
    });

    // Backing resolution capped — a full-DPR fragment shader over a tall
    // phone screen is the single most likely cause of a "hang" here, so
    // we deliberately render at a modest fixed resolution and let CSS
    // upscale the canvas (aurora is soft/blurry by nature, so this costs
    // nothing visually).
    const MAX_DPR = 1;
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let raf = 0;
    const t0 = performance.now();
    const DURATION = 20000; // 20s animate, then freeze

    const frame = (t: number) => {
      const elapsed = t - t0;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, elapsed / 1000);
      gl.uniform1f(uOverall, overall);
      gl.uniform1f(uDistinction, isDistinction ? 1 : 0);
      gl.uniform1i(uCount, ribbons.length);
      gl.uniform4fv(uRibbon, ribbonData);
      gl.uniform3fv(uColor, colorData);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      if (elapsed < DURATION) {
        raf = requestAnimationFrame(frame);
      } else {
        setFrozen(true);
        if (!celebratedRef.current) {
          celebratedRef.current = true;
          play("thump");
          window.setTimeout(() => play("tada"), 150);
          onCelebrate(isDistinction ? "gold" : data.isPass ? "gold" : "calm");
          if (isTopper) window.setTimeout(() => setShowStar(true), 300);
        }
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(posBuf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.studentName.replace(/\s+/g, "-").toLowerCase()}-aurora-sky.png`;
      a.click();
    } catch {
      // Canvas may be tainted in rare embedded-webview setups — fail
      // silently rather than throwing in the student's face.
    }
  };

  return (
    <div className="w-[min(92vw,430px)] flex flex-col items-center">
      <div ref={wrapRef} className="relative w-full rounded-3xl overflow-hidden shadow-2xl" style={{ aspectRatio: "3 / 4", background: "#050912" }}>
        {webglFailed ? (
          // Static fallback sky — no WebGL, still a real aurora-toned card.
          <div className="absolute inset-0" style={{
            background: "linear-gradient(180deg,#050912 0%,#0a1224 55%,#0e1830 100%)",
          }}>
            <div className="absolute inset-x-0 bottom-0 h-2/5 opacity-80" style={{
              background: "radial-gradient(60% 100% at 30% 100%, rgba(52,211,153,0.5), transparent 70%), radial-gradient(50% 90% at 65% 100%, rgba(129,140,248,0.45), transparent 70%), radial-gradient(45% 80% at 85% 100%, rgba(244,208,111,0.35), transparent 70%)",
              filter: "blur(6px)",
            }} />
          </div>
        ) : (
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        )}

        {/* Shooting star — class toppers only, appears once the sky settles */}
        {showStar && (
          <motion.div
            initial={{ x: "-8%", y: "6%", opacity: 0 }}
            animate={{ x: "112%", y: "34%", opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.4, ease: "easeIn" }}
            className="absolute w-16 h-[2px] pointer-events-none"
            style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.95))", boxShadow: "0 0 8px 2px rgba(255,255,255,0.8)" }}
          />
        )}

        {/* Caption — marks listed in thin gold text at the bottom */}
        <div className="absolute inset-x-0 bottom-0 px-5 pt-10 pb-4" style={{ background: "linear-gradient(0deg, rgba(2,4,10,0.82) 0%, rgba(2,4,10,0.35) 65%, transparent 100%)" }}>
          <p className="text-center font-heading text-[13px] tracking-wide" style={{ color: "#F4D06F", fontWeight: 300 }}>
            {data.studentName} · {data.examLabel}{data.rollNo ? ` · Roll No ${data.rollNo}` : ""}
          </p>
          <p className="text-center text-[11px] mt-1" style={{ color: "rgba(244,208,111,0.75)", fontWeight: 300, letterSpacing: "0.03em" }}>
            {[
              data.marksLine || (data.obtained != null && data.total != null ? `${data.obtained}/${data.total}` : null),
              data.grade ? `Grade ${data.grade}` : null,
            ].filter(Boolean).join(" · ")}
          </p>
        </div>

        {/* Not-frozen hint */}
        {!frozen && (
          <p className="absolute top-3 inset-x-0 text-center text-[10px] tracking-[0.2em] uppercase text-white/50">
            Watching the sky…
          </p>
        )}
      </div>

      {frozen && (
        <div className="mt-5 flex items-center gap-2.5">
          <motion.button onClick={handleSave} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 font-bold text-sm text-foreground bg-background border border-border shadow-lg transition-transform hover:-translate-y-0.5">
            <Download className="w-4 h-4" /> Save this sky
          </motion.button>
          <motion.button onClick={onDone} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
            className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 font-bold text-sm text-white shadow-lg transition-transform hover:-translate-y-0.5"
            style={{ background: "linear-gradient(135deg, hsl(160 45% 16%), hsl(160 40% 24%))" }}>
            View Full Result Card <ArrowDown className="w-4 h-4" />
          </motion.button>
        </div>
      )}
    </div>
  );
};

// ── Calm summary stage (reduced-motion + post-skip) ─────────────────────────
const SummaryStage = ({ data, onDone }: { data: RevealResultData; onDone: () => void }) => (
  <div className="w-[min(92vw,430px)] flex flex-col items-center">
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
      <SummaryCard data={data} mode="static" />
    </motion.div>
    <motion.button onClick={onDone} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
      className="mt-5 inline-flex items-center gap-2 rounded-2xl px-6 py-3 font-bold text-sm text-white shadow-lg"
      style={{ background: "linear-gradient(135deg, hsl(160 45% 16%), hsl(160 40% 24%))" }}>
      View Full Result Card <ArrowDown className="w-4 h-4" />
    </motion.button>
  </div>
);

// ── Celebration canvas — gold confetti burst (pass) / calm teal drift (fail)
// One <canvas>, one rAF loop, auto-stops and clears itself. No shadows, no
// blur, no React re-renders — 60fps even on low-end phones.
const CelebrationCanvas = ({ mode }: { mode: CelebrationMode }) => {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    const gold = mode === "gold";
    const colors = gold
      ? ["#F4D06F", "#D9A83C", "#FBEFD0", "#2F6B4F", "#FFFFFF"]
      : ["#8ED8C9", "#C4CFD4", "#E9EEF0", "#2F6B4F"];

    interface P { x: number; y: number; vx: number; vy: number; size: number; rot: number; vr: number; color: string; round: boolean; delay: number; }
    const parts: P[] = [];
    const N = gold ? 120 : 16;
    for (let i = 0; i < N; i++) {
      if (gold) {
        // Burst from behind the card, like a party popper
        const a = Math.random() * Math.PI * 2;
        const sp = 4 + Math.random() * 7;
        parts.push({
          x: w / 2 + (Math.random() - 0.5) * 60,
          y: h * 0.4 + (Math.random() - 0.5) * 40,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 5.5,
          size: 3 + Math.random() * 4.5,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.3,
          color: colors[i % colors.length],
          round: Math.random() < 0.3,
          delay: Math.random() * 160,
        });
      } else {
        // Gentle respectful drift — sparkles falling like slow snow
        parts.push({
          x: Math.random() * w,
          y: -20 - Math.random() * 80,
          vx: (Math.random() - 0.5) * 0.5,
          vy: 0.5 + Math.random() * 0.7,
          size: 2.5 + Math.random() * 3,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.06,
          color: colors[i % colors.length],
          round: Math.random() < 0.4,
          delay: Math.random() * 900,
        });
      }
    }

    let raf = 0;
    const t0 = performance.now();
    const LIFE = gold ? 2200 : 3000;
    const tick = (t: number) => {
      const el = t - t0;
      ctx.clearRect(0, 0, w, h);
      let alive = false;
      for (const p of parts) {
        if (el < p.delay) { alive = true; continue; }
        const age = el - p.delay;
        if (age > LIFE) continue;
        alive = true;
        if (gold) { p.vy += 0.16; p.vx *= 0.985; p.vy *= 0.99; }
        else { p.vx += Math.sin(age / 500 + p.rot) * 0.012; }
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        const fade = age > LIFE - 500 ? (LIFE - age) / 500 : 1;
        ctx.save();
        ctx.globalAlpha = Math.max(0, fade);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
        else ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.62);
        ctx.restore();
      }
      if (alive && el < LIFE + 1200) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[45]" />;
};

// ── Main overlay ────────────────────────────────────────────────────────────
const ResultRevealOverlay = ({ open, onClose, data }: Props) => {
  const [stage, setStage] = useState<Stage>("choose");
  const [celebration, setCelebration] = useState<{ k: number; mode: CelebrationMode } | null>(null);
  const { play, prime } = useRevealAudio();
  const reduced = useRef(false);

  const fireCelebration = useCallback((mode: CelebrationMode) => {
    setCelebration(c => ({ k: (c?.k ?? 0) + 1, mode }));
  }, []);

  // Reset + reduced-motion routing each time the overlay opens
  useEffect(() => {
    if (open) {
      reduced.current = prefersReducedMotion();
      setStage(reduced.current ? "summary" : "choose");
      setCelebration(null);
      // Lock page scroll while the theater is up
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  // Esc to close — one more escape hatch
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Top-right button: on the "choose" stage (or reduced-motion straight
  // summary) it closes the overlay; on "theater"/"scratch" it steps back
  // one stage to "choose" instead of closing outright.
  const handleBack = useCallback(() => {
    if (stage === "choose" || reduced.current) onClose();
    else setStage("choose");
  }, [stage, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[90]"
          style={{ background: "radial-gradient(circle at 50% 38%, rgba(10,36,27,0.88), rgba(4,14,10,0.94))" }}
          role="dialog" aria-modal="true" aria-label="Result reveal"
        >
          {/* Close — anchored to the viewport root, so it never scrolls away.
              A dark chip + border so it stays visible over the light
              Scratch & Shine foil and the light Grand Reveal summary card,
              not just the dark curtain backdrop. Steps back one stage
              instead of closing outright — "choose" (or straight to
              "summary" if reduced motion) → chosen stage back to choose. */}
          <button onClick={handleBack} aria-label="Back"
            className="absolute top-4 right-4 z-40 w-10 h-10 rounded-full bg-black/55 hover:bg-black/70 border border-white/25 text-white flex items-center justify-center shadow-lg backdrop-blur-sm transition-colors">
            {stage === "choose" || reduced.current ? <X className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
          </button>

          {/* Confetti / sparkle celebration (fires at the reveal payoff) */}
          {celebration && <CelebrationCanvas key={celebration.k} mode={celebration.mode} />}

          {/* ── Scrollable viewport ──
              SHORT cards (choose / school results) keep the centred modal
              look via min-h-full + items-center. TALL cards (BISE Peshawar
              with ~20 subject rows) grow past the viewport and SCROLL —
              fully, top and bottom, on touch and desktop. Because the
              centering wrapper is min-h-full (never shorter than its
              content), flex centering can never clip the card's top. */}
          <div
            className="absolute inset-0 overflow-y-auto overscroll-contain"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <div className="flex min-h-full items-center justify-center p-4">
              <AnimatePresence mode="wait">
            {stage === "choose" && (
              <motion.div key="choose" exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.16 }}>
                <ChooseStage
                  name={data.studentName}
                  onPick={m => { prime(); setStage(m); }}
                  onSkip={onClose}
                />
              </motion.div>
            )}
            {stage === "theater" && (
              <motion.div key="theater" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <TheaterStage data={data} play={play} onCelebrate={fireCelebration} onDone={onClose} />
              </motion.div>
            )}
            {stage === "scratch" && (
              <motion.div key="scratch" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <ScratchStage data={data} play={play} onCelebrate={fireCelebration} onDone={onClose} />
              </motion.div>
            )}
            {stage === "aurora" && (
              <motion.div key="aurora" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <AuroraStage data={data} play={play} onCelebrate={fireCelebration} onDone={onClose} />
              </motion.div>
            )}
            {stage === "summary" && (
              <motion.div key="summary" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                <SummaryStage data={data} onDone={onClose} />
              </motion.div>
            )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ResultRevealOverlay;
