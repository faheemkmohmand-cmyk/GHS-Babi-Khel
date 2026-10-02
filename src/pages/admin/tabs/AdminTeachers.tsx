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
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Loader2, Upload } from "lucide-react";
import toast from "react-hot-toast";
import type { Teacher } from "@/hooks/useTeachers";

const emptyTeacher = {
  full_name: "", subject: "", qualification: "", experience: "",
  phone: "", email: "", bio: "", photo_url: null as string | null,
  display_order: 0, is_active: true,
};

const AdminTeachers = () => {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [form, setForm] = useState(emptyTeacher);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: teachers = [], isLoading } = useQuery<Teacher[]>({
    queryKey: ["admin-teachers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teachers").select("*").order("display_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("teachers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["admin-teachers"] });
      // ALSO invalidate the public/shared teachers cache so every page that
      // uses useTeachers() (Timetables dropdown, Substitute dialog, homepage,
      // public Teachers page, student dashboard) immediately reflects the
      // deletion instead of showing stale data for up to 5 minutes.
      qc.invalidateQueries({ queryKey: ["teachers"] });
    },
    onError: () => toast.error("Delete failed"),
  });

  const openAdd = () => { setEditing(null); setForm(emptyTeacher); setPhotoFile(null); setModalOpen(true); };
  const openEdit = (t: Teacher) => {
    setEditing(t);
    setForm({
      full_name: t.full_name, subject: t.subject || "", qualification: t.qualification || "",
      experience: t.experience || "", phone: t.phone || "", email: t.email || "",
      bio: t.bio || "", photo_url: t.photo_url, display_order: t.display_order, is_active: t.is_active,
    });
    setPhotoFile(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.full_name || !form.subject) { toast.error("Name and Subject required"); return; }
    setSaving(true);
    try {
      let photo_url = form.photo_url;
      if (photoFile) {
        photo_url = await uploadToCloudinary(photoFile, "teachers");
      }
      const payload = { ...form, photo_url };
      const { error } = editing
        ? await supabase.from("teachers").update(payload).eq("id", editing.id)
        : await supabase.from("teachers").insert(payload);
      if (error) toast.error("Save failed: " + error.message);
      else {
        toast.success(editing ? "Updated" : "Added");
        qc.invalidateQueries({ queryKey: ["admin-teachers"] });
        // ALSO invalidate the public/shared teachers cache (used by
        // useTeachers()) so the Timetables dropdown + Substitute dialog +
        // every other page that lists teachers picks up the new/edited
        // teacher immediately. Without this, those pages show stale data
        // for up to 5 minutes (the staleTime in useTeachers).
        qc.invalidateQueries({ queryKey: ["teachers"] });
        setModalOpen(false);
      }
    } catch (err: any) {
      toast.error(err?.message || "Save failed. Check Cloudinary env vars.");
    }
    setSaving(false);
  };

  const set = (k: string, v: string | number | boolean | null) => setForm((p) => ({ ...p, [k]: v }));

  if (isLoading) return <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-heading font-bold text-foreground">Manage Teachers</h2>
        <Button onClick={openAdd} className="gap-1.5"><Plus className="w-4 h-4" /> Add Teacher</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Photo</TableHead><TableHead>Name</TableHead><TableHead>Subject</TableHead>
                <TableHead>Qualification</TableHead><TableHead>Active</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teachers.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    {t.photo_url ? (
                      <img src={t.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                        {t.full_name.charAt(0)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{t.full_name}</TableCell>
                  <TableCell>{t.subject}</TableCell>
                  <TableCell>{t.qualification}</TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.is_active ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                      {t.is_active ? "Yes" : "No"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(t)}><Pencil className="w-4 h-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="text-destructive"><Trash2 className="w-4 h-4" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {t.full_name}?</AlertDialogTitle>
                          <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMut.mutate(t.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
              {teachers.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No teachers found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Teacher" : "Add Teacher"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div><Label>Full Name *</Label><Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} /></div>
              <div><Label>Subject *</Label><Input value={form.subject} onChange={(e) => set("subject", e.target.value)} /></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><Label>Qualification</Label><Input value={form.qualification} onChange={(e) => set("qualification", e.target.value)} /></div>
              <div><Label>Experience</Label><Input value={form.experience} onChange={(e) => set("experience", e.target.value)} placeholder="e.g. 5 years" /></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
              <div><Label>Email</Label><Input value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
            </div>
            <div><Label>Bio</Label><Textarea rows={2} value={form.bio} onChange={(e) => set("bio", e.target.value)} /></div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><Label>Display Order</Label><Input type="number" value={form.display_order} onChange={(e) => set("display_order", +e.target.value)} /></div>
              <div className="flex items-center gap-2 pt-5">
                <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
                <Label>Active</Label>
              </div>
            </div>
            <div>
              <Label>Photo</Label>
              <div className="flex items-center gap-3 mt-1">
                {(form.photo_url || photoFile) && (
                  <img src={photoFile ? URL.createObjectURL(photoFile) : form.photo_url!} alt="" className="w-12 h-12 rounded-full object-cover" />
                )}
                <label className="flex items-center gap-1.5 text-sm text-primary cursor-pointer hover:underline">
                  <Upload className="w-4 h-4" /> Choose Photo
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} {editing ? "Update" : "Add"} Teacher
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTeachers;


      
