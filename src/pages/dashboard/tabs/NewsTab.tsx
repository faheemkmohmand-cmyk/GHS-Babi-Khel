import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, X } from "lucide-react";
import { useNews } from "@/hooks/useNews";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import type { NewsItem } from "@/hooks/useNews";

// ─── School news (unchanged logic) ─────────────────────────────────────
function SchoolNewsTab() {
  const { data: news = [], isLoading } = useNews();
  const [selected, setSelected] = useState<NewsItem | null>(null);

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-card rounded-xl overflow-hidden shadow-card">
              <Skeleton className="h-40 w-full" />
              <div className="p-4 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
            </div>
          ))}
        </div>
      ) : news.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-xl shadow-card">
          <Bell className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">No school news yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {news.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelected(item)}
              className="bg-card rounded-xl overflow-hidden shadow-card hover:shadow-elevated transition-all cursor-pointer group"
            >
              <div className="h-40 overflow-hidden bg-secondary">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="w-full h-full gradient-hero flex items-center justify-center"><Bell className="w-8 h-8 text-primary-foreground/40" /></div>
                )}
              </div>
              <div className="p-4">
                <p className="text-xs text-muted-foreground mb-1">{format(new Date(item.created_at), "dd MMM yyyy")}</p>
                <h3 className="font-semibold text-foreground text-sm line-clamp-2">{item.title}</h3>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-foreground/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelected(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={(e) => e.stopPropagation()} className="bg-card rounded-2xl shadow-elevated max-w-lg w-full max-h-[80vh] overflow-y-auto">
              {selected.image_url && <img src={selected.image_url} alt="" className="w-full h-48 object-cover rounded-t-2xl" />}
              <div className="p-6">
                <div className="flex justify-between items-start gap-3 mb-3">
                  <div>
                    <p className="text-xs text-muted-foreground">{format(new Date(selected.created_at), "dd MMMM yyyy")}</p>
                    <h2 className="text-xl font-heading font-bold text-foreground mt-1">{selected.title}</h2>
                  </div>
                  <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-secondary"><X className="w-4 h-4" /></button>
                </div>
                <p className="text-muted-foreground text-sm whitespace-pre-line">{selected.content || "No content."}</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── School news only (World News removed) ─────────────────────────────────────
const NewsTab = () => (
  <div className="space-y-4">
    <SchoolNewsTab />
  </div>
);

export default NewsTab;
    
