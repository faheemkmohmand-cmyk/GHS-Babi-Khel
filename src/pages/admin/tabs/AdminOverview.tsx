import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, GraduationCap, Bell, Newspaper, BookOpen, Image as ImageIcon,
  Trophy, UserCog, TrendingUp, ClipboardList, Calendar,
  CheckCircle, AlertCircle, Activity, ArrowUpRight,
  FileText, BookMarked, MapPin, Landmark, Phone, Mail, Hash,
  Settings, RefreshCw,
} from "lucide-react";

/* ─── Data hook ─────────────────────────────────────────────── */
const useAdminStats = () =>
  useQuery({
    queryKey: ["admin-stats-v2"],
    queryFn: async () => {
      const [
        students, teachers, notices, news, library, albums,
        users, achievements, results, pendingUsers,
        admissions, pendingAdmissions, notes,
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
      // `label` is the bare subject — the row renders its own type kicker and
      // icon, so baking "Notice: " / "User: " into the string would print the
      // category twice on every line.
      type ActivityItem = { id: string; label: string; time: string; type: string; status?: string };
      const items: ActivityItem[] = [
        ...(notices.data ?? []).map((n: any) => ({ id: n.id, label: n.title || "Untitled notice", time: n.created_at, type: "notice" })),
        ...(news.data ?? []).map((n: any) => ({ id: n.id, label: n.title || "Untitled article", time: n.created_at, type: "news" })),
        ...(admissions.data ?? []).map((a: any) => ({ id: a.id, label: a.full_name || "Unknown applicant", time: a.created_at, type: "admission", status: a.status })),
        ...(users.data ?? []).map((u: any) => ({ id: u.id, label: u.full_name || "Unknown user", time: u.created_at, type: "user", status: u.status })),
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

/** Thousands separator so 5-digit counts never read as a wall of digits. */
const n = (v: number | undefined | null) => (v ?? 0).toLocaleString("en-US");

/* ─── Stat tone system ───────────────────────────────────────────
   One consistent chip / glyph / glow per stat. The glow is a plain
   radial-gradient on a rounded div rather than `blur()` — index.css
   already strips backdrop-filter and heavy animation for Android GPU
   health, and a painted gradient costs nothing where a blur would
   force a compositing layer on every card. */
interface Tone {
  chip: string;
  fg: string;
  ring: string;
  hsl: string;
}

const TONES: Record<string, Tone> = {
  azure:   { chip: "bg-blue-50 dark:bg-blue-500/15",       fg: "text-blue-600 dark:text-blue-400",         ring: "ring-blue-600/10 dark:ring-blue-400/25",         hsl: "217 91% 60%" },
  emerald: { chip: "bg-emerald-50 dark:bg-emerald-500/15", fg: "text-emerald-600 dark:text-emerald-400",   ring: "ring-emerald-600/10 dark:ring-emerald-400/25",   hsl: "160 72% 45%" },
  violet:  { chip: "bg-violet-50 dark:bg-violet-500/15",   fg: "text-violet-600 dark:text-violet-400",     ring: "ring-violet-600/10 dark:ring-violet-400/25",     hsl: "258 90% 66%" },
  amber:   { chip: "bg-amber-50 dark:bg-amber-500/15",     fg: "text-amber-600 dark:text-amber-400",       ring: "ring-amber-600/10 dark:ring-amber-400/25",       hsl: "38 92% 50%" },
  sky:     { chip: "bg-sky-50 dark:bg-sky-500/15",         fg: "text-sky-600 dark:text-sky-400",           ring: "ring-sky-600/10 dark:ring-sky-400/25",           hsl: "199 89% 48%" },
  teal:    { chip: "bg-teal-50 dark:bg-teal-500/15",       fg: "text-teal-600 dark:text-teal-400",         ring: "ring-teal-600/10 dark:ring-teal-400/25",         hsl: "173 80% 40%" },
  cyan:    { chip: "bg-cyan-50 dark:bg-cyan-500/15",       fg: "text-cyan-600 dark:text-cyan-400",         ring: "ring-cyan-600/10 dark:ring-cyan-400/25",         hsl: "188 86% 43%" },
  pink:    { chip: "bg-pink-50 dark:bg-pink-500/15",       fg: "text-pink-600 dark:text-pink-400",         ring: "ring-pink-600/10 dark:ring-pink-400/25",         hsl: "330 81% 60%" },
  gold:    { chip: "bg-amber-50 dark:bg-amber-500/15",     fg: "text-amber-600 dark:text-amber-400",       ring: "ring-amber-600/10 dark:ring-amber-400/25",       hsl: "43 89% 44%" },
  rose:    { chip: "bg-rose-50 dark:bg-rose-500/15",       fg: "text-rose-600 dark:text-rose-400",         ring: "ring-rose-600/10 dark:ring-rose-400/25",         hsl: "347 77% 50%" },
};

/* ─── Stat Card ─────────────────────────────────────────────── */
interface StatCardProps {
  label: string;
  value: number | undefined;
  icon: React.ElementType;
  tone: Tone;
  isLoading: boolean;
  badge?: { text: string; urgent?: boolean };
}

const StatCard = ({ label, value, icon: Icon, tone, isLoading, badge }: StatCardProps) => (
  <div className="group relative overflow-hidden rounded-2xl border border-border/80 bg-card p-4 shadow-card transition-[box-shadow,border-color] duration-200 hover:border-primary/30 hover:shadow-elevated sm:p-[18px]">
    {/* tone wash — decorative only */}
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-80 transition-opacity duration-300 group-hover:opacity-100"
      style={{ background: `radial-gradient(circle, hsla(${tone.hsl} / 0.20), transparent 70%)` }}
    />
    <div className="relative flex items-start justify-between gap-2">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset ${tone.chip} ${tone.ring}`}>
        <Icon className={`h-[18px] w-[18px] ${tone.fg}`} aria-hidden="true" />
      </span>
      {badge && (
        <span
          className={`shrink-0 rounded-full px-2 py-[3px] text-[10px] font-bold leading-none tracking-wide ring-1 ring-inset ${
            badge.urgent
              ? "bg-rose-50 text-rose-600 ring-rose-500/20 dark:bg-rose-500/15 dark:text-rose-300"
              : "bg-emerald-50 text-emerald-700 ring-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-300"
          }`}
        >
          {badge.text}
        </span>
      )}
    </div>
    <div className="relative mt-3.5">
      {isLoading ? (
        <Skeleton className="h-7 w-14 rounded-md" />
      ) : (
        <p className="text-[26px] font-extrabold leading-none tabular-nums tracking-tight text-foreground sm:text-[28px]">
          {n(value)}
        </p>
      )}
      <p className="mt-2 text-[11px] font-semibold uppercase leading-tight tracking-[0.07em] text-muted-foreground">
        {label}
      </p>
    </div>
  </div>
);

/* ─── Section Header ────────────────────────────────────────── */
const SectionHeader = ({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) => (
  <div className="mb-3.5 flex items-end justify-between gap-3 sm:mb-4">
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h3 className="truncate text-[15px] font-bold leading-tight tracking-tight text-foreground">{title}</h3>
        {subtitle && <p className="truncate text-[11px] leading-tight text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
    {action}
  </div>
);

/* ─── Pass Rate Ring — emerald→gold gradient arc, theme-safe ── */
const PassRateRing = ({ value }: { value: number }) => {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(Math.max(value, 0), 100);
  const offset = circumference - (pct / 100) * circumference;
  return (
    <div className="relative h-[4rem] w-[4rem] shrink-0 sm:h-[5.25rem] sm:w-[5.25rem]">
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="ghsPassRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(160,84%,45%)" />
            <stop offset="55%" stopColor="hsl(158,70%,52%)" />
            <stop offset="100%" stopColor="hsl(43,80%,64%)" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r={radius} fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth="5.5" />
        <circle
          cx="32" cy="32" r={radius} fill="none" stroke="url(#ghsPassRingGrad)" strokeWidth="5.5" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
          style={{ filter: "drop-shadow(0 0 5px hsla(160,84%,45%,0.4))" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[15px] font-extrabold tabular-nums leading-none text-white sm:text-[17px]">{pct}%</span>
        <span className="mt-0.5 text-[7px] font-bold uppercase tracking-[0.18em] text-white/40 sm:text-[8px]">Pass</span>
      </div>
    </div>
  );
};

/* ─── Activity meta ─────────────────────────────────────────── */
const ACTIVITY_META: Record<string, { Icon: React.ElementType; chip: string; kicker: string }> = {
  notice:    { Icon: Bell,          chip: "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",   kicker: "Notice" },
  news:      { Icon: Newspaper,     chip: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",       kicker: "News" },
  admission: { Icon: GraduationCap, chip: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400", kicker: "Admission" },
  user:      { Icon: UserCog,       chip: "bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400", kicker: "User" },
};

const activityMeta = (type: string) => ACTIVITY_META[type] ?? ACTIVITY_META.user;

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

  /* Primary KPIs — 4 tiles: 2-up on a phone, 4-up from lg. */
  const primaryStats = [
    { key: "students" as const,   label: "Students",   icon: GraduationCap, tone: TONES.azure },
    { key: "teachers" as const,   label: "Teachers",   icon: Users,         tone: TONES.emerald },
    { key: "results" as const,    label: "Results",    icon: ClipboardList, tone: TONES.violet },
    { key: "admissions" as const, label: "Admissions", icon: FileText,      tone: TONES.gold,
      badge: stats?.pendingAdmissions ? { text: `${n(stats.pendingAdmissions)} pending`, urgent: true } : undefined },
  ];

  /* Split the remaining 7 into 3 + 4 so every row closes cleanly —
     a single 7-tile block always leaves a half-width orphan. */
  const publishingStats = [
    { key: "notices" as const, label: "Notices",       icon: Bell,       tone: TONES.amber },
    { key: "news" as const,    label: "News Articles", icon: Newspaper,  tone: TONES.sky },
    { key: "notes" as const,   label: "Study Notes",   icon: BookMarked, tone: TONES.teal },
  ];

  const resourceStats = [
    { key: "library" as const,      label: "Library Files",    icon: BookOpen, tone: TONES.cyan },
    { key: "albums" as const,       label: "Gallery Albums",   icon: ImageIcon, tone: TONES.pink },
    { key: "achievements" as const, label: "Achievements",     icon: Trophy,   tone: TONES.gold },
    { key: "users" as const,        label: "Registered Users", icon: UserCog,  tone: TONES.rose,
      badge: stats?.pendingUsers ? { text: `${n(stats.pendingUsers)} pending`, urgent: true } : undefined },
  ];

  const quickActions = [
    { tab: "admissions", label: "Admissions", icon: GraduationCap },
    { tab: "users",       label: "Users",       icon: UserCog },
    { tab: "notices",     label: "Notices",     icon: Bell },
    { tab: "results",     label: "Results",     icon: ClipboardList },
    { tab: "settings",    label: "Settings",    icon: Settings },
  ];

  const totalContent = (stats?.notices ?? 0) + (stats?.news ?? 0) + (stats?.notes ?? 0) + (stats?.library ?? 0);
  const urgentCount = (stats?.pendingUsers ?? 0) + (stats?.pendingAdmissions ?? 0);

  const vitals = [
    { label: "Established", value: String(settings?.established_year ?? 2018), icon: Landmark, tone: TONES.azure },
    { label: "Content Items", value: isLoading ? "—" : n(totalContent), icon: TrendingUp, tone: TONES.violet },
    { label: "Board Result", value: settings?.board_results || "—", icon: Trophy, tone: TONES.gold },
  ];

  const identity = [
    { Icon: MapPin,  label: "Address",  value: settings?.address || "District Mohmand, KPK" },
    { Icon: Landmark, label: "Established", value: String(settings?.established_year || 2018) },
    { Icon: Hash,   label: "EMIS Code", value: settings?.emis_code || "60673" },
    { Icon: Phone,  label: "Phone",    value: settings?.phone || null },
    { Icon: Mail,   label: "Email",    value: settings?.email || null },
  ].filter((row) => !!row.value);

  return (
    <div className="space-y-7 pb-4 sm:space-y-8">

      {/* ── Welcome Banner — "Emerald Prestige", theme-safe ──
          Never derives its surface from --primary: dark theme maps
          primary → antique gold, which previously flood-filled this
          card gold. Light = deep emerald, dark = near-black emerald;
          gold is reserved for hairline accents. */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 p-5 text-white shadow-[0_18px_45px_-20px_rgba(0,0,0,0.5)] sm:p-6 lg:p-7 bg-[linear-gradient(140deg,hsl(160_48%_13%)_0%,hsl(161_42%_17%)_52%,hsl(160_36%_23%)_100%)] dark:bg-[linear-gradient(140deg,hsl(165_32%_8%)_0%,hsl(164_26%_11%)_52%,hsl(162_22%_13%)_100%)]">
        {/* Ambient decor: emerald glow, faint gold bloom, gold hairline, dot texture */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -right-14 -top-24 h-72 w-72 rounded-full" style={{ background: "radial-gradient(circle, hsla(160,55%,38%,0.30), transparent 62%)" }} />
          <div className="absolute -bottom-24 -left-12 h-60 w-60 rounded-full" style={{ background: "radial-gradient(circle, hsla(43,60%,58%,0.12), transparent 60%)" }} />
          <div className="absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent 5%, hsla(43,70%,70%,0.55) 50%, transparent 95%)" }} />
          <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(hsla(0,0%,100%,0.55) 0.5px, transparent 0.5px)", backgroundSize: "16px 16px", opacity: 0.045 }} />
        </div>

        <div className="relative z-10">
          <div className="flex items-start justify-between gap-3 sm:gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" style={{ boxShadow: "0 0 8px hsla(43,65%,62%,0.9)" }} />
                <span className="truncate text-[10px] font-bold uppercase tracking-[0.2em] text-gold-soft dark:text-gold">Admin Console</span>
              </div>
              <p className="mt-2.5 text-[13px] font-medium text-white/60">{greeting},</p>
              <h2 className="mt-0.5 font-heading text-[24px] font-extrabold leading-tight tracking-tight text-white sm:text-[28px]">
                {firstName} <span className="text-xl">👋</span>
              </h2>
              <p className="mt-1.5 flex flex-wrap items-center text-sm font-medium text-white/75">
                <span className="max-w-full truncate">{settings?.school_name || "GHS Babi Khel"}</span>
                <span className="mx-1.5 text-white/30">•</span>
                <span className="text-white/55">Admin Panel</span>
              </p>
              <span className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-white/50">
                <Calendar className="h-3 w-3 text-white/40" />
                {now.toLocaleDateString("en-PK", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </span>
            </div>
            <div className="flex shrink-0 flex-col items-center gap-2">
              <PassRateRing value={settings?.pass_percentage ?? 98} />
              <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/50">Pass Rate</span>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            {urgentCount > 0 ? (
              <div className="flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.07] px-3.5 py-2.5 sm:w-auto">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inset-0 rounded-full bg-amber-400/70" />
                  <span className="relative h-2 w-2 rounded-full bg-amber-400" />
                </span>
                <p className="text-xs font-semibold text-white">
                  {urgentCount} item{urgentCount > 1 ? "s" : ""} need{urgentCount === 1 ? "s" : ""} your attention
                </p>
              </div>
            ) : (
              <div className="flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 sm:w-auto">
                <CheckCircle className="h-4 w-4 shrink-0 text-emerald-300" />
                <p className="text-xs font-medium text-white/85">All caught up — nothing pending</p>
              </div>
            )}

            {/* Sync state — moves here so the top of the page always says
                how fresh the numbers below actually are. */}
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="ml-auto flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-[11px] font-medium text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-50 sm:ml-0"
            >
              <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
              {isFetching ? "Syncing…" : dataUpdatedAt ? `Synced ${timeAgo(new Date(dataUpdatedAt).toISOString())}` : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Vitals strip — three short, high-signal figures ── */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {vitals.map((v) => (
          <div
            key={v.label}
            className="relative overflow-hidden rounded-2xl border border-border/80 bg-card p-3 shadow-card sm:p-4"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-80 transition-opacity duration-300 group-hover:opacity-100"
              style={{ background: `radial-gradient(circle, hsla(${v.tone.hsl} / 0.20), transparent 70%)` }}
            />
            <div className="relative">
              <v.icon className={`h-3.5 w-3.5 ${v.tone.fg}`} aria-hidden="true" />
              <p className={`mt-2 text-lg font-extrabold leading-none tabular-nums sm:text-xl ${v.tone.fg}`}>{v.value}</p>
              <p className="mt-1.5 text-[9px] font-semibold uppercase leading-tight tracking-[0.06em] text-muted-foreground sm:text-[10px] sm:tracking-[0.08em]">
                {v.label}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ── At a Glance ── */}
      <div>
        <SectionHeader
          icon={Activity}
          title="At a Glance"
          subtitle="Live totals from the school database"
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {primaryStats.map((s) => (
            <StatCard
              key={s.key}
              label={s.label}
              value={stats?.[s.key]}
              icon={s.icon}
              tone={s.tone}
              isLoading={isLoading}
              badge={(s as any).badge}
            />
          ))}
        </div>
      </div>

      {/* ── Quick actions — real destinations, not decoration ── */}
      <div>
        <SectionHeader icon={TrendingUp} title="Quick Actions" subtitle="Jump straight to a common task" />
        <div className="flex flex-wrap gap-2">
          {quickActions.map((a) => (
            <Link
              key={a.tab}
              to={`/admin?tab=${a.tab}`}
              className="group inline-flex items-center gap-2 rounded-full border border-border/80 bg-card px-3.5 py-2 text-[13px] font-semibold text-foreground shadow-card transition-[box-shadow,border-color,color] duration-200 hover:border-primary/40 hover:text-primary hover:shadow-elevated"
            >
              <a.icon className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true" />
              {a.label}
              <ArrowUpRight className="h-3 w-3 text-muted-foreground/50 transition-colors group-hover:text-primary" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </div>

      {/* ── Needs Attention ── */}
      {!isLoading && ((stats?.pendingUsers ?? 0) > 0 || (stats?.pendingAdmissions ?? 0) > 0) && (
        <div>
          <SectionHeader icon={AlertCircle} title="Needs Attention" subtitle="Open items waiting on an admin decision" />
          <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
            {(stats?.pendingUsers ?? 0) > 0 && (
              <Link
                to="/admin?tab=users"
                className="group flex items-center gap-3 rounded-2xl border border-rose-200/80 bg-rose-50/70 p-3.5 transition-[box-shadow,border-color] duration-200 hover:border-rose-300 hover:shadow-elevated dark:border-rose-500/20 dark:bg-rose-500/10 dark:hover:border-rose-400/40"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-600 ring-1 ring-inset ring-rose-500/20 dark:bg-rose-500/20 dark:text-rose-300">
                  <UserCog className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold leading-tight text-rose-700 dark:text-rose-300">
                    {n(stats?.pendingUsers)} User{(stats?.pendingUsers ?? 0) > 1 ? "s" : ""} Awaiting Approval
                  </p>
                  <p className="mt-0.5 text-xs text-rose-600/75 dark:text-rose-300/70">Open Users → Pending Requests</p>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-rose-500 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
              </Link>
            )}
            {(stats?.pendingAdmissions ?? 0) > 0 && (
              <Link
                to="/admin?tab=admissions"
                className="group flex items-center gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-3.5 transition-[box-shadow,border-color] duration-200 hover:border-amber-300 hover:shadow-elevated dark:border-amber-500/20 dark:bg-amber-500/10 dark:hover:border-amber-400/40"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-600 ring-1 ring-inset ring-amber-500/20 dark:bg-amber-500/20 dark:text-amber-300">
                  <GraduationCap className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold leading-tight text-amber-700 dark:text-amber-300">
                    {n(stats?.pendingAdmissions)} Admission{(stats?.pendingAdmissions ?? 0) > 1 ? "s" : ""} Pending Review
                  </p>
                  <p className="mt-0.5 text-xs text-amber-600/75 dark:text-amber-300/70">Open Admissions to review</p>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-amber-500 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── Publishing ──
          Three stats in a 2-col grid always leaves one orphan on a phone, and
          three loose tiles at desktop width read as mostly empty. One divided
          card solves both: cells stack with rules on mobile, sit side by side
          from sm, and the compact icon+label+number row fills the width. */}
      <div>
        <SectionHeader icon={Newspaper} title="Publishing" subtitle="Notices, news and study material" />
        <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-card">
          <div className="grid divide-y divide-border/70 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {publishingStats.map((s) => (
              <div
                key={s.key}
                className="group relative overflow-hidden p-4 transition-colors hover:bg-secondary/40 sm:p-[18px]"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-80"
                  style={{ background: `radial-gradient(circle, hsla(${s.tone.hsl} / 0.18), transparent 70%)` }}
                />
                <div className="relative flex items-center gap-3">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ring-inset ${s.tone.chip} ${s.tone.ring}`}>
                    <s.icon className={`h-4 w-4 ${s.tone.fg}`} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] font-semibold uppercase leading-tight tracking-[0.08em] text-muted-foreground">
                      {s.label}
                    </p>
                    {isLoading ? (
                      <Skeleton className="mt-1.5 h-5 w-10 rounded-md" />
                    ) : (
                      <p className="mt-1 text-lg font-extrabold leading-none tabular-nums text-foreground">
                        {n(stats?.[s.key])}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Library & Media ── */}
      <div>
        <SectionHeader icon={BookOpen} title="Library & Media" subtitle="Resources, gallery and registered people" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {resourceStats.map((s) => (
            <StatCard
              key={s.key}
              label={s.label}
              value={stats?.[s.key]}
              icon={s.icon}
              tone={s.tone}
              isLoading={isLoading}
              badge={(s as any).badge}
            />
          ))}
        </div>
      </div>

      {/* ── Recent Activity ── */}
      <div>
        <SectionHeader icon={Activity} title="Recent Activity" subtitle="Latest across notices, news, admissions and users" />
        <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-card">
          {actLoading ? (
            <div className="space-y-3 p-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-7 w-7 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3.5 w-3/4 rounded-md" />
                    <Skeleton className="h-3 w-1/4 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          ) : !activity?.length ? (
            <div className="p-10 text-center">
              <span className="mx-auto mb-2.5 grid h-11 w-11 place-items-center rounded-full bg-secondary">
                <Activity className="h-5 w-5 text-muted-foreground/50" aria-hidden="true" />
              </span>
              <p className="text-sm font-semibold text-foreground">No recent activity yet</p>
              <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                New notices, news, admissions and sign-ups will appear here as they come in.
              </p>
            </div>
          ) : (
            <ul className="relative px-4 py-1.5 sm:px-5">
              {/* timeline rail — sits at the dot centres (ul px-4/px-5 + li px-1.5
                  + half of the h-7 dot), hidden from AT, purely visual */}
              <span aria-hidden="true" className="absolute bottom-5 left-[2.25rem] top-5 w-px bg-border sm:left-[2.5rem]" />
              {activity.map((item, i) => {
                const { Icon, chip, kicker } = activityMeta(item.type);
                return (
                  <li
                    key={item.id + i}
                    className="relative flex items-center gap-3 rounded-xl px-1.5 py-2.5 transition-colors hover:bg-secondary/50"
                  >
                    <span className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full ring-4 ring-card ${chip}`}>
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{kicker}</span>
                        {item.status && (
                          <span className={`rounded-full px-1.5 py-[2px] text-[9px] font-bold uppercase leading-none tracking-wide ${
                            item.status === "pending"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                              : item.status === "approved"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                              : "bg-secondary text-muted-foreground"
                          }`}>
                            {item.status}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[13px] font-medium text-foreground">{item.label}</p>
                    </div>
                    <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{timeAgo(item.time)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ── School Identity ── */}
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-card">
        <div className="flex items-center gap-2.5 border-b border-border/70 bg-secondary/40 px-4 py-3 sm:px-5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Landmark className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-bold leading-tight tracking-tight text-foreground">
              {settings?.school_name || "GHS Babi Khel"}
            </h3>
            <p className="truncate text-[11px] leading-tight text-muted-foreground">Public school record</p>
          </div>
        </div>
        <dl className="grid gap-x-4 gap-y-3 p-4 sm:grid-cols-2 sm:p-5">
          {identity.map((row) => (
            <div key={row.label} className="flex min-w-0 items-start gap-2.5">
              <row.Icon className="mt-[3px] h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{row.label}</dt>
                <dd className="mt-0.5 break-words text-[13px] font-medium leading-snug text-foreground">{row.value}</dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
};

export default AdminOverview;
