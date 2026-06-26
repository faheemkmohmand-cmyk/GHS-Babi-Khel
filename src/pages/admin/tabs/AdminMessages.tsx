import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Mail, Trash2, CheckCheck, ExternalLink, Search, MailOpen,
} from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";

interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  user_id: string | null;
  is_read: boolean;
  created_at: string;
}

const AdminMessages = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [active, setActive] = useState<ContactMessage | null>(null);

  const { data: messages = [], isLoading } = useQuery<ContactMessage[]>({
    queryKey: ["contact_messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_messages")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContactMessage[];
    },
  });

  const markReadMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("contact_messages")
        .update({ is_read: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contact_messages"] }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contact_messages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact_messages"] });
      setActive(null);
      toast.success("Message deleted");
    },
    onError: (e: any) => toast.error(e.message || "Failed to delete"),
  });

  const markAllReadMut = useMutation({
    mutationFn: async () => {
      const unreadIds = messages.filter((m) => !m.is_read).map((m) => m.id);
      if (unreadIds.length === 0) return;
      const { error } = await supabase
        .from("contact_messages")
        .update({ is_read: true })
        .in("id", unreadIds);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact_messages"] });
      toast.success("All marked as read");
    },
  });

  const openMessage = (m: ContactMessage) => {
    setActive(m);
    if (!m.is_read) markReadMut.mutate(m.id);
  };

  const filtered = messages.filter((m) => {
    if (filter === "unread" && m.is_read) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      (m.subject ?? "").toLowerCase().includes(q) ||
      m.message.toLowerCase().includes(q)
    );
  });

  const unreadCount = messages.filter((m) => !m.is_read).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" /> Contact Messages
            {unreadCount > 0 && (
              <Badge className="bg-destructive text-destructive-foreground">{unreadCount} new</Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Messages submitted through the website's Contact page.
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAllReadMut.mutate()}>
            <CheckCheck className="w-4 h-4 mr-1.5" /> Mark all read
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, message…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-1.5">
          {(["all", "unread"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? "All" : "Unread"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* List */}
        <div className="lg:col-span-2 space-y-2">
          {isLoading ? (
            [...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
          ) : filtered.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <Mail className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No messages found.</p>
            </CardContent></Card>
          ) : (
            filtered.map((m) => (
              <button
                key={m.id}
                onClick={() => openMessage(m)}
                className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
                  active?.id === m.id ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/50"
                } ${!m.is_read ? "bg-primary/5" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm truncate ${!m.is_read ? "font-bold text-foreground" : "font-medium text-foreground/90"}`}>
                    {m.name}
                  </span>
                  {!m.is_read && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{m.subject || "(No subject)"}</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  {format(new Date(m.created_at), "MMM d, yyyy • h:mm a")}
                </p>
              </button>
            ))
          )}
        </div>

        {/* Detail */}
        <div className="lg:col-span-3">
          {active ? (
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-heading font-bold text-lg text-foreground">
                      {active.subject || "(No subject)"}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      From <span className="font-medium text-foreground">{active.name}</span> &lt;{active.email}&gt;
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      {format(new Date(active.created_at), "MMMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => deleteMut.mutate(active.id)}
                    disabled={deleteMut.isPending}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>

                <div className="bg-secondary/50 rounded-xl p-4 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {active.message}
                </div>

                <a
                  href={`mailto:${active.email}?subject=${encodeURIComponent("Re: " + (active.subject || "Your message"))}`}
                  className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline"
                >
                  <ExternalLink className="w-4 h-4" /> Reply via email
                </a>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                <MailOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Select a message to read it.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminMessages;
