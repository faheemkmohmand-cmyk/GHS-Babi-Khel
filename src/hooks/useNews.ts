import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface NewsItem {
  id: string;
  title: string;
  content: string | null;
  image_url: string | null;
  is_published: boolean;
  is_pinned: boolean;
  created_at: string;
}

/**
 * Public news query. Both `useNews(limit)` (homepage, /news) and the admin
 * panels share the `["news", …]` query-key namespace so admin mutations can
 * invalidate the public cache in one shot.
 *
 * Ordering: pinned items first (DESC), then newest first (DESC on created_at).
 * staleTime is intentionally short (15s) — long enough to dedupe concurrent
 * callers, short enough that a freshly-published article shows up on the
 * homepage almost immediately even without manual invalidation.
 */
export function useNews(limit?: number) {
  return useQuery<NewsItem[]>({
    queryKey: ["news", limit ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("news")
        .select("id, title, content, image_url, is_published, is_pinned, created_at")
        .eq("is_published", true)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 15 * 1000,
    gcTime: 5 * 60 * 1000,
    placeholderData: [],
    refetchOnWindowFocus: true,
  });
}

export function useNewsItem(id: string | undefined) {
  return useQuery<NewsItem | null>({
    queryKey: ["news-item", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("news")
        .select("id, title, content, image_url, is_published, is_pinned, created_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as NewsItem | null) ?? null;
    },
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}
