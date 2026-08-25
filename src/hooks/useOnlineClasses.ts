/**
 * useOnlineClasses.ts
 * FIXES:
 *  ✅ Cross-component sync: custom event + storage event so ALL hook instances
 *     (admin, student, teacher) immediately see any create/edit/delete
 *  ✅ Join link: meet_link trimmed and protocol-fixed before save
 *  ✅ Supabase realtime subscription when connected
 *  ✅ No auto-reseeded demo/template classes — empty means empty
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";

export type ClassStatus = "upcoming" | "live" | "completed" | "cancelled";

export interface OnlineClass {
  id: string;
  title: string;
  subject: string;
  class_name: string;
  teacher_name: string;
  teacher_id: string | null;
  meet_link: string;
  scheduled_date: string;
  start_time: string;
  duration_minutes: number;
  description: string | null;
  homework: string | null;
  notes: string | null;
  recording_link: string | null;
  status: ClassStatus;
  created_at: string;
  updated_at: string;
}

export type NewClass = Omit<OnlineClass, "id" | "created_at" | "updated_at" | "status">;

export const SUBJECTS = [
  "Mathematics","Physics","Chemistry","Biology","English","Urdu",
  "Islamiyat","Pakistan Studies","Computer Science","General Science","History","Geography",
];

export const SUBJECT_ICONS: Record<string,string> = {
  "Mathematics":"📐","Physics":"⚛️","Chemistry":"🧪","Biology":"🧬",
  "English":"📖","Urdu":"✍️","Islamiyat":"☪️","Pakistan Studies":"🇵🇰",
  "Computer Science":"💻","General Science":"🔬","History":"📜","Geography":"🌍",
};

export const SUBJECT_COLORS: Record<string,string> = {
  "Mathematics":"from-blue-500 to-indigo-600","Physics":"from-violet-500 to-purple-600",
  "Chemistry":"from-green-500 to-emerald-600","Biology":"from-teal-500 to-cyan-600",
  "English":"from-orange-500 to-blue-700","Urdu":"from-rose-500 to-pink-600",
  "Islamiyat":"from-emerald-600 to-green-700","Pakistan Studies":"from-green-600 to-green-800",
  "Computer Science":"from-sky-500 to-blue-600","General Science":"from-cyan-500 to-teal-600",
  "History":"from-blue-500 to-orange-600","Geography":"from-lime-500 to-green-600",
};

export const CLASS_NAMES = ["Class 6","Class 7","Class 8","Class 9","Class 10"];

export function getClassStatus(cls: Pick<OnlineClass,"scheduled_date"|"start_time"|"duration_minutes"|"status">): ClassStatus {
  if (cls.status === "cancelled") return "cancelled";
  const now   = new Date();
  const start = new Date(`${cls.scheduled_date}T${cls.start_time}:00`);
  const end   = new Date(start.getTime() + cls.duration_minutes * 60000);
  if (now >= start && now < end) return "live";
  if (now >= end)                return "completed";
  return "upcoming";
}

export function getCountdown(cls: Pick<OnlineClass,"scheduled_date"|"start_time">): string {
  const diff = new Date(`${cls.scheduled_date}T${cls.start_time}:00`).getTime() - Date.now();
  if (diff <= 0) return "";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ─── LocalStorage + cross-instance sync ──────────────────────────────────────
const LS_KEY     = "ocean_online_classes";
const SYNC_EVENT = "ocean_classes_changed"; // fires in same tab for all instances

function makeid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function readLS(): OnlineClass[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as OnlineClass[];
      // One-time cleanup: purge any legacy auto-seeded template classes
      // (old demo-1..demo-5 records) that may still be cached in this browser.
      const cleaned = parsed.filter(c => !c.id.startsWith("demo-"));
      if (cleaned.length !== parsed.length) {
        localStorage.setItem(LS_KEY, JSON.stringify(cleaned));
      }
      return cleaned;
    }
  } catch {}
  return [];
}

// Write to localStorage AND broadcast to every hook instance in this tab
function writeLS(classes: OnlineClass[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(classes));
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: classes }));
  } catch {}
}

function sanitiseLink(url: string): string {
  const t = (url || "").trim();
  if (!t) return "";
  if (!t.startsWith("http://") && !t.startsWith("https://")) return "https://" + t;
  return t;
}

// ─── Main Hook ────────────────────────────────────────────────────────────────
export function useOnlineClasses() {
  const [classes,       setClasses]       = useState<OnlineClass[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [usingSupabase, setUsingSupabase] = useState(false);
  const channelRef = useRef<any>(null);

  const loadClasses = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("online_classes")
        .select("*")
        .order("scheduled_date", { ascending: true })
        .order("start_time",     { ascending: true });
      if (error) throw error;
      setClasses(data ?? []);
      setUsingSupabase(true);
    } catch {
      const stored = readLS();
      setClasses(stored);
      setUsingSupabase(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadClasses(); }, [loadClasses]);

  // ── Same-tab sync: admin creates/edits/deletes → student page updates instantly
  useEffect(() => {
    if (usingSupabase) return;
    const onSync = (e: Event) => {
      const detail = (e as CustomEvent).detail as OnlineClass[] | undefined;
      if (detail) setClasses(detail);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY && e.newValue) {
        try { setClasses(JSON.parse(e.newValue)); } catch {}
      }
    };
    window.addEventListener(SYNC_EVENT, onSync);
    window.addEventListener("storage",  onStorage);
    return () => {
      window.removeEventListener(SYNC_EVENT, onSync);
      window.removeEventListener("storage",  onStorage);
    };
  }, [usingSupabase]);

  // ── Supabase realtime
  useEffect(() => {
    if (!usingSupabase) return;
    const ch = supabase
      .channel("online_classes_rt")
      .on("postgres_changes", { event:"*", schema:"public", table:"online_classes" }, () => loadClasses())
      .subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [usingSupabase, loadClasses]);

  // ── CRUD ─────────────────────────────────────────────────────────────────────
  const createClass = useCallback(async (data: NewClass): Promise<boolean> => {
    const s = { ...data, meet_link: sanitiseLink(data.meet_link), recording_link: data.recording_link ? sanitiseLink(data.recording_link) : null, title: data.title.trim(), teacher_name: data.teacher_name.trim() };
    try {
      if (usingSupabase) {
        const { error } = await supabase.from("online_classes").insert({ ...s, status:"upcoming" });
        if (error) throw error;
      } else {
        const current = readLS();
        const created: OnlineClass = { ...s, id: makeid(), status:"upcoming", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        const updated = [...current, created];
        writeLS(updated);
        setClasses(updated);
      }
      toast.success("Class created! 🎉");
      return true;
    } catch (e: any) { toast.error(e.message || "Failed to create class"); return false; }
  }, [usingSupabase]);

  const updateClass = useCallback(async (id: string, data: Partial<OnlineClass>): Promise<boolean> => {
    const patch: Partial<OnlineClass> = { ...data, updated_at: new Date().toISOString() };
    if (data.meet_link      !== undefined) patch.meet_link      = sanitiseLink(data.meet_link);
    if (data.recording_link !== undefined) patch.recording_link = data.recording_link ? sanitiseLink(data.recording_link) : null;
    if (data.title          !== undefined) patch.title          = data.title.trim();
    if (data.teacher_name   !== undefined) patch.teacher_name   = data.teacher_name.trim();
    try {
      if (usingSupabase) {
        const { error } = await supabase.from("online_classes").update(patch).eq("id", id);
        if (error) throw error;
      } else {
        const current = readLS();
        const updated = current.map(c => c.id === id ? { ...c, ...patch } : c);
        writeLS(updated);
        setClasses(updated);
      }
      toast.success("Class updated! ✅");
      return true;
    } catch (e: any) { toast.error(e.message || "Failed to update"); return false; }
  }, [usingSupabase]);

  const deleteClass = useCallback(async (id: string): Promise<boolean> => {
    try {
      if (usingSupabase) {
        const { error } = await supabase.from("online_classes").delete().eq("id", id);
        if (error) throw error;
      } else {
        const current = readLS();
        const updated = current.filter(c => c.id !== id);
        writeLS(updated);
        setClasses(updated);
      }
      toast.success("Class deleted");
      return true;
    } catch (e: any) { toast.error(e.message || "Failed to delete"); return false; }
  }, [usingSupabase]);

  // ── Computed ──────────────────────────────────────────────────────────────────
  const classesWithStatus = classes.map(c => ({ ...c, status: getClassStatus(c) }));
  const today             = new Date().toISOString().slice(0, 10);
  const liveClasses       = classesWithStatus.filter(c => c.status === "live");
  const upcomingClasses   = classesWithStatus.filter(c => c.status === "upcoming");
  const completedClasses  = classesWithStatus.filter(c => c.status === "completed");
  const todayClasses      = classesWithStatus.filter(c => c.scheduled_date === today);
  const completedToday    = completedClasses.filter(c => c.scheduled_date === today);

  return {
    classes: classesWithStatus, liveClasses, upcomingClasses, completedClasses,
    todayClasses, completedToday, loading, usingSupabase,
    createClass, updateClass, deleteClass, refresh: loadClasses,
  };
}
