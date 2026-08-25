import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Plus, Trash2, Loader2, Upload, ArrowLeft, Image as ImageIcon, Play } from "lucide-react";
import toast from "react-hot-toast";
import { useDropzone } from "react-dropzone";
import type { GalleryAlbum, GalleryPhoto } from "@/hooks/useGallery";
import { isVideoUrl } from "@/hooks/useGallery";

const AdminGallery = () => {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "" });
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedAlbum, setSelectedAlbum] = useState<GalleryAlbum | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const { data: albums = [], isLoading } = useQuery<GalleryAlbum[]>({
    queryKey: ["admin-albums"],
    queryFn: async () => {
      const { data, error } = await supabase.from("gallery_albums").select("id, title, description, cover_url, created_at").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const { data: photos = [], isLoading: loadingPhotos } = useQuery<GalleryPhoto[]>({
    queryKey: ["admin-photos", selectedAlbum?.id],
    queryFn: async () => {
      if (!selectedAlbum) return [];
      const { data, error } = await supabase.from("gallery_photos").select("id, album_id, photo_url, caption, media_type, created_at").eq("album_id", selectedAlbum.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((p) => ({
        ...p,
        media_type: p.media_type || (isVideoUrl(p.photo_url) ? "video" : "image"),
      })) as GalleryPhoto[];
    },
    enabled: !!selectedAlbum,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const handleCreateAlbum = async () => {
    if (!form.title) { toast.error("Title required"); return; }
    setSaving(true);
    try {
      let cover_url: string | null = null;
      if (coverFile) {
        cover_url = await uploadToCloudinary(coverFile, "gallery");
      }
      const { error } = await supabase.from("gallery_albums").insert({ title: form.title, description: form.description || null, cover_url });
      if (error) toast.error("Failed to create album: " + error.message);
      else { toast.success("Album created!"); qc.invalidateQueries({ queryKey: ["admin-albums"] }); setModalOpen(false); }
    } catch (err: any) {
      toast.error(err?.message || "Upload failed. Check Cloudinary env vars.");
    }
    setSaving(false);
  };

  const deleteAlbum = useMutation({
    mutationFn: async (id: string) => {
      const { data: albumPhotos } = await supabase.from("gallery_photos").select("photo_url").eq("album_id", id);
      // Note: Cloudinary files are not deleted here — manage via Cloudinary dashboard if needed
      await supabase.from("gallery_photos").delete().eq("album_id", id);
      const { error } = await supabase.from("gallery_albums").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Album deleted"); setSelectedAlbum(null); qc.invalidateQueries({ queryKey: ["admin-albums"] }); },
  });

  const onDropFiles = useCallback(async (acceptedFiles: File[]) => {
    if (!selectedAlbum || !acceptedFiles.length) return;
    setUploading(true);
    setUploadProgress(0);
    let uploaded = 0;
    for (const file of acceptedFiles) {
      const isVideo = file.type.startsWith("video/");
      const cloudFolder = isVideo ? "gallery" : "gallery";
      try {
        const url = await uploadToCloudinary(file, cloudFolder);
        const media_type = isVideo ? "video" : "image";
        await supabase.from("gallery_photos").insert({ album_id: selectedAlbum.id, photo_url: url, media_type });
      } catch {
        // skip failed file, continue with others
      }
      uploaded++;
      setUploadProgress(Math.round((uploaded / acceptedFiles.length) * 100));
    }
    toast.success(`${uploaded} files uploaded!`);
    qc.invalidateQueries({ queryKey: ["admin-photos", selectedAlbum.id] });
    setUploading(false);
    setUploadProgress(0);
  }, [selectedAlbum, qc]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onDropFiles,
    accept: { "image/*": [], "video/*": [] },
    multiple: true,
    disabled: uploading,
  });

  const deletePhoto = useMutation({
    mutationFn: async (photo: GalleryPhoto) => {
      // Note: Cloudinary file not deleted here — manage via Cloudinary dashboard if needed
      const { error } = await supabase.from("gallery_photos").delete().eq("id", photo.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("File deleted"); qc.invalidateQueries({ queryKey: ["admin-photos", selectedAlbum?.id] }); },
  });

  // Album detail view
  if (selectedAlbum) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setSelectedAlbum(null)}><ArrowLeft className="w-5 h-5" /></Button>
          <h2 className="text-2xl font-heading font-bold text-foreground">{selectedAlbum.title}</h2>
          <Badge variant="secondary">{photos.length} items</Badge>
        </div>

        {/* Upload zone */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Drag & drop photos/videos here, or click to select</p>
          <p className="text-xs text-muted-foreground mt-1">Images and videos supported</p>
        </div>

        {uploading && (
          <div className="space-y-1">
            <Progress value={uploadProgress} className="h-2" />
            <p className="text-xs text-muted-foreground text-center">{uploadProgress}% uploaded</p>
          </div>
        )}

        {loadingPhotos ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[...Array(8)].map((_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {photos.map(p => {
              const isVideo = p.media_type === "video" || isVideoUrl(p.photo_url);
              return (
                <div key={p.id} className="relative group rounded-xl overflow-hidden aspect-square bg-muted">
                  {isVideo ? (
                    <>
                      <video src={p.photo_url} preload="metadata" className="w-full h-full object-cover" />
                      <div className="absolute top-2 left-2 z-10">
                        <Badge className="bg-foreground/70 text-white text-[10px] gap-1"><Play className="w-3 h-3" />VIDEO</Badge>
                      </div>
                    </>
                  ) : (
                    <img src={p.photo_url} alt={p.caption || ""} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                  )}
                  <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/40 transition-colors flex items-center justify-center">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="destructive" className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Delete this file?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deletePhoto.mutate(p)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Albums list
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-heading font-bold text-foreground">Manage Gallery</h2>
        <Button onClick={() => { setForm({ title: "", description: "" }); setCoverFile(null); setModalOpen(true); }} className="gap-1.5">
          <Plus className="w-4 h-4" /> Create Album
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {albums.map(a => (
            <Card key={a.id} className="overflow-hidden cursor-pointer hover:shadow-elevated transition-shadow border-border" onClick={() => setSelectedAlbum(a)}>
              <div className="aspect-video bg-muted relative">
                {a.cover_url
                  ? <img src={a.cover_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                  : <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-10 h-10 text-muted-foreground/30" /></div>}
              </div>
              <CardContent className="p-4">
                <h3 className="font-heading font-semibold text-foreground">{a.title}</h3>
                {a.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{a.description}</p>}
                <div className="flex items-center justify-between mt-3">
                  <Badge variant="secondary">Album</Badge>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={e => e.stopPropagation()}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Delete album and all photos?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteAlbum.mutate(a.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Album Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create Album</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} /></div>
            <div><Label>Description</Label><Textarea rows={3} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div>
              <Label>Cover Photo</Label>
              <div className="flex items-center gap-3 mt-1">
                {coverFile && <img src={URL.createObjectURL(coverFile)} alt="" className="w-16 h-10 rounded object-cover" />}
                <label className="flex items-center gap-1.5 text-sm text-primary cursor-pointer hover:underline">
                  <Upload className="w-4 h-4" /> Choose Cover
                  <input type="file" accept="image/*" className="hidden" onChange={e => setCoverFile(e.target.files?.[0] || null)} />
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateAlbum} disabled={saving} className="gap-1.5">{saving && <Loader2 className="w-4 h-4 animate-spin" />} Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminGallery;

        
