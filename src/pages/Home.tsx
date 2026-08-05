import { m, useScroll, useTransform, useInView } from "framer-motion";
import { useRef, useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Bell, Users, GraduationCap,
  Trophy, ChevronRight, Microscope,
  BookOpen, Sparkles, BarChart3, Calendar, Image,
  Star, Award, Heart, MapPin, Phone, Mail,
  Shield, Zap, Globe, Lightbulb, School, RefreshCw,
  Volume2, BookMarked, X as XIcon, Clock, ExternalLink
} from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import { useSchoolSettings, safeMediaUrl, optimizedCloudinaryUrl } from "@/hooks/useSchoolSettings";
import { useNotices } from "@/hooks/useNotices";
import { useNews } from "@/hooks/useNews";
import type { NewsItem } from "@/hooks/useNews";
import { useTeachers } from "@/hooks/useTeachers";
import { useAchievements } from "@/hooks/useAchievements";
import { useCountUp } from "@/hooks/useCountUp";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import NewsTicker from "@/components/shared/NewsTicker";
import { estimateReadingTime, detectTextLanguage } from "@/lib/newsUtils";
import EditorialNewsCard from "@/components/shared/EditorialNewsCard";
import EditorialNoticeCard from "@/components/shared/EditorialNoticeCard";
import TextToSpeechPlayer from "@/components/shared/TextToSpeechPlayer";
import type { Notice } from "@/hooks/useNotices";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import DailyQuoteCard from "@/components/shared/DailyQuoteCard";
import { useAdmissionSettings } from "@/hooks/useAdmission";
import AIAssistantWidget from "@/components/shared/AIAssistantWidget";

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
  { icon: Microscope,  title: "Science Labs",        desc: "Fully equipped labs for practical learning in Physics, Chemistry & Biology." },
];


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

/* ─── Word of the Day — 100% online via /api/word-of-day ──────────────────
 * The browser makes a SINGLE same-origin call to /api/word-of-day, which
 * is a Vercel serverless function that does the heavy lifting:
 *
 *   1. Wordnik's curated "word of the day"  (highest quality)
 *   2. Wordnik's previous-day word looked up in Free Dictionary
 *   3. Datamuse word picker + Free Dictionary lookup (last-resort fallback)
 *
 * Each upstream is tried in order; the first one that returns a real
 * word + definition + example wins. The chosen entry is cached on the
 * server for the rest of the day (PKT timezone), so every visitor sees
 * the same word, the lookup is instant, and we never hammer the APIs.
 *
 * Why server-side, not browser-side?
 *   • The project's CSP `connect-src` only whitelists `self` + a small
 *     list of approved domains — api.datamuse.com and api.dictionaryapi.dev
 *     are NOT on it, so browser fetch() to them was silently blocked,
 *     which is why the homepage always showed "Could not load today's
 *     word. Please check your connection."
 *   • The school's region has intermittent connectivity to those APIs;
 *     routing through Vercel's edge keeps it fast and reliable.
 *
 * NO offline fallback, NO built-in word list, NO guessing. If the API
 * genuinely can't be reached, the section renders the existing
 * "Could not load today's word — Retry" UI (and the Retry button just
 * re-calls the same endpoint).
 * ──────────────────────────────────────────────────────────────────────── */
