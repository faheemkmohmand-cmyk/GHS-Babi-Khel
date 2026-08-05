import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Bell, Sparkles, Clock } from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import PageBanner from "@/components/shared/PageBanner";
import { useNews, NewsItem } from "@/hooks/useNews";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { detectTextLanguage, estimateReadingTime } from "@/lib/newsUtils";
import TextToSpeechPlayer, { ListenButton } from "@/components/shared/TextToSpeechPlayer";

const PER_PAGE = 9;

/**
 * Elegant placeholder shown when an article has no image.
 * Deliberately NOT a flat green block — a quiet ink/paper texture with the
 * school's initials monogram, so cards without a photo still look designed
 * rather than "broken".
 */
const ArticleMonogram = ({ size = "lg" }: { size?: "lg" | "sm" }) => (
  <div className="w-full h-full relative overflow-hidden bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary-light)/0.25),transparent_55%),linear-gradient(160deg,hsl(var(--primary))_0%,hsl(var(--primary-dark))_100%)] flex items-center justify-center">
    {/* fine paper-grain texture */}
    <div
      className="absolute inset-0 opacity-[0.08] mix-blend-overlay"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
      }}
    />
    <span
      className={`font-display italic text-gold/90 select-none ${size === "lg" ? "text-6xl" : "text-4xl"}`}
      style={{ fontFamily: "var(--font-display)" }}
    >
      GBK
    </span>
    <div className="absolute bottom-3 right-3 flex items-center gap-1 text-gold/70">
      <Sparkles className="w-3.5 h-3.5" />
    </div>
  </div>
);

const News = () => {
  const { data: allNews = [], isLoading } = useNews();
  const [page, setPage] = useState(1);
  const [ttsItem, setTtsItem] = useState<{ title: string; content: string } | null>(null);
  const navigate = useNavigate();

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

          {/* section heading */}
          <div className="mb-10 flex items-end justify-between flex-wrap gap-4">
            <div>
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary bg-gold-soft px-3 py-1 rounded-full mb-3">
                <Bell className="w-3 h-3" />
                School Updates
              </span>
              <h2 className="text-3xl md:text-4xl font-display italic font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                From GHS Babi Khel
              </h2>
              <div className="mt-2 h-[3px] w-16 rounded-full bg-gradient-to-r from-gold to-transparent" />
              <p className="text-muted-foreground mt-3 text-sm max-w-xl">
                Official news and announcements from our school administration — read or listen, in English or Urdu.
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-8">
              <Skeleton className="h-64 rounded-2xl" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {[1,2,3].map((i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
              </div>
            </div>
          ) : (
            <>
              {featured && (
                <motion.article
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => navigate(`/news/${featured.id}`)}
                  className="relative bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-elevated transition-all duration-300 mb-10 cursor-pointer group border border-border/60"
                >
                  <div className="md:flex">
                    <div className="md:w-1/2 h-64 md:h-auto overflow-hidden bg-secondary relative">
                      {featured.image_url ? (
                        <img
                          src={featured.image_url}
                          alt={featured.title}
                          loading="eager"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <ArticleMonogram size="lg" />
                      )}
                      <span className="absolute top-4 left-4 text-[10px] font-bold uppercase tracking-[0.2em] text-primary-foreground bg-primary/80 px-2.5 py-1 rounded-full">
                        Featured Story
                      </span>
                    </div>
                    <div className="md:w-1/2 p-8 flex flex-col justify-center">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                        <span>{format(new Date(featured.created_at), "d MMMM yyyy")}</span>
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                        <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {estimateReadingTime(featured.content)}</span>
                      </div>
                      <h2
                        className="text-2xl md:text-3xl font-display font-semibold text-foreground leading-snug"
                        style={{ fontFamily: "var(--font-display)" }}
                        dir={detectTextLanguage(featured.title) === "ur" ? "rtl" : "ltr"}
                      >
                        {featured.title}
                      </h2>
                      {featured.content && (
                        <p
                          className="text-muted-foreground mt-3 line-clamp-3 leading-relaxed"
                          dir={detectTextLanguage(featured.content) === "ur" ? "rtl" : "ltr"}
                        >
                          {featured.content}
                        </p>
                      )}
                      <div className="flex items-center gap-5 mt-5">
                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary group-hover:gap-2 transition-all">
                          Read Full Story <ArrowRight className="w-4 h-4" />
                        </span>
                        <ListenButton onClick={(e) => openListen(featured, e)} />
                      </div>
                    </div>
                  </div>
                </motion.article>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {paginated.map((item) => (
                  <motion.article
                    key={item.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    onClick={() => navigate(`/news/${item.id}`)}
                    className="bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-elevated transition-all duration-300 cursor-pointer group border border-border/60 flex flex-col"
                  >
                    <div className="h-44 overflow-hidden bg-secondary">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.title}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <ArticleMonogram size="sm" />
                      )}
                    </div>
                    <div className="p-5 flex flex-col flex-1">
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2">
                        <span>{format(new Date(item.created_at), "dd MMM yyyy")}</span>
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                        <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {estimateReadingTime(item.content)}</span>
                      </div>
                      <h3
                        className="font-display font-semibold text-foreground line-clamp-2 leading-snug"
                        style={{ fontFamily: "var(--font-display)" }}
                        dir={detectTextLanguage(item.title) === "ur" ? "rtl" : "ltr"}
                      >
                        {item.title}
                      </h3>
                      {item.content && (
                        <p
                          className="text-sm text-muted-foreground mt-2 line-clamp-2 leading-relaxed"
                          dir={detectTextLanguage(item.content) === "ur" ? "rtl" : "ltr"}
                        >
                          {item.content}
                        </p>
                      )}
                      <div className="mt-auto pt-4">
                        <ListenButton onClick={(e) => openListen(item, e)} />
                      </div>
                    </div>
                  </motion.article>
                ))}
              </div>

              {allNews.length === 0 && (
                <div className="text-center py-16 bg-card rounded-2xl shadow-card border border-border/60">
                  <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No news articles yet.</p>
                </div>
              )}

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setPage(i + 1)}
                      className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                        page === i + 1
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground hover:bg-muted"
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

      {ttsItem && (
        <TextToSpeechPlayer text={ttsItem.content} title={ttsItem.title} onClose={() => setTtsItem(null)} />
      )}

    </PageLayout>
  );
};

export default News;
