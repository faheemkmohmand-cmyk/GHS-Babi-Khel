import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2, Printer, Trash2, Copy, AlertTriangle, Plus, Pencil, Download, Share2,
  MapPin, DoorOpen, Check, X as XIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  useTimetableSettings, useSaveTimetableSettings,
  useAllTimetables, useCheckTeacherConflict, useCheckRoomConflict,
  useCopyTimetable, useSaveTimetable, useRooms, useSaveRoom, useDeleteRoom,
} from "@/hooks/useTimetable";
import { useTeachers } from "@/hooks/useTeachers";

const classes = ["6", "7", "8", "9", "10"];
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const periods = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const subjectColors: Record<string, string> = {
  math: "bg-blue-100 border-blue-300 dark:bg-blue-900/30 dark:border-blue-700",
  english: "bg-emerald-100 border-emerald-300 dark:bg-emerald-900/30 dark:border-emerald-700",
  urdu: "bg-sky-100 border-sky-300 dark:bg-sky-900/30 dark:border-sky-700",
  science: "bg-purple-100 border-purple-300 dark:bg-purple-900/30 dark:border-purple-700",
  islamiat: "bg-green-100 border-green-300 dark:bg-green-900/30 dark:border-green-700",
  "social studies": "bg-orange-100 border-orange-300 dark:bg-orange-900/30 dark:border-orange-700",
  pst: "bg-cyan-100 border-cyan-300 dark:bg-cyan-900/30 dark:border-cyan-700",
  computer: "bg-indigo-100 border-indigo-300 dark:bg-indigo-900/30 dark:border-indigo-700",
};

const getSubjectColor = (subject: string) => {
  const key = subject.toLowerCase();
  for (const [k, v] of Object.entries(subjectColors)) {
    if (key.includes(k)) return v;
  }
  return "bg-secondary border-border";
};

interface CellData {
  subject: string; teacher: string; start_time: string; end_time: string;
  room: string; meet_link: string;
}
type Grid = Record<string, CellData>;

interface TimetableRow {
  id?: string; class: string; day: string; period_number: number;
  subject: string; teacher: string; start_time: string; end_time: string;
  room: string; meet_link: string;
}

const emptyCell = (): CellData => ({
  subject: "", teacher: "", start_time: "", end_time: "", room: "", meet_link: "",
});

const defaultPeriodNames = (): Record<string, string> => {
  const m: Record<string, string> = {};
  for (let i = 1; i <= 9; i++) m[i] = `Period ${i}`;
  return m;
};

// ─── Room Manager Component (Feature 2.5) ───────────────────────────────────

