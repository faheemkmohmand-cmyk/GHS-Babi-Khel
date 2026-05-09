import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { uploadToCloudinary } from "@/lib/cloudinary";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Loader2, CalendarIcon, Upload, Image as ImageIcon, Trophy, Bell, Newspaper, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { triggerConfetti } from "@/lib/confetti";
import type { Achievement } from "@/hooks/useAchievements";
import AdminMeritList from "./AdminMeritList";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Notice {
  id: string; title: string; content: string | null; category: string;
  is_urgent: boolean; is_published: boolean; expires_at: string | null; created_at: string;
}
interface NewsItem {
  id: string; title: string; content: string | null; image_url: string | null;
  is_published: boolean; created_at: string;
}

const noticeCategories = ["general", "academic", "events", "urgent"];
const achCategories = ["Academic", "Sports", "Art", "Science", "Other"];
const classOptions = ["6", "7", "8", "9", "10"];
const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 10 }, (_, i) => currentYear - i);
const PAGE_SIZE = 15;

// ═══════════════════════════════════════════════════════════════════════════════
// NOTICES SECTION
// ═══════════════════════════════════════════════════════════════════════════════
const NoticesSection = () => {
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Manage school notices and announcements</p>
        <Button onClick={openAdd} size="sm" className="gap-1.5"><Plus className="w-4 h-4" /> Add Notice</Button>
      </div>

      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Title</TableHead>
            <TableHead className="hidden sm:table-cell">Category</TableHead>
            <TableHead className="hidden md:table-cell">Urgent</TableHead>
            <TableHead>Published</TableHead>
            <TableHead className="hidden lg:table-cell">Expires</TableHead>
            <TableHead className="hidden lg:table-cell">Date</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {notices.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No notices yet</TableCell></TableRow>
            )}
            {notices.map(n => (
              <TableRow key={n.id} className={!n.is_published ? "opacity-50" : ""}>
                <TableCell className="font-medium max-w-[140px] sm:max-w-[200px] truncate">{n.title}</TableCell>
                <TableCell className="hidden sm:table-cell"><Badge variant="secondary" className="capitalize">{n.category}</Badge></TableCell>
                <TableCell className="hidden md:table-cell">{n.is_urgent && <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/10">Urgent</Badge>}</TableCell>
                <TableCell><Switch checked={n.is_published} onCheckedChange={v => togglePublish.mutate({ id: n.id, val: v })} /></TableCell>
                <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{n.expires_at ? format(new Date(n.expires_at), "dd MMM yyyy") : "—"}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{format(new Date(n.created_at), "dd MMM yyyy")}</TableCell>
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
                <SelectContent>{noticeCategories.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
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

// ═══════════════════════════════════════════════════════════════════════════════
// NEWS SECTION
// ═══════════════════════════════════════════════════════════════════════════════
const NewsSection = () => {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<NewsItem | null>(null);
  const [form, setForm] = useState({ title: "", content: "", image_url: null as string | null, is_published: true });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: news = [], isLoading } = useQuery<NewsItem[]>({
    queryKey: ["admin-news"],
    queryFn: async () => {
      const { data, error } = await supabase.from("news").select("*").order("created_at", { ascending: false });
      if (error) throw error; return data ?? [];
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("news").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["admin-news"] }); },
  });

  const togglePublish = useMutation({
    mutationFn: async ({ id, val }: { id: string; val: boolean }) => {
      const { error } = await supabase.from("news").update({ is_published: val }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-news"] }),
  });

  const openAdd = () => { setEditing(null); setForm({ title: "", content: "", image_url: null, is_published: true }); setImageFile(null); setModalOpen(true); };
  const openEdit = (n: NewsItem) => {
    setEditing(n); setForm({ title: n.title, content: n.content || "", image_url: n.image_url, is_published: n.is_published }); setImageFile(null); setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.title) { toast.error("Title required"); return; }
    setSaving(true);
    try {
      let image_url = form.image_url;
      if (imageFile) image_url = await uploadToCloudinary(imageFile, "branding");
      const payload = { ...form, image_url };
      const { error } = editing
        ? await supabase.from("news").update(payload).eq("id", editing.id)
        : await supabase.from("news").insert(payload);
      if (error) toast.error("Save failed: " + error.message);
      else { toast.success(editing ? "Updated" : "Added"); qc.invalidateQueries({ queryKey: ["admin-news"] }); setModalOpen(false); }
    } catch (err: any) { toast.error(err?.message || "Upload failed. Check Cloudinary env vars."); }
    setSaving(false);
  };

  const set = (k: string, v: string | boolean | null) => setForm(p => ({ ...p, [k]: v }));

  if (isLoading) return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-48" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Manage school news articles</p>
        <Button onClick={openAdd} size="sm" className="gap-1.5"><Plus className="w-4 h-4" /> Add News</Button>
      </div>

      {news.length === 0 && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No news articles yet</CardContent></Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {news.map(n => (
          <Card key={n.id} className={`border-border overflow-hidden ${!n.is_published ? "opacity-60" : ""}`}>
            <div className="aspect-video bg-muted relative">
              {n.image_url
                ? <img src={n.image_url} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-8 h-8 text-muted-foreground/30" /></div>}
              <Badge className={`absolute top-2 right-2 ${n.is_published ? "bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]" : "bg-muted-foreground"}`}>
                {n.is_published ? "Published" : "Draft"}
              </Badge>
            </div>
            <CardContent className="p-4 space-y-2">
              <h3 className="font-heading font-semibold text-foreground truncate">{n.title}</h3>
              <p className="text-xs text-muted-foreground">{format(new Date(n.created_at), "dd MMM yyyy")}</p>
              {n.content && <p className="text-sm text-muted-foreground line-clamp-2">{n.content}</p>}
              <div className="flex items-center gap-2 pt-2">
                <Switch checked={n.is_published} onCheckedChange={v => togglePublish.mutate({ id: n.id, val: v })} />
                <Button size="icon" variant="ghost" onClick={() => openEdit(n)}><Pencil className="w-4 h-4" /></Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="text-destructive"><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Delete this news?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteMut.mutate(n.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit News" : "Add News"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Title *</Label><Input value={form.title} onChange={e => set("title", e.target.value)} /></div>
            <div><Label>Content</Label><Textarea rows={5} value={form.content} onChange={e => set("content", e.target.value)} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.is_published} onCheckedChange={v => set("is_published", v)} /><Label>Published</Label></div>
            <div>
              <Label>Image</Label>
              <div className="flex items-center gap-3 mt-1">
                {(form.image_url || imageFile) && <img src={imageFile ? URL.createObjectURL(imageFile) : form.image_url!} alt="" className="w-16 h-10 rounded object-cover" />}
                <label className="flex items-center gap-1.5 text-sm text-primary cursor-pointer hover:underline">
                  <Upload className="w-4 h-4" /> Choose Image
                  <input type="file" accept="image/*" className="hidden" onChange={e => setImageFile(e.target.files?.[0] || null)} />
                </label>
              </div>
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

// ═══════════════════════════════════════════════════════════════════════════════
// ACHIEVEMENTS SECTION
// ═══════════════════════════════════════════════════════════════════════════════
const AchievementsSection = () => {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Achievement | null>(null);
  const [form, setForm] = useState({ title: "", description: "", student_name: "", class: "", year: currentYear, category: "Academic" });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: achievements = [], isLoading } = useQuery<Achievement[]>({
    queryKey: ["admin-achievements"],
    queryFn: async () => {
      const { data, error } = await supabase.from("achievements").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const openAdd = () => {
    setEditing(null);
    setForm({ title: "", description: "", student_name: "", class: "", year: currentYear, category: "Academic" });
    setImageFile(null); setModalOpen(true);
  };
  const openEdit = (a: Achievement) => {
    setEditing(a);
    setForm({ title: a.title, description: a.description || "", student_name: a.student_name || "", class: a.class || "", year: a.year || currentYear, category: a.category });
    setImageFile(null); setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.title) { toast.error("Title required"); return; }
    setSaving(true);
    try {
      let image_url = editing?.image_url || null;
      if (imageFile) image_url = await uploadToCloudinary(imageFile, "branding");
      const payload = {
        title: form.title, description: form.description || null, student_name: form.student_name || null,
        class: form.class || null, year: form.year, category: form.category, image_url,
      };
      const { error } = editing
        ? await supabase.from("achievements").update(payload).eq("id", editing.id)
        : await supabase.from("achievements").insert(payload);
      if (error) toast.error("Save failed: " + error.message);
      else { toast.success(editing ? "Updated" : "Added"); qc.invalidateQueries({ queryKey: ["admin-achievements"] }); setModalOpen(false); }
    } catch (err: any) { toast.error(err?.message || "Upload failed. Check Cloudinary env vars."); }
    setSaving(false);
  };

  const deleteMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("achievements").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["admin-achievements"] }); },
  });

  if (isLoading) return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Manage student and school achievements</p>
        <Button onClick={openAdd} size="sm" className="gap-1.5"><Plus className="w-4 h-4" /> Add Achievement</Button>
      </div>

      {achievements.length === 0 && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No achievements yet</CardContent></Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {achievements.map(a => (
          <Card key={a.id} className="overflow-hidden border-border hover:shadow-elevated transition-shadow">
            {a.image_url ? (
              <div className="aspect-video bg-muted"><img src={a.image_url} alt="" className="w-full h-full object-cover" loading="lazy" /></div>
            ) : (
              <div className="aspect-video bg-secondary flex items-center justify-center"><Trophy className="w-10 h-10 text-primary/30" /></div>
            )}
            <CardContent className="p-4 space-y-2">
              <h3 className="font-heading font-semibold text-foreground">{a.title}</h3>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary">{a.category}</Badge>
                {a.year && <Badge variant="outline">{a.year}</Badge>}
                {a.class && <Badge variant="outline">Class {a.class}</Badge>}
              </div>
              {a.student_name && <p className="text-sm text-muted-foreground">{a.student_name}</p>}
              <div className="flex gap-1 pt-2">
                <Button size="icon" variant="ghost" onClick={() => openEdit(a)}><Pencil className="w-4 h-4" /></Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="text-destructive"><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Delete achievement?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteMut.mutate(a.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Achievement" : "Add Achievement"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} /></div>
            <div><Label>Description</Label><Textarea rows={3} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div><Label>Student Name</Label><Input value={form.student_name} onChange={e => setForm(p => ({ ...p, student_name: e.target.value }))} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Class</Label>
                <Select value={form.class} onValueChange={v => setForm(p => ({ ...p, class: v }))}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{classOptions.map(c => <SelectItem key={c} value={c}>Class {c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Year</Label>
                <Select value={String(form.year)} onValueChange={v => setForm(p => ({ ...p, year: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{yearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{achCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Image</Label>
              <div className="flex items-center gap-3 mt-1">
                {(imageFile || editing?.image_url) && <img src={imageFile ? URL.createObjectURL(imageFile) : editing!.image_url!} alt="" className="w-16 h-10 rounded object-cover" />}
                <label className="flex items-center gap-1.5 text-sm text-primary cursor-pointer hover:underline">
                  <Upload className="w-4 h-4" /> Choose Image
                  <input type="file" accept="image/*" className="hidden" onChange={e => setImageFile(e.target.files?.[0] || null)} />
                </label>
              </div>
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

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMBINED COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
const AdminAnnouncements = () => {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-heading font-bold text-foreground">Announcements</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Notices, News, Achievements & Merit List — all in one place</p>
      </div>

      <Tabs defaultValue="notices" className="w-full">
        <TabsList className="w-full grid grid-cols-2 sm:grid-cols-4 gap-1 h-auto p-1">
          <TabsTrigger value="notices" className="gap-1.5 text-xs py-2">
            <Bell className="w-3.5 h-3.5 shrink-0" />
            <span>Notices</span>
          </TabsTrigger>
          <TabsTrigger value="news" className="gap-1.5 text-xs py-2">
            <Newspaper className="w-3.5 h-3.5 shrink-0" />
            <span>News</span>
          </TabsTrigger>
          <TabsTrigger value="achievements" className="gap-1.5 text-xs py-2">
            <Trophy className="w-3.5 h-3.5 shrink-0" />
            <span>Achievements</span>
          </TabsTrigger>
          <TabsTrigger value="merit-list" className="gap-1.5 text-xs py-2">
            <TrendingUp className="w-3.5 h-3.5 shrink-0" />
            <span>Merit List</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="notices" className="mt-4">
          <NoticesSection />
        </TabsContent>

        <TabsContent value="news" className="mt-4">
          <NewsSection />
        </TabsContent>

        <TabsContent value="achievements" className="mt-4">
          <AchievementsSection />
        </TabsContent>

        <TabsContent value="merit-list" className="mt-4">
          <AdminMeritList />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminAnnouncements;
