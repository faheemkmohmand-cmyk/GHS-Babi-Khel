import { useState } from "react";
import PageLayout from "@/components/layout/PageLayout";
import PageBanner from "@/components/shared/PageBanner";
import { useNews, NewsItem } from "@/hooks/useNews";
import { Skeleton } from "@/components/ui/skeleton";
import TextToSpeechPlayer from "@/components/shared/TextToSpeechPlayer";
import EditorialNewsCard from "@/components/shared/EditorialNewsCard";
import { Bell, Newspaper } from "lucide-react";

const PER_PAGE = 9;

const News = () => {
  const { data: allNews = [], isLoading } = useNews();
  const [page, setPage] = useState(1);
  const [ttsItem, setTtsItem] = useState<{ title: string; content: string } | null>(null);

  const featured = allNews[0];
  const rest = allNews.slice(1);
  const totalPages = Math.max(1, Math.ceil(rest.length / PER_PAGE));
  const paginated = rest.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const openListen = (item: NewsItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setTtsItem({ title: item.title, content: item.content || item.title });
  };

  return (
    <PageLayout>
      <PageBanner title="News & Updates" subtitle="Latest happenings at GHS Babi Khel" />

      {/* ══════════════════════════════════════════
          SECTION 1 — School News (manual, Supabase)
         ══════════════════════════════════════════ */}
      <section className="py-16">
        <div className="container mx-auto px-4">

          {/* ── Centered editorial header ── */}
          <div className="mb-12 text-center">
            {/* Decorative ornament: rule · diamond · rule */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="h-px w-12 bg-gradient-to-r from-transparent to-gold/70" />
              <span className="inline-block w-1.5 h-1.5 rotate-45 bg-gold/80" />
              <span className="h-px w-12 bg-gradient-to-l from-transparent to-gold/70" />
            </div>
            <h2 className="text-3xl md:text-4xl font-display italic font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
              From GHS Babi Khel
            </h2>
            <p className="text-muted-foreground mt-3 text-sm max-w-xl mx-auto">
              Official news and announcements from our school administration — read or listen, in English or Urdu.
            </p>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/70 mt-3">
              <Newspaper className="w-3.5 h-3.5" /> {allNews.length} article{allNews.length === 1 ? "" : "s"} published
            </span>
            {/* Bottom decorative ornament */}
            <div className="flex items-center justify-center gap-2 mt-4">
              <span className="h-px w-16 bg-gradient-to-r from-transparent to-gold/40" />
              <span className="inline-block w-1 h-1 rotate-45 bg-gold/50" />
              <span className="h-px w-16 bg-gradient-to-l from-transparent to-gold/40" />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-8">
              <Skeleton className="h-64 md:h-96 rounded-md" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {[1,2,3].map((i) => <Skeleton key={i} className="h-72 rounded-md" />)}
              </div>
            </div>
          ) : (
            <>
              {/* Featured story (most recent) */}
              {featured && (
                <div className="mb-8">
                  <EditorialNewsCard
                    item={featured}
                    index={0}
                    featured
                    onListen={(it, e) => openListen(it, e)}
                  />
                </div>
              )}

              {/* Side stories grid */}
              {paginated.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {paginated.map((item, i) => (
                    <EditorialNewsCard
                      key={item.id}
                      item={item}
                      index={i + 1}
                      onListen={(it, e) => openListen(it, e)}
                    />
                  ))}
                </div>
              )}

              {allNews.length === 0 && (
                <div className="text-center py-16 bg-card rounded-md border border-gold/30">
                  <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No dispatches yet.</p>
                </div>
              )}

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-10">
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setPage(i + 1)}
                      className={`w-9 h-9 rounded-md text-sm font-medium transition-colors border ${
                        page === i + 1
                          ? "bg-[hsl(348_55%_28%)] text-[hsl(45_40%_95%)] border-[hsl(348_55%_28%)]"
                          : "bg-card text-muted-foreground border-border hover:border-gold/60 hover:text-foreground"
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* TTS bar — auto-plays in the correct detected language. */}
      {ttsItem && (
        <TextToSpeechPlayer
          text={ttsItem.content}
          title={ttsItem.title}
          onClose={() => setTtsItem(null)}
        />
      )}

    </PageLayout>
  );
};

export default News;
