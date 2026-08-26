// Library.tsx — public "Digital Library" page
//
// FIXED (per request):
//   1. "School Files" and "Borrow Books" tab switcher removed. Borrow Books
//      (QR book-lending) is removed completely — it added a second unrelated
//      flow on top of an already-busy page. Since Library only ever showed
//      School Files as its default view anyway, there's no need for a
//      "School Files" button now that the whole page IS the files/videos view.
//   2. Videos are now MERGED into this same Library page (not a separate
//      route/feature) via a small "Files / Videos" content-type toggle.
//      Same page, same search/filter bar — just switches what's listed.
//   3. Filter bar (search + category chips + class select) was oversized and
//      visually noisy on mobile — condensed into a single compact bar with
//      smaller chips that wrap tightly, and search+class share a row on
//      larger screens.
import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, FileText, BookOpen, Search, File, Play, X, Youtube, Video as VideoIcon, ExternalLink as ExternalLinkIcon } from "lucide-react";
import { triggerConfetti } from "@/lib/confetti";
import PageLayout from "@/components/layout/PageLayout";
import PageBanner from "@/components/shared/PageBanner";
import { useLibraryFiles, incrementDownloadCount, type LibraryFile } from "@/hooks/useLibrary";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import {
  useVideos, getYouTubeId, getYouTubeThumbnail, isVideoFileUrl,
  type VideoItem,
} from "@/pages/dashboard/tabs/VideosTab";

const fileCategories = ["All", "Past Papers", "Books", "Notes", "Assignments", "Admission", "Other"];
const classOptions = ["All", "6", "7", "8", "9", "10"];

type ContentType = "files" | "videos";

/** True for links a browser can render directly in an iframe (PDFs). Most
 * non-PDF pages (bookstore listings, Drive "view" pages, etc.) either aren't
 * embeddable content or block iframe embedding via X-Frame-Options — those
 * still open in a new tab via handleDownload. */
/**
 * Decides whether a pasted link can be shown inside our own site (in an
 * iframe) or must open externally.
 *  - Direct .pdf files: browsers render PDFs natively in an iframe.
 *  - archive.org/details/<id> pages: Archive.org publishes a dedicated
 *    embeddable reader at archive.org/embed/<id> specifically for iframes
 *    (documented at https://archive.org/embed/<id>) — we rewrite to that.
 *  - Everything else: most sites send X-Frame-Options/CSP headers that
 *    block being embedded at all (a browser security rule, not something
 *    fixable from our side), so those still open in a new tab.
 */
