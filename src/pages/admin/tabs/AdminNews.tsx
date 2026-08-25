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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Loader2, Upload, Image as ImageIcon, Globe, ExternalLink, Clock, WifiOff, RefreshCw } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import toast from "react-hot-toast";
import { useLiveNews, LiveNewsArticle } from "@/hooks/useLiveNews";

interface NewsItem {
  id: string; title: string; content: string | null; image_url: string | null;
  is_published: boolean; created_at: string;
}

// ─── Live news card (admin view) ───────────────────────────────────────────────
function AdminLiveCard({ article }: { article: LiveNewsArticle }) {
  const [imgErr, setImgErr] = useState(false);
  const timeAgo = (() => {
    try { return formatDistanceToNow(new Date(article.pubDate), { addSuffix: true }); }
    catch { return article.pubDate; }
  })();
  return (
    <a
      href={article.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex gap-3 bg-card rounded-xl p-3 border border-border/40 hover:border-primary/30 hover:shadow-md transition-all duration-200"
    >
      <div className="w-20 h-16 shrink-0 rounded-lg overflow-hidden bg-secondary">
        {article.image_url && !imgErr ? (
          <img src={article.image_url} alt="" onError={() => setImgErr(true)} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full bg-primary/10 flex items-center justify-center">
            <Globe className="w-5 h-5 text-primary/40" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1">
          {article.source_icon && <img src={article.source_icon} alt="" className="w-3 h-3 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
          <span className="font-medium truncate">{article.source_name}</span>
          <span className="mx-0.5 text-muted-foreground/40">·</span>
          <Clock className="w-2.5 h-2.5" /><span>{timeAgo}</span>
        </div>
        <h4 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors">{article.title}</h4>
        {article.description && <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{article.description}</p>}
        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-primary mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          Open source <ExternalLink className="w-2.5 h-2.5" />
        </span>
      </div>
    </a>
  );
}

const ADMIN_LIVE_CATS = [
  { label: "🌐 Top Stories", q: "" },
  { label: "🏫 Education", q: "education school students" },
  { label: "🔬 Science", q: "science technology" },
  { label: "🏆 Sports", q: "sports" },
  { label: "💡 Innovation", q: "innovation pakistan" },
];

function AdminLiveNewsPanel() {
  const [activeCat, setActiveCat] = useState(0);
  const { data: articles = [], isLoading, isError, refetch, isFetching } =
    useLiveNews(ADMIN_LIVE_CATS[activeCat].q, "en", 10);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground">Live World News</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time headlines via{" "}
            <a href="https://newsdata.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-semibold">NewsData.io</a>
            {" "}· Cached 15 min
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border rounded-xl text-sm font-medium hover:bg-secondary transition-colors text-muted-foreground disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {ADMIN_LIVE_CATS.map((cat, i) => (
          <button
            key={i}
            onClick={() => setActiveCat(i)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
              activeCat === i
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="w-20 h-16 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2 py-1"><Skeleton className="h-3 w-1/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-12 bg-card rounded-xl border border-border/40">
          <WifiOff className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-semibold mb-1">Could not load live news</p>
          <p className="text-muted-foreground text-sm mb-4">Check connection or try again later.</p>
          <Button onClick={() => refetch()} size="sm">Retry</Button>
        </div>
      ) : articles.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-xl border border-border/40">
          <Globe className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">No articles found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {articles.map((article) => (
            <AdminLiveCard key={article.article_id} article={article} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Admin school news management (unchanged) ──────────────────────────────────
function AdminSchoolNewsPanel() {
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
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["admin-news"] });
      // Also invalidate the public news cache so the homepage / /news reflect the deletion immediately.
      qc.invalidateQueries({ queryKey: ["news"] });
    },
  });

  const togglePublish = useMutation({
    mutationFn: async ({ id, val }: { id: string; val: boolean }) => {
      const { error } = await supabase.from("news").update({ is_published: val }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-news"] });
      qc.invalidateQueries({ queryKey: ["news"] });
    },
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
      else {
        toast.success(editing ? "Updated" : "News published");
        qc.invalidateQueries({ queryKey: ["admin-news"] });
        // Invalidate the public news cache so the homepage / /news page pick up
        // the new article immediately instead of showing stale data.
        qc.invalidateQueries({ queryKey: ["news"] });
        setModalOpen(false);
      }
    } catch (err: any) {
      toast.error(err?.message || "Upload failed. Check Cloudinary env vars.");
    }
    setSaving(false);
  };

  const set = (k: string, v: string | boolean | null) => setForm(p => ({ ...p, [k]: v }));

  if (isLoading) return <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-heading font-bold text-foreground">Manage School News</h2>
        <Button onClick={openAdd} className="gap-1.5"><Plus className="w-4 h-4" /> Add News</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

      {news.length === 0 && (
        <div className="text-center py-12 bg-card rounded-xl border border-border/40">
          <ImageIcon className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">No school news yet. Click "Add News" to create one.</p>
        </div>
      )}

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
}

// ─── Top-level AdminNews with tabs ─────────────────────────────────────────────
const AdminNews = () => (
  <Tabs defaultValue="school" className="w-full">
    <TabsList className="mb-6">
      <TabsTrigger value="school" className="gap-1.5">
        <ImageIcon className="w-4 h-4" /> School News
      </TabsTrigger>
      <TabsTrigger value="live" className="gap-1.5">
        <Globe className="w-4 h-4" /> Live World News
      </TabsTrigger>
    </TabsList>
    <TabsContent value="school"><AdminSchoolNewsPanel /></TabsContent>
    <TabsContent value="live"><AdminLiveNewsPanel /></TabsContent>
  </Tabs>
);

export default AdminNews;
    
