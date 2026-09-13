import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Volume2, VolumeX, ArrowDown, Wand2, Ticket, MousePointer2 } from "lucide-react";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RESULT REVEAL THEATER — cinematic result moment for GHS Babi Khel
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Two reveal modes for a freshly searched result, plus a plain skip:
//   1. THE GRAND REVEAL — an emerald-velvet curtain with the gold school
//      crest lifts over ~4s, a soft light sweep crosses the card, then the
//      marks stagger in row by row. Pass → crest glows antique gold.
//      Fail → a soft, respectful teal glow and one kind sentence. No red.
//   2. SCRATCH & SHINE — a champagne-silver foil painted on <canvas> with
//      noise; the student rubs it away with finger/cursor to reveal marks.
//
// SAFETY RULES (the "don't distract / don't break anything" contract):
//   • Appears ONLY after the student actively searches — never on page load.
//   • Always skippable in one tap; full result cards stay below, untouched.
//   • Sound is OFF by default (optional synthesized drumbeat, no audio files).
//   • prefers-reduced-motion users bypass straight to a calm summary card.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface RevealSubject { name: string; obtained: number; total: number }

export interface RevealResultData {
  studentName: string;
  className: string;
  examLabel: string;
  rollNo?: string | null;
  obtained: number;
  total: number;
  percentage: number;
  grade: string;
  isPass: boolean;
  subjects: RevealSubject[];
  photoUrl?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data: RevealResultData;
}

type Stage = "choose" | "theater" | "scratch" | "summary";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// ── Tiny rAF count-up (marks & percentage tick up when revealed) ────────────
function useCountUp(target: number, active: boolean, instant: boolean, duration = 1200) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (instant) { setVal(target); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, instant, duration]);
  return active ? val : 0;
}

// ── Optional drumbeat — synthesized with WebAudio, zero audio assets ────────
function useDrumbeat(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  return useCallback((kind: "roll" | "hit") => {
    if (!enabled) return;
    try {
      if (!ctxRef.current) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctxRef.current = new AC();
      }
      const ctx = ctxRef.current!;
      if (ctx.state === "suspended") void ctx.resume();
      const now = ctx.currentTime;
      if (kind === "hit") {
        // Deep cinematic thump
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(165, now);
        o.frequency.exponentialRampToValueAtTime(46, now + 0.3);
        g.gain.setValueAtTime(0.45, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
        o.connect(g); g.connect(ctx.destination);
        o.start(now); o.stop(now + 0.4);
      } else {
        // Soft snare-roll shimmer (0.9s, fades out)
        const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.9), ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.6);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const f = ctx.createBiquadFilter();
        f.type = "lowpass"; f.frequency.value = 950;
        const g = ctx.createGain(); g.gain.value = 0.1;
        src.connect(f); f.connect(g); g.connect(ctx.destination);
        src.start(now);
      }
    } catch { /* audio unavailable — stay silent */ }
  }, [enabled]);
}

