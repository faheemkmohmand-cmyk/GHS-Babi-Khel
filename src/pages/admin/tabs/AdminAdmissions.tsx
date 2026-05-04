import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  useAdminAdmissions, useAdmissionDocuments, useUpdateAdmission,
  useUpdateAdmissionSettings, useAdmissionSettings,
  Admission, AdmissionStatus
} from "@/hooks/useAdmission";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GraduationCap, Eye, CheckCircle2, XCircle,
  Clock, FileText, Download, RefreshCw, ChevronLeft,
  ChevronRight, Settings2, Users, Loader2, Search,
  FileDown, FileUp, UserCheck, AlertTriangle
} from "lucide-react";
import toast from "react-hot-toast";
import { format } from "date-fns";

const PAGE_SIZE = 20;

const statusConfig: Record<AdmissionStatus, { label: string; badge: string }> = {
  pending:           { label: "Pending",           badge: "bg-blue-100 text-blue-800" },
  under_review:      { label: "Under Review",      badge: "bg-purple-100 text-purple-800" },
  approved:          { label: "Approved",           badge: "bg-green-100 text-green-800" },
  rejected:          { label: "Rejected",           badge: "bg-red-100 text-red-800" },
  documents_missing: { label: "Docs Missing",      badge: "bg-orange-100 text-orange-800" },
};

const MIGRATION_STEPS = [
  "Student submitted online application",
  "Migration letter written to current principal",
  "Current principal signed the letter",
  "Our school principal signed the letter",
  "Current school applied migration on BISEP",
  "Our school approved on BISEP",
  "Bank challan generated — fee submitted",
  "Migration completed ✅",
];

// ── Download a Cloudinary file by fetching it as a blob ──────────────────
async function downloadFile(url: string, filename: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename || "document";
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    // Fallback: open in new tab
    window.open(url, "_blank");
  }
}

// ── Export admissions to CSV ─────────────────────────────────────────────
function exportToCSV(admissions: Admission[]) {
  const headers = [
    "Reference No", "Full Name", "Father Name", "Date of Birth", "B-Form No",
    "Contact", "WhatsApp", "Address", "Gender", "Applying Class",
    "Type", "Prev School", "Prev Class", "Prev Marks", "Year of Passing",
    "Status", "Roll No", "Admin Note", "Applied Date"
  ];
  const rows = admissions.map(a => [
    a.reference_no, a.full_name, a.father_name, a.date_of_birth ?? "",
    a.b_form_no, a.contact_number, a.whatsapp_number ?? "", a.home_address ?? "",
    a.gender ?? "", a.applying_class, a.admission_type,
    a.previous_school ?? "", a.previous_class ?? "", a.previous_marks ?? "",
    a.year_of_passing ?? "", a.status, a.admission_roll_no ?? "",
    a.admin_note ?? "", format(new Date(a.created_at), "dd MMM yyyy")
  ]);
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `admissions_${format(new Date(), "yyyyMMdd")}.csv`;
  a.click();
}

