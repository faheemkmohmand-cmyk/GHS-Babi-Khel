// src/components/shared/HonorRollHomeSection.tsx
// Beautiful Honor Roll section for Homepage - Editorial & Attractive Design
// Shows: Featured student banner, top achievers, recent honors

import { useState, useEffect } from "react";
import { useHonorRoll } from "@/hooks/useNewFeatures";
import { Trophy, Crown, Medal, Award, Star, ChevronRight, Calendar, GraduationCap } from "lucide-react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ─── CLASS COLOR CONFIGURATION ──────────────────────────────────────────────

const CLASS_COLORS: Record<string, { 
  gradient: string; 
  badge: string; 
  accent: string; 
  bg: string;
  iconBg: string;
}> = {
  "6": { 
    gradient: "from-indigo-500 to-indigo-600", 
    badge: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300", 
    accent: "text-indigo-600 dark:text-indigo-400",
    bg: "bg-indigo-50 dark:bg-indigo-950/20",
    iconBg: "bg-indigo-100 dark:bg-indigo-900/40"
  },
  "7": { 
    gradient: "from-emerald-500 to-emerald-600", 
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300", 
    accent: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
    iconBg: "bg-emerald-100 dark:bg-emerald-900/40"
  },
  "8": { 
    gradient: "from-orange-500 to-orange-600", 
    badge: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300", 
    accent: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-950/20",
    iconBg: "bg-orange-100 dark:bg-orange-900/40"
  },
  "9": { 
    gradient: "from-pink-500 to-pink-600", 
    badge: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300", 
    accent: "text-pink-600 dark:text-pink-400",
    bg: "bg-pink-50 dark:bg-pink-950/20",
    iconBg: "bg-pink-100 dark:bg-pink-900/40"
  },
  "10": { 
    gradient: "from-blue-500 to-blue-600", 
    badge: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300", 
    accent: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/20",
    iconBg: "bg-blue-100 dark:bg-blue-900/40"
  },
};

// ─── FEATURED STUDENT HERO BANNER ───────────────────────────────────────────

function FeaturedStudentHero({ entry }: { entry: any }) {
  const classColor = CLASS_COLORS[entry.class] || CLASS_COLORS["6"];
  
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 p-6 sm:p-8 text-white shadow-2xl mb-8">
      {/* Background Decorative Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-yellow-400/10 rounded-full blur-3xl" />
        {/* Subtle Grid Pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
          backgroundSize: '30px 30px'
        }} />
      </div>

      <div className="relative z-10 flex flex-col md:flex-row items-center gap-6">
        {/* Student Photo */}
        <div className="relative shrink-0">
          <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full p-1.5 bg-white/20 backdrop-blur-sm shadow-xl">
            {entry.photo_url ? (
              <img 
                src={entry.photo_url} 
                alt={entry.student_name} 
                className="w-full h-full rounded-full object-cover border-4 border-white/30 shadow-inner"
              />
            ) : (
              <div className="w-full h-full rounded-full bg-gradient-to-br from-white/30 to-white/10 flex items-center justify-center backdrop-blur-sm border-2 border-white/20">
                <span className="text-5xl font-bold">{entry.student_name[0]}</span>
              </div>
            )}
          </div>
          {/* Floating Trophy */}
          <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-gradient-to-br from-yellow-300 to-amber-500 rounded-full flex items-center justify-center shadow-lg animate-bounce">
            <Trophy className="w-6 h-6 text-white" />
          </div>
        </div>

        {/* Student Info */}
        <div className="flex-1 text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm mb-3">
            <Crown className="w-4 h-4 text-yellow-300" />
            <span className="text-xs font-semibold uppercase tracking-wider text-yellow-200">Student of the Month</span>
          </div>
          
          <h3 className="text-3xl sm:text-4xl font-bold mb-2 tracking-tight">
            {entry.student_name}
          </h3>
          
          <div className="flex items-center justify-center md:justify-start gap-3 mb-3 flex-wrap">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${classColor.badge} bg-white/90`}>
              <GraduationCap className="w-4 h-4 mr-1" />
              Class {entry.class}
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-white/15 backdrop-blur-sm">
              <Calendar className="w-4 h-4 mr-1" />
              {MONTHS[entry.month - 1]} {entry.year}
            </span>
          </div>

          {entry.reason && (
            <p className="text-base text-white/90 italic max-w-lg mx-auto md:mx-0" style={{ fontFamily: 'Georgia, serif' }}>
              "{entry.reason}"
            </p>
          )}
        </div>

        {/* Decorative Stars */}
        <div className="hidden lg:block absolute top-4 right-8">
          <Star className="w-8 h-8 text-yellow-300 fill-yellow-300 animate-pulse" />
        </div>
        <div className="hidden lg:block absolute bottom-8 right-24">
          <Star className="w-5 h-5 text-yellow-200 fill-yellow-200 animate-pulse delay-150" />
        </div>
      </div>
    </div>
  );
}

// ─── TOP ACHIEVERS PODIUM (Mini Version for Home) ───────────────────────────

function TopAchieversPodium({ entries }: { entries: any[] }) {
  const top3 = entries.slice(0, 3);
  if (top3.length === 0) return null;

  const positions = [
    { entry: top3[1], place: 2, medal: "🥈", height: "h-20", gradient: "from-gray-200 to-gray-300 dark:from-gray-600 dark:to-gray-700", textColor: "text-gray-600 dark:text-gray-300" },
    { entry: top3[0], place: 1, medal: "🥇", height: "h-28", gradient: "from-yellow-300 to-amber-400 dark:from-yellow-600 dark:to-amber-600", textColor: "text-yellow-700 dark:text-yellow-200" },
    { entry: top3[2], place: 3, medal: "🥉", height: "h-16", gradient: "from-orange-200 to-orange-300 dark:from-orange-700 dark:to-orange-600", textColor: "text-orange-700 dark:text-orange-300" },
  ].filter(p => p.entry);

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Medal className="w-5 h-5 text-yellow-500" />
        <h3 className="font-bold text-lg text-foreground">Top Achievers</h3>
      </div>
      
      <div className="flex items-end justify-center gap-3 sm:gap-6 p-6 bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
        {positions.map(({ entry, place, height, medal, gradient, textColor }) => {
          const classColor = CLASS_COLORS[entry.class] || CLASS_COLORS["6"];
          return (
            <div key={entry.id} className="flex flex-col items-center gap-2 flex-1 max-w-[120px]">
              {/* Photo & Name */}
              <div className="flex flex-col items-center">
                <div className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-full p-0.5 bg-gradient-to-br ${classColor.gradient} shadow-lg`}>
                  {entry.photo_url ? (
                    <img src={entry.photo_url} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <div className="w-full h-full rounded-full bg-white dark:bg-slate-700 flex items-center justify-center text-sm font-bold text-foreground">
                      {entry.student_name[0]}
                    </div>
                  )}
                  <span className="absolute -top-1 -right-1 text-xl">{medal}</span>
                </div>
                <p className={`text-xs font-bold mt-1.5 ${textColor} text-center truncate w-full px-1`}>{entry.student_name}</p>
                <span className={`text-[10px] ${classColor.badge} px-2 py-0.5 rounded-full`}>Class {entry.class}</span>
              </div>
              
              {/* Podium Stand */}
              <div className={`w-full ${height} rounded-t-lg bg-gradient-to-t ${gradient} flex items-end justify-center pb-1 shadow-inner`}>
                <span className={`text-sm font-bold ${textColor}`}>#{place}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── HONOR ROLL CARD (Editorial Style) ──────────────────────────────────────

