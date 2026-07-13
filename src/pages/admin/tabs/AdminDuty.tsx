/**
 * AdminDuty.tsx — GHS Babi Khel
 *
 * Admin-side: assign school duty roles per class (6–10)
 * Roles per class: Monitor · Proctor · Social Worker · Head Boy · Nazira
 * School-wide role: Chief Proctor (one student for whole school)
 *
 * Data saved to Supabase `duty_board` table — visible on ALL devices instantly.
 *
 * Features:
 *  ✓ Professional card-based UI with role icons, gradients, counts
 *  ✓ Inline edit per role (click Assign/Edit → type name → Enter)
 *  ✓ Chief Proctor highlighted separately at top (school-wide)
 *  ✓ Publish button = Save to Supabase (instantly visible to students)
 *  ✓ Download PDF = professional A4 landscape PDF of the full duty board
 *  ✓ Clear All = reset everything (with confirmation)
 *  ✓ Mobile-friendly: all grids stack, buttons are large tap targets
 */

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield, ShieldCheck, Users, Star, BookOpen,
  Crown, Award, Save, Trash2, Pencil, X, Check,
  ChevronDown, ChevronUp, GraduationCap, BadgeCheck,
  Download, FileText, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import jsPDF from "jspdf";

// ── Types ──────────────────────────────────────────────────────────────────────
export type DutyRole = "monitor" | "proctor" | "social_worker" | "head_boy" | "nazira";
export type ClassId = "6" | "7" | "8" | "9" | "10";

export interface ClassDuty {
  monitor: string;
  proctor: string;
  social_worker: string;
  head_boy: string;
  nazira: string;
}

export interface DutyData {
  classes: Record<ClassId, ClassDuty>;
  chief_proctor: string;
}

const CLASSES: ClassId[] = ["6", "7", "8", "9", "10"];

const emptyClass = (): ClassDuty => ({
  monitor: "",
  proctor: "",
  social_worker: "",
  head_boy: "",
  nazira: "",
});

const defaultData = (): DutyData => ({
  classes: {
    "6": emptyClass(),
    "7": emptyClass(),
    "8": emptyClass(),
    "9": emptyClass(),
    "10": emptyClass(),
  },
  chief_proctor: "",
});

// ── Supabase helpers ───────────────────────────────────────────────────────────
async function fetchDutyData(): Promise<DutyData> {
  const { data, error } = await supabase
    .from("duty_board")
    .select("classes, chief_proctor")
    .eq("id", 1)
    .single();

  if (error) throw error;

  const classes = {} as Record<ClassId, ClassDuty>;
  for (const cls of CLASSES) {
    classes[cls] = { ...emptyClass(), ...(data.classes?.[cls] ?? {}) };
  }
  return { classes, chief_proctor: data.chief_proctor ?? "" };
}

async function saveDutyToSupabase(duty: DutyData): Promise<void> {
  const { error } = await supabase
    .from("duty_board")
    .update({ classes: duty.classes, chief_proctor: duty.chief_proctor })
    .eq("id", 1);
  if (error) throw error;
}

async function clearDutyInSupabase(): Promise<void> {
  const empty = defaultData();
  const { error } = await supabase
    .from("duty_board")
    .update({ classes: empty.classes, chief_proctor: "" })
    .eq("id", 1);
  if (error) throw error;
}

// ── Role config ────────────────────────────────────────────────────────────────
interface RoleConfig {
  key: DutyRole;
  label: string;
  shortLabel: string;
  emoji: string;
  icon: React.ReactNode;
  badgeGradient: string;
  badgeBorder: string;
  badgeText: string;
  badgeBg: string;
  desc: string;
}

