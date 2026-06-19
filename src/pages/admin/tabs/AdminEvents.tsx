import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as DatePicker } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Loader2, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { triggerConfetti } from "@/lib/confetti";

interface SchoolEvent {
  id: string; title: string; description: string | null; event_type: string;
  start_date: string; end_date: string | null; is_published: boolean; created_at: string;
}

const eventTypes = [
  { value: "exam",    label: "Exam" },
  { value: "holiday", label: "Holiday" },
  { value: "ptm",     label: "PTM" },
  { value: "sports",  label: "Sports Day" },
  { value: "results", label: "Results Day" },
  { value: "general", label: "General" },
];

const PAGE_SIZE = 15;

const emptyForm = {
  title: "", description: "", event_type: "general",
  start_date: new Date() as Date, end_date: null as Date | null,
  is_published: true,
};

const AdminEvents = () => {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SchoolEvent | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery<{ events: SchoolEvent[]; count: number }>({
    queryKey: ["admin-events", page],
    queryFn: async () => {
      const { data, error, count } = await supabase.from("school_events").select("*", { count: "exact" })
        .order("start_date", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      return { events: (data ?? []) as SchoolEvent[], count: count ?? 0 };
    },
  });
  const events = data?.events ?? [];
  const totalPages = Math.ceil((data?.count ?? 0) / PAGE_SIZE);

  const deleteMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("school_events").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["admin-events"] });
      qc.invalidateQueries({ queryKey: ["school-events"] });
    },
  });

  const togglePublish = useMutation({
    mutationFn: async ({ id, val }: { id: string; val: boolean }) => {
      const { error } = await supabase.from("school_events").update({ is_published: val }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-events"] });
      qc.invalidateQueries({ queryKey: ["school-events"] });
    },
  });

  const openAdd = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (e: SchoolEvent) => {
    setEditing(e);
    setForm({
      title: e.title,
      description: e.description || "",
      event_type: e.event_type,
      start_date: new Date(e.start_date),
      end_date: e.end_date ? new Date(e.end_date) : null,
      is_published: e.is_published,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.title) { toast.error("Title required"); return; }
    setSaving(true);
    const payload = {
      title: form.title,
      description: form.description || null,
      event_type: form.event_type,
      start_date: format(form.start_date, "yyyy-MM-dd"),
      end_date: form.end_date ? format(form.end_date, "yyyy-MM-dd") : null,
      is_published: form.is_published,
    };
    const { error } = editing
      ? await supabase.from("school_events").update(payload).eq("id", editing.id)
      : await supabase.from("school_events").insert(payload);
    if (error) {
      toast.error("Save failed");
    } else {
      toast.success(editing ? "Event updated" : "Event added to calendar! 📅");
      if (!editing) triggerConfetti("mini");
      qc.invalidateQueries({ queryKey: ["admin-events"] });
      qc.invalidateQueries({ queryKey: ["school-events"] });
      setModalOpen(false);
    }
    setSaving(false);
  };

  const set = (k: string, v: string | boolean | Date | null) => setForm((p) => ({ ...p, [k]: v }));

  const typeLabel = (val: string) => eventTypes.find((t) => t.value === val)?.label || val;

  if (isLoading) return <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-4" style={{ contain: "layout style" }}>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-heading font-bold text-foreground">Event Calendar</h2>
        <Button onClick={openAdd} className="gap-1.5"><Plus className="w-4 h-4" /> Add Event</Button>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        Exams, holidays, PTMs, sports day, results day — anything you add here shows up automatically on the public{" "}
        <a href="/calendar" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          /calendar
        </a>{" "}
        page.
      </p>

      <Card><CardContent className="p-0 overflow-x-auto" style={{ contain: "layout style" }}>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Title</TableHead><TableHead>Type</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead><TableHead>Published</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {events.map((e) => (
              <TableRow key={e.id} className={!e.is_published ? "opacity-50" : ""}>
                <TableCell className="font-medium max-w-[220px] truncate">{e.title}</TableCell>
                <TableCell><Badge variant="secondary" className="capitalize">{typeLabel(e.event_type)}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{format(new Date(e.start_date), "dd MMM yyyy")}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.end_date ? format(new Date(e.end_date), "dd MMM yyyy") : "—"}</TableCell>
                <TableCell>
                  <Switch checked={e.is_published} onCheckedChange={(v) => togglePublish.mutate({ id: e.id, val: v })} />
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(e)}><Pencil className="w-4 h-4" /></Button>
                  <AlertDialog><AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="text-destructive"><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                    <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete event?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteMut.mutate(e.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent></AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Event" : "Add Event"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Title *</Label><Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Mid-Term Examinations" /></div>
            <div><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Optional details shown on the calendar" /></div>
            <div>
              <Label>Event Type</Label>
              <Select value={form.event_type} onValueChange={(v) => set("event_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{eventTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start gap-2 mt-1">
                      <CalendarIcon className="w-4 h-4" />
                      {format(form.start_date, "dd MMM yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <DatePicker mode="single" selected={form.start_date} onSelect={(d) => d && set("start_date", d)} />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>End Date (optional)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start gap-2 mt-1">
                      <CalendarIcon className="w-4 h-4" />
                      {form.end_date ? format(form.end_date, "dd MMM yyyy") : "Single day"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <DatePicker mode="single" selected={form.end_date ?? undefined} onSelect={(d) => set("end_date", d ?? null)} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={form.is_published} onCheckedChange={(v) => set("is_published", v)} />
              <Label>Published (visible on public calendar)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">{saving && <Loader2 className="w-4 h-4 animate-spin" />} Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminEvents;
