import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  useAdmissions, useAdmissionSettings, useAdmissionDocs,
  MIGRATION_STEPS, STATUS_META, AdmissionRow, AdmissionStatus
} from "@/hooks/useAdmissions";
import {
  Search, Filter, X, Eye, Check, XCircle, AlertTriangle, Save,
  Download, FileText, Loader2, Settings as SettingsIcon, ChevronRight,
  Hash, Phone, MapPin, Calendar, GraduationCap, FileSignature
} from "lucide-react";
import toast from "react-hot-toast";
import JSZip from "jszip";
import { format, parseISO } from "date-fns";

const StatCard = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div className="bg-card border border-border rounded-xl p-4">
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{label}</p>
    <p className={`text-2xl font-extrabold mt-1 ${color}`}>{value}</p>
  </div>
);

const AdminAdmissions = () => {
  const qc = useQueryClient();
  const { data: rows = [], isLoading, refetch } = useAdmissions();
  const { data: settings, refetch: refetchSettings } = useAdmissionSettings();

  const [filterClass, setFilterClass]   = useState("all");
  const [filterType, setFilterType]     = useState<"all" | "fresh" | "migration">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | AdmissionStatus>("all");
  const [search, setSearch]             = useState("");
  const [selected, setSelected]         = useState<AdmissionRow | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterClass !== "all"  && r.applying_class  !== filterClass)  return false;
      if (filterType  !== "all"  && r.admission_type  !== filterType)   return false;
      if (filterStatus!== "all"  && r.status          !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!r.full_name.toLowerCase().includes(q)
          && !r.reference_no.toLowerCase().includes(q)
          && !r.b_form_no.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, filterClass, filterType, filterStatus, search]);

  const stats = useMemo(() => ({
    total:     rows.length,
    pending:   rows.filter(r => r.status === "pending" || r.status === "under_review").length,
    approved:  rows.filter(r => r.status === "approved").length,
    rejected:  rows.filter(r => r.status === "rejected").length,
    migration: rows.filter(r => r.admission_type === "migration").length,
  }), [rows]);

  const refresh = () => { refetch(); qc.invalidateQueries({ queryKey: ["admissions"] }); };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total"     value={stats.total}     color="text-foreground" />
        <StatCard label="Pending"   value={stats.pending}   color="text-blue-600" />
        <StatCard label="Approved"  value={stats.approved}  color="text-green-600" />
        <StatCard label="Rejected"  value={stats.rejected}  color="text-red-600" />
        <StatCard label="Migration" value={stats.migration} color="text-orange-600" />
      </div>

      {/* Settings card */}
      <div className="bg-card border border-border rounded-xl p-4 sm:p-5 flex items-start gap-4 flex-wrap">
        <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <SettingsIcon className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <p className="font-heading font-bold text-foreground">Admissions {settings?.is_open ? "OPEN" : "CLOSED"}</p>
          <p className="text-sm text-muted-foreground">
            Session {settings?.session_year || "—"}
            {settings?.last_date && (() => { try { return ` · Last date: ${format(parseISO(settings.last_date), "d MMM yyyy")}`; } catch { return ""; } })()}
          </p>
        </div>
        <button onClick={() => setShowSettings(true)} className="text-sm font-bold bg-primary text-primary-foreground px-4 py-2 rounded-lg">
          Manage
        </button>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name / ref / B-Form…"
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm">
          <option value="all">All Classes</option>
          {["6","7","8","9","10"].map(c => <option key={c} value={c}>Class {c}</option>)}
        </select>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value as any)} className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm">
          <option value="all">All Types</option>
          <option value="fresh">Fresh</option>
          <option value="migration">Migration</option>
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm">
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="under_review">Under Review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="documents_missing">Documents Missing</option>
        </select>
      </div>

      {/* Table (desktop) / Card list (mobile) */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-xl">
          <FileText className="w-10 h-10 mx-auto opacity-30 mb-2" />
          <p className="text-muted-foreground text-sm">No applications match these filters.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-foreground text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3">Reference</th>
                  <th className="text-left px-4 py-3">Applicant</th>
                  <th className="text-left px-4 py-3">Class</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Submitted</th>
                  <th className="text-right px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const meta = STATUS_META[r.status];
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-secondary/40 cursor-pointer" onClick={() => setSelected(r)}>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-primary">{r.reference_no}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">{r.full_name}</td>
                      <td className="px-4 py-3">{r.applying_class}</td>
                      <td className="px-4 py-3 capitalize">{r.admission_type}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.cls}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />{meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{(() => { try { return format(parseISO(r.created_at), "d MMM yy"); } catch { return "—"; } })()}</td>
                      <td className="px-4 py-3 text-right"><Eye className="w-4 h-4 inline text-muted-foreground" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2.5">
            {filtered.map((r) => {
              const meta = STATUS_META[r.status];
              return (
                <button key={r.id} onClick={() => setSelected(r)} className="w-full text-left bg-card border border-border rounded-xl p-3 active:scale-[0.99] transition-transform">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] font-bold text-primary">{r.reference_no}</p>
                      <p className="font-bold text-sm text-foreground truncate">{r.full_name}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${meta.cls}`}>
                      <span className={`w-1 h-1 rounded-full ${meta.dot}`} />{meta.label}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-3">
                    <span>Class {r.applying_class}</span>
                    <span className="capitalize">{r.admission_type}</span>
                    <span className="ml-auto">{(() => { try { return format(parseISO(r.created_at), "d MMM"); } catch { return ""; } })()}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Modals */}
      {selected && <DetailModal row={selected} onClose={() => setSelected(null)} onChanged={refresh} />}
      {showSettings && <SettingsModal onClose={() => { setShowSettings(false); refetchSettings(); }} />}
    </div>
  );
};

/* ─────────────── Detail Modal ─────────────── */
const DetailModal = ({ row, onClose, onChanged }: { row: AdmissionRow; onClose: () => void; onChanged: () => void }) => {
  const { data: docs = [] } = useAdmissionDocs(row.id);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState(row.admin_note || "");
  const [reason, setReason] = useState(row.rejection_reason || "");
  const [rollNo, setRollNo] = useState(row.admission_roll_no || "");
  const [migStep, setMigStep] = useState<number>(row.migration_step || 1);

  const update = async (patch: any, label: string) => {
    setBusy(label);
    const t = toast.loading(label + "…");
    try {
      const { error } = await supabase.from("admissions").update(patch).eq("id", row.id);
      if (error) throw error;
      toast.success(label + " ✓", { id: t });
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Failed", { id: t });
    } finally { setBusy(null); }
  };

  const downloadAllZip = async () => {
    if (docs.length === 0) { toast.error("No documents to download"); return; }
    setBusy("zip");
    const t = toast.loading("Building ZIP…");
    try {
      const zip = new JSZip();
      for (const d of docs) {
        const { data, error } = await supabase.storage.from("admissions").download(d.file_path);
        if (error || !data) continue;
        const buf = await data.arrayBuffer();
        const base = d.file_name || d.file_path.split("/").pop() || `${d.doc_type}.bin`;
        zip.file(`${d.doc_type}_${base}`, buf);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${row.reference_no}-documents.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("Downloaded", { id: t });
    } catch (e: any) {
      toast.error(e?.message || "ZIP failed", { id: t });
    } finally { setBusy(null); }
  };

  const docUrl = (path: string) => supabase.storage.from("admissions").getPublicUrl(path).data.publicUrl;

  return (
    <div className="fixed inset-0 z-50 bg-foreground/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-card w-full sm:max-w-4xl max-h-[95vh] sm:rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="min-w-0">
            <p className="font-mono text-xs font-bold text-primary">{row.reference_no}</p>
            <h2 className="font-heading font-bold text-foreground truncate">{row.full_name}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* Info grid */}
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <Info icon={GraduationCap} label="Class" value={`Class ${row.applying_class}`} />
            <Info icon={FileSignature} label="Type" value={row.admission_type} cap />
            <Info icon={Hash} label="B-Form" value={row.b_form_no} />
            <Info icon={Phone} label="Contact" value={row.contact_number} />
            <Info icon={Calendar} label="Date of Birth" value={row.date_of_birth || "—"} />
            <Info icon={MapPin} label="Address" value={row.home_address || "—"} />
            <Info icon={GraduationCap} label="Father" value={row.father_name} />
            <Info icon={FileText} label="Previous School" value={row.previous_school || "—"} />
          </div>

          {/* Documents */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-foreground text-sm">Documents ({docs.length})</h3>
              <button onClick={downloadAllZip} disabled={busy === "zip"} className="text-xs font-bold bg-primary text-primary-foreground px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">
                {busy === "zip" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} ZIP
              </button>
            </div>
            {docs.length === 0 ? (
              <p className="text-xs text-muted-foreground">No documents uploaded.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {docs.map((d) => (
                  <a key={d.id} href={docUrl(d.file_path)} target="_blank" rel="noreferrer"
                     className="flex items-center gap-2 bg-secondary rounded-lg p-2 hover:bg-secondary/70 text-sm">
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground capitalize truncate">{d.doc_type.replace(/_/g, " ")}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{d.file_name || "file"}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Migration step */}
          {row.admission_type === "migration" && (
            <div>
              <h3 className="font-bold text-foreground text-sm mb-2">Migration Step</h3>
              <div className="flex gap-2 flex-wrap">
                {MIGRATION_STEPS.map(s => (
                  <button key={s.n} onClick={() => setMigStep(s.n)}
                    className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border ${migStep === s.n ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground"}`}>
                    Step {s.n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">{MIGRATION_STEPS[migStep - 1]?.label}</p>
              <button disabled={!!busy} onClick={() => update({ migration_step: migStep }, "Migration step updated")}
                className="mt-2 text-xs font-bold bg-secondary text-foreground px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">
                <Save className="w-3 h-3" /> Save Step
              </button>
            </div>
          )}

          {/* Notes & roll */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-foreground">Internal Note (visible to applicant)</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <button disabled={!!busy} onClick={() => update({ admin_note: note || null }, "Note saved")}
                className="mt-1 text-xs font-bold bg-secondary text-foreground px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">
                <Save className="w-3 h-3" /> Save Note
              </button>
            </div>
            <div>
              <label className="text-xs font-bold text-foreground">Admission Roll Number</label>
              <input value={rollNo} onChange={(e) => setRollNo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <button disabled={!!busy} onClick={() => update({ admission_roll_no: rollNo || null }, "Roll assigned")}
                className="mt-1 text-xs font-bold bg-secondary text-foreground px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">
                <Save className="w-3 h-3" /> Assign
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-foreground">Rejection Reason (if rejecting)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </div>
        </div>

        {/* Action bar */}
        <div className="border-t border-border p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button disabled={!!busy} onClick={() => update({ status: "approved" }, "Approved")}
            className="bg-green-600 text-white text-xs font-bold rounded-lg py-2.5 inline-flex items-center justify-center gap-1.5">
            <Check className="w-3.5 h-3.5" /> Approve
          </button>
          <button disabled={!!busy} onClick={() => update({ status: "rejected", rejection_reason: reason || "Not specified" }, "Rejected")}
            className="bg-red-600 text-white text-xs font-bold rounded-lg py-2.5 inline-flex items-center justify-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" /> Reject
          </button>
          <button disabled={!!busy} onClick={() => update({ status: "documents_missing" }, "Marked missing")}
            className="bg-orange-500 text-white text-xs font-bold rounded-lg py-2.5 inline-flex items-center justify-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Docs Missing
          </button>
          <button disabled={!!busy} onClick={() => update({ status: "under_review" }, "Marked under review")}
            className="bg-blue-600 text-white text-xs font-bold rounded-lg py-2.5 inline-flex items-center justify-center gap-1.5">
            <Eye className="w-3.5 h-3.5" /> Reviewing
          </button>
        </div>
      </div>
    </div>
  );
};

const Info = ({ icon: Icon, label, value, cap }: { icon: any; label: string; value: string; cap?: boolean }) => (
  <div className="flex items-start gap-2 bg-secondary/50 rounded-lg p-2.5">
    <Icon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{label}</p>
      <p className={`text-sm font-semibold text-foreground break-words ${cap ? "capitalize" : ""}`}>{value}</p>
    </div>
  </div>
);

/* ─────────────── Settings Modal ─────────────── */
const SettingsModal = ({ onClose }: { onClose: () => void }) => {
  const { data } = useAdmissionSettings();
  const [isOpen, setIsOpen]   = useState(!!data?.is_open);
  const [year, setYear]       = useState(data?.session_year || String(new Date().getFullYear() + 1));
  const [openD, setOpenD]     = useState(data?.open_date || "");
  const [lastD, setLastD]     = useState(data?.last_date || "");
  const [msg, setMsg]         = useState(data?.banner_message || "");
  const [saving, setSaving]   = useState(false);

  const save = async () => {
    setSaving(true);
    const t = toast.loading("Saving…");
    try {
      const { error } = await supabase.from("admission_settings").update({
        is_open: isOpen,
        session_year: year,
        open_date: openD || null,
        last_date: lastD || null,
        banner_message: msg || null,
      }).eq("id", 1);
      if (error) throw error;
      toast.success("Settings saved", { id: t });
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Failed", { id: t });
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-foreground/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card w-full max-w-md rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-heading font-bold">Admission Settings</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <label className="flex items-center gap-3 bg-secondary rounded-lg p-3 cursor-pointer">
            <input type="checkbox" checked={isOpen} onChange={(e) => setIsOpen(e.target.checked)} className="w-5 h-5 accent-current" />
            <div className="flex-1">
              <p className="font-bold text-sm">Admissions Open</p>
              <p className="text-xs text-muted-foreground">Show announcement banner on homepage</p>
            </div>
          </label>
          <Field label="Session Year"><input value={year} onChange={(e) => setYear(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="2026" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Open Date"><input type="date" value={openD} onChange={(e) => setOpenD(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></Field>
            <Field label="Last Date"><input type="date" value={lastD} onChange={(e) => setLastD(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></Field>
          </div>
          <Field label="Banner Message"><input value={msg} onChange={(e) => setMsg(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Admissions Open for Session 2026" /></Field>
        </div>
        <div className="p-4 border-t border-border flex gap-2">
          <button onClick={onClose} className="flex-1 bg-secondary text-foreground font-bold rounded-lg py-2.5 text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 bg-primary text-primary-foreground font-bold rounded-lg py-2.5 text-sm inline-flex items-center justify-center gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="text-xs font-bold text-foreground">{label}</span>
    <div className="mt-1">{children}</div>
  </label>
);

export default AdminAdmissions;
