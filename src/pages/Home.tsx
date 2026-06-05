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

/* ─── Fully offline dictionary — no API needed for main card ─── */
const LOCAL_DICT: DictEntry[] = [
  { word:"perseverance", phonetics:[{text:"/ˌpɜːsɪˈvɪərəns/",audio:"https://api.dictionaryapi.dev/media/pronunciations/en/perseverance-us.mp3"}], meanings:[{partOfSpeech:"noun",definitions:[{definition:"Continued effort and determination despite difficulty or delay in achieving success.",example:"Her perseverance paid off when she finally passed the exam.",synonyms:["persistence","tenacity","determination"]}]}] },
  { word:"eloquent", phonetics:[{text:"/ˈɛləkwənt/",audio:""}], meanings:[{partOfSpeech:"adjective",definitions:[{definition:"Fluent and persuasive in speaking or writing.",example:"He gave an eloquent speech that moved the audience.",synonyms:["articulate","expressive","fluent"]}]}] },
  { word:"ambition", phonetics:[{text:"/æmˈbɪʃən/",audio:"https://api.dictionaryapi.dev/media/pronunciations/en/ambition-us.mp3"}], meanings:[{partOfSpeech:"noun",definitions:[{definition:"A strong desire and determination to achieve success.",example:"Her ambition drove her to study harder every day.",synonyms:["drive","determination","aspiration"]}]}] },
  { word:"diligent", phonetics:[{text:"/ˈdɪlɪdʒənt/",audio:""}], meanings:[{partOfSpeech:"adjective",definitions:[{definition:"Having or showing care and effort in your work or duties.",example:"A diligent student always completes homework on time.",synonyms:["hardworking","industrious","thorough"]}]}] },
  { word:"resilience", phonetics:[{text:"/rɪˈzɪliəns/",audio:"https://api.dictionaryapi.dev/media/pronunciations/en/resilience-us.mp3"}], meanings:[{partOfSpeech:"noun",definitions:[{definition:"The ability to recover quickly from difficulties or setbacks.",example:"Resilience helped him overcome every obstacle.",synonyms:["toughness","strength","flexibility"]}]}] },
  { word:"curiosity", phonetics:[{text:"/ˌkjʊərɪˈɒsɪti/",audio:"https://api.dictionaryapi.dev/media/pronunciations/en/curiosity-us.mp3"}], meanings:[{partOfSpeech:"noun",definitions:[{definition:"A strong desire to know or learn something.",example:"The student's curiosity led her to ask many questions.",synonyms:["inquisitiveness","interest","wonder"]}]}] },
  { word:"integrity", phonetics:[{text:"/ɪnˈtɛɡrɪti/",audio:"https://api.dictionaryapi.dev/media/pronunciations/en/integrity-us.mp3"}], meanings:[{partOfSpeech:"noun",definitions:[{definition:"The quality of being honest and having strong moral principles.",example:"A person of integrity never cheats on an exam.",synonyms:["honesty","honour","virtue"]}]}] },
  { word:"knowledge", phonetics:[{text:"/ˈnɒlɪdʒ/",audio:"https://api.dictionaryapi.dev/media/pronunciations/en/knowledge-us.mp3"}], meanings:[{partOfSpeech:"noun",definitions:[{definition:"Facts, information, and skills acquired through experience or education.",example:"Reading books increases your knowledge greatly.",synonyms:["understanding","learning","wisdom"]}]}] },
  { word:"endeavor", phonetics:[{text:"/ɪnˈdɛvər/",audio:""}], meanings:[{partOfSpeech:"noun",definitions:[{definition:"An attempt to achieve a goal, especially a difficult one.",example:"Every endeavor requires hard work and patience.",synonyms:["effort","attempt","undertaking"]}]}] },
  { word:"compassion", phonetics:[{text:"/kəmˈpæʃən/",audio:"https://api.dictionaryapi.dev/media/pronunciations/en/compassion-us.mp3"}], meanings:[{partOfSpeech:"noun",definitions:[{definition:"Sympathetic concern for the sufferings or misfortunes of others.",example:"A good teacher shows compassion towards struggling students.",synonyms:["empathy","sympathy","kindness"]}]}] },
  { word:"achieve", phonetics:[{text:"/əˈtʃiːv/",audio:"https://api.dictionaryapi.dev/media/pronunciations/en/achieve-us.mp3"}], meanings:[{partOfSpeech:"verb",definitions:[{definition:"Successfully reach a desired goal or result by effort, skill, or courage.",example:"You can achieve anything you set your mind to.",synonyms:["accomplish","attain","reach"]}]}] },
  { word:"wisdom", phonetics:[{text:"/ˈwɪzdəm/",audio:"https://api.dictionaryapi.dev/media/pronunciations/en/wisdom-us.mp3"}], meanings:[{partOfSpeech:"noun",definitions:[{definition:"The quality of having experience, knowledge, and good judgement.",example:"Wisdom comes from years of learning and experience.",synonyms:["insight","knowledge","judgement"]}]}] },
  { word:"discipline", phonetics:[{text:"/ˈdɪsɪplɪn/",audio:"https://api.dictionaryapi.dev/media/pronunciations/en/discipline-us.mp3"}], meanings:[{partOfSpeech:"noun",definitions:[{definition:"The practice of training yourself to obey rules and control your behaviour.",example:"Discipline is the key to academic success.",synonyms:["self-control","order","training"]}]}] },
  { word:"inspire", phonetics:[{text:"/ɪnˈspaɪər/",audio:"https://api.dictionaryapi.dev/media/pronunciations/en/inspire-us.mp3"}], meanings:[{partOfSpeech:"verb",definitions:[{definition:"Fill someone with the urge or ability to do or feel something.",example:"A great teacher can inspire students to love learning.",synonyms:["motivate","encourage","stimulate"]}]}] },
  { word:"courage", phonetics:[{text:"/ˈkɜːrɪdʒ/",audio:"https://api.dictionaryapi.dev/media/pronunciations/en/courage-us.mp3"}], meanings:[{partOfSpeech:"noun",definitions:[{definition:"The ability to do something that frightens you; bravery.",example:"It takes courage to admit when you are wrong.",synonyms:["bravery","boldness","fearlessness"]}]}] },
  { word:"brilliant", phonetics:[{text:"/ˈbrɪliənt/",audio:"https://api.dictionaryapi.dev/media/pronunciations/en/brilliant-us.mp3"}], meanings:[{partOfSpeech:"adjective",definitions:[{definition:"Exceptionally clever or talented.",example:"She is a brilliant scientist who made many discoveries.",synonyms:["gifted","talented","intelligent"]}]}] },
  { word:"flourish", phonetics:[{text:"/ˈflɜːrɪʃ/",audio:""}], meanings:[{partOfSpeech:"verb",definitions:[{definition:"Grow or develop in a healthy or vigorous way.",example:"Plants flourish when they receive sunlight and water.",synonyms:["thrive","prosper","bloom"]}]}] },
  { word:"potential", phonetics:[{text:"/pəˈtɛnʃəl/",audio:"https://api.dictionaryapi.dev/media/pronunciations/en/potential-us.mp3"}], meanings:[{partOfSpeech:"noun",definitions:[{definition:"Qualities or abilities that may be developed and lead to future success.",example:"Every student has the potential to excel.",synonyms:["capacity","ability","promise"]}]}] },
  { word:"dedicate", phonetics:[{text:"/ˈdɛdɪkeɪt/",audio:""}], meanings:[{partOfSpeech:"verb",definitions:[{definition:"Devote time, effort, or yourself to a task or purpose.",example:"She dedicated her life to teaching children.",synonyms:["commit","devote","pledge"]}]}] },
  { word:"harmony", phonetics:[{text:"/ˈhɑːrməni/",audio:"https://api.dictionaryapi.dev/media/pronunciations/en/harmony-us.mp3"}], meanings:[{partOfSpeech:"noun",definitions:[{definition:"A state of peaceful agreement and cooperation.",example:"The students worked in harmony to complete the project.",synonyms:["unity","peace","agreement"]}]}] },
  { word:"illuminate", phonetics:[{text:"/ɪˈluːmɪneɪt/",audio:""}], meanings:[{partOfSpeech:"verb",definitions:[{definition:"Make something clear and easier to understand.",example:"A good example can illuminate a difficult concept.",synonyms:["clarify","explain","enlighten"]}]}] },
  { word:"patience", phonetics:[{text:"/ˈpeɪʃəns/",audio:"https://api.dictionaryapi.dev/media/pronunciations/en/patience-us.mp3"}], meanings:[{partOfSpeech:"noun",definitions:[{definition:"The ability to wait calmly without becoming frustrated.",example:"Learning a new skill requires patience and practice.",synonyms:["calmness","tolerance","endurance"]}]}] },
  { word:"triumph", phonetics:[{text:"/ˈtraɪəmf/",audio:"https://api.dictionaryapi.dev/media/pronunciations/en/triumph-us.mp3"}], meanings:[{partOfSpeech:"noun",definitions:[{definition:"A great victory or achievement.",example:"Passing the exam was a personal triumph for him.",synonyms:["victory","success","achievement"]}]}] },
  { word:"grateful", phonetics:[{text:"/ˈɡreɪtfʊl/",audio:"https://api.dictionaryapi.dev/media/pronunciations/en/grateful-us.mp3"}], meanings:[{partOfSpeech:"adjective",definitions:[{definition:"Feeling or showing thanks for something received.",example:"She was grateful for her teacher's help.",synonyms:["thankful","appreciative","obliged"]}]}] },
  { word:"innovate", phonetics:[{text:"/ˈɪnəveɪt/",audio:""}], meanings:[{partOfSpeech:"verb",definitions:[{definition:"Introduce new methods, ideas, or products.",example:"Schools must innovate to keep students engaged.",synonyms:["create","pioneer","invent"]}]}] },
  { word:"scholar", phonetics:[{text:"/ˈskɒlər/",audio:"https://api.dictionaryapi.dev/media/pronunciations/en/scholar-us.mp3"}], meanings:[{partOfSpeech:"noun",definitions:[{definition:"A person who is highly educated or who excels in a particular subject.",example:"He became a respected scholar of mathematics.",synonyms:["academic","intellectual","student"]}]}] },
  { word:"determine", phonetics:[{text:"/dɪˈtɜːrmɪn/",audio:""}], meanings:[{partOfSpeech:"verb",definitions:[{definition:"Decide firmly what you are going to do; resolve.",example:"She determined to finish her homework before dinner.",synonyms:["decide","resolve","commit"]}]}] },
  { word:"ambitious", phonetics:[{text:"/æmˈbɪʃəs/",audio:"https://api.dictionaryapi.dev/media/pronunciations/en/ambitious-us.mp3"}], meanings:[{partOfSpeech:"adjective",definitions:[{definition:"Having a strong desire and determination to succeed.",example:"An ambitious student sets high goals for herself.",synonyms:["driven","motivated","determined"]}]}] },
  { word:"empathy", phonetics:[{text:"/ˈɛmpəθi/",audio:"https://api.dictionaryapi.dev/media/pronunciations/en/empathy-us.mp3"}], meanings:[{partOfSpeech:"noun",definitions:[{definition:"The ability to understand and share the feelings of another person.",example:"Showing empathy makes you a better friend.",synonyms:["understanding","compassion","sensitivity"]}]}] },
  { word:"excellence", phonetics:[{text:"/ˈɛksələns/",audio:"https://api.dictionaryapi.dev/media/pronunciations/en/excellence-us.mp3"}], meanings:[{partOfSpeech:"noun",definitions:[{definition:"The quality of being outstanding or extremely good.",example:"The school is known for its excellence in science.",synonyms:["superiority","quality","distinction"]}]}] },
  { word:"navigate", phonetics:[{text:"/ˈnævɪɡeɪt/",audio:""}], meanings:[{partOfSpeech:"verb",definitions:[{definition:"Find a way through a difficult situation using skill and knowledge.",example:"He learned to navigate through complex problems calmly.",synonyms:["direct","guide","steer"]}]}] },
  { word:"profound", phonetics:[{text:"/prəˈfaʊnd/",audio:"https://api.dictionaryapi.dev/media/pronunciations/en/profound-us.mp3"}], meanings:[{partOfSpeech:"adjective",definitions:[{definition:"Very great or intense; having deep meaning.",example:"Reading gave her a profound understanding of life.",synonyms:["deep","intense","meaningful"]}]}] },
  { word:"aspire", phonetics:[{text:"/əˈspaɪər/",audio:"https://api.dictionaryapi.dev/media/pronunciations/en/aspire-us.mp3"}], meanings:[{partOfSpeech:"verb",definitions:[{definition:"Have a strong ambition to achieve something great.",example:"She aspires to become a doctor one day.",synonyms:["aim","seek","strive"]}]}] },
  { word:"mindful", phonetics:[{text:"/ˈmaɪndfʊl/",audio:""}], meanings:[{partOfSpeech:"adjective",definitions:[{definition:"Conscious or aware of something; being present and attentive.",example:"Being mindful of others' feelings creates a kind environment.",synonyms:["aware","attentive","conscious"]}]}] },
  { word:"versatile", phonetics:[{text:"/ˈvɜːrsətaɪl/",audio:"https://api.dictionaryapi.dev/media/pronunciations/en/versatile-us.mp3"}], meanings:[{partOfSpeech:"adjective",definitions:[{definition:"Able to adapt to many different functions or activities.",example:"A versatile student can excel in both science and arts.",synonyms:["adaptable","flexible","all-round"]}]}] },
];

