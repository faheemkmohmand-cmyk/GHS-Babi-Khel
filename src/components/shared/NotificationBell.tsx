import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell, Check, CheckCheck,
  Newspaper, Megaphone, BarChart3, Hash, Wallet, IdCard,
  CalendarDays, BookMarked, Video, MonitorPlay, GraduationCap,
  Trophy, ClipboardList, FileText, UserPlus, Upload, HelpCircle,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { AnimatePresence, m } from "framer-motion";

// ─── Notification type ──────────────────────────────────────────────────────

interface NotificationRow {
  id: string;
  audience: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  actor_id: string | null;
  created_at: string;
}

// ─── Icon + color map per notification type ─────────────────────────────────
// Centralized so every type renders consistently. New types added in the SQL
// migration will fall back to the HelpCircle icon + neutral color.

const TYPE_META: Record<string, { icon: any; color: string; bg: string }> = {
  notice:                { icon: Megaphone,    color: "text-red-500",        bg: "bg-red-500/10"        },
  news:                  { icon: Newspaper,    color: "text-blue-500",       bg: "bg-blue-500/10"       },
  result:                { icon: BarChart3,    color: "text-emerald-500",    bg: "bg-emerald-500/10"    },
  exam_roll:             { icon: Hash,         color: "text-purple-500",     bg: "bg-purple-500/10"     },
  fee:                   { icon: Wallet,       color: "text-amber-500",      bg: "bg-amber-500/10"      },
  id_card:               { icon: IdCard,       color: "text-indigo-500",     bg: "bg-indigo-500/10"     },
  timetable:             { icon: CalendarDays, color: "text-cyan-500",       bg: "bg-cyan-500/10"       },
  event:                 { icon: CalendarDays, color: "text-pink-500",       bg: "bg-pink-500/10"       },
  library:               { icon: BookMarked,   color: "text-orange-500",     bg: "bg-orange-500/10"     },
  video:                 { icon: Video,        color: "text-rose-500",       bg: "bg-rose-500/10"       },
  online_class:          { icon: MonitorPlay,  color: "text-teal-500",       bg: "bg-teal-500/10"       },
  admission_open:        { icon: GraduationCap,color: "text-green-500",      bg: "bg-green-500/10"      },
  achievement:           { icon: Trophy,       color: "text-yellow-500",     bg: "bg-yellow-500/10"     },
  homework:              { icon: ClipboardList,color: "text-sky-500",        bg: "bg-sky-500/10"        },
  admission_application: { icon: UserPlus,     color: "text-violet-500",     bg: "bg-violet-500/10"     },
  admission_doc:         { icon: Upload,       color: "text-fuchsia-500",    bg: "bg-fuchsia-500/10"    },
  default:               { icon: FileText,     color: "text-muted-foreground", bg: "bg-muted"           },
};

const metaFor = (type: string) => TYPE_META[type] ?? TYPE_META.default;

// ─── Component ──────────────────────────────────────────────────────────────

const NotificationBell = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ── Fetch notifications ──────────────────────────────────────────────────
  // RLS on the notifications table ensures the user only sees rows addressed
  // to them (audience = 'all' / 'admin' / 'students' / 'class:X' / 'user:me').
  const { data: notifications = [] } = useQuery<NotificationRow[]>({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("notifications")
        .select("id, audience, type, title, body, link, is_read, actor_id, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) {
        // Most likely the table doesn't exist yet (migration 013 not applied).
        // Fail silently — the bell just shows "No notifications" instead of
        // crashing the whole navbar.
        console.warn("[NotificationBell] fetch error:", error.message);
        return [];
      }
      return (data ?? []) as NotificationRow[];
    },
    enabled: !!user,
    staleTime: 30_000,        // 30s — re-fetch when tab refocuses
    refetchOnWindowFocus: true,
  });

  // ── Realtime: instant update when a new notification is inserted ─────────
  // This is the "Facebook-style" behavior — the bell pulses the moment admin
  // publishes something, no polling required.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("live-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        () => {
          qc.invalidateQueries({ queryKey: ["notifications", user.id] });
          setPulse(true);
          setTimeout(() => setPulse(false), 3000);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications" },
        () => qc.invalidateQueries({ queryKey: ["notifications", user.id] })
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, qc]);

  // ── Mark-all-read mutation ───────────────────────────────────────────────
  const markAllReadMut = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  // ── Mark-one-read mutation ───────────────────────────────────────────────
  const markOneReadMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  );

  const latest = notifications.slice(0, 10);
  const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);

  const handleNotificationClick = (n: NotificationRow) => {
    if (!n.is_read) markOneReadMut.mutate(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const markAllRead = () => {
    markAllReadMut.mutate(unreadIds);
    setOpen(false);
  };

  // ── Close dropdown on outside click ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg hover:bg-secondary text-muted-foreground relative transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
      >
        <Bell className={`w-5 h-5 ${pulse ? "animate-bounce text-primary" : ""} transition-colors`} />
        {unreadCount > 0 && (
          <>
            {/* Ping ring — visible only while pulse is active */}
            {pulse && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-destructive/60 rounded-full animate-ping" />
            )}
            {/* Solid badge — always visible when there are unread items */}
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full flex items-center justify-center px-1">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <m.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 bg-card border border-border rounded-xl shadow-elevated z-50 overflow-hidden"
          >
            {/* ── Header ── */}
            <div className="p-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-heading font-semibold text-sm text-foreground">Notifications</span>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    disabled={markAllReadMut.isPending}
                    className="text-xs text-primary hover:underline flex items-center gap-1 disabled:opacity-50"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="text-muted-foreground hover:text-foreground text-lg leading-none sm:hidden"
                  aria-label="Close"
                >✕</button>
              </div>
            </div>

            {/* ── List ── */}
            <div className="max-h-96 overflow-y-auto">
              {latest.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No notifications yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    You'll see updates here when new content is published.
                  </p>
                </div>
              ) : (
                latest.map((n) => {
                  const meta = metaFor(n.type);
                  const Icon = meta.icon;
                  const isUnread = !n.is_read;
                  return (
                    <div
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={`px-3 py-2.5 border-b border-border last:border-0 cursor-pointer hover:bg-secondary/50 transition-colors flex items-start gap-3 ${
                        isUnread ? "bg-primary/5" : ""
                      }`}
                    >
                      {/* Icon — colored per type */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${meta.bg}`}>
                        <Icon className={`w-4 h-4 ${meta.color}`} />
                      </div>

                      {/* Body */}
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm leading-snug ${isUnread ? "font-semibold text-foreground" : "text-foreground/90"}`}>
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground/70 mt-1">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </p>
                      </div>

                      {/* Unread dot OR read check */}
                      <div className="shrink-0 mt-1">
                        {isUnread ? (
                          <div className="w-2 h-2 rounded-full bg-primary" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-muted-foreground/50" />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* ── Footer ── */}
            {latest.length > 0 && (
              <button
                onClick={() => { setOpen(false); navigate("/dashboard"); }}
                className="w-full p-2.5 text-center text-xs font-medium text-primary hover:bg-primary/5 border-t border-border transition-colors"
              >
                View all in dashboard
              </button>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBell;
