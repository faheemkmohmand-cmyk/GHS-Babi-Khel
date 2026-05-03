import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Users, GraduationCap, TrendingUp, Bell, ArrowRight,
  BookOpen, BarChart3, Image, Trophy, Calendar, Newspaper, Shield
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
  { id: "timetable", label: "Timetable", icon: Calendar },
  { id: "results", label: "Results", icon: BarChart3 },
  { id: "notices", label: "Notices", icon: Bell },
  { id: "library", label: "Library", icon: BookOpen },
  { id: "gallery", label: "Gallery", icon: Image },
  { id: "achievements", label: "Achievements", icon: Trophy },
];

interface Props { onNavigate: (tab: string) => void; }

const OverviewTab = ({ onNavigate }: Props) => {
  const { profile } = useAuth();
  const { data: settings, isLoading: settingsLoading } = useSchoolSettings();
  const { data: notices = [], isLoading: noticesLoading } = useNotices(3);
  const { data: news = [], isLoading: newsLoading } = useNews(2);

  // ✅ Check if admin
  const isAdmin = profile?.role === "admin";

  const statsCards = [
    { icon: Users, label: "Students", value: settings?.total_students || 0, color: "gradient-hero" },
    { icon: GraduationCap, label: "Teachers", value: settings?.total_teachers || 0, color: "gradient-accent" },
    { icon: TrendingUp, label: "Pass Rate", value: `${settings?.pass_percentage || 0}%`, color: "gradient-hero" },
    { icon: Bell, label: "Notices", value: notices.length, color: "gradient-accent" },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome + Admin Button */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between gap-4"
      >
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground">
            Welcome back, {profile?.full_name?.split(" ")[0] || "User"}! 👋
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Here's what's happening at GHS Babi Khel.
          </p>
        </div>

        {/* ✅ Admin Panel button — only visible to admins */}
        {isAdmin && (
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-700 text-white font-semibold px-4 py-2.5 rounded-xl shadow-card hover:shadow-elevated transition-all duration-200 shrink-0 text-sm"
          >
            <Shield className="w-4 h-4" />
            Admin Panel
          </Link>
        )}
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {settingsLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
          : statsCards.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className="bg-card rounded-xl p-4 shadow-card"
              >
                <div className={`w-9 h-9 rounded-lg ${s.color} flex items-center justify-center mb-2`}>
                  <s.icon className="w-4 h-4 text-primary-foreground" />
                </div>
                <div className="text-xl font-heading font-bold text-foreground">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </motion.div>
            ))}
      </div>

      {/* Latest notices */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading font-semibold text-foreground">Latest Notices</h3>
          <button
            onClick={() => onNavigate("notices")}
            className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
          >
            View All <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        <div className="space-y-2">
          {noticesLoading
            ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)
            : notices.length === 0
            ? (
              <div className="bg-card rounded-lg p-6 text-center text-muted-foreground text-sm shadow-card">
                No notices yet.
              </div>
            )
            : notices.map((n) => (
                <div
                  key={n.id}
                  className={`bg-card rounded-lg p-3 shadow-card border-l-4 ${n.is_urgent ? "border-l-destructive" : "border-l-primary"} flex items-center gap-3`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(n.created_at), "dd MMM yyyy")}</p>
                  </div>
                  {n.is_urgent && (
                    <span className="text-xs font-semibold bg-destructive/10 text-destructive px-2 py-0.5 rounded-full shrink-0">
                      Urgent
                    </span>
                  )}
                </div>
              ))}
        </div>
      </div>

      {/* Latest news */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading font-semibold text-foreground">Latest News</h3>
          <button
            onClick={() => onNavigate("news")}
            className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
          >
            View All <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {newsLoading
            ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
            : news.length === 0
            ? (
              <div className="bg-card rounded-xl p-6 text-center text-muted-foreground text-sm shadow-card col-span-2">
                No news yet.
              </div>
            )
            : news.map((item) => (
                <div key={item.id} className="bg-card rounded-xl overflow-hidden shadow-card flex">
                  {item.image_url ? (
                    <img src={item.image_url} alt="" className="w-24 h-full object-cover shrink-0" loading="lazy" />
                  ) : (
                    <div className="w-24 gradient-hero flex items-center justify-center shrink-0">
                      <Newspaper className="w-6 h-6 text-primary-foreground/40" />
                    </div>
                  )}
                  <div className="p-3 flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">{format(new Date(item.created_at), "dd MMM yyyy")}</p>
                    <h4 className="text-sm font-semibold text-foreground mt-0.5 line-clamp-2">{item.title}</h4>
                  </div>
                </div>
              ))}
        </div>
      </div>

      {/* Daily Quote */}
      <DailyQuoteCard />

      {/* Live Weather Widget */}
      <WeatherWidget />

      {/* Quick Access */}
      <div>
        <h3 className="font-heading font-semibold text-foreground mb-3">Quick Access</h3>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {quickActions.map((a) => (
            <button
              key={a.id}
              onClick={() => onNavigate(a.id)}
              className="bg-card rounded-xl p-4 shadow-card hover:shadow-elevated transition-all text-center group"
            >
              <div className="w-10 h-10 rounded-lg gradient-hero flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                <a.icon className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xs font-medium text-foreground">{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default OverviewTab;
     
 
