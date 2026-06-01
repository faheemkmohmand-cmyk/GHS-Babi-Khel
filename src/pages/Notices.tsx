import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, ChevronDown, ChevronUp, Bell, ArrowRight } from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import PageBanner from "@/components/shared/PageBanner";
import { useNotices } from "@/hooks/useNotices";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import TextToSpeechPlayer, { ListenButton } from "@/components/shared/TextToSpeechPlayer";

const tabs = ["All", "Urgent", "General", "Academic", "Events"];
const PER_PAGE = 10;

const Notices = () => {
  const { data: allNotices = [], isLoading } = useNotices();
  const [activeTab, setActiveTab] = useState("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [ttsNotice, setTtsNotice] = useState<{ title: string; content: string } | null>(null);

  const filtered = allNotices.filter((n) => {
    if (activeTab === "All") return true;
    if (activeTab === "Urgent") return n.is_urgent;
    return n.category === activeTab;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <PageLayout>
      <PageBanner title="Notice Board" subtitle="Stay updated with school announcements" />

      <section className="py-16">
        <div className="container mx-auto px-4 max-w-3xl">
          {/* Tabs */}
          <div className="flex flex-wrap gap-2 mb-8">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setPage(1); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-muted"
                }`}
              >
                {tab}
                {tab === "Urgent" && (
                  <span className="ml-1.5 w-2 h-2 rounded-full bg-destructive inline-block animate-pulse" />
                )}
              </button>
            ))}
          </div>

          {/* Notices */}
          <div className="space-y-3">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="bg-card rounded-2xl p-6 border-l-4 border-l-muted shadow-card">
                    <Skeleton className="h-5 w-3/4 mb-2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                ))
              : paginated.map((n) => (
                  <motion.div
                    key={n.id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`bg-card rounded-2xl shadow-card border-l-4 overflow-hidden cursor-pointer ${
                      n.is_urgent ? "border-l-destructive" : "border-l-primary"
                    }`}
                    onClick={() => setExpandedId(expandedId === n.id ? null : n.id)}
                  >
                    <div className="p-5 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {n.is_urgent && (
                            <span className="inline-flex items-center gap-1 bg-destructive/10 text-destructive text-xs font-semibold px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                              URGENT
                            </span>
                          )}
                          <span className="text-xs font-medium bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
                            {n.category}
                          </span>
                        </div>
                        <h3 className="font-heading font-semibold text-foreground">{n.title}</h3>
                        <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                          <Calendar className="w-3.5 h-3.5" />
                          {format(new Date(n.created_at), "dd MMM yyyy")}
                        </div>
                      </div>
                      {n.content && (
                        <div className="shrink-0 text-muted-foreground">
                          {expandedId === n.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </div>
                      )}
                    </div>
                    <AnimatePresence>
                      {expandedId === n.id && n.content && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                        <div className="px-5 pb-5 pt-0 text-sm text-muted-foreground leading-relaxed border-t border-border mt-0 pt-4">
                            {n.content}
                            <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                              <ListenButton onClick={() => setTtsNotice({ title: n.title, content: n.content! })} />
                              <Link
                                to={`/notices/${n.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                              >
                                View Full Notice <ArrowRight className="w-3.5 h-3.5" />
                              </Link>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
          </div>

          {!isLoading && filtered.length === 0 && (
            <div className="text-center py-16 bg-card rounded-2xl shadow-card">
              <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No notices found.</p>
            </div>
          )}

          {/* Pagination */}
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
        </div>
      </section>
      {ttsNotice && (
        <TextToSpeechPlayer text={ttsNotice.content} title={ttsNotice.title} onClose={() => setTtsNotice(null)} />
      )}
    </PageLayout>
  );
};

export default Notices;