// ── Download blank import template ───────────────────────────────────────
function downloadImportTemplate() {
  const headers = [
    "full_name", "father_name", "roll_number", "class",
    "b_form_no", "contact_number", "gender", "date_of_birth",
    "home_address", "previous_school", "previous_marks"
  ];
  const example = [
    "Muhammad Ali", "Haji Ahmed", "001", "6",
    "12345-1234567-1", "03001234567", "male", "2012-05-15",
    "Village Babi Khel", "Govt Primary School", "550/600"
  ];
  const csv = [headers, example]
    .map(r => r.map(v => `"${v}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "students_import_template.csv";
  a.click();
}

// ── Import admissions from a filled CSV template ─────────────────────────
async function importFromCSV(
  file: File,
  onProgress: (msg: string) => void
): Promise<{ inserted: number; skipped: number; errors: string[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) { resolve({ inserted: 0, skipped: 0, errors: ["CSV is empty"] }); return; }

        // Parse header
        const parseRow = (line: string) =>
          line.split(",").map(v => v.replace(/^"|"$/g, "").replace(/""/g, "\"").trim());

        const headers = parseRow(lines[0]).map(h => h.toLowerCase());
        const get = (row: string[], key: string) => {
          const idx = headers.indexOf(key);
          return idx >= 0 ? (row[idx] ?? "").trim() : "";
        };

        let inserted = 0, skipped = 0;
        const errors: string[] = [];

        for (let i = 1; i < lines.length; i++) {
          const row = parseRow(lines[i]);
          const bForm = get(row, "b_form_no");
          const fullName = get(row, "full_name");
          if (!fullName || !bForm) { skipped++; continue; }

          // Check for duplicate by b_form_no
          const { data: existing } = await supabase
            .from("admissions")
            .select("id")
            .eq("b_form_no", bForm)
            .maybeSingle();

          if (existing) { skipped++; continue; }

          const referenceNo = `OHS-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}${i}`;
          const applyingClass = get(row, "class") || "6";

          const { error } = await supabase.from("admissions").insert({
            reference_no:    referenceNo,
            full_name:       fullName,
            father_name:     get(row, "father_name") || "—",
            b_form_no:       bForm,
            contact_number:  get(row, "contact_number") || "—",
            applying_class:  applyingClass,
            admission_type:  "fresh" as const,
            status:          "pending" as const,
            date_of_birth:   get(row, "date_of_birth") || null,
            gender:          get(row, "gender") || null,
            home_address:    get(row, "home_address") || null,
            previous_school: get(row, "previous_school") || null,
            previous_marks:  get(row, "previous_marks") || null,
            admission_roll_no: get(row, "roll_number") || null,
          });

          if (error) { errors.push(`Row ${i + 1} (${fullName}): ${error.message}`); }
          else { inserted++; }

          if (i % 5 === 0) onProgress(`Processing row ${i}/${lines.length - 1}...`);
        }

        resolve({ inserted, skipped, errors });
      } catch (err: any) {
        reject(new Error(err?.message ?? "Failed to parse CSV"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

// ── Auto-enroll approved admission into students table ───────────────────
async function enrollStudentFromAdmission(app: Admission): Promise<void> {
  if (!app.admission_roll_no) throw new Error("Assign a Roll No before enrolling");

  // Check for duplicate roll_number in same class
  const { data: existing } = await supabase
    .from("students")
    .select("id")
    .eq("roll_number", app.admission_roll_no)
    .eq("class", app.applying_class)
    .maybeSingle();

  if (existing) throw new Error(`Roll No ${app.admission_roll_no} already exists in Class ${app.applying_class}`);

  const { error } = await supabase.from("students").insert({
    full_name:   app.full_name,
    father_name: app.father_name,
    roll_number: app.admission_roll_no,
    class:       app.applying_class,
    is_active:   true,
  });
  if (error) throw new Error(error.message);
}

/* ── Detail Dialog ──────────────────────────────────────────────────────── */
function AdmissionDetail({ app, onClose, onSaved }: { app: Admission; onClose: () => void; onSaved?: (id: string) => void }) {
  const updateMut  = useUpdateAdmission();
  const qc         = useQueryClient();
  const { data: docs = [], isLoading: docsLoading } = useAdmissionDocuments(app.id);
  const [status,  setStatus]  = useState<AdmissionStatus>(app.status);
  const [note,    setNote]    = useState(app.admin_note ?? "");
  const [reason,  setReason]  = useState(app.rejection_reason ?? "");
  const [rollNo,  setRollNo]  = useState(app.admission_roll_no ?? "");
  const [migStep, setMigStep] = useState<number>(app.migration_step ?? 1);
  const [saving,  setSaving]  = useState(false);
  const [enrolling, setEnrolling] = useState(false);

  const isMigration = app.admission_type === "migration";
  const isApproved  = status === "approved";

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMut.mutateAsync({
        id: app.id,
        updates: {
          status,
          admin_note:        note || null,
          rejection_reason:  reason || null,
          admission_roll_no: rollNo || null,
          migration_step:    isMigration ? migStep : undefined,
        },
      });
      toast.success("Application updated");
      onSaved?.(app.id);
      onClose();
    } catch {
      toast.error("Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const handleEnroll = async () => {
    setEnrolling(true);
    try {
      await enrollStudentFromAdmission({ ...app, admission_roll_no: rollNo, status });
      toast.success(`${app.full_name} enrolled in Class ${app.applying_class} ✓`);
      qc.invalidateQueries({ queryKey: ["admin-students"] });
    } catch (err: any) {
      toast.error(err?.message ?? "Enrollment failed");
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <GraduationCap className="w-4 h-4 text-primary" />
            {app.reference_no} — {app.full_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pb-2">
          {/* Student info grid */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            {([
              ["Father",      app.father_name],
              ["Class",       `Class ${app.applying_class}`],
              ["Type",        app.admission_type],
              ["B-Form",      app.b_form_no],
              ["Contact",     app.contact_number],
              ["Gender",      app.gender ?? "—"],
              ["Prev School", app.previous_school ?? "—"],
              ["Prev Marks",  app.previous_marks ?? "—"],
              ["Applied",     format(new Date(app.created_at), "dd MMM yyyy")],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="bg-muted/50 rounded-lg p-2">
                <p className="text-[10px] text-muted-foreground font-medium uppercase">{k}</p>
                <p className="font-semibold text-xs break-words">{v}</p>
              </div>
            ))}
          </div>

          {/* Documents — with download button */}
          <div>
            <p className="text-xs font-bold mb-2 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Uploaded Documents
            </p>
            {docsLoading ? (
              <Skeleton className="h-10 rounded-lg" />
            ) : docs.length === 0 ? (
              <p className="text-xs text-muted-foreground">No documents uploaded</p>
            ) : (
              <div className="space-y-1.5">
                {docs.map(doc => (
                  <div key={doc.id}
                    className="flex items-center gap-2 text-xs bg-muted/50 border border-border rounded-lg px-3 py-2">
                    <FileText className="w-3.5 h-3.5 shrink-0 text-primary" />
                    <span className="flex-1 capitalize font-medium">
                      {doc.doc_type.replace(/_/g, " ")}
                    </span>
                    {/* Download button — fetches blob so file downloads, not opens */}
                    <button
                      onClick={() => downloadFile(doc.file_path, `${doc.doc_type}_${app.full_name}`)}
                      className="flex items-center gap-1 text-primary hover:underline"
                      title="Download">
                      <Download className="w-3.5 h-3.5" /> Download
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Migration step */}
          {isMigration && (
            <div>
              <Label className="text-xs font-bold mb-2 block flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" /> Migration Step ({migStep}/8)
              </Label>
              <Select value={String(migStep)} onValueChange={v => setMigStep(Number(v))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MIGRATION_STEPS.map((s, i) => (
                    <SelectItem key={i} value={String(i + 1)}>
                      Step {i + 1}: {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Status */}
          <div>
            <Label className="text-xs font-bold mb-1.5 block">Update Status</Label>
            <Select value={status} onValueChange={v => setStatus(v as AdmissionStatus)}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(statusConfig) as AdmissionStatus[]).map(s => (
                  <SelectItem key={s} value={s}>{statusConfig[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {status === "rejected" && (
            <div>
              <Label className="text-xs font-bold mb-1.5 block">Rejection Reason</Label>
              <Textarea value={reason} onChange={e => setReason(e.target.value)}
                placeholder="Explain why this application was rejected..."
                className="text-xs min-h-[70px]" />
            </div>
          )}

          <div>
            <Label className="text-xs font-bold mb-1.5 block">Admin Note (visible to student)</Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)}
              placeholder="Optional message to the applicant..."
              className="text-xs min-h-[70px]" />
          </div>

          <div>
            <Label className="text-xs font-bold mb-1.5 block">Assign Admission Roll No.</Label>
            <Input value={rollNo} onChange={e => setRollNo(e.target.value)}
              placeholder="e.g. OHS-26-001" className="text-xs h-9" />
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : "Save Changes"}
          </Button>

          {/* Enroll to students register — only show when approved and roll no assigned */}
          {isApproved && rollNo && (
            <div className="border border-green-200 bg-green-50 rounded-xl p-3">
              <p className="text-xs font-bold text-green-800 mb-1 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5" /> Enroll into Students Register
              </p>
              <p className="text-[11px] text-green-700 mb-2">
                This will add {app.full_name} to Class {app.applying_class} with Roll No {rollNo}. No duplicate will be created.
              </p>
              <Button size="sm" onClick={handleEnroll} disabled={enrolling}
                className="w-full bg-green-600 hover:bg-green-700 text-white gap-2 h-8 text-xs">
                {enrolling
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enrolling...</>
                  : <><UserCheck className="w-3.5 h-3.5" /> Enroll Student</>}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Settings Panel ─────────────────────────────────────────────────────── */
function AdmissionSettingsPanel() {
  const { data: settings, isLoading } = useAdmissionSettings();
  const updateMut = useUpdateAdmissionSettings();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    is_open:        false,
    session_year:   "2026",
    open_date:      "",
    last_date:      "",
    banner_message: "",
    notes:          "",
  });
  const [synced, setSynced] = useState(false);

  if (settings && !synced) {
    setForm({
      is_open:        settings.is_open,
      session_year:   settings.session_year,
      open_date:      settings.open_date ?? "",
      last_date:      settings.last_date ?? "",
      banner_message: settings.banner_message ?? "",
      notes:          settings.notes ?? "",
    });
    setSynced(true);
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMut.mutateAsync({
        is_open:        form.is_open,
        session_year:   form.session_year,
        open_date:      form.open_date   || null,
        last_date:      form.last_date   || null,
        banner_message: form.banner_message || null,
        notes:          form.notes || null,
      });
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <Skeleton className="h-40 rounded-xl" />;

  return (
    <Card className="mb-6">
      <CardContent className="p-5">
        <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-primary" /> Admission Settings
        </h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl sm:col-span-2">
            <div>
              <p className="font-semibold text-sm">Admissions Open</p>
              <p className="text-xs text-muted-foreground">Shows banner & apply button on homepage</p>
            </div>
            <Switch checked={form.is_open} onCheckedChange={v => setForm(f => ({ ...f, is_open: v }))} />
          </div>
          <div>
            <Label className="text-xs font-semibold mb-1 block">Session Year</Label>
            <Input value={form.session_year}
              onChange={e => setForm(f => ({ ...f, session_year: e.target.value }))}
              placeholder="2026" className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs font-semibold mb-1 block">Open Date</Label>
            <Input type="date" value={form.open_date ?? ""}
              onChange={e => setForm(f => ({ ...f, open_date: e.target.value }))} className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs font-semibold mb-1 block">Last Date</Label>
            <Input type="date" value={form.last_date ?? ""}
              onChange={e => setForm(f => ({ ...f, last_date: e.target.value }))} className="h-9 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs font-semibold mb-1 block">Banner Message</Label>
            <Input value={form.banner_message ?? ""}
              onChange={e => setForm(f => ({ ...f, banner_message: e.target.value }))}
              placeholder="Admissions Open for Session 2026 — Apply Online Today"
              className="h-9 text-sm" />
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="mt-4 gap-2">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : "Save Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}

/* ══ MAIN ADMIN TAB ═════════════════════════════════════════════════════════ */
const AdminAdmissions = () => {
  const [statusFilter, setStatusFilter] = useState("pending");
  const [classFilter,  setClassFilter]  = useState("all");
  const [typeFilter,   setTypeFilter]   = useState("all");
  const [page,         setPage]         = useState(0);
  const [selected,     setSelected]     = useState<Admission | null>(null);
  const [search,       setSearch]       = useState("");
  const [exporting,    setExporting]    = useState(false);
  const [importing,    setImporting]    = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useAdminAdmissions({
    status: statusFilter, classFilter, typeFilter, page,
  });
  const admissions  = data?.admissions ?? [];
  const totalPages  = Math.ceil((data?.count ?? 0) / PAGE_SIZE);

  // Stats — use unfiltered count
  const { data: allData } = useAdminAdmissions({});
  const all = allData?.admissions ?? [];
  const stats = {
    total:     allData?.count ?? 0,
    pending:   all.filter(a => a.status === "pending").length,
    approved:  all.filter(a => a.status === "approved").length,
    rejected:  all.filter(a => a.status === "rejected").length,
    migration: all.filter(a => a.admission_type === "migration").length,
  };

  // Client-side search on loaded page
  const filtered = search.trim()
    ? admissions.filter(a =>
        a.full_name.toLowerCase().includes(search.toLowerCase()) ||
        a.b_form_no.includes(search) ||
        a.reference_no.toLowerCase().includes(search.toLowerCase())
      )
    : admissions;

  // Export ALL admissions (not just current page)
  const handleExportAll = async () => {
    setExporting(true);
    try {
      let q = supabase.from("admissions")
        .select("id, reference_no, full_name, father_name, date_of_birth, b_form_no, contact_number, whatsapp_number, home_address, gender, applying_class, admission_type, previous_school, previous_class, previous_marks, year_of_passing, status, admin_note, rejection_reason, admission_roll_no, migration_step, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (classFilter  !== "all") q = q.eq("applying_class", classFilter);
      if (typeFilter   !== "all") q = q.eq("admission_type", typeFilter);
      const { data: rows, error } = await q;
      if (error) throw error;
      exportToCSV((rows ?? []) as Admission[]);
      toast.success(`Exported ${rows?.length ?? 0} records`);
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  // Import CSV
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    setImportStatus("Starting import...");
    try {
      const result = await importFromCSV(file, setImportStatus);
      qc.invalidateQueries({ queryKey: ["admin-admissions"] });
      toast.success(
        `Import done: ${result.inserted} added, ${result.skipped} skipped (duplicates/empty)` +
        (result.errors.length ? `, ${result.errors.length} errors` : "")
      );
      if (result.errors.length) {
        result.errors.slice(0, 3).forEach(e => toast.error(e, { duration: 6000 }));
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Import failed");
    } finally {
      setImporting(false);
      setImportStatus("");
    }
  };

  // Remove a processed admission from the list immediately
  const handleAdmissionSaved = (_id: string) => {
    qc.invalidateQueries({ queryKey: ["admin-admissions"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-primary" /> Admissions Management
        </h2>

        {/* Export + Template + Import buttons */}
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={downloadImportTemplate}
            className="h-8 gap-1.5 text-xs">
            <FileDown className="w-3.5 h-3.5" /> Import Template
          </Button>
          <Button size="sm" variant="outline"
            onClick={() => importRef.current?.click()}
            disabled={importing}
            className="h-8 gap-1.5 text-xs">
            {importing
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {importStatus || "Importing..."}</>
              : <><FileUp className="w-3.5 h-3.5" /> Import CSV</>}
          </Button>
          <input
            ref={importRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleImportFile}
          />
          <Button size="sm" variant="outline" onClick={handleExportAll} disabled={exporting}
            className="h-8 gap-1.5 text-xs">
            {exporting
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Exporting...</>
              : <><FileDown className="w-3.5 h-3.5" /> Export CSV</>}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total",     value: stats.total,     icon: Users,        color: "text-primary" },
          { label: "Pending",   value: stats.pending,   icon: Clock,        color: "text-blue-600" },
          { label: "Approved",  value: stats.approved,  icon: CheckCircle2, color: "text-green-600" },
          { label: "Rejected",  value: stats.rejected,  icon: XCircle,      color: "text-red-500" },
          { label: "Migration", value: stats.migration, icon: RefreshCw,    color: "text-purple-600" },
        ].map(s => (
          <Card key={s.label} className="border-border">
            <CardContent className="p-3 flex items-center gap-2">
              <s.icon className={`w-5 h-5 ${s.color} shrink-0`} />
              <div>
                <p className="text-lg font-bold leading-none">{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Settings */}
      <AdmissionSettingsPanel />

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name / B-Form / ref..."
            className="pl-8 h-9 text-xs" />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="h-9 text-xs w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {(Object.keys(statusConfig) as AdmissionStatus[]).map(s => (
              <SelectItem key={s} value={s}>{statusConfig[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={classFilter} onValueChange={v => { setClassFilter(v); setPage(0); }}>
          <SelectTrigger className="h-9 text-xs w-28"><SelectValue placeholder="Class" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {["6","7","8","9","10"].map(c => <SelectItem key={c} value={c}>Class {c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(0); }}>
          <SelectTrigger className="h-9 text-xs w-32"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="fresh">Fresh</SelectItem>
            <SelectItem value="migration">Migration</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No applications found
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {["Name", "Class", "Type", "Status", "Date", "Action"].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(app => {
                  const cfg = statusConfig[app.status];
                  return (
                    <tr key={app.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5">
                        <p className="font-medium whitespace-nowrap">{app.full_name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{app.reference_no}</p>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">Class {app.applying_class}</td>
                      <td className="px-3 py-2.5 capitalize">{app.admission_type}</td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.badge}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                        {format(new Date(app.created_at), "dd MMM yy")}
                      </td>
                      <td className="px-3 py-2.5">
                        <Button size="sm" variant="outline"
                          onClick={() => setSelected(app)}
                          className="h-7 gap-1 text-xs px-2">
                          <Eye className="w-3 h-3" /> View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages} ({data?.count} total)
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}
                className="h-7 w-7 p-0"><ChevronLeft className="w-3 h-3" /></Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
                className="h-7 w-7 p-0"><ChevronRight className="w-3 h-3" /></Button>
            </div>
          </div>
        )}
      </Card>

      {/* Detail Dialog */}
      {selected && (
        <AdmissionDetail
          app={selected}
          onClose={() => setSelected(null)}
          onSaved={handleAdmissionSaved}
        />
      )}
    </div>
  );
};

export default AdminAdmissions;
