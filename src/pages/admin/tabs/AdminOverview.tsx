import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, GraduationCap, Bell, Newspaper, BookOpen, Image,
  Trophy, UserCog, TrendingUp, ClipboardList, Calendar,
  CheckCircle, Clock, AlertCircle, Activity, ArrowUpRight,
  FileText, Video, DollarSign, BookMarked, Shield,
  RefreshCw,
} from "lucide-react";

/* ─── Data hook ─────────────────────────────────────────────── */
const useAdminStats = () =>
  useQuery({
    queryKey: ["admin-stats-v2"],
    queryFn: async () => {
      const [
        students, teachers, notices, news, library, albums,
        users, achievements, results, pendingUsers,
        admissions, pendingAdmissions, onlineClasses, notes,
      ] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }),
        supabase.from("teachers").select("id", { count: "exact", head: true }),
        supabase.from("notices").select("id", { count: "exact", head: true }),
        supabase.from("news").select("id", { count: "exact", head: true }),
        supabase.from("library_files").select("id", { count: "exact", head: true }),
        supabase.from("gallery_albums").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("achievements").select("id", { count: "exact", head: true }),
        supabase.from("results").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("admissions").select("id", { count: "exact", head: true }),
        supabase.from("admissions").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("online_classes").select("id", { count: "exact", head: true }),
        supabase.from("notes").select("id", { count: "exact", head: true }),
      ]);
      return {
        students: students.count ?? 0,
        teachers: teachers.count ?? 0,
        notices: notices.count ?? 0,
        news: news.count ?? 0,
        library: library.count ?? 0,
        albums: albums.count ?? 0,
        users: users.count ?? 0,
        achievements: achievements.count ?? 0,
        results: results.count ?? 0,
        pendingUsers: pendingUsers.count ?? 0,
        admissions: admissions.count ?? 0,
        pendingAdmissions: pendingAdmissions.count ?? 0,
        onlineClasses: onlineClasses.count ?? 0,
        notes: notes.count ?? 0,
      };
    },
    staleTime: 60_000,
  });

const useRecentActivity = () =>
  useQuery({
    queryKey: ["admin-recent-activity"],
    queryFn: async () => {
      const [notices, news, admissions, users] = await Promise.all([
        supabase.from("notices").select("id, title, created_at").order("created_at", { ascending: false }).limit(3),
        supabase.from("news").select("id, title, created_at").order("created_at", { ascending: false }).limit(3),
        supabase.from("admissions").select("id, full_name, created_at, status").order("created_at", { ascending: false }).limit(3),
        supabase.from("profiles").select("id, full_name, created_at, status").order("created_at", { ascending: false }).limit(3),
      ]);
      type ActivityItem = { id: string; label: string; time: string; type: string; status?: string };
      const items: ActivityItem[] = [
        ...(notices.data ?? []).map((n: any) => ({ id: n.id, label: `Notice: ${n.title}`, time: n.created_at, type: "notice" })),
        ...(news.data ?? []).map((n: any) => ({ id: n.id, label: `News: ${n.title}`, time: n.created_at, type: "news" })),
        ...(admissions.data ?? []).map((a: any) => ({ id: a.id, label: `Admission: ${a.full_name}`, time: a.created_at, type: "admission", status: a.status })),
        ...(users.data ?? []).map((u: any) => ({ id: u.id, label: `User: ${u.full_name || "Unknown"}`, time: u.created_at, type: "user", status: u.status })),
      ];
      return items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 8);
    },
    staleTime: 60_000,
  });

/* ─── Helpers ────────────────────────────────────────────────── */
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function activityIcon(type: string) {
  switch (type) {
    case "notice": return <Bell className="w-3.5 h-3.5" />;
    case "news": return <Newspaper className="w-3.5 h-3.5" />;
    case "admission": return <GraduationCap className="w-3.5 h-3.5" />;
    default: return <UserCog className="w-3.5 h-3.5" />;
  }
}

function activityColor(type: string) {
  switch (type) {
    case "notice": return "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400";
    case "news": return "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400";
    case "admission": return "bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400";
    default: return "bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400";
  }
}

/* ─── Stat Card ─────────────────────────────────────────────── */
interface StatCardProps {
  label: string;
  value: number | undefined;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  isLoading: boolean;
  badge?: { text: string; urgent?: boolean };
}