const LOCAL_DICT_MAP: Record<string, DictEntry> = Object.fromEntries(LOCAL_DICT.map(e => [e.word, e]));

function getTodayEntry(): DictEntry {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const diff = Number(new Date()) - Number(start);
  const dayOfYear = Math.floor(diff / 86400000);
  return LOCAL_DICT[dayOfYear % LOCAL_DICT.length];
}

// Try live API, fall back to local data silently
async function lookupWord(word: string): Promise<DictEntry | null> {
  // Check local dict first (instant, no network)
  const local = LOCAL_DICT_MAP[word.toLowerCase().trim()];
  if (local) return local;
  // Try live API for words not in local dict
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.trim().toLowerCase())}`,
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

  const playAudio = () => {
    if (audioUrl) new Audio(audioUrl).play().catch(() => {});
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
          {audioUrl && (
            <button onClick={playAudio} className="p-1 rounded-full hover:bg-white/20 text-white transition-colors" title="Hear pronunciation">
              <Volume2 className="w-3.5 h-3.5" />
            </button>
          )}
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
  // Instant — no API call needed, data is local
  const [entry, setEntry] = useState<DictEntry>(() => getTodayEntry());
  const [activeMeaning, setActiveMeaning] = useState(0);
  const [played, setPlayed] = useState(false);
  const [shuffling, setShuffling] = useState(false);

  const audioUrl = entry.phonetics.find((p) => p.audio && p.audio.startsWith("http"))?.audio ?? null;
  const phonetic = entry.phonetics.find((p) => p.text)?.text ?? null;
  const meaning = entry.meanings[activeMeaning];

  const playAudio = () => {
    if (!audioUrl) return;
    new Audio(audioUrl).play().catch(() => {});
    setPlayed(true);
  };

  const handleNewWord = () => {
    setShuffling(true);
    const current = LOCAL_DICT.indexOf(entry);
    const next = LOCAL_DICT[(current + 1 + Math.floor(Math.random() * (LOCAL_DICT.length - 1))) % LOCAL_DICT.length];
    setTimeout(() => { setEntry(next); setActiveMeaning(0); setPlayed(false); setShuffling(false); }, 300);
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
            subtitle="Build your English vocabulary — one word at a time. Click the speaker to hear pronunciation."
          />
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <div className="max-w-2xl mx-auto">
            <div className={`bg-card border border-border rounded-3xl overflow-hidden shadow-card transition-opacity duration-300 ${shuffling ? "opacity-40" : "opacity-100"}`}>
              {/* Top banner */}
              <div className="bg-gradient-to-r from-primary via-primary to-primary/80 px-6 py-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4 min-w-0">
                    {/* Speaker button */}
                    <button
                      onClick={playAudio}
                      disabled={!audioUrl}
                      title={audioUrl ? "Click to hear pronunciation" : "No audio available"}
                      className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-200 shadow-lg
                        ${audioUrl
                          ? "bg-white/20 hover:bg-white/30 hover:scale-105 active:scale-95 cursor-pointer"
                          : "bg-white/10 cursor-not-allowed opacity-60"
                        } ${played ? "ring-2 ring-white/60" : ""}`}
                    >
                      <Volume2 className={`w-7 h-7 text-white ${played ? "animate-pulse" : ""}`} />
                    </button>
                    <div className="min-w-0">
                      <h3 className="text-3xl font-black text-white capitalize tracking-tight truncate">{entry.word}</h3>
                      {phonetic && <p className="text-white/70 text-sm font-mono mt-0.5">{phonetic}</p>}
                      {!audioUrl && <p className="text-white/50 text-[10px] mt-0.5">Tap to hear · audio loading</p>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="text-[10px] bg-white/20 text-white px-2.5 py-1 rounded-full font-bold border border-white/20">
                      📅 Today's Word
                    </span>
                    <button
                      onClick={handleNewWord}
                      disabled={shuffling}
                      className="text-[10px] bg-white/10 hover:bg-white/25 text-white px-2.5 py-1 rounded-full flex items-center gap-1 transition-colors border border-white/20"
                    >
                      <RefreshCw className={`w-3 h-3 ${shuffling ? "animate-spin" : ""}`} />
                      New word
                    </button>
                  </div>
                </div>
                {audioUrl && !played && (
                  <p className="text-white/60 text-[11px] mt-3 flex items-center gap-1.5">
                    <Volume2 className="w-3 h-3" /> Tap the speaker icon above to hear how it's pronounced
                  </p>
                )}
              </div>

              {/* Part-of-speech tabs */}
              {entry.meanings.length > 1 && (
                <div className="flex gap-1.5 px-5 pt-4 flex-wrap">
                  {entry.meanings.map((m, i) => (
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
                        <div className="space-y-1 flex-1 min-w-0">
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
                    <span className="font-bold">Pro tip:</span> Double-click any English word anywhere on this website to instantly see its definition!
                  </p>
                </div>
              </div>

              <div className="px-5 pb-3">
                <p className="text-[9px] text-muted-foreground/40 text-center">Powered by Free Dictionary API · dictionaryapi.dev</p>
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
    ? "bg-gradient-to-b from-black/70 via-black/60 to-black/80"
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
          <div className="absolute inset-0 bg-background" />
        )}

        {/* ── Dark gradient overlay so text stays readable ── */}
        <div className={`absolute inset-0 ${heroOverlay}`} />

        {/* ── Foreground content ── */}
        <m.div style={{ y: heroContentY, opacity: heroOpacity }} className="container mx-auto px-4 relative z-10 py-20 md:py-24">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            <m.div initial="hidden" animate="visible" variants={stagger.parent} className="max-w-2xl">
              <m.div variants={stagger.child}>
                <span className={`inline-flex items-center gap-2 ${heroBadgeBg} backdrop-blur-sm rounded-full px-4 py-1.5 text-sm shadow-sm`}>
                  <span className="w-2 h-2 rounded-full bg-[#C96B3B] animate-pulse" />
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
                    className="inline-flex items-center gap-2 bg-[#C96B3B] text-white font-semibold px-7 py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all duration-200">
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
      <m.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionFadeUp} className="section-y cv-auto bg-white">
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
          <div className="bg-white border border-border rounded-3xl p-10 md:p-16 text-center relative overflow-hidden shadow-card">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#C96B3B]/5 rounded-full blur-3xl pointer-events-none" />
            <ScrollReveal>
              <div className="relative z-10">
                {admSettings?.is_open ? (
                  <>
                    {/* Admissions OPEN */}
                    <div className="inline-flex items-center gap-2 bg-primary/5 text-foreground border border-primary/15 text-sm font-bold px-4 py-2 rounded-full mb-5">
                      <span className="w-2 h-2 rounded-full bg-[#C96B3B] animate-pulse" />
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
                          className="w-full sm:w-auto px-10 py-5 bg-[#C96B3B] text-white rounded-2xl font-semibold border border-[#C96B3B]/30 hover:bg-[#C96B3B]/90 transition-all flex items-center justify-center gap-2 text-lg">
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
                          className="w-full sm:w-auto px-10 py-5 bg-[#C96B3B] text-white rounded-2xl font-semibold border border-[#C96B3B]/30 hover:bg-[#C96B3B]/90 transition-all flex items-center justify-center gap-2 text-lg">
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
                <span className="inline-block bg-white text-foreground border border-border text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full mb-4">About Us</span>
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
                      className="flex items-center gap-3 bg-white rounded-xl p-3 border border-border">
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
                <div className="aspect-square rounded-3xl bg-white border border-border p-2 shadow-xl">
                  <div className="w-full h-full rounded-2xl bg-muted flex items-center justify-center overflow-hidden">
                    <GraduationCap className="w-40 h-40 text-primary/20" />
                  </div>
                </div>
                <m.div animate={{ y: [0, -10, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} className="absolute -bottom-6 -left-6 bg-white rounded-2xl shadow-2xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-[#C96B3B] flex items-center justify-center shadow-lg"><Star className="w-6 h-6 text-white" /></div>
                    <div><p className="text-2xl font-black text-foreground">{settings?.pass_percentage || 98}%</p><p className="text-xs text-muted-foreground font-medium">Pass Rate</p></div>
                  </div>
                </m.div>
                <m.div animate={{ y: [0, 10, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} className="absolute -top-4 -right-4 bg-white rounded-2xl shadow-2xl p-4">
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
