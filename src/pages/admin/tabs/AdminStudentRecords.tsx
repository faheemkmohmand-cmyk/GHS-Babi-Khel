import { useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import {
  useStudentRecords, useCreateStudentRecord, useUpdateStudentRecord,
  useDeleteStudentRecord, useBulkImportStudentRecords, useDeleteAllStudentRecords,
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
  ChevronLeft, ChevronRight, AlertTriangle, X, Loader2, ShieldAlert,
} from "lucide-react";
import toast from "react-hot-toast";

const CLASS_OPTIONS = ["5", "6", "7", "8", "9", "10"];

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

// Collapse any run of whitespace (including double-spaces, tabs, trailing
// spaces) to a single space and lowercase, so header matching survives the
// inconsistent spacing found in real-world school registers — e.g. the
// source file has "from which  date left the school" (double space).
function normalizeHeader(h: string): string {
  return h.replace(/\s+/g, " ").trim().toLowerCase();
}

// The register writes classes as "5TH", "6TH", "8TH" etc. Storing that
// suffix verbatim breaks the admin edit dropdown, which only offers plain
// numbers ("5", "6", "7"...) — a stored "8TH" matches none of its options,
// so the field renders blank even though the data is actually there. Strip
// the ordinal suffix at import time so stored values always match the
// dropdown, while keeping the original text as a fallback if it doesn't
// look like a class number.
function normalizeClassValue(raw: string): string {
  const s = raw.trim();
  const match = s.match(/^(\d+)/); // "8TH" -> "8", "10TH" -> "10"
  return match ? match[1] : s;
}

// The register's dates are entered by hand and are inconsistent: some
// cells are real Excel date values, others are typed text with different
// separators ("13-04-11", "18/07/11", "09-8-09-02", "01--10-03",
// "01-092005"). Cross-checking many rows against their neighboring real
// date cells confirms the school consistently writes day-month-year
// (never month-day), with either 2- or 4-digit years. This parser commits
// to that single order rather than guessing per-cell, exactly as verified
// against the source file.
//
// Returns null (not undefined) specifically when the text LOOKS like a
// date but doesn't resolve to a real calendar day (e.g. "31-09-90" — day
// 31 in a 30-day month, a genuine typo in the original register). That
// case must never be silently dropped or silently "corrected" by
// guessing; the caller preserves the original raw text in Remarks instead
// so a human can decide, and nothing from the source file disappears.
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // Feb=29, leap-safe upper bound

function parseHandwrittenDateString(raw: string): string | null | undefined {
  const s = raw.trim();
  if (!s) return undefined;

  const digitGroups = s.match(/\d+/g);
  if (!digitGroups) return undefined;

  let day: number, month: number, year: number;

  if (digitGroups.length === 3) {
    [day, month, year] = digitGroups.map(Number);
  } else if (digitGroups.length === 2) {
    const [first, second] = digitGroups;
    if (second.length >= 5) {
      day = Number(first);
      month = Number(second.slice(0, second.length - 4));
      year = Number(second.slice(-4));
    } else {
      return null; // e.g. "0-09-2004" — not enough info to safely reconstruct
    }
  } else if (digitGroups.length === 4) {
    day = Number(digitGroups[0]);
    month = Number(digitGroups[1]);
    year = Number(digitGroups[digitGroups.length - 1]);
  } else {
    return null;
  }

  if (year < 100) year += year < 50 ? 2000 : 1900;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > DAYS_IN_MONTH[month - 1]) return null; // e.g. day 31 in September

  const d = new Date(Date.UTC(year, month - 1, day));
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// Returns { iso, rawIfUnparsed }: iso is the parsed date (or undefined if
// there was nothing to parse), rawIfUnparsed is set only when the cell had
// real content that could not be safely converted — so the caller can
// keep the original text instead of losing it.
function excelDateToISO(val: unknown): { iso?: string; rawIfUnparsed?: string } {
  if (val == null || val === "") return {};
  if (typeof val === "number") {
    const d = XLSX.SSF.parse_date_code(val);
    if (!d) return { rawIfUnparsed: String(val) };
    return { iso: `${d.y.toString().padStart(4, "0")}-${d.m.toString().padStart(2, "0")}-${d.d.toString().padStart(2, "0")}` };
  }
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return { rawIfUnparsed: String(val) };
    return { iso: val.toISOString().slice(0, 10) };
  }
  if (typeof val === "string") {
    const result = parseHandwrittenDateString(val);
    if (result === null) return { rawIfUnparsed: val.trim() };
    if (result === undefined) return {};
    return { iso: result };
  }
  return { rawIfUnparsed: String(val) };
}

