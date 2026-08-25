import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, ChevronDown, ChevronUp, Bell } from "lucide-react";
import { useNotices } from "@/hooks/useNotices";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

const tabs = ["All", "Urgent", "General", "Academic", "Events"];

const NoticesTab = () => {
  const { data: allNotices = [], isLoading } = useNotices();
  const [activeTab, setActiveTab] = useState("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = allNotices.filter((n) => {
    if (activeTab === "All") return true;
    if (activeTab === "Urgent") return n.is_urgent;
    return n.category === activeTab;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab ? "bg-accent text-accent-foreground" : "bg-card text-muted-foreground hover:bg-secondary shadow-card"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)
          : filtered.map((n) => (
              <div
                key={n.id}
                onClick={() => setExpandedId(expandedId === n.id ? null : n.id)}
                className={`bg-card rounded-xl shadow-card border-l-4 cursor-pointer ${
                  n.is_urgent ? "border-l-destructive" : "border-l-primary"
                }`}
              >
                <div className="p-4 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {n.is_urgent && (
                        <span className="text-xs font-semibold bg-destructive/10 text-destructive px-2 py-0.5 rounded-full">URGENT</span>
                      )}
                      <span className="text-xs font-medium bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">{n.category}</span>
                    </div>
                    <h3 className="font-semibold text-foreground text-sm">{n.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{format(new Date(n.created_at), "dd MMM yyyy")}</p>
                  </div>
                  {n.content && (expandedId === n.id ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />)}
                </div>
                <AnimatePresence>
                  {expandedId === n.id && n.content && (
                    <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                      <div className="px-4 pb-4 text-sm text-muted-foreground border-t border-border pt-3">{n.content}</div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
      </div>

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-12 bg-card rounded-xl shadow-card">
          <Bell className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">No notices found.</p>
        </div>
      )}
    </div>
  );
};

export default NoticesTab;
