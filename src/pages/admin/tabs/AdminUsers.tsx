import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Trash2, Loader2, Users } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";

interface UserProfile {
  id: string;
  full_name: string | null;
  role: string;
  class: string | null;
  phone: string | null;
  roll_number: string | null;
  avatar_url: string | null;
  created_at: string;
}

// Only these three roles are available when creating/editing users.
// "user" and "parent" were removed per request — they're not used in the
// school's workflow. Existing profiles with those roles are still visible
// in the list (for backwards compatibility) but can't be newly assigned.
const roles = ["admin", "teacher", "student"];

const roleColors: Record<string, string> = {
  admin:   "bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400",
  teacher: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  student: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  // Keep colors for legacy roles so existing users still render nicely:
  parent:  "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  user:    "bg-muted text-muted-foreground",
};

const AdminUsers = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  // Add user modal
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "student",
    phone: "",
  });
  const [adding, setAdding] = useState(false);

  // ── Fetch all users ──────────────────────────────────────────────────────
  const { data: users = [], isLoading } = useQuery<UserProfile[]>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Update role ──────────────────────────────────────────────────────────
  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ role })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: () => toast.error("Update failed"),
  });

  // ── Delete user ──────────────────────────────────────────────────────────
  // Calls the admin_delete_user RPC which deletes from auth.users (cascades
  // to profiles). This frees up the email for re-registration.
  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("admin_delete_user", { target_user_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User permanently deleted — email is now free for re-registration");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-teachers"] });
      qc.invalidateQueries({ queryKey: ["admin-pending-users"] });
    },
    onError: (err: any) => {
      // Surface the actual error message — could be "Permission denied",
      // "Cannot delete your own account", or a missing-function error.
      const msg = err?.message || "Delete failed";
      toast.error(`Delete failed: ${msg}`, { duration: 6000 });
    },
  });

  // ── Add new user ─────────────────────────────────────────────────────────
  const handleAddUser = async () => {
    if (!addForm.full_name.trim() || !addForm.email.trim() || !addForm.password.trim()) {
      toast.error("Name, email, and password are required");
      return;
    }
    if (addForm.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setAdding(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: addForm.email.trim(),
        password: addForm.password,
        options: {
          data: { full_name: addForm.full_name.trim() },
        },
      });

      if (error) {
        toast.error(`Failed: ${error.message}`);
        setAdding(false);
        return;
      }

      if (data.user) {
        // Wait for trigger to create profile row
        await new Promise(r => setTimeout(r, 900));

        // Update profile: role, phone, status=approved (admin-added = auto-approved)
        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            full_name: addForm.full_name.trim(),
            role: addForm.role,
            phone: addForm.phone || null,
            status: "approved",
          })
          .eq("id", data.user.id);

        if (updateError) console.warn("Profile update:", updateError.message);

        // ── Auto-add to TEACHERS table only ────────────────────────────────
        if (addForm.role === "teacher") {
          await supabase
            .from("teachers")
            .upsert({
              user_id: data.user.id,
              full_name: addForm.full_name.trim(),
              phone: addForm.phone || null,
              is_active: true,
            }, { onConflict: "user_id" });
        }

        // ── Auto-create student record with user_id for fee system ───────
        if (addForm.role === "student") {
          // Try to find an existing student record matching the name
          const { data: existingStudents } = await supabase
            .from("students")
            .select("id, user_id")
            .ilike("full_name", addForm.full_name.trim())
            .limit(5);

          const matched = (existingStudents ?? []).find(s => !s.user_id);

          if (matched) {
            // Link existing student record to this auth user
            await supabase
              .from("students")
              .update({ user_id: data.user.id })
              .eq("id", matched.id);
          } else if (!existingStudents?.length) {
            // No existing student record — create one with user_id
            await supabase
              .from("students")
              .insert({
                full_name: addForm.full_name.trim(),
                class: "6",
                roll_number: `AUTO-${Date.now().toString(36).toUpperCase()}`,
                is_active: true,
                user_id: data.user.id,
              });
          }
        }

        toast.success(`✅ User "${addForm.full_name}" added successfully`);
        setAddOpen(false);
        setAddForm({ full_name: "", email: "", password: "", role: "student", phone: "" });
        qc.invalidateQueries({ queryKey: ["admin-users"] });
        qc.invalidateQueries({ queryKey: ["admin-teachers"] });
      }
    } catch (err: any) {
      toast.error(err?.message || "Something went wrong");
    }
    setAdding(false);
  };

  // ── Filter users ─────────────────────────────────────────────────────────
  const filtered = users.filter(u => {
    const matchSearch = !search ||
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.roll_number?.toLowerCase().includes(search.toLowerCase()) ||
      u.phone?.includes(search);
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = {
    total: users.length,
    students: users.filter(u => u.role === "student").length,
    teachers: users.filter(u => u.role === "teacher").length,
    admins: users.filter(u => u.role === "admin").length,
  };

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            User Management
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage all registered users — change roles, add or remove accounts
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Add User
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Users", value: stats.total, color: "bg-primary/10 text-primary" },
          { label: "Students", value: stats.students, color: "bg-green-100 text-green-700" },
          { label: "Teachers", value: stats.teachers, color: "bg-blue-100 text-blue-700" },
          { label: "Admins", value: stats.admins, color: "bg-blue-100 text-blue-800" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg ${s.color}`}>
                {s.value}
              </div>
              <span className="text-sm font-medium text-muted-foreground">{s.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search name, roll no, phone..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Filter role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {roles.map(r => (
              <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-semibold text-foreground">No users found</p>
            <p className="text-sm text-muted-foreground mt-1">Try a different search or add a new user</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(u => {
                  const isSelf = u.id === user?.id;
                  return (
                    <TableRow key={u.id}>
                      {/* Avatar + Name */}
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          {u.avatar_url ? (
                            <img src={u.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                              {(u.full_name || "U").charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-sm text-foreground">
                              {u.full_name || "—"}
                              {isSelf && (
                                <Badge variant="secondary" className="ml-2 text-[10px] py-0">You</Badge>
                              )}
                            </p>
                          </div>
                        </div>
                      </TableCell>

                      {/* Role selector */}
                      <TableCell>
                        {isSelf ? (
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${roleColors[u.role]}`}>
                            {u.role}
                          </span>
                        ) : (
                          <Select
                            value={u.role}
                            onValueChange={v => updateRole.mutate({ id: u.id, role: v })}
                          >
                            <SelectTrigger className="h-8 w-28 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {roles.map(r => (
                                <SelectItem key={r} value={r} className="capitalize text-xs">{r}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>

                      <TableCell className="text-sm text-muted-foreground">{u.phone || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(u.created_at), "dd MMM yyyy")}
                      </TableCell>

                      {/* Delete */}
                      <TableCell className="text-right">
                        {!isSelf && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="icon" variant="ghost"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove {u.full_name || "this user"}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will <strong>permanently delete</strong> {u.full_name || "this user"}'s account completely. They will need to sign up again from scratch. This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteUser.mutate(u.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Remove User
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Count */}
      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {users.length} users
      </p>

      {/* Add User Modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Full Name *</Label>
              <Input
                value={addForm.full_name}
                onChange={e => setAddForm(p => ({ ...p, full_name: e.target.value }))}
                placeholder="Student or teacher name"
              />
            </div>
            <div>
              <Label>Email *</Label>
              <Input
                type="email"
                value={addForm.email}
                onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))}
                placeholder="user@gmail.com"
              />
            </div>
            <div>
              <Label>Password * (min 6 characters)</Label>
              <Input
                type="password"
                value={addForm.password}
                onChange={e => setAddForm(p => ({ ...p, password: e.target.value }))}
                placeholder="••••••••"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Role *</Label>
                <Select value={addForm.role} onValueChange={v => setAddForm(p => ({ ...p, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {roles.map(r => (
                      <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={addForm.phone}
                  onChange={e => setAddForm(p => ({ ...p, phone: e.target.value }))}
                  placeholder="0300-0000000"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddUser} disabled={adding} className="gap-2">
              {adding && <Loader2 className="w-4 h-4 animate-spin" />}
              {adding ? "Adding..." : "Add User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsers;
        