const ROLES: RoleConfig[] = [
  {
    key: "monitor",
    label: "Class Monitor",
    shortLabel: "Monitor",
    emoji: "🛡️",
    icon: <Shield className="w-4 h-4" />,
    badgeGradient: "from-blue-600 to-blue-700",
    badgeBorder: "border-blue-300",
    badgeText: "text-blue-700",
    badgeBg: "bg-blue-50",
    desc: "Maintains discipline & order",
  },
  {
    key: "proctor",
    label: "Proctor",
    shortLabel: "Proctor",
    emoji: "✅",
    icon: <ShieldCheck className="w-4 h-4" />,
    badgeGradient: "from-sky-500 to-sky-700",
    badgeBorder: "border-sky-300",
    badgeText: "text-sky-700",
    badgeBg: "bg-sky-50",
    desc: "Assists in exam supervision",
  },
  {
    key: "social_worker",
    label: "Social Worker",
    shortLabel: "Social Worker",
    emoji: "🤝",
    icon: <Users className="w-4 h-4" />,
    badgeGradient: "from-indigo-500 to-indigo-700",
    badgeBorder: "border-indigo-300",
    badgeText: "text-indigo-700",
    badgeBg: "bg-indigo-50",
    desc: "Supports student welfare",
  },
  {
    key: "head_boy",
    label: "Head Boy",
    shortLabel: "Head Boy",
    emoji: "⭐",
    icon: <Star className="w-4 h-4" />,
    badgeGradient: "from-cyan-500 to-cyan-700",
    badgeBorder: "border-cyan-300",
    badgeText: "text-cyan-700",
    badgeBg: "bg-cyan-50",
    desc: "Represents the class",
  },
  {
    key: "nazira",
    label: "Nazira",
    shortLabel: "Nazira",
    emoji: "📖",
    icon: <BookOpen className="w-4 h-4" />,
    badgeGradient: "from-slate-500 to-slate-700",
    badgeBorder: "border-slate-300",
    badgeText: "text-slate-700",
    badgeBg: "bg-slate-50",
    desc: "Religious & moral guidance",
  },
];

