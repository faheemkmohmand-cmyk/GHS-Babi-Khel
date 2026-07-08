import { m, useScroll, useTransform, useInView } from "framer-motion";
import { useRef, useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Bell, Users, GraduationCap,
  Trophy, ChevronRight, Microscope, FileText, Laptop,
  BookOpen, Sparkles, BarChart3, Calendar, Image,
  Star, Award, Heart, MapPin, Phone, Mail, Clock,
  Shield, Zap, Globe, Lightbulb, School, RefreshCw,
  Volume2, BookMarked, X as XIcon
} from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import { useSchoolSettings, safeMediaUrl } from "@/hooks/useSchoolSettings";
import { useNotices } from "@/hooks/useNotices";
import { useNews } from "@/hooks/useNews";
import { useTeachers } from "@/hooks/useTeachers";
import { useAchievements } from "@/hooks/useAchievements";
import { useCountUp } from "@/hooks/useCountUp";
import { useTypingAnimation } from "@/hooks/useTypingAnimation";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import NewsTicker from "@/components/shared/NewsTicker";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import DailyQuoteCard from "@/components/shared/DailyQuoteCard";
import WeatherWidget from "@/components/shared/WeatherWidget";
import QuranHadithWidget from "@/components/shared/QuranHadithWidget";
import { useAdmissionSettings } from "@/hooks/useAdmission";

/* ─── Animation variants ─── */
const stagger = {
  parent: { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } },
  child: {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
  },
};

const sectionFadeUp = {
  hidden: { opacity: 0, y: 60 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] as const } },
};

/* ─── ScrollReveal ─── */
function ScrollReveal({ children, delay = 0, direction = "up" }: {
  children: React.ReactNode; delay?: number; direction?: "up" | "down" | "left" | "right";
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <m.div ref={ref}
      initial={{ opacity: 0, y: direction === "up" ? 50 : direction === "down" ? -50 : 0, x: direction === "left" ? 50 : direction === "right" ? -50 : 0 }}
      animate={isInView ? { opacity: 1, y: 0, x: 0 } : {}}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
    >{children}</m.div>
  );
}

/* ─── Animated counter ─── */
function useCountUpAnim(end: number, isInView: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!isInView) return;
    const duration = 2000;
    const startTime = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(end * ease));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [end, isInView]);
  return count;
}
function AnimCounter({ value, suffix = "", isInView }: { value: number; suffix?: string; isInView: boolean }) {
  const c = useCountUpAnim(value, isInView);
  return <>{c}{suffix}</>;
}

/* ─── CountUp Stat (stats bar) ─── */
const CountStat = ({ value, label, suffix = "" }: { value: number; label: string; suffix?: string }) => {
  const { count, ref } = useCountUp(value);
  return (
    <div ref={ref} className="text-center px-4 py-3">
      <div className="text-3xl md:text-4xl font-heading font-extrabold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">{count}{suffix}</div>
      <div className="text-xs uppercase tracking-widest text-muted-foreground mt-1 font-medium">{label}</div>
    </div>
  );
};

/* ─── Reusable section header ─── */
const SectionHeader = ({ eyebrow, title, subtitle, center = true }: { eyebrow: string; title: string; subtitle?: string; center?: boolean }) => (
  <div className={`mb-10 ${center ? "text-center" : ""}`}>
    <span className="eyebrow">{eyebrow}</span>
    <h2 className="section-title">{title}</h2>
    {subtitle && <p className="section-subtitle">{subtitle}</p>}
  </div>
);

/* ─── Features data ─── */
const features = [
  { icon: BookOpen,    title: "Quality Curriculum", desc: "Comprehensive KPK board-aligned syllabus with modern teaching methods." },
  { icon: Trophy,      title: "Top Results",         desc: "Consistently achieving 98%+ pass rate across all classes." },
  { icon: GraduationCap, title: "Expert Teachers",  desc: "Qualified and experienced faculty dedicated to student success." },
  { icon: Laptop,      title: "Digital Library",     desc: "Access past papers, notes, and study material online anytime." },
  { icon: Microscope,  title: "Science Labs",        desc: "Fully equipped labs for practical learning in Physics, Chemistry & Biology." },
  { icon: FileText,    title: "Online Notes",        desc: "Downloadable class notes and assignments for every subject." },
];

const TYPING_WORDS = ["Excellence in Education", "Nurturing Future Leaders", "Quality Learning Since 2018", "District Mohmand's Pride", "Building Tomorrow Today"];

/* ─── Toppers query ─── */
function useSchoolToppers() {
  return useQuery({
    queryKey: ["home-school-toppers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("class, exam_type, year, obtained_marks, total_marks, percentage, grade, position, students(full_name, roll_number, photo_url)")
        .eq("is_published", true)
        .order("year", { ascending: false })
        .order("percentage", { ascending: false });
      if (error) throw error;
      const byClass: Record<string, any> = {};
      for (const r of (data ?? [])) { if (!byClass[r.class]) byClass[r.class] = r; }
      return Object.values(byClass).sort((a, b) => Number(a.class) - Number(b.class));
    },
    staleTime: 10 * 60 * 1000, gcTime: 30 * 60 * 1000, placeholderData: [],
  });
}

/* ─── Free Dictionary API types ─── */
interface DictPhonetic { text?: string; audio?: string; }
interface DictDefinition { definition: string; example?: string; synonyms: string[]; }
interface DictMeaning { partOfSpeech: string; definitions: DictDefinition[]; }
interface DictEntry { word: string; phonetics: DictPhonetic[]; meanings: DictMeaning[]; }

/* ─── Dictionary data — lazy-loaded from /public/dict.json ───────────────
 * Previously a ~8 KB `LOCAL_DICT` array was inlined in this file, which meant
 * every visitor to the home page paid for it in the JS bundle even if they
 * never reached the "Word of the Day" section or triggered a double-click
 * lookup. It is now fetched on demand from /public/dict.json (browser HTTP
 * cache handles repeat visits) and held in module-scope singletons.
 */