function getEmbeddableUrl(url: string): string | null {
  const trimmed = url.trim();
  if (/\.pdf(\?.*)?$/i.test(trimmed)) return trimmed;

  const archiveMatch = trimmed.match(/^https?:\/\/(?:www\.)?archive\.org\/details\/([^/?#]+)/i);
  if (archiveMatch) return `https://archive.org/embed/${archiveMatch[1]}`;

  return null;
}

const Library = () => {
  const [contentType, setContentType] = useState<ContentType>("videos");
  const [category, setCategory] = useState("All");
  const [classFilter, setClassFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [playingVideo, setPlayingVideo] = useState<VideoItem | null>(null);
  const [readingFile, setReadingFile] = useState<LibraryFile | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSearch = (val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setDebouncedSearch(val); setPage(1); }, 300);
  };

  // ── Files data ──
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

  // ── Videos data (reuses the same hook the student dashboard uses) ──
  const { data: videos = [], isLoading: videosLoading } = useVideos({
    category: "All",
    search: debouncedSearch,
  });
  const filteredVideos = classFilter === "All" ? videos : videos.filter((v) => !v.class || v.class === "All" || v.class === classFilter);

  const handleFileAction = (file: LibraryFile) => {
    incrementDownloadCount(file.id);
    const embedUrl = file.file_type === "LINK" ? getEmbeddableUrl(file.file_url) : null;
    if (embedUrl) {
      setReadingFile(file);
    } else {
      window.open(file.file_url, "_blank");
      triggerConfetti("mini");
    }
  };

  const getFileIcon = (type: string | null) => {
    if (type === "LINK") return <ExternalLinkIcon className="w-5 h-5 text-emerald-600" />;
    if (type?.toLowerCase().includes("pdf")) return <FileText className="w-5 h-5 text-destructive" />;
    if (type?.toLowerCase().includes("doc") || type?.toLowerCase().includes("word"))
      return <File className="w-5 h-5 text-primary" />;
    return <FileText className="w-5 h-5 text-primary" />;
  };

  return (
    <PageLayout>
      <PageBanner title="Digital Library" subtitle="Download study materials & watch videos" />

      <section className="py-8 md:py-12">
        <div className="container mx-auto px-4">

          {/* ── Content type toggle: Videos / Files ── */}
          <div className="flex gap-2 mb-5">
            <button
              onClick={() => { setContentType("videos"); setPage(1); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${
                contentType === "videos"
                  ? "bg-primary text-white border-primary shadow-sm"
                  : "bg-card text-foreground border-border hover:border-primary/40"
              }`}
            >
              <VideoIcon className="w-4 h-4" />
              Videos
            </button>
            <button
              onClick={() => { setContentType("files"); setPage(1); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${
                contentType === "files"
                  ? "bg-primary text-white border-primary shadow-sm"
                  : "bg-card text-foreground border-border hover:border-primary/40"
              }`}
            >
              <FileText className="w-4 h-4" />
              Files
            </button>
          </div>

          {/* ── Compact filter bar (mobile-friendly) ── */}
          <div className="bg-card rounded-xl p-3 md:p-4 shadow-card mb-5">
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder={contentType === "files" ? "Search files..." : "Search videos..."}
                  className="w-full rounded-lg border border-input bg-background pl-8 pr-3 py-2 text-sm focus:ring-2 focus:ring-ring outline-none"
                />
              </div>
              <select
                value={classFilter}
                onChange={(e) => { setClassFilter(e.target.value); setPage(1); }}
                className="rounded-lg border border-input bg-background px-2.5 py-2 text-sm shrink-0 sm:w-36"
              >
                {classOptions.map((c) => (
                  <option key={c} value={c}>{c === "All" ? "All Classes" : `Class ${c}`}</option>
                ))}
              </select>
            </div>

            {/* Category chips — only relevant for Files */}
            {contentType === "files" && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {fileCategories.map((c) => (
                  <button
                    key={c}
                    onClick={() => { setCategory(c); setPage(1); }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      category === c
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-muted"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ══ FILES VIEW ══ */}
          {contentType === "files" && (
            <>
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
                          {f.cover_url ? (
                            <img
                              src={f.cover_url}
                              alt={f.title}
                              className="w-10 h-14 rounded-lg object-cover shrink-0 border border-border"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                              {getFileIcon(f.file_type)}
                            </div>
                          )}
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
                            <span>{f.download_count} {f.file_type === "LINK" ? "views" : "downloads"}</span>
                            <span>· {format(new Date(f.created_at), "dd MMM yyyy")}</span>
                          </div>
                          <button
                            onClick={() => handleFileAction(f)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary-dark transition-colors"
                          >
                            {f.file_type === "LINK" ? <ExternalLinkIcon className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
                            {f.file_type === "LINK" ? (getEmbeddableUrl(f.file_url) ? "Read" : "Read (opens new tab)") : "Download"}
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

          {/* ══ VIDEOS VIEW ══ */}
          {contentType === "videos" && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                {videosLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="space-y-2">
                        <Skeleton className="aspect-video w-full rounded-xl" />
                        <Skeleton className="h-4 w-3/4" />
                      </div>
                    ))
                  : filteredVideos.map((v) => {
                      const ytId = getYouTubeId(v.video_url);
                      const thumb = v.thumbnail_url || (ytId ? getYouTubeThumbnail(ytId) : null);
                      return (
                        <motion.div
                          key={v.id}
                          initial={{ opacity: 0, y: 12 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true }}
                          onClick={() => setPlayingVideo(v)}
                          className="bg-card rounded-xl overflow-hidden shadow-card hover:shadow-elevated transition-all cursor-pointer group"
                        >
                          <div className="aspect-video relative bg-muted overflow-hidden">
                            {thumb ? (
                              <img
                                src={thumb}
                                alt={v.title}
                                loading="lazy"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              />
                            ) : (
                              <div className="w-full h-full gradient-hero flex items-center justify-center">
                                <VideoIcon className="w-8 h-8 text-primary-foreground/40" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/30 transition-colors flex items-center justify-center">
                              <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity scale-75 group-hover:scale-100 duration-200">
                                <Play className="w-4 h-4 text-primary fill-primary ml-0.5" />
                              </div>
                            </div>
                            {ytId && (
                              <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                                <Youtube className="w-2.5 h-2.5" /> YouTube
                              </div>
                            )}
                          </div>
                          <div className="p-2.5">
                            <h4 className="text-xs md:text-sm font-semibold text-foreground line-clamp-2">{v.title}</h4>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <Badge variant="secondary" className="text-[9px] py-0">{v.category}</Badge>
                              {v.class && v.class !== "All" && (
                                <Badge variant="outline" className="text-[9px] py-0">Class {v.class}</Badge>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
              </div>

              {!videosLoading && filteredVideos.length === 0 && (
                <div className="text-center py-16 bg-card rounded-2xl shadow-card">
                  <VideoIcon className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No videos found. Try adjusting your filters.</p>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* ── Video player modal ── */}
      <AnimatePresence>
        {playingVideo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-foreground/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-4"
            onClick={() => setPlayingVideo(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-3xl bg-card rounded-2xl overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-3 sm:p-4 border-b border-border">
                <div className="flex-1 min-w-0 pr-3">
                  <h3 className="font-heading font-semibold text-foreground text-sm sm:text-base truncate">{playingVideo.title}</h3>
                  {playingVideo.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{playingVideo.description}</p>
                  )}
                </div>
                <button
                  onClick={() => setPlayingVideo(null)}
                  className="p-2 rounded-lg hover:bg-secondary text-muted-foreground transition-colors shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="aspect-video bg-black">
                {getYouTubeId(playingVideo.video_url) ? (
                  <iframe
                    src={`https://www.youtube.com/embed/${getYouTubeId(playingVideo.video_url)}?autoplay=1&rel=0&modestbranding=1`}
                    title={playingVideo.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full"
                  />
                ) : isVideoFileUrl(playingVideo.video_url) ? (
                  <video
                    src={playingVideo.video_url}
                    controls
                    autoPlay
                    className="w-full h-full"
                    controlsList="nodownload"
                  />
                ) : (
                  <iframe
                    src={playingVideo.video_url}
                    title={playingVideo.title}
                    allowFullScreen
                    className="w-full h-full"
                  />
                )}
              </div>

              <div className="p-3 sm:p-4 flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">{playingVideo.category}</Badge>
                {playingVideo.class && playingVideo.class !== "All" && (
                  <Badge variant="outline">Class {playingVideo.class}</Badge>
                )}
                {playingVideo.subject && (
                  <Badge variant="outline">{playingVideo.subject}</Badge>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                  {format(new Date(playingVideo.created_at), "dd MMM yyyy")}
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── In-site PDF reader modal (direct PDF links only) ── */}
      <AnimatePresence>
        {readingFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-foreground/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-4"
            onClick={() => setReadingFile(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-3xl h-[85vh] bg-card rounded-2xl overflow-hidden shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-3 sm:p-4 border-b border-border shrink-0">
                <div className="flex-1 min-w-0 pr-3">
                  <h3 className="font-heading font-semibold text-foreground text-sm sm:text-base truncate">{readingFile.title}</h3>
                </div>
                <a
                  href={readingFile.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg hover:bg-secondary text-muted-foreground transition-colors shrink-0"
                  title="Open in new tab"
                >
                  <ExternalLinkIcon className="w-4 h-4" />
                </a>
                <button
                  onClick={() => setReadingFile(null)}
                  className="p-2 rounded-lg hover:bg-secondary text-muted-foreground transition-colors shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 bg-muted">
                <iframe
                  src={getEmbeddableUrl(readingFile.file_url) || readingFile.file_url}
                  title={readingFile.title}
                  className="w-full h-full"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageLayout>
  );
};

export default Library;