function HonorRollCard({ entry, index }: { entry: any; index: number }) {
  const classColor = CLASS_COLORS[entry.class] || CLASS_COLORS["6"];
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={`
        group relative overflow-hidden rounded-xl transition-all duration-500 ease-out
        hover:shadow-xl hover:-translate-y-1
        ${isHovered ? 'scale-[1.02]' : ''}
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        animationDelay: `${index * 100}ms`
      }}
    >
      {/* Ornamental Border */}
      <div className={`absolute inset-0 border-2 border-dashed opacity-20 rounded-xl m-0.5 pointer-events-none`} 
           style={{ borderColor: `var(--tw-${classColor.accent.split('-')[1]}-500)` }} />
      
      {/* Corner Decorations */}
      <div className={`absolute top-1 left-1 w-3 h-3 border-t-2 border-l-2 rounded-tl-lg ${classColor.bg}`} />
      <div className={`absolute bottom-1 right-1 w-3 h-3 border-b-2 border-r-2 rounded-br-lg ${classColor.bg}`} />

      <div className={`${classColor.bg} rounded-xl p-4 h-full`}>
        {/* Month Ribbon */}
        <div className="flex justify-center -mt-5 mb-3">
          <div className={`px-4 py-1.5 bg-gradient-to-r ${classColor.gradient} text-white text-xs font-bold rounded-full shadow-md flex items-center gap-1.5`}>
            <Award className="w-3.5 h-3.5" />
            {MONTHS[entry.month - 1].slice(0, 3)} {entry.year}
          </div>
        </div>

        <div className="flex items-start gap-3.5">
          {/* Photo with Ring */}
          <div className="shrink-0 relative">
            <div className={`w-14 h-14 rounded-full p-0.5 bg-gradient-to-br ${classColor.gradient} shadow-lg transition-transform duration-300 group-hover:scale-110`}>
              {entry.photo_url ? (
                <img src={entry.photo_url} alt={entry.student_name} className="w-full h-full rounded-full object-cover" />
              ) : (
                <div className="w-full h-full rounded-full bg-white dark:bg-slate-700 flex items-center justify-center text-white font-bold text-lg shadow-inner">
                  {entry.student_name[0]}
                </div>
              )}
            </div>
            {(entry as any).is_featured && (
              <Medal className="absolute -top-1 -right-1 w-5 h-5 text-yellow-500 drop-shadow" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 pt-1">
            <h4 className="font-bold text-foreground text-sm truncate">{entry.student_name}</h4>
            
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${classColor.badge}`}>
                Class {entry.class}
              </span>
              
              {(entry as any).is_featured && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300 flex items-center gap-0.5">
                  <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" /> Star
                </span>
              )}
            </div>

            {entry.reason && (
              <p className="text-[11px] text-muted-foreground mt-2 italic line-clamp-2 leading-relaxed" style={{ fontFamily: 'Georgia, serif' }}>
                "{entry.reason}"
              </p>
            )}
          </div>
        </div>

        {/* Bottom Accent Line */}
        <div className={`mt-3 pt-2 border-t border-current opacity-10`}>
          <div className="flex items-center justify-between">
            <div className={`w-6 h-0.5 rounded-full bg-gradient-to-r from-transparent via-current to-transparent ${classColor.accent.replace('text-', 'bg-').replace('-600', '-400')}`} />
            <ChevronRight className={`w-3.5 h-3.5 ${classColor.accent} opacity-40`} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── EMPTY STATE ────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="text-center py-16 px-4">
      <div className="relative inline-block mb-4">
        <div className="text-7xl opacity-15">🏆</div>
        <Trophy className="absolute -top-2 -right-2 w-8 h-8 text-yellow-400 animate-bounce" />
      </div>
      <h3 className="font-semibold text-foreground text-lg mb-2">Honor Roll Coming Soon</h3>
      <p className="text-sm text-muted-foreground max-w-sm mx-auto">
        Outstanding students will be celebrated here. Check back soon!
      </p>
    </div>
  );
}

