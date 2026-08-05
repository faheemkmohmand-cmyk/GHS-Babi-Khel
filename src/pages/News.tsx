import { useState } from "react";
import PageLayout from "@/components/layout/PageLayout";
import PageBanner from "@/components/shared/PageBanner";
import { useNews, NewsItem } from "@/hooks/useNews";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
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

          {/* ── Editorial masthead header ── */}
          <div className="mb-10">
            <div className="flex items-end justify-between flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="inline-block w-8 h-px bg-[hsl(348_55%_28%)]" />
                  <span className="text-[11px] font-bold uppercase tracking-[0.4em] text-[hsl(348_55%_28%)]">
                    Editorial Dispatch
                  </span>
                </div>
                <h2 className="text-3xl md:text-4xl font-display italic font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                  From GHS Babi Khel
                </h2>
                <div className="mt-2 h-[3px] w-16 rounded-full bg-gradient-to-r from-gold to-transparent" />
                <p className="text-muted-foreground mt-3 text-sm max-w-xl">
                  Official news and announcements from our school administration — read or listen, in English or Urdu.
                </p>
              </div>
              <span className="text-[11px] text-muted-foreground/70 flex items-center gap-1.5">
                <Newspaper className="w-3.5 h-3.5" /> {allNews.length} article{allNews.length === 1 ? "" : "s"} published
              </span>
            </div>

            {/* Volume / Issue line */}
            <div className="mt-5 flex items-center gap-3 text-[10px] uppercase tracking-[0.32em] text-muted-foreground/70">
              <span>Vol. I</span>
              <span className="w-1 h-1 rounded-full bg-gold/60" />
              <span>Issue · {format(new Date(), "yyyy")}</span>
              <span className="w-1 h-1 rounded-full bg-gold/60" />
              <span>{format(new Date(), "MMMM yyyy")}</span>
              <span className="flex-1 h-px bg-gradient-to-r from-gold/40 to-transparent ml-2" />
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