// ── School crest — gold hexagon frame, emerald shield, GHS monogram ─────────
const Crest = ({ size = 72, glow }: { size?: number; glow: "gold" | "teal" | "none" }) => (
  <div
    className="rounded-full flex items-center justify-center"
    style={{
      width: size, height: size,
      filter: glow === "gold"
        ? "drop-shadow(0 0 18px rgba(212,175,55,0.55))"
        : glow === "teal"
          ? "drop-shadow(0 0 16px rgba(45,212,191,0.45))"
          : "none",
      transition: "filter 1.2s ease",
    }}
  >
    <svg viewBox="0 0 64 64" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg">
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

// ── Shared summary card — the actual result, styled premium ─────────────────
// mode "hidden"   → stats/subjects invisible (theater pre-reveal)
// mode "animate"  → count-up + stagger + light sweep (theater reveal)
// mode "static"   → everything plainly visible (scratch payoff / calm mode)
const SummaryCard = ({ data, mode, celebrate }: { data: RevealResultData; mode: "hidden" | "animate" | "static"; celebrate?: boolean }) => {
  const animate = mode === "animate";
  const visible = mode !== "hidden";
  const obtainedAnim = useCountUp(data.obtained, animate, false);
  const pctAnim = useCountUp(data.percentage, animate, false);
  const glow = !visible ? "none" : data.isPass ? "gold" : "teal";
  const firstName = data.studentName.split(" ")[0];

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
            {data.examLabel} · Class {data.className}
          </span>
        </div>

        {/* Student */}
        <div className="mt-4 flex items-center justify-center gap-3">
          {data.photoUrl
            ? <img src={data.photoUrl} alt="" className="w-11 h-11 rounded-full object-cover ring-2 ring-[#E3B341]/60 shadow" />
            : <div className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-base font-black">{data.studentName.charAt(0)}</div>}
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
        <div className="mt-5 grid grid-cols-4 divide-x divide-border rounded-2xl border border-border bg-background/60">
          {[
            { l: "Obtained", v: animate ? obtainedAnim : data.obtained, c: "text-blue-600 dark:text-blue-400" },
            { l: "Total", v: data.total, c: "text-foreground" },
            { l: "Percent", v: animate ? `${pctAnim}%` : `${data.percentage}%`, c: "text-emerald-600 dark:text-emerald-400" },
            { l: "Grade", v: data.grade, c: "text-amber-600 dark:text-amber-400" },
          ].map((s, i) => (
            <motion.div key={s.l} initial={{ opacity: 0, y: 10 }} animate={visible ? { opacity: 1, y: 0 } : {}} transition={{ delay: animate ? 0.35 + i * 0.08 : 0, duration: 0.45 }} className="py-2.5 px-1">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">{s.l}</p>
              <p className={`text-base sm:text-lg font-extrabold tabular-nums ${s.c}`}>{s.v}</p>
            </motion.div>
          ))}
        </div>

        {/* Subject rows — one at a time, 0.045s stagger */}
        {data.subjects.length > 0 && (
          <div className="mt-4 space-y-1.5 text-left">
            {data.subjects.map((s, i) => {
              const pct = s.total > 0 ? Math.round((s.obtained / s.total) * 100) : 0;
              return (
                <motion.div key={s.name} initial={{ opacity: 0, x: -12 }} animate={visible ? { opacity: 1, x: 0 } : {}} transition={{ delay: animate ? 0.75 + i * 0.045 : 0, duration: 0.4 }}
                  className="flex items-center gap-2.5">
                  <span className="text-[11.5px] text-foreground w-24 shrink-0 truncate font-medium" title={s.name}>{s.name}</span>
                  <div className="flex-1 bg-secondary rounded-full h-1.5 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={visible ? { width: `${Math.min(pct, 100)}%` } : {}}
                      transition={{ delay: animate ? 0.85 + i * 0.045 : 0, duration: 0.55, ease: "easeOut" }}
                      className={`h-full rounded-full ${pct < 33 ? "bg-gradient-to-r from-rose-500 to-rose-400" : "bg-gradient-to-r from-emerald-600 to-teal-400"}`}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-foreground w-14 text-right tabular-nums shrink-0">{s.obtained}/{s.total}</span>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Mode chooser — two beautiful tiles + sound toggle + skip ────────────────
const ChooseStage = ({ name, onPick, onSkip, soundOn, setSoundOn }: {
  name: string; onPick: (m: "theater" | "scratch") => void; onSkip: () => void;
  soundOn: boolean; setSoundOn: (v: boolean) => void;
}) => (
  <div className="w-[min(92vw,430px)]">
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
      className="bg-card rounded-3xl border border-border shadow-2xl overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-[#E3B341] to-transparent" />
      <div className="px-6 pt-7 pb-6 text-center">
        <div className="flex justify-center"><Crest size={58} glow="none" /></div>
        <h3 className="mt-3 font-heading font-extrabold text-xl text-foreground">
          {name.split(" ")[0]}, your result is ready
        </h3>
        <p className="text-xs text-muted-foreground mt-1">Pick how you want to see it — or skip straight to the card.</p>

        <div className="mt-5 grid grid-cols-2 gap-3">
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
        </div>

        {/* Sound toggle — muted by default */}
        <button onClick={() => setSoundOn(!soundOn)}
          className={`mt-4 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[11px] font-semibold transition-colors ${soundOn ? "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300" : "bg-secondary border-border text-muted-foreground"}`}>
          {soundOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          Drumbeat {soundOn ? "on" : "off (muted by default)"}
        </button>

        <div className="mt-4">
          <button onClick={onSkip} className="text-xs font-semibold text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors">
            Skip — show my result directly
          </button>
        </div>
      </div>
    </motion.div>
  </div>
);

// ── THE GRAND REVEAL — velvet curtain lift ──────────────────────────────────
const TheaterStage = ({ data, play, onDone }: {
  data: RevealResultData; play: (k: "roll" | "hit") => void; onDone: () => void;
}) => {
  // idle → curtain closed · lifting → animating up · revealed → card live
  const [phase, setPhase] = useState<"idle" | "lifting" | "revealed">("idle");

  useEffect(() => {
    const t1 = setTimeout(() => { setPhase("lifting"); play("roll"); }, 900);
    const t2 = setTimeout(() => { setPhase("revealed"); play("hit"); }, 900 + 3900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [play]);

  const revealed = phase === "revealed";

  return (
    <div className="relative w-[min(92vw,430px)] flex flex-col items-center">
      {/* Summary card underneath (revealed by the curtain) */}
      <SummaryCard data={data} mode={revealed ? "animate" : "hidden"} />

      {revealed && (
        <motion.button onClick={onDone} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4 }}
          className="mt-5 inline-flex items-center gap-2 rounded-2xl px-6 py-3 font-bold text-sm text-white shadow-lg transition-transform hover:-translate-y-0.5"
          style={{ background: "linear-gradient(135deg, hsl(160 45% 16%), hsl(160 40% 24%))" }}>
          View Full Result Card <ArrowDown className="w-4 h-4" />
        </motion.button>
      )}

      {/* ── The curtain ── */}
      {!revealed && (
        <motion.div
          initial={{ y: 0 }}
          animate={{ y: phase === "lifting" ? "-103%" : "0%" }}
          transition={{ duration: 3.9, ease: [0.65, 0, 0.35, 1] }}
          className="absolute inset-0 z-30 rounded-3xl overflow-hidden"
          style={{ boxShadow: "0 30px 60px -20px rgba(0,0,0,0.5)" }}
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
            <p className="mt-1 text-[11px] text-white/55">{data.examLabel} · Class {data.className}</p>
            <motion.p initial={{ opacity: 0.4 }} animate={{ opacity: [0.4, 0.9, 0.4] }} transition={{ repeat: Infinity, duration: 1.6 }}
              className="mt-5 text-[10px] tracking-[0.25em] uppercase text-white/60">
              Presenting your result
            </motion.p>
          </div>
        </motion.div>
      )}
    </div>
  );
};

// ── SCRATCH & SHINE — canvas foil with pointer erase ────────────────────────
const ScratchStage = ({ data, play, onDone }: {
  data: RevealResultData; play: (k: "roll" | "hit") => void; onDone: () => void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const drawing = useRef(false);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  const checkedRef = useRef(false);
  const [done, setDone] = useState(false);

  const complete = useCallback(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    setDone(true);
    play("hit");
    setTimeout(onDone, 900); // let the fade + sweep breathe, then show CTA
  }, [play, onDone]);

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

  const eraseAt = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const r = 24;
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

  const checkProgress = () => {
    const canvas = canvasRef.current;
    if (!canvas || checkedRef.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let clear = 0, total = 0;
    for (let i = 3; i < img.length; i += 4 * 24) { total++; if (img[i] === 0) clear++; }
    if (total > 0 && clear / total > 0.55) complete();
  };

  return (
    <div className="relative w-[min(92vw,430px)] flex flex-col items-center">
      <div ref={wrapRef} className="relative rounded-3xl">
        <SummaryCard data={data} mode="static" celebrate={done} />
        {/* Foil layer */}
        <canvas
          ref={canvasRef}
          onPointerDown={e => { if (done) return; drawing.current = true; lastPt.current = null; e.currentTarget.setPointerCapture(e.pointerId); const p = pos(e); eraseAt(p.x, p.y); }}
          onPointerMove={e => { if (!drawing.current || done) return; const p = pos(e); eraseAt(p.x, p.y); }}
          onPointerUp={() => { drawing.current = false; lastPt.current = null; checkProgress(); }}
          onPointerLeave={() => { if (drawing.current) { drawing.current = false; lastPt.current = null; checkProgress(); } }}
          className="absolute inset-0 z-20 rounded-3xl transition-opacity duration-700"
          style={{ touchAction: "none", cursor: done ? "default" : "grab", opacity: done ? 0 : 1, width: "100%", height: "100%" }}
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

// ── Main overlay ────────────────────────────────────────────────────────────
const ResultRevealOverlay = ({ open, onClose, data }: Props) => {
  const [stage, setStage] = useState<Stage>("choose");
  const [soundOn, setSoundOn] = useState(false);
  const play = useDrumbeat(soundOn);
  const reduced = useRef(false);

  // Reset + reduced-motion routing each time the overlay opens
  useEffect(() => {
    if (open) {
      reduced.current = prefersReducedMotion();
      setStage(reduced.current ? "summary" : "choose");
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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          style={{ background: "radial-gradient(circle at 50% 38%, rgba(10,36,27,0.88), rgba(4,14,10,0.94))" }}
          role="dialog" aria-modal="true" aria-label="Result reveal"
        >
          {/* Close */}
          <button onClick={onClose} aria-label="Close reveal"
            className="absolute top-4 right-4 z-40 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors">
            <X className="w-5 h-5" />
          </button>

          <AnimatePresence mode="wait">
            {stage === "choose" && (
              <motion.div key="choose" exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.25 }}>
                <ChooseStage
                  name={data.studentName}
                  soundOn={soundOn} setSoundOn={setSoundOn}
                  onPick={m => setStage(m)}
                  onSkip={() => setStage("summary")}
                />
              </motion.div>
            )}
            {stage === "theater" && (
              <motion.div key="theater" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                <TheaterStage data={data} play={play} onDone={() => setStage("summary")} />
              </motion.div>
            )}
            {stage === "scratch" && (
              <motion.div key="scratch" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                <ScratchStage data={data} play={play} onDone={() => setStage("summary")} />
              </motion.div>
            )}
            {stage === "summary" && (
              <motion.div key="summary" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                <SummaryStage data={data} onDone={onClose} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ResultRevealOverlay;
