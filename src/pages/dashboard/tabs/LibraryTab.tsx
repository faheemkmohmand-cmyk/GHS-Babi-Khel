import { useState, useRef } from "react";
import { Download, FileText, BookOpen, Search, File, ExternalLink, X } from "lucide-react";
import { useLibraryFiles, incrementDownloadCount, type LibraryFile } from "@/hooks/useLibrary";
import { Skeleton } from "@/components/ui/skeleton";

const categories = ["All", "Past Papers", "Books", "Notes", "Assignments", "Other"];
const classOptions = ["All", "6", "7", "8", "9", "10"];

/** True for links a browser can render directly in an iframe (PDFs). Other
 * links (bookstore pages, previews) usually block embedding and open in a
 * new tab instead. */
const isPdfUrl = (url: string) => /\.pdf(\?.*)?$/i.test(url.trim());

const LibraryTab = () => {
  const [category, setCategory] = useState("All");
  const [classFilter, setClassFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [readingFile, setReadingFile] = useState<LibraryFile | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSearch = (val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setDebouncedSearch(val); setPage(1); }, 300);
  };

  const { data, isLoading } = useLibraryFiles({ category, classFilter, search: debouncedSearch, page, perPage: 12 });
  const files = data?.data ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.count ?? 0) / 12));

  const handleFileAction = (f: LibraryFile) => {
    incrementDownloadCount(f.id);
    if (f.file_type === "LINK" && isPdfUrl(f.file_url)) setReadingFile(f);
    else window.open(f.file_url, "_blank");
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" /> Library
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          School files
        </p>
      </div>

      <div className="space-y-4">
        {/* Filters */}
        <div className="bg-card rounded-xl p-4 shadow-card space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => handleSearch(e.target.value)} placeholder="Search files..." className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-ring outline-none" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {categories.map((c) => (
              <button key={c} onClick={() => { setCategory(c); setPage(1); }} className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${category === c ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>{c}</button>
            ))}
            <select value={classFilter} onChange={(e) => { setClassFilter(e.target.value); setPage(1); }} className="ml-auto rounded-lg border border-input bg-background px-2 py-1 text-xs">
              {classOptions.map((c) => <option key={c} value={c}>{c === "All" ? "All Classes" : `Class ${c}`}</option>)}
            </select>
          </div>
        </div>

        {/* Files */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
            : files.map((f) => (
                <div key={f.id} className="bg-card rounded-xl p-4 shadow-card hover:shadow-elevated transition-shadow">
                  <div className="flex items-start gap-3">
                    {f.cover_url ? (
                      <img src={f.cover_url} alt={f.title} className="w-9 h-12 rounded-lg object-cover shrink-0 border border-border" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                        {f.file_type === "LINK" ? <ExternalLink className="w-4 h-4 text-emerald-600" /> : f.file_type?.includes("pdf") ? <FileText className="w-4 h-4 text-destructive" /> : <File className="w-4 h-4 text-primary" />}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-foreground line-clamp-1">{f.title}</h4>
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        <span className="text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded">Class {f.class}</span>
                        {f.subject && <span className="text-[10px] font-medium bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">{f.subject}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-border">
                    <span className="text-[10px] text-muted-foreground">{f.download_count} {f.file_type === "LINK" ? "views" : "downloads"}</span>
                    <button onClick={() => handleFileAction(f)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary-dark transition-colors">
                      {f.file_type === "LINK" ? <ExternalLink className="w-3 h-3" /> : <Download className="w-3 h-3" />} {f.file_type === "LINK" ? "Read" : "Download"}
                    </button>
                  </div>
                </div>
              ))}
        </div>

        {!isLoading && files.length === 0 && (
          <div className="text-center py-12 bg-card rounded-xl shadow-card">
            <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">No files found.</p>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex justify-center gap-1.5">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button key={i} onClick={() => setPage(i + 1)} className={`w-8 h-8 rounded-lg text-xs font-medium ${page === i + 1 ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>{i + 1}</button>
            ))}
          </div>
        )}
      </div>

      {readingFile && (
        <div className="fixed inset-0 z-50 bg-foreground/90 backdrop-blur-md flex items-center justify-center p-3" onClick={() => setReadingFile(null)}>
          <div className="w-full max-w-3xl h-[85vh] bg-card rounded-2xl overflow-hidden shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b border-border shrink-0">
              <h3 className="font-heading font-semibold text-foreground text-sm truncate pr-3">{readingFile.title}</h3>
              <button onClick={() => setReadingFile(null)} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground transition-colors shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 bg-muted">
              <iframe src={readingFile.file_url} title={readingFile.title} className="w-full h-full" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LibraryTab;