// ─── MAIN SECTION COMPONENT ─────────────────────────────────────────────────

export function HonorRollHomeSection() {
  // Get current month/year for filtering
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const { data: allEntries = [], isLoading } = useHonorRoll(currentYear, currentMonth);
  const [isVisible, setIsVisible] = useState(false);

  // Animated entrance
  useEffect(() => {
    if (allEntries.length > 0) {
      const timer = setTimeout(() => setIsVisible(true), 200);
      return () => clearTimeout(timer);
    }
  }, [allEntries]);

  // Get featured or latest entry for hero
  const featuredEntry = allEntries.find((e: any) => e.is_featured) || allEntries[0] || null;

  // Get other entries (excluding featured)
  const otherEntries = allEntries.filter((e: any) => e.id !== featuredEntry?.id).slice(0, 6);

  // Loading state
  if (isLoading) {
    return (
      <section className="py-12 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <div className="h-8 bg-muted rounded w-48 mx-auto mb-4 animate-pulse" />
              <div className="h-4 bg-muted rounded w-72 mx-auto animate-pulse" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  // No entries
  if (allEntries.length === 0) {
    return (
      <section className="py-12 bg-gradient-to-b from-background to-muted/30">
        <div className="container mx-auto px-4">
          <EmptyState />
        </div>
      </section>
    );
  }

  return (
    <section className={`py-12 bg-gradient-to-b from-background via-background to-muted/20 transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
      <div className="container mx-auto px-4">
        <div className="max-w-5xl mx-auto">
          
          {/* Section Header - Editorial Style */}
          <div className="text-center mb-10">
            {/* Decorative Top */}
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="h-px w-16 bg-gradient-to-r from-transparent via-yellow-400/60 to-transparent" />
              <Trophy className="w-6 h-6 text-yellow-500" />
              <div className="h-px w-16 bg-gradient-to-r from-transparent via-yellow-400/60 to-transparent" />
            </div>
            
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-3 tracking-tight">
              Hall of Fame
            </h2>
            <p className="text-muted-foreground text-sm max-w-lg mx-auto">
              Celebrating our shining stars — students who exemplify excellence and dedication.
            </p>
          </div>

          {/* Featured Student Hero Banner */}
          {featuredEntry && (
            <FeaturedStudentHero entry={featuredEntry} />
          )}

          {/* Top 3 Podium (if we have 3+ entries) */}
          {allEntries.length >= 3 && (
            <TopAchieversPodium entries={allEntries} />
          )}

          {/* Other Honorees Grid */}
          {otherEntries.length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-5">
                <Award className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-foreground">Recent Honors</h3>
                <div className="flex-1 h-px bg-border ml-2" />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                {otherEntries.map((entry: any, index: number) => (
                  <HonorRollCard key={entry.id} entry={entry} index={index} />
                ))}
              </div>
            </>
          )}

          {/* Stats Footer */}
          <div className="mt-10 text-center">
            <div className="inline-flex items-center gap-6 px-6 py-3 bg-muted/50 rounded-full">
              <div className="flex items-center gap-1.5">
                <Star className="w-4 h-4 text-yellow-500" />
                <span className="text-sm font-semibold text-foreground">{allEntries.length} Stars</span>
              </div>
              <div className="w-px h-4 bg-border" />
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{MONTHS[currentMonth - 1]} {currentYear}</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

export default HonorRollHomeSection;
