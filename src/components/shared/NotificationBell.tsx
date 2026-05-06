import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { useNotices } from "@/hooks/useNotices";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";

const NotificationBell = () => {
  const { user } = useAuth();
  const { data: notices = [] } = useNotices();
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ── Polling fallback — refresh notifications every 45s and on tab focus.
  // This guarantees users see new notices/news/results/homework even when
  // Supabase Realtime is not enabled on the project's publication.
  useEffect(() => {
    const refreshAll = () => {
      qc.invalidateQueries({ queryKey: ["notices"] });
      qc.invalidateQueries({ queryKey: ["news"] });
      qc.invalidateQueries({ queryKey: ["news-list"] });
      qc.invalidateQueries({ queryKey: ["results"] });
      qc.invalidateQueries({ queryKey: ["home-school-toppers"] });
      qc.invalidateQueries({ queryKey: ["homework"] });
    };
    const interval = window.setInterval(refreshAll, 45_000);
    const onFocus = () => refreshAll();
    const onVisible = () => { if (document.visibilityState === "visible") refreshAll(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [qc]);

  // ── Supabase Realtime — live updates when admin adds notices/news/results ──
  useEffect(() => {
    const channel = supabase
      .channel("live-notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notices" }, () => {
        qc.invalidateQueries({ queryKey: ["notices"] });
        setPulse(true);
        setTimeout(() => setPulse(false), 3000);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "news" }, () => {
        qc.invalidateQueries({ queryKey: ["news"] });
        qc.invalidateQueries({ queryKey: ["news-list"] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "results",
        filter: "is_published=eq.true" }, () => {
        qc.invalidateQueries({ queryKey: ["results"] });
        qc.invalidateQueries({ queryKey: ["home-school-toppers"] });
        setPulse(true);
        setTimeout(() => setPulse(false), 3000);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "homework" }, () => {
        qc.invalidateQueries({ queryKey: ["homework"] });
        setPulse(true);
        setTimeout(() => setPulse(false), 3000);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const storageKey = user ? `last_read_at_${user.id}` : "last_read_at_guest";
  const lastReadAt = localStorage.getItem(storageKey);
  const lastReadDate = lastReadAt ? new Date(lastReadAt) : new Date(0);

  const unreadCount = notices.filter(n => new Date(n.created_at) > lastReadDate).length;
  const latest = notices.slice(0, 5);

  const markAllRead = () => {
    localStorage.setItem(storageKey, new Date().toISOString());
    setOpen(false);
  };

  const handleNotificationClick = (notice: typeof notices[0]) => {
    // Mark as read by updating last_read_at to now
    localStorage.setItem(storageKey, new Date().toISOString());
    setOpen(false);
    // Navigate to notices page
    navigate("/notices");
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg hover:bg-secondary text-muted-foreground relative transition-colors"
      >
        <Bell className={`w-5 h-5 ${pulse ? "animate-bounce text-primary" : ""} transition-colors`} />
        {unreadCount > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full flex items-center justify-center px-1 ${pulse ? "animate-ping" : ""}`}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full flex items-center justify-center px-1">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-xl shadow-elevated z-50 overflow-hidden"
          >
            <div className="p-3 border-b border-border flex items-center justify-between">
              <span className="font-heading font-semibold text-sm text-foreground">Notifications</span>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto">
              {latest.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground text-center">No notifications</p>
              ) : (
                latest.map(n => {
                  const isUnread = new Date(n.created_at) > lastReadDate;
                  return (
                    <div
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={`px-3 py-2.5 border-b border-border last:border-0 cursor-pointer hover:bg-secondary/50 transition-colors ${isUnread ? "bg-primary/5" : ""}`}
                    >
                      <div className="flex items-start gap-2">
                        {isUnread && <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm truncate ${isUnread ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{n.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(n.created_at), "dd MMM yyyy")}</p>
                        </div>
                        {n.is_urgent && <Badge className="bg-destructive/10 text-destructive text-[10px] shrink-0">Urgent</Badge>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBell;
      
