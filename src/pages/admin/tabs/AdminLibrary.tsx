// AdminLibrary.tsx
//
// FIXED (per request): Videos are now MERGED into Library instead of being
// a separate admin section. This page has two sub-tabs — "Files" (the
// original document/PDF library) and "Videos" (moved here from the old
// AdminVideos.tsx "Videos & Gallery" page). Same underlying tables
// (library_files, videos) — this is a presentation-layer merge so admins
// manage both from one place, matching the public Library page which now
// also shows Files + Videos together.
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
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Loader2, Upload, FileText, Download, Video, Youtube, Play, Eye, EyeOff, Image as ImageIcon, Link as LinkIcon, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import type { LibraryFile } from "@/hooks/useLibrary";
import { getYouTubeId, getYouTubeThumbnail, isYouTubeUrl, VIDEO_CATEGORIES } from "@/pages/dashboard/tabs/VideosTab";
import type { VideoItem } from "@/pages/dashboard/tabs/VideosTab";

const categories = ["Past Papers", "Books", "Notes", "Assignments", "Admission", "Other"];
const classOptions = ["6", "7", "8", "9", "10", "All"];

// ═══════════════════════════════════════════════════════════════════════
// Top-level: Files / Videos sub-tabs — one merged "Library" section
// ═══════════════════════════════════════════════════════════════════════
const AdminLibrary = () => {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-heading font-bold text-foreground">Manage Library</h2>
        <p className="text-xs text-muted-foreground mt-0.5">School files & videos — one place for both</p>
      </div>
      <Tabs defaultValue="files" className="w-full">
        <TabsList className="w-full grid grid-cols-2 sm:inline-flex sm:w-auto">
          <TabsTrigger value="files" className="gap-1.5 text-xs sm:text-sm">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-primary/10 shrink-0">
              <FileText className="w-3 h-3 text-primary" />
            </span>
            <span>Files</span>
          </TabsTrigger>
          <TabsTrigger value="videos" className="gap-1.5 text-xs sm:text-sm">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-red-100 dark:bg-red-900/40 shrink-0">
              <Video className="w-3 h-3 text-red-500" />
            </span>
            <span>Videos</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="files" className="mt-4">
          <FilesSection />
        </TabsContent>
        <TabsContent value="videos" className="mt-4">
          <VideosSection />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════
// Files sub-tab (unchanged logic from the original AdminLibrary.tsx)
// ═══════════════════════════════════════════════════════════════════════
const FilesSection = () => {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LibraryFile | null>(null);
  const [form, setForm] = useState({ title: "", description: "", category: "Past Papers", class: "All", subject: "" });
  const [file, setFile] = useState<File | null>(null);
  const [sourceMode, setSourceMode] = useState<"upload" | "link">("upload");
  const [linkUrl, setLinkUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [sortBy, setSortBy] = useState("newest");

  const { data: files = [], isLoading } = useQuery<LibraryFile[]>({
    queryKey: ["admin-library"],
    queryFn: async () => {
      const { data, error } = await supabase.from("library_files").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const sorted = [...files].sort((a, b) => {
    if (sortBy === "downloads") return b.download_count - a.download_count;
    if (sortBy === "class") return a.class.localeCompare(b.class);
    if (sortBy === "category") return a.category.localeCompare(b.category);
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const openAdd = () => { setEditing(null); setForm({ title: "", description: "", category: "Past Papers", class: "All", subject: "" }); setFile(null); setSourceMode("upload"); setLinkUrl(""); setModalOpen(true); };
  const openEdit = (f: LibraryFile) => {
    setEditing(f); setForm({ title: f.title, description: f.description || "", category: f.category, class: f.class, subject: f.subject || "" }); setFile(null);
    if (f.file_type === "LINK") { setSourceMode("link"); setLinkUrl(f.file_url); } else { setSourceMode("upload"); setLinkUrl(""); }
    setModalOpen(true);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const handleSave = async () => {
    if (!form.title) { toast.error("Title required"); return; }
    if (sourceMode === "upload" && !editing && !file) { toast.error("Please select a file"); return; }
    if (sourceMode === "link" && !linkUrl.trim()) { toast.error("Please paste a link"); return; }
    if (sourceMode === "link" && !/^https?:\/\//i.test(linkUrl.trim())) { toast.error("Link must start with http:// or https://"); return; }
    setSaving(true);
    setUploadProgress(0);

    let file_url = editing?.file_url || "";
    let file_type = editing?.file_type || null;
    let file_size = editing?.file_size || null;

    if (sourceMode === "link") {
      file_url = linkUrl.trim();
      file_type = "LINK";
      file_size = null;
      setUploadProgress(90);
    } else if (file) {
      setUploadProgress(30);
      try {
        file_url = await uploadToCloudinary(file, "library");
      } catch {
        toast.error("Upload failed");
        setSaving(false);
        return;
      }
      setUploadProgress(80);
      file_type = file.name.split(".").pop()?.toUpperCase() || null;
      file_size = formatFileSize(file.size);
    }

    const payload = { title: form.title, description: form.description || null, category: form.category, class: form.class, subject: form.subject || null, file_url, file_type, file_size };
    setUploadProgress(90);

    const { error } = editing
      ? await supabase.from("library_files").update(payload).eq("id", editing.id)
      : await supabase.from("library_files").insert(payload);

    if (error) toast.error("Save failed");
    else { toast.success(editing ? "Updated" : "File uploaded!"); qc.invalidateQueries({ queryKey: ["admin-library"] }); setModalOpen(false); }
    setSaving(false);
    setUploadProgress(0);
  };

  const deleteMut = useMutation({
    mutationFn: async (f: LibraryFile) => {
      const { error } = await supabase.from("library_files").delete().eq("id", f.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["admin-library"] }); },
  });

  if (isLoading) return <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="downloads">Most Downloaded</SelectItem>
              <SelectItem value="class">By Class</SelectItem>
              <SelectItem value="category">By Category</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={openAdd} className="gap-1.5"><Plus className="w-4 h-4" /> Upload File</Button>
      </div>

      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Class</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Size</TableHead>
            <TableHead className="text-center">Downloads</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No files uploaded yet.</TableCell></TableRow>
            )}
            {sorted.map(f => (
              <TableRow key={f.id} className="hover:bg-secondary/50">
                <TableCell>
                  <div className="flex items-center gap-2">
                    {f.file_type === "LINK" ? <LinkIcon className="w-4 h-4 text-emerald-600 shrink-0" /> : <FileText className="w-4 h-4 text-primary shrink-0" />}
                    <span className="font-medium truncate max-w-[200px]">{f.title}</span>
                  </div>
                </TableCell>
                <TableCell><Badge variant="secondary">{f.category}</Badge></TableCell>
                <TableCell>{f.class === "All" ? "All" : `Class ${f.class}`}</TableCell>
                <TableCell className="text-muted-foreground">{f.subject || "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{f.file_size || "—"}</TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1"><Download className="w-3.5 h-3.5 text-muted-foreground" />{f.download_count}</div>
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(f)}><Pencil className="w-4 h-4" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="text-destructive"><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Delete file?</AlertDialogTitle><AlertDialogDescription>This removes from storage and database.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteMut.mutate(f)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      {/* Upload/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit File" : "Upload File"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} /></div>
            <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Class</Label>
                <Select value={form.class} onValueChange={v => setForm(p => ({ ...p, class: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{classOptions.map(c => <SelectItem key={c} value={c}>{c === "All" ? "All Classes" : `Class ${c}`}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Subject</Label><Input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="e.g. Mathematics" /></div>
            <div>
              <Label>File Source</Label>
              <Tabs value={sourceMode} onValueChange={(v) => setSourceMode(v as "upload" | "link")} className="mt-2">
                <TabsList className="w-full">
                  <TabsTrigger value="upload" className="flex-1 gap-1.5">
                    <span className="flex items-center justify-center w-5 h-5 rounded-md bg-blue-100 dark:bg-blue-900/40 shrink-0">
                      <Upload className="w-3 h-3 text-blue-500" />
                    </span> Upload File
                  </TabsTrigger>
                  <TabsTrigger value="link" className="flex-1 gap-1.5">
                    <span className="flex items-center justify-center w-5 h-5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 shrink-0">
                      <LinkIcon className="w-3 h-3 text-emerald-600" />
                    </span> Paste Link
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {sourceMode === "upload" ? (
                <div className="mt-3">
                  <label className="flex items-center gap-2 p-3 border border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                    <Upload className="w-5 h-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{file ? file.name : "Choose PDF or Word file"}</span>
                    <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
                  </label>
                  {file && <p className="text-xs text-muted-foreground mt-1">{formatFileSize(file.size)} · {file.type}</p>}
                  {editing && editing.file_type !== "LINK" && !file && (
                    <p className="text-xs text-muted-foreground mt-1">Leave empty to keep the current file.</p>
                  )}
                </div>
              ) : (
                <div className="mt-3 space-y-1.5">
                  <Input
                    value={linkUrl}
                    onChange={e => setLinkUrl(e.target.value)}
                    placeholder="https://example.com/book.pdf or a Google Drive/Books link"
                  />
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" /> Opens the external link directly — nothing is uploaded or stored on our servers.
                  </p>
                </div>
              )}
            </div>
            {saving && uploadProgress > 0 && <Progress value={uploadProgress} className="h-2" />}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">{saving && <Loader2 className="w-4 h-4 animate-spin" />} {editing ? "Update" : "Upload"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════
// Videos sub-tab (moved here from the old AdminVideos.tsx — same logic,
// same "videos" table, just relocated so it lives inside Library)
// ═══════════════════════════════════════════════════════════════════════
const emptyVideoForm = {
  title: "",
  description: "",
  category: "Lecture",
  class: "All",
  subject: "",
  is_published: true,
  video_url: "",
  thumbnail_url: "",
};

const VideosSection = () => {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<VideoItem | null>(null);
  const [form, setForm] = useState(emptyVideoForm);
  const [uploadMode, setUploadMode] = useState<"youtube" | "upload">("youtube");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [ytPreviewId, setYtPreviewId] = useState<string | null>(null);

  const { data: videos = [], isLoading } = useQuery<VideoItem[]>({
    queryKey: ["admin-videos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const set = (k: string, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }));

  const openAdd = () => {
    setEditing(null);
    setForm(emptyVideoForm);
    setUploadMode("youtube");
    setVideoFile(null);
    setThumbFile(null);
    setYtPreviewId(null);
    setModalOpen(true);
  };

  const openEdit = (v: VideoItem) => {
    setEditing(v);
    setForm({
      title: v.title,
      description: v.description || "",
      category: v.category,
      class: v.class || "All",
      subject: v.subject || "",
      is_published: v.is_published,
      video_url: v.video_url,
      thumbnail_url: v.thumbnail_url || "",
    });
    setUploadMode(isYouTubeUrl(v.video_url) ? "youtube" : "upload");
    setYtPreviewId(getYouTubeId(v.video_url));
    setVideoFile(null);
    setThumbFile(null);
    setModalOpen(true);
  };

  const handleYtUrlChange = (url: string) => {
    set("video_url", url);
    const id = getYouTubeId(url);
    setYtPreviewId(id);
    if (id && !form.thumbnail_url) {
      set("thumbnail_url", getYouTubeThumbnail(id));
    }
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    if (!editing && uploadMode === "youtube" && !form.video_url) {
      toast.error("YouTube URL is required"); return;
    }
    if (!editing && uploadMode === "upload" && !videoFile) {
      toast.error("Please select a video file"); return;
    }

    setSaving(true);
    setUploadProgress(0);

    let video_url = form.video_url;
    let thumbnail_url = form.thumbnail_url || null;

    if (uploadMode === "upload" && videoFile) {
      setUploadProgress(20);
      try {
        video_url = await uploadToCloudinary(videoFile, "gallery");
      } catch (e: any) {
        toast.error(`Upload failed: ${e.message}`);
        setSaving(false);
        return;
      }
      setUploadProgress(70);
    }

    if (thumbFile) {
      try {
        thumbnail_url = await uploadToCloudinary(thumbFile, "gallery");
      } catch { /* thumbnail optional, skip on fail */ }
      setUploadProgress(90);
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category,
      class: form.class,
      subject: form.subject.trim() || null,
      is_published: form.is_published,
      video_url,
      thumbnail_url,
    };

    const { error } = editing
      ? await supabase.from("videos").update(payload).eq("id", editing.id)
      : await supabase.from("videos").insert(payload);

    if (error) {
      toast.error(`Save failed: ${error.message}`);
    } else {
      toast.success(editing ? "Video updated!" : "Video added!");
      qc.invalidateQueries({ queryKey: ["admin-videos"] });
      qc.invalidateQueries({ queryKey: ["videos"] });
      setModalOpen(false);
    }
    setSaving(false);
    setUploadProgress(0);
  };

  const deleteMut = useMutation({
    mutationFn: async (v: VideoItem) => {
      const { error } = await supabase.from("videos").delete().eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["admin-videos"] });
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
    onError: (e: Error) => toast.error(`Delete failed: ${e.message}`),
  });

  const togglePublish = useMutation({
    mutationFn: async ({ id, val }: { id: string; val: boolean }) => {
      const { error } = await supabase.from("videos").update({ is_published: val }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-videos"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">YouTube links, lectures, events, programs</p>
        <Button onClick={openAdd} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> Add Video
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : videos.length === 0 ? (
        <div className="bg-card rounded-xl p-16 text-center shadow-card">
          <Video className="w-12 h-12 mx-auto mb-3 opacity-30 text-muted-foreground" />
          <p className="font-medium text-foreground">No videos yet</p>
          <p className="text-sm text-muted-foreground mt-1">Click "Add Video" to get started</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {videos.map((v) => {
              const ytId = getYouTubeId(v.video_url);
              const thumb = v.thumbnail_url || (ytId ? getYouTubeThumbnail(ytId) : null);
              return (
                <div key={v.id} className="flex items-center gap-3 p-3">
                  <div className="w-20 h-12 rounded-lg overflow-hidden bg-muted shrink-0 relative">
                    {thumb ? (
                      <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Play className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    {ytId && (
                      <div className="absolute bottom-0.5 right-0.5 bg-red-600 rounded p-0.5">
                        <Youtube className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground truncate">{v.title}</p>
                      {!v.is_published && (
                        <Badge variant="outline" className="text-[10px] shrink-0">Draft</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <Badge variant="secondary" className="text-[10px]">{v.category}</Badge>
                      {v.class && v.class !== "All" && (
                        <span className="text-[10px] text-muted-foreground">Class {v.class}</span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(v.created_at), "dd MMM yyyy")}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => togglePublish.mutate({ id: v.id, val: !v.is_published })}
                      className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
                      title={v.is_published ? "Unpublish" : "Publish"}
                    >
                      {v.is_published
                        ? <Eye className="w-4 h-4 text-primary" />
                        : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => openEdit(v)}
                      className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete video?</AlertDialogTitle>
                          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMut.mutate(v)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Add / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={(o) => { if (!saving) setModalOpen(o); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Video" : "Add Video"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div>
              <Label>Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Math Lecture - Chapter 5"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => set("category", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VIDEO_CATEGORIES.filter((c) => c !== "All").map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Class</Label>
                <Select value={form.class} onValueChange={(v) => set("class", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {classOptions.map((c) => (
                      <SelectItem key={c} value={c}>{c === "All" ? "All Classes" : `Class ${c}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Subject (optional)</Label>
              <Input
                value={form.subject}
                onChange={(e) => set("subject", e.target.value)}
                placeholder="e.g. Mathematics, Physics…"
              />
            </div>

            <div>
              <Label>Description (optional)</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Brief description of this video…"
              />
            </div>

            <div>
              <Label>Video Source</Label>
              <Tabs value={uploadMode} onValueChange={(v) => setUploadMode(v as "youtube" | "upload")} className="mt-2">
                <TabsList className="w-full">
                  <TabsTrigger value="youtube" className="flex-1 gap-1.5">
                    <span className="flex items-center justify-center w-5 h-5 rounded-md bg-red-100 dark:bg-red-900/40 shrink-0">
                      <Youtube className="w-3 h-3 text-red-500" />
                    </span> YouTube URL
                  </TabsTrigger>
                  <TabsTrigger value="upload" className="flex-1 gap-1.5">
                    <span className="flex items-center justify-center w-5 h-5 rounded-md bg-blue-100 dark:bg-blue-900/40 shrink-0">
                      <Upload className="w-3 h-3 text-blue-500" />
                    </span> Upload File
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {uploadMode === "youtube" ? (
                <div className="mt-3 space-y-2">
                  <Input
                    value={form.video_url}
                    onChange={(e) => handleYtUrlChange(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                  {ytPreviewId && (
                    <div className="rounded-lg overflow-hidden aspect-video bg-muted">
                      <img
                        src={getYouTubeThumbnail(ytPreviewId)}
                        alt="YouTube preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm text-primary cursor-pointer hover:underline">
                    <Video className="w-4 h-4" />
                    {videoFile ? videoFile.name : "Choose video file (MP4, WebM, MOV…)"}
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                    />
                  </label>
                  {editing && !videoFile && (
                    <p className="text-xs text-muted-foreground">Current: {editing.video_url}</p>
                  )}
                </div>
              )}
            </div>

            <div>
              <Label>Custom Thumbnail (optional)</Label>
              <div className="mt-1.5 space-y-1.5">
                {(form.thumbnail_url || thumbFile) && (
                  <img
                    src={thumbFile ? URL.createObjectURL(thumbFile) : form.thumbnail_url!}
                    alt="Thumbnail preview"
                    className="w-32 h-20 rounded-lg object-cover border border-border"
                  />
                )}
                <label className="flex items-center gap-2 text-sm text-primary cursor-pointer hover:underline w-fit">
                  <Upload className="w-4 h-4" />
                  {thumbFile ? thumbFile.name : "Choose thumbnail image"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setThumbFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Published</p>
                <p className="text-xs text-muted-foreground">Students can see this video</p>
              </div>
              <Switch
                checked={form.is_published}
                onCheckedChange={(v) => set("is_published", v)}
              />
            </div>

            {saving && uploadProgress > 0 && (
              <div className="space-y-1">
                <Progress value={uploadProgress} className="h-2" />
                <p className="text-xs text-center text-muted-foreground">{uploadProgress}% uploading…</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? "Saving…" : editing ? "Update" : "Add Video"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminLibrary;