// ── Inline editable field ──────────────────────────────────────────────────────
function RoleField({
  role,
  value,
  onChange,
}: {
  role: RoleConfig;
  value: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => { setDraft(value); }, [value]);

  const commit = () => { onChange(draft.trim()); setEditing(false); };
  const cancel = () => { setDraft(value); setEditing(false); };

  return (
    <div className={`rounded-xl border ${role.badgeBorder} ${role.badgeBg} dark:bg-slate-900/60 dark:border-slate-700 px-3 py-2.5 transition-all`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br ${role.badgeGradient} text-white shrink-0`}>
          {role.icon}
        </span>
        <div className="min-w-0 flex-1">
          <span className={`text-[11px] font-bold uppercase tracking-wider ${role.badgeText} dark:text-sky-400 block leading-tight`}>
            {role.label}
          </span>
          <span className="text-[9px] text-muted-foreground truncate block leading-tight">{role.desc}</span>
        </div>
      </div>

      {editing ? (
        <div className="flex items-center gap-1.5 mt-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
            placeholder="Enter student name…"
            className="flex-1 px-2 py-1.5 rounded-lg border border-blue-400 bg-white dark:bg-slate-950 text-sm text-foreground outline-none focus:ring-2 focus:ring-blue-300 min-w-0"
          />
          <button onClick={commit} className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 shrink-0" aria-label="Save">
            <Check className="w-3.5 h-3.5" />
          </button>
          <button onClick={cancel} className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-secondary shrink-0" aria-label="Cancel">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 mt-1.5">
          {value ? (
            <span className="flex-1 text-sm font-semibold text-foreground truncate">{value}</span>
          ) : (
            <span className="flex-1 text-sm text-muted-foreground italic">Not assigned</span>
          )}
          <button
            onClick={() => setEditing(true)}
            className={`text-[11px] font-semibold ${role.badgeText} dark:text-sky-400 hover:underline flex items-center gap-1 shrink-0 px-2 py-1 rounded-md hover:bg-white/60 dark:hover:bg-white/10 transition-colors`}
          >
            <Pencil className="w-3 h-3" /> {value ? "Edit" : "Assign"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Badge preview ──────────────────────────────────────────────────────────────
function DutyBadge({ role, name, cls }: { role: RoleConfig; name: string; cls?: string }) {
  if (!name) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-700 shadow-sm">
      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${role.badgeGradient} flex items-center justify-center text-white shrink-0 shadow`}>
        {role.icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-foreground truncate">{name}</p>
        <p className={`text-[10px] font-semibold ${role.badgeText} dark:text-sky-400`}>
          {role.label}{cls ? ` · Class ${cls}` : ""}
        </p>
      </div>
      <BadgeCheck className="w-4 h-4 text-blue-400 ml-auto shrink-0" />
    </div>
  );
}

// ── Class card ─────────────────────────────────────────────────────────────────
function ClassCard({
  cls,
  duty,
  onUpdate,
}: {
  cls: ClassId;
  duty: ClassDuty;
  onUpdate: (updated: ClassDuty) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const assigned = ROLES.filter((r) => duty[r.key]?.trim()).length;

  return (
    <div className="rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 bg-gradient-to-r from-blue-600 to-sky-500 text-white"
      >
        <GraduationCap className="w-5 h-5 shrink-0" />
        <span className="font-bold text-base flex-1 text-left">Class {cls}</span>
        <span className="text-xs font-semibold bg-white/20 rounded-full px-2.5 py-0.5">
          {assigned}/{ROLES.length} assigned
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {expanded && (
        <div className="p-4 space-y-2.5">
          {ROLES.map((role) => (
            <RoleField
              key={role.key}
              role={role}
              value={duty[role.key]}
              onChange={(v) => onUpdate({ ...duty, [role.key]: v })}
            />
          ))}

          {/* Live badge preview */}
          {assigned > 0 && (
            <div className="mt-3 pt-3 border-t border-blue-100 dark:border-slate-800">
              <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400 mb-2">
                Badge Preview
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ROLES.filter((r) => duty[r.key]?.trim()).map((role) => (
                  <DutyBadge key={role.key} role={role} name={duty[role.key]} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── PDF Generator ──────────────────────────────────────────────────────────────
// Generates a professional A4 landscape PDF of the full duty board using jsPDF
// directly (no html2canvas dependency). Renders text + colored badges natively
// so the PDF is crisp, small, and print-ready.
function downloadDutyPDF(duty: DutyData) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();   // 297mm
  const pageH = doc.internal.pageSize.getHeight();  // 210mm
  const margin = 12;
  let y = margin;

  // ── Header band ──
  doc.setFillColor(30, 58, 138); // blue-900
  doc.rect(0, 0, pageW, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("GHS BABI KHEL — SCHOOL DUTY BOARD", margin, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Government High School Babi Khel · District Mohmand · KPK", margin, 21);
  // Right meta
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  doc.setFontSize(9);
  doc.text(`Published: ${dateStr}`, pageW - margin, 14, { align: "right" });
  doc.text("EMIS: 60673", pageW - margin, 21, { align: "right" });
  y = 36;

  // ── Chief Proctor banner ──
  if (duty.chief_proctor?.trim()) {
    doc.setFillColor(254, 243, 199); // amber-100
    doc.roundedRect(margin, y, pageW - margin * 2, 16, 2, 2, "F");
    doc.setFillColor(245, 158, 11); // amber-500
    doc.roundedRect(margin, y, 4, 16, 2, 2, "F");
    doc.setTextColor(120, 53, 15); // amber-900
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("👑  CHIEF PROCTOR (Whole School)", margin + 8, y + 6.5);
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(duty.chief_proctor, margin + 8, y + 12.5);
    y += 20;
  }

  // ── Table header ──
  const tableX = margin;
  const tableW = pageW - margin * 2;
  // 6 columns: Class | Monitor | Proctor | Social Worker | Head Boy | Nazira
  const colCount = 6;
  const colW = tableW / colCount;
  const headerH = 9;

  doc.setFillColor(37, 99, 235); // blue-600
  doc.rect(tableX, y, tableW, headerH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  const headers = ["Class", "Class Monitor", "Proctor", "Social Worker", "Head Boy", "Nazira"];
  headers.forEach((h, i) => {
    doc.text(h, tableX + i * colW + colW / 2, y + 6, { align: "center" });
  });
  y += headerH;

  // ── Rows ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const rowH = 16;

  CLASSES.forEach((cls, idx) => {
    const cd = duty.classes[cls] ?? emptyClass();
    // Alternate row background
    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252); // slate-50
      doc.rect(tableX, y, tableW, rowH, "F");
    }
    // Class cell — bold + centered, colored badge
    doc.setFillColor(37, 99, 235);
    doc.roundedRect(tableX + 2, y + 4, colW - 4, rowH - 8, 1.5, 1.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`Class ${cls}`, tableX + colW / 2, y + rowH / 2 + 1, { align: "center" });

    // Role cells
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const values = [cd.monitor, cd.proctor, cd.social_worker, cd.head_boy, cd.nazira];
    values.forEach((val, i) => {
      const cellX = tableX + (i + 1) * colW;
      if (val?.trim()) {
        doc.setTextColor(15, 23, 42);
        // Wrap text inside the cell
        const lines = doc.splitTextToSize(val, colW - 6);
        doc.text(lines, cellX + colW / 2, y + rowH / 2 - ((lines.length - 1) * 3.5) / 2 + 1, { align: "center" });
      } else {
        doc.setTextColor(148, 163, 184); // slate-400
        doc.setFont("helvetica", "italic");
        doc.text("—", cellX + colW / 2, y + rowH / 2 + 1, { align: "center" });
        doc.setFont("helvetica", "normal");
      }
    });

    // Row border
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(tableX, y + rowH, tableX + tableW, y + rowH);

    y += rowH;
  });

  // ── Footer ──
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Generated by GHS Babi Khel Admin Panel · ${now.toLocaleString("en-GB")}`,
    pageW / 2,
    pageH - 6,
    { align: "center" }
  );

  // ── Counts summary (top-right under header) ──
  const totalAssigned = CLASSES.reduce((sum, c) =>
    sum + ROLES.filter(r => duty.classes[c]?.[r.key]?.trim()).length, 0
  ) + (duty.chief_proctor?.trim() ? 1 : 0);
  const totalSlots = CLASSES.length * ROLES.length + 1;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`${totalAssigned} / ${totalSlots} roles assigned`, pageW - margin, 27, { align: "right" });

  doc.save(`GHS-Babi-Khel-Duty-Board-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}.pdf`);
}

// ── Main Component ─────────────────────────────────────────────────────────────
const AdminDuty = () => {
  const qc = useQueryClient();

  // Load from Supabase
  const { data: remoteData, isLoading, isError } = useQuery({
    queryKey: ["duty-board-admin"],
    queryFn: fetchDutyData,
    staleTime: 60 * 1000,
  });

  const [localData, setLocalData] = useState<DutyData>(defaultData);
  const [chiefEditing, setChiefEditing] = useState(false);
  const [chiefDraft, setChiefDraft] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [justPublished, setJustPublished] = useState(false);
  const publishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync remote → local when loaded
  useEffect(() => {
    if (remoteData) setLocalData(remoteData);
  }, [remoteData]);

  // Cleanup the "Published!" success-state timer on unmount
  useEffect(() => {
    return () => { if (publishTimerRef.current) clearTimeout(publishTimerRef.current); };
  }, []);

  const saveMutation = useMutation({
    mutationFn: saveDutyToSupabase,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["duty-board"] });
      qc.invalidateQueries({ queryKey: ["duty-board-admin"] });
    },
    onError: () => toast.error("Failed to save. Please try again."),
  });

  const clearMutation = useMutation({
    mutationFn: clearDutyInSupabase,
    onSuccess: () => {
      setLocalData(defaultData());
      qc.invalidateQueries({ queryKey: ["duty-board"] });
      qc.invalidateQueries({ queryKey: ["duty-board-admin"] });
      toast.success("All duty assignments cleared.");
    },
    onError: () => toast.error("Failed to clear. Please try again."),
  });

  const updateClass = (cls: ClassId, updated: ClassDuty) => {
    setLocalData((prev) => ({
      ...prev,
      classes: { ...prev.classes, [cls]: updated },
    }));
  };

  // ── Publish: Save to Supabase (instantly visible to students) ──
  // This is the single "publish" action. After it succeeds, the admin can
  // download a PDF copy of the published board.
  const handlePublish = async () => {
    setPublishing(true);
    setJustPublished(false);
    try {
      await saveDutyToSupabase(localData);
      qc.invalidateQueries({ queryKey: ["duty-board"] });
      qc.invalidateQueries({ queryKey: ["duty-board-admin"] });
      toast.success("Duty board published! Students can now view it.");
      setJustPublished(true);
      if (publishTimerRef.current) clearTimeout(publishTimerRef.current);
      publishTimerRef.current = setTimeout(() => setJustPublished(false), 4000);
    } catch {
      toast.error("Failed to publish. Please try again.");
    } finally {
      setPublishing(false);
    }
  };

  // ── Download PDF: generates a professional A4 landscape PDF of the
  // current (local) duty board. Works on mobile too — jsPDF runs client-side.
  const handleDownloadPDF = () => {
    try {
      downloadDutyPDF(localData);
      toast.success("Duty board PDF downloaded");
    } catch {
      toast.error("Failed to generate PDF");
    }
  };

  // ── Publish + Download PDF in one click (convenience) ──
  const handlePublishAndDownload = async () => {
    setPublishing(true);
    setJustPublished(false);
    try {
      await saveDutyToSupabase(localData);
      qc.invalidateQueries({ queryKey: ["duty-board"] });
      qc.invalidateQueries({ queryKey: ["duty-board-admin"] });
      setJustPublished(true);
      if (publishTimerRef.current) clearTimeout(publishTimerRef.current);
      publishTimerRef.current = setTimeout(() => setJustPublished(false), 4000);
      downloadDutyPDF(localData);
      toast.success("Published & PDF downloaded");
    } catch {
      toast.error("Failed to publish. Please try again.");
    } finally {
      setPublishing(false);
    }
  };

  const handleClearAll = () => {
    if (!confirm("Clear ALL duty assignments? This cannot be undone.")) return;
    clearMutation.mutate();
  };

  const chiefRole: RoleConfig = {
    key: "monitor" as DutyRole,
    label: "Chief Proctor",
    shortLabel: "Chief Proctor",
    emoji: "👑",
    icon: <Crown className="w-4 h-4" />,
    badgeGradient: "from-yellow-500 to-orange-500",
    badgeBorder: "border-yellow-300",
    badgeText: "text-yellow-700",
    badgeBg: "bg-yellow-50",
    desc: "Whole school supervisor",
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium">Loading duty assignments…</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-24 space-y-3">
        <p className="text-lg font-bold text-destructive">Failed to load duty board</p>
        <p className="text-muted-foreground text-sm">Please refresh the page.</p>
      </div>
    );
  }

  // Stats summary
  const totalAssigned = CLASSES.reduce((sum, c) =>
    sum + ROLES.filter(r => localData.classes[c]?.[r.key]?.trim()).length, 0
  ) + (localData.chief_proctor?.trim() ? 1 : 0);
  const totalSlots = CLASSES.length * ROLES.length + 1;

  return (
    <div className="space-y-6">
      {/* Page header — professional with stats */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-600" />
            School Duty Assignments
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Assign duty roles for Classes 6–10 and the school-wide Chief Proctor.
            Published assignments are visible to all students instantly.
          </p>
          {/* Stats chips */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-xs font-semibold text-blue-700 dark:text-blue-300">
              <Users className="w-3.5 h-3.5" />
              {totalAssigned} / {totalSlots} roles filled
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900 text-xs font-semibold text-sky-700 dark:text-sky-300">
              <GraduationCap className="w-3.5 h-3.5" />
              {CLASSES.length} classes
            </span>
            {localData.chief_proctor?.trim() && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-900 text-xs font-semibold text-yellow-700 dark:text-yellow-300">
                <Crown className="w-3.5 h-3.5" />
                Chief Proctor assigned
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Chief Proctor — school-wide */}
      <div className="rounded-2xl border-2 border-yellow-300 dark:border-yellow-700/50 bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-950/30 dark:to-orange-950/20 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5 bg-gradient-to-r from-yellow-500 to-orange-500 text-white">
          <Crown className="w-5 h-5 shrink-0" />
          <span className="font-bold text-base flex-1">Chief Proctor — Whole School</span>
          <Award className="w-5 h-5 opacity-80" />
        </div>
        <div className="p-4">
          <p className="text-xs text-muted-foreground mb-3">
            One student selected as the overall school proctor. This badge appears prominently on the duty board.
          </p>
          {chiefEditing ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={chiefDraft}
                onChange={(e) => setChiefDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setLocalData((p) => ({ ...p, chief_proctor: chiefDraft.trim() }));
                    setChiefEditing(false);
                  }
                  if (e.key === "Escape") setChiefEditing(false);
                }}
                placeholder="Enter student name…"
                className="flex-1 px-3 py-2 rounded-xl border border-yellow-400 bg-white dark:bg-slate-950 text-sm text-foreground outline-none focus:ring-2 focus:ring-yellow-300"
              />
              <button
                onClick={() => {
                  setLocalData((p) => ({ ...p, chief_proctor: chiefDraft.trim() }));
                  setChiefEditing(false);
                }}
                className="p-2 rounded-xl bg-yellow-500 text-white hover:bg-yellow-600 shrink-0"
                aria-label="Save"
              >
                <Check className="w-4 h-4" />
              </button>
              <button onClick={() => setChiefEditing(false)} className="p-2 rounded-xl bg-muted text-muted-foreground hover:bg-secondary shrink-0" aria-label="Cancel">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center text-white shadow-md shrink-0">
                <Crown className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                {localData.chief_proctor ? (
                  <>
                    <p className="font-bold text-foreground text-base truncate">{localData.chief_proctor}</p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-400 font-semibold">Chief Proctor · GHS Babi Khel</p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No Chief Proctor assigned yet</p>
                )}
              </div>
              <button
                onClick={() => { setChiefDraft(localData.chief_proctor); setChiefEditing(true); }}
                className="text-xs font-semibold text-yellow-700 dark:text-yellow-400 hover:underline flex items-center gap-1 shrink-0 px-2 py-1.5 rounded-md hover:bg-yellow-100 dark:hover:bg-yellow-950/40 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" /> {localData.chief_proctor ? "Change" : "Assign"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Role legend */}
      <div className="rounded-xl border border-blue-100 dark:border-slate-800 bg-blue-50/50 dark:bg-slate-900/40 p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-sky-700 dark:text-sky-400 mb-3">Role Guide</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {ROLES.map((r) => (
            <div key={r.key} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${r.badgeBorder} ${r.badgeBg} dark:bg-slate-900/60 dark:border-slate-700`}>
              <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${r.badgeGradient} flex items-center justify-center text-white shrink-0`}>
                {r.icon}
              </div>
              <div className="min-w-0">
                <p className={`text-[10px] font-bold ${r.badgeText} dark:text-sky-400 truncate`}>{r.label}</p>
                <p className="text-[9px] text-muted-foreground truncate">{r.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-class cards */}
      <div className="space-y-4">
        <p className="text-xs font-bold uppercase tracking-widest text-sky-700 dark:text-sky-400">
          Class-wise Assignments
        </p>
        {CLASSES.map((cls) => (
          <ClassCard
            key={cls}
            cls={cls}
            duty={localData.classes[cls]}
            onUpdate={(updated) => updateClass(cls, updated)}
          />
        ))}
      </div>

      {/* Bottom publish reminder (sticky-feel CTA) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
        <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
          💡 Click <strong>Publish</strong> to push changes to the student Duty board.
        </p>
        <div className="flex gap-2 shrink-0">
          <Button
            onClick={handlePublish}
            disabled={publishing}
            className={`gap-1.5 ${justPublished ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"} text-white`}
          >
            {publishing ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : justPublished ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {publishing ? "Publishing…" : justPublished ? "Published ✓" : "Publish"}
          </Button>
          <Button
            onClick={handleDownloadPDF}
            variant="outline"
            className="gap-1.5 border-2 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/40"
          >
            <Download className="w-3.5 h-3.5" /> PDF
          </Button>
          <Button
            variant="outline"
            onClick={handleClearAll}
            disabled={clearMutation.isPending}
            className="gap-1.5 border-2 border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AdminDuty;
