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

const CACHE_KEY = "live_news_cache";
const CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const API_KEY = "pub_e9403661363c4276af32547fc26d0ed9";

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
    if (!Array.isArray(entry.data)) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return entry.data;
  } catch {
    localStorage.removeItem(CACHE_KEY);
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

async function fetchNewsData(url: string): Promise<Response> {
  // Primary: direct fetch (works when CSP allows newsdata.io)
  try {
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (res.ok) return res;
    // If 4xx (bad API key, quota, etc.) throw immediately — no proxy will help
    if (res.status >= 400 && res.status < 500) {
      throw new Error(`NewsData.io error: ${res.status}`);
    }
  } catch (err: unknown) {
    // Network/CORS block — fall through to proxy
    const isNetworkErr =
      err instanceof TypeError ||
      (err instanceof Error && (err.message.includes("CORS") || err.message.includes("Failed to fetch") || err.message.includes("NetworkError")));
    if (!isNetworkErr) throw err;
  }

  // Fallback: allorigins CORS proxy
  const proxied = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
  const proxyRes = await fetch(proxied);
  if (!proxyRes.ok) throw new Error(`Proxy error: ${proxyRes.status}`);

  const proxyJson = await proxyRes.json();
  const inner = JSON.parse(proxyJson.contents);

  // Wrap in a fake Response so the caller can call .json() uniformly
  return new Response(JSON.stringify(inner), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export function useLiveNews(
  query: string = "",
  language: string = "en",
  pageSize: number = 10
) {
  // NewsData.io free plan: max size = 10
  const safeSize = Math.min(pageSize, 10);

  return useQuery<LiveNewsArticle[]>({
    queryKey: ["live-news", query, language],
    queryFn: async () => {
      const cacheKey = `${query}|${language}`;
      const cached = getCache(cacheKey);
      if (cached) return cached;

      const params = new URLSearchParams({
        apikey: API_KEY,
        language,
        size: String(safeSize),
      });
      if (query) params.set("q", query);

      const url = `https://newsdata.io/api/1/latest?${params.toString()}`;
      const res = await fetchNewsData(url);
      const json = await res.json();

      if (json.status === "error") {
        const msg =
          json.results?.message || json.message || "Unknown NewsData.io error";
        throw new Error(msg);
      }

      const articles: LiveNewsArticle[] = Array.isArray(json.results)
        ? json.results
        : [];
      setCache(cacheKey, articles);
      return articles;
    },
    staleTime: CACHE_DURATION_MS,
    gcTime: 30 * 60 * 1000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
               }
