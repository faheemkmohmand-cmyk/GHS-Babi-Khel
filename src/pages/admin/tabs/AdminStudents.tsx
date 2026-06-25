import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { Plus, Pencil, Trash2, Loader2, Upload, Search, FileUp, Download, GraduationCap, ArrowRight, User, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import toast from "react-hot-toast";
import { StudentProfileDrawer } from "@/components/admin/StudentProfileDrawer";

interface Student {
  id: string;
  full_name: string;
  roll_number: string;
  class: string;
  father_name: string | null;
  father_cnic: string | null;
  contact_number: string | null;
  photo_url: string | null;
  is_active: boolean;
  created_at: string;
}

const classes = ["6", "7", "8", "9", "10"];

// All exam types shown for all classes
const ALL_EXAM_TYPES = ["1st Semester", "2nd Semester", "Annual-I", "Annual-II"];

const emptyStudent = {
  full_name: "",
  roll_number: "",
  class: "6",
  father_name: "",
  father_cnic: "",
  contact_number: "",
  photo_url: null as string | null,
  is_active: true,
};

const AdminStudents = () => {
  const qc = useQueryClient();
  const [classFilter, setClassFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileStudent, setProfileStudent] = useState<Student | null>(null);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState(emptyStudent);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [promotionOpen, setPromotionOpen] = useState(false);
  const [promotionFrom, setPromotionFrom] = useState("6");
  const [promotionTo, setPromotionTo] = useState("7");
  const [promotionExamType, setPromotionExamType] = useState("Annual-I");
  const [promotionYear, setPromotionYear] = useState<number>(new Date().getFullYear());
  const [promoting, setPromoting] = useState(false);
  const [promotionPreview, setPromotionPreview] = useState<{
    pass: { id: string; full_name: string; roll_number: string }[];
    fail: { id: string; full_name: string; roll_number: string }[];
    noResult: { id: string; full_name: string; roll_number: string }[];
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  // Available years fetched from actual results in DB
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loadingYears, setLoadingYears] = useState(false);
  const pageSize = 20;

  // ── Fetch available years from results table when promotionFrom changes ──
  useEffect(() => {
    if (!promotionOpen) return;
    const fetchAvailableYears = async () => {
      setLoadingYears(true);
      setAvailableYears([]);
      setPromotionYear(new Date().getFullYear());
      setPromotionPreview(null);
      const { data, error } = await supabase
        .from("results")
        .select("year")
        .eq("class", promotionFrom)
        .order("year", { ascending: false });
      if (!error && data) {
        // Deduplicate years
        const unique = [...new Set((data as { year: number }[]).map(r => r.year))].sort((a, b) => b - a);
        setAvailableYears(unique);
        if (unique.length > 0) setPromotionYear(unique[0]);
      }
      setLoadingYears(false);
    };
    fetchAvailableYears();
  }, [promotionFrom, promotionOpen]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-students", classFilter, search, page],
    queryFn: async () => {
      let query = supabase
        .from("students")
        .select(
          "id, full_name, roll_number, class, father_name, father_cnic, contact_number, photo_url, is_active, created_at",
          { count: "exact" }
        )
        .order("roll_number")
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (classFilter !== "all") query = query.eq("class", classFilter);
      if (search) query = query.or(`full_name.ilike.%${search}%,roll_number.ilike.%${search}%`);
      const { data, error, count } = await query;
      if (error) throw error;
      return { students: (data ?? []) as Student[], total: count ?? 0 };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("students").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["admin-students"] }); },
    onError: () => toast.error("Delete failed"),
  });

  const openAdd = () => { setEditing(null); setForm(emptyStudent); setPhotoFile(null); setModalOpen(true); };
  const openProfile = (s: Student) => { setProfileStudent(s); setProfileOpen(true); };
  const openEdit = (s: Student) => {
    setEditing(s);
    setForm({
      full_name: s.full_name,
      roll_number: s.roll_number,
      class: s.class,
      father_name: s.father_name || "",
      father_cnic: s.father_cnic || "",
      contact_number: s.contact_number || "",
      photo_url: s.photo_url,
      is_active: s.is_active,
    });
    setPhotoFile(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.full_name || !form.roll_number) { toast.error("Name and Roll No required"); return; }
    setSaving(true);
    try {
      let dupQuery = supabase
        .from("students")
        .select("id")
        .eq("roll_number", form.roll_number)
        .eq("class", form.class);
      if (editing) dupQuery = dupQuery.neq("id", editing.id);
      const { data: existing } = await dupQuery;
      if (existing && existing.length > 0) {
        toast.error(`Roll number ${form.roll_number} already exists in Class ${form.class}. Each class has its own roll numbers.`);
        setSaving(false);
        return;
      }

      let photo_url = form.photo_url;
      if (photoFile) {
        photo_url = await uploadToCloudinary(photoFile, "students");
      }
      const payload = { ...form, photo_url };
      const { error } = editing
        ? await supabase.from("students").update(payload).eq("id", editing.id)
        : await supabase.from("students").insert(payload);
      if (error) toast.error(error.message);
      else {
        toast.success(editing ? "Updated" : "Added");
        qc.invalidateQueries({ queryKey: ["admin-students"] });
        setModalOpen(false);
      }
    } catch (err: any) {
      toast.error(err?.message || "Save failed. Check Cloudinary env vars.");
    }
    setSaving(false);
  };

  const downloadCSVTemplate = () => {
    const csv = "full_name,roll_number,class,father_name,father_cnic,contact_number\nAli Khan,001,9,Muhammad Khan,35202-1234567-1,03001234567\nSara Ahmed,002,10,Ahmed Ali,35202-7654321-2,03217654321";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "students_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCSVImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setImportProgress(0);
    const text = await file.text();
    const lines = text.trim().split("\n");
    if (lines.length < 2) { toast.error("CSV is empty"); setImporting(false); return; }

    const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/['"]/g, ""));
    const nameIdx = headers.indexOf("full_name");
    const rollIdx = headers.indexOf("roll_number");
    const classIdx = headers.indexOf("class");
    const fatherIdx = headers.indexOf("father_name");
    const cnicIdx = headers.indexOf("father_cnic");
    const contactIdx = headers.indexOf("contact_number");

    if (nameIdx === -1 || rollIdx === -1 || classIdx === -1) {
      toast.error("CSV must have full_name, roll_number, class columns");
      setImporting(false);
      return;
    }

    const dataLines = lines.slice(1).filter(l => l.trim());
    const validClasses = ["6", "7", "8", "9", "10"];
    const rows: Array<{
      full_name: string; roll_number: string; class: string;
      father_name: string | null; father_cnic: string | null;
      contact_number: string | null; is_active: boolean;
    }> = [];
    let skipped = 0;

    for (const line of dataLines) {
      const cols = line.split(",").map(s => s.trim().replace(/['"]/g, ""));
      const full_name = cols[nameIdx];
      const roll_number = cols[rollIdx];
      const cls = cols[classIdx];
      const father_name = fatherIdx !== -1 ? cols[fatherIdx] || null : null;
      const father_cnic = cnicIdx !== -1 ? cols[cnicIdx] || null : null;
      const contact_number = contactIdx !== -1 ? cols[contactIdx] || null : null;

      if (!full_name || !roll_number || !cls || !validClasses.includes(cls)) {
        skipped++;
        continue;
      }

      rows.push({ full_name, roll_number, class: cls, father_name, father_cnic, contact_number, is_active: true });
    }

    const batchSize = 50;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      await supabase.from("students").upsert(batch, { onConflict: "roll_number,class" });
      setImportProgress(Math.round(((i + batchSize) / rows.length) * 100));
    }

    toast.success(`✅ ${rows.length} students imported, ${skipped} skipped`);
    qc.invalidateQueries({ queryKey: ["admin-students"] });
    setImporting(false);
    e.target.value = "";
  }, [qc]);

  // Fetch all active students in the from-class, cross-reference results for pass/fail
  const loadPromotionPreview = async () => {
    if (promotionFrom === promotionTo) { toast.error("From and To classes must be different"); return; }
    setLoadingPreview(true);
    setPromotionPreview(null);

    // 1. All active students in the source class
    const { data: allStudents, error: stuErr } = await supabase
      .from("students")
      .select("id, full_name, roll_number")
      .eq("class", promotionFrom)
      .eq("is_active", true)
      .order("roll_number");
    if (stuErr) { toast.error(stuErr.message); setLoadingPreview(false); return; }
    if (!allStudents || allStudents.length === 0) {
      toast.error(`No active students in Class ${promotionFrom}`);
      setLoadingPreview(false); return;
    }

    // 2. Results for this class/exam/year
    const { data: results, error: resErr } = await supabase
      .from("results")
      .select("student_id, is_pass")
      .eq("class", promotionFrom)
      .eq("exam_type", promotionExamType)
      .eq("year", promotionYear);
    if (resErr) { toast.error(resErr.message); setLoadingPreview(false); return; }

    // Build a lookup: student_id → is_pass
    const resultMap = new Map<string, boolean>();
    (results ?? []).forEach((r: { student_id: string; is_pass: boolean }) => {
      resultMap.set(r.student_id, r.is_pass);
    });

    const pass: typeof allStudents = [];
    const fail: typeof allStudents = [];
    const noResult: typeof allStudents = [];

    for (const s of allStudents) {
      if (!resultMap.has(s.id)) noResult.push(s);
      else if (resultMap.get(s.id)) pass.push(s);
      else fail.push(s);
    }

    setPromotionPreview({ pass, fail, noResult });
    setLoadingPreview(false);
  };

  const handlePromotion = async () => {
    if (!promotionPreview || promotionPreview.pass.length === 0) {
      toast.error("No passing students to promote"); return;
    }
    setPromoting(true);
    const ids = promotionPreview.pass.map(s => s.id);

    // Move students: update class to new class (removes from old, adds to new logically)
    const { error: updateErr } = await supabase
      .from("students")
      .update({ class: promotionTo })
      .in("id", ids);
    if (updateErr) { toast.error(updateErr.message); setPromoting(false); return; }

    toast.success(`✅ ${ids.length} passing students promoted from Class ${promotionFrom} → ${promotionTo}!`);
    qc.invalidateQueries({ queryKey: ["admin-students"] });
    setPromotionOpen(false);
    setPromotionPreview(null);
    setPromoting(false);
  };

  const set = (k: string, v: string | boolean | null) => setForm((p) => ({ ...p, [k]: v }));
  const totalPages = Math.ceil((data?.total ?? 0) / pageSize);
  const students = data?.students ?? [];

  return (
    <div className="space-y-4">
      {/* ── Header + Action Buttons (mobile-friendly) ──────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl sm:text-2xl font-heading font-bold text-foreground">Manage Students</h2>
          <span className="text-xs text-muted-foreground">{data?.total ?? 0} total</span>
        </div>
        {/* Action buttons — stack on mobile, row on desktop */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={downloadCSVTemplate}>
            <Download className="w-3.5 h-3.5" /> CSV Template
          </Button>
          <label className="inline-flex">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled={importing} asChild>
              <span><FileUp className="w-3.5 h-3.5" /> Import CSV
                <input type="file" accept=".csv,text/csv,application/vnd.ms-excel,text/plain,application/octet-stream" className="hidden" onChange={handleCSVImport} />
              </span>
            </Button>
          </label>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs text-blue-700 border-blue-400 hover:bg-blue-50" onClick={() => setPromotionOpen(true)}>
            <GraduationCap className="w-3.5 h-3.5" /> Promote
          </Button>
          <Button size="sm" className="gap-1.5 text-xs" onClick={openAdd}><Plus className="w-3.5 h-3.5" /> Add Student</Button>
        </div>
      </div>

      {importing && <Progress value={importProgress} className="h-2" />}

      {/* ── Search + Class Filter (mobile-friendly) ────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search name or roll no..." className="pl-9 h-10" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <Button variant={classFilter === "all" ? "default" : "outline"} size="sm" className="text-xs shrink-0" onClick={() => { setClassFilter("all"); setPage(0); }}>All</Button>
          {classes.map((c) => (
            <Button key={c} variant={classFilter === c ? "default" : "outline"} size="sm" className="text-xs shrink-0" onClick={() => { setClassFilter(c); setPage(0); }}>
              {c}
            </Button>
          ))}
        </div>
      </div>

      {/* ── Student List — Mobile Cards + Desktop Table ────────────────────── */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : students.length === 0 ? (
        <div className="text-center py-12">
          <User className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No students found</p>
          <p className="text-muted-foreground text-xs mt-1">Add students or adjust your search filter</p>
        </div>
      ) : (
        <>
          {/* ── Mobile Card Layout (< 640px) ── */}
          <div className="sm:hidden space-y-2.5">
            {students.map((s) => (
              <Card key={s.id} className="overflow-hidden">
                <CardContent className="p-3.5">
                  <div className="flex items-start gap-3">
                    {/* Photo / Avatar */}
                    {s.photo_url ? (
                      <img src={s.photo_url} alt="" className="w-11 h-11 rounded-full object-cover shrink-0 border-2 border-background shadow-sm" loading="lazy" decoding="async" />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0 border-2 border-background shadow-sm">
                        {s.full_name.charAt(0)}
                      </div>
                    )}
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-sm truncate">{s.full_name}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${s.is_active ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                          {s.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                      {/* Roll + Class */}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground font-mono">#{s.roll_number}</span>
                        <span className="bg-primary/10 text-primary text-[10px] font-semibold px-2 py-0.5 rounded-full">Class {s.class}</span>
                      </div>
                      {/* Father Name */}
                      {s.father_name && (
                        <p className="text-[11px] text-muted-foreground mt-1 truncate">
                          <span className="font-medium">Father:</span> {s.father_name}
                        </p>
                      )}
                      {/* Father CNIC */}
                      {s.father_cnic && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          <span className="font-medium">CNIC:</span> {s.father_cnic}
                        </p>
                      )}
                      {/* Contact Number */}
                      {s.contact_number && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          <span className="font-medium">Contact:</span> {s.contact_number}
                        </p>
                      )}
                    </div>
                  </div>
                  {/* Action buttons — full width, easy to tap */}
                  <div className="flex gap-2 mt-3 pt-2.5 border-t border-border/60">
                    <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-xs h-9" onClick={() => openProfile(s)}>
                      <Eye className="w-3.5 h-3.5" /> View
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-xs h-9" onClick={() => openEdit(s)}>
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-xs h-9 text-destructive hover:bg-destructive/10 border-destructive/30">
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {s.full_name}?</AlertDialogTitle>
                          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMut.mutate(s.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ── Desktop Table Layout (≥ 640px) ── */}
          <Card className="hidden sm:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Photo</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Roll No</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Name</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Class</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Father</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Father CNIC</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Contact</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
                      <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr key={s.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5">
                          {s.photo_url ? (
                            <img src={s.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" loading="lazy" decoding="async" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">{s.full_name.charAt(0)}</div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-sm">{s.roll_number}</td>
                        <td className="px-4 py-2.5 font-medium text-sm">{s.full_name}</td>
                        <td className="px-4 py-2.5">
                          <span className="bg-primary/10 text-primary text-xs font-medium px-2 py-0.5 rounded-full">Class {s.class}</span>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-muted-foreground">{s.father_name || "—"}</td>
                        <td className="px-4 py-2.5 text-sm text-muted-foreground font-mono">{s.father_cnic || "—"}</td>
                        <td className="px-4 py-2.5 text-sm text-muted-foreground">{s.contact_number || "—"}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.is_active ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                            {s.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8" title="View profile" onClick={() => openProfile(s)}><Eye className="w-3.5 h-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button></AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader><AlertDialogTitle>Delete {s.full_name}?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteMut.mutate(s.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Pagination (mobile-friendly) ───────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="gap-1">
            <ChevronLeft className="w-4 h-4" /> Prev
          </Button>
          <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">
            {page + 1} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} className="gap-1">
            Next <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* ── Add/Edit Student Dialog ────────────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Student" : "Add Student"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            {/* Full Name */}
            <div>
              <Label>Full Name *</Label>
              <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Student full name" />
            </div>
            {/* Roll Number + Class */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Roll Number *</Label>
                <Input value={form.roll_number} onChange={(e) => set("roll_number", e.target.value)} placeholder="e.g. 001" />
              </div>
              <div>
                <Label>Class</Label>
                <Select value={form.class} onValueChange={(v) => set("class", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{classes.map((c) => <SelectItem key={c} value={c}>Class {c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {/* Father Name */}
            <div>
              <Label>Father Name</Label>
              <Input value={form.father_name} onChange={(e) => set("father_name", e.target.value)} placeholder="Father's full name" />
            </div>
            {/* Father CNIC */}
            <div>
              <Label>Father CNIC</Label>
              <Input
                value={form.father_cnic}
                onChange={(e) => set("father_cnic", e.target.value)}
                placeholder="e.g. 35202-1234567-1"
                className="font-mono"
              />
            </div>
            {/* Contact Number */}
            <div>
              <Label>Contact Number</Label>
              <Input
                value={form.contact_number}
                onChange={(e) => set("contact_number", e.target.value)}
                placeholder="e.g. 03001234567"
                type="tel"
              />
            </div>
            {/* Active toggle */}
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
              <Label>Active</Label>
            </div>
            {/* Photo */}
            <div>
              <Label>Photo</Label>
              <div className="flex items-center gap-3 mt-1">
                {(form.photo_url || photoFile) && (
                  <img src={photoFile ? URL.createObjectURL(photoFile) : form.photo_url!} alt="" className="w-10 h-10 rounded-full object-cover" />
                )}
                <label className="flex items-center gap-1.5 text-sm text-primary cursor-pointer hover:underline">
                  <Upload className="w-4 h-4" /> Choose Photo
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
                </label>
              </div>
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} {editing ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Promote Students Dialog ────────────────────────────────────────── */}
      <Dialog open={promotionOpen} onOpenChange={(open) => { setPromotionOpen(open); if (!open) setPromotionPreview(null); }}>
        <DialogContent className="max-w-lg w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-blue-500" /> Promote Students
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">
              Only <strong className="text-foreground">passing students</strong> will be promoted. Failing students stay in their current class.
            </p>

            {/* From → To */}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground mb-1 block">From Class</Label>
                <Select value={promotionFrom} onValueChange={v => {
                  setPromotionFrom(v);
                  const idx = classes.indexOf(v);
                  setPromotionTo(classes[Math.min(idx + 1, classes.length - 1)]);
                  setPromotionPreview(null);
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{classes.map(c => <SelectItem key={c} value={c}>Class {c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground mt-5 shrink-0" />
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground mb-1 block">To Class</Label>
                <Select value={promotionTo} onValueChange={v => { setPromotionTo(v); setPromotionPreview(null); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{classes.map(c => <SelectItem key={c} value={c}>Class {c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Exam Type + Year — year auto-loaded from DB */}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground mb-1 block">Exam</Label>
                <Select value={promotionExamType} onValueChange={v => { setPromotionExamType(v); setPromotionPreview(null); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALL_EXAM_TYPES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground mb-1 block">
                  Year {loadingYears && <Loader2 className="inline w-3 h-3 ml-1 animate-spin" />}
                </Label>
                {availableYears.length > 0 ? (
                  <Select
                    value={String(promotionYear)}
                    onValueChange={v => { setPromotionYear(Number(v)); setPromotionPreview(null); }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {availableYears.map(y => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="h-10 flex items-center px-3 border rounded-md bg-muted/30 text-sm text-muted-foreground">
                    {loadingYears ? "Loading…" : "No results found"}
                  </div>
                )}
              </div>
            </div>

            {/* Info: no results for selected class */}
            {!loadingYears && availableYears.length === 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-800">
                ⚠️ No exam results found for Class {promotionFrom}. Please enter results first before promoting students.
              </div>
            )}

            {/* Check / Preview button */}
            {!promotionPreview && availableYears.length > 0 && (
              <Button
                variant="outline"
                className="w-full gap-2 border-blue-300 text-blue-700 hover:bg-blue-50"
                onClick={loadPromotionPreview}
                disabled={loadingPreview || promotionFrom === promotionTo}
              >
                {loadingPreview
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading preview…</>
                  : <><Search className="w-4 h-4" /> Preview who will be promoted</>}
              </Button>
            )}

            {/* Preview results */}
            {promotionPreview && (
              <div className="space-y-3">
                {/* Summary badges */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-green-50 border border-green-200 rounded-xl p-2.5">
                    <p className="text-2xl font-bold text-green-700">{promotionPreview.pass.length}</p>
                    <p className="text-[10px] font-semibold text-green-600 uppercase tracking-wide mt-0.5">✅ Will Promote</p>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-xl p-2.5">
                    <p className="text-2xl font-bold text-red-700">{promotionPreview.fail.length}</p>
                    <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide mt-0.5">❌ Will Stay (Fail)</p>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-2.5">
                    <p className="text-2xl font-bold text-yellow-700">{promotionPreview.noResult.length}</p>
                    <p className="text-[10px] font-semibold text-yellow-600 uppercase tracking-wide mt-0.5">⚠ No Result</p>
                  </div>
                </div>

                {/* Passing list */}
                {promotionPreview.pass.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-green-700 mb-1.5">✅ Passing — will move to Class {promotionTo}</p>
                    <div className="bg-green-50 border border-green-200 rounded-xl max-h-32 overflow-y-auto p-2 space-y-1">
                      {promotionPreview.pass.map(s => (
                        <div key={s.id} className="flex items-center gap-2 text-xs">
                          <span className="font-mono text-muted-foreground w-10 shrink-0">#{s.roll_number}</span>
                          <span className="text-foreground font-medium truncate">{s.full_name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Failing list */}
                {promotionPreview.fail.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-red-700 mb-1.5">❌ Failing — will remain in Class {promotionFrom}</p>
                    <div className="bg-red-50 border border-red-200 rounded-xl max-h-28 overflow-y-auto p-2 space-y-1">
                      {promotionPreview.fail.map(s => (
                        <div key={s.id} className="flex items-center gap-2 text-xs">
                          <span className="font-mono text-muted-foreground w-10 shrink-0">#{s.roll_number}</span>
                          <span className="text-foreground font-medium truncate">{s.full_name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* No result list */}
                {promotionPreview.noResult.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-800">
                    <p className="font-semibold mb-1">⚠️ {promotionPreview.noResult.length} student(s) have no result for {promotionExamType} {promotionYear} — they will NOT be promoted.</p>
                    <p className="text-yellow-700">Enter their results first if needed, then re-run the preview.</p>
                  </div>
                )}

                {promotionPreview.pass.length === 0 && (
                  <div className="bg-muted rounded-xl p-3 text-center text-sm text-muted-foreground">
                    No passing students found for the selected exam. Nothing to promote.
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-muted-foreground"
                  onClick={() => setPromotionPreview(null)}
                >
                  ↺ Change selection
                </Button>
              </div>
            )}
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => { setPromotionOpen(false); setPromotionPreview(null); }}>Cancel</Button>
            <Button
              onClick={handlePromotion}
              disabled={promoting || !promotionPreview || promotionPreview.pass.length === 0}
              className="gap-1.5 bg-blue-500 hover:bg-blue-600 text-white"
            >
              {promoting && <Loader2 className="w-4 h-4 animate-spin" />}
              {promoting
                ? "Promoting..."
                : promotionPreview
                  ? `Promote ${promotionPreview.pass.length} students → Class ${promotionTo}`
                  : `Promote ${promotionFrom} → ${promotionTo}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Student Profile Drawer (attendance + results + fees + ID + exam roll) ── */}
      <StudentProfileDrawer
        student={profileStudent}
        open={profileOpen}
        onOpenChange={setProfileOpen}
      />
    </div>
  );
};

export default AdminStudents;
