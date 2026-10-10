import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as DatePicker } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Loader2, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { triggerConfetti } from "@/lib/confetti";
import { purgePersistedKey } from "@/lib/queryPersist";

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

const typeStyle: Record<string, string> = {
  exam: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800",
  holiday: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800",
  ptm: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-800",
  sports: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-800",
  results: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-800",
  general: "bg-secondary text-muted-foreground border-border",
};

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
      void purgePersistedKey("school-events");
      void purgePersistedKey("school-events-upcoming");
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
      void purgePersistedKey("school-events");
      void purgePersistedKey("school-events-upcoming");
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
      void purgePersistedKey("school-events");
      void purgePersistedKey("school-events-upcoming");
      setModalOpen(false);
    }
    setSaving(false);
  };

  const set = (k: string, v: string | boolean | Date | null) => setForm((p) => ({ ...p, [k]: v }));

  const typeLabel = (val: string) => eventTypes.find((t) => t.value === val)?.label || val;

  if (isLoading) return <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>;

  const TypePill = ({ type }: { type: string }) => (
    <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${typeStyle[type] || typeStyle.general}`}>
      {typeLabel(type)}
    </span>
  );

  const renderActions = (e: SchoolEvent) => (
    <div className="flex items-center gap-0.5 shrink-0">
      <Button size="icon" variant="ghost" className="h-8 w-8 shadow-none text-muted-foreground hover:text-primary" onClick={() => openEdit(e)}><Pencil className="w-3.5 h-3.5" /></Button>
      <AlertDialog>
        <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8 shadow-none text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete event?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 px-3 text-xs shadow-none">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMut.mutate(e.id)} className="h-8 px-3 text-xs shadow-none bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  const DateBadge = ({ d }: { d: string }) => (
    <div className="w-12 shrink-0 rounded-xl border border-border bg-secondary/50 text-center py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground leading-none">{format(new Date(d), "MMM")}</div>
      <div className="text-lg font-heading font-bold text-primary leading-tight">{format(new Date(d), "dd")}</div>
    </div>
  );


  return (
    <div className="space-y-4" style={{ contain: "layout style" }}>
      <div className="flex items-start sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-heading font-bold text-foreground leading-tight">Event Calendar</h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Exams, holidays, PTMs and more appear on the public{" "}
            <a href="/calendar" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">/calendar</a> page.
          </p>
        </div>
        <Button onClick={openAdd} className="h-8 px-3 text-xs font-medium shadow-none gap-1.5 shrink-0"><Plus className="w-3.5 h-3.5" /> Add Event</Button>
      </div>

      {events.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card py-12 text-center text-sm text-muted-foreground">No events yet</div>
      )}

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {events.map((e) => (
          <div key={e.id} className={`rounded-2xl border border-border bg-card p-3.5 shadow-sm ${!e.is_published ? "opacity-70" : ""}`}>
            <div className="flex items-start gap-3">
              <DateBadge d={e.start_date} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm text-foreground leading-snug break-words">{e.title}</p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
                  <TypePill type={e.event_type} />
                  <span className="text-[11px] text-muted-foreground">
                    {format(new Date(e.start_date), "dd MMM yyyy")}
                    {e.end_date && <> → {format(new Date(e.end_date), "dd MMM yyyy")}</>}
                  </span>
                </div>
              </div>
              {renderActions(e)}
            </div>
            {e.description && <p className="text-xs text-muted-foreground mt-2.5 leading-relaxed line-clamp-3">{e.description}</p>}
            <div className="mt-2.5 pt-2.5 border-t border-border/70">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={e.is_published} onCheckedChange={(v) => togglePublish.mutate({ id: e.id, val: v })} /> {e.is_published ? "Published" : "Draft"}
              </label>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      {events.length > 0 && (
        <div className="hidden md:block rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left font-medium px-4 py-2.5">Event</th>
                <th className="text-left font-medium px-3 py-2.5">Type</th>
                <th className="text-left font-medium px-3 py-2.5">Start</th>
                <th className="text-left font-medium px-3 py-2.5">End</th>
                <th className="text-center font-medium px-3 py-2.5">Published</th>
                <th className="w-20 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className={`border-t border-border/70 hover:bg-secondary/30 transition-colors ${!e.is_published ? "opacity-60" : ""}`}>
                  <td className="px-4 py-2.5 max-w-[360px]">
                    <p className="font-medium text-foreground break-words">{e.title}</p>
                    {e.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{e.description}</p>}
                  </td>
                  <td className="px-3 py-2.5"><TypePill type={e.event_type} /></td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{format(new Date(e.start_date), "dd MMM yyyy")}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{e.end_date ? format(new Date(e.end_date), "dd MMM yyyy") : "—"}</td>
                  <td className="px-3 py-2.5 text-center"><Switch checked={e.is_published} onCheckedChange={(v) => togglePublish.mutate({ id: e.id, val: v })} /></td>
                  <td className="px-3 py-2.5"><div className="flex justify-end">{renderActions(e)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" className="h-8 px-3 text-xs shadow-none" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
          <Button variant="outline" size="sm" className="h-8 px-3 text-xs shadow-none" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto p-5 gap-3">
          <DialogHeader><DialogTitle>{editing ? "Edit Event" : "Add Event"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label className="text-xs">Title *</Label><Input className="h-9 text-sm" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Mid-Term Examinations" /></div>
            <div><Label className="text-xs">Description</Label><Textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Optional details shown on the calendar" /></div>
            <div>
              <Label className="text-xs">Event Type</Label>
              <Select value={form.event_type} onValueChange={(v) => set("event_type", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{eventTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Start Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start gap-2 mt-1 h-9 text-xs font-normal shadow-none">
                      <CalendarIcon className="w-3.5 h-3.5" />
                      {format(form.start_date, "dd MMM yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <DatePicker mode="single" selected={form.start_date} onSelect={(d) => d && set("start_date", d)} />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="text-xs">End Date (optional)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start gap-2 mt-1 h-9 text-xs font-normal shadow-none">
                      <CalendarIcon className="w-3.5 h-3.5" />
                      {form.end_date ? format(form.end_date, "dd MMM yyyy") : "Single day"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <DatePicker mode="single" selected={form.end_date ?? undefined} onSelect={(d) => set("end_date", d ?? null)} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/30 px-3 py-2">
              <Switch checked={form.is_published} onCheckedChange={(v) => set("is_published", v)} />
              <Label className="text-xs">Published (visible on public calendar)</Label>
            </div>
          </div>
          <DialogFooter className="flex-row gap-2 sm:justify-end">
            <Button variant="outline" className="h-8 px-3 text-xs font-medium shadow-none gap-1.5 shrink-0 flex-1 sm:flex-none" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="h-8 px-3 text-xs font-medium shadow-none gap-1.5 shrink-0 flex-1 sm:flex-none px-5">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminEvents;