let _dictCache: DictEntry[] | null = null;
let _dictMapCache: Record<string, DictEntry> | null = null;
let _dictPromise: Promise<DictEntry[] | null> | null = null;

function loadDict(): Promise<DictEntry[] | null> {
  if (_dictCache) return Promise.resolve(_dictCache);
  if (_dictPromise) return _dictPromise;
  _dictPromise = fetch("/dict.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((data: DictEntry[] | null) => {
      if (data && Array.isArray(data)) {
        _dictCache = data;
        _dictMapCache = Object.fromEntries(data.map((e) => [e.word, e]));
      }
      return _dictCache;
    })
    .catch(() => null);
  return _dictPromise;
}

/** Async equivalent of the old `getTodayEntry()` — returns null if the
 *  dictionary hasn't loaded yet (or failed to load). Callers should
 *  render nothing / a skeleton until the promise resolves. */
async function getTodayEntry(): Promise<DictEntry | null> {
  const dict = await loadDict();
  if (!dict || dict.length === 0) return null;
  const start = new Date(new Date().getFullYear(), 0, 0);
  const diff = Number(new Date()) - Number(start);
  const dayOfYear = Math.floor(diff / 86400000);
  return dict[dayOfYear % dict.length];
}

/** Try the local dictionary first, then fall back to the live API for
 *  words that aren't in our curated set. */
async function lookupWord(word: string): Promise<DictEntry | null> {
  const w = word.toLowerCase().trim();
  // Make sure the local dict is loaded before checking it.
  await loadDict();
  const local = _dictMapCache?.[w];
  if (local) return local;
  // Live API for words not in local dict
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data[0] ? data[0] : null;
  } catch { return null; }
}

/* ─── Global double-click definition popup ─── */
function GlobalDefinitionPopup() {
  const [popup, setPopup] = useState<{ word: string; x: number; y: number; entry: DictEntry | null; loading: boolean } | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = async (e: MouseEvent) => {
      if (e.detail !== 2) return;

      // ── Scope guard (fix for 2.1) ──────────────────────────────────────
      // Never trigger the dictionary popup when the double-click happens
      // inside an editable element. This includes native form controls,
      // contenteditable regions (TipTap, Lexical, plain divs), and any
      // element explicitly opted out via `[data-no-dict]`. Also bail out
      // while a modal/dialog is open so the lookup doesn't steal focus
      // or stack on top of an overlapping dialog.
      const target = e.target as Element | null;
      if (target) {
        const editable = target.closest(
          'input, textarea, select, ' +
          '[contenteditable=""], [contenteditable="true"], ' +
          '[role="textbox"], ' +
          '[data-no-dict]'
        );
        if (editable) return;
        // Skip if a shadcn/radix dialog or sheet is currently open.
        if (document.querySelector('[role="dialog"][data-state="open"], [role="presentation"][data-state="open"]')) {
          return;
        }
      }

      const sel = window.getSelection();
      const raw = sel?.toString().trim();
      if (!raw || raw.length < 2 || raw.length > 40 || /\s/.test(raw)) return;
      const word = raw.replace(/[^a-zA-Z'-]/g, "");
      if (!word) return;
      const x = Math.min(e.clientX, window.innerWidth - 280);
      const y = e.clientY + window.scrollY;
      setPopup({ word, x, y, entry: null, loading: true });
      const entry = await lookupWord(word);
      setPopup((prev) => prev && prev.word === word ? { ...prev, entry, loading: false } : prev);
    };
    document.addEventListener("dblclick", handler);
    return () => document.removeEventListener("dblclick", handler);
  }, []);

  useEffect(() => {
    if (!popup) return;
    const close = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) setPopup(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [popup]);

  if (!popup) return null;

  const audioUrl = popup.entry?.phonetics.find((p) => p.audio && p.audio.startsWith("http"))?.audio;
  const phonetic = popup.entry?.phonetics.find((p) => p.text)?.text;
  const meaning = popup.entry?.meanings[0];
  const def = meaning?.definitions[0];

  const speakPopupWord = () => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(popup.word);
    utter.lang = "en-US"; utter.rate = 0.85;
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find(v => v.lang.startsWith("en") && !v.name.includes("Google")) || voices.find(v => v.lang.startsWith("en"));
    if (v) utter.voice = v;
    window.speechSynthesis.speak(utter);
  };

  return (
    <div
      ref={popupRef}
      style={{ position: "absolute", top: popup.y + 14, left: popup.x, zIndex: 99999, maxWidth: 280 }}
      className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-primary/80 px-4 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <BookMarked className="w-3.5 h-3.5 text-white shrink-0" />
          <span className="font-black text-white text-sm truncate capitalize">{popup.word}</span>
          {phonetic && <span className="text-white/70 text-[11px] font-mono shrink-0">{phonetic}</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={speakPopupWord} className="p-1 rounded-full hover:bg-white/20 text-white transition-colors" title="Hear pronunciation">
              <Volume2 className="w-3.5 h-3.5" />
            </button>
          <button onClick={() => setPopup(null)} className="p-1 rounded-full hover:bg-white/20 text-white transition-colors">
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {/* Body */}
      <div className="p-3 text-xs space-y-1.5">
        {popup.loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-2">
            <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Looking up…
          </div>
        ) : !popup.entry ? (
          <p className="text-muted-foreground py-1">No definition found for "{popup.word}".</p>
        ) : (
          <>
            {meaning && <span className="text-[10px] font-bold uppercase tracking-wider text-primary/80 bg-primary/10 px-2 py-0.5 rounded-full">{meaning.partOfSpeech}</span>}
            {def && <p className="text-foreground leading-relaxed mt-1">{def.definition}</p>}
            {def?.example && <p className="text-muted-foreground italic">"{def.example}"</p>}
            {def?.synonyms && def.synonyms.length > 0 && (
              <p className="text-muted-foreground">
                <span className="font-semibold text-foreground">Synonyms:</span> {def.synonyms.slice(0, 3).join(", ")}
              </p>
            )}
          </>
        )}
        <p className="text-[9px] text-muted-foreground/50 pt-0.5 border-t border-border">Double-click any word for definition</p>
      </div>
    </div>
  );
}

