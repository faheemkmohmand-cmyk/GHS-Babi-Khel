import { useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  useStudentRecords, useCreateStudentRecord, useUpdateStudentRecord,
  useDeleteStudentRecord, useBulkImportStudentRecords,
  fetchAllStudentRecordsForExport,
  StudentRecord, StudentRecordPayload, RecordStatus,
} from "@/hooks/useStudentRecords";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, Search, Plus, Pencil, Trash2, FileDown, FileUp,
  ChevronLeft, ChevronRight, AlertTriangle, X, Loader2,
} from "lucide-react";
import toast from "react-hot-toast";

const CLASS_OPTIONS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

const emptyForm: Partial<StudentRecordPayload> = {
  admission_date: "", serial_no: undefined, student_name: "", date_of_birth: "",
  father_name: "", caste: "", profession: "", address: "", admitted_class: "",
  fee: undefined, left_class: "", left_date: "", remarks: "",
};

// ═══════════════════════ Excel column mapping ═══════════════════════════
// Matches the school's existing "Withdrawal Register" file exactly, so the
// old register can be dropped in as-is.
const IMPORT_HEADERS: Record<string, keyof StudentRecordPayload> = {
  "date of admission": "admission_date",
  "s.no": "serial_no",
  "sno": "serial_no",
  "name of student": "student_name",
  "date of birth": "date_of_birth",
  "father name": "father_name",
  "nation/cast": "caste",
  "profession": "profession",
  "place of living": "address",
  "in which class admitted": "admitted_class",
  "fee": "fee",
  "in which class left the school": "left_class",
  "from which date left the school": "left_date",
  "remarks": "remarks",
};

