// src/pages/dashboard/tabs/HonorRollTab.tsx
// Student view: Student of the Month / Honor Roll

import { useState } from "react";
import { useHonorRoll } from "@/hooks/useNewFeatures";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy } from "lucide-react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const currentYear = new Date().getFullYear();
const years = Array.from({ length: 3 }, (_, i) => currentYear - i);

export default function HonorRollTab() {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const { data: entries = [], isLoading } = useHonorRoll(year, month);

  // Group by class
  const byClass = entries.reduce((acc, e) => {
    if (!acc[e.class]) acc[e.class] = [];
    acc[e.class].push(e);
    return acc;
  }, {} as Record<string, typeof entries>);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
          <Trophy className="w-5 h-5 text-blue-500" /> Honor Roll
        </h2>
        <p className="text-xs text-muted-foreground">Students of the Month</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {MONTHS.map((m, i) => (
          <button key={m} onClick={() => setMonth(i + 1)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${month === i + 1 ? "bg-blue-500 text-white" : "bg-secondary text-secondary-foreground"}`}>
            {m.slice(0, 3)}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        {years.map((y) => (
          <button key={y} onClick={() => setYear(y)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${year === y ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
            {y}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-card rounded-2xl p-10 text-center shadow-card">
          <Trophy className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No honor roll announced for {MONTHS[month - 1]} {year} yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byClass).sort((a, b) => Number(a[0]) - Number(b[0])).map(([cls, students]) => (
            <div key={cls}>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Class {cls}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {students.map((e) => (
                  <div key={e.id} className="bg-card rounded-2xl border border-border p-4 text-center shadow-sm hover:shadow-md transition-shadow">
                    {e.photo_url ? (
                      <img src={e.photo_url} alt={e.student_name} className="w-16 h-16 rounded-full object-cover mx-auto mb-2 border-2 border-blue-400" />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-orange-500 flex items-center justify-center text-white font-black text-2xl mx-auto mb-2">
                        {e.student_name[0]}
                      </div>
                    )}
                    <p className="text-sm font-bold text-foreground">{e.student_name}</p>
                    <p className="text-xs text-muted-foreground">Class {e.class}</p>
                    {e.reason && (
                      <p className="text-[10px] text-muted-foreground mt-1.5 italic line-clamp-2">"{e.reason}"</p>
                    )}
                    <div className="mt-2">
                      <span className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400 px-2 py-0.5 rounded-full font-semibold">
                        🏅 {MONTHS[e.month - 1]} {e.year}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