/* ─── Word of the Day section ─── */
function WordOfDaySection() {
  // getTodayEntry() is now async (dict is lazy-loaded from /dict.json).
  // Hold the entry in state and render nothing until it resolves — this
  // avoids blocking first paint with the 8 KB dictionary payload.
  const [todayEntry, setTodayEntry] = useState<DictEntry | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [activeMeaning, setActiveMeaning] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getTodayEntry().then((entry) => {
      if (!cancelled && entry) setTodayEntry(entry);
    });
    return () => { cancelled = true; };
  }, []);

  // Preload voices on mount (Chrome needs a gesture or small delay)
  useEffect(() => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
  }, []);

  // Today's date label
  const todayLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  // Until the dictionary file has loaded, render nothing. The section
  // will pop in within ~50–100 ms on a warm cache and is below the fold
  // for most visitors anyway.
  if (!todayEntry) return null;

  const phonetic = todayEntry.phonetics.find((p) => p.text)?.text ?? null;
  const meaning = todayEntry.meanings[activeMeaning];

  // Web Speech API — works on every device, no network, no key, no blocked domains
  const speakWord = () => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(todayEntry.word);
    utter.lang = "en-US";
    utter.rate = 0.85;
    utter.pitch = 1;
    // Pick a natural English voice if available
    const voices = window.speechSynthesis.getVoices();
    const enVoice = voices.find(v => v.lang.startsWith("en") && !v.name.includes("Google")) || voices.find(v => v.lang.startsWith("en"));
    if (enVoice) utter.voice = enVoice;
    utter.onstart = () => setSpeaking(true);
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utter);
  };

  return (
    <m.section
      initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }}
      variants={sectionFadeUp}
      className="section-y cv-auto"
    >
      <div className="container mx-auto px-4">
        <ScrollReveal>
          <SectionHeader
            eyebrow="English Learning"
            title="Word of the Day"
            subtitle="Build your English vocabulary — one word at a time. Tap the speaker to hear pronunciation."
          />
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <div className="max-w-2xl mx-auto">
            <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-card">

              {/* Top banner */}
              <div className="bg-gradient-to-r from-primary via-primary to-primary/80 px-5 py-5">
                {/* Date badge row — top right */}
                <div className="flex justify-end mb-3">
                  <span className="text-[11px] bg-white/20 text-white px-3 py-1.5 rounded-full font-bold border border-white/25 flex items-center gap-1.5">
                    📅 {todayLabel}
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  {/* Speaker button — Web Speech API, always works */}
                  <button
                    onClick={speakWord}
                    title="Tap to hear pronunciation"
                    className={`w-14 h-14 rounded-2xl flex-shrink-0 flex items-center justify-center transition-all duration-200 shadow-lg
                      bg-white/20 hover:bg-white/35 active:scale-95 cursor-pointer
                      ${speaking ? "ring-4 ring-white/60 bg-white/30" : ""}`}
                  >
                    <Volume2 className={`w-7 h-7 text-white ${speaking ? "animate-pulse" : ""}`} />
                  </button>

                  {/* Word + phonetic — font scales down for long words */}
                  <div className="flex-1 min-w-0">
                    <h3
                      className={`font-black text-white capitalize leading-tight ${
                        todayEntry.word.length > 10
                          ? "text-2xl"
                          : todayEntry.word.length > 7
                          ? "text-3xl"
                          : "text-4xl"
                      }`}
                    >
                      {todayEntry.word}
                    </h3>
                    {phonetic && (
                      <p className="text-white/75 text-sm font-mono mt-1">{phonetic}</p>
                    )}
                    <p className="text-white/55 text-[11px] mt-1 flex items-center gap-1">
                      <Volume2 className="w-3 h-3" /> Tap speaker to hear pronunciation
                    </p>
                  </div>
                </div>
              </div>

              {/* Part-of-speech tabs */}
              {todayEntry.meanings.length > 1 && (
                <div className="flex gap-1.5 px-5 pt-4 flex-wrap">
                  {todayEntry.meanings.map((m, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveMeaning(i)}
                      className={`px-3 py-1 rounded-full text-[11px] font-bold transition-colors ${
                        activeMeaning === i
                          ? "bg-primary text-white"
                          : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                      }`}
                    >
                      {m.partOfSpeech}
                    </button>
                  ))}
                </div>
              )}

              {/* Definitions */}
              {meaning && (
                <div className="px-5 py-4 space-y-3">
                  {meaning.definitions.slice(0, 3).map((def, i) => (
                    <div key={i} className={`${i > 0 ? "border-t border-border/50 pt-3" : ""}`}>
                      <div className="flex gap-3">
                        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <p className="text-sm text-foreground leading-relaxed">{def.definition}</p>
                          {def.example && (
                            <p className="text-xs text-muted-foreground italic bg-secondary/50 rounded-lg px-3 py-1.5">
                              <span className="not-italic font-semibold text-primary/80">Example:</span> "{def.example}"
                            </p>
                          )}
                          {def.synonyms.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {def.synonyms.slice(0, 4).map((s) => (
                                <span key={s} className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">{s}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Footer hint */}
              <div className="px-5 pb-4">
                <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-xl px-4 py-2.5 flex items-center gap-2">
                  <BookMarked className="w-4 h-4 text-indigo-500 shrink-0" />
                  <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                    <span className="font-bold">Pro tip:</span> Double-click any English word on this website to instantly see its definition!
                  </p>
                </div>
              </div>

              <div className="px-5 pb-3">
                <p className="text-[9px] text-muted-foreground/40 text-center">
                  A new word every day · Pronunciation via your device's built-in speech engine
                </p>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </m.section>
  );
}

/* ─── Toppers section ─── */
const TopperSection = () => {
  const { data: toppers = [], isLoading } = useSchoolToppers();
  if (!isLoading && toppers.length === 0) return null;
  const gradients = [
    "from-[#0c4a6e] via-[#0369a1] to-[#0ea5e9]", "from-[#075985] via-[#0284c7] to-[#38bdf8]",
    "from-[#0c4a6e] via-[#0e7490] to-[#22d3ee]",  "from-[#1e3a8a] via-[#1d4ed8] to-[#3b82f6]",
    "from-primary-dark via-primary to-primary-light",
  ];
  return (
    <m.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionFadeUp} className="section-y cv-auto">
      <div className="container mx-auto px-4">
        <ScrollReveal><SectionHeader eyebrow="Hall of Fame" title="School Rank #1 Students" subtitle="Position 1 holders from latest published exam results — per class" /></ScrollReveal>
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 max-w-5xl mx-auto">
            {[...Array(5)].map((_, i) => <div key={i} className="h-52 rounded-3xl bg-muted animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 max-w-5xl mx-auto">
            {toppers.map((t, i) => {
              const name = (t.students as any)?.full_name || "Top Student";
              const photoUrl = (t.students as any)?.photo_url || null;
              const initials = (name || "?").split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
              return (
                <m.div key={i} initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                  transition={{ delay: i * 0.08, type: "spring", stiffness: 200, damping: 20 }} whileHover={{ y: -5, scale: 1.03 }}>
                  <div className={`relative rounded-3xl overflow-hidden shadow-xl bg-gradient-to-b ${gradients[i % gradients.length]}`}>
                    <div className="relative flex flex-col items-center pt-7 pb-3 px-3">
                      <div className="text-xl mb-1 drop-shadow">👑</div>
                      {photoUrl
                        ? <img src={photoUrl} alt={name} className="w-16 h-16 rounded-full object-cover border-4 border-white/50 shadow-lg" />
                        : <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm border-4 border-white/40 flex items-center justify-center text-2xl font-black text-white shadow-lg">{initials}</div>
                      }
                      <div className="absolute top-3 right-3 bg-white/20 backdrop-blur-sm rounded-full px-2 py-0.5 text-[9px] font-black text-white border border-white/30">#1</div>
                    </div>
                    <div className="bg-black/20 backdrop-blur-sm mx-2 mb-2 rounded-2xl p-2.5 text-center">
                      <h3 className="text-xs font-black text-white leading-tight line-clamp-1">{name}</h3>
                      <p className="text-[9px] text-white/70 mt-0.5">Class {t.class}</p>
                      <div className="flex items-center justify-center gap-1.5 mt-2">
                        <div className="bg-white/20 rounded-lg px-2 py-0.5"><span className="text-xs font-black text-white">{Number(t.percentage || 0).toFixed(0)}%</span></div>
                        <div className="bg-white/20 rounded-lg px-2 py-0.5"><span className="text-xs font-black text-white">{t.grade || "A+"}</span></div>
                      </div>
                      <p className="text-[8px] text-white/50 mt-1">{t.exam_type} · {t.year}</p>
                    </div>
                  </div>
                </m.div>
              );
            })}
          </div>
        )}
        <div className="text-center mt-8">
          <Link to="/results" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
            View Full Merit List <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </m.section>
  );
};

/* ══════════════════════════════════
   MAIN HOME COMPONENT
══════════════════════════════════ */
const Home = () => {
  const { scrollY } = useScroll();
  const heroContentY = useTransform(scrollY, [0, 500], [0, 120]);
  const heroOpacity  = useTransform(scrollY, [0, 350], [1, 0]);

  const statsRef    = useRef(null);
  const statsInView = useInView(statsRef, { once: true, margin: "-100px" });

  const { data: settings,          isLoading: settingsLoading }      = useSchoolSettings();
  const { data: notices = [],      isLoading: noticesLoading }        = useNotices(4);
  const { data: news = [],         isLoading: newsLoading }           = useNews(3);
  const { data: teachers = [],     isLoading: teachersLoading }       = useTeachers(4);
  const { data: achievements = [], isLoading: achievementsLoading }   = useAchievements(3);
  const { data: admSettings }                                          = useAdmissionSettings();

  // Treat admissions as closed if last_date has already passed, even if DB is_open=true
  // (mirrors the same fix applied on /admission so both pages always agree)
  const isAdmissionEffectivelyOpen = (() => {
    if (!admSettings?.is_open) return false;
    if (!admSettings.last_date) return true;
    return new Date(admSettings.last_date) >= new Date(new Date().toDateString());
  })();

  // Track if banner image failed to load — show fallback bg instead of broken icon
  const [bannerFailed, setBannerFailed] = useState(false);
  // Reset banner failed state when URL changes
  useEffect(() => { setBannerFailed(false); }, [settings?.banner_url]);

  // Theme-aware hero styles — reads the class/data-theme on <html> reactively
  const [resolvedTheme, setResolvedTheme] = useState<string>(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.getAttribute("data-theme") ||
        (document.documentElement.classList.contains("dark") ? "dark" : "light");
    }
    return "light";
  });
  useEffect(() => {
    const html = document.documentElement;
    const update = () => {
      const dt = html.getAttribute("data-theme");
      if (dt) { setResolvedTheme(dt); return; }
      setResolvedTheme(html.classList.contains("dark") ? "dark" : "light");
    };
    const obs = new MutationObserver(update);
    obs.observe(html, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => obs.disconnect();
  }, []);
  const isDark = resolvedTheme === "dark";
  const heroOverlay = isDark
    ? "bg-gradient-to-b from-black/45 via-black/35 to-black/55"
    : "bg-gradient-to-b from-black/30 via-black/20 to-black/40";
  const heroBadgeBg   = "bg-white/20 border border-white/30 text-white";
  const heroTextColor = "text-white";
  const heroSubColor  = isDark ? "text-white/90" : "text-white/95";
  const heroDescColor = isDark ? "text-white/80" : "text-white/90";
  const heroCursorColor = "bg-white/80";
  const heroLearnMoreBtn = isDark
    ? "bg-white/20 backdrop-blur-sm border border-white/30 text-white hover:bg-white/30"
    : "bg-white/30 backdrop-blur-sm border border-white/50 text-white hover:bg-white/40";
  const heroStatCard = isDark
    ? "bg-white/15 backdrop-blur-md border border-white/20"
    : "bg-black/20 backdrop-blur-md border border-white/20";

  const { displayed } = useTypingAnimation({ words: TYPING_WORDS, typingSpeed: 70, deletingSpeed: 35, pauseTime: 2500 });
  const schoolName = settings?.school_name || "GHS Babi Khel";
  const { displayed: displayedSchoolName } = useTypingAnimation({ words: [schoolName], typingSpeed: 90, deletingSpeed: 45, pauseTime: 3500 });

  return (
    <>
    <PageLayout>

      {/* ══ 1. NEWS TICKER ══ */}
      <NewsTicker />

      {/* ══ 2. HERO ══ */}
      <section id="hero-section" className="relative min-h-[88vh] flex items-center overflow-hidden">

        {/* ── Background banner image (full section) ── */}
        {settings?.banner_url && !bannerFailed ? (
          <img
            src={safeMediaUrl(settings.banner_url)!}
            alt="School campus"
            className="absolute inset-0 w-full h-full object-cover object-center"
            loading="eager"
            decoding="async"
            fetchPriority="high"
            onError={() => setBannerFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary-dark via-primary to-primary-light" />
        )}

        {/* ── Dark gradient overlay so text stays readable ── */}
        <div className={`absolute inset-0 ${heroOverlay}`} />

        {/* ── Foreground content ── */}
        <m.div style={{ y: heroContentY, opacity: heroOpacity }} className="container mx-auto px-4 relative z-10 py-20 md:py-24">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            <m.div initial="hidden" animate="visible" variants={stagger.parent} className="max-w-2xl">
              <m.div variants={stagger.child}>
                <span className={`inline-flex items-center gap-2 ${heroBadgeBg} backdrop-blur-sm rounded-full px-4 py-1.5 text-sm shadow-sm`}>
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  Est. {settings?.established_year || 2018} · EMIS {settings?.emis_code || "60673"}
                </span>
              </m.div>
              <m.h1 variants={stagger.child} className={`mt-6 text-4xl md:text-6xl lg:text-7xl font-heading font-extrabold leading-[0.95] min-h-[1em] ${heroTextColor} drop-shadow-lg`}>
                {displayedSchoolName}
                <span className={`inline-block w-1 h-[0.85em] ${heroCursorColor} ml-1 align-middle`} style={{ animation: "blink 1s step-end infinite" }} />
              </m.h1>
              <m.h2 variants={stagger.child} className={`mt-4 text-xl md:text-2xl font-heading font-semibold ${heroSubColor} min-h-[2rem] drop-shadow`}>
                {displayed}
                <span className={`inline-block w-0.5 h-6 ${heroCursorColor} ml-1 align-middle`} style={{ animation: "blink 1s step-end infinite" }} />
                <style>{`@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }`}</style>
              </m.h2>
              <m.p variants={stagger.child} className={`mt-5 text-base md:text-lg ${heroDescColor} max-w-xl leading-relaxed`}>
                {settings?.description || "Government High School Babi Khel is committed to providing quality education and nurturing the future leaders of Pakistan."}
              </m.p>
              <m.div variants={stagger.child} className="mt-8 flex flex-wrap gap-4">
                <Link to="/results">
                  <m.button whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
                    className="inline-flex items-center gap-2 bg-primary text-white font-semibold px-7 py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all duration-200">
                    View Results <ArrowRight className="w-4 h-4" />
                  </m.button>
                </Link>
                <Link to="/auth/signin">
                  <m.button whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
                    className="inline-flex items-center gap-2 bg-accent text-accent-foreground font-semibold px-7 py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all duration-200">
                    Student Portal
                  </m.button>
                </Link>
                <Link to="/about">
                  <m.button whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
                    className={`inline-flex items-center gap-2 ${heroLearnMoreBtn} font-semibold px-7 py-3.5 rounded-xl shadow-sm transition-all duration-200`}>
                    Learn More
                  </m.button>
                </Link>
              </m.div>
            </m.div>

            {/* Stats cards on desktop right column */}
            <m.div ref={statsRef} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4, duration: 0.6 }} className="hidden lg:grid grid-cols-2 gap-3">
              {[
                { icon: Users,         label: "Students",    value: settings?.total_students   || 500,  suffix: "+" },
                { icon: GraduationCap, label: "Teachers",    value: settings?.total_teachers   || 25,   suffix: "+" },
                { icon: Trophy,        label: "Pass Rate",   value: settings?.pass_percentage  || 98,   suffix: "%" },
                { icon: BookOpen,      label: "Established", value: settings?.established_year || 2018, suffix: ""  },
              ].map((stat, i) => (
                <m.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + i * 0.1 }}
                  className={`${heroStatCard} rounded-2xl p-4 shadow-sm`}>
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-2">
                    <stat.icon className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-2xl font-bold text-white"><AnimCounter value={stat.value} suffix={stat.suffix} isInView={statsInView} /></p>
                  <p className="text-xs text-white/70 mt-1 font-medium">{stat.label}</p>
                </m.div>
              ))}
            </m.div>
          </div>
        </m.div>
      </section>

      {/* ══ 3. STATS BAR ══ */}
      <m.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }} variants={sectionFadeUp} className="relative z-20 -mt-10">
        <div className="container mx-auto px-4">
          <div className="bg-card rounded-2xl shadow-elevated p-4 md:p-7 grid grid-cols-2 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-border">
            {settingsLoading ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2 py-3 px-4"><Skeleton className="h-9 w-20" /><Skeleton className="h-3 w-16" /></div>
            )) : (
              <>
                <CountStat value={settings?.total_students  || 500} suffix="+" label="Students" />
                <CountStat value={settings?.total_teachers  || 25}  suffix="+" label="Teachers" />
                <CountStat value={settings?.pass_percentage || 98}  suffix="%" label="Pass Rate" />
                <CountStat value={settings?.established_year || 2018}            label="Established" />
                <CountStat value={10}                                             label="Highest Class" />
              </>
            )}
          </div>
        </div>
      </m.section>

      {/* ══ 4. SUBJECTS MARQUEE ══ */}
      <section className="py-5 bg-background overflow-hidden border-y border-border mt-16">
        <div className="relative flex overflow-hidden">
          <div className="flex gap-8 shrink-0" style={{ animation: "marqueeScroll 28s linear infinite", willChange: "transform" }}>
            {["📐 Mathematics","⚡ Physics","🧪 Chemistry","🌿 Biology","📖 English","✍️ Urdu","🗺️ Pakistan Studies","☪️ Islamiyat","💻 Computer Science",
              "📐 Mathematics","⚡ Physics","🧪 Chemistry","🌿 Biology","📖 English","✍️ Urdu","🗺️ Pakistan Studies","☪️ Islamiyat","💻 Computer Science"]
              .map((s, i) => {
                const [emoji, ...rest] = s.split(" ");
                return (
                  <div key={i} className="flex items-center gap-2 shrink-0 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm">
                    <span className="text-lg">{emoji}</span>
                    <span className="text-sm font-semibold text-foreground whitespace-nowrap">{rest.join(" ")}</span>
                  </div>
                );
              })}
          </div>
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-background to-transparent z-10" />
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-background to-transparent z-10" />
        </div>
        <style>{`@keyframes marqueeScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>
      </section>

      {/* ══ 6. WHY CHOOSE US ══ */}
      <m.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionFadeUp} className="section-y bg-background cv-auto">
        <div className="container mx-auto px-4">
          <ScrollReveal><SectionHeader eyebrow="Our Strengths" title="Why Choose Us" subtitle="We provide a comprehensive educational experience that nurtures young minds" /></ScrollReveal>
          <m.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger.parent} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, idx) => (
              <ScrollReveal key={f.title} delay={idx * 0.08}>
                <m.div variants={stagger.child} whileHover={{ y: -8, scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="group bg-card rounded-2xl p-6 shadow-card hover:shadow-elevated transition-all duration-300 border border-transparent hover:border-primary/20 h-full">
                  <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-md">
                    <f.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-heading font-semibold text-foreground text-lg">{f.title}</h3>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{f.desc}</p>
                </m.div>
              </ScrollReveal>
            ))}
          </m.div>
        </div>
      </m.section>

      {/* ══ 8. WORD OF THE DAY ══ */}
      <WordOfDaySection />

      {/* ══ 8b. SCHOOL TOPPERS ══ */}
      <TopperSection />

      {/* ══ 9. LATEST NOTICES ══ */}
      <m.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionFadeUp} className="section-y bg-background cv-auto">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-10">
            <ScrollReveal direction="left"><div><span className="eyebrow">Stay Updated</span><h2 className="section-title">Latest Notices</h2></div></ScrollReveal>
            <ScrollReveal direction="right" delay={0.1}><Link to="/notices" className="text-sm font-semibold text-primary hover:underline flex items-center gap-1">View All <ChevronRight className="w-4 h-4" /></Link></ScrollReveal>
          </div>
          <div className="space-y-3">
            {noticesLoading ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl p-5 flex gap-4"><Skeleton className="h-16 w-1 rounded-full shrink-0" /><div className="flex-1 space-y-2"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-3 w-1/3" /></div></div>
            )) : notices.length === 0
              ? <div className="bg-card rounded-xl p-8 text-center text-muted-foreground shadow-card">No notices published yet.</div>
              : notices.map((notice) => (
                <m.div key={notice.id} initial={{ opacity: 0, x: -12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} whileHover={{ x: 6 }}
                  className="bg-card rounded-xl p-5 flex gap-4 shadow-card hover:shadow-elevated transition-all duration-200 cursor-pointer group">
                  <div className={`w-1 rounded-full shrink-0 ${notice.is_urgent ? "bg-destructive" : "bg-primary"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-heading font-semibold text-foreground truncate">{notice.title}</h3>
                      {notice.is_urgent && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-destructive/10 text-destructive shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" /> Urgent
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{format(new Date(notice.created_at), "dd MMM yyyy")} · {notice.category}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 self-center" />
                </m.div>
              ))}
          </div>
        </div>
      </m.section>

      {/* ══ 10. LATEST NEWS ══ */}
      <m.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionFadeUp} className="section-y cv-auto bg-background">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-10">
            <div><span className="eyebrow">What's Happening</span><h2 className="section-title">Latest News</h2></div>
            <Link to="/news" className="text-sm font-semibold text-primary hover:underline flex items-center gap-1">All News <ChevronRight className="w-4 h-4" /></Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {newsLoading ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-card rounded-2xl overflow-hidden shadow-card"><Skeleton className="h-48 w-full" /><div className="p-5 space-y-2"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-3 w-1/2" /></div></div>
            )) : news.map((item) => (
              <m.div key={item.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                className="bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-elevated transition-all duration-300 group">
                <div className="h-48 overflow-hidden bg-secondary">
                  {item.image_url
                    ? <img src={item.image_url} alt={item.title} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    : <div className="w-full h-full bg-muted flex items-center justify-center"><Bell className="w-10 h-10 text-primary/40" /></div>
                  }
                </div>
                <div className="p-5">
                  <p className="text-xs text-muted-foreground mb-2">{format(new Date(item.created_at), "dd MMM yyyy")}</p>
                  <h3 className="font-heading font-semibold text-foreground line-clamp-2">{item.title}</h3>
                  {item.content && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{item.content}</p>}
                  <Link to="/news" className="inline-flex items-center gap-1 text-sm font-medium text-primary mt-3 hover:gap-2 transition-all">Read More <ArrowRight className="w-3.5 h-3.5" /></Link>
                </div>
              </m.div>
            ))}
          </div>
        </div>
      </m.section>

      {/* ══ 11. TEACHERS ══ */}
      <m.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionFadeUp} className="section-y bg-background cv-auto">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-10">
            <div><span className="eyebrow">Our Faculty</span><h2 className="section-title">Meet Our Teachers</h2></div>
            <Link to="/teachers" className="text-sm font-semibold text-primary hover:underline flex items-center gap-1">All Teachers <ChevronRight className="w-4 h-4" /></Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {teachersLoading ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card rounded-2xl p-6 text-center shadow-card"><Skeleton className="w-20 h-20 rounded-full mx-auto mb-4" /><Skeleton className="h-5 w-2/3 mx-auto mb-2" /><Skeleton className="h-3 w-1/2 mx-auto" /></div>
            )) : teachers.map((teacher) => (
              <m.div key={teacher.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} whileHover={{ y: -8 }}
                className="bg-card rounded-2xl p-6 text-center shadow-card hover:shadow-elevated transition-all duration-300 group">
                {teacher.photo_url
                  ? <img src={teacher.photo_url} alt={teacher.full_name} loading="lazy" decoding="async" className="w-20 h-20 rounded-full mx-auto mb-4 object-cover ring-4 ring-secondary group-hover:ring-primary/30 transition-all" />
                  : <div className="w-20 h-20 rounded-full mx-auto mb-4 bg-primary flex items-center justify-center text-white text-xl font-heading font-bold">{teacher.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}</div>
                }
                <h3 className="font-heading font-semibold text-foreground">{teacher.full_name}</h3>
                {teacher.subject       && <p className="text-sm text-primary font-medium mt-1">{teacher.subject}</p>}
                {teacher.qualification && <p className="text-xs text-muted-foreground mt-1">{teacher.qualification}</p>}
              </m.div>
            ))}
          </div>
        </div>
      </m.section>

      {/* ══ 11b. QURAN · HADITH · 99 NAMES ══ */}
      <m.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionFadeUp} className="section-y bg-background cv-auto">
        <div className="container mx-auto px-4 max-w-2xl">
          <ScrollReveal>
            <SectionHeader
              eyebrow="Islamic Wisdom"
              title="Daily Quran & Hadith"
              subtitle="Verse of the Day, authentic Hadith, and the 99 Beautiful Names of Allah"
            />
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <QuranHadithWidget />
          </ScrollReveal>
        </div>
      </m.section>

      {/* ══ 12. ACHIEVEMENTS ══ */}
      <m.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionFadeUp} className="section-y cv-auto">
        <div className="container mx-auto px-4">
          <ScrollReveal><SectionHeader eyebrow="Our Pride" title="Achievements" /></ScrollReveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {achievementsLoading ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-card rounded-2xl p-6 shadow-card"><Skeleton className="w-12 h-12 rounded-xl mb-4" /><Skeleton className="h-5 w-3/4 mb-2" /><Skeleton className="h-3 w-1/2" /></div>
            )) : achievements.map((a) => (
              <m.div key={a.id} initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
                className="bg-card rounded-2xl p-6 shadow-card hover:shadow-elevated transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-warning/15 flex items-center justify-center mb-4"><Trophy className="w-6 h-6 text-warning" /></div>
                <h3 className="font-heading font-semibold text-foreground">{a.title}</h3>
                {a.student_name && <p className="text-sm text-primary font-medium mt-1">{a.student_name}{a.class && ` · Class ${a.class}`}</p>}
                {a.description  && <p className="text-sm text-muted-foreground mt-2">{a.description}</p>}
              </m.div>
            ))}
          </div>
        </div>
      </m.section>

      {/* ══ 13. DAILY QUOTE + WEATHER (side-by-side) ══ */}
      <m.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionFadeUp} className="section-y bg-background cv-auto">
        <div className="container mx-auto px-4 max-w-4xl">
          <ScrollReveal><SectionHeader eyebrow="Daily Inspiration" title="Thought of the Day" /></ScrollReveal>
          <div className="grid md:grid-cols-2 gap-6 items-start">
            <DailyQuoteCard />
            <WeatherWidget />
          </div>
        </div>
      </m.section>

      {/* ══ 15. ADMISSION / FINAL CTA ══ */}
      <m.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionFadeUp} className="section-y cv-auto relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <m.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} className="absolute top-0 left-0 w-96 h-96 bg-primary/5 rounded-full -translate-x-1/2 -translate-y-1/2" />
          <m.div animate={{ scale: [1.2, 1, 1.2] }} transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }} className="absolute bottom-0 right-0 w-96 h-96 bg-accent/5 rounded-full translate-x-1/2 translate-y-1/2" />
        </div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="bg-card border border-border rounded-3xl p-10 md:p-16 text-center relative overflow-hidden shadow-card">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />
            <ScrollReveal>
              <div className="relative z-10">
                {isAdmissionEffectivelyOpen ? (
                  <>
                    {/* Admissions OPEN */}
                    <div className="inline-flex items-center gap-2 bg-primary/5 text-foreground border border-primary/15 text-sm font-bold px-4 py-2 rounded-full mb-5">
                      <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                      Admissions Open — Session {admSettings.session_year}
                    </div>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold text-foreground mb-4 leading-tight">
                      Apply for Admission{" "}
                      <span className="text-[#C96B3B]">Today</span>
                    </h2>
                    {admSettings.last_date && (
                      <p className="text-muted-foreground text-base mb-3">
                        Last Date:{" "}
                        <span className="font-bold text-foreground">
                          {new Date(admSettings.last_date).toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" })}
                        </span>
                      </p>
                    )}
                    <p className="text-muted-foreground text-base mb-8 max-w-xl mx-auto">
                      {admSettings.banner_message ?? "Classes 6 to 10 — Fresh admissions and migration cases welcome. Apply online in minutes."}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                      <Link to="/admission">
                        <m.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
                          className="w-full sm:w-auto px-10 py-5 bg-primary text-white rounded-2xl font-bold shadow-md flex items-center justify-center gap-2 text-lg">
                          Apply Now <ArrowRight className="w-5 h-5" />
                        </m.button>
                      </Link>
                      <Link to="/admission">
                        <m.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
                          className="w-full sm:w-auto px-10 py-5 bg-accent text-accent-foreground rounded-2xl font-semibold border border-accent/30 hover:bg-accent/90 transition-all flex items-center justify-center gap-2 text-lg">
                          Track Application
                        </m.button>
                      </Link>
                    </div>
                    {/* Quick category links */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-8 max-w-2xl mx-auto">
                      {[
                        { label: "Class 6–8", icon: BookOpen },
                        { label: "Class 9",   icon: School },
                        { label: "Migration", icon: RefreshCw },
                        { label: "Track",     icon: GraduationCap },
                      ].map(item => (
                        <Link key={item.label} to="/admission">
                          <div className="bg-muted hover:bg-muted border border-border rounded-xl py-2.5 px-3 flex items-center gap-2 text-foreground text-xs font-semibold transition-all cursor-pointer">
                            <item.icon className="w-3.5 h-3.5 shrink-0" />
                            {item.label}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    {/* Admissions CLOSED — show portal CTA */}
                    <m.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} className="inline-block mb-4">
                      <Heart className="w-8 h-8 text-primary/60 mx-auto" />
                    </m.div>
                    <div className="inline-flex items-center gap-2 bg-primary/5 text-foreground border border-primary/15 text-sm font-medium px-4 py-2 rounded-full mb-6">
                      <Heart className="w-4 h-4" /> Join Our Community
                    </div>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold text-foreground mb-6 leading-tight">
                      Ready to Begin Your{" "}
                      <span className="text-[#C96B3B]">Educational Journey?</span>
                    </h2>
                    <p className="text-muted-foreground text-lg mb-10 max-w-2xl mx-auto">
                      Access your student portal to view results, attendance, timetables, and stay connected with your academic progress.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                      <Link to="/auth/signin">
                        <m.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
                          className="w-full sm:w-auto px-10 py-5 bg-primary text-white rounded-2xl font-bold shadow-md flex items-center justify-center gap-2 text-lg">
                          Sign In to Portal <ArrowRight className="w-5 h-5" />
                        </m.button>
                      </Link>
                      <Link to="/results">
                        <m.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
                          className="w-full sm:w-auto px-10 py-5 bg-accent text-accent-foreground rounded-2xl font-semibold border border-accent/30 hover:bg-accent/90 transition-all flex items-center justify-center gap-2 text-lg">
                          Check Results
                        </m.button>
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </ScrollReveal>
          </div>
        </div>
      </m.section>

      {/* ══ 16. ABOUT PREVIEW ══ */}
      <m.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionFadeUp} className="section-y cv-auto relative overflow-hidden bg-background">
        <div className="absolute inset-0 opacity-30 pointer-events-none overflow-hidden">
          <m.div animate={{ rotate: 360 }}  transition={{ duration: 60, repeat: Infinity, ease: "linear" }} className="absolute -top-20 -right-20 w-80 h-80 rounded-full border-4 border-border" />
          <m.div animate={{ rotate: -360 }} transition={{ duration: 80, repeat: Infinity, ease: "linear" }} className="absolute -bottom-20 -left-20 w-96 h-96 rounded-full border-4 border-border" />
        </div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <ScrollReveal direction="left">
              <div className="text-foreground">
                <span className="inline-block bg-card text-foreground border border-border text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full mb-4">About Us</span>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold mb-6 leading-tight">Building Future Leaders Since {settings?.established_year || 2018}</h2>
                <p className="text-muted-foreground text-lg leading-relaxed mb-8">
                  {settings?.description || "Government High School Babi Khel has been serving the community of District Mohmand with dedication and excellence. We believe in nurturing every student's potential through quality education and modern teaching methodologies."}
                </p>
                <div className="grid sm:grid-cols-2 gap-4 mb-8">
                  {[
                    { icon: MapPin, text: settings?.address || "Babi Khel, District Mohmand, KPK" },
                    { icon: Phone,  text: settings?.phone   || "+92 XXX XXXXXXX" },
                    { icon: Mail,   text: settings?.email   || "info@ghsbabikhel.edu.pk" },
                    { icon: Clock,  text: "Mon-Fri, 8:00 AM - 3:00 PM" },
                  ].map((item, i) => (
                    <m.div key={i} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                      className="flex items-center gap-3 bg-card rounded-xl p-3 border border-border">
                      <div className="w-10 h-10 rounded-lg bg-primary/5 flex items-center justify-center shrink-0"><item.icon className="w-5 h-5 text-primary" /></div>
                      <span className="text-sm text-muted-foreground">{item.text}</span>
                    </m.div>
                  ))}
                </div>
                <Link to="/about">
                  <m.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }} className="px-8 py-4 bg-primary text-white rounded-2xl font-bold shadow-md flex items-center gap-2">
                    Learn More About Us <ArrowRight className="w-5 h-5" />
                  </m.button>
                </Link>
              </div>
            </ScrollReveal>
            <ScrollReveal direction="right" delay={0.2}>
              <div className="relative">
                <div className="aspect-square rounded-3xl bg-card border border-border p-2 shadow-xl">
                  <div className="w-full h-full rounded-2xl bg-muted flex items-center justify-center overflow-hidden">
                    <GraduationCap className="w-40 h-40 text-primary/20" />
                  </div>
                </div>
                <m.div animate={{ y: [0, -10, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} className="absolute -bottom-6 -left-6 bg-card rounded-2xl shadow-2xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-lg"><Star className="w-6 h-6 text-white" /></div>
                    <div><p className="text-2xl font-black text-foreground">{settings?.pass_percentage || 98}%</p><p className="text-xs text-muted-foreground font-medium">Pass Rate</p></div>
                  </div>
                </m.div>
                <m.div animate={{ y: [0, 10, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} className="absolute -top-4 -right-4 bg-card rounded-2xl shadow-2xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg"><Award className="w-6 h-6 text-white" /></div>
                    <div><p className="text-2xl font-black text-foreground">A+</p><p className="text-xs text-muted-foreground font-medium">Board Results</p></div>
                  </div>
                </m.div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </m.section>

    </PageLayout>
    <GlobalDefinitionPopup />
    </>
  );
};

export default Home;
