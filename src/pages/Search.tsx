import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search as SearchIcon, Bell, Newspaper, Users, BookOpen, FileText } from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import PageBanner from "@/components/shared/PageBanner";
import { useNotices } from "@/hooks/useNotices";
import { useNews } from "@/hooks/useNews";
import { useTeachers } from "@/hooks/useTeachers";
import { useDebounce } from "@/hooks/useDebounce";

interface Hit {
  id: string;
  title: string;
  snippet?: string;
  href: string;
}

const SearchPage = () => {
  const [params, setParams] = useSearchParams();
  const initialQ = params.get("q") ?? "";
  const [input, setInput] = useState(initialQ);
  const q = useDebounce(input.trim(), 250);

  useEffect(() => {
    const cur = params.get("q") ?? "";
    if (q !== cur) {
      const next = new URLSearchParams(params);
      if (q) next.set("q", q); else next.delete("q");
      setParams(next, { replace: true });
    }
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: notices = [] } = useNotices();
  const { data: news = [] } = useNews();
  const { data: teachers = [] } = useTeachers();

  const match = (text: string | null | undefined, needle: string) =>
    !!text && text.toLowerCase().includes(needle.toLowerCase());

  const results = useMemo(() => {
    const needle = q.trim();
    if (!needle) return { notices: [], news: [], teachers: [] } as Record<string, Hit[]>;

    const noticeHits: Hit[] = notices
      .filter((n) => match(n.title, needle) || match(n.content, needle))
      .map((n) => ({
        id: n.id, title: n.title,
        snippet: (n.content || "").slice(0, 140),
        href: `/notices/${n.id}`,
      }));

    const newsHits: Hit[] = news
      .filter((n) => match(n.title, needle) || match(n.content, needle))
      .map((n) => ({
        id: n.id, title: n.title,
        snippet: (n.content || "").slice(0, 140),
        href: `/news/${n.id}`,
      }));

    const teacherHits: Hit[] = teachers
      .filter((t) => match(t.full_name, needle) || match(t.subject, needle))
      .map((t) => ({
        id: t.id, title: t.full_name,
        snippet: t.subject || "",
        href: `/teachers`,
      }));

    return { notices: noticeHits, news: newsHits, teachers: teacherHits };
  }, [q, notices, news, teachers]);

  const totalCount =
    results.notices.length + results.news.length + results.teachers.length;

  const groups = [
    { key: "notices",  label: "Notices",  icon: Bell,      items: results.notices,  color: "text-red-500"     },
    { key: "news",     label: "News",     icon: Newspaper, items: results.news,     color: "text-blue-500"    },
    { key: "teachers", label: "Teachers", icon: Users,     items: results.teachers, color: "text-emerald-500" },
  ];

  return (
    <PageLayout>
      <PageBanner title="Search" subtitle="Find notices, news, teachers and more" />

      <section className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="relative mb-6">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search notices, news, teachers…"
            className="w-full pl-11 pr-4 py-3 rounded-2xl bg-card border border-border text-base text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {!q ? (
          <div className="bg-card border border-border rounded-2xl p-10 text-center">
            <SearchIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Type to search across the website.</p>
          </div>
        ) : totalCount === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-10 text-center">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-base font-semibold text-foreground">No results for "{q}"</p>
            <p className="text-sm text-muted-foreground mt-1">
              Try a different keyword or browse{" "}
              <Link to="/notices" className="text-primary underline">notices</Link> and{" "}
              <Link to="/news" className="text-primary underline">news</Link>.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((g) =>
              g.items.length === 0 ? null : (
                <div key={g.key}>
                  <div className="flex items-center gap-2 mb-2">
                    <g.icon className={`w-4 h-4 ${g.color}`} />
                    <h2 className="font-heading font-bold text-foreground">
                      {g.label}
                      <span className="ml-2 text-xs font-medium text-muted-foreground">
                        ({g.items.length})
                      </span>
                    </h2>
                  </div>
                  <div className="space-y-2">
                    {g.items.map((h) => (
                      <Link
                        key={h.id}
                        to={h.href}
                        className="block bg-card border border-border rounded-xl p-4 hover:border-primary/40 hover:shadow-sm transition"
                      >
                        <p className="text-sm font-semibold text-foreground">{h.title}</p>
                        {h.snippet && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {h.snippet}
                          </p>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </section>
    </PageLayout>
  );
};

export default SearchPage;