function parseImportedWorkbook(file: ArrayBuffer): Partial<StudentRecordPayload>[] {
  const wb = XLSX.read(file, { type: "array", cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  // Find the header row — the row containing "Date of Admission"
  const headerRowIdx = raw.findIndex((row) =>
    row.some((cell) => typeof cell === "string" && normalizeHeader(cell).includes("date of admission"))
  );
  if (headerRowIdx === -1) {
    throw new Error(
      'Could not find the header row (looking for a column named "Date of Admission"). Please check the file matches the register format.'
    );
  }

  const headerRow = raw[headerRowIdx].map((c) => (typeof c === "string" ? normalizeHeader(c) : ""));
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
        const { iso, rawIfUnparsed } = excelDateToISO(val);
        if (iso) {
          (record as any)[field] = iso;
        } else if (rawIfUnparsed) {
          // Never silently drop a date the register actually had — keep
          // the exact original text so nothing is lost, just unparsed.
          const label = field === "admission_date" ? "Admission date (unparsed)"
                      : field === "date_of_birth" ? "DOB (unparsed)"
                      : "Left date (unparsed)";
          record.remarks = record.remarks
            ? `${record.remarks}; ${label}: ${rawIfUnparsed}`
            : `${label}: ${rawIfUnparsed}`;
        }
      } else if (field === "serial_no") {
        // The register mostly uses plain integers, but a handful of rows
        // use suffixed values like "242B" / "248A" (siblings sharing one
        // register line-number, lettered to disambiguate). Number("242B")
        // is NaN, so a bare Number() cast silently drops these — instead,
        // keep the numeric part for the sortable serial_no column and
        // preserve the full original value (with its letter) in remarks
        // so nothing about the source record is lost.
        const strVal = String(val).trim();
        const numMatch = strVal.match(/^\d+/);
        if (numMatch) {
          record.serial_no = Number(numMatch[0]);
          if (strVal !== numMatch[0]) {
            record.remarks = record.remarks
              ? `${record.remarks}; Register S.No: ${strVal}`
              : `Register S.No: ${strVal}`;
          }
        }
      } else if (field === "fee") {
        record.fee = Number(val) || undefined;
      } else if (field === "admitted_class" || field === "left_class") {
        (record as any)[field] = normalizeClassValue(String(val));
      } else {
        (record as any)[field] = String(val).trim();
      }
    });

    // Excel headers can end up empty (bad spacing, merged cells, stray
    // values) even when the underlying register clearly shows a withdrawal
    // — e.g. left_class filled in but left_date blank. Import shouldn't
    // silently drop that signal, so status derivation downstream treats
    // either field being present as "withdrawn" (see deriveStatus below).
    if (record.student_name) rows.push(record);
  }
  return rows;
}

