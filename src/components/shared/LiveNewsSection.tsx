import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, Globe, Clock, Wifi, WifiOff, ChevronLeft, ChevronRight, Search, RefreshCw } from "lucide-react";
import { useLiveNews, LiveNewsArticle } from "@/hooks/useLiveNews";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

// ─── category filters shown as tabs ────────────────────────────────────────────
const CATEGORIES = [
  { label: "🌐 Top Stories", q: "" },
  { label: "🏫 Education",   q: "education school students" },
  { label: "🔬 Science",     q: "science technology" },
  { label: "📚 Books",       q: "books reading literature" },
  { label: "🏆 Sports",      q: "sports youth" },
  { label: "💡 Innovation",  q: "innovation youth pakistan" },
];

const PER_PAGE = 6;

// ─── single card ───────────────────────────────────────────────────────────────
function ArticleCard({ article, index }: { article: LiveNewsArticle; index: number }) {
  const [imgError, setImgError] = useState(false);

  const timeAgo = (() => {
    try {
      return formatDistanceToNow(new Date(article.pubDate), { addSuffix: true });
    } catch {
      return article.pubDate;
    }
  })();

  return (
    <motion.a
      href={article.link}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35, delay: index * 0.06 }}
      className="group block bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-elevated transition-all duration-300 hover:-translate-y-1 border border-border/40"
    >
      {/* thumbnail */}
      <div className="relative h-44 overflow-hidden bg-secondary">
        {article.image_url && !imgError ? (
          <img
            src={article.image_url}
            alt={article.title}
            onError={() => setImgError(true)}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full gradient-hero flex items-center justify-center">
            <Globe className="w-12 h-12 text-primary-foreground/30" />
          </div>
        )}
        {/* source badge */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 rounded-full">
          {article.source_icon && (
            <img
              src={article.source_icon}
              alt=""
              className="w-3.5 h-3.5 rounded-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          {article.source_name}
        </div>
        {/* external link indicator */}
        <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow">
          <ExternalLink className="w-3.5 h-3.5 text-primary" />
        </div>
      </div>

      {/* content */}
      <div className="p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
          <Clock className="w-3 h-3" />
          {timeAgo}
          {article.category?.[0] && (
            <>
              <span className="mx-1 text-muted-foreground/40">·</span>
              <span className="capitalize text-primary/80 font-medium">{article.category[0]}</span>
            </>
          )}
        </div>
        <h3 className="font-heading font-semibold text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors duration-200">
          {article.title}
        </h3>
        {article.description && (
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2 leading-relaxed">
            {article.description}
          </p>
        )}
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary mt-3 group-hover:gap-1.5 transition-all">
          Read on {article.source_name} <ExternalLink className="w-3 h-3" />
        </span>
      </div>
    </motion.a>
  );
}

// ─── featured (first) article ───────────────────────────────────────────────────
function FeaturedArticle({ article }: { article: LiveNewsArticle }) {
  const [imgError, setImgError] = useState(false);
  const timeAgo = (() => {
    try { return formatDistanceToNow(new Date(article.pubDate), { addSuffix: true }); }
    catch { return article.pubDate; }
  })();

  return (
    <motion.a
      href={article.link}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="group block bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-elevated transition-all duration-300 mb-8 border border-border/40"
    >
      <div className="md:flex">
        {/* image */}
        <div className="md:w-1/2 h-64 md:h-auto overflow-hidden bg-secondary relative">
          {article.image_url && !imgError ? (
            <img
              src={article.image_url}
              alt={article.title}
              onError={() => setImgError(true)}
              loading="eager"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 min-h-[16rem]"
            />
          ) : (
            <div className="w-full h-full gradient-hero flex items-center justify-center min-h-[16rem]">
              <Globe className="w-20 h-20 text-primary-foreground/20" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent md:hidden" />
        </div>

        {/* text */}
        <div className="md:w-1/2 p-8 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full">
              🌐 Live News
            </span>
            {article.source_icon && (
              <img src={article.source_icon} alt="" className="w-5 h-5 rounded-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display="none"; }} />
            )}
            <span className="text-xs font-semibold text-muted-foreground">{article.source_name}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
            <Clock className="w-3 h-3" /> {timeAgo}
          </div>
          <h2 className="text-2xl font-heading font-bold text-foreground leading-snug group-hover:text-primary transition-colors">
            {article.title}
          </h2>
          {article.description && (
            <p className="text-muted-foreground mt-3 line-clamp-3 leading-relaxed">
              {article.description}
            </p>
          )}
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary mt-5 group-hover:gap-2 transition-all">
            Read Full Story <ExternalLink className="w-4 h-4" />
          </span>
        </div>
      </div>
    </motion.a>
  );
}

// ─── skeleton loaders ───────────────────────────────────────────────────────────
function NewsSkeletons() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-64 rounded-2xl" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {[1,2,3,4,5,6].map((i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-44 rounded-2xl" />
            <Skeleton className="h-4 w-3/4 rounded" />
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-2/3 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── main component ─────────────────────────────────────────────────────────────
const LiveNewsSection = () => {
  const [activeCat, setActiveCat] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const effectiveQuery = searchQuery || CATEGORIES[activeCat].q;
  const { data: articles = [], isLoading, isError, refetch, isFetching } = useLiveNews(effectiveQuery, "en", 18);

  const featured = articles[0];
  const rest = articles.slice(1);
  const totalPages = Math.max(1, Math.ceil(rest.length / PER_PAGE));
  const paginated = rest.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const handleCat = (i: number) => {
    setActiveCat(i);
    setPage(1);
    setSearchQuery("");
    setSearchInput("");
  };

  const handleSearch = () => {
    if (!searchInput.trim()) return;
    setSearchQuery(searchInput.trim());
    setPage(1);
  };

  return (
    <section className="py-16 bg-gradient-to-b from-secondary/30 to-background">
      <div className="container mx-auto px-4">

        {/* ── header ── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-3 py-1 rounded-full mb-3">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse inline-block" />
              Powered by NewsData.io
            </span>
            <h2 className="text-3xl font-heading font-bold text-foreground">
              🌍 World News — Live
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Real-time headlines from global sources, updated every 15 minutes.
            </p>
          </div>

          {/* search */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search news…"
                className="pl-9 pr-4 py-2.5 text-sm bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 w-48 text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <button
              onClick={handleSearch}
              className="px-4 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors"
            >
              Go
            </button>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              title="Refresh"
              className="p-2.5 bg-card border border-border rounded-xl hover:bg-secondary transition-colors text-muted-foreground disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* ── category tabs ── */}
        {!searchQuery && (
          <div className="flex gap-2 flex-wrap mb-8">
            {CATEGORIES.map((cat, i) => (
              <button
                key={i}
                onClick={() => handleCat(i)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 border ${
                  activeCat === i
                    ? "bg-primary text-primary-foreground border-primary shadow-md"
                    : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}

        {/* search breadcrumb */}
        {searchQuery && (
          <div className="flex items-center gap-3 mb-6">
            <span className="text-sm text-muted-foreground">Results for: <strong className="text-foreground">"{searchQuery}"</strong></span>
            <button
              onClick={() => { setSearchQuery(""); setSearchInput(""); }}
              className="text-xs text-primary hover:underline font-semibold"
            >
              ✕ Clear search
            </button>
          </div>
        )}

        {/* ── content ── */}
        {isLoading ? (
          <NewsSkeletons />
        ) : isError ? (
          <div className="text-center py-16 bg-card rounded-2xl shadow-card border border-border/40">
            <WifiOff className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-semibold mb-1">Could not load live news</p>
            <p className="text-muted-foreground text-sm mb-4">Check your connection or try again later.</p>
            <button
              onClick={() => refetch()}
              className="px-5 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-16 bg-card rounded-2xl shadow-card border border-border/40">
            <Wifi className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No articles found.</p>
          </div>
        ) : (
          <>
            {/* featured */}
            {featured && <FeaturedArticle article={featured} />}

            {/* grid */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`${activeCat}-${page}-${searchQuery}`}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
              >
                {paginated.map((article, i) => (
                  <ArticleCard key={article.article_id} article={article} index={i} />
                ))}
              </motion.div>
            </AnimatePresence>

            {/* pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-10">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="w-9 h-9 rounded-xl flex items-center justify-center bg-card border border-border text-muted-foreground hover:bg-secondary disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i + 1)}
                    className={`w-9 h-9 rounded-xl text-sm font-semibold transition-all ${
                      page === i + 1
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "bg-card border border-border text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="w-9 h-9 rounded-xl flex items-center justify-center bg-card border border-border text-muted-foreground hover:bg-secondary disabled:opacity-40 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* footer attribution */}
            <p className="text-center text-xs text-muted-foreground mt-6">
              News provided by{" "}
              <a href="https://newsdata.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-semibold">
                NewsData.io
              </a>
              {" "}· Cached 15 min · Links open original sources
            </p>
          </>
        )}
      </div>
    </section>
  );
};

export default LiveNewsSection;