function excelDateToISO(val: unknown): string | undefined {
  if (val == null || val === "") return undefined;
  if (typeof val === "number") {
    // Excel serial date → JS date
    const d = XLSX.SSF.parse_date_code(val);
    if (!d) return undefined;
    return `${d.y.toString().padStart(4, "0")}-${d.m.toString().padStart(2, "0")}-${d.d.toString().padStart(2, "0")}`;
  }
  const parsed = new Date(String(val));
  if (isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

function parseImportedWorkbook(file: ArrayBuffer): Partial<StudentRecordPayload>[] {
  const wb = XLSX.read(file, { type: "array", cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  // Find the header row — the row containing "Date of Admission"
  const headerRowIdx = raw.findIndex((row) =>
    row.some((cell) => typeof cell === "string" && cell.toLowerCase().includes("date of admission"))
  );
  if (headerRowIdx === -1) {
    throw new Error(
      'Could not find the header row (looking for a column named "Date of Admission"). Please check the file matches the register format.'
    );
  }

  const headerRow = raw[headerRowIdx].map((c) => (typeof c === "string" ? c.trim().toLowerCase() : ""));
  const colMap: Record<number, keyof StudentRecordPayload> = {};
  headerRow.forEach((h, i) => {
    if (IMPORT_HEADERS[h]) colMap[i] = IMPORT_HEADERS[h];
  });

  const rows: Partial<StudentRecordPayload>[] = [];
  for (let r = headerRowIdx + 1; r < raw.length; r++) {
    const row = raw[r];
    if (!row || row.every((c) => c == null || c === "")) continue; // skip blank spacer rows

    const record: Partial<StudentRecordPayload> = {};
    Object.entries(colMap).forEach(([idxStr, field]) => {
      const idx = Number(idxStr);
      const val = row[idx];
      if (val == null || val === "") return;

      if (field === "admission_date" || field === "date_of_birth" || field === "left_date") {
        (record as any)[field] = excelDateToISO(val);
      } else if (field === "serial_no") {
        record.serial_no = Number(val) || undefined;
      } else if (field === "fee") {
        record.fee = Number(val) || undefined;
      } else {
        (record as any)[field] = String(val).trim();
      }
    });

    if (record.student_name) rows.push(record);
  }
  return rows;
}

function exportToExcel(rows: StudentRecord[]) {
  const data = rows.map((r) => ({
    "Date of Admission": r.admission_date || "",
    "S.No": r.serial_no ?? "",
    "Name of Student": r.student_name,
    "Date of Birth": r.date_of_birth || "",
    "Father Name": r.father_name || "",
    "Nation/Cast": r.caste || "",
    "Profession": r.profession || "",
    "Place of Living": r.address || "",
    "In Which Class Admitted": r.admitted_class || "",
    "Fee": r.fee ?? "",
    "In Which Class Left the School": r.left_class || "",
    "From Which Date Left the School": r.left_date || "",
    "Remarks": r.remarks || "",
    "Status": r.status,
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = Object.keys(data[0] || {}).map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Student Records");
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Student-Records-${stamp}.xlsx`);
}

export default function AdminStudentRecords() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RecordStatus | "all">("all");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [page, setPage] = useState(0);

  const { data, isLoading } = useStudentRecords({
    search, status: statusFilter, admittedClass: classFilter, page,
  });
  const rows = data?.rows || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / 25));

  const createMutation = useCreateStudentRecord();
  const updateMutation = useUpdateStudentRecord();
  const deleteMutation = useDeleteStudentRecord();
  const importMutation = useBulkImportStudentRecords();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<StudentRecordPayload>>(emptyForm);

  const [deleteTarget, setDeleteTarget] = useState<StudentRecord | null>(null);
  const [exporting, setExporting] = useState(false);

  const [importPreview, setImportPreview] = useState<Partial<StudentRecordPayload>[] | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openAdd = () => { setEditingId(null); setForm(emptyForm); setFormOpen(true); };
  const openEdit = (r: StudentRecord) => {
    setEditingId(r.id);
    setForm({
      admission_date: r.admission_date || "", serial_no: r.serial_no ?? undefined,
      student_name: r.student_name, date_of_birth: r.date_of_birth || "",
      father_name: r.father_name || "", caste: r.caste || "", profession: r.profession || "",
      address: r.address || "", admitted_class: r.admitted_class || "",
      fee: r.fee ?? undefined, left_class: r.left_class || "",
      left_date: r.left_date || "", remarks: r.remarks || "",
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.student_name?.trim()) {
      toast.error("Student name is required");
      return;
    }
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, ...form });
        toast.success("Record updated");
      } else {
        await createMutation.mutateAsync(form);
        toast.success("Record added");
      }
      setFormOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success(`Deleted record for ${deleteTarget.student_name}`);
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseImportedWorkbook(buf);
      if (parsed.length === 0) {
        toast.error("No valid student rows found in this file");
        return;
      }
      setImportPreview(parsed);
      setImportFileName(file.name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read this file");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const confirmImport = async () => {
    if (!importPreview) return;
    try {
      const count = await importMutation.mutateAsync(importPreview);
      toast.success(`Imported ${count} student record${count === 1 ? "" : "s"}`);
      setImportPreview(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const all = await fetchAllStudentRecordsForExport();
      if (all.length === 0) {
        toast.error("No records to export yet");
        return;
      }
      exportToExcel(all);
      toast.success(`Exported ${all.length} records`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
            <Users className="w-6 h-6 text-emerald-700 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Student Records</h1>
            <p className="text-sm text-muted-foreground">
              Admissions &amp; withdrawal register — searchable, importable, exportable
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="file"
            ref={fileInputRef}
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileSelected}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <FileUp className="w-4 h-4 mr-2" /> Import Excel
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}
            Export Excel
          </Button>
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4 mr-2" /> Add Record
          </Button>
        </div>
      </div>

      {/* Search + filters */}
      <Card>
        <CardContent className="pt-6 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by student name or father's name..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setPage(0); }}>
            <SelectTrigger className="w-full md:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="enrolled">Enrolled</SelectItem>
              <SelectItem value="withdrawn">Withdrawn</SelectItem>
            </SelectContent>
          </Select>
          <Select value={classFilter} onValueChange={(v) => { setClassFilter(v); setPage(0); }}>
            <SelectTrigger className="w-full md:w-44"><SelectValue placeholder="Class" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {CLASS_OPTIONS.map((c) => <SelectItem key={c} value={c}>Class {c}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-6 overflow-x-auto">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>No student records yet.</p>
              <p className="text-sm">Add one manually, or import your existing Excel register.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Father</th>
                  <th className="py-2 pr-3">Admitted</th>
                  <th className="py-2 pr-3">Class</th>
                  <th className="py-2 pr-3">Left</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="py-2.5 pr-3 font-medium">{r.student_name}</td>
                    <td className="py-2.5 pr-3">{r.father_name || "—"}</td>
                    <td className="py-2.5 pr-3">{r.admission_date || "—"}</td>
                    <td className="py-2.5 pr-3">{r.admitted_class || "—"}</td>
                    <td className="py-2.5 pr-3">{r.left_date || "—"}</td>
                    <td className="py-2.5 pr-3">
                      <Badge className={r.status === "enrolled" ? "bg-green-100 text-green-800" : "bg-orange-100 text-orange-800"}>
                        {r.status === "enrolled" ? "Enrolled" : "Withdrawn"}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex justify-end gap-1.5">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setDeleteTarget(r)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Pagination */}
          {totalCount > 0 && (
            <div className="flex items-center justify-between pt-4 text-sm text-muted-foreground">
              <span>{totalCount} record{totalCount === 1 ? "" : "s"} total</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span>Page {page + 1} of {totalPages}</span>
                <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══════════ Add / Edit dialog ═══════════ */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Student Record" : "Add Student Record"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <Label>Student Name *</Label>
              <Input value={form.student_name || ""} onChange={(e) => setForm({ ...form, student_name: e.target.value })} />
            </div>
            <div>
              <Label>Father's Name</Label>
              <Input value={form.father_name || ""} onChange={(e) => setForm({ ...form, father_name: e.target.value })} />
            </div>
            <div>
              <Label>Date of Admission</Label>
              <Input type="date" value={form.admission_date || ""} onChange={(e) => setForm({ ...form, admission_date: e.target.value })} />
            </div>
            <div>
              <Label>Date of Birth</Label>
              <Input type="date" value={form.date_of_birth || ""} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
            </div>
            <div>
              <Label>Serial No.</Label>
              <Input type="number" value={form.serial_no ?? ""} onChange={(e) => setForm({ ...form, serial_no: Number(e.target.value) || undefined })} />
            </div>
            <div>
              <Label>Nation / Caste</Label>
              <Input value={form.caste || ""} onChange={(e) => setForm({ ...form, caste: e.target.value })} />
            </div>
            <div>
              <Label>Father's Profession</Label>
              <Input value={form.profession || ""} onChange={(e) => setForm({ ...form, profession: e.target.value })} />
            </div>
            <div>
              <Label>Address</Label>
              <Input value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <Label>Admitted in Class</Label>
              <Select value={form.admitted_class || ""} onValueChange={(v) => setForm({ ...form, admitted_class: v })}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  {CLASS_OPTIONS.map((c) => <SelectItem key={c} value={c}>Class {c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fee</Label>
              <Input type="number" value={form.fee ?? ""} onChange={(e) => setForm({ ...form, fee: Number(e.target.value) || undefined })} />
            </div>
            <div>
              <Label>Left in Class (if withdrawn)</Label>
              <Select value={form.left_class || ""} onValueChange={(v) => setForm({ ...form, left_class: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {CLASS_OPTIONS.map((c) => <SelectItem key={c} value={c}>Class {c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date Left</Label>
              <Input type="date" value={form.left_date || ""} onChange={(e) => setForm({ ...form, left_date: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>Remarks</Label>
              <Textarea value={form.remarks || ""} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingId ? "Save Changes" : "Add Record"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════════ Delete confirmation — warning as requested ═══════════ */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" /> Delete this record?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the record for{" "}
              <strong>{deleteTarget?.student_name}</strong>. This cannot be undone.
              Consider using Export first if you want a backup.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDelete}>
              Yes, Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══════════ Import preview / confirm ═══════════ */}
      <Dialog open={!!importPreview} onOpenChange={(open) => !open && setImportPreview(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirm Import — {importFileName}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Found <strong>{importPreview?.length || 0}</strong> student rows. Review a sample below, then confirm to add them all.
          </p>
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left">Father</th>
                  <th className="p-2 text-left">Admitted</th>
                  <th className="p-2 text-left">Class</th>
                  <th className="p-2 text-left">Left</th>
                </tr>
              </thead>
              <tbody>
                {(importPreview || []).slice(0, 8).map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-2">{r.student_name}</td>
                    <td className="p-2">{r.father_name || "—"}</td>
                    <td className="p-2">{r.admission_date || "—"}</td>
                    <td className="p-2">{r.admitted_class || "—"}</td>
                    <td className="p-2">{r.left_date || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(importPreview?.length || 0) > 8 && (
            <p className="text-xs text-muted-foreground">
              + {(importPreview!.length - 8)} more rows not shown here
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setImportPreview(null)}>
              <X className="w-4 h-4 mr-2" /> Cancel
            </Button>
            <Button onClick={confirmImport} disabled={importMutation.isPending}>
              {importMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Import {importPreview?.length || 0} Records
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