// Professional, styled export — borders, centered cells, colored header,
// frozen header row, sensible column widths. Rows arrive already sorted
// oldest-admission-first from fetchAllStudentRecordsForExport.
async function exportToExcel(rows: StudentRecord[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "GHS Babi Khel";
  const ws = wb.addWorksheet("Student Records", {
    views: [{ state: "frozen", ySplit: 1 }], // freeze header row
  });

  const columns: { header: string; key: string; width: number }[] = [
    { header: "Date of Admission", key: "admission_date", width: 18 },
    { header: "S.No", key: "serial_no", width: 8 },
    { header: "Name of Student", key: "student_name", width: 24 },
    { header: "Date of Birth", key: "date_of_birth", width: 16 },
    { header: "Father Name", key: "father_name", width: 22 },
    { header: "Nation/Cast", key: "caste", width: 16 },
    { header: "Profession", key: "profession", width: 16 },
    { header: "Place of Living", key: "address", width: 18 },
    { header: "Class Admitted", key: "admitted_class", width: 14 },
    { header: "Fee", key: "fee", width: 10 },
    { header: "Class Left", key: "left_class", width: 12 },
    { header: "Date Left", key: "left_date", width: 16 },
    { header: "Remarks", key: "remarks", width: 22 },
    { header: "Status", key: "status", width: 14 },
  ];
  ws.columns = columns;

  rows.forEach((r) => {
    ws.addRow({
      admission_date: r.admission_date || "",
      serial_no: r.serial_no ?? "",
      student_name: r.student_name,
      date_of_birth: r.date_of_birth || "",
      father_name: r.father_name || "",
      caste: r.caste || "",
      profession: r.profession || "",
      address: r.address || "",
      admitted_class: r.admitted_class || "",
      fee: r.fee ?? "",
      left_class: r.left_class || "",
      left_date: r.left_date || "",
      remarks: r.remarks || "",
      status: r.status === "enrolled" ? "Enrolled" : "Withdrawn",
    });
  });

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: "FFB0B0B0" } },
    left: { style: "thin", color: { argb: "FFB0B0B0" } },
    bottom: { style: "thin", color: { argb: "FFB0B0B0" } },
    right: { style: "thin", color: { argb: "FFB0B0B0" } },
  };

  // Header row styling
  const headerRow = ws.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F6F4A" } }; // school green
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder;
  });

  // Data rows: border every cell, center-align, and zebra-stripe for readability
  for (let i = 2; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const isWithdrawn = row.getCell("status").value === "Withdrawn";
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = thinBorder;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      if (i % 2 === 0) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F7F5" } };
      }
    });
    // Highlight the status cell distinctly so withdrawn/enrolled reads at a glance
    const statusCell = row.getCell("status");
    statusCell.font = { bold: true, color: { argb: isWithdrawn ? "FF9A3412" : "FF166534" } };
    statusCell.fill = {
      type: "pattern", pattern: "solid",
      fgColor: { argb: isWithdrawn ? "FFFED7AA" : "FFDCFCE7" },
    };
  }

  // Left-align the two long free-text columns for readability (find by
  // matching header key, since ExcelJS getColumn(key) needs the key form
  // set on ws.columns above).
  const nameColIdx = columns.findIndex((c) => c.key === "student_name") + 1;
  const remarksColIdx = columns.findIndex((c) => c.key === "remarks") + 1;
  ws.getColumn(nameColIdx).eachCell({ includeEmpty: false }, (cell, rowNum) => {
    if (rowNum > 1) cell.alignment = { ...cell.alignment, horizontal: "left" };
  });
  ws.getColumn(remarksColIdx).eachCell({ includeEmpty: false }, (cell, rowNum) => {
    if (rowNum > 1) cell.alignment = { ...cell.alignment, horizontal: "left" };
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const stamp = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Student-Records-${stamp}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
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
  const deleteAllMutation = useDeleteAllStudentRecords();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<StudentRecordPayload>>(emptyForm);

  const [deleteTarget, setDeleteTarget] = useState<StudentRecord | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState("");
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
      // Records imported before the class-normalization fix may still have
      // "8TH"/"5TH" stored with the ordinal suffix. Normalize on read too,
      // so old rows display correctly in the dropdown without needing a
      // separate one-off data migration.
      address: r.address || "", admitted_class: normalizeClassValue(r.admitted_class || ""),
      fee: r.fee ?? undefined, left_class: normalizeClassValue(r.left_class || ""),
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

  const handleDeleteAll = async () => {
    if (deleteAllConfirmText !== "DELETE ALL") return;
    try {
      const count = await deleteAllMutation.mutateAsync();
      toast.success(`Deleted all ${count} record${count === 1 ? "" : "s"}`);
      setDeleteAllOpen(false);
      setDeleteAllConfirmText("");
      setPage(0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete all failed");
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
      await exportToExcel(all);
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
          <Button
            variant="outline"
            className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
            onClick={() => setDeleteAllOpen(true)}
          >
            <ShieldAlert className="w-4 h-4 mr-2" /> Delete All
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

      {/* ═══════════ Delete ALL confirmation — type-to-confirm, since this
           is irreversible and can wipe the entire register in one action ═══════════ */}
      <AlertDialog open={deleteAllOpen} onOpenChange={(open) => { if (!open) { setDeleteAllOpen(false); setDeleteAllConfirmText(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <ShieldAlert className="w-5 h-5" /> Delete ALL student records?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes <strong>every</strong> student record in this table —
              all {totalCount} record{totalCount === 1 ? "" : "s"}, including the entire
              imported register. This cannot be undone and there is no recovery.
              <br /><br />
              <strong>Export a backup first</strong> if you haven't already.
              <br /><br />
              To confirm, type <strong>DELETE ALL</strong> below.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            autoFocus
            value={deleteAllConfirmText}
            onChange={(e) => setDeleteAllConfirmText(e.target.value)}
            placeholder="Type DELETE ALL to confirm"
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteAllConfirmText("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 disabled:opacity-50"
              disabled={deleteAllConfirmText !== "DELETE ALL" || deleteAllMutation.isPending}
              onClick={handleDeleteAll}
            >
              {deleteAllMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete Everything
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
