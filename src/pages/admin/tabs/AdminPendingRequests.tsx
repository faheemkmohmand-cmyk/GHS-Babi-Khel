import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Clock, Users, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import toast from "react-hot-toast";

interface PendingUser {
  id: string;
  full_name: string | null;
  role: string;
  class: string | null;
  roll_number: string | null;
  phone: string | null;
  status: string;
  created_at: string;
  email?: string | null;
}

const AdminPendingRequests = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"pending" | "rejected" | "all">("pending");

  const { data: users = [], isLoading } = useQuery<PendingUser[]>({
    queryKey: ["admin-pending-users", filter],
    queryFn: async () => {
      let query = supabase
        .from("profiles")
        .select("id, full_name, role, class, roll_number, phone, status, created_at")
        .order("created_at", { ascending: false });

      if (filter !== "all") {
        query = query.eq("status", filter);
      } else {
        query = query.in("status", ["pending", "rejected"]);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const approveUser = useMutation({
    mutationFn: async (userId: string) => {
      // ── Always fetch FRESH user data from DB — never rely on stale cache ──
      const { data: freshUser, error: fetchError } = await supabase
        .from("profiles")
        .select("id, full_name, role, class, roll_number, phone, status")
        .eq("id", userId)
        .single();

      if (fetchError || !freshUser) {
        throw new Error("Could not fetch user data. Please refresh and try again.");
      }

      // Guard: don't re-approve an already-approved user
      if (freshUser.status === "approved") {
        throw new Error("This user is already approved.");
      }

      // ── Approve the profile ───────────────────────────────────────────────
      const { error } = await supabase
        .from("profiles")
        .update({ status: "approved" })
        .eq("id", userId);
      if (error) throw error;

      // ── Auto-add teacher to teachers table ───────────────────────────────
      if (freshUser.role === "teacher") {
        await supabase
          .from("teachers")
          .upsert(
            {
              user_id: userId,
              full_name: freshUser.full_name || "Unknown",
              phone: freshUser.phone || null,
              is_active: true,
            },
            { onConflict: "user_id" }
          );
      }

      // ── Link user_id to existing student record if an exact match exists ──
      // We only LINK — never auto-create — so approved users don't appear
      // as phantom entries in Manage Students with wrong class/roll data.
      if (freshUser.role === "student" && freshUser.full_name) {
        const { data: existingStudents } = await supabase
          .from("students")
          .select("id, full_name, class, roll_number, user_id")
          .ilike("full_name", freshUser.full_name);

        // Only link if we find an exact match by name + class + roll number
        const exactMatch = (existingStudents ?? []).find(
          (s) =>
            s.class === freshUser.class &&
            s.roll_number === freshUser.roll_number
        );

        if (exactMatch && !exactMatch.user_id) {
          await supabase
            .from("students")
            .update({ user_id: userId })
            .eq("id", exactMatch.id);
        }
      }
    },
    onSuccess: () => {
      toast.success("✅ User approved successfully!");
      qc.invalidateQueries({ queryKey: ["admin-pending-users"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-teachers"] });
    },
    onError: (err: any) => toast.error(`Approval failed: ${err.message}`),
  });

  const rejectUser = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ status: "rejected" })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User rejected");
      qc.invalidateQueries({ queryKey: ["admin-pending-users"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err: any) => toast.error(`Rejection failed: ${err.message}`),
  });

  // ── Realtime: auto-refresh when ANY profile status changes ───────────────
  useEffect(() => {
    const channel = supabase
      .channel("pending-requests-watch")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "profiles",
        // Watch ALL profile changes — not just pending — so rejections
        // and approvals also invalidate the cache immediately
      }, () => {
        qc.invalidateQueries({ queryKey: ["admin-pending-users"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const filtered = search
    ? users.filter(
        (u) =>
          u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
          u.role.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  const pendingCount = users.filter((u) => u.status === "pending").length;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            Pending Requests
          </h2>
          {pendingCount > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {pendingCount} user{pendingCount !== 1 ? "s" : ""} waiting for approval
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(["pending", "rejected", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:bg-secondary"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No {filter} requests</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              {filter === "pending"
                ? "No pending signups. New requests appear here automatically when someone signs up."
                : filter === "rejected"
                ? "No rejected users found."
                : "No pending or rejected requests found."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Roll No.</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell>{u.class ? `Class ${u.class}` : "—"}</TableCell>
                    <TableCell>{u.roll_number || "—"}</TableCell>
                    <TableCell className="text-sm">{u.phone || "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={u.status === "pending" ? "secondary" : "destructive"}
                        className="capitalize"
                      >
                        {u.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(u.created_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {u.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => approveUser.mutate(u.id)}
                              disabled={approveUser.isPending}
                              className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => rejectUser.mutate(u.id)}
                              disabled={rejectUser.isPending}
                              className="h-8 gap-1.5"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Reject
                            </Button>
                          </>
                        )}
                        {u.status === "rejected" && (
                          <Button
                            size="sm"
                            onClick={() => approveUser.mutate(u.id)}
                            disabled={approveUser.isPending}
                            className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            Approve
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdminPendingRequests;



      