async function getTodayEntry(): Promise<DictEntry | null> {
  try {
    const res = await fetch("/api/word-of-day", {
      method: "GET",
      headers: { Accept: "application/json" },
      // 10s client-side cap so the UI never hangs forever.
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error(`[WordOfDay] /api/word-of-day returned HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (!data || data.ok !== true || !data.word || !Array.isArray(data.meanings) || data.meanings.length === 0) {
      console.error("[WordOfDay] /api/word-of-day returned an empty/invalid body:", data);
      return null;
    }
    // The API returns the same shape as DictEntry (`word`, `phonetics`,
    // `meanings`) so the rest of the component needs no changes.
    return data as DictEntry;
  } catch (err) {
    console.error("[WordOfDay] /api/word-of-day fetch failed:", err);
    return null;
  }
}

/** Look up a word's definition via our /api/word-of-day?word=... proxy.
 *  Same-origin call → no CSP issues, no region blocks. */
async function lookupWord(word: string): Promise<DictEntry | null> {
  const w = word.toLowerCase().trim();
  if (!w) return null;
  try {
    const res = await fetch(
      `/api/word-of-day?word=${encodeURIComponent(w)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.ok !== true || !data.word) return null;
    return data as DictEntry;
  } catch {
    return null;
  }
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
  // getTodayEntry() fetches a word live from the online dictionary API.
  // Hold the entry in state and render nothing until it resolves.
  const [todayEntry, setTodayEntry] = useState<DictEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [activeMeaning, setActiveMeaning] = useState(0);

  const fetchEntry = useCallback(() => {
    setLoading(true);
    setError(false);
    let cancelled = false;
    getTodayEntry().then((entry) => {
      if (!cancelled) {
        if (entry) {
          setTodayEntry(entry);
        } else {
          setError(true);
        }
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setError(true);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const cleanup = fetchEntry();
    return cleanup;
  }, [fetchEntry]);

  // Preload voices on mount (Chrome needs a gesture or small delay)
  useEffect(() => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
  }, []);

  // Today's date label
  const todayLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  // Show loading or error state while fetching from online API
  if (loading) {
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
              subtitle="Build your English vocabulary — one word at a time."
            />
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <div className="max-w-2xl mx-auto">
              <div className="bg-card border border-gold/40 rounded-3xl overflow-hidden shadow-card">
                <div className="bg-gradient-to-r from-primary via-primary to-primary/80 px-5 py-8">
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span className="text-white/80 text-sm font-medium">Loading today's word…</span>
                  </div>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </m.section>
    );
  }

  if (error || !todayEntry) {
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
              subtitle="Build your English vocabulary — one word at a time."
            />
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <div className="max-w-2xl mx-auto">
              <div className="bg-card border border-gold/40 rounded-3xl overflow-hidden shadow-card">
                <div className="bg-gradient-to-r from-primary via-primary to-primary/80 px-5 py-8">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <span className="text-white/80 text-sm font-medium">Could not load today's word. Please check your connection.</span>
                    <button
                      onClick={fetchEntry}
                      className="inline-flex items-center gap-2 bg-white/20 hover:bg-white/35 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" /> Retry
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </m.section>
    );
  }

  const phonetic = todayEntry.phonetics?.find((p) => p.text)?.text ?? null;
  const meaning = todayEntry.meanings?.[activeMeaning] ?? todayEntry.meanings?.[0];

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
            <div className="bg-card border border-gold/40 rounded-3xl overflow-hidden shadow-card">

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
              {(todayEntry.meanings?.length ?? 0) > 1 && (
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
                          {def.synonyms?.length > 0 && (
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
      </div>
    </m.section>
  );
};

/* ─── BISE Peshawar live result banner ───────────────────────────────────
 * Pulls the current exam title + any pre-announcement countdown from
 * /api/bisep-proxy?mode=current (hourly poll, edge-cached 1h).
 *
 *   • LIVE state      → green gradient card, "Result is LIVE" pill,
 *                       CTA links to /results.
 *   • COUNTDOWN state → amber gradient card with a ticking countdown
 *                       to BISEP's announced publish date.
 *   • SILENT state    → no banner (proxy failed or returned nothing
 *                       useful; the page already has static "View
 *                       Results" CTAs in the hero + footer sections).
 *
 * The banner only renders when there's something to say — it never
 * clutters the homepage with an empty / loading state.
 * ────────────────────────────────────────────────────────────────────── */
function BisepCountdownText({ targetDate }: { targetDate: string }) {
  const [text, setText] = useState("");
  useEffect(() => {
    const calc = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) { setText("Publishing now…"); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (d > 0) setText(`${d}d ${h}h ${m}m ${s}s`);
      else if (h > 0) setText(`${h}h ${m}m ${s}s`);
      else setText(`${m}m ${s}s`);
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [targetDate]);
  return <span className="font-mono font-bold tracking-wider">{text}</span>;
}

// ── Client-side auto-publish trigger ────────────────────────────────────────
// Fires the instant a homepage visitor's countdown reaches zero, instead of
// waiting for the Vercel Cron's next scheduled tick. Safe to call from any
// browser: it can only flip rows whose `publish_at` has ALREADY passed, so
// calling it early, repeatedly, or from an unauthenticated client does nothing
// harmful.
//
// TWO-PATH PUBLISH (fixes "Publishing now… then nothing happens"):
//   1. Serverless endpoint  — POST /api/auto-publish-results. Uses the
//      Supabase service role key if SUPABASE_SERVICE_ROLE_KEY is set on
//      Vercel, which bypasses RLS and works for anonymous visitors. If that
//      env var is NOT set, the endpoint falls back to the anon key, which
//      RLS blocks from UPDATE-ing `results` — so it returns
//      published_count=0 and publishes nothing.
//   2. Direct supabase UPDATE from the browser — runs whenever path #1
//      published 0 rows. Uses the current visitor's supabase session, so it
//      works for any authenticated admin (RLS allows admin UPDATE on
//      results). For anonymous visitors it silently updates 0 rows (no
//      harm). This is the path that actually publishes the result when an
//      admin has the homepage open in any tab — even if the serverless
//      function isn't configured with a service role key.
let homeAutoPublishInFlight = false;
async function triggerHomeAutoPublish(): Promise<boolean> {
  if (homeAutoPublishInFlight) return false;
  homeAutoPublishInFlight = true;
  try {
    // ── Path 1: serverless endpoint ──
    let publishedCount = 0;
    try {
      const r = await fetch("/api/auto-publish-results", { method: "POST" });
      if (r.ok) {
        const data = await r.json().catch(() => null);
        if (data?.ok) publishedCount = data.published_count ?? 0;
      }
    } catch { /* network error — fall through to direct update */ }

    // ── Path 2: direct browser UPDATE (fallback when #1 published 0) ──
    // Only matched rows whose publish_at is in the past AND is_published is
    // still false get flipped — same narrow filter as the serverless
    // endpoint, so this is safe to run from any browser.
    if (publishedCount === 0) {
      const nowIso = new Date().toISOString();
      const { data: updated, error } = await supabase
        .from("results")
        .update({ is_published: true, publish_at: null })
        .eq("is_published", false)
        .not("publish_at", "is", null)
        .lte("publish_at", nowIso)
        .select("id");
      if (!error && Array.isArray(updated)) {
        publishedCount = updated.length;
      }
    }

    return publishedCount > 0;
  } catch {
    return false;
  } finally {
    homeAutoPublishInFlight = false;
  }
}

// ── School's own result countdown / live state ───────────────────────────
// Mirrors the exact logic already used on /results (useHasPublishedSchoolResults
// + the scheduled-result-publishes query in Results.tsx) so the homepage,
// the /results page, and the admin panel all agree on one source of truth:
// the `results` table's is_published / publish_at columns.
//
//   • If the school has published results (any row is_published = true) →
//     show a LIVE "View Result" banner and hide BISE Peshawar entirely.
//   • Else if the school has an active countdown (publish_at in the future
//     on unpublished rows) → show ONE countdown card for it (grouped by
//     publish_at, same as /results) and hide BISE Peshawar.
//   • Else (no school result, no schedule) → fall back to the BISE
//     Peshawar banner, same as before.
function useHasPublishedSchoolResults() {
  return useQuery<boolean>({
    queryKey: ["has-published-school-results"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("results")
        .select("id", { count: "exact", head: true })
        .eq("is_published", true);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

interface ScheduledGroup { publish_at: string; exam_type: string; year: number; classes: string[]; }

function useSchoolScheduledPublish() {
  return useQuery<ScheduledGroup[]>({
    queryKey: ["scheduled-result-publishes-raw"],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("results")
        .select("class, exam_type, year, publish_at")
        .eq("is_published", false)
        .not("publish_at", "is", null)
        .gt("publish_at", now)
        .order("publish_at", { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) return [];
      // Group by publish_at so "All Classes At Once" schedules collapse
      // into ONE countdown instead of one per class.
      const byPublishAt = new Map<string, ScheduledGroup>();
      for (const r of data) {
        const key = r.publish_at as string;
        if (!byPublishAt.has(key)) {
          byPublishAt.set(key, { publish_at: key, exam_type: r.exam_type, year: r.year, classes: [r.class] });
        } else {
          const g = byPublishAt.get(key)!;
          if (!g.classes.includes(r.class)) g.classes.push(r.class);
        }
      }
      // Sort classes on a COPY, never in place — mutating a React Query
      // cache entry's array with .sort() during render is what caused the
      // homepage "Something went wrong" crash (React detects the mutated
      // cached reference changing shape mid-render and throws).
      return Array.from(byPublishAt.values())
        .map(g => ({ ...g, classes: [...g.classes].sort((a, b) => Number(a) - Number(b)) }))
        .sort((a, b) => a.publish_at.localeCompare(b.publish_at));
    },
    refetchInterval: 30000,
    staleTime: 0,
  });
}

// Watches every active schedule and fires the publish trigger the instant
// one reaches zero. Mounted once on the homepage so publishing happens
// immediately for whichever visitor's browser hits zero first, without
// needing anyone to have the admin panel open or waiting for a cron tick.
function useHomeAutoPublishWatcher(schedules: ScheduledGroup[]) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!schedules || schedules.length === 0) return;
    const check = async () => {
      const dueNow = schedules.some(s => new Date(s.publish_at).getTime() <= Date.now());
      if (!dueNow) return;
      const publishedSomething = await triggerHomeAutoPublish();
      if (publishedSomething) {
        qc.invalidateQueries({ queryKey: ["scheduled-result-publishes-raw"] });
        qc.invalidateQueries({ queryKey: ["scheduled-result-publishes"] });
        qc.invalidateQueries({ queryKey: ["has-published-school-results"] });
        qc.invalidateQueries({ queryKey: ["latest-published-exam"] });
        qc.invalidateQueries({ queryKey: ["admin-results"] });
        qc.invalidateQueries({ queryKey: ["home-school-toppers"] });
      }
    };
    check();
    const t = setInterval(check, 3000);
    return () => clearInterval(t);
  }, [schedules, qc]);
}

function SchoolCountdownText({ targetDate }: { targetDate: string }) {
  const [text, setText] = useState("");
  useEffect(() => {
    const calc = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) { setText("Publishing now…"); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (d > 0) setText(`${d}d ${h}h ${m}m ${s}s`);
      else if (h > 0) setText(`${h}h ${m}m ${s}s`);
      else setText(`${m}m ${s}s`);
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [targetDate]);
  return <span className="font-mono font-bold tracking-wider">{text}</span>;
}

// Single homepage countdown card for OUR school's scheduled result. When the
// countdown finishes, useHomeAutoPublishWatcher (above) actively triggers the
// publish via the server endpoint — at that point useHasPublishedSchoolResults()
// becomes true on its next refetch and this card is replaced by the LIVE
// banner below automatically, no page reload needed. The full result set is
// already searchable at /results (indexed for SEO via ResultsSeoContent +
// RouteSEOInjector) the moment is_published flips, so "search any result"
// works immediately once the countdown ends.
function SchoolResultCountdownBanner({ schedule }: { schedule: ScheduledGroup }) {
  const classLabel = schedule.classes.length > 1
    ? `All Classes (${schedule.classes.join(", ")})`
    : `Class ${schedule.classes[0]}`;
  return (
    <section className="container mx-auto px-4 pt-6">
      <m.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl shadow-lg overflow-hidden"
      >
        <div className="flex items-center justify-between gap-4 p-4 sm:p-5 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider opacity-80 font-semibold">
                {classLabel} · {schedule.exam_type} {schedule.year}
              </p>
              <p className="text-base sm:text-lg font-bold">
                <SchoolCountdownText targetDate={schedule.publish_at} />
              </p>
            </div>
          </div>
          <Link
            to="/results"
            className="inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white font-semibold px-4 py-2 rounded-xl transition-colors text-sm shrink-0"
          >
            View Results Page <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </m.div>
    </section>
  );
}

function SchoolResultLiveBanner() {
  // REMOVED per request — the green "School Result is LIVE / Search your
  // result now / Check Result" banner is no longer rendered on the homepage.
  // HomeResultsBanner now returns null when school results are published,
  // so this function is kept only as an explicit no-op marker (and to avoid
  // touching any other code that may have imported it).
  return null;
}

// ── Unified homepage results banner ──────────────────────────────────────
// Decides between: our school's countdown, or (only when no countdown is
// active) the BISE Peshawar banner. This is the single component rendered on
// the homepage — it replaces the old bare `<BisepResultBanner />` which never
// checked school state at all.
//
// NOTE: when the school has PUBLISHED results (is_published=true on any row),
// we now render NOTHING here. The previous green "School Result is LIVE"
// banner was removed per request — the hero section already has a "Check
// Results" CTA that links to /results, so an extra banner was redundant.
function HomeResultsBanner() {
  const hasSchoolResults = useHasPublishedSchoolResults();
  const { data: schedules = [] } = useSchoolScheduledPublish();
  const soonestSchedule = schedules[0]; // already sorted soonest-first

  // Fires the actual publish the instant any active schedule reaches zero —
  // this is the fix for "countdown says Publishing now… then nothing
  // happens": previously nothing on the homepage ever performed the write.
  useHomeAutoPublishWatcher(schedules);

  // Still loading the school-results check — render nothing rather than
  // flashing BISE then swapping it out a moment later.
  if (hasSchoolResults.isLoading) return null;

  // School results already published — render nothing. The green "LIVE"
  // banner used to render here; removed per request. The hero section's
  // "Check Results" button is the single CTA to /results.
  if (hasSchoolResults.data === true) return null;

  // Countdown banner removed per request — no longer rendered on the homepage,
  // even while a schedule is active. (soonestSchedule is intentionally unused now.)
  void soonestSchedule;

  // No school result — fall back to BISE Peshawar.
  return <BisepResultBanner />;
}

// BisepResultBanner: intentionally renders nothing on the homepage.
// The "is LIVE" banner and the orange countdown banner ("Announced on
// <date> · HH:MM:SS") were both removed per request — they were flagged
// as distracting on the homepage. Full live countdown/result detail is
// still shown, undistracted, on the dedicated /results page.
function BisepResultBanner() {
  return null;
}

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

  // News TTS player state — when set, the bottom TTS bar renders & auto-plays
  const [ttsItem, setTtsItem] = useState<{ title: string; content: string } | null>(null);
  const openNewsListen = useCallback((it: NewsItem) => {
    setTtsItem({ title: it.title, content: it.content || it.title });
  }, []);

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
  const hasBannerPhoto = !!(settings?.banner_url && !bannerFailed);
  // The banner photo now renders inside a hexagon badge instead of as a
  // full-bleed background, so hero text/overlay always use the "no photo"
  // (light gradient background) styling regardless of whether a banner exists.
  const heroOverlay = "bg-transparent";
  const heroBadgeBg   = "bg-primary/10 border border-gold/40 text-primary";
  const heroTextColor = "text-primary";
  const heroSubColor  = "text-foreground/80";
  const heroDescColor = "text-muted-foreground";
  const heroCursorColor = "bg-primary/80";
  const heroStatCard = "bg-card border border-gold/30";


  return (
    <>
    <PageLayout>

      {/* ══ 1. NEWS TICKER ══ */}
      <NewsTicker />

      {/* ══ Results banner — school's own countdown/live result, falling
           back to BISE Peshawar only when the school has neither ══ */}
      <HomeResultsBanner />

      {/* ══ 2. HERO ══ */}
      <section id="hero-section" className="relative min-h-[88vh] flex items-center overflow-hidden">

        {/* ── Background: always the plain warm gradient (banner photo no
             longer stretches full-bleed — it now sits in a hexagon badge
             within the content, see below) ── */}
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(43,55%,86%)] via-[hsl(42,50%,90%)] to-[hsl(38,65%,78%)]" />

        {/* ── Dark gradient overlay so text stays readable ── */}
        <div className={`absolute inset-0 ${heroOverlay}`} />

        {/* ── Foreground content ── */}
        <m.div style={{ y: heroContentY, opacity: heroOpacity }} className="container mx-auto px-4 relative z-10 pt-0 pb-20 md:pt-2 md:pb-24">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            <m.div initial="hidden" animate="visible" variants={stagger.parent} className="max-w-2xl relative">

              <m.div variants={stagger.child}>
                <span className={`inline-flex items-center gap-2 ${heroBadgeBg} backdrop-blur-sm rounded-full px-4 py-1.5 text-sm shadow-sm`}>
                  <span className="w-2 h-2 rounded-full bg-gold animate-pulse" />
                  <span className="tracking-wide">Est. {settings?.established_year || 2018} · EMIS {settings?.emis_code || "60673"}</span>
                </span>
              </m.div>
              <m.h1 variants={stagger.child} className={`mt-6 text-5xl md:text-6xl lg:text-7xl font-display font-semibold leading-[1.05] ${heroTextColor} drop-shadow-lg`}>
                Where <span className="text-gold">bright</span><br />
                <span className="text-gold">minds</span> find their<br />
                light.
              </m.h1>
              <m.p variants={stagger.child} className={`mt-5 text-base md:text-lg ${heroDescColor} max-w-xl leading-relaxed`}>
                {settings?.description || "Government High School Babi Khel is committed to providing quality education and nurturing the future leaders of Pakistan."}
              </m.p>

              <m.div variants={stagger.child} className="mt-10 flex flex-wrap gap-4">
                <Link to="/results">
                  <m.button whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
                    className="inline-flex items-center gap-2 bg-primary text-white font-semibold px-7 py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all duration-200">
                    View Results <ArrowRight className="w-4 h-4" />
                  </m.button>
                </Link>
                <Link to="/auth/signin">
                  <m.button whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
                    className="inline-flex items-center gap-2 bg-white text-primary font-semibold px-7 py-3.5 rounded-xl border border-gold shadow-md hover:shadow-lg transition-all duration-200">
                    Student Portal
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
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
                    <stat.icon className="w-5 h-5 text-primary" />
                  </div>
                  <p className="text-2xl font-bold text-foreground"><AnimCounter value={stat.value} suffix={stat.suffix} isInView={statsInView} /></p>
                  <p className="text-xs text-muted-foreground mt-1 font-medium">{stat.label}</p>
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
            {["📐 Mathematics","⚡ Physics","🧪 Chemistry","🌿 Biology","📖 English","✍️ Urdu","🗺️ Pakistan Studies","☪️ Islamiyat","💻 Computer Science","📗 Mutalia Quran","🔬 General Science","🌍 Geography","🏛️ History","🪶 Pashto","🕌 Arabic",
              "📐 Mathematics","⚡ Physics","🧪 Chemistry","🌿 Biology","📖 English","✍️ Urdu","🗺️ Pakistan Studies","☪️ Islamiyat","💻 Computer Science","📗 Mutalia Quran","🔬 General Science","🌍 Geography","🏛️ History","🪶 Pashto","🕌 Arabic"]
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

      {/* ══ 5. CAMPUS BANNER ══
          Full-bleed photo (the admin-uploaded banner_url) with a dark
          gradient overlay fading up from the bottom, an eyebrow label, and a
          large serif headline — matching the reference: "CAMPUS · <LOCATION>"
          above "A place shaped by mountains, made for learners." Sits above
          "Why Choose Us" as requested. Only renders when the admin has
          actually uploaded a banner image. */}
      {settings?.banner_url && !bannerFailed && (
        <m.section
          initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }} variants={sectionFadeUp}
          className="container mx-auto px-4 mt-10 md:mt-14"
        >
          <div className="relative w-full h-[26rem] md:h-[34rem] overflow-hidden rounded-3xl border-2 border-gold/60 shadow-elevated">
            <img
              src={optimizedCloudinaryUrl(settings.banner_url, { width: 1600 })!}
              srcSet={[
                `${optimizedCloudinaryUrl(settings.banner_url, { width: 800 })} 800w`,
                `${optimizedCloudinaryUrl(settings.banner_url, { width: 1200 })} 1200w`,
                `${optimizedCloudinaryUrl(settings.banner_url, { width: 1600 })} 1600w`,
              ].join(", ")}
              sizes="100vw"
              alt="School campus"
              className="absolute inset-0 w-full h-full object-cover object-center"
              loading="lazy"
              decoding="async"
              onError={() => setBannerFailed(true)}
            />
            {/* dark gradient rising from the bottom so the overlaid text stays readable */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
            <div className="absolute inset-0 flex flex-col justify-end">
              <div className="px-6 md:px-10 pb-10 md:pb-14">
                <span className="inline-block text-gold text-xs md:text-sm font-semibold uppercase tracking-[0.2em] mb-3">
                  Campus · Mohmand
                </span>
                <h2 className="font-display text-3xl md:text-5xl lg:text-6xl font-medium text-white leading-tight max-w-2xl">
                  A place shaped by mountains, made for learners.
                </h2>
              </div>
            </div>
          </div>
        </m.section>
      )}

      {/* ══ 6. WHY CHOOSE US ══ */}
      <m.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionFadeUp} className="section-y bg-background cv-auto">
        <div className="container mx-auto px-4">
          <ScrollReveal><SectionHeader eyebrow="Our Strengths" title="Why Choose Us" subtitle="We provide a comprehensive educational experience that nurtures young minds" /></ScrollReveal>
          <m.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger.parent} className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-3xl mx-auto">
            {features.map((f, idx) => (
              <ScrollReveal key={f.title} delay={idx * 0.08}>
                <m.div variants={stagger.child} whileHover={{ y: -8, scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="group bg-card rounded-2xl p-6 shadow-card hover:shadow-elevated transition-all duration-300 border border-gold/40 hover:border-gold h-full">
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
          {/* ── Centered editorial header ── */}
          <div className="mb-10 text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="h-px w-12 bg-gradient-to-r from-transparent to-gold/70" />
              <span className="inline-block w-1.5 h-1.5 rotate-45 bg-gold/80" />
              <span className="h-px w-12 bg-gradient-to-l from-transparent to-gold/70" />
            </div>
            <h2 className="text-3xl md:text-4xl font-display italic font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
              Latest Notices
            </h2>
            <p className="text-muted-foreground mt-3 text-sm max-w-xl mx-auto">
              Official notices and announcements from our school administration.
            </p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <span className="h-px w-16 bg-gradient-to-r from-transparent to-gold/40" />
              <span className="inline-block w-1 h-1 rotate-45 bg-gold/50" />
              <span className="h-px w-16 bg-gradient-to-l from-transparent to-gold/40" />
            </div>
            <Link to="/notices" className="inline-flex items-center gap-1 text-sm font-semibold text-[hsl(348_55%_28%)] hover:gap-2 transition-all mt-4">
              View All Notices <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {noticesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-80 rounded-md" />)}
            </div>
          ) : notices.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-md border border-gold/30">
              <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No notices published yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {notices.map((notice, i) => (
                <EditorialNoticeCard
                  key={notice.id}
                  item={notice}
                  index={i}
                  onListen={(it: Notice, e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setTtsItem({ title: it.title, content: it.content || it.title });
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </m.section>

      {/* ══ 10. EDITORIAL DISPATCH (LATEST NEWS) ══
          PhD-level research-paper-styled news section. All latest stories
          render as uniform compact journal cards in a responsive 1/2/3-col
          grid — no special "featured" treatment, so every dispatch carries
          the same editorial weight. Each card supports an audio "Listen"
          pill that opens the auto-playing TTS bar. Urdu items auto-flip to
          RTL and use the Urdu narration voice. */}
      <m.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionFadeUp} className="section-y cv-auto bg-background">
        <div className="container mx-auto px-4">

          {/* ── Centered editorial header ── */}
          <div className="mb-12 text-center">
            {/* Decorative ornament: rule · diamond · rule */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="h-px w-12 bg-gradient-to-r from-transparent to-gold/70" />
              <span className="inline-block w-1.5 h-1.5 rotate-45 bg-gold/80" />
              <span className="h-px w-12 bg-gradient-to-l from-transparent to-gold/70" />
            </div>
            <h2 className="font-display italic font-semibold text-foreground text-4xl md:text-5xl leading-tight" style={{ fontFamily: "var(--font-display)" }}>
              Latest News
            </h2>
            <p className="text-sm text-muted-foreground mt-3 max-w-xl mx-auto">
              Typeset dispatches from the GHS Babi Khel editorial desk — read on screen or listen, in English or Urdu.
            </p>
            <Link
              to="/news"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[hsl(348_55%_28%)] hover:gap-2 transition-all mt-4"
            >
              View archive <ChevronRight className="w-4 h-4" />
            </Link>
            {/* Bottom decorative ornament */}
            <div className="flex items-center justify-center gap-2 mt-4">
              <span className="h-px w-16 bg-gradient-to-r from-transparent to-gold/40" />
              <span className="inline-block w-1 h-1 rotate-45 bg-gold/50" />
              <span className="h-px w-16 bg-gradient-to-l from-transparent to-gold/40" />
            </div>
          </div>

          {/* ── Body: uniform grid of latest stories (no featured) ── */}
          {newsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-[26rem] rounded-md" />
              ))}
            </div>
          ) : news.length === 0 ? (
            <div className="text-center py-16 bg-card rounded-md border border-gold/30">
              <Bell className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">No dispatches yet — the first article you publish will appear here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {news.map((item, i) => (
                <EditorialNewsCard
                  key={item.id}
                  item={item}
                  index={i}
                  onListen={openNewsListen}
                />
              ))}
            </div>
          )}
        </div>
      </m.section>

      {/* ══ 11. TEACHERS ══ */}
      <m.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionFadeUp} className="section-y bg-background cv-auto">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-10">
            <div><span className="eyebrow">Our Faculty</span><h2 className="section-title">Meet Our Teachers</h2></div>
            <Link to="/teachers" className="text-sm font-semibold text-primary hover:underline flex items-center gap-1">All Teachers <ChevronRight className="w-4 h-4" /></Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
            {teachersLoading ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card rounded-2xl p-4 sm:p-6 text-center shadow-card"><Skeleton className="w-16 h-16 sm:w-20 sm:h-20 rounded-full mx-auto mb-4" /><Skeleton className="h-5 w-2/3 mx-auto mb-2" /><Skeleton className="h-3 w-1/2 mx-auto" /></div>
            )) : teachers.map((teacher) => (
              <m.div key={teacher.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} whileHover={{ y: -8 }}
                className="bg-card rounded-2xl p-4 sm:p-6 text-center shadow-card hover:shadow-elevated transition-all duration-300 group">
                {teacher.photo_url
                  ? <img src={teacher.photo_url} alt={teacher.full_name} loading="lazy" decoding="async" className="w-16 h-16 sm:w-20 sm:h-20 rounded-full mx-auto mb-4 object-cover ring-4 ring-secondary group-hover:ring-primary/30 transition-all" />
                  : <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full mx-auto mb-4 bg-primary flex items-center justify-center text-white text-lg sm:text-xl font-heading font-bold">{teacher.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}</div>
                }
                <h3 className="font-heading font-semibold text-foreground">{teacher.full_name}</h3>
                {teacher.subject       && <p className="text-sm text-primary font-medium mt-1">{teacher.subject}</p>}
                {teacher.qualification && <p className="text-xs text-muted-foreground mt-1">{teacher.qualification}</p>}
              </m.div>
            ))}
          </div>
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

      {/* ══ 13. DAILY QUOTE ══ */}
      <m.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionFadeUp} className="section-y bg-background cv-auto">
        <div className="container mx-auto px-4 max-w-4xl">
          <ScrollReveal><SectionHeader eyebrow="Daily Inspiration" title="Thought of the Day" /></ScrollReveal>
          <DailyQuoteCard />
        </div>
      </m.section>

      {/* ══ 15. ADMISSION / FINAL CTA ══ */}
      <m.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionFadeUp} className="section-y cv-auto relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <m.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} className="absolute top-0 left-0 w-96 h-96 bg-primary/5 rounded-full -translate-x-1/2 -translate-y-1/2" />
          <m.div animate={{ scale: [1.2, 1, 1.2] }} transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }} className="absolute bottom-0 right-0 w-96 h-96 bg-accent/5 rounded-full translate-x-1/2 translate-y-1/2" />
        </div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="bg-card border border-gold/40 rounded-3xl p-10 md:p-16 text-center relative overflow-hidden shadow-card">
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
                <span className="inline-block bg-card text-foreground border border-gold/40 text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full mb-4">About Us</span>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold mb-6 leading-tight">Building Future Leaders Since {settings?.established_year || 2018}</h2>
                <p className="text-muted-foreground text-lg leading-relaxed mb-8">
                  {settings?.description || "Government High School Babi Khel has been serving the community of District Mohmand with dedication and excellence. We believe in nurturing every student's potential through quality education and modern teaching methodologies."}
                </p>
                <div className="grid sm:grid-cols-2 gap-4 mb-8">
                  {[
                    { icon: MapPin, text: settings?.address || "Babi Khel, District Mohmand, KPK" },
                    { icon: Phone,  text: settings?.phone   || "+92 XXX XXXXXXX" },
                    { icon: Mail,   text: settings?.email   || "info@ghsbabikhel.edu.pk" },
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
                <div className="aspect-square rounded-3xl bg-card border border-gold/40 p-2 shadow-xl">
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
    <AIAssistantWidget />

    {/* News TTS bar — auto-plays the moment a "Listen" pill is clicked.
        Language (Urdu / English) is auto-detected from the article text. */}
    {ttsItem && (
      <TextToSpeechPlayer
        text={ttsItem.content}
        title={ttsItem.title}
        onClose={() => setTtsItem(null)}
      />
    )}
    </>
  );
};

export default Home;
