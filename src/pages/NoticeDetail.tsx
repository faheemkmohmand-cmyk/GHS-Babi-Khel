import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Calendar, AlertCircle, Tag } from "lucide-react";
import { format } from "date-fns";
import PageLayout from "@/components/layout/PageLayout";
import SEO from "@/components/seo/SEO";
import { useNoticeItem } from "@/hooks/useNotices";

const NoticeDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: item, isLoading } = useNoticeItem(id);

  if (isLoading) {
    return (
      <PageLayout>
        <div className="container mx-auto px-4 py-16 max-w-3xl">
          <div className="h-8 w-2/3 bg-muted rounded animate-pulse mb-4" />
          <div className="h-4 w-full bg-muted rounded animate-pulse mb-2" />
          <div className="h-4 w-5/6 bg-muted rounded animate-pulse" />
        </div>
      </PageLayout>
    );
  }

  if (!item) {
    return (
      <PageLayout>
        <SEO title="Notice Not Found" description="The notice you are looking for was not found." noIndex />
        <div className="container mx-auto px-4 py-20 max-w-2xl text-center">
          <h1 className="text-2xl font-heading font-bold text-foreground mb-2">Notice not found</h1>
          <p className="text-sm text-muted-foreground mb-6">
            The notice may have been removed or the link is incorrect.
          </p>
          <Link to="/notices" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-semibold">
            <ArrowLeft className="w-4 h-4" /> Back to Notices
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
        title={`${item.title} — Notice`}
        description={description}
        path={`/notices/${item.id}`}
        type="article"
        breadcrumbs={[
          { name: "Home", path: "/" },
          { name: "Notices", path: "/notices" },
          { name: item.title, path: `/notices/${item.id}` },
        ]}
      />

      <article className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Breadcrumb */}
        <nav className="text-xs text-muted-foreground mb-4 flex items-center gap-1 flex-wrap">
          <Link to="/" className="hover:text-primary">Home</Link>
          <span>/</span>
          <Link to="/notices" className="hover:text-primary">Notices</Link>
          <span>/</span>
          <span className="text-foreground truncate max-w-[180px]">{item.title}</span>
        </nav>

        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Notices
        </button>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {item.category && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-secondary text-foreground">
              <Tag className="w-3 h-3" /> {item.category}
            </span>
          )}
          {item.is_urgent && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
              <AlertCircle className="w-3 h-3" /> Urgent
            </span>
          )}
        </div>

        <h1 className="text-2xl md:text-4xl font-heading font-extrabold text-foreground leading-tight mb-3">
          {item.title}
        </h1>
        {dateText && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground mb-6">
            <Calendar className="w-3.5 h-3.5" /> {dateText}
          </p>
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

export default NoticeDetail;
