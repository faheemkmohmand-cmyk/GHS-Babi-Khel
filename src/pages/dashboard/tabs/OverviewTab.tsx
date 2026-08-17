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

const quickActions = [
  { id: "timetable", label: "Timetable", emoji: "📅", desc: "View schedule" },
  { id: "results", label: "Results", emoji: "📝", desc: "Check scores" },
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
    <div className="space-y-8">

      {/* ── Hero Welcome Banner ── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-emerald-800 to-primary/80 p-6 sm:p-8 shadow-xl"
      >
        {/* decorative texture */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{
          backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }} />
        <div className="pointer-events-none absolute -top-10 -right-10 w-56 h-56 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 w-48 h-48 rounded-full bg-gold/10 blur-2xl" />
        <div className="pointer-events-none absolute top-1/2 right-16 w-24 h-24 rounded-full border border-white/10" />

        <div className="relative flex flex-col sm:flex-row sm:items-start justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-1.5 bg-white/10 backdrop-blur-sm border border-white/15 rounded-full px-3 py-1 mb-3">
              <Clock className="w-3 h-3 text-primary-foreground/80" />
              <span className="text-primary-foreground/85 text-[11px] font-semibold tracking-wide">
                {format(new Date(), "EEEE, dd MMMM yyyy")}
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-heading font-extrabold text-primary-foreground leading-tight tracking-tight">
              {greeting()}, {profile?.full_name?.split(" ")[0] || "User"}
              <span className="inline-block ml-1">👋</span>
            </h2>
            <p className="text-primary-foreground/70 text-sm sm:text-[15px] mt-2 max-w-sm leading-relaxed">
              Here's your personalised school overview for today.
            </p>
          </div>
          {isAdmin && (
            <Link
              to="/admin"
              className="inline-flex items-center gap-2 bg-white text-primary font-bold px-5 py-3 rounded-2xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 shrink-0 text-sm"
            >
              <Shield className="w-4 h-4" />
              Admin Panel
              <ArrowRight className="w-3.5 h-3.5 opacity-60" />
            </Link>
          )}
        </div>
      </motion.div>

      {/* ── Key Stats ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
            </div>
            <h3 className="font-heading font-bold text-foreground text-sm uppercase tracking-wider">School Overview</h3>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground bg-secondary/60 hover:bg-secondary px-2.5 py-1.5 rounded-full transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
            {dataUpdatedAt ? `Updated ${timeAgo(dataUpdatedAt)}` : "Refresh"}
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {settingsLoading
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)
            : statsCards.map((s, i) => (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  whileHover={{ y: -3 }}
                  className="relative overflow-hidden rounded-2xl p-5 shadow-card hover:shadow-elevated bg-card border border-border/50 transition-shadow duration-200"
                >
                  <div className={`pointer-events-none absolute -top-6 -right-6 w-20 h-20 rounded-full bg-gradient-to-br ${s.color} opacity-[0.08]`} />
                  <div className="relative flex items-start justify-between mb-4">
                    <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${s.color} flex items-center justify-center shadow-md`}>
                      <s.icon className="w-5 h-5 text-white" />
                    </div>
                    {"trend" in s && s.trend && (
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                        s.trend === "Excellent" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" :
                        s.trend === "Good" ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400" :
                        "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                      }`}>{s.trend}</span>
                    )}
                  </div>
                  <div className="relative text-3xl font-heading font-extrabold text-foreground tracking-tight">{s.value}</div>
                  <div className="relative text-xs text-muted-foreground font-semibold mt-1">{s.label}</div>
                </motion.div>
              ))}
        </div>
      </div>

      {/* ── Quick Access ── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
            <ArrowRight className="w-3.5 h-3.5 text-accent" />
          </div>
          <h3 className="font-heading font-bold text-foreground text-sm uppercase tracking-wider">Quick Access</h3>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
          {quickActions.map((a, i) => (
            <motion.button
              key={a.id}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04 }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onNavigate(a.id)}
              className="relative overflow-hidden bg-card rounded-2xl p-4 shadow-card hover:shadow-elevated transition-shadow text-center group border border-border/40 hover:border-primary/30"
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/0 to-primary/0 group-hover:from-primary/[0.03] group-hover:to-accent/[0.03] transition-colors" />
              <div className="relative w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-2.5 group-hover:scale-110 group-hover:bg-primary/10 transition-all duration-200">
                <span className="text-xl leading-none select-none" aria-hidden>{a.emoji}</span>
              </div>
              <span className="relative text-xs font-bold text-foreground block">{a.label}</span>
              <span className="relative text-[10px] text-muted-foreground hidden md:block mt-0.5">{a.desc}</span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* ── Latest Notices ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Bell className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <h3 className="font-heading font-bold text-foreground text-sm uppercase tracking-wider">Latest Notices</h3>
          </div>
          <Link
            to="/news"
            className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
          >
            View All <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="space-y-2.5">
          {noticesLoading
            ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)
            : notices.length === 0
            ? (
              <div className="bg-card rounded-2xl p-8 text-center shadow-card border border-border/40">
                <Bell className="w-8 h-8 text-muted-foreground/25 mx-auto mb-2" />
                <p className="text-muted-foreground text-sm font-medium">No notices yet.</p>
              </div>
            )
            : notices.map((n, i) => (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`bg-card rounded-2xl p-4 shadow-card hover:shadow-elevated transition-shadow border border-border/40 border-l-4 ${n.is_urgent ? "border-l-destructive" : "border-l-primary"} flex items-center gap-3`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-medium">{format(new Date(n.created_at), "dd MMM yyyy")}</p>
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
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Newspaper className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <h3 className="font-heading font-bold text-foreground text-sm uppercase tracking-wider">Latest News</h3>
          </div>
          <Link
            to="/news"
            className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
          >
            View All <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {newsLoading
            ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)
            : news.length === 0
            ? (
              <div className="bg-card rounded-2xl p-8 text-center shadow-card border border-border/40 col-span-2">
                <Newspaper className="w-8 h-8 text-muted-foreground/25 mx-auto mb-2" />
                <p className="text-muted-foreground text-sm font-medium">No news yet.</p>
              </div>
            )
            : news.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="bg-card rounded-2xl overflow-hidden shadow-card border border-border/40 flex group hover:shadow-elevated transition-all"
                >
                  {item.image_url ? (
                    <img src={item.image_url} alt="" className="w-28 h-full object-cover shrink-0" loading="lazy" />
                  ) : (
                    <div className="w-28 gradient-hero flex items-center justify-center shrink-0">
                      <Newspaper className="w-6 h-6 text-primary-foreground/40" />
                    </div>
                  )}
                  <div className="p-4 flex-1 min-w-0 flex flex-col justify-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-bold">{format(new Date(item.created_at), "dd MMM yyyy")}</p>
                    <h4 className="text-sm font-bold text-foreground mt-1 line-clamp-2 group-hover:text-primary transition-colors">{item.title}</h4>
                  </div>
                </motion.div>
              ))}
        </div>
      </div>

      {/* Daily Quote */}
      <DailyQuoteCard />

    </div>
  );
};

export default OverviewTab;
