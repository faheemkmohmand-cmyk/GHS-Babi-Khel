import { motion, useScroll, useTransform, useInView } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Bell, Users, GraduationCap,
  Trophy, ChevronRight, Microscope, FileText, Laptop,
  BookOpen, Sparkles, BarChart3, Calendar, Image,
  Star, Award, Heart, MapPin, Phone, Mail, Clock,
  Shield, Zap, Globe, Lightbulb, School, RefreshCw
} from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
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
    <motion.div ref={ref}
      initial={{ opacity: 0, y: direction === "up" ? 50 : direction === "down" ? -50 : 0, x: direction === "left" ? 50 : direction === "right" ? -50 : 0 }}
      animate={isInView ? { opacity: 1, y: 0, x: 0 } : {}}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
    >{children}</motion.div>
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

/* ─── Toppers section ─── */
const TopperSection = () => {
  const { data: toppers = [], isLoading } = useSchoolToppers();
  if (!isLoading && toppers.length === 0) return null;
  const gradients = [
    "from-[#0c4a6e] via-[#0369a1] to-[#0ea5e9]", "from-[#075985] via-[#0284c7] to-[#38bdf8]",
    "from-[#0c4a6e] via-[#0e7490] to-[#22d3ee]",  "from-[#1e3a8a] via-[#1d4ed8] to-[#3b82f6]",
    "from-[#0f172a] via-[#1e40af] to-[#0ea5e9]",
  ];
  return (
    <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionFadeUp} className="section-y cv-auto">
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
                <motion.div key={i} initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
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
                </motion.div>
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
    </motion.section>
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
    <PageLayout>

      {/* ══ 1. NEWS TICKER ══ */}
      <NewsTicker />

      {/* ══ 2. HERO ══ */}
      <section id="hero-section" className="relative min-h-[88vh] flex items-center overflow-hidden">

        {/* ── Background banner image (full section) ── */}
        {settings?.banner_url ? (
          <img
            src={settings.banner_url}
            alt="School campus"
            className="absolute inset-0 w-full h-full object-cover object-center"
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
        ) : (
          <div className="absolute inset-0 bg-[#F5F1EB]" />
        )}

        {/* ── Dark gradient overlay so text stays readable ── */}
        <div className={`absolute inset-0 ${heroOverlay}`} />

        {/* ── Foreground content ── */}
        <motion.div style={{ y: heroContentY, opacity: heroOpacity }} className="container mx-auto px-4 relative z-10 py-20 md:py-24 will-change-transform">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            <motion.div initial="hidden" animate="visible" variants={stagger.parent} className="max-w-2xl">
              <motion.div variants={stagger.child}>
                <span className={`inline-flex items-center gap-2 ${heroBadgeBg} backdrop-blur-sm rounded-full px-4 py-1.5 text-sm shadow-sm`}>
                  <span className="w-2 h-2 rounded-full bg-[#C96B3B] animate-pulse" />
                  Est. {settings?.established_year || 2018} · EMIS {settings?.emis_code || "60673"}
                </span>
              </motion.div>
              <motion.h1 variants={stagger.child} className={`mt-6 text-4xl md:text-6xl lg:text-7xl font-heading font-extrabold leading-[0.95] min-h-[1em] ${heroTextColor} drop-shadow-lg`}>
                {displayedSchoolName}
                <span className={`inline-block w-1 h-[0.85em] ${heroCursorColor} ml-1 align-middle`} style={{ animation: "blink 1s step-end infinite" }} />
              </motion.h1>
              <motion.h2 variants={stagger.child} className={`mt-4 text-xl md:text-2xl font-heading font-semibold ${heroSubColor} min-h-[2rem] drop-shadow`}>
                {displayed}
                <span className={`inline-block w-0.5 h-6 ${heroCursorColor} ml-1 align-middle`} style={{ animation: "blink 1s step-end infinite" }} />
                <style>{`@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }`}</style>
              </motion.h2>
              <motion.p variants={stagger.child} className={`mt-5 text-base md:text-lg ${heroDescColor} max-w-xl leading-relaxed`}>
                {settings?.description || "Government High School Babi Khel is committed to providing quality education and nurturing the future leaders of Pakistan."}
              </motion.p>
              <motion.div variants={stagger.child} className="mt-8 flex flex-wrap gap-4">
                <Link to="/results">
                  <motion.button whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
                    className="inline-flex items-center gap-2 bg-[#0F172A] text-white font-semibold px-7 py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all duration-200">
                    View Results <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </Link>
                <Link to="/auth/signin">
                  <motion.button whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
                    className="inline-flex items-center gap-2 bg-[#C96B3B] text-white font-semibold px-7 py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all duration-200">
                    Student Portal
                  </motion.button>
                </Link>
                <Link to="/about">
                  <motion.button whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
                    className={`inline-flex items-center gap-2 ${heroLearnMoreBtn} font-semibold px-7 py-3.5 rounded-xl shadow-sm transition-all duration-200`}>
                    Learn More
                  </motion.button>
                </Link>
              </motion.div>
            </motion.div>

            {/* Stats cards on desktop right column */}
            <motion.div ref={statsRef} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4, duration: 0.6 }} className="hidden lg:grid grid-cols-2 gap-3">
              {[
                { icon: Users,         label: "Students",    value: settings?.total_students   || 500,  suffix: "+" },
                { icon: GraduationCap, label: "Teachers",    value: settings?.total_teachers   || 25,   suffix: "+" },
                { icon: Trophy,        label: "Pass Rate",   value: settings?.pass_percentage  || 98,   suffix: "%" },
                { icon: BookOpen,      label: "Established", value: settings?.established_year || 2018, suffix: ""  },
              ].map((stat, i) => (
                <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + i * 0.1 }}
                  className={`${heroStatCard} rounded-2xl p-4 shadow-sm`}>
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-2">
                    <stat.icon className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-2xl font-bold text-white"><AnimCounter value={stat.value} suffix={stat.suffix} isInView={statsInView} /></p>
                  <p className="text-xs text-white/70 mt-1 font-medium">{stat.label}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* ══ 3. STATS BAR ══ */}
      <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }} variants={sectionFadeUp} className="relative z-20 -mt-10">
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
      </motion.section>

      {/* ══ 4. SUBJECTS MARQUEE ══ */}
      <section className="py-5 bg-[#F5F1EB] overflow-hidden border-y border-border mt-16">
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
      <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionFadeUp} className="section-y bg-[#F5F1EB] cv-auto">
        <div className="container mx-auto px-4">
          <ScrollReveal><SectionHeader eyebrow="Our Strengths" title="Why Choose Us" subtitle="We provide a comprehensive educational experience that nurtures young minds" /></ScrollReveal>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger.parent} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, idx) => (
              <ScrollReveal key={f.title} delay={idx * 0.08}>
                <motion.div variants={stagger.child} whileHover={{ y: -8, scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="group bg-card rounded-2xl p-6 shadow-card hover:shadow-elevated transition-all duration-300 border border-transparent hover:border-primary/20 h-full">
                  <div className="w-12 h-12 rounded-xl bg-[#0F172A] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-md">
                    <f.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-heading font-semibold text-foreground text-lg">{f.title}</h3>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{f.desc}</p>
                </motion.div>
              </ScrollReveal>
            ))}
          </motion.div>
        </div>
      </motion.section>

      {/* ══ 8. SCHOOL TOPPERS ══ */}
      <TopperSection />

      {/* ══ 9. LATEST NOTICES ══ */}
      <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionFadeUp} className="section-y bg-[#F5F1EB] cv-auto">
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
                <motion.div key={notice.id} initial={{ opacity: 0, x: -12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} whileHover={{ x: 6 }}
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
                </motion.div>
              ))}
          </div>
        </div>
      </motion.section>

      {/* ══ 10. LATEST NEWS ══ */}
      <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionFadeUp} className="section-y cv-auto bg-white">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-10">
            <div><span className="eyebrow">What's Happening</span><h2 className="section-title">Latest News</h2></div>
            <Link to="/news" className="text-sm font-semibold text-primary hover:underline flex items-center gap-1">All News <ChevronRight className="w-4 h-4" /></Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {newsLoading ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-card rounded-2xl overflow-hidden shadow-card"><Skeleton className="h-48 w-full" /><div className="p-5 space-y-2"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-3 w-1/2" /></div></div>
            )) : news.map((item) => (
              <motion.div key={item.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                className="bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-elevated transition-all duration-300 group">
                <div className="h-48 overflow-hidden bg-secondary">
                  {item.image_url
                    ? <img src={item.image_url} alt={item.title} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    : <div className="w-full h-full bg-[#F3F4F6] flex items-center justify-center"><Bell className="w-10 h-10 text-[#0F172A]/40" /></div>
                  }
                </div>
                <div className="p-5">
                  <p className="text-xs text-muted-foreground mb-2">{format(new Date(item.created_at), "dd MMM yyyy")}</p>
                  <h3 className="font-heading font-semibold text-foreground line-clamp-2">{item.title}</h3>
                  {item.content && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{item.content}</p>}
                  <Link to="/news" className="inline-flex items-center gap-1 text-sm font-medium text-primary mt-3 hover:gap-2 transition-all">Read More <ArrowRight className="w-3.5 h-3.5" /></Link>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ══ 11. TEACHERS ══ */}
      <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionFadeUp} className="section-y bg-[#F5F1EB] cv-auto">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-10">
            <div><span className="eyebrow">Our Faculty</span><h2 className="section-title">Meet Our Teachers</h2></div>
            <Link to="/teachers" className="text-sm font-semibold text-primary hover:underline flex items-center gap-1">All Teachers <ChevronRight className="w-4 h-4" /></Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {teachersLoading ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card rounded-2xl p-6 text-center shadow-card"><Skeleton className="w-20 h-20 rounded-full mx-auto mb-4" /><Skeleton className="h-5 w-2/3 mx-auto mb-2" /><Skeleton className="h-3 w-1/2 mx-auto" /></div>
            )) : teachers.map((teacher) => (
              <motion.div key={teacher.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} whileHover={{ y: -8 }}
                className="bg-card rounded-2xl p-6 text-center shadow-card hover:shadow-elevated transition-all duration-300 group">
                {teacher.photo_url
                  ? <img src={teacher.photo_url} alt={teacher.full_name} loading="lazy" decoding="async" className="w-20 h-20 rounded-full mx-auto mb-4 object-cover ring-4 ring-secondary group-hover:ring-primary/30 transition-all" />
                  : <div className="w-20 h-20 rounded-full mx-auto mb-4 bg-[#0F172A] flex items-center justify-center text-white text-xl font-heading font-bold">{teacher.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}</div>
                }
                <h3 className="font-heading font-semibold text-foreground">{teacher.full_name}</h3>
                {teacher.subject       && <p className="text-sm text-primary font-medium mt-1">{teacher.subject}</p>}
                {teacher.qualification && <p className="text-xs text-muted-foreground mt-1">{teacher.qualification}</p>}
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ══ 12. ACHIEVEMENTS ══ */}
      <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionFadeUp} className="section-y cv-auto">
        <div className="container mx-auto px-4">
          <ScrollReveal><SectionHeader eyebrow="Our Pride" title="Achievements" /></ScrollReveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {achievementsLoading ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-card rounded-2xl p-6 shadow-card"><Skeleton className="w-12 h-12 rounded-xl mb-4" /><Skeleton className="h-5 w-3/4 mb-2" /><Skeleton className="h-3 w-1/2" /></div>
            )) : achievements.map((a) => (
              <motion.div key={a.id} initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
                className="bg-card rounded-2xl p-6 shadow-card hover:shadow-elevated transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-warning/15 flex items-center justify-center mb-4"><Trophy className="w-6 h-6 text-warning" /></div>
                <h3 className="font-heading font-semibold text-foreground">{a.title}</h3>
                {a.student_name && <p className="text-sm text-primary font-medium mt-1">{a.student_name}{a.class && ` · Class ${a.class}`}</p>}
                {a.description  && <p className="text-sm text-muted-foreground mt-2">{a.description}</p>}
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ══ 13. DAILY QUOTE + WEATHER (side-by-side) ══ */}
      <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionFadeUp} className="section-y bg-[#F5F1EB] cv-auto">
        <div className="container mx-auto px-4 max-w-4xl">
          <ScrollReveal><SectionHeader eyebrow="Daily Inspiration" title="Thought of the Day" /></ScrollReveal>
          <div className="grid md:grid-cols-2 gap-6 items-start">
            <DailyQuoteCard />
            <WeatherWidget />
          </div>
        </div>
      </motion.section>

      {/* ══ 15. ADMISSION / FINAL CTA ══ */}
      <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionFadeUp} className="section-y cv-auto relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} className="absolute top-0 left-0 w-96 h-96 bg-primary/5 rounded-full -translate-x-1/2 -translate-y-1/2" />
          <motion.div animate={{ scale: [1.2, 1, 1.2] }} transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }} className="absolute bottom-0 right-0 w-96 h-96 bg-accent/5 rounded-full translate-x-1/2 translate-y-1/2" />
        </div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="bg-white border border-[#E5E7EB] rounded-3xl p-10 md:p-16 text-center relative overflow-hidden shadow-card">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#C96B3B]/5 rounded-full blur-3xl pointer-events-none" />
            <ScrollReveal>
              <div className="relative z-10">
                {admSettings?.is_open ? (
                  <>
                    {/* Admissions OPEN */}
                    <div className="inline-flex items-center gap-2 bg-[#0F172A]/5 text-[#111827] border border-[#0F172A]/15 text-sm font-bold px-4 py-2 rounded-full mb-5">
                      <span className="w-2 h-2 rounded-full bg-[#C96B3B] animate-pulse" />
                      Admissions Open — Session {admSettings.session_year}
                    </div>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold text-[#111827] mb-4 leading-tight">
                      Apply for Admission{" "}
                      <span className="text-[#C96B3B]">Today</span>
                    </h2>
                    {admSettings.last_date && (
                      <p className="text-[#5B5B5B] text-base mb-3">
                        Last Date:{" "}
                        <span className="font-bold text-[#111827]">
                          {new Date(admSettings.last_date).toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" })}
                        </span>
                      </p>
                    )}
                    <p className="text-[#5B5B5B] text-base mb-8 max-w-xl mx-auto">
                      {admSettings.banner_message ?? "Classes 6 to 10 — Fresh admissions and migration cases welcome. Apply online in minutes."}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                      <Link to="/admission">
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
                          className="w-full sm:w-auto px-10 py-5 bg-[#0F172A] text-white rounded-2xl font-bold shadow-md flex items-center justify-center gap-2 text-lg">
                          Apply Now <ArrowRight className="w-5 h-5" />
                        </motion.button>
                      </Link>
                      <Link to="/admission">
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
                          className="w-full sm:w-auto px-10 py-5 bg-[#C96B3B] text-white rounded-2xl font-semibold border border-[#C96B3B]/30 hover:bg-[#C96B3B]/90 transition-all flex items-center justify-center gap-2 text-lg">
                          Track Application
                        </motion.button>
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
                          <div className="bg-[#F9FAFB] hover:bg-[#F3F4F6] border border-[#E5E7EB] rounded-xl py-2.5 px-3 flex items-center gap-2 text-[#111827] text-xs font-semibold transition-all cursor-pointer">
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
                    <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} className="inline-block mb-4">
                      <Heart className="w-8 h-8 text-[#0F172A]/60 mx-auto" />
                    </motion.div>
                    <div className="inline-flex items-center gap-2 bg-[#0F172A]/5 text-[#111827] border border-[#0F172A]/15 text-sm font-medium px-4 py-2 rounded-full mb-6">
                      <Heart className="w-4 h-4" /> Join Our Community
                    </div>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold text-[#111827] mb-6 leading-tight">
                      Ready to Begin Your{" "}
                      <span className="text-[#C96B3B]">Educational Journey?</span>
                    </h2>
                    <p className="text-[#5B5B5B] text-lg mb-10 max-w-2xl mx-auto">
                      Access your student portal to view results, attendance, timetables, and stay connected with your academic progress.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                      <Link to="/auth/signin">
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
                          className="w-full sm:w-auto px-10 py-5 bg-[#0F172A] text-white rounded-2xl font-bold shadow-md flex items-center justify-center gap-2 text-lg">
                          Sign In to Portal <ArrowRight className="w-5 h-5" />
                        </motion.button>
                      </Link>
                      <Link to="/results">
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
                          className="w-full sm:w-auto px-10 py-5 bg-[#C96B3B] text-white rounded-2xl font-semibold border border-[#C96B3B]/30 hover:bg-[#C96B3B]/90 transition-all flex items-center justify-center gap-2 text-lg">
                          Check Results
                        </motion.button>
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </ScrollReveal>
          </div>
        </div>
      </motion.section>

      {/* ══ 16. ABOUT PREVIEW ══ */}
      <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={sectionFadeUp} className="section-y cv-auto relative overflow-hidden bg-[#F5F1EB]">
        <div className="absolute inset-0 opacity-30 pointer-events-none overflow-hidden">
          <motion.div animate={{ rotate: 360 }}  transition={{ duration: 60, repeat: Infinity, ease: "linear" }} className="absolute -top-20 -right-20 w-80 h-80 rounded-full border-4 border-[#E5E7EB]" />
          <motion.div animate={{ rotate: -360 }} transition={{ duration: 80, repeat: Infinity, ease: "linear" }} className="absolute -bottom-20 -left-20 w-96 h-96 rounded-full border-4 border-[#E5E7EB]" />
        </div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <ScrollReveal direction="left">
              <div className="text-[#111827]">
                <span className="inline-block bg-white text-[#111827] border border-[#E5E7EB] text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full mb-4">About Us</span>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold mb-6 leading-tight">Building Future Leaders Since {settings?.established_year || 2018}</h2>
                <p className="text-[#5B5B5B] text-lg leading-relaxed mb-8">
                  {settings?.description || "Government High School Babi Khel has been serving the community of District Mohmand with dedication and excellence. We believe in nurturing every student's potential through quality education and modern teaching methodologies."}
                </p>
                <div className="grid sm:grid-cols-2 gap-4 mb-8">
                  {[
                    { icon: MapPin, text: settings?.address || "Babi Khel, District Mohmand, KPK" },
                    { icon: Phone,  text: settings?.phone   || "+92 XXX XXXXXXX" },
                    { icon: Mail,   text: settings?.email   || "info@ghsbabikhel.edu.pk" },
                    { icon: Clock,  text: "Mon-Fri, 8:00 AM - 3:00 PM" },
                  ].map((item, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                      className="flex items-center gap-3 bg-white rounded-xl p-3 border border-[#E5E7EB]">
                      <div className="w-10 h-10 rounded-lg bg-[#0F172A]/5 flex items-center justify-center shrink-0"><item.icon className="w-5 h-5 text-[#0F172A]" /></div>
                      <span className="text-sm text-[#5B5B5B]">{item.text}</span>
                    </motion.div>
                  ))}
                </div>
                <Link to="/about">
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }} className="px-8 py-4 bg-[#0F172A] text-white rounded-2xl font-bold shadow-md flex items-center gap-2">
                    Learn More About Us <ArrowRight className="w-5 h-5" />
                  </motion.button>
                </Link>
              </div>
            </ScrollReveal>
            <ScrollReveal direction="right" delay={0.2}>
              <div className="relative">
                <div className="aspect-square rounded-3xl bg-white border border-[#E5E7EB] p-2 shadow-xl">
                  <div className="w-full h-full rounded-2xl bg-[#F9FAFB] flex items-center justify-center overflow-hidden">
                    <GraduationCap className="w-40 h-40 text-[#0F172A]/20" />
                  </div>
                </div>
                <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} className="absolute -bottom-6 -left-6 bg-white rounded-2xl shadow-2xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-[#C96B3B] flex items-center justify-center shadow-lg"><Star className="w-6 h-6 text-white" /></div>
                    <div><p className="text-2xl font-black text-foreground">{settings?.pass_percentage || 98}%</p><p className="text-xs text-muted-foreground font-medium">Pass Rate</p></div>
                  </div>
                </motion.div>
                <motion.div animate={{ y: [0, 10, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} className="absolute -top-4 -right-4 bg-white rounded-2xl shadow-2xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg"><Award className="w-6 h-6 text-white" /></div>
                    <div><p className="text-2xl font-black text-foreground">A+</p><p className="text-xs text-muted-foreground font-medium">Board Results</p></div>
                  </div>
                </motion.div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </motion.section>

    </PageLayout>
  );
};

export default Home;
