import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Trash2, Loader2, Users } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";

// ─── UserAvatar (extracted to avoid hook-in-loop) ──────────────────────
function UserAvatar({ imgUrl, fullName }: { imgUrl: string | null; fullName: string }) {
  const [imgError, setImgError] = useState(false);
  return imgUrl && !imgError ? (
    <img src={imgUrl} alt={`${fullName}'s avatar`} className="w-8 h-8 rounded-full object-cover shrink-0" onError={() => setImgError(true)} loading="lazy" decoding="async" />
  ) : (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
      {fullName.charAt(0).toUpperCase()}
    </div>
  );
}

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

// This screen manages ADMINISTRATORS only. Every account added here is an
// admin, and only admin accounts are listed — students and teachers are not
// managed from here (students sign up / are handled elsewhere).
const ADMIN_ROLE = "admin";

const AdminUsers = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState("");

  // Add user modal
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    full_name: "",
    email: "",
    password: "",
    phone: "",
  });
  const [adding, setAdding] = useState(false);

  // ── Fetch administrators only (rejected accounts excluded) ──
  const { data: users = [], isLoading } = useQuery<UserProfile[]>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", ADMIN_ROLE)
        // CRITICAL FIX: Exclude 'rejected' status users from main view!
        // Rejected users should have their auth account deleted via Pending Requests tab.
        // If they still exist (fallback case), hide them here.
        .not("status", "eq", "rejected")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
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

  // ── Add new administrator ────────────────────────────────────────────────
  // IMPORTANT: the account is created with a TEMPORARY, non-persistent
  // Supabase client. Calling supabase.auth.signUp() on the main client
  // signs the browser into the newly created account (replacing the current
  // admin's session) — that was the "I get logged in as the user I just
  // added" bug. The throwaway client never touches the stored session, so
  // the current admin stays logged in. The profile is then promoted with the
  // admin's own (main) client, which is allowed to update profiles.
  const handleAddUser = async () => {
    const fullName = addForm.full_name.trim();
    const email = addForm.email.trim();
    if (!fullName || !email || !addForm.password.trim()) {
      toast.error("Name, email, and password are required");
      return;
    }
    if (addForm.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setAdding(true);
    try {
      const url = import.meta.env.VITE_SUPABASE_URL as string;
      const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const tempClient = createClient(url, anon, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: `ghs-admin-create-${Date.now()}`,
        },
      });

      const { data, error } = await tempClient.auth.signUp({
        email,
        password: addForm.password,
        options: { data: { full_name: fullName } },
      });

      if (error) {
        toast.error(`Failed: ${error.message}`);
        return;
      }
      // Supabase returns a user with no identities (instead of an error)
      // when the email is already registered.
      if (!data.user || (data.user.identities && data.user.identities.length === 0)) {
        toast.error("This email is already registered");
        return;
      }

      // Wait for the profile row (created by the DB trigger), then promote it
      // to an approved admin using the CURRENT admin's session.
      let promoted = false;
      let lastMsg = "";
      for (let attempt = 0; attempt < 6 && !promoted; attempt++) {
        await new Promise(r => setTimeout(r, attempt === 0 ? 700 : 600));
        const { data: rows, error: updateError } = await supabase
          .from("profiles")
          .update({
            full_name: fullName,
            role: ADMIN_ROLE,
            phone: addForm.phone.trim() || null,
            status: "approved",
          })
          .eq("id", data.user.id)
          .select("id");
        if (updateError) lastMsg = updateError.message;
        else if (rows && rows.length > 0) promoted = true;
      }

      if (!promoted) {
        toast.error(
          `Account created, but it could not be made an admin${lastMsg ? `: ${lastMsg}` : ""}. Refresh and check the list.`,
          { duration: 7000 }
        );
      } else {
        toast.success(`✅ Admin "${fullName}" added — you are still logged in as yourself`);
        setAddOpen(false);
        setAddForm({ full_name: "", email: "", password: "", phone: "" });
      }
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err: any) {
      toast.error(err?.message || "Something went wrong");
    } finally {
      setAdding(false);
    }
  };

  // ── Filter admins by search ──────────────────────────────────────────────
  const filtered = users.filter(u => {
    const q = search.trim().toLowerCase();
    return !q ||
      u.full_name?.toLowerCase().includes(q) ||
      u.phone?.includes(search.trim());
  });

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            Manage Admins
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage administrators — add or remove admin accounts
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Admin
        </Button>
      </div>

      {/* Stats */}
      <Card className="max-w-[220px]">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg bg-blue-100 text-blue-800">
            {users.length}
          </div>
          <span className="text-sm font-medium text-muted-foreground">Admins</span>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search name or phone..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
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
            <p className="font-semibold text-foreground">No admins found</p>
            <p className="text-sm text-muted-foreground mt-1">Try a different search or add a new admin</p>
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
                          <UserAvatar imgUrl={u.avatar_url} fullName={u.full_name || "User"} />
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

                      {/* Role — always admin on this screen */}
                      <TableCell>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400">
                          Admin
                        </span>
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
                                <AlertDialogTitle>Remove {u.full_name || "this admin"}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will <strong>permanently delete</strong> {u.full_name || "this admin"}'s account completely. This cannot be undone.
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
        Showing {filtered.length} of {users.length} admins
      </p>

      {/* Add User Modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Admin</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Full Name *</Label>
              <Input
                value={addForm.full_name}
                onChange={e => setAddForm(p => ({ ...p, full_name: e.target.value }))}
                placeholder="Admin full name"
              />
            </div>
            <div>
              <Label>Email *</Label>
              <Input
                type="email"
                value={addForm.email}
                onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))}
                placeholder="admin@gmail.com"
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
            <div>
              <Label>Phone</Label>
              <Input
                value={addForm.phone}
                onChange={e => setAddForm(p => ({ ...p, phone: e.target.value }))}
                placeholder="0300-0000000"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Role: <strong>Administrator</strong> (automatic). You will stay logged in to your own account.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddUser} disabled={adding} className="gap-2">
              {adding && <Loader2 className="w-4 h-4 animate-spin" />}
              {adding ? "Adding..." : "Add Admin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsers;