function RoomManager({ onClose }: { onClose: () => void }) {
  const { data: rooms = [], isLoading } = useRooms();
  const saveRoom = useSaveRoom();
  const deleteRoom = useDeleteRoom();
  const [editing, setEditing] = useState<Partial<{ id: string; name: string; capacity: number; room_type: string; is_available: boolean }> | null>(null);
  const [adding, setAdding] = useState(false);

  const roomTypes = ["classroom", "lab", "library", "hall"];

  const handleSave = async (room: any) => {
    await saveRoom.mutateAsync(room);
    setEditing(null);
    setAdding(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DoorOpen className="w-5 h-5" /> Room / Location Management
          </DialogTitle>
          <DialogDescription>
            Add, edit, or remove rooms. These appear in the room dropdown when assigning timetable entries.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <Button
            size="sm"
            className="gap-1.5 w-full"
            onClick={() => { setAdding(true); setEditing({ name: "", capacity: 40, room_type: "classroom", is_available: true }); }}
          >
            <Plus className="w-4 h-4" /> Add Room
          </Button>

          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : (
            <div className="space-y-2">
              {rooms.map((room) => (
                <div key={room.id} className="flex items-center gap-2 p-2 rounded-lg border border-border bg-card">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{room.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-[10px] h-5">{room.room_type}</Badge>
                      <span className="text-[10px] text-muted-foreground">Cap: {room.capacity}</span>
                      <Badge variant={room.is_available ? "default" : "secondary"} className="text-[10px] h-5">
                        {room.is_available ? "Available" : "Unavailable"}
                      </Badge>
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => { setAdding(false); setEditing(room); }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {room.name}?</AlertDialogTitle>
                        <AlertDialogDescription>This room will be removed from the list. Existing timetable entries with this room will keep the text value.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteRoom.mutate(room.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
              {rooms.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No rooms added yet</p>}
            </div>
          )}
        </div>

        {/* Edit/Add form */}
        {(adding || editing) && (
          <div className="border-t border-border pt-4 mt-2 space-y-3">
            <h4 className="font-semibold text-sm">{adding ? "Add New Room" : "Edit Room"}</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Room Name</Label>
                <Input
                  placeholder="e.g. Science Lab"
                  value={editing?.name || ""}
                  onChange={(e) => setEditing((prev) => prev ? { ...prev, name: e.target.value } : prev)}
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Capacity</Label>
                <Input
                  type="number"
                  value={editing?.capacity ?? 40}
                  onChange={(e) => setEditing((prev) => prev ? { ...prev, capacity: parseInt(e.target.value) || 40 } : prev)}
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Type</Label>
                <Select
                  value={editing?.room_type || "classroom"}
                  onValueChange={(v) => setEditing((prev) => prev ? { ...prev, room_type: v } : prev)}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {roomTypes.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editing?.is_available ?? true}
                  onChange={(e) => setEditing((prev) => prev ? { ...prev, is_available: e.target.checked } : prev)}
                  className="rounded"
                />
                <Label className="text-xs">Available for scheduling</Label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => handleSave(editing)} disabled={!editing?.name?.trim() || saveRoom.isPending} className="gap-1.5">
                {saveRoom.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {adding ? "Add Room" : "Save Changes"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setEditing(null); setAdding(false); }}>Cancel</Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Copy Timetable Dialog (Feature 2.3) ────────────────────────────────────

function CopyTimetableDialog({
  open, onClose, targetClass,
}: { open: boolean; onClose: () => void; targetClass: string }) {
  const [sourceClass, setSourceClass] = useState("");
  const copyMutation = useCopyTimetable();

  const handleCopy = async () => {
    if (!sourceClass || sourceClass === targetClass) {
      toast.error("Select a different class as source");
      return;
    }
    await copyMutation.mutateAsync({ sourceClass, targetClass });
    onClose();
  };

  return (
    <Dialog open={onOpenChange => open ? undefined : onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Copy className="w-5 h-5" /> Copy Timetable</DialogTitle>
          <DialogDescription>
            Copy all timetable entries from another class to Class {targetClass}. Existing entries for Class {targetClass} will be replaced.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label className="text-sm">Source Class</Label>
          <Select value={sourceClass} onValueChange={setSourceClass}>
            <SelectTrigger><SelectValue placeholder="Select source class" /></SelectTrigger>
            <SelectContent>
              {classes.filter((c) => c !== targetClass).map((c) => (
                <SelectItem key={c} value={c}>Class {c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCopy} disabled={!sourceClass || copyMutation.isPending} className="gap-1.5">
            {copyMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Copy to Class {targetClass}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Conflict Warning Dialog (Feature 2.2) ─────────────────────────────────

function ConflictDialog({
  conflict, type, onSwap, onCancel,
}: {
  conflict: { teacher?: string; room?: string; day: string; period_number: number; existing_class: string; existing_subject: string; };
  type: "teacher" | "room";
  onSwap: () => void;
  onCancel: () => void;
}) {
  const name = type === "teacher" ? conflict.teacher : conflict.room;
  return (
    <Dialog open>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" /> {type === "teacher" ? "Teacher" : "Room"} Conflict
          </DialogTitle>
          <DialogDescription>
            {name} is already assigned to Class {conflict.existing_class} on {conflict.day} Period {conflict.period_number} ({conflict.existing_subject}).
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={onSwap} className="gap-1.5">
            <Copy className="w-4 h-4" /> Swap Assignment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── PDF Export (Feature 2.4) ───────────────────────────────────────────────

function exportTimetablePDF(
  classLevel: string,
  periodNames: Record<string, string>,
  grid: Grid,
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const ML = 10, MR = 10;

  // Header
  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(0.8);
  doc.line(ML, 8, w - MR, 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(10, 10, 10);
  doc.text("GOVERNMENT HIGH SCHOOL BABI KHEL", w / 2, 15, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(70, 70, 70);
  doc.text("District Mohmand, Khyber Pakhtunkhwa", w / 2, 20, { align: "center" });
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.25);
  doc.line(ML, 23, w - MR, 23);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(10, 10, 10);
  doc.text(`CLASS ${classLevel} TIMETABLE`, w / 2, 29, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(70, 70, 70);
  doc.text(`Academic Year ${new Date().getFullYear()}`, w / 2, 34, { align: "center" });
  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(0.8);
  doc.line(ML, 37, w - MR, 37);

  // Table data
  const head = [["Period", ...days]];
  const body = periods.map((p) => {
    const pName = periodNames[p] || `Period ${p}`;
    const row: string[] = [pName];
    days.forEach((d) => {
      const cell = grid[`${p}-${d}`];
      if (cell?.subject) {
        let text = cell.subject;
        if (cell.teacher) text += `\n${cell.teacher}`;
        if (cell.start_time && cell.end_time) text += `\n${cell.start_time}-${cell.end_time}`;
        if (cell.room) text += `\nRoom: ${cell.room}`;
        row.push(text);
      } else {
        row.push("—");
      }
    });
    return row;
  });

  autoTable(doc, {
    startY: 40,
    head,
    body,
    headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9, halign: "center", cellPadding: 4 },
    bodyStyles: { fontSize: 8, cellPadding: 3, textColor: [20, 20, 20], lineHeight: 1.3 },
    columnStyles: {
      0: { cellWidth: 28, fontStyle: "bold", halign: "center" },
      ...Object.fromEntries(days.map((_, i) => [i + 1, { cellWidth: "auto" }])),
    },
    alternateRowStyles: { fillColor: [246, 247, 250] },
    margin: { left: ML, right: MR, bottom: 14 },
    didDrawPage: (data) => {
      doc.setDrawColor(100, 100, 100);
      doc.setLineWidth(0.25);
      doc.line(ML, h - 10, w - MR, h - 10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(80, 80, 80);
      doc.text("GHS Babi Khel — Class Timetable", ML, h - 6);
      doc.text(`Generated: ${new Date().toLocaleDateString("en-GB")}`, w / 2, h - 6, { align: "center" });
    },
  });

  doc.save(`Timetable_Class${classLevel}.pdf`);
}

// ─── Image Export (Feature 2.4) ─────────────────────────────────────────────

function exportTimetableImage(
  classLevel: string,
  periodNames: Record<string, string>,
  grid: Grid,
) {
  // Create a canvas-based image for sharing
  const canvas = document.createElement("canvas");
  const cellW = 140;
  const cellH = 70;
  const headerH = 40;
  const labelW = 110;
  const padding = 20;
  const totalW = labelW + days.length * cellW + padding * 2;
  const totalH = headerH + periods.length * cellH + padding * 2 + 50;

  canvas.width = totalW;
  canvas.height = totalH;
  const ctx = canvas.getContext("2d")!;

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, totalW, totalH);

  // Title
  ctx.fillStyle = "#1a1a2e";
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("GHS Babi Khel", totalW / 2, 28);
  ctx.font = "14px sans-serif";
  ctx.fillStyle = "#555";
  ctx.fillText(`Class ${classLevel} Timetable — ${new Date().getFullYear()}`, totalW / 2, 48);

  let y = padding + 60;

  // Header row
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(padding, y, labelW, headerH);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Period", padding + labelW / 2, y + 25);

  days.forEach((d, i) => {
    const x = padding + labelW + i * cellW;
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(x, y, cellW, headerH);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(d, x + cellW / 2, y + 25);
  });

  y += headerH;

  // Data rows
  periods.forEach((p, pi) => {
    const isAlt = pi % 2 === 1;
    const pName = periodNames[p] || `Period ${p}`;

    // Period label
    ctx.fillStyle = isAlt ? "#f0f0f5" : "#f8f8fc";
    ctx.fillRect(padding, y, labelW, cellH);
    ctx.fillStyle = "#1a1a2e";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(pName, padding + labelW / 2, y + cellH / 2 + 4);

    days.forEach((d, di) => {
      const x = padding + labelW + di * cellW;
      ctx.fillStyle = isAlt ? "#f0f0f5" : "#f8f8fc";
      ctx.fillRect(x, y, cellW, cellH);

      const cell = grid[`${p}-${d}`];
      if (cell?.subject) {
        ctx.textAlign = "center";
        ctx.fillStyle = "#1a1a2e";
        ctx.font = "bold 11px sans-serif";
        ctx.fillText(cell.subject, x + cellW / 2, y + 20);
        if (cell.teacher) {
          ctx.fillStyle = "#555";
          ctx.font = "10px sans-serif";
          ctx.fillText(cell.teacher, x + cellW / 2, y + 35);
        }
        if (cell.start_time && cell.end_time) {
          ctx.fillStyle = "#888";
          ctx.font = "9px sans-serif";
          ctx.fillText(`${cell.start_time}-${cell.end_time}`, x + cellW / 2, y + 48);
        }
        if (cell.room) {
          ctx.fillStyle = "#888";
          ctx.font = "9px sans-serif";
          ctx.fillText(`Room: ${cell.room}`, x + cellW / 2, y + 60);
        }
      }

      // Grid lines
      ctx.strokeStyle = "#ddd";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, cellW, cellH);
    });

    // Grid line for period label
    ctx.strokeStyle = "#ddd";
    ctx.strokeRect(padding, y, labelW, cellH);

    y += cellH;
  });

  // Footer
  y += 10;
  ctx.fillStyle = "#999";
  ctx.font = "9px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("GHS Babi Khel — Generated: " + new Date().toLocaleDateString("en-GB"), totalW / 2, y + 10);

  // Download as PNG
  const link = document.createElement("a");
  link.download = `Timetable_Class${classLevel}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

// ─── Main Admin Timetables Component ────────────────────────────────────────

const AdminTimetables = () => {
  const qc = useQueryClient();
  const [cls, setCls] = useState("6");
  const [grid, setGrid] = useState<Grid>({});
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showRoomManager, setShowRoomManager] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [conflictInfo, setConflictInfo] = useState<any>(null);
  const [conflictType, setConflictType] = useState<"teacher" | "room">("teacher");
  const [conflictCellKey, setConflictCellKey] = useState<string | null>(null);
  const [copyDayDialog, setCopyDayDialog] = useState<string | null>(null); // source day name, or null when closed
  const [copyDayTargets, setCopyDayTargets] = useState<string[]>([]);

  // ─── 2.1 Period Names from Supabase ─────────────────────────────────────
  const { data: settings } = useTimetableSettings(cls);
  const saveSettings = useSaveTimetableSettings();
  const [periodNames, setPeriodNames] = useState<Record<string, string>>(defaultPeriodNames());

  useEffect(() => {
    if (settings?.period_names) {
      setPeriodNames(settings.period_names as Record<string, string>);
    }
  }, [settings]);

  const handlePeriodNameChange = useCallback((periodNum: number, name: string) => {
    setPeriodNames((prev) => {
      const next = { ...prev, [periodNum]: name };
      // Debounced save to Supabase
      saveSettings.mutate({ classLevel: cls, periodNames: next });
      return next;
    });
  }, [cls, saveSettings]);

  // ─── Fetch timetable data ──────────────────────────────────────────────
  const queryKey = ["admin-timetable", cls];
  const { data: rows = [], isLoading } = useQuery<TimetableRow[]>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.from("timetables").select("*").eq("class", cls);
      if (error) throw error;
      return (data ?? []) as TimetableRow[];
    },
  });

  // ─── All timetables (for conflict detection) ───────────────────────────
  const { data: allRows = [] } = useAllTimetables();

  // ─── Rooms ─────────────────────────────────────────────────────────────
  const { data: rooms = [] } = useRooms();

  // ─── Teachers (real list from Manage Teachers, replaces free-text typing) ──
  const { data: teachers = [] } = useTeachers();

  useEffect(() => {
    const g: Grid = {};
    periods.forEach((p) => days.forEach((d) => { g[`${p}-${d}`] = emptyCell(); }));
    rows.forEach((r) => {
      g[`${r.period_number}-${r.day}`] = {
        subject: r.subject, teacher: r.teacher || "", start_time: r.start_time || "",
        end_time: r.end_time || "", room: r.room || "", meet_link: (r as any).meet_link || "",
      };
    });
    setGrid(g);
  }, [rows]);

  const updateCell = useCallback((key: string, field: keyof CellData, value: string) => {
    setGrid((prev) => {
      const next = { ...prev, [key]: { ...prev[key], [field]: value } };
      // When a teacher is picked and the subject field is still empty,
      // auto-fill it from the teacher's profile (Manage Teachers → subject).
      // Never overwrites a subject the admin already typed/kept.
      if (field === "teacher" && !prev[key]?.subject?.trim()) {
        const t = teachers.find((tc) => tc.full_name === value);
        if (t?.subject) next[key] = { ...next[key], subject: t.subject };
      }
      return next;
    });
  }, [teachers]);

  // ─── 2.2 Real-time Conflict Detection ──────────────────────────────────
  const teacherConflicts = useMemo(() => {
    const conflicts: Record<string, { teacher: string; existingClass: string; existingSubject: string }[]> = {};
    // For each cell in grid, check if teacher is already assigned elsewhere
    periods.forEach((p) => {
      days.forEach((d) => {
        const key = `${p}-${d}`;
        const cell = grid[key];
        if (!cell?.teacher?.trim()) return;
        // Check against allRows (other classes)
        const matches = allRows.filter(
          (r) =>
            r.day === d &&
            r.period_number === p &&
            r.class !== cls &&
            (r.teacher || r.teacher_name || "").toLowerCase().trim() === cell.teacher.toLowerCase().trim()
        );
        if (matches.length) {
          if (!conflicts[key]) conflicts[key] = [];
          matches.forEach((m) => conflicts[key].push({
            teacher: cell.teacher,
            existingClass: m.class,
            existingSubject: m.subject,
          }));
        }
      });
    });
    return conflicts;
  }, [grid, allRows, cls]);

  const roomConflicts = useMemo(() => {
    const conflicts: Record<string, { room: string; existingClass: string; existingSubject: string }[]> = {};
    periods.forEach((p) => {
      days.forEach((d) => {
        const key = `${p}-${d}`;
        const cell = grid[key];
        if (!cell?.room?.trim()) return;
        const matches = allRows.filter(
          (r) => r.day === d && r.period_number === p && r.class !== cls && r.room?.toLowerCase().trim() === cell.room.toLowerCase().trim()
        );
        if (matches.length) {
          if (!conflicts[key]) conflicts[key] = [];
          matches.forEach((m) => conflicts[key].push({ room: cell.room, existingClass: m.class, existingSubject: m.subject }));
        }
      });
    });
    return conflicts;
  }, [grid, allRows, cls]);

  // ─── Busy-teacher lookup for the dropdown (Feature: prevent duplicate
  //     assignment at the point of selection, not just at save time) ──────
  // For a given day+period, returns a map of teacher full_name → which other
  // class already has them booked, so the dropdown can show "(busy — Class 7)"
  // next to that teacher's name and the admin never picks a conflict in the
  // first place.
  const getBusyTeachersFor = useCallback((day: string, periodNumber: number): Record<string, string> => {
    const busy: Record<string, string> = {};
    allRows
      .filter((r) => r.day === day && r.period_number === periodNumber && r.class !== cls)
      .forEach((r) => {
        const t = (r.teacher || r.teacher_name || "").trim();
        if (t) busy[t] = r.class;
      });
    return busy;
  }, [allRows, cls]);

  // ─── Save with conflict check ──────────────────────────────────────────
  const handleSave = async () => {
    // ── Pre-save validation: block save if any teacher is double-booked ──
    // teacherConflicts is a Record<cellKey, conflicts[]> computed from grid
    // + allRows (the other classes' timetables). If even one conflict exists
    // we refuse to save and surface a clear, actionable toast.
    const conflictKeys = Object.keys(teacherConflicts);
    if (conflictKeys.length > 0) {
      const first = teacherConflicts[conflictKeys[0]][0];
      // Decode the cellKey to a human-readable day + period
      const [periodNo, dayName] = conflictKeys[0].split("-");
      toast.error(
        `Cannot save: ${first.teacher} is already assigned to Class ${first.existingClass} ` +
        `(${first.existingSubject}) on ${dayName} Period ${periodNo}. ` +
        `Resolve all ${conflictKeys.length} conflict${conflictKeys.length > 1 ? "s" : ""} first.`,
        { duration: 6000 }
      );
      return;
    }

    setSaving(true);
    try {
      const inserts: Omit<TimetableRow, "id">[] = [];
      periods.forEach((p) => days.forEach((d) => {
        const cell = grid[`${p}-${d}`];
        if (cell?.subject) {
          inserts.push({
            class: cls, day: d, period_number: p, subject: cell.subject, teacher: cell.teacher,
            start_time: cell.start_time, end_time: cell.end_time, room: cell.room, meet_link: cell.meet_link,
          });
        }
      }));

      // Delete existing rows for this class — CHECK the error this time.
      // The old code silently ignored delete failures, which masked RLS issues.
      const { error: delErr } = await supabase.from("timetables").delete().eq("class", cls);
      if (delErr) {
        // PGRST116 = "JSON object requested, but no rows matched" — harmless
        // here (nothing to delete). Any other error is a real problem.
        if (delErr.code !== "PGRST116") {
          toast.error(`Delete failed: ${delErr.message}`, { duration: 6000 });
          return;
        }
      }

      if (inserts.length) {
        const { error } = await supabase.from("timetables").insert(inserts);
        if (error) {
          // Surface the actual Postgres/PostgREST message so the user (and
          // we, debugging) can see e.g. "new row violates row-level security
          // policy" or "column \"teacher_name\" does not exist" instead of
          // the old opaque "Save failed".
          toast.error(`Save failed: ${error.message}`, { duration: 7000 });
          return;
        }
      }
      toast.success("Timetable saved!");
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["all-timetables"] });
    } catch (err: any) {
      // Catch network errors, supabase client errors, anything thrown.
      toast.error(err?.message || "Save failed — please try again.", { duration: 6000 });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    await supabase.from("timetables").delete().eq("class", cls);
    toast.success("Cleared");
    qc.invalidateQueries({ queryKey });
    qc.invalidateQueries({ queryKey: ["all-timetables"] });
  };

  // ─── Copy one day's full schedule (all periods, this class) to other days ──
  // This is the "set up Monday once, then one click to apply the same
  // periods/teachers/rooms to Tuesday, Wednesday, etc." feature. Only touches
  // the current class's grid in memory — admin still clicks Save afterward,
  // so nothing is written to Supabase until they confirm. Conflict checks
  // (teacherConflicts/roomConflicts) automatically re-run against the updated
  // grid since they're derived via useMemo from `grid`.
  const handleCopyDayToOthers = (sourceDay: string, targetDays: string[]) => {
    if (!targetDays.length) return;
    setGrid((prev) => {
      const next = { ...prev };
      periods.forEach((p) => {
        const sourceCell = prev[`${p}-${sourceDay}`];
        targetDays.forEach((targetDay) => {
          next[`${p}-${targetDay}`] = sourceCell ? { ...sourceCell } : emptyCell();
        });
      });
      return next;
    });
    toast.success(`Copied ${sourceDay}'s schedule to ${targetDays.join(", ")}. Review conflicts, then click Save.`, { duration: 5000 });
    setCopyDayDialog(null);
    setCopyDayTargets([]);
  };

  // ─── Swap on conflict ─────────────────────────────────────────────────
  const handleConflictSwap = async () => {
    if (!conflictCellKey || !conflictInfo) return;
    // Clear the conflicting teacher/room from the other class entry
    const { day, period_number } = (() => {
      const [p, d] = conflictCellKey.split("-");
      return { day: d, period_number: parseInt(p) };
    })();

    // Find and clear the other class's entry
    const otherClass = conflictInfo.existing_class || conflictInfo.existingClass;
    const { data: otherRows } = await supabase
      .from("timetables")
      .select("id")
      .eq("class", otherClass)
      .eq("day", day)
      .eq("period_number", period_number);

    if (otherRows?.length) {
      const field = conflictType === "teacher" ? "teacher" : "room";
      await supabase.from("timetables").update({ [field]: null }).eq("id", otherRows[0].id);
      qc.invalidateQueries({ queryKey: ["all-timetables"] });
      toast.success(`Swapped ${conflictType} from Class ${otherClass}`);
    }
    setConflictInfo(null);
    setConflictCellKey(null);
  };

  if (isLoading) return <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>;

  const totalConflicts = Object.keys(teacherConflicts).length + Object.keys(roomConflicts).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-heading font-bold text-foreground">Timetables</h2>
        {totalConflicts > 0 && (
          <Badge variant="destructive" className="gap-1.5 animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5" /> {totalConflicts} Conflict{totalConflicts > 1 ? "s" : ""} Detected
          </Badge>
        )}
      </div>

      {/* ─── Action Bar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={cls} onValueChange={setCls}>
          <TabsList className="overflow-x-auto flex-nowrap w-full max-w-xs sm:max-w-none scrollbar-none">
            {classes.map((c) => <TabsTrigger key={c} value={c} className="text-xs sm:text-sm whitespace-nowrap">Class {c}</TabsTrigger>)}
          </TabsList>
        </Tabs>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="gap-1.5"
          title={Object.keys(teacherConflicts).length > 0 ? "Resolve all teacher conflicts before saving" : undefined}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 text-destructive">
              <Trash2 className="w-4 h-4" /> Clear
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear timetable?</AlertDialogTitle>
              <AlertDialogDescription>All periods for Class {cls} will be removed.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleClear} className="bg-destructive text-destructive-foreground">Clear</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Button variant="outline" size="sm" onClick={() => setShowCopyDialog(true)} className="gap-1.5">
          <Copy className="w-4 h-4" /> Copy From
        </Button>

        <Button variant="outline" size="sm" onClick={() => exportTimetablePDF(cls, periodNames, grid)} className="gap-1.5">
          <Download className="w-4 h-4" /> PDF
        </Button>

        <Button variant="outline" size="sm" onClick={() => exportTimetableImage(cls, periodNames, grid)} className="gap-1.5">
          <Share2 className="w-4 h-4" /> Share Image
        </Button>

        <Button variant="outline" size="sm" onClick={() => setShowRoomManager(true)} className="gap-1.5">
          <MapPin className="w-4 h-4" /> Rooms
        </Button>

        <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
          <Printer className="w-4 h-4" /> Print
        </Button>
      </div>

      {/* ─── Timetable Grid ─────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <div className="min-w-[800px]">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-secondary/50">
                  <th className="border border-border px-2 py-2 text-left font-semibold text-foreground w-28">Period</th>
                  {days.map((d) => (
                    <th key={d} className="border border-border px-2 py-2 text-center font-semibold text-foreground min-w-[130px]">
                      <div className="flex items-center justify-center gap-1.5">
                        {d}
                        <button
                          type="button"
                          title={`Copy ${d}'s schedule to other days`}
                          onClick={() => { setCopyDayDialog(d); setCopyDayTargets([]); }}
                          className="text-muted-foreground hover:text-primary transition-colors"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p}>
                    {/* ─── Period name (editable, synced to Supabase) ── */}
                    <td className="border border-border px-1 py-2 font-medium text-muted-foreground bg-secondary/30">
                      <input
                        type="text"
                        value={periodNames[p] || `Period ${p}`}
                        onChange={(e) => handlePeriodNameChange(p, e.target.value)}
                        className="w-full bg-transparent text-xs font-semibold text-foreground border-none outline-none text-center"
                        placeholder={`Period ${p}`}
                      />
                    </td>
                    {days.map((d) => {
                      const key = `${p}-${d}`;
                      const cell = grid[key] || emptyCell();
                      const isEditing = editingCell === key;
                      const tConflict = teacherConflicts[key];
                      const rConflict = roomConflicts[key];
                      const hasConflict = tConflict?.length || rConflict?.length;

                      return (
                        <td
                          key={key}
                          className={`border border-border p-1 cursor-pointer transition-colors ${
                            hasConflict
                              ? "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700"
                              : cell.subject
                              ? getSubjectColor(cell.subject)
                              : "hover:bg-secondary/30"
                          }`}
                          onClick={() => setEditingCell(isEditing ? null : key)}
                        >
                          {/* Conflict indicators */}
                          {hasConflict && !isEditing && (
                            <div className="flex gap-1 mb-1">
                              {tConflict?.map((c, i) => (
                                <Badge key={`t${i}`} variant="destructive" className="text-[8px] h-4 px-1 gap-0.5 cursor-pointer"
                                  onClick={(e) => { e.stopPropagation(); setConflictType("teacher"); setConflictInfo({ ...c, day: d, period_number: p }); setConflictCellKey(key); }}>
                                  <AlertTriangle className="w-2.5 h-2.5" /> {c.teacher} → Cls {c.existingClass}
                                </Badge>
                              ))}
                              {rConflict?.map((c, i) => (
                                <Badge key={`r${i}`} variant="destructive" className="text-[8px] h-4 px-1 gap-0.5 cursor-pointer"
                                  onClick={(e) => { e.stopPropagation(); setConflictType("room"); setConflictInfo({ ...c, day: d, period_number: p }); setConflictCellKey(key); }}>
                                  <AlertTriangle className="w-2.5 h-2.5" /> {c.room} → Cls {c.existingClass}
                                </Badge>
                              ))}
                            </div>
                          )}

                          {isEditing ? (
                            <div className="space-y-1 p-1" onClick={(e) => e.stopPropagation()}>
                              <Input placeholder="Subject" value={cell.subject} onChange={(e) => updateCell(key, "subject", e.target.value)} className="h-7 text-xs" />
                              {/* Teacher — picked from the real Manage Teachers list instead of
                                  typed freehand. Busy teachers (already booked elsewhere at this
                                  exact day+period) are shown greyed out with which class has them,
                                  so a double-booking is visible before it's even selected. */}
                              {(() => {
                                const busy = getBusyTeachersFor(d, p);
                                return (
                                  <Select value={cell.teacher || "__none__"} onValueChange={(v) => updateCell(key, "teacher", v === "__none__" ? "" : v)}>
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder="Select teacher" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">— No teacher —</SelectItem>
                                      {teachers.map((t) => {
                                        const busyClass = busy[t.full_name];
                                        return (
                                          <SelectItem key={t.id} value={t.full_name} disabled={!!busyClass && t.full_name !== cell.teacher}>
                                            {t.full_name}{t.subject ? ` (${t.subject})` : ""}{busyClass && t.full_name !== cell.teacher ? ` — busy: Class ${busyClass}` : ""}
                                          </SelectItem>
                                        );
                                      })}
                                    </SelectContent>
                                  </Select>
                                );
                              })()}
                              <div className="flex gap-1">
                                <Input type="time" value={cell.start_time} onChange={(e) => updateCell(key, "start_time", e.target.value)} className="h-7 text-xs flex-1" />
                                <Input type="time" value={cell.end_time} onChange={(e) => updateCell(key, "end_time", e.target.value)} className="h-7 text-xs flex-1" />
                              </div>
                              {/* Room dropdown from rooms table */}
                              <Select value={cell.room || "__custom__"} onValueChange={(v) => {
                                if (v === "__custom__") return;
                                updateCell(key, "room", v);
                              }}>
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue placeholder="Room" />
                                </SelectTrigger>
                                <SelectContent>
                                  {rooms.filter((r) => r.is_available).map((r) => (
                                    <SelectItem key={r.id} value={r.name}>{r.name} ({r.room_type})</SelectItem>
                                  ))}
                                  <SelectItem value="__custom__">Type custom...</SelectItem>
                                </SelectContent>
                              </Select>
                              {!rooms.find((r) => r.name === cell.room) && (
                                <Input placeholder="Room (custom)" value={cell.room} onChange={(e) => updateCell(key, "room", e.target.value)} className="h-7 text-xs" />
                              )}
                              <Input placeholder="Meet Link (optional)" value={cell.meet_link} onChange={(e) => updateCell(key, "meet_link", e.target.value)} className="h-7 text-xs" />
                              <Button size="sm" variant="ghost" className="h-6 text-xs w-full" onClick={() => setEditingCell(null)}>Done</Button>
                            </div>
                          ) : (
                            <div className="p-1 min-h-[48px]">
                              {cell.subject ? (
                                <>
                                  <p className="font-semibold text-xs text-foreground">{cell.subject}</p>
                                  {cell.teacher && <p className="text-[10px] text-muted-foreground">{cell.teacher}</p>}
                                  {cell.start_time && <p className="text-[10px] text-muted-foreground">{cell.start_time}–{cell.end_time}</p>}
                                  {cell.room && <p className="text-[10px] text-muted-foreground flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{cell.room}</p>}
                                </>
                              ) : (
                                <p className="text-[10px] text-muted-foreground/50 text-center">Click to add</p>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ─── Dialogs ───────────────────────────────────────────────────── */}
      {/* ─── Copy Day → Other Days dialog ─────────────────────────────────
          Lets the admin set up e.g. Monday once (all periods, this class)
          and broadcast it to Tuesday/Wednesday/etc. with one click, instead
          of re-entering every period + teacher for each day by hand. */}
      {copyDayDialog && (
        <Dialog open onOpenChange={(open) => { if (!open) { setCopyDayDialog(null); setCopyDayTargets([]); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Copy {copyDayDialog}'s Schedule</DialogTitle>
              <DialogDescription>
                Applies all of Class {cls}'s {copyDayDialog} periods (subject, teacher, time, room) to the
                days you pick below. This only updates the grid — click <strong>Save</strong> afterward to
                write it to the database. Any teacher double-bookings will still be flagged before saving.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2 py-2">
              {days.filter((d) => d !== copyDayDialog).map((d) => (
                <label key={d} className="flex items-center gap-2 text-sm border border-border rounded-lg px-3 py-2 cursor-pointer hover:bg-secondary/50">
                  <input
                    type="checkbox"
                    checked={copyDayTargets.includes(d)}
                    onChange={(e) => {
                      setCopyDayTargets((prev) =>
                        e.target.checked ? [...prev, d] : prev.filter((x) => x !== d)
                      );
                    }}
                  />
                  {d}
                </label>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setCopyDayDialog(null); setCopyDayTargets([]); }}>Cancel</Button>
              <Button
                disabled={!copyDayTargets.length}
                onClick={() => handleCopyDayToOthers(copyDayDialog, copyDayTargets)}
              >
                Copy to {copyDayTargets.length || ""} day{copyDayTargets.length === 1 ? "" : "s"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {showRoomManager && <RoomManager onClose={() => setShowRoomManager(false)} />}
      {showCopyDialog && <CopyTimetableDialog open={showCopyDialog} onClose={() => setShowCopyDialog(false)} targetClass={cls} />}
      {conflictInfo && (
        <ConflictDialog
          conflict={conflictInfo}
          type={conflictType}
          onSwap={handleConflictSwap}
          onCancel={() => { setConflictInfo(null); setConflictCellKey(null); }}
        />
      )}
    </div>
  );
};

export default AdminTimetables;
