import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  useAdminAdmissions, useAdmissionDocuments, useUpdateAdmission,
  useUpdateAdmissionSettings, useAdmissionSettings, getDocUrl,
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
  GraduationCap, Eye, CheckCircle2, XCircle, AlertCircle,
  Clock, FileText, ExternalLink, RefreshCw, ChevronLeft,
  ChevronRight, Settings2, Users, Loader2, Search
} from "lucide-react";
import toast from "react-hot-toast";
import { format } from "date-fns";

const PAGE_SIZE = 20;

const statusConfig: Record<AdmissionStatus, { label: string; badge: string }> = {
  pending:           { label: "Pending",           badge: "bg-blue-100 text-blue-800" },
  under_review:      { label: "Under Review",      badge: "bg-purple-100 text-purple-800" },
  approved:          { label: "Approved",           badge: "bg-green-100 text-green-800" },
  rejected:          { label: "Rejected",           badge: "bg-red-100 text-red-800" },
  documents_missing: { label: "Documents Missing", badge: "bg-orange-100 text-orange-800" },
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

/* ── Detail Dialog ──────────────────────────────────────────────────────── */
function AdmissionDetail({ app, onClose }: { app: Admission; onClose: () => void }) {
  const updateMut = useUpdateAdmission();
  const { data: docs = [], isLoading: docsLoading } = useAdmissionDocuments(app.id);
  const [status, setStatus]  = useState<AdmissionStatus>(app.status);
  const [note, setNote]      = useState(app.admin_note ?? "");
  const [reason, setReason]  = useState(app.rejection_reason ?? "");
  const [rollNo, setRollNo]  = useState(app.admission_roll_no ?? "");
  const [migStep, setMigStep]= useState<number>(app.migration_step ?? 1);
  const [saving, setSaving]  = useState(false);

  const isMigration = app.admission_type === "migration";

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMut.mutateAsync({
        id: app.id,
        updates: {
          status,
          admin_note:       note || null,
          rejection_reason: reason || null,
          admission_roll_no: rollNo || null,
          migration_step:   isMigration ? migStep : undefined,
        },
      });
      toast.success("Application updated");
      onClose();
    } catch {
      toast.error("Failed to update");
    } finally {
      setSaving(false);
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
          {/* Student info */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[
              ["Father",        app.father_name],
              ["Class",         `Class ${app.applying_class}`],
              ["Type",          app.admission_type],
              ["B-Form",        app.b_form_no],
              ["Contact",       app.contact_number],
              ["Gender",        app.gender ?? "—"],
              ["Prev School",   app.previous_school ?? "—"],
              ["Prev Marks",    app.previous_marks ?? "—"],
              ["Applied",       format(new Date(app.created_at), "dd MMM yyyy")],
            ].map(([k, v]) => (
              <div key={k} className="bg-muted/50 rounded-lg p-2">
                <p className="text-[10px] text-muted-foreground font-medium uppercase">{k}</p>
                <p className="font-semibold text-xs break-words">{v}</p>
              </div>
            ))}
          </div>

          {/* Documents */}
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
                  <a key={doc.id} href={getDocUrl(doc.file_path)} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 text-xs bg-muted/50 hover:bg-primary/10 hover:text-primary border border-border rounded-lg px-3 py-2 transition-colors">
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    <span className="flex-1 capitalize">{doc.doc_type.replace(/_/g, " ")}</span>
                    <ExternalLink className="w-3 h-3 opacity-60" />
                  </a>
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
                placeholder="Explain why this application was rejected…"
                className="text-xs min-h-[70px]" />
            </div>
          )}

          <div>
            <Label className="text-xs font-bold mb-1.5 block">Admin Note (visible to student)</Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)}
              placeholder="Optional message to the applicant…"
              className="text-xs min-h-[70px]" />
          </div>

          <div>
            <Label className="text-xs font-bold mb-1.5 block">Assign Admission Roll No.</Label>
            <Input value={rollNo} onChange={e => setRollNo(e.target.value)}
              placeholder="e.g. OHS-26-001" className="text-xs h-9" />
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Save Changes"}
          </Button>
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
    is_open:        settings?.is_open        ?? false,
    session_year:   settings?.session_year   ?? "2026",
    open_date:      settings?.open_date      ?? "",
    last_date:      settings?.last_date      ?? "",
    banner_message: settings?.banner_message ?? "",
    notes:          settings?.notes          ?? "",
  });

  // Sync when settings load
  if (settings && !saving && form.session_year === "2026" && settings.session_year !== "2026") {
    setForm({
      is_open:        settings.is_open,
      session_year:   settings.session_year,
      open_date:      settings.open_date ?? "",
      last_date:      settings.last_date ?? "",
      banner_message: settings.banner_message ?? "",
      notes:          settings.notes ?? "",
    });
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
            <Input value={form.session_year} onChange={e => setForm(f => ({ ...f, session_year: e.target.value }))}
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
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Save Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}

/* ══ MAIN ADMIN TAB ═════════════════════════════════════════════════════════ */
const AdminAdmissions = () => {
  const [statusFilter, setStatusFilter]   = useState("all");
  const [classFilter,  setClassFilter]    = useState("all");
  const [typeFilter,   setTypeFilter]     = useState("all");
  const [page, setPage]                   = useState(0);
  const [selected, setSelected]           = useState<Admission | null>(null);
  const [search, setSearch]               = useState("");

  const { data, isLoading } = useAdminAdmissions({
    status: statusFilter, classFilter, typeFilter, page,
  });
  const admissions = data?.admissions ?? [];
  const totalPages = Math.ceil((data?.count ?? 0) / PAGE_SIZE);

  // Stats
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-primary" /> Admissions Management
        </h2>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total",     value: stats.total,     icon: Users,          color: "text-primary" },
          { label: "Pending",   value: stats.pending,   icon: Clock,          color: "text-blue-600" },
          { label: "Approved",  value: stats.approved,  icon: CheckCircle2,   color: "text-green-600" },
          { label: "Rejected",  value: stats.rejected,  icon: XCircle,        color: "text-red-500" },
          { label: "Migration", value: stats.migration, icon: RefreshCw,      color: "text-purple-600" },
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
            placeholder="Search name / B-Form / ref…"
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
                  {["Ref No.", "Name", "Class", "Type", "Status", "Date", "Action"].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(app => {
                  const cfg = statusConfig[app.status];
                  return (
                    <tr key={app.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5 font-mono font-bold text-primary">{app.reference_no}</td>
                      <td className="px-3 py-2.5 font-medium whitespace-nowrap">{app.full_name}</td>
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
      {selected && <AdmissionDetail app={selected} onClose={() => setSelected(null)} />}
    </div>
  );
};

export default AdminAdmissions;
