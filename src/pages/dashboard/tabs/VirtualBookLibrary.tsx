// src/pages/dashboard/tabs/VirtualBookLibrary.tsx
import { useState, useRef, useCallback } from "react";
import {
  Search, BookOpen, Globe, Shuffle, ExternalLink, Download,
  ChevronLeft, ChevronRight, Loader2, Library, Filter, X, RefreshCw
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

interface GutenbergBook {
  id: number;
  title: string;
  authors: { name: string; birth_year?: number; death_year?: number }[];
  subjects: string[];
  languages: string[];
  download_count: number;
  formats: Record<string, string>;
}

type SearchMode = "openlibrary" | "gutenberg";

const LANGUAGES = [
  { code: "all", label: "All Languages", flag: "🌐" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "ur", label: "اردو (Urdu)", flag: "🇵🇰" },
  { code: "ps", label: "پښتو (Pashto)", flag: "🇦🇫" },
  { code: "ar", label: "العربية (Arabic)", flag: "🇸🇦" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "hi", label: "हिन्दी (Hindi)", flag: "🇮🇳" },
  { code: "fa", label: "فارسی (Persian)", flag: "🇮🇷" },
  { code: "tr", label: "Türkçe", flag: "🇹🇷" },
  { code: "zh", label: "中文 (Chinese)", flag: "🇨🇳" },
  { code: "ja", label: "日本語 (Japanese)", flag: "🇯🇵" },
];

const SUBJECT_SUGGESTIONS = [
  "Mathematics", "Science", "Physics", "Chemistry", "Biology",
  "History", "Geography", "English Literature", "Poetry", "Fiction",
  "Islamic Studies", "Philosophy", "Computer Science", "Medicine",
  "Education", "Children", "Adventure", "Biography",
];

// Popular search terms used for random discovery
const DISCOVER_TOPICS = [
  "adventure", "science", "history", "fiction", "philosophy",
  "nature", "classic", "mystery", "poetry", "education",
  "biography", "travel", "romance", "children", "mathematics",
];

// ── Fetch with retry helper ─────────────────────────────────────────
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
        ? new Error("Request timed out — the server took too long. Please try again.")
        : err;
      if (attempt < retries) {
        // brief backoff before retry
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

// ── Component ──────────────────────────────────────────────────────
export default function VirtualBookLibrary() {
  const [mode, setMode] = useState<SearchMode>("gutenberg");
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("all");
  const [loading, setLoading] = useState(false);
  const [olBooks, setOlBooks] = useState<OpenLibBook[]>([]);
  const [gutBooks, setGutBooks] = useState<GutenbergBook[]>([]);
  const [olTotal, setOlTotal] = useState(0);
  const [gutTotal, setGutTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const perPage = mode === "gutenberg" ? 18 : 12;

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

  // ── Gutendex Search ────────────────────────────────────────────
  const searchGutendex = useCallback(async (q: string, lang: string, pg: number) => {
    setLoading(true); setError(null);
    try {
      let url = `https://gutendex.com/books?search=${encodeURIComponent(q)}&page=${pg}`;
      if (lang !== "all") url += `&languages=${lang}`;
      const res = await fetchWithRetry(url, 15000, 2);
      const data = await res.json();
      setGutBooks(data.results ?? []);
      setGutTotal(data.count ?? 0);
    } catch (err: any) {
      setError(err.message || "Failed to reach Project Gutenberg. Please try again.");
      setGutBooks([]); setGutTotal(0);
    } finally { setLoading(false); }
  }, []);

  // ── Unified Search ─────────────────────────────────────────────
  const doSearch = useCallback((overridePage?: number) => {
    const q = query.trim();
    if (!q) return;
    const pg = overridePage ?? 1;
    setPage(pg);
    setHasSearched(true);
    setIsDiscovering(false);
    if (mode === "openlibrary") searchOpenLibrary(q, language, pg);
    else searchGutendex(q, language, pg);
  }, [query, language, mode, searchOpenLibrary, searchGutendex]);

  // ── Discover Random Books (fixed: fetches full grid of books) ──
  const discoverRandom = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHasSearched(true);
    setIsDiscovering(true);
    setMode("gutenberg");
    setOlBooks([]);

    try {
      // Pick a random topic + random page for variety
      const topic = DISCOVER_TOPICS[Math.floor(Math.random() * DISCOVER_TOPICS.length)];
      const randomPage = Math.floor(Math.random() * 50) + 1;
      const url = `https://gutendex.com/books?search=${encodeURIComponent(topic)}&page=${randomPage}`;

      const res = await fetchWithRetry(url, 15000, 2);
      const data = await res.json();
      const books: GutenbergBook[] = data.results ?? [];

      if (books.length > 0) {
        // Shuffle the results so order is random each time
        const shuffled = [...books].sort(() => Math.random() - 0.5);
        setGutBooks(shuffled);
        setGutTotal(data.count ?? books.length);
        setPage(randomPage);
        setQuery(""); // clear search query to show "discovered" state
      } else {
        // Fallback: try page 1 with a different topic
        const fallbackTopic = DISCOVER_TOPICS[Math.floor(Math.random() * DISCOVER_TOPICS.length)];
        const fallbackRes = await fetchWithRetry(
          `https://gutendex.com/books?search=${encodeURIComponent(fallbackTopic)}&page=1`,
          15000,
          1
        );
        const fallbackData = await fallbackRes.json();
        const fallbackBooks: GutenbergBook[] = fallbackData.results ?? [];
        if (fallbackBooks.length > 0) {
          setGutBooks([...fallbackBooks].sort(() => Math.random() - 0.5));
          setGutTotal(fallbackData.count ?? fallbackBooks.length);
        } else {
          setError("No books found. Please try again!");
        }
      }
    } catch (err: any) {
      setError(err.message || "Discovery failed. Please try again.");
      setGutBooks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Debounced input ────────────────────────────────────────────
  const handleInputChange = (val: string) => {
    setQuery(val);
    setIsDiscovering(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length >= 2) {
      debounceRef.current = setTimeout(() => {
        setPage(1);
        setHasSearched(true);
        if (mode === "openlibrary") searchOpenLibrary(val.trim(), language, 1);
        else searchGutendex(val.trim(), language, 1);
      }, 500);
    }
  };

  const totalPages = mode === "gutenberg"
    ? Math.max(1, Math.ceil(gutTotal / perPage))
    : Math.max(1, Math.ceil(olTotal / perPage));

  const currentLang = LANGUAGES.find(l => l.code === language);

  // ── Cover URL helper ───────────────────────────────────────────
  const getCoverUrl = (coverId: number, size: "S" | "M" | "L" = "M") =>
    `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`;

  // ── Render helpers ─────────────────────────────────────────────
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
        <button
          onClick={() => doSearch(page - 1)}
          disabled={page <= 1 || loading}
          className="p-2 rounded-lg bg-secondary text-foreground disabled:opacity-40 hover:bg-primary hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {pages.map((p, i) =>
          typeof p === "string" ? (
            <span key={`d${i}`} className="px-2 text-muted-foreground text-xs">…</span>
          ) : (
            <button
              key={p}
              onClick={() => doSearch(p)}
              className={`w-9 h-9 rounded-lg text-xs font-bold transition-colors ${
                page === p ? "bg-primary text-white" : "bg-secondary text-foreground hover:bg-primary/20"
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => doSearch(page + 1)}
          disabled={page >= totalPages || loading}
          className="p-2 rounded-lg bg-secondary text-foreground disabled:opacity-40 hover:bg-primary hover:text-white transition-colors"
        >
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
          70,000+ free ebooks · Search millions of books · Read instantly
        </p>
      </div>

      {/* Mode Switcher */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => { setMode("gutenberg"); setHasSearched(false); setError(null); setIsDiscovering(false); }}
          className={`rounded-xl p-3 text-left transition-all border ${
            mode === "gutenberg"
              ? "bg-primary text-white border-primary shadow-md"
              : "bg-card text-foreground border-border hover:border-primary/40"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Library className="w-4 h-4" />
            <span className="text-xs font-bold">Project Gutenberg</span>
          </div>
          <p className={`text-[10px] leading-tight ${mode === "gutenberg" ? "text-white/75" : "text-muted-foreground"}`}>
            70,000+ FREE ebooks · Instant download
          </p>
        </button>
        <button
          onClick={() => { setMode("openlibrary"); setHasSearched(false); setError(null); setIsDiscovering(false); }}
          className={`rounded-xl p-3 text-left transition-all border ${
            mode === "openlibrary"
              ? "bg-primary text-white border-primary shadow-md"
              : "bg-card text-foreground border-border hover:border-primary/40"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-4 h-4" />
            <span className="text-xs font-bold">Open Library</span>
          </div>
          <p className={`text-[10px] leading-tight ${mode === "openlibrary" ? "text-white/75" : "text-muted-foreground"}`}>
            Millions of books · Covers & details
          </p>
        </button>
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
              placeholder={mode === "gutenberg" ? "Search free ebooks by title, author..." : "Search millions of books..."}
              className="w-full bg-secondary border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/40"
            />
            {query && (
              <button onClick={() => { setQuery(""); setHasSearched(false); setIsDiscovering(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <button
            onClick={() => doSearch()}
            disabled={loading || !query.trim()}
            className="px-4 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-60 flex items-center gap-1.5 shrink-0"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span className="hidden sm:inline">Search</span>
          </button>
        </div>

        {/* Language Filter + Discover */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowLangPicker(!showLangPicker)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary border border-border text-xs font-medium text-foreground hover:border-primary/40 transition-colors"
          >
            <Globe className="w-3.5 h-3.5" />
            {currentLang?.flag} {currentLang?.label}
          </button>
          <button
            onClick={discoverRandom}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary border border-border text-xs font-medium text-foreground hover:border-primary/40 hover:bg-primary/10 transition-colors disabled:opacity-60"
          >
            {loading && isDiscovering
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Shuffle className="w-3.5 h-3.5" />
            }
            Discover a Book
          </button>
          {/* Rediscover button shown after discovery */}
          {isDiscovering && !loading && gutBooks.length > 0 && (
            <button
              onClick={discoverRandom}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/30 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Discover More
            </button>
          )}
          {hasSearched && (
            <span className="ml-auto text-[10px] text-muted-foreground">
              {mode === "gutenberg" ? `${gutTotal.toLocaleString()} ebooks` : `${olTotal.toLocaleString()} books`} found
            </span>
          )}
        </div>

        {/* Language Picker Dropdown */}
        {showLangPicker && (
          <div className="bg-secondary rounded-xl p-2 grid grid-cols-2 sm:grid-cols-3 gap-1">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => { setLanguage(lang.code); setShowLangPicker(false); }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                  language === lang.code ? "bg-primary text-white" : "hover:bg-muted text-foreground"
                }`}
              >
                <span>{lang.flag}</span>
                <span className="truncate">{lang.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Subject Suggestions */}
        {!hasSearched && (
          <div className="flex flex-wrap gap-1.5">
            {SUBJECT_SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => { setQuery(s); handleInputChange(s); }}
                className="px-2.5 py-1 rounded-full bg-secondary border border-border text-[10px] font-medium text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error with retry */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-center space-y-2">
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={() => {
              setError(null);
              if (isDiscovering) discoverRandom();
              else if (query.trim()) doSearch();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-200 transition-colors"
          >
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

      {/* Discovery banner */}
      {!loading && isDiscovering && gutBooks.length > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
            <Shuffle className="w-3.5 h-3.5" />
            Showing {gutBooks.length} random free ebooks — click any to read!
          </p>
        </div>
      )}

      {/* Gutenberg Results */}
      {!loading && mode === "gutenberg" && gutBooks.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {gutBooks.map((book) => {
            const coverUrl = book.formats["image/jpeg"] || "";
            const htmlUrl = book.formats["text/html"] || book.formats["text/html; charset=utf-8"] || "";
            const epubUrl = book.formats["application/epub+zip"] || "";
            const pdfUrl = book.formats["application/pdf"] || "";
            const plainUrl = book.formats["text/plain; charset=utf-8"] || book.formats["text/plain"] || "";
            const readUrl = htmlUrl || plainUrl;
            const authorName = book.authors?.[0]?.name || "Unknown Author";

            return (
              <div
                key={book.id}
                className="bg-card rounded-xl overflow-hidden border border-border hover:border-primary/40 hover:shadow-md transition-all group"
              >
                {/* Cover */}
                <div className="relative h-40 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center overflow-hidden">
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt={book.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <BookOpen className="w-10 h-10 text-primary/30" />
                  )}
                  {/* Free badge */}
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-black uppercase tracking-wider shadow">
                    FREE
                  </span>
                </div>

                {/* Info */}
                <div className="p-3 space-y-1.5">
                  <h4 className="text-xs font-bold text-foreground line-clamp-2 leading-tight min-h-[2rem]">
                    {book.title}
                  </h4>
                  <p className="text-[10px] text-muted-foreground line-clamp-1">{authorName}</p>
                  <div className="flex flex-wrap gap-1">
                    {book.languages?.slice(0, 2).map((lang) => {
                      const langObj = LANGUAGES.find(l => l.code === lang);
                      return (
                        <span key={lang} className="text-[9px] font-medium bg-secondary px-1.5 py-0.5 rounded">
                          {langObj?.flag || ""} {langObj?.label || lang}
                        </span>
                      );
                    })}
                    {book.download_count > 0 && (
                      <span className="text-[9px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                        {book.download_count.toLocaleString()} downloads
                      </span>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-1.5 pt-1">
                    {readUrl && (
                      <a
                        href={readUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-primary text-white text-[10px] font-bold hover:bg-primary/90 transition-colors"
                      >
                        <BookOpen className="w-3 h-3" /> Read
                      </a>
                    )}
                    {epubUrl && (
                      <a
                        href={epubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 py-1.5 px-2 rounded-lg bg-secondary border border-border text-foreground text-[10px] font-medium hover:bg-primary/10 transition-colors"
                        title="Download EPUB"
                      >
                        <Download className="w-3 h-3" />
                      </a>
                    )}
                    {pdfUrl && (
                      <a
                        href={pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 py-1.5 px-2 rounded-lg bg-secondary border border-border text-foreground text-[10px] font-medium hover:bg-primary/10 transition-colors"
                        title="Download PDF"
                      >
                        <Download className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Open Library Results */}
      {!loading && mode === "openlibrary" && olBooks.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {olBooks.map((book) => {
            const coverUrl = book.cover_i ? getCoverUrl(book.cover_i, "M") : "";
            const olUrl = `https://openlibrary.org${book.key}`;
            const authorName = book.author_name?.[0] || "Unknown Author";

            return (
              <div
                key={book.key}
                className="bg-card rounded-xl overflow-hidden border border-border hover:border-primary/40 hover:shadow-md transition-all group"
              >
                {/* Cover */}
                <div className="relative h-40 bg-gradient-to-br from-violet-500/10 to-indigo-500/5 flex items-center justify-center overflow-hidden">
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt={book.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
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

                  {/* Subject tags */}
                  {book.subject?.slice(0, 2).map((sub) => (
                    <span key={sub} className="inline-block text-[8px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded mr-1">
                      {sub.length > 20 ? sub.slice(0, 18) + "…" : sub}
                    </span>
                  ))}

                  {/* Action */}
                  <a
                    href={olUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1 py-1.5 rounded-lg bg-violet-600 text-white text-[10px] font-bold hover:bg-violet-700 transition-colors mt-1"
                  >
                    <ExternalLink className="w-3 h-3" /> View on Open Library
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && hasSearched && !isDiscovering && (gutBooks.length > 0 || olBooks.length > 0) && renderPagination()}

      {/* Empty State */}
      {!loading && !hasSearched && (
        <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-3">
          <p className="text-4xl">📖</p>
          <p className="text-sm font-bold text-foreground">Explore the World of Free Books</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Search by title, author, or subject. Filter by Urdu, English, or Pashto.
            Tap "Discover a Book" for a random grid of free ebooks!
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <button
              onClick={discoverRandom}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 active:scale-95 transition-all"
            >
              <Shuffle className="w-4 h-4" /> Discover a Book
            </button>
          </div>
        </div>
      )}

      {!loading && hasSearched && gutBooks.length === 0 && olBooks.length === 0 && !error && (
        <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-2">
          <p className="text-3xl">🔍</p>
          <p className="text-sm font-bold text-foreground">No books found</p>
          <p className="text-xs text-muted-foreground">Try different keywords or change the language filter</p>
        </div>
      )}

      {/* Footer credit */}
      <p className="text-[9px] text-muted-foreground/40 text-center">
        Powered by {mode === "gutenberg" ? "Project Gutenberg" : "Open Library"} · Free & open access
      </p>
    </div>
  );
}
