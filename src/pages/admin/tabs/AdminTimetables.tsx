import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Printer, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

const classes = ["6", "7", "8", "9", "10"];
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const periods = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const subjectColors: Record<string, string> = {
  math: "bg-blue-100 border-blue-300",
  english: "bg-emerald-100 border-emerald-300",
  urdu: "bg-blue-100 border-blue-300",
  science: "bg-purple-100 border-purple-300",
  islamiat: "bg-green-100 border-green-300",
  "social studies": "bg-orange-100 border-orange-300",
  pst: "bg-cyan-100 border-cyan-300",
  computer: "bg-indigo-100 border-indigo-300",
};
const getSubjectColor = (subject: string) => {
  const key = subject.toLowerCase();
  for (const [k, v] of Object.entries(subjectColors)) {
    if (key.includes(k)) return v;
  }
  return "bg-secondary border-border";
};

interface CellData { subject: string; teacher: string; start_time: string; end_time: string; room: string; }
type Grid = Record<string, CellData>;

interface TimetableRow {
  id?: string; class: string; day: string; period_number: number;
  subject: string; teacher: string; start_time: string; end_time: string; room: string;
}

const emptyCell = (): CellData => ({ subject: "", teacher: "", start_time: "", end_time: "", room: "" });

const defaultPeriodNames = (): Record<number, string> => ({
  1: "Period 1", 2: "Period 2", 3: "Period 3", 4: "Period 4",
  5: "Period 5", 6: "Period 6", 7: "Period 7", 8: "Period 8", 9: "Period 9"
});

const AdminTimetables = () => {
  const qc = useQueryClient();
  const [cls, setCls] = useState("6");
  const [grid, setGrid] = useState<Grid>({});
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [periodNames, setPeriodNames] = useState<Record<number, string>>(() => {
    const saved = localStorage.getItem(`ghs-period-names-${cls}`);
    return saved ? JSON.parse(saved) : defaultPeriodNames();
  });

  // Reload period names when class changes
  useEffect(() => {
    const saved = localStorage.getItem(`ghs-period-names-${cls}`);
    if (saved) setPeriodNames(JSON.parse(saved));
    else setPeriodNames(defaultPeriodNames());
  }, [cls]);

  // Save period names to localStorage
  useEffect(() => {
    localStorage.setItem(`ghs-period-names-${cls}`, JSON.stringify(periodNames));
  }, [periodNames, cls]);

  const queryKey = ["admin-timetable", cls];
  const { data: rows = [], isLoading } = useQuery<TimetableRow[]>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.from("timetables").select("*").eq("class", cls);
      if (error) throw error; return (data ?? []) as TimetableRow[];
    },
  });

  useEffect(() => {
    const g: Grid = {};
    periods.forEach(p => days.forEach(d => { g[`${p}-${d}`] = emptyCell(); }));
    rows.forEach(r => { g[`${r.period_number}-${r.day}`] = { subject: r.subject, teacher: r.teacher, start_time: r.start_time, end_time: r.end_time, room: r.room }; });
    setGrid(g);
  }, [rows]);

  const updateCell = useCallback((key: string, field: keyof CellData, value: string) => {
    setGrid(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await supabase.from("timetables").delete().eq("class", cls);
    const inserts: Omit<TimetableRow, "id">[] = [];
    periods.forEach(p => days.forEach(d => {
      const cell = grid[`${p}-${d}`];
      if (cell?.subject) {
        inserts.push({ class: cls, day: d, period_number: p, subject: cell.subject, teacher: cell.teacher, start_time: cell.start_time, end_time: cell.end_time, room: cell.room });
      }
    }));
    if (inserts.length) {
      const { error } = await supabase.from("timetables").insert(inserts);
      if (error) { toast.error("Save failed"); setSaving(false); return; }
    }
    toast.success("Timetable saved!");
    qc.invalidateQueries({ queryKey });
    setSaving(false);
  };

  const handleClear = async () => {
    await supabase.from("timetables").delete().eq("class", cls);
    toast.success("Cleared");
    qc.invalidateQueries({ queryKey });
  };

  if (isLoading) return <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-heading font-bold text-foreground">Timetables</h2>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={cls} onValueChange={setCls}>
          <TabsList>{classes.map(c => <TabsTrigger key={c} value={c}>Class {c}</TabsTrigger>)}</TabsList>
        </Tabs>
        <Button onClick={handleSave} disabled={saving} className="gap-1.5">{saving && <Loader2 className="w-4 h-4 animate-spin" />} Save Timetable</Button>
        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="outline" size="sm" className="gap-1.5 text-destructive"><Trash2 className="w-4 h-4" /> Clear All</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Clear timetable?</AlertDialogTitle><AlertDialogDescription>All periods for Class {cls} will be removed.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleClear} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Clear</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5"><Printer className="w-4 h-4" /> Print</Button>
      </div>

      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-secondary/50">
              <th className="border border-border px-3 py-2 text-left font-semibold text-foreground w-24">Period</th>
              {days.map(d => <th key={d} className="border border-border px-3 py-2 text-center font-semibold text-foreground min-w-[140px]">{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {periods.map(p => (
              <tr key={p}>
                <td className="border border-border px-1 py-2 font-medium text-muted-foreground bg-secondary/30">
                  <input
                    type="text"
                    value={periodNames[p] || `Period ${p}`}
                    onChange={e => setPeriodNames(prev => ({ ...prev, [p]: e.target.value }))}
                    className="w-full bg-transparent text-xs font-semibold text-foreground border-none outline-none text-center"
                    placeholder={`Period ${p}`}
                  />
                </td>
                {days.map(d => {
                  const key = `${p}-${d}`;
                  const cell = grid[key] || emptyCell();
                  const isEditing = editingCell === key;
                  return (
                    <td key={key} className={`border border-border p-1 cursor-pointer transition-colors ${cell.subject ? getSubjectColor(cell.subject) : "hover:bg-secondary/30"}`}
                      onClick={() => setEditingCell(isEditing ? null : key)}>
                      {isEditing ? (
                        <div className="space-y-1 p-1" onClick={e => e.stopPropagation()}>
                          <Input placeholder="Subject" value={cell.subject} onChange={e => updateCell(key, "subject", e.target.value)} className="h-7 text-xs" />
                          <Input placeholder="Teacher" value={cell.teacher} onChange={e => updateCell(key, "teacher", e.target.value)} className="h-7 text-xs" />
                          <div className="flex gap-1">
                            <Input type="time" value={cell.start_time} onChange={e => updateCell(key, "start_time", e.target.value)} className="h-7 text-xs flex-1" />
                            <Input type="time" value={cell.end_time} onChange={e => updateCell(key, "end_time", e.target.value)} className="h-7 text-xs flex-1" />
                          </div>
                          <Input placeholder="Room" value={cell.room} onChange={e => updateCell(key, "room", e.target.value)} className="h-7 text-xs" />
                          <Button size="sm" variant="ghost" className="h-6 text-xs w-full" onClick={() => setEditingCell(null)}>Done</Button>
                        </div>
                      ) : (
                        <div className="p-1 min-h-[48px]">
                          {cell.subject ? (
                            <>
                              <p className="font-semibold text-xs text-foreground">{cell.subject}</p>
                              {cell.teacher && <p className="text-[10px] text-muted-foreground">{cell.teacher}</p>}
                              {cell.start_time && <p className="text-[10px] text-muted-foreground">{cell.start_time}–{cell.end_time}</p>}
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
      </CardContent></Card>
    </div>
  );
};

export default AdminTimetables;
