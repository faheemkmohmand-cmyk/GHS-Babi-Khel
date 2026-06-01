import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface NewsItem {
  id: string;
  title: string;
  content: string | null;
  image_url: string | null;
  is_published: boolean;
  created_at: string;
}

export function useNews(limit?: number) {
  return useQuery<NewsItem[]>({
    queryKey: ["news", limit],
    queryFn: async () => {
      let query = supabase
        .from("news")
        .select("id, title, content, image_url, is_published, created_at")
        .eq("is_published", true)
        .order("created_at", { ascending: false });
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: [],
  });
}

export function useNewsItem(id: string | undefined) {
  return useQuery<NewsItem | null>({
    queryKey: ["news-item", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("news")
        .select("id, title, content, image_url, is_published, created_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as NewsItem | null) ?? null;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}
