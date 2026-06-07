import { useQuery } from "@tanstack/react-query";

export interface LiveNewsArticle {
  article_id: string;
  title: string;
  description: string | null;
  content: string | null;
  link: string;
  image_url: string | null;
  source_name: string;
  source_icon: string | null;
  pubDate: string;
  category: string[];
  country: string[];
  language: string;
}

interface NewsDataResponse {
  status: string;
  totalResults: number;
  results: LiveNewsArticle[];
  nextPage?: string;
}

const CACHE_KEY = "live_news_cache";
const CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes

interface CacheEntry {
  data: LiveNewsArticle[];
  timestamp: number;
  query: string;
}

function getCache(query: string): LiveNewsArticle[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (entry.query !== query) return null;
    if (Date.now() - entry.timestamp > CACHE_DURATION_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function setCache(query: string, data: LiveNewsArticle[]) {
  try {
    const entry: CacheEntry = { data, timestamp: Date.now(), query };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // storage full — silently ignore
  }
}

export function useLiveNews(
  query: string = "",
  language: string = "en",
  pageSize: number = 9
) {
  const apiKey = "pub_e9403661363c4276af32547fc26d0ed9";

  return useQuery<LiveNewsArticle[]>({
    queryKey: ["live-news", query, language],
    queryFn: async () => {
      const cacheKey = `${query}|${language}`;
      const cached = getCache(cacheKey);
      if (cached) return cached;

      const params = new URLSearchParams({
        apikey: apiKey,
        language,
        size: String(pageSize),
      });
      if (query) params.set("q", query);

      const res = await fetch(
        `https://newsdata.io/api/1/latest?${params.toString()}`
      );
      if (!res.ok) throw new Error(`NewsData.io error: ${res.status}`);
      const json: NewsDataResponse = await res.json();
      const articles = json.results ?? [];
      setCache(cacheKey, articles);
      return articles;
    },
    staleTime: CACHE_DURATION_MS,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}
