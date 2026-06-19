import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Download, FileText, BookOpen, Search, File, Library as LibraryIcon, QrCode, Star } from "lucide-react";
import { triggerConfetti } from "@/lib/confetti";
import PageLayout from "@/components/layout/PageLayout";
import PageBanner from "@/components/shared/PageBanner";
import { useLibraryFiles, incrementDownloadCount } from "@/hooks/useLibrary";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import WikipediaWidget from "@/components/shared/WikipediaWidget";
import VirtualBookLibrary from "@/pages/dashboard/tabs/VirtualBookLibrary";
import BookQRManager from "@/components/Library/BookQRManager";
import ReadingChallenge from "@/components/Library/ReadingChallenge";

const categories = ["All", "Past Papers", "Books", "Notes", "Assignments", "Admission", "Other"];
const classOptions = ["All", "6", "7", "8", "9", "10"];

type LibraryTab = "school" | "virtual" | "borrow";

const Library = () => {
  const [activeTab, setActiveTab] = useState<LibraryTab>("school");
  const [category, setCategory] = useState("All");
  const [classFilter, setClassFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const { user, profile } = useAuth();

  const handleSearch = (val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setDebouncedSearch(val); setPage(1); }, 300);
  };

  const { data, isLoading } = useLibraryFiles({
    category,
    classFilter,
    search: debouncedSearch,
    page,
    perPage: 12,
  });

  const files = data?.data ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / 12));

  const handleDownload = async (file: typeof files[0]) => {
    incrementDownloadCount(file.id);
    window.open(file.file_url, "_blank");
    triggerConfetti("mini");
  };

  const getFileIcon = (type: string | null) => {
    if (type?.toLowerCase().includes("pdf")) return <FileText className="w-5 h-5 text-destructive" />;
    if (type?.toLowerCase().includes("doc") || type?.toLowerCase().includes("word"))
      return <File className="w-5 h-5 text-primary" />;
    return <FileText className="w-5 h-5 text-primary" />;
  };

  return (
    <PageLayout>
      <PageBanner title="Digital Library" subtitle="Download study materials, borrow books & more" />

      <section className="py-12">
        <div className="container mx-auto px-4">

          {/* ── Tab Switcher ── */}
          <div className="flex gap-2 mb-8 flex-wrap">
            <button
              onClick={() => setActiveTab("school")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                activeTab === "school"
                  ? "bg-primary text-white border-primary shadow-md"
                  : "bg-card text-foreground border-border hover:border-primary/40"
              }`}
            >
              <FileText className="w-4 h-4" />
              School Files
            </button>
            <button
              onClick={() => setActiveTab("virtual")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                activeTab === "virtual"
                  ? "bg-primary text-white border-primary shadow-md"
                  : "bg-card text-foreground border-border hover:border-primary/40"
              }`}
            >
              <BookOpen className="w-4 h-4" />
              Virtual Library
            </button>
            <button
              onClick={() => setActiveTab("borrow")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                activeTab === "borrow"
                  ? "bg-primary text-white border-primary shadow-md"
                  : "bg-card text-foreground border-border hover:border-primary/40"
              }`}
            >
              <QrCode className="w-4 h-4" />
              Borrow Books
              <span className="ml-1 text-[10px] bg-amber-400 text-amber-950 px-1.5 py-0.5 rounded-full font-bold">NEW</span>
            </button>
          </div>

          {/* ── Virtual Library Tab ── */}
          {activeTab === "virtual" && (
            <div className="bg-card rounded-2xl p-6 shadow-card">
              <VirtualBookLibrary />
            </div>
          )}

          {/* ── Borrow Books Tab (NEW) ── */}
          {activeTab === "borrow" && (
            <div className="space-y-6 max-w-3xl mx-auto">
              {/* Reading challenge — gamification */}
              <ReadingChallenge
                userId={user?.id}
                target={10}
                subjectColor="#f59e0b"
              />

              {/* Quick info card */}
              <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-200 dark:border-amber-900 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                    <QrCode className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground text-sm mb-0.5">Borrow physical books with your phone</h3>
                    <p className="text-xs text-muted-foreground">
                      Scan any book's QR sticker to issue it instantly. 14-day loans. Reminders appear here before due date.
                    </p>
                  </div>
                </div>
              </div>

              {/* Issue / Return / Browse manager */}
              <div className="bg-card rounded-2xl p-4 shadow-card">
                <BookQRManager
                  userId={user?.id}
                  userName={profile?.full_name || user?.email}
                  isTeacher={profile?.role === "teacher" || profile?.role === "admin"}
                  subjectColor="#f59e0b"
                />
              </div>

              {/* Sign-in prompt */}
              {!user && (
                <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 text-center">
                  <Star className="w-8 h-8 text-primary mx-auto mb-2" />
                  <p className="font-semibold text-foreground text-sm">Sign in to start borrowing</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-3">
                    Track your reading, earn badges, and review books you've finished.
                  </p>
                  <a href="/auth/signin" className="inline-block bg-primary text-white px-5 py-2 rounded-xl text-sm font-semibold">
                    Sign In
                  </a>
                </div>
              )}
            </div>
          )}

          {/* ── School Files Tab ── */}
          {activeTab === "school" && (
            <>
              {/* Filters */}
              <div className="bg-card rounded-2xl p-6 shadow-card mb-8">
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="Search files by title..."
                    className="w-full rounded-xl border border-input bg-background pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-ring outline-none"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {categories.map((c) => (
                    <button
                      key={c}
                      onClick={() => { setCategory(c); setPage(1); }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        category === c
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground hover:bg-muted"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                  <div className="ml-auto">
                    <select
                      value={classFilter}
                      onChange={(e) => { setClassFilter(e.target.value); setPage(1); }}
                      className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
                    >
                      {classOptions.map((c) => (
                        <option key={c} value={c}>{c === "All" ? "All Classes" : `Class ${c}`}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Files Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="bg-card rounded-xl p-5 shadow-card space-y-3">
                        <Skeleton className="h-10 w-10 rounded-lg" />
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                        <Skeleton className="h-8 w-24" />
                      </div>
                    ))
                  : files.map((f) => (
                      <motion.div
                        key={f.id}
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="bg-card rounded-xl p-5 shadow-card hover:shadow-elevated transition-shadow"
                      >
                        <div className="flex items-start gap-3 mb-3">
                          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                            {getFileIcon(f.file_type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-heading font-semibold text-foreground text-sm line-clamp-2">{f.title}</h3>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                Class {f.class}
                              </span>
                              {f.subject && (
                                <span className="text-xs font-medium bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
                                  {f.subject}
                                </span>
                              )}
                              <span className="text-xs font-medium bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
                                {f.category}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                          <div className="text-xs text-muted-foreground space-x-2">
                            {f.file_size && <span>{f.file_size}</span>}
                            <span>{f.download_count} downloads</span>
                            <span>· {format(new Date(f.created_at), "dd MMM yyyy")}</span>
                          </div>
                          <button
                            onClick={() => handleDownload(f)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary-dark transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download
                          </button>
                        </div>
                      </motion.div>
                    ))}
              </div>

              {!isLoading && files.length === 0 && (
                <div className="text-center py-16 bg-card rounded-2xl shadow-card">
                  <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No files found. Try adjusting your filters.</p>
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
            </>
          )}
        </div>
      </section>

      {/* ── Wikipedia Research Section ── */}
      {activeTab === "school" && (
        <section className="py-12 bg-background">
          <div className="container mx-auto px-4 max-w-3xl">
            <div className="mb-6 text-center">
              <span className="text-sm font-semibold uppercase tracking-widest text-primary">Research Tool</span>
              <h2 className="text-2xl font-bold text-foreground mt-1">Wikipedia Quick Search</h2>
              <p className="text-sm text-muted-foreground mt-1">Search any topic, explore articles, and save your favorites.</p>
            </div>
            <WikipediaWidget />
          </div>
        </section>
      )}
    </PageLayout>
  );
};

export default Library;
