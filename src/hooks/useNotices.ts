import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface Notice {
  id: string;
  title: string;
  content: string | null;
  category: string;
  is_urgent: boolean;
  is_published: boolean;
  is_pinned: boolean;
  created_at: string;
  expires_at: string | null;
}

/**
 * Public notices query. Pinned items appear first, then by recency.
 *
 * staleTime lowered to 15s (parity with news) so a freshly published notice
 * shows up on the homepage almost immediately after the admin saves it —
 * previously this was 2 minutes which caused "I just published but it isn't
 * showing" confusion.
 */
export function useNotices(limit?: number) {
  return useQuery<Notice[]>({
    queryKey: ["notices", limit],
    queryFn: async () => {
      let query = supabase
        .from("notices")
        .select("id, title, content, category, is_urgent, is_published, is_pinned, created_at, expires_at")
        .eq("is_published", true)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 15 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: [],
    refetchOnWindowFocus: true,
  });
}

export function useNoticeItem(id: string | undefined) {
  return useQuery<Notice | null>({
    queryKey: ["notice-item", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("notices")
        .select("id, title, content, category, is_urgent, is_published, is_pinned, created_at, expires_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as Notice | null) ?? null;
    },
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}
