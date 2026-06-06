import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Loader2, Upload, FileText, Download, Library } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import type { LibraryFile } from "@/hooks/useLibrary";
import VirtualBookLibrary from "@/pages/dashboard/tabs/VirtualBookLibrary";

const categories = ["Past Papers", "Books", "Notes", "Assignments", "Admission", "Other"];
const classOptions = ["6", "7", "8", "9", "10", "All"];

const AdminLibrary = () => {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("school");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LibraryFile | null>(null);
  const [form, setForm] = useState({ title: "", description: "", category: "Past Papers", class: "All", subject: "" });
  const [file, setFile] = useState<File | null>(null);
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

  const openAdd = () => { setEditing(null); setForm({ title: "", description: "", category: "Past Papers", class: "All", subject: "" }); setFile(null); setModalOpen(true); };
  const openEdit = (f: LibraryFile) => {
    setEditing(f); setForm({ title: f.title, description: f.description || "", category: f.category, class: f.class, subject: f.subject || "" }); setFile(null); setModalOpen(true);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const handleSave = async () => {
    if (!form.title) { toast.error("Title required"); return; }
    if (!editing && !file) { toast.error("Please select a file"); return; }
    setSaving(true);
    setUploadProgress(0);

    let file_url = editing?.file_url || "";
    let file_type = editing?.file_type || null;
    let file_size = editing?.file_size || null;

    if (file) {
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
      <div>
        <h2 className="text-2xl font-heading font-bold text-foreground">Manage Library</h2>
        <p className="text-xs text-muted-foreground mt-0.5">School files & virtual book library</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex w-full overflow-x-auto gap-1 h-auto p-1 justify-start">
          <TabsTrigger value="school" className="gap-1.5 text-xs sm:text-sm shrink-0 px-3 py-2">
            <FileText className="w-3.5 h-3.5" />
            <span>School Files</span>
          </TabsTrigger>
          <TabsTrigger value="virtual" className="gap-1.5 text-xs sm:text-sm shrink-0 px-3 py-2">
            <Library className="w-3.5 h-3.5" />
            <span>Virtual Library</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="school" className="mt-4 space-y-4">
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
                        <FileText className="w-4 h-4 text-primary shrink-0" />
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
                  <Label>{editing ? "Replace File (optional)" : "File *"}</Label>
                  <label className="flex items-center gap-2 mt-1 p-3 border border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                    <Upload className="w-5 h-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{file ? file.name : "Choose PDF or Word file"}</span>
                    <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
                  </label>
                  {file && <p className="text-xs text-muted-foreground mt-1">{formatFileSize(file.size)} · {file.type}</p>}
                </div>
                {saving && uploadProgress > 0 && <Progress value={uploadProgress} className="h-2" />}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving} className="gap-1.5">{saving && <Loader2 className="w-4 h-4 animate-spin" />} {editing ? "Update" : "Upload"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="virtual" className="mt-4">
          <VirtualBookLibrary />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminLibrary;
