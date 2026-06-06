// src/pages/dashboard/tabs/VirtualBookLibrary.tsx
import { useState, useRef, useCallback } from "react";
import {
  Search, BookOpen, Globe, ExternalLink,
  ChevronLeft, ChevronRight, Loader2, X, RefreshCw
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// ── Types ──────────────────────────────────────────────────────────
interface OpenLibBook {
  key: string;
  title: string;
  author_name?: string[];
  cover_i?: number;
  first_publish_year?: number;
  subject?: string[];
  language?: string[];
  edition_count?: number;
  ratings_average?: number;
}

const LANGUAGES = [
  { code: "all",  label: "All Languages", flag: ""    },
  { code: "en",   label: "English",        flag: "🇬🇧" },
  { code: "ur",   label: "اردو (Urdu)",    flag: "🇵🇰" },
  { code: "ps",   label: "پښتو (Pashto)",  flag: "🇦🇫" },
  { code: "ar",   label: "العربية (Arabic)", flag: "🇸🇦" },
  { code: "fr",   label: "Français",        flag: "🇫🇷" },
  { code: "de",   label: "Deutsch",         flag: "🇩🇪" },
  { code: "es",   label: "Español",         flag: "🇪🇸" },
  { code: "hi",   label: "हिन्दी (Hindi)",  flag: "🇮🇳" },
  { code: "fa",   label: "فارسی (Persian)", flag: "🇮🇷" },
  { code: "tr",   label: "Türkçe",          flag: "🇹🇷" },
  { code: "zh",   label: "中文 (Chinese)",  flag: "🇨🇳" },
  { code: "ja",   label: "日本語 (Japanese)", flag: "🇯🇵" },
];

const SUBJECT_SUGGESTIONS = [
  "Mathematics", "Science", "Physics", "Chemistry", "Biology",
  "History", "Geography", "English Literature", "Poetry", "Fiction",
  "Islamic Studies", "Philosophy", "Computer Science", "Medicine",
  "Education", "Children", "Adventure", "Biography",
];

// ── Fetch with retry ───────────────────────────────────────────────
async function fetchWithRetry(url: string, timeoutMs = 15000, retries = 2): Promise<Response> {
  let lastError: Error = new Error("Unknown error");
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      lastError = new Error(`Server error: ${res.status}`);
    } catch (err: any) {
      lastError = err?.name === "AbortError"
        ? new Error("Request timed out — please try again.")
        : err;
      if (attempt < retries) await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastError;
}

// ── Component ──────────────────────────────────────────────────────
export default function VirtualBookLibrary() {
  const [query, setQuery]               = useState("");
  const [language, setLanguage]         = useState("all");
  const [loading, setLoading]           = useState(false);
  const [olBooks, setOlBooks]           = useState<OpenLibBook[]>([]);
  const [olTotal, setOlTotal]           = useState(0);
  const [page, setPage]                 = useState(1);
  const [error, setError]               = useState<string | null>(null);
  const [hasSearched, setHasSearched]   = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const perPage = 12;

  // ── Open Library Search ────────────────────────────────────────
  const searchOpenLibrary = useCallback(async (q: string, lang: string, pg: number) => {
    setLoading(true); setError(null);
    try {
      const offset = (pg - 1) * perPage;
      let url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&offset=${offset}&limit=${perPage}&fields=key,title,author_name,cover_i,first_publish_year,subject,language,edition_count,ratings_average`;
      if (lang !== "all") url += `&language=${lang}`;
      const res = await fetchWithRetry(url, 15000, 2);
      const data = await res.json();
      setOlBooks(data.docs ?? []);
      setOlTotal(data.numFound ?? 0);
    } catch (err: any) {
      setError(err.message || "Failed to search Open Library. Please try again.");
      setOlBooks([]); setOlTotal(0);
    } finally { setLoading(false); }
  }, [perPage]);

  const doSearch = useCallback((overridePage?: number) => {
    const q = query.trim();
    if (!q) return;
    const pg = overridePage ?? 1;
    setPage(pg);
    setHasSearched(true);
    searchOpenLibrary(q, language, pg);
  }, [query, language, searchOpenLibrary]);

  const handleInputChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length >= 2) {
      debounceRef.current = setTimeout(() => {
        setPage(1); setHasSearched(true);
        searchOpenLibrary(val.trim(), language, 1);
      }, 500);
    }
  };

  const totalPages = Math.max(1, Math.ceil(olTotal / perPage));
  const currentLang = LANGUAGES.find(l => l.code === language)!;
  const getCoverUrl = (coverId: number, size: "S" | "M" | "L" = "M") =>
    `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`;

  const renderPagination = () => {
    if (totalPages <= 1) return null;
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("...");
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
      if (page < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return (
      <div className="flex items-center justify-center gap-1.5 mt-4">
        <button onClick={() => doSearch(page - 1)} disabled={page <= 1 || loading}
          className="p-2 rounded-lg bg-secondary text-foreground disabled:opacity-40 hover:bg-primary hover:text-white transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        {pages.map((p, i) =>
          typeof p === "string"
            ? <span key={`d${i}`} className="px-2 text-muted-foreground text-xs">…</span>
            : <button key={p} onClick={() => doSearch(p)}
                className={`w-9 h-9 rounded-lg text-xs font-bold transition-colors ${page === p ? "bg-primary text-white" : "bg-secondary text-foreground hover:bg-primary/20"}`}>
                {p}
              </button>
        )}
        <button onClick={() => doSearch(page + 1)} disabled={page >= totalPages || loading}
          className="p-2 rounded-lg bg-secondary text-foreground disabled:opacity-40 hover:bg-primary hover:text-white transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-lg font-heading font-bold text-foreground flex items-center gap-2">
          📚 Virtual Book Library
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Search millions of books · Covers & details · Powered by Open Library
        </p>
      </div>

      {/* Search Bar */}
      <div className="bg-card border border-border rounded-2xl p-3 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              placeholder="Search millions of books by title, author, subject..."
              className="w-full bg-secondary border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/40"
            />
            {query && (
              <button onClick={() => { setQuery(""); setHasSearched(false); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <button onClick={() => doSearch()} disabled={loading || !query.trim()}
            className="px-4 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-60 flex items-center gap-1.5 shrink-0">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span className="hidden sm:inline">Search</span>
          </button>
        </div>

        {/* Language Filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowLangPicker(!showLangPicker)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary border border-border text-xs font-medium text-foreground hover:border-primary/40 transition-colors"
          >
            <Globe className="w-3.5 h-3.5" />
            {currentLang.flag ? `${currentLang.flag} ` : ""}{currentLang.label}
          </button>
          {hasSearched && (
            <span className="ml-auto text-[10px] text-muted-foreground">
              {olTotal.toLocaleString()} books found
            </span>
          )}
        </div>

        {/* Language Picker Dropdown */}
        {showLangPicker && (
          <div className="bg-secondary rounded-xl p-2 grid grid-cols-2 sm:grid-cols-3 gap-1">
            {LANGUAGES.map((lang) => (
              <button key={lang.code}
                onClick={() => { setLanguage(lang.code); setShowLangPicker(false); }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                  language === lang.code ? "bg-primary text-white" : "hover:bg-muted text-foreground"
                }`}>
                {lang.flag && <span>{lang.flag}</span>}
                <span className="truncate">{lang.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Subject Suggestions */}
        {!hasSearched && (
          <div className="flex flex-wrap gap-1.5">
            {SUBJECT_SUGGESTIONS.map((s) => (
              <button key={s}
                onClick={() => { setQuery(s); handleInputChange(s); }}
                className="px-2.5 py-1 rounded-full bg-secondary border border-border text-[10px] font-medium text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors">
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-center space-y-2">
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>
          <button onClick={() => { setError(null); if (query.trim()) doSearch(); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-200 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Try Again
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-card rounded-xl overflow-hidden border border-border">
              <Skeleton className="h-40 w-full" />
              <div className="p-3 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Open Library Results */}
      {!loading && olBooks.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {olBooks.map((book) => {
            const coverUrl = book.cover_i ? getCoverUrl(book.cover_i, "M") : "";
            const olUrl = `https://openlibrary.org${book.key}`;
            const authorName = book.author_name?.[0] || "Unknown Author";
            return (
              <div key={book.key}
                className="bg-card rounded-xl overflow-hidden border border-border hover:border-primary/40 hover:shadow-md transition-all group">
                {/* Cover */}
                <div className="relative h-40 bg-gradient-to-br from-violet-500/10 to-indigo-500/5 flex items-center justify-center overflow-hidden">
                  {coverUrl ? (
                    <img src={coverUrl} alt={book.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <BookOpen className="w-10 h-10 text-violet-400/30" />
                  )}
                  {book.first_publish_year && (
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-violet-600 text-white text-[9px] font-black shadow">
                      {book.first_publish_year}
                    </span>
                  )}
                </div>
                {/* Info */}
                <div className="p-3 space-y-1.5">
                  <h4 className="text-xs font-bold text-foreground line-clamp-2 leading-tight min-h-[2rem]">
                    {book.title}
                  </h4>
                  <p className="text-[10px] text-muted-foreground line-clamp-1">{authorName}</p>
                  <div className="flex flex-wrap gap-1">
                    {book.edition_count && (
                      <span className="text-[9px] font-medium bg-secondary px-1.5 py-0.5 rounded">
                        {book.edition_count} editions
                      </span>
                    )}
                    {book.ratings_average && (
                      <span className="text-[9px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded">
                        ⭐ {book.ratings_average.toFixed(1)}
                      </span>
                    )}
                    {book.language?.slice(0, 2).map((lang) => {
                      const langObj = LANGUAGES.find(l => l.code === lang);
                      return langObj ? (
                        <span key={lang} className="text-[9px] font-medium bg-secondary px-1.5 py-0.5 rounded">
                          {langObj.flag} {langObj.label}
                        </span>
                      ) : null;
                    })}
                  </div>
                  {book.subject?.slice(0, 2).map((sub) => (
                    <span key={sub} className="inline-block text-[8px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded mr-1">
                      {sub.length > 20 ? sub.slice(0, 18) + "…" : sub}
                    </span>
                  ))}
                  <a href={olUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1 py-1.5 rounded-lg bg-violet-600 text-white text-[10px] font-bold hover:bg-violet-700 transition-colors mt-1">
                    <ExternalLink className="w-3 h-3" /> View on Open Library
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && hasSearched && olBooks.length > 0 && renderPagination()}

      {/* Empty / initial state */}
      {!loading && !hasSearched && (
        <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-3">
          <p className="text-4xl">📖</p>
          <p className="text-sm font-bold text-foreground">Search the World's Books</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Type a title, author, or subject above — or tap one of the quick topics to get started.
          </p>
        </div>
      )}

      {!loading && hasSearched && olBooks.length === 0 && !error && (
        <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-2">
          <p className="text-3xl">🔍</p>
          <p className="text-sm font-bold text-foreground">No books found</p>
          <p className="text-xs text-muted-foreground">Try different keywords or change the language filter</p>
        </div>
      )}

      <p className="text-[9px] text-muted-foreground/40 text-center">
        Powered by Open Library · Free & open access
      </p>
    </div>
  );
    }
    
