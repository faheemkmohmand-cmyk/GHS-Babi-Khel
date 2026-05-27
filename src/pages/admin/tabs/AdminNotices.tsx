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
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Loader2, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { triggerConfetti } from "@/lib/confetti";

interface Notice {
  id: string; title: string; content: string | null; category: string;
  is_urgent: boolean; is_published: boolean; expires_at: string | null; created_at: string;
}

const categories = ["general", "academic", "events", "urgent"];
const PAGE_SIZE = 15;

const AdminNotices = () => {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [form, setForm] = useState({ title: "", content: "", category: "general", is_urgent: false, is_published: true, expires_at: null as Date | null });
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery<{ notices: Notice[]; count: number }>({
    queryKey: ["admin-notices", page],
    queryFn: async () => {
      const { data, error, count } = await supabase.from("notices").select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      return { notices: (data ?? []) as Notice[], count: count ?? 0 };
    },
  });
  const notices = data?.notices ?? [];
  const totalPages = Math.ceil((data?.count ?? 0) / PAGE_SIZE);

  const deleteMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("notices").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["admin-notices"] }); },
  });

  const togglePublish = useMutation({
    mutationFn: async ({ id, val }: { id: string; val: boolean }) => {
      const { error } = await supabase.from("notices").update({ is_published: val }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-notices"] }),
  });

  const openAdd = () => { setEditing(null); setForm({ title: "", content: "", category: "general", is_urgent: false, is_published: true, expires_at: null }); setModalOpen(true); };
  const openEdit = (n: Notice) => {
    setEditing(n); setForm({ title: n.title, content: n.content || "", category: n.category, is_urgent: n.is_urgent, is_published: n.is_published, expires_at: n.expires_at ? new Date(n.expires_at) : null }); setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.title) { toast.error("Title required"); return; }
    setSaving(true);
    const payload = {
      title: form.title, content: form.content, category: form.category,
      is_urgent: form.is_urgent, is_published: form.is_published,
      expires_at: form.expires_at ? format(form.expires_at, "yyyy-MM-dd") : null,
    };
    const { error } = editing
      ? await supabase.from("notices").update(payload).eq("id", editing.id)
      : await supabase.from("notices").insert(payload);
    if (error) toast.error("Save failed");
    else { toast.success(editing ? "Updated" : "Notice published! 📋"); if (!editing) triggerConfetti("mini"); qc.invalidateQueries({ queryKey: ["admin-notices"] }); setModalOpen(false); }
    setSaving(false);
  };

  const set = (k: string, v: string | boolean | Date | null) => setForm(p => ({ ...p, [k]: v }));

  if (isLoading) return <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-4" style={{ contain: "layout style" }}>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-heading font-bold text-foreground">Manage Notices</h2>
        <Button onClick={openAdd} className="gap-1.5"><Plus className="w-4 h-4" /> Add Notice</Button>
      </div>

      <Card><CardContent className="p-0 overflow-x-auto" style={{ contain: "layout style" }}>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Title</TableHead><TableHead>Category</TableHead><TableHead>Urgent</TableHead><TableHead>Published</TableHead><TableHead>Expires</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {notices.map(n => (
              <TableRow key={n.id} className={!n.is_published ? "opacity-50" : ""}>
                <TableCell className="font-medium max-w-[200px] truncate">{n.title}</TableCell>
                <TableCell><Badge variant="secondary" className="capitalize">{n.category}</Badge></TableCell>
                <TableCell>{n.is_urgent && <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/10">Urgent</Badge>}</TableCell>
                <TableCell>
                  <Switch checked={n.is_published} onCheckedChange={v => togglePublish.mutate({ id: n.id, val: v })} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{n.expires_at ? format(new Date(n.expires_at), "dd MMM yyyy") : "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{format(new Date(n.created_at), "dd MMM yyyy")}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(n)}><Pencil className="w-4 h-4" /></Button>
                  <AlertDialog><AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="text-destructive"><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                    <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete notice?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteMut.mutate(n.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent></AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Notice" : "Add Notice"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Title *</Label><Input value={form.title} onChange={e => set("title", e.target.value)} /></div>
            <div><Label>Content</Label><Textarea rows={5} value={form.content} onChange={e => set("content", e.target.value)} /></div>
            <div><Label>Category</Label>
              <Select value={form.category} onValueChange={v => set("category", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{categories.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex gap-6">
              <div className="flex items-center gap-2"><Switch checked={form.is_urgent} onCheckedChange={v => set("is_urgent", v)} /><Label>Urgent</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.is_published} onCheckedChange={v => set("is_published", v)} /><Label>Published</Label></div>
            </div>
            <div>
              <Label>Expires At (optional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start gap-2 mt-1">
                    <CalendarIcon className="w-4 h-4" />
                    {form.expires_at ? format(form.expires_at, "dd MMM yyyy") : "No expiry"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={form.expires_at ?? undefined} onSelect={d => set("expires_at", d ?? null)} />
                </PopoverContent>
              </Popover>
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

export default AdminNotices;
      
