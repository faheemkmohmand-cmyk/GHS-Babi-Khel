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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Plus, Pencil, Trash2, Loader2, Upload, Youtube, Video, Play, Eye, EyeOff } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { getYouTubeId, getYouTubeThumbnail, isYouTubeUrl, VIDEO_CATEGORIES } from "@/pages/dashboard/tabs/VideosTab";
import type { VideoItem } from "@/pages/dashboard/tabs/VideosTab";

const classOptions = ["All", "6", "7", "8", "9", "10"];

const emptyForm = {
  title: "",
  description: "",
  category: "Lecture",
  class: "All",
  subject: "",
  is_published: true,
  video_url: "",
  thumbnail_url: "",
};

const AdminVideos = () => {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<VideoItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [uploadMode, setUploadMode] = useState<"youtube" | "upload">("youtube");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [ytPreviewId, setYtPreviewId] = useState<string | null>(null);

  // ── Fetch all videos (admin sees unpublished too) ──────────
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

  // ── Helpers ────────────────────────────────────────────────
  const set = (k: string, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }));

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
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

  // Live YouTube preview while typing URL
  const handleYtUrlChange = (url: string) => {
    set("video_url", url);
    const id = getYouTubeId(url);
    setYtPreviewId(id);
    if (id && !form.thumbnail_url) {
      set("thumbnail_url", getYouTubeThumbnail(id));
    }
  };

  // ── Save (create / update) ─────────────────────────────────
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

    // ── Upload video file to Cloudinary ──
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

    // ── Upload custom thumbnail to Cloudinary ──
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

  // ── Delete ─────────────────────────────────────────────────
  const deleteMut = useMutation({
    mutationFn: async (v: VideoItem) => {
      // Note: Cloudinary video not deleted here — manage via Cloudinary dashboard if needed
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

  // ── Toggle publish ─────────────────────────────────────────
  const togglePublish = useMutation({
    mutationFn: async ({ id, val }: { id: string; val: boolean }) => {
      const { error } = await supabase.from("videos").update({ is_published: val }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-videos"] }),
  });

  // ══════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground">Manage Videos</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            YouTube links, lectures, events, programs, announcements
          </p>
        </div>
        <Button onClick={openAdd} className="gap-1.5">
          <Plus className="w-4 h-4" /> Add Video
        </Button>
      </div>

      {/* SQL reminder */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-3 text-xs text-blue-900 dark:text-blue-300">
        <strong>⚠ First time?</strong> Run this SQL in Supabase SQL Editor to create the videos table:
        <code className="block mt-1 bg-blue-100 dark:bg-blue-950/50 rounded p-1.5 font-mono text-[10px] whitespace-pre-wrap">
{`CREATE TABLE IF NOT EXISTS public.videos (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  description text,
  video_url text NOT NULL,
  thumbnail_url text,
  category text NOT NULL DEFAULT 'Lecture',
  class text DEFAULT 'All',
  subject text,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "videos public read" ON public.videos FOR SELECT USING (is_published = true);
CREATE POLICY "videos admin all" ON public.videos FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', true) ON CONFLICT DO NOTHING;`}
        </code>
      </div>

      {/* Videos list */}
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
                  {/* Thumbnail */}
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

                  {/* Info */}
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

                  {/* Actions */}
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

      {/* ── Add / Edit Modal ── */}
      <Dialog open={modalOpen} onOpenChange={(o) => { if (!saving) setModalOpen(o); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Video" : "Add Video"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            {/* Title */}
            <div>
              <Label>Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Math Lecture - Chapter 5"
              />
            </div>

            {/* Category + Class */}
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

            {/* Subject */}
            <div>
              <Label>Subject (optional)</Label>
              <Input
                value={form.subject}
                onChange={(e) => set("subject", e.target.value)}
                placeholder="e.g. Mathematics, Physics…"
              />
            </div>

            {/* Description */}
            <div>
              <Label>Description (optional)</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Brief description of this video…"
              />
            </div>

            {/* Video source */}
            <div>
              <Label>Video Source</Label>
              <Tabs value={uploadMode} onValueChange={(v) => setUploadMode(v as "youtube" | "upload")} className="mt-2">
                <TabsList className="w-full">
                  <TabsTrigger value="youtube" className="flex-1 gap-1.5">
                    <Youtube className="w-4 h-4 text-red-500" /> YouTube URL
                  </TabsTrigger>
                  <TabsTrigger value="upload" className="flex-1 gap-1.5">
                    <Upload className="w-4 h-4" /> Upload File
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
                      <p className="text-xs text-center text-muted-foreground mt-1">
                        ✅ Valid YouTube URL
                      </p>
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

            {/* Custom thumbnail (optional) */}
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
{/* Publish toggle */}
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

            {/* Upload progress */}
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

export default AdminVideos;
