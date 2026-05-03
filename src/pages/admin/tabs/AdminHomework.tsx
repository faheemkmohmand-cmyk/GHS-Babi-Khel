// src/pages/admin/tabs/AdminHomework.tsx
// Admin / Teacher: post homework, view completions per class

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import {
  useHomework, useCreateHomework, useUpdateHomework,
  useDeleteHomework, useHomeworkCompletions, type Homework
} from "@/hooks/useNewFeatures";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Loader2, Users, AlertTriangle } from "lucide-react";
import { format, isPast, isToday } from "date-fns";
import toast from "react-hot-toast";

const classes = ["6", "7", "8", "9", "10"];
const SUBJECTS_6_8 = ["English", "Urdu", "Islamiyat", "M.Quran", "Geography", "Pashto", "Maths", "History", "G.Science", "Computer Science"];
const SUBJECTS_9_10 = ["English", "Urdu", "Pak-study", "Chemistry", "Physics", "Computer Science", "Biology", "Islamiyat", "M.Quran", "Mathematics"];
const getSubjects = (cls: string) => ["9", "10"].includes(cls) ? SUBJECTS_9_10 : SUBJECTS_6_8;

function CompletionsList({ homeworkId, dueDate }: { homeworkId: string; dueDate: string }) {
  const { data: completions = [], isLoading } = useHomeworkCompletions(homeworkId);
  if (isLoading) return <Skeleton className="h-20 rounded-xl" />;
  if (!completions.length) return <p className="text-sm text-muted-foreground py-2">No completions yet.</p>;
  return (
    <div className="space-y-1 max-h-48 overflow-y-auto">
      {completions.map((c: any) => {
        const late = isPast(new Date(dueDate)) && new Date(c.completed_at) > new Date(dueDate);
        return (
          <div key={c.id} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${late ? "bg-red-50 dark:bg-red-900/20" : "bg-green-50 dark:bg-green-900/20"}`}>
            <span className="font-medium text-foreground">{c.profiles?.full_name || "Student"}</span>
            <div className="flex items-center gap-2">
              {late && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
              <span className="text-xs text-muted-foreground">{format(new Date(c.completed_at), "dd MMM, HH:mm")}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const EMPTY_FORM = { title: "", description: "", class: "6", subject: "English", due_date: "" };

const AdminHomework = () => {
  const { profile } = useAuth();
  const [clsFilter, setClsFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Homework | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const { data: homeworks = [], isLoading } = useHomework(clsFilter === "all" ? undefined : clsFilter);
  const createHw = useCreateHomework();
  const updateHw = useUpdateHomework();
  const deleteHw = useDeleteHomework();

  const openAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, class: clsFilter === "all" ? "6" : clsFilter });
    setModalOpen(true);
  };

  const openEdit = (hw: Homework) => {
    setEditing(hw);
    setForm({ title: hw.title, description: hw.description || "", class: hw.class, subject: hw.subject, due_date: hw.due_date });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.due_date) { toast.error("Title and due date required"); return; }
    setSaving(true);
    try {
      const payload = {
        title: form.title, description: form.description || null,
        class: form.class, subject: form.subject, due_date: form.due_date,
        teacher_name: profile?.full_name || null,
        posted_by: null,
      };
      if (editing) {
        await updateHw.mutateAsync({ id: editing.id, ...payload });
        toast.success("Homework updated");
      } else {
        await createHw.mutateAsync(payload);
        toast.success("Homework posted");
      }
      setModalOpen(false);
    } catch { toast.error("Failed to save"); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await deleteHw.mutateAsync(id);
    toast.success("Deleted");
  };

  const detailHw = homeworks.find((h) => h.id === detailId);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground">Homework Board</h2>
          <p className="text-sm text-muted-foreground">{homeworks.length} assignments</p>
        </div>
        <Button onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Post Homework</Button>
      </div>

      {/* Class filter */}
      <div className="flex gap-2 flex-wrap">
        {["all", ...classes].map((c) => (
          <button key={c} onClick={() => setClsFilter(c)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${clsFilter === c ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-secondary/80"}`}>
            {c === "all" ? "All Classes" : `Class ${c}`}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : homeworks.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">No homework posted yet.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {homeworks.map((hw) => {
            const overdue = isPast(new Date(hw.due_date)) && !isToday(new Date(hw.due_date));
            return (
              <Card key={hw.id} className={`overflow-hidden border ${overdue ? "border-red-200 dark:border-red-700/40" : "border-border"}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-foreground">{hw.title}</h3>
                        {overdue && <Badge variant="destructive" className="text-[10px]">Overdue</Badge>}
                        {isToday(new Date(hw.due_date)) && <Badge className="text-[10px] bg-blue-500">Due Today</Badge>}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-muted-foreground">
                        <span className="bg-primary/10 text-primary font-medium px-2 py-0.5 rounded">{hw.subject}</span>
                        <span>Class {hw.class}</span>
                        <span>Due: {format(new Date(hw.due_date), "dd MMM yyyy")}</span>
                        {hw.teacher_name && <span>by {hw.teacher_name}</span>}
                      </div>
                      {hw.description && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{hw.description}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => setDetailId(detailId === hw.id ? null : hw.id)}>
                        <Users className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(hw)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Delete homework?</AlertDialogTitle><AlertDialogDescription>This will remove it for all students.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(hw.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  {detailId === hw.id && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className="text-xs font-semibold text-foreground mb-2">Student Completions</p>
                      <CompletionsList homeworkId={hw.id} dueDate={hw.due_date} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Homework" : "Post Homework"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Class</Label>
                <Select value={form.class} onValueChange={(v) => setForm({ ...form, class: v, subject: getSubjects(v)[0] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{classes.map((c) => <SelectItem key={c} value={c}>Class {c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Subject</Label>
                <Select value={form.subject} onValueChange={(v) => setForm({ ...form, subject: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{getSubjects(form.class).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Complete exercises 1-10 from Chapter 5" />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Additional instructions..." rows={3} />
            </div>
            <div className="space-y-1">
              <Label>Due Date *</Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} min={new Date().toISOString().split("T")[0]} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {editing ? "Update" : "Post"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminHomework;
