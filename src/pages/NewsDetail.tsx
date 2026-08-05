import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Calendar, Clock } from "lucide-react";
import { format } from "date-fns";
import PageLayout from "@/components/layout/PageLayout";
import SEO from "@/components/seo/SEO";
import { useNewsItem } from "@/hooks/useNews";
import LazyImage from "@/components/shared/LazyImage";
import TextToSpeechPlayer, { ListenButton } from "@/components/shared/TextToSpeechPlayer";
import { detectTextLanguage, estimateReadingTime } from "@/lib/newsUtils";

const NewsDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: item, isLoading } = useNewsItem(id);
  const [listening, setListening] = useState(false);

  if (isLoading) {
    return (
      <PageLayout>
        <div className="container mx-auto px-4 py-16 max-w-3xl">
          <div className="h-8 w-2/3 bg-muted rounded animate-pulse mb-4" />
          <div className="h-64 bg-muted rounded animate-pulse mb-4" />
          <div className="h-4 w-full bg-muted rounded animate-pulse mb-2" />
          <div className="h-4 w-5/6 bg-muted rounded animate-pulse" />
        </div>
      </PageLayout>
    );
  }

  if (!item) {
    return (
      <PageLayout>
        <SEO title="News Not Found" description="The news article you are looking for was not found." noIndex />
        <div className="container mx-auto px-4 py-20 max-w-2xl text-center">
          <h1 className="text-2xl font-heading font-bold text-foreground mb-2">News not found</h1>
          <p className="text-sm text-muted-foreground mb-6">
            The article may have been removed or the link is incorrect.
          </p>
          <Link to="/news" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-semibold">
            <ArrowLeft className="w-4 h-4" /> Back to News
          </Link>
        </div>
      </PageLayout>
    );
  }

  const dateText = (() => { try { return format(new Date(item.created_at), "d MMMM yyyy"); } catch { return ""; } })();
  const description = (item.content || "").replace(/\s+/g, " ").slice(0, 160);
  const publishedISO = (() => { try { return new Date(item.created_at).toISOString(); } catch { return undefined; } })();
  const titleLang = detectTextLanguage(item.title);
  const contentLang = detectTextLanguage(item.content || "");
  const titleDir = titleLang === "ur" ? "rtl" : "ltr";
  const contentDir = contentLang === "ur" ? "rtl" : "ltr";

  return (
    <PageLayout>
      <SEO
        title={`${item.title} — News`}
        description={description}
        path={`/news/${item.id}`}
        type="article"
        image={item.image_url || undefined}
        publishedTime={publishedISO}
        breadcrumbs={[
          { name: "Home", path: "/" },
          { name: "News", path: "/news" },
          { name: item.title, path: `/news/${item.id}` },
        ]}
      />

      <article className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Breadcrumb */}
        <nav className="text-xs text-muted-foreground mb-4 flex items-center gap-1 flex-wrap">
          <Link to="/" className="hover:text-primary">Home</Link>
          <span>/</span>
          <Link to="/news" className="hover:text-primary">News</Link>
          <span>/</span>
          <span className="text-foreground truncate max-w-[180px]">{item.title}</span>
        </nav>

        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back to News
        </button>

        {/* Eyebrow */}
        <span className="inline-block text-[11px] font-bold uppercase tracking-[0.2em] text-primary bg-gold-soft px-3 py-1 rounded-full mb-4">
          Official Notice
        </span>

        <h1
          className={`text-2xl md:text-4xl font-display font-semibold text-foreground leading-tight mb-4 ${
            titleLang === "ur" ? "font-urdu-display" : ""
          }`}
          style={titleLang === "ur" ? undefined : { fontFamily: "var(--font-display)" }}
          dir={titleDir}
        >
          {item.title}
        </h1>

        {/* Byline / meta bar */}
        <div className="flex items-center flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground pb-5 mb-6 border-b border-border">
          {dateText && (
            <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {dateText}</span>
          )}
          <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {estimateReadingTime(item.content)}</span>
          <span className="flex items-center gap-1.5">
            GHS Babi Khel Administration
          </span>
          <span className="ml-auto">
            <ListenButton onClick={() => setListening(true)} />
          </span>
        </div>

        {item.image_url ? (
          <LazyImage
            src={item.image_url}
            alt={item.title}
            className="w-full rounded-2xl border border-border mb-8 object-cover max-h-[420px]"
          />
        ) : (
          <div className="w-full rounded-2xl border border-border mb-8 overflow-hidden h-56 relative paper-grain">
            <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full border border-gold/25" />
            <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full border border-gold/15" />
            <div className="absolute inset-3 border border-gold/15 rounded-lg" />
            <div className="absolute top-4 left-4 w-3 h-3 border-t-2 border-l-2 border-gold" />
            <div className="absolute top-4 right-4 w-3 h-3 border-t-2 border-r-2 border-gold" />
            <div className="absolute bottom-4 left-4 w-3 h-3 border-b-2 border-l-2 border-gold" />
            <div className="absolute bottom-4 right-4 w-3 h-3 border-b-2 border-r-2 border-gold" />
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-6">
              <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.3em] text-primary/55">
                <span>EST. 2018</span>
                <span className="inline-block w-1.5 h-1.5 rotate-45 bg-gold/70" />
                <span>GHS BABI KHEL</span>
              </div>
              <div
                className="w-14 h-14 flex items-center justify-center"
                style={{
                  clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
                  background: "linear-gradient(135deg, hsl(348 55% 28%) 0%, hsl(348 50% 22%) 100%)",
                }}
              >
                <span className="font-display italic font-bold text-[hsl(45_40%_95%)] text-xl" style={{ fontFamily: "var(--font-display)" }}>
                  GHS
                </span>
              </div>
              <p className="font-urdu-display text-primary/75 text-sm" dir="rtl">
                گورنمنٹ ہائی سکول بابی خیل
              </p>
              <div className="flex items-center gap-1.5 w-full max-w-[140px]">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent to-gold/70" />
                <span className="inline-block w-1.5 h-1.5 rotate-45 bg-gold/80" />
                <div className="flex-1 h-px bg-gradient-to-l from-transparent to-gold/70" />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[hsl(348_55%_28%)]">
                {titleLang === "ur" ? "اداریہ" : "Editorial Dispatch"}
              </p>
            </div>
          </div>
        )}

        {item.content && (
          <div
            className={`prose prose-sm md:prose-lg max-w-none text-foreground whitespace-pre-wrap leading-relaxed ${
              contentLang === "ur"
                ? "font-urdu"
                : "first-letter:text-5xl first-letter:font-display first-letter:font-semibold first-letter:text-[hsl(348_55%_28%)] first-letter:mr-2 first-letter:float-left"
            }`}
            style={contentLang === "ur" ? undefined : { fontFamily: "var(--font-body)" }}
            dir={contentDir}
          >
            {item.content}
          </div>
        )}

        {/* closing rule, gives the "published paper" finish */}
        <div className="mt-10 pt-6 border-t border-border flex items-center justify-between flex-wrap gap-3">
          <div className="h-[2px] w-12 bg-gold rounded-full" />
          <Link to="/news" className="text-sm font-semibold text-primary hover:underline inline-flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> All News & Updates
          </Link>
        </div>
      </article>

      {listening && (
        <TextToSpeechPlayer
          text={item.content || item.title}
          title={item.title}
          onClose={() => setListening(false)}
        />
      )}
    </PageLayout>
  );
};

export default NewsDetail;
