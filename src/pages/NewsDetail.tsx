import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Calendar } from "lucide-react";
import { format } from "date-fns";
import PageLayout from "@/components/layout/PageLayout";
import SEO from "@/components/seo/SEO";
import { useNewsItem } from "@/hooks/useNews";
import LazyImage from "@/components/shared/LazyImage";

const NewsDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: item, isLoading } = useNewsItem(id);

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

  return (
    <PageLayout>
      <SEO
        title={`${item.title} — News`}
        description={description}
        path={`/news/${item.id}`}
        type="article"
        image={item.image_url || undefined}
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
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to News
        </button>

        <h1 className="text-2xl md:text-4xl font-heading font-extrabold text-foreground leading-tight mb-3">
          {item.title}
        </h1>
        {dateText && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground mb-6">
            <Calendar className="w-3.5 h-3.5" /> {dateText}
          </p>
        )}

        {item.image_url && (
          <LazyImage
            src={item.image_url}
            alt={item.title}
            className="w-full rounded-2xl border border-border mb-6 object-cover max-h-[420px]"
          />
        )}

        {item.content && (
          <div className="prose prose-sm md:prose-base max-w-none text-foreground whitespace-pre-wrap leading-relaxed">
            {item.content}
          </div>
        )}
      </article>
    </PageLayout>
  );
};

export default NewsDetail;
