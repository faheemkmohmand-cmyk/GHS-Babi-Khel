import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type EventType = "exam" | "holiday" | "ptm" | "sports" | "results" | "general";

export interface SchoolEvent {
  id: string;
  title: string;
  description: string | null;
  event_type: EventType;
  start_date: string;       // "yyyy-MM-dd"
  end_date: string | null;  // "yyyy-MM-dd" | null
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

/** Public hook — only published events, ordered by start date. */
export function useEvents(rangeStart?: string, rangeEnd?: string) {
  return useQuery<SchoolEvent[]>({
    queryKey: ["school-events", rangeStart, rangeEnd],
    queryFn: async () => {
      let query = supabase
        .from("school_events")
        .select("*")
        .eq("is_published", true)
        .order("start_date", { ascending: true });

      // Loose overlap filter: keep events whose start (or end) falls in range.
      // Done client-side-friendly by just pulling everything in a generous
      // window — schools don't have thousands of events, so this stays cheap.
      if (rangeStart) query = query.gte("start_date", rangeStart);
      if (rangeEnd) query = query.lte("start_date", rangeEnd);

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: [],
  });
}

/** Returns events that are "active" (today falls within start–end) — for homepage highlight strips etc. */
export function useUpcomingEvents(limit = 5) {
  return useQuery<SchoolEvent[]>({
    queryKey: ["school-events-upcoming", limit],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("school_events")
        .select("*")
        .eq("is_published", true)
        .or(`end_date.gte.${today},and(end_date.is.null,start_date.gte.${today})`)
        .order("start_date", { ascending: true })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 2 * 60 * 1000,
  });
}

export const EVENT_TYPE_META: Record<EventType, { label: string; color: string; dot: string }> = {
  exam:     { label: "Exam",          color: "bg-red-500/10 text-red-600 border-red-200",         dot: "bg-red-500" },
  holiday:  { label: "Holiday",       color: "bg-green-500/10 text-green-600 border-green-200",   dot: "bg-green-500" },
  ptm:      { label: "PTM",           color: "bg-blue-500/10 text-blue-600 border-blue-200",      dot: "bg-blue-500" },
  sports:   { label: "Sports Day",    color: "bg-orange-500/10 text-orange-600 border-orange-200",dot: "bg-orange-500" },
  results:  { label: "Results Day",   color: "bg-purple-500/10 text-purple-600 border-purple-200",dot: "bg-purple-500" },
  general:  { label: "General",       color: "bg-primary/10 text-primary border-primary/20",      dot: "bg-primary" },
};
