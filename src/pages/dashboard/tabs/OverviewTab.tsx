import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Users, GraduationCap, TrendingUp, Bell, ArrowRight,
  Newspaper, Shield, ChevronRight, Sparkles, Clock, RefreshCw
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { useNotices } from "@/hooks/useNotices";
import { useNews } from "@/hooks/useNews";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import DailyQuoteCard from "@/components/shared/DailyQuoteCard";
import WeatherWidget from "@/components/shared/WeatherWidget";

const quickActions = [
  { id: "timetable", label: "Timetable", emoji: "📅", desc: "View schedule" },
  { id: "results", label: "Results", emoji: "📝", desc: "Check scores" },
  { id: "notices", label: "Notices", emoji: "📢", desc: "Announcements" },
  { id: "library", label: "Library", emoji: "📚", desc: "Study resources" },
  { id: "gallery", label: "Gallery", emoji: "🎬", desc: "Photo gallery" },
  { id: "achievements", label: "Achievements", emoji: "🏆", desc: "Honor roll" },
];

function timeAgo(ms: number) {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface Props { onNavigate: (tab: string) => void; }

const OverviewTab = ({ onNavigate }: Props) => {
  const { profile } = useAuth();
  const { data: settings, isLoading: settingsLoading, refetch, isFetching, dataUpdatedAt } = useSchoolSettings();
  const { data: notices = [], isLoading: noticesLoading } = useNotices(3);
  const { data: news = [], isLoading: newsLoading } = useNews(2);

  const isAdmin = profile?.role === "admin";

  const passRate = settings?.pass_percentage || 0;
  const statsCards = [
    { icon: Users, label: "Total Students", value: settings?.total_students || 0, color: "from-blue-500 to-blue-600", light: "bg-blue-50 dark:bg-blue-950/40" },
    { icon: GraduationCap, label: "Teaching Staff", value: settings?.total_teachers || 0, color: "from-emerald-500 to-emerald-600", light: "bg-emerald-50 dark:bg-emerald-950/40" },
    { icon: TrendingUp, label: "Pass Rate", value: `${passRate}%`, color: "from-violet-500 to-violet-600", light: "bg-violet-50 dark:bg-violet-950/40",
      trend: passRate >= 90 ? "Excellent" : passRate >= 75 ? "Good" : "Watch" },
    { icon: Bell, label: "Active Notices", value: notices.length, color: "from-amber-500 to-amber-600", light: "bg-amber-50 dark:bg-amber-950/40" },
  ];

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="space-y-7">

      {/* ── Hero Welcome Banner ── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-primary/70 p-6 shadow-lg"
      >
        {/* decorative circles */}
        <div className="pointer-events-none absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-6 -left-6 w-28 h-28 rounded-full bg-white/5" />

        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="text-primary-foreground/70 text-sm font-medium flex items-center gap-1.5 mb-1">
              <Clock className="w-3.5 h-3.5" />
              {format(new Date(), "EEEE, dd MMMM yyyy")}
            </p>
            <h2 className="text-2xl font-heading font-bold text-primary-foreground">
              {greeting()}, {profile?.full_name?.split(" ")[0] || "User"}! 👋
            </h2>
            <p className="text-primary-foreground/65 text-sm mt-1 max-w-xs">
              Here's your personalised school overview for today.
            </p>
          </div>
          {isAdmin && (
            <Link
              to="/admin"
              className="inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white font-semibold px-4 py-2.5 rounded-xl backdrop-blur-sm transition-all duration-200 shrink-0 text-sm border border-white/20"
            >
              <Shield className="w-4 h-4" />
              Admin Panel
            </Link>
          )}
        </div>
      </motion.div>

      {/* ── Key Stats ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="font-heading font-semibold text-foreground text-sm uppercase tracking-wide">School Overview</h3>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
            {dataUpdatedAt ? `Updated ${timeAgo(dataUpdatedAt)}` : "Refresh"}
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {settingsLoading
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
            : statsCards.map((s, i) => (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className={`relative overflow-hidden rounded-2xl p-5 shadow-card ${s.light} border border-border/40`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center shadow-sm`}>
                      <s.icon className="w-5 h-5 text-white" />
                    </div>
                    {"trend" in s && s.trend && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        s.trend === "Excellent" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" :
                        s.trend === "Good" ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400" :
                        "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                      }`}>{s.trend}</span>
                    )}
                  </div>
                  <div className="text-2xl font-heading font-bold text-foreground">{s.value}</div>
                  <div className="text-xs text-muted-foreground font-medium mt-0.5">{s.label}</div>
                </motion.div>
              ))}
        </div>
      </div>

      {/* ── Quick Access ── */}
      <div>
        <h3 className="font-heading font-semibold text-foreground mb-4">Quick Access</h3>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {quickActions.map((a, i) => (
            <motion.button
              key={a.id}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => onNavigate(a.id)}
              className="bg-card rounded-2xl p-4 shadow-card hover:shadow-elevated transition-all text-center group border border-border/30 hover:border-accent/40"
            >
              <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center mx-auto mb-2.5 group-hover:scale-110 transition-transform">
                <span className="text-xl leading-none select-none" aria-hidden>{a.emoji}</span>
              </div>
              <span className="text-xs font-semibold text-foreground block">{a.label}</span>
              <span className="text-[10px] text-muted-foreground hidden md:block mt-0.5">{a.desc}</span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* ── Latest Notices ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-semibold text-foreground">Latest Notices</h3>
          <button
            onClick={() => onNavigate("notices")}
            className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
          >
            View All <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="space-y-2.5">
          {noticesLoading
            ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)
            : notices.length === 0
            ? (
              <div className="bg-card rounded-xl p-6 text-center text-muted-foreground text-sm shadow-card border border-border/30">
                No notices yet.
              </div>
            )
            : notices.map((n) => (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`bg-card rounded-xl p-4 shadow-card border border-border/30 border-l-4 ${n.is_urgent ? "border-l-destructive" : "border-l-primary"} flex items-center gap-3`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(n.created_at), "dd MMM yyyy")}</p>
                  </div>
                  {n.is_urgent && (
                    <span className="text-[10px] font-bold bg-destructive/10 text-destructive px-2.5 py-1 rounded-full shrink-0 uppercase tracking-wide">
                      Urgent
                    </span>
                  )}
                </motion.div>
              ))}
        </div>
      </div>

      {/* ── Latest News ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-semibold text-foreground">Latest News</h3>
          <button
            onClick={() => onNavigate("news")}
            className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
          >
            View All <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {newsLoading
            ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)
            : news.length === 0
            ? (
              <div className="bg-card rounded-2xl p-6 text-center text-muted-foreground text-sm shadow-card border border-border/30 col-span-2">
                No news yet.
              </div>
            )
            : news.map((item) => (
                <div key={item.id} className="bg-card rounded-2xl overflow-hidden shadow-card border border-border/30 flex group hover:shadow-elevated transition-all">
                  {item.image_url ? (
                    <img src={item.image_url} alt="" className="w-28 h-full object-cover shrink-0" loading="lazy" />
                  ) : (
                    <div className="w-28 gradient-hero flex items-center justify-center shrink-0">
                      <Newspaper className="w-6 h-6 text-primary-foreground/40" />
                    </div>
                  )}
                  <div className="p-4 flex-1 min-w-0 flex flex-col justify-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">{format(new Date(item.created_at), "dd MMM yyyy")}</p>
                    <h4 className="text-sm font-semibold text-foreground mt-1 line-clamp-2 group-hover:text-primary transition-colors">{item.title}</h4>
                  </div>
                </div>
              ))}
        </div>
      </div>

      {/* Daily Quote */}
      <DailyQuoteCard />

      {/* Live Weather Widget */}
      <WeatherWidget />

    </div>
  );
};

export default OverviewTab;

     
