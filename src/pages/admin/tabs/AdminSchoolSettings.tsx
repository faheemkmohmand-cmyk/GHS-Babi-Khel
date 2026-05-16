import { useState, useEffect, useCallback, useRef } from "react";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { supabase } from "@/lib/supabase";
import { uploadToCloudinary, type UploadProgress } from "@/lib/cloudinary";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, Loader2, ImageIcon, CheckCircle, AlertTriangle, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { useDropzone } from "react-dropzone";

const ImageUploader = ({
  label, currentUrl, folder, onUploaded,
}: {
  label: string;
  currentUrl: string | null;
  folder: string;
  onUploaded: (url: string) => void;
}) => {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const lastFileRef = useRef<File | null>(null);

  useEffect(() => { setPreview(currentUrl); }, [currentUrl]);

  const doUpload = useCallback(async (file: File) => {
    setUploading(true);
    setUploadError(null);
    setUploadProgress(null);
    try {
      const url = await uploadToCloudinary(file, folder, (p) => setUploadProgress(p));
      onUploaded(url);
      setPreview(url);
      lastFileRef.current = null;
      toast.success(`${label} uploaded successfully!`);
    } catch (err: any) {
      setUploadError(err?.message || "Upload failed.");
      setPreview(currentUrl);
      toast.error(`${label} upload failed.`, { duration: 4000 });
    }
    setUploading(false);
    setUploadProgress(null);
  }, [folder, label, onUploaded, currentUrl]);

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("File too large. Max 10MB."); return; }
    if (!["image/png","image/jpeg","image/webp","image/gif"].includes(file.type)) {
      toast.error("Invalid type. Use PNG, JPG, WEBP."); return;
    }
    setUploadError(null);
    lastFileRef.current = file;
    setPreview(URL.createObjectURL(file));
    await doUpload(file);
  }, [doUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { "image/*": [".png",".jpg",".jpeg",".webp",".gif"] },
    maxFiles: 1, disabled: uploading,
  });

  return (
    <div className="space-y-2">
      <Label className="font-semibold">{label}</Label>
      {preview && (
        <div className="relative">
          <img src={preview} alt={label}
            className="w-full max-h-40 object-cover rounded-lg border border-border"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          {uploading && (
            <div className="absolute inset-0 bg-black/40 rounded-lg flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 text-white animate-spin" />
              {uploadProgress ? (
                <div className="w-3/4">
                  <div className="bg-white/20 rounded-full h-2 overflow-hidden">
                    <div className="bg-white h-full rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress.percent}%` }} />
                  </div>
                  <p className="text-white text-xs mt-1 text-center">
                    {uploadProgress.percent}% • {(uploadProgress.loaded/1024).toFixed(0)}/{(uploadProgress.total/1024).toFixed(0)} KB
                  </p>
                </div>
              ) : <p className="text-white text-xs">Compressing & uploading...</p>}
            </div>
          )}
        </div>
      )}
      {uploadError && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground whitespace-pre-line break-words">{uploadError}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => lastFileRef.current && doUpload(lastFileRef.current)}
            disabled={uploading} className="gap-1.5 text-xs">
            <RefreshCw className="w-3 h-3" /> Retry Upload
          </Button>
        </div>
      )}
      <div {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all duration-200 ${
          uploading ? "opacity-50 cursor-not-allowed border-border"
          : isDragActive ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/60 hover:bg-secondary/30"}`}>
        <input {...getInputProps()} />
        {uploading ? (
          <div className="flex flex-col items-center gap-1 text-primary">
            <Loader2 className="w-5 h-5 animate-spin" />
            <p className="text-xs">{uploadProgress ? `Uploading ${uploadProgress.percent}%...` : "Compressing..."}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <ImageIcon className="w-6 h-6" />
            <p className="text-xs font-medium">{isDragActive ? "Drop here" : "Click or drag to upload"}</p>
            <p className="text-[10px]">PNG, JPG, WEBP — auto-compressed</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main ──────────────────────────────────────────────────────────────────
const AdminSchoolSettings = () => {
  const { data: settings, isLoading } = useSchoolSettings();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [form, setForm] = useState({
    school_name: "", tagline: "", description: "", emis_code: "",
    address: "", phone: "", email: "",
    established_year: 2018, total_students: 0, total_teachers: 0, pass_percentage: 0,
    logo_url: null as string | null,
    banner_url: null as string | null,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        school_name: settings.school_name || "",
        tagline: settings.tagline || "",
        description: settings.description || "",
        emis_code: settings.emis_code || "",
        address: settings.address || "",
        phone: settings.phone || "",
        email: settings.email || "",
        established_year: settings.established_year || 2018,
        total_students: settings.total_students || 0,
        total_teachers: settings.total_teachers || 0,
        pass_percentage: settings.pass_percentage || 0,
        logo_url: settings.logo_url || null,
        banner_url: settings.banner_url || null,
      });
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);

    try {
      // Check session first — refresh if expired
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { error: refreshErr } = await supabase.auth.refreshSession();
        if (refreshErr) {
          const msg = "Session expired. Please Sign Out and Sign In again, then retry.";
          setSaveError(msg);
          toast.error(msg, { duration: 8000 });
          setSaving(false);
          return;
        }
      }

      const { error } = await Promise.race([
        supabase.from("school_settings").upsert({ ...form, id: 1 }, { onConflict: "id" }),
        new Promise<{ error: Error }>((_, reject) =>
          setTimeout(() => reject(new Error("Timed out after 15s. Check internet.")), 15000)
        ),
      ]) as { error: any };

      if (error) {
        // Show the FULL error — code, message, hint — so we know exactly what Supabase says
        const full = [
          `Message: ${error.message}`,
          error.code    ? `Code: ${error.code}`       : null,
          error.details ? `Details: ${error.details}` : null,
          error.hint    ? `Hint: ${error.hint}`        : null,
        ].filter(Boolean).join("\n");
        setSaveError(full);
        toast.error(`Save failed: ${error.message}`, { duration: 8000 });
      } else {
        setSaved(true);
        setSaveError(null);
        toast.success("Settings saved!");
        queryClient.removeQueries({ queryKey: ["school-settings"] });
        await queryClient.refetchQueries({ queryKey: ["school-settings"] });
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (err: any) {
      setSaveError(err?.message || "Unknown error.");
      toast.error(err?.message || "Save failed.", { duration: 8000 });
    }

    setSaving(false);
  };

  const set = (k: string, v: string | number | null) => setForm(p => ({ ...p, [k]: v }));

  if (isLoading) return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <h2 className="text-2xl font-heading font-bold text-foreground">School Settings</h2>

      {/* ── Full error display — tells us exactly what Supabase returns ── */}
      {saveError && (
        <div className="bg-destructive/10 border border-destructive/40 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-destructive mb-1">Save Failed — Exact Error:</p>
            <p className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">{saveError}</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Basic Information</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>School Name</Label>
              <Input value={form.school_name} onChange={e => set("school_name", e.target.value)} /></div>
            <div><Label>Tagline</Label>
              <Input value={form.tagline} onChange={e => set("tagline", e.target.value)} /></div>
          </div>
          <div><Label>Description</Label>
            <Textarea rows={3} value={form.description} onChange={e => set("description", e.target.value)} /></div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>EMIS Code</Label>
              <Input value={form.emis_code} onChange={e => set("emis_code", e.target.value)} /></div>
            <div><Label>Established Year</Label>
              <Input type="number" value={form.established_year} onChange={e => set("established_year", +e.target.value)} /></div>
          </div>
          <div><Label>Address</Label>
            <Input value={form.address} onChange={e => set("address", e.target.value)} /></div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>Phone</Label>
              <Input value={form.phone} onChange={e => set("phone", e.target.value)} /></div>
            <div><Label>Email</Label>
              <Input value={form.email} onChange={e => set("email", e.target.value)} /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Statistics</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-4">
          <div><Label>Total Students</Label>
            <Input type="number" value={form.total_students} onChange={e => set("total_students", +e.target.value)} /></div>
          <div><Label>Total Teachers</Label>
            <Input type="number" value={form.total_teachers} onChange={e => set("total_teachers", +e.target.value)} /></div>
          <div><Label>Pass Percentage</Label>
            <Input type="number" value={form.pass_percentage} onChange={e => set("pass_percentage", +e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Branding</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-6">
          <ImageUploader label="School Logo" currentUrl={form.logo_url} folder="branding"
            onUploaded={url => set("logo_url", url)} />
          <ImageUploader label="Hero Banner" currentUrl={form.banner_url} folder="branding"
            onUploaded={url => set("banner_url", url)} />
        </CardContent>
      </Card>

      <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          Upload logo/banner first, then click <strong>"Save All Changes"</strong>.
        </p>
      </div>

      <Button onClick={handleSave} disabled={saving} className="gap-2 min-w-[160px]">
        {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</>
        : saved  ? <><CheckCircle className="w-4 h-4" />Saved!</>
        : <><Save className="w-4 h-4" />Save All Changes</>}
      </Button>
    </div>
  );
};

export default AdminSchoolSettings;