const StatCard = ({ label, value, icon: Icon, color, bgColor, isLoading, badge }: StatCardProps) => (
  <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-3 hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 relative overflow-hidden">
    <div className="flex items-start justify-between">
      <div className={`w-10 h-10 rounded-xl ${bgColor} flex items-center justify-center shrink-0`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      {badge && (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.urgent ? "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400" : "bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400"}`}>
          {badge.text}
        </span>
      )}
    </div>
    <div>
      {isLoading ? (
        <Skeleton className="h-8 w-16 mb-1" />
      ) : (
        <p className="text-3xl font-extrabold text-foreground tabular-nums">{value ?? 0}</p>
      )}
      <p className="text-xs text-muted-foreground font-medium mt-0.5">{label}</p>
    </div>
    {/* subtle decorative corner */}
    <div className={`absolute -bottom-3 -right-3 w-12 h-12 rounded-full opacity-10 ${bgColor.replace("bg-", "bg-")}`} />
  </div>
);

/* ─── Section Header ────────────────────────────────────────── */
const SectionHeader = ({ icon: Icon, title, action }: { icon: React.ElementType; title: string; action?: React.ReactNode }) => (
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <h3 className="text-base font-bold text-foreground">{title}</h3>
    </div>
    {action}
  </div>
);

/* ─── Pass Rate Ring ────────────────────────────────────────── */
const PassRateRing = ({ value }: { value: number }) => {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(value, 100) / 100) * circumference;
  return (
    <div className="relative w-16 h-16 shrink-0">
      <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="currentColor" strokeWidth="6" className="text-white/15" />
        <circle
          cx="32" cy="32" r={radius} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
          className="text-white transition-all duration-700 ease-out"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-extrabold text-white">{value}%</span>
      </div>
    </div>
  );
};

/* ─── Main Component ─────────────────────────────────────────── */
const AdminOverview = () => {
  const { data: stats, isLoading, isFetching, refetch, dataUpdatedAt } = useAdminStats();
  const { data: activity, isLoading: actLoading } = useRecentActivity();
  const { data: settings } = useSchoolSettings();
  const { profile } = useAuth();

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  const firstName = profile?.full_name?.split(" ")[0] || "Admin";

  const primaryStats = [
    { key: "students" as const,  label: "Total Students",   icon: GraduationCap, color: "text-blue-600 dark:text-blue-400",   bgColor: "bg-blue-100 dark:bg-blue-500/20" },
    { key: "teachers" as const,  label: "Total Teachers",   icon: Users,         color: "text-emerald-600 dark:text-emerald-400", bgColor: "bg-emerald-100 dark:bg-emerald-500/20" },
    { key: "results" as const,   label: "Exam Results",     icon: ClipboardList, color: "text-violet-600 dark:text-violet-400",  bgColor: "bg-violet-100 dark:bg-violet-500/20" },
    { key: "admissions" as const,label: "Admissions",       icon: FileText,      color: "text-orange-600 dark:text-orange-400",  bgColor: "bg-orange-100 dark:bg-orange-500/20",
      badge: stats?.pendingAdmissions ? { text: `${stats.pendingAdmissions} pending`, urgent: true } : undefined },
  ];

  const contentStats = [
    { key: "notices" as const,      label: "Notices",        icon: Bell,       color: "text-amber-600 dark:text-amber-400",  bgColor: "bg-amber-100 dark:bg-amber-500/20" },
    { key: "news" as const,         label: "News Articles",  icon: Newspaper,  color: "text-sky-600 dark:text-sky-400",      bgColor: "bg-sky-100 dark:bg-sky-500/20" },
    { key: "notes" as const,        label: "Study Notes",    icon: BookMarked, color: "text-teal-600 dark:text-teal-400",    bgColor: "bg-teal-100 dark:bg-teal-500/20" },
    { key: "library" as const,      label: "Library Files",  icon: BookOpen,   color: "text-cyan-600 dark:text-cyan-400",    bgColor: "bg-cyan-100 dark:bg-cyan-500/20" },
    { key: "albums" as const,       label: "Gallery Albums", icon: Image,      color: "text-pink-600 dark:text-pink-400",    bgColor: "bg-pink-100 dark:bg-pink-500/20" },
    { key: "onlineClasses" as const,label: "Online Classes", icon: Video,      color: "text-indigo-600 dark:text-indigo-400",bgColor: "bg-indigo-100 dark:bg-indigo-500/20" },
    { key: "achievements" as const, label: "Achievements",   icon: Trophy,     color: "text-yellow-600 dark:text-yellow-400",bgColor: "bg-yellow-100 dark:bg-yellow-500/20" },
    { key: "users" as const,        label: "Registered Users",icon: UserCog,   color: "text-rose-600 dark:text-rose-400",    bgColor: "bg-rose-100 dark:bg-rose-500/20",
      badge: stats?.pendingUsers ? { text: `${stats.pendingUsers} pending`, urgent: true } : undefined },
  ];

  const totalContent = (stats?.notices ?? 0) + (stats?.news ?? 0) + (stats?.notes ?? 0) + (stats?.library ?? 0);
  const urgentCount = (stats?.pendingUsers ?? 0) + (stats?.pendingAdmissions ?? 0);

  return (
    <div className="space-y-6 pb-4">

      {/* ── Welcome Banner ── */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-primary/70 p-5 text-white shadow-lg">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-white -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-white translate-y-1/2 -translate-x-1/2" />
        </div>
        <div className="relative z-10">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-white/70 text-sm font-medium">{greeting},</p>
              <h2 className="text-2xl font-extrabold mt-0.5">{firstName} 👋</h2>
              <p className="text-white/80 text-sm mt-1">{settings?.school_name || "GHS Babi Khel"} — Admin Panel</p>
              <span className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-white/60">
                <Calendar className="w-3 h-3" />
                {now.toLocaleDateString("en-PK", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </span>
            </div>
            <div className="flex flex-col items-center gap-2 shrink-0">
              <PassRateRing value={settings?.pass_percentage ?? 98} />
              <span className="text-[10px] font-semibold text-white/70 uppercase tracking-wide">Pass Rate</span>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            {urgentCount > 0 ? (
              <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-xl px-3 py-2 w-fit">
                <AlertCircle className="w-4 h-4 text-white shrink-0" />
                <p className="text-white text-xs font-semibold">
                  {urgentCount} item{urgentCount > 1 ? "s" : ""} need{urgentCount === 1 ? "s" : ""} your attention
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2 w-fit">
                <CheckCircle className="w-4 h-4 text-white/80 shrink-0" />
                <p className="text-white/80 text-xs font-medium">All caught up — nothing pending</p>
              </div>
            )}
            <Link
              to="/dashboard"
              title="Go to User Dashboard"
              className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0 hover:bg-white/25 transition-colors"
            >
              <Shield className="w-5 h-5 text-white" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── At a Glance ── */}
      <div>
        <SectionHeader
          icon={Activity}
          title="At a Glance"
          action={
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
              {dataUpdatedAt ? `Updated ${timeAgo(new Date(dataUpdatedAt).toISOString())}` : "Refresh"}
            </button>
          }
        />
        <div className="grid grid-cols-2 gap-3">
          {/* Summary strip */}
          <div className="col-span-2 grid grid-cols-3 gap-2">
            {[
              { label: "Pass Rate", value: `${settings?.pass_percentage ?? 98}%`, icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
              { label: "Est. Year", value: settings?.established_year ?? 2018, icon: Calendar, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-500/10" },
              { label: "Content Items", value: isLoading ? "…" : totalContent, icon: FileText, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-500/10" },
            ].map((item) => (
              <div key={item.label} className={`${item.bg} border border-border rounded-xl p-3 flex flex-col gap-1`}>
                <item.icon className={`w-4 h-4 ${item.color}`} />
                <p className={`text-lg font-extrabold ${item.color}`}>{item.value}</p>
                <p className="text-[11px] text-muted-foreground font-medium">{item.label}</p>
              </div>
            ))}
          </div>

          {primaryStats.map((s) => (
            <StatCard
              key={s.key}
              label={s.label}
              value={stats?.[s.key]}
              icon={s.icon}
              color={s.color}
              bgColor={s.bgColor}
              isLoading={isLoading}
              badge={(s as any).badge}
            />
          ))}
        </div>
      </div>

      {/* ── Content & Resources ── */}
      <div>
        <SectionHeader icon={BookOpen} title="Content & Resources" />
        <div className="grid grid-cols-2 gap-3">
          {contentStats.map((s) => (
            <StatCard
              key={s.key}
              label={s.label}
              value={stats?.[s.key]}
              icon={s.icon}
              color={s.color}
              bgColor={s.bgColor}
              isLoading={isLoading}
              badge={(s as any).badge}
            />
          ))}
        </div>
      </div>

      {/* ── Pending Alerts ── */}
      {!isLoading && ((stats?.pendingUsers ?? 0) > 0 || (stats?.pendingAdmissions ?? 0) > 0) && (
        <div>
          <SectionHeader icon={AlertCircle} title="Needs Attention" />
          <div className="space-y-2">
            {(stats?.pendingUsers ?? 0) > 0 && (
              <div className="flex items-center gap-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-3.5">
                <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-500/20 flex items-center justify-center shrink-0">
                  <UserCog className="w-4 h-4 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400">{stats?.pendingUsers} User{(stats?.pendingUsers ?? 0) > 1 ? "s" : ""} Awaiting Approval</p>
                  <p className="text-xs text-red-600/70 dark:text-red-400/70">Go to Extras → Pending Users</p>
                </div>
                <ArrowUpRight className="w-4 h-4 text-red-500 shrink-0" />
              </div>
            )}
            {(stats?.pendingAdmissions ?? 0) > 0 && (
              <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-3.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">{stats?.pendingAdmissions} Admission{(stats?.pendingAdmissions ?? 0) > 1 ? "s" : ""} Pending Review</p>
                  <p className="text-xs text-amber-600/70 dark:text-amber-400/70">Go to Admissions tab</p>
                </div>
                <ArrowUpRight className="w-4 h-4 text-amber-500 shrink-0" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Recent Activity ── */}
      <div>
        <SectionHeader icon={Clock} title="Recent Activity" />
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {actLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-7 h-7 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
     
