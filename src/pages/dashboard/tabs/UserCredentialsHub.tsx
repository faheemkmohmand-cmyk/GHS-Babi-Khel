/**
 * UserCredentialsHub.tsx — GHS Babi Khel
 *
 * User-facing mirror of AdminStudentCredentials.
 * Three read-only sub-tabs:
 *   1. ID Cards     — loaded from Supabase generated_id_cards table
 *   2. Monitor Pass — loaded from localStorage (ghs.monitorPasses.v2)
 *   3. Duty         — loaded from Supabase duty_board table (same source as
 *                     the public Duty page, so admin assignments show up
 *                     instantly — previously this read from localStorage
 *                     which was never populated, so students saw "No duty
 *                     assignments yet" forever.)
 *
 * View-only — no editing or downloading. Students can view their ID card,
 * monitor pass, and duty assignments, but cannot save/download files.
 */

import { useState, useEffect } from "react";
import { CreditCard, ShieldCheck, Shield, Eye, ChevronDown, ChevronUp, BadgeCheck, GraduationCap, RefreshCw, Loader2, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { supabasePublic } from "@/lib/supabase";
import { UserStudentIDCards } from "@/pages/admin/tabs/AdminStudentIDCards";

// ── Types (mirror AdminDuty / AdminMonitorPass) ────────────────────────────────

type CredTab = "id-cards" | "monitor-pass" | "duty";

type ClassId = "6" | "7" | "8" | "9" | "10";

interface ClassDuty {
  monitor: string;
  proctor: string;
  social_worker: string;
  head_boy: string;
  nazira: string;
}
interface DutyData {
  classes: Record<ClassId, ClassDuty>;
  chief_proctor: string;
  updated_at?: string;
}
interface SavedPass {
  id: string;
  cls: string;
  reasonIds: string[];
  serial: string;
  session: string;
  emis: string;
  date: string;
  dataUrl: string;
  createdAt: number;
}

const CLASSES: ClassId[] = ["6", "7", "8", "9", "10"];
const PASS_KEY = "ghs.monitorPasses.v2";

// ── Sub-tab config ─────────────────────────────────────────────────────────────
const tabs: { id: CredTab; label: string; shortLabel: string; icon: React.ReactNode; desc: string }[] = [
  {
    id: "id-cards",
    label: "Student ID Cards",
    shortLabel: "Cards",
    icon: (
      <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 shrink-0">
        <CreditCard className="w-4 h-4 text-blue-500" />
      </span>
    ),
    desc: "View your student identity card",
  },
  {
    id: "monitor-pass",
    label: "Monitor Pass",
    shortLabel: "Pass",
    icon: (
      <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 shrink-0">
        <ShieldCheck className="w-4 h-4 text-emerald-500" />
      </span>
    ),
    desc: "View issued monitor / hall passes for each class",
  },
  {
    id: "duty",
    label: "Duty",
    shortLabel: "Duty",
    icon: (
      <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-900/40 shrink-0">
        <Shield className="w-4 h-4 text-violet-500" />
      </span>
    ),
    desc: "School duty role assignments — Monitor, Proctor, Head Boy & more",
  },
];

// ── Duty role config ───────────────────────────────────────────────────────────
interface RoleCfg {
  key: keyof ClassDuty;
  label: string;
  emoji: string;
  ribbon: string;
  gradient: string;
  icon: React.ReactNode;
}

const ROLES: RoleCfg[] = [
  { key: "monitor",      label: "Class Monitor",  emoji: "🛡️", ribbon: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",   gradient: "from-blue-600 to-blue-700",   icon: <Shield className="w-4 h-4" /> },
  { key: "proctor",      label: "Proctor",         emoji: "✅", ribbon: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",       gradient: "from-sky-500 to-sky-700",     icon: <ShieldCheck className="w-4 h-4" /> },
  { key: "social_worker",label: "Social Worker",   emoji: "🤝", ribbon: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300", gradient: "from-indigo-500 to-indigo-700", icon: <BadgeCheck className="w-4 h-4" /> },
  { key: "head_boy",     label: "Head Boy",        emoji: "⭐", ribbon: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",   gradient: "from-cyan-500 to-cyan-700",   icon: <GraduationCap className="w-4 h-4" /> },
  { key: "nazira",       label: "Nazira",          emoji: "📖", ribbon: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", gradient: "from-slate-500 to-slate-600", icon: <Shield className="w-4 h-4" /> },
];

function emptyClass(): ClassDuty {
  return { monitor: "", proctor: "", social_worker: "", head_boy: "", nazira: "" };
}

// ── Supabase fetch (mirrors Duty.tsx so admin assignments show up) ─────────────
async function fetchDuty(): Promise<DutyData> {
  const { data, error } = await supabasePublic
    .from("duty_board")
    .select("classes, chief_proctor, updated_at")
    .eq("id", 1)
    .single();

  if (error) throw error;

  const classes = {} as Record<ClassId, ClassDuty>;
  for (const cls of CLASSES) {
    classes[cls] = { ...emptyClass(), ...(data.classes?.[cls] ?? {}) };
  }
  return {
    classes,
    chief_proctor: data.chief_proctor ?? "",
    updated_at: data.updated_at ?? "",
  };
}

function loadPassesFromStorage(): SavedPass[] {
  try {
    const raw = localStorage.getItem(PASS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// ── Monitor Pass: User view ────────────────────────────────────────────────────
function UserMonitorPassView() {
  const [passes, setPasses] = useState<SavedPass[]>([]);
  const [filterCls, setFilterCls] = useState<string>("all");
  const [preview, setPreview] = useState<SavedPass | null>(null);

  useEffect(() => { setPasses(loadPassesFromStorage()); }, []);

  const refresh = () => setPasses(loadPassesFromStorage());

  const displayed = filterCls === "all" ? passes : passes.filter(p => p.cls === filterCls);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-500 shrink-0" /> Monitor Passes
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">Issued hall / monitor passes by class</p>
        </div>
        <button onClick={refresh} className="flex items-center gap-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 px-3 py-2 rounded-xl transition-colors shrink-0">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Class filter chips — scrollable on mobile */}
      <div className="flex flex-wrap gap-1.5">
        {["all", ...CLASSES].map(c => (
          <button
            key={c}
            onClick={() => setFilterCls(c)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filterCls === c
                ? "bg-blue-600 text-white"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {c === "all" ? "All Classes" : `Class ${c}`}
          </button>
        ))}
      </div>

      {passes.length === 0 ? (
        <div className="bg-card rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <ShieldCheck className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">No passes issued yet</p>
          <p className="text-xs text-muted-foreground mt-1">Admin will generate passes when needed.</p>
        </div>
      ) : displayed.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">No passes for Class {filterCls}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {displayed.map(p => (
            <div key={p.id} className="bg-card rounded-2xl border border-blue-200 dark:border-slate-700 overflow-hidden shadow-sm group">
              {/* Pass thumbnail — tap to open full preview */}
              <div
                className="relative overflow-hidden bg-slate-100 dark:bg-slate-800 cursor-pointer"
                onClick={() => setPreview(p)}
              >
                <img
                  src={p.dataUrl}
                  alt={`Monitor pass – Class ${p.cls}`}
                  className="w-full object-contain max-h-52 group-hover:scale-[1.02] transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                  <span className="opacity-0 group-hover:opacity-100 bg-white/90 text-slate-800 text-xs font-bold px-3 py-1.5 rounded-full transition-opacity">
                    View Full
                  </span>
                </div>
              </div>
              {/* Pass info — view-only, tap thumbnail above to open full preview */}
              <div className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">Class {p.cls} — Pass</p>
                  <p className="text-[11px] text-muted-foreground font-mono truncate">{p.serial} · {p.date}</p>
                </div>
                <button
                  onClick={() => setPreview(p)}
                  className="flex items-center gap-1.5 text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 px-3 py-2 rounded-xl transition-colors shrink-0"
                >
                  <Eye className="w-3.5 h-3.5" /> View
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full-screen preview overlay — always-tappable Close, view-only */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex flex-col"
        >
          {/* Top bar — Close button (large tap target, always visible) */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-black/60 backdrop-blur-sm shrink-0">
            <button
              onClick={() => setPreview(null)}
              className="flex items-center gap-2 text-white hover:text-white/80 text-sm font-semibold transition-colors px-2 py-1.5 -ml-2 rounded-lg hover:bg-white/10"
            >
              <ChevronDown className="w-5 h-5 rotate-90" />
              <span>Back to passes</span>
            </button>
            <span className="text-white/80 text-xs font-medium hidden sm:block">
              Class {preview.cls} · {preview.serial}
            </span>
          </div>
          {/* Image — scrollable if taller than viewport */}
          <div className="flex-1 overflow-y-auto flex items-start sm:items-center justify-center p-3">
            <div className="relative max-w-sm w-full" onClick={e => e.stopPropagation()}>
              <img
                src={preview.dataUrl}
                alt="Pass preview"
                className="w-full rounded-2xl shadow-2xl"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Duty: User view (reads from Supabase — same source as public Duty page) ───
function UserDutyView() {
  const [openClasses, setOpenClasses] = useState<Record<string, boolean>>({});

  // Fetch from Supabase — this is the SAME query the public Duty page uses,
  // so whatever the admin publishes is instantly visible here. Previously
  // this component read from localStorage("ghs.duty.v1") which was never
  // written by the admin (admin writes to Supabase), so students always saw
  // "No duty assignments yet" even after the admin published.
  const { data: duty, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["duty-board"],
    queryFn: fetchDuty,
    staleTime: 2 * 60 * 1000,
  });

  useEffect(() => {
    // Default all classes open
    const init: Record<string, boolean> = {};
    CLASSES.forEach(c => { init[c] = true; });
    setOpenClasses(init);
  }, []);

  const toggle = (cls: string) => setOpenClasses(prev => ({ ...prev, [cls]: !prev[cls] }));

  if (isLoading) return (
    <div className="space-y-3">
      {[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
    </div>
  );

  if (isError) {
    return (
      <div className="bg-card rounded-2xl border-2 border-dashed border-border p-8 text-center">
        <Shield className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-sm font-medium text-foreground">Couldn't load duty board</p>
        <button onClick={() => refetch()} className="mt-3 text-xs font-semibold text-blue-600 hover:underline">
          Try again
        </button>
      </div>
    );
  }

  const hasAnyAssignment = !!duty && (
    CLASSES.some(c => ROLES.some(r => duty.classes[c]?.[r.key]?.trim())) ||
    duty.chief_proctor?.trim()
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-500 shrink-0" /> Duty Assignments
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            School duty role assignments for all classes
            {duty?.updated_at && (
              <span className="ml-2 text-[10px] text-muted-foreground/70">
                · Updated {new Date(duty.updated_at).toLocaleDateString("en-GB")}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 px-3 py-2 rounded-xl transition-colors shrink-0 disabled:opacity-50"
        >
          {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </button>
      </div>

      {!hasAnyAssignment ? (
        <div className="bg-card rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <Shield className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">No duty assignments yet</p>
          <p className="text-xs text-muted-foreground mt-1">Admin will assign duties soon.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Chief Proctor — school-wide */}
          {duty?.chief_proctor?.trim() && (
            <div className="rounded-2xl border border-yellow-300 dark:border-yellow-800 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/30 dark:to-amber-950/20 p-4 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center text-white shadow-lg shrink-0 text-xl">
                👑
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold text-foreground truncate">{duty.chief_proctor}</p>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-0.5 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">
                  👑 Chief Proctor — Whole School
                </span>
              </div>
              <BadgeCheck className="w-5 h-5 text-yellow-500 ml-auto shrink-0" />
            </div>
          )}

          {/* Per-class sections */}
          {CLASSES.map((cls, idx) => {
            const classDuty = duty?.classes[cls];
            const assigned = ROLES.filter(r => classDuty?.[r.key]?.trim());
            const hasAny = assigned.length > 0;
            const isOpen = openClasses[cls] ?? true;

            return (
              <div key={cls} className="rounded-2xl border border-blue-200 dark:border-blue-900/50 bg-card shadow-sm overflow-hidden">
                {/* Class header */}
                <button
                  onClick={() => toggle(cls)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 bg-gradient-to-r from-blue-600 to-sky-500 text-white"
                >
                  <GraduationCap className="w-4 h-4 shrink-0" />
                  <span className="font-bold flex-1 text-left">Class {cls}</span>
                  {hasAny ? (
                    <span className="text-xs font-semibold bg-white/20 rounded-full px-2.5 py-0.5">
                      {assigned.length} of {ROLES.length} assigned
                    </span>
                  ) : (
                    <span className="text-xs font-semibold bg-white/10 rounded-full px-2.5 py-0.5 italic opacity-70">
                      Not assigned yet
                    </span>
                  )}
                  {isOpen ? <ChevronUp className="w-4 h-4 ml-1 shrink-0" /> : <ChevronDown className="w-4 h-4 ml-1 shrink-0" />}
                </button>

                {isOpen && (
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {ROLES.map((role) => {
                      const name = classDuty?.[role.key]?.trim();
                      if (!name) return (
                        <div key={role.key} className="rounded-xl border border-dashed border-blue-200 dark:border-slate-700 bg-blue-50/30 dark:bg-slate-900/30 p-3 flex items-center gap-3 opacity-50">
                          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground shrink-0 text-base">
                            {role.emoji}
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground italic">Not assigned</p>
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 mt-0.5 ${role.ribbon}`}>
                              {role.emoji} {role.label}
                            </span>
                          </div>
                        </div>
                      );
                      return (
                        <div key={role.key} className="rounded-xl border border-blue-100 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 flex items-center gap-3 shadow-sm group">
                          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${role.gradient} flex items-center justify-center text-white shrink-0 text-base group-hover:scale-105 transition-transform`}>
                            {role.emoji}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-foreground truncate">{name}</p>
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 mt-0.5 ${role.ribbon}`}>
                              {role.emoji} {role.label}
                            </span>
                          </div>
                          <BadgeCheck className="w-4 h-4 text-blue-400 shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Hub ───────────────────────────────────────────────────────────────────
const UserCredentialsHub = ({ onNavigate }: { onNavigate?: (tab: string) => void }) => {
  const [active, setActive] = useState<CredTab>("id-cards");

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-heading font-bold text-foreground">
          Student Credentials
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Identity cards, official passes, and duty assignments
        </p>
      </div>

      {/* Sub-tab bar */}
      <div className="grid grid-cols-3 gap-1 bg-muted rounded-xl p-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`flex items-center gap-2 justify-center sm:justify-start px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
              active === t.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden text-xs">{t.shortLabel}</span>
          </button>
        ))}
      </div>

      {/* Tab description */}
      <p className="text-xs text-muted-foreground px-1">
        {tabs.find(t => t.id === active)?.desc}
      </p>

      {/* Active section */}
      {active === "id-cards"      && <UserStudentIDCards />}
      {active === "monitor-pass"  && <UserMonitorPassView />}
      {active === "duty"          && <UserDutyView />}
    </div>
  );
};

export default UserCredentialsHub;
