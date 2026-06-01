import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface Notice {
  id: string;
  title: string;
  content: string | null;
  category: string;
  is_urgent: boolean;
  is_published: boolean;
  created_at: string;
  expires_at: string | null;
}

export function useNotices(limit?: number) {
  return useQuery<Notice[]>({
    queryKey: ["notices", limit],
    queryFn: async () => {
      let query = supabase
        .from("notices")
        .select("id, title, content, category, is_urgent, is_published, created_at, expires_at")
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

export function useNoticeItem(id: string | undefined) {
  return useQuery<Notice | null>({
    queryKey: ["notice-item", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("notices")
        .select("id, title, content, category, is_urgent, is_published, created_at, expires_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as Notice | null) ?? null;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}
