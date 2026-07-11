import { useState, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Search, GraduationCap, Trophy, Users, TrendingUp, Award, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useResults, useResultYears, getGradeFromPercentage, getGradeColor } from "@/hooks/useResults";
import { Skeleton } from "@/components/ui/skeleton";

const classes = ["6", "7", "8", "9", "10"];
const examTypes: Record<string, string[]> = {
  "6": ["1st Semester", "2nd Semester"],
  "7": ["1st Semester", "2nd Semester"],
  "8": ["1st Semester", "2nd Semester"],
  "9": ["Annual-I", "Annual-II"],
  "10": ["Annual-I", "Annual-II"],
};

const positionStyles = [
  { border: "border-[hsl(45,93%,47%)]", bg: "bg-[hsl(45,93%,47%)]/10", badge: "bg-[hsl(45,93%,47%)]", label: "🥇 1st" },
  { border: "border-[hsl(0,0%,75%)]", bg: "bg-[hsl(0,0%,75%)]/10", badge: "bg-[hsl(0,0%,75%)]", label: "🥈 2nd" },
  { border: "border-[hsl(30,60%,50%)]", bg: "bg-[hsl(30,60%,50%)]/10", badge: "bg-[hsl(30,60%,50%)]", label: "🥉 3rd" },
];

const ResultsTab = () => {
  const { profile } = useAuth();
  const [selectedClass, setSelectedClass] = useState(profile?.class || "6");
  const [selectedExam, setSelectedExam] = useState(examTypes[profile?.class || "6"][0]);
  const [selectedYear, setSelectedYear] = useState<number | undefined>();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSearch = (val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 300);
  };

  const { data: years = [] } = useResultYears();
  const { data: results = [], isLoading } = useResults({
    classFilter: selectedClass,
    examType: selectedExam,
    year: selectedYear,
    search: debouncedSearch,
  });

  const handleClassChange = (cls: string) => {
    setSelectedClass(cls);
    setSelectedExam(examTypes[cls][0]);
  };

  // Find student's own result
  const myResult = useMemo(() => {
    if (profile?.role !== "student" || !profile?.roll_number) return null;
    return results.find((r) => r.students?.roll_number === profile.roll_number) || null;
  }, [results, profile]);

  const stats = useMemo(() => {
    if (!results.length) return null;
    const total = results.length;
    const passed = results.filter((r) => r.is_pass).length;
    return { total, passed, failed: total - passed, passPct: (passed / total) * 100, avgPct: results.reduce((s, r) => s + (r.percentage || 0), 0) / total, highest: Math.max(...results.map((r) => r.obtained_marks)) };
  }, [results]);

  const top3 = results.filter((r) => r.position && r.position <= 3).sort((a, b) => (a.position || 99) - (b.position || 99));

  return (
    <div className="space-y-5">
      {/* Class tabs */}
      <div className="flex flex-wrap gap-2">
        {classes.map((c) => (
          <button key={c} onClick={() => handleClassChange(c)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${selectedClass === c ? "gradient-hero text-primary-foreground shadow-card" : "bg-card text-muted-foreground shadow-card hover:bg-secondary"}`}>
            Class {c}
          </button>
        ))}
      </div>

      {/* Exam sub-tabs + year */}
      <div className="flex flex-wrap items-center gap-2">
        {examTypes[selectedClass].map((exam) => (
          <button key={exam} onClick={() => setSelectedExam(exam)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${selectedExam === exam ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground shadow-card"}`}>
            {exam}
          </button>
        ))}
        {years.length > 0 && (
          <select value={selectedYear || ""} onChange={(e) => setSelectedYear(e.target.value ? Number(e.target.value) : undefined)} className="ml-auto rounded-lg border border-input bg-card px-2 py-1.5 text-sm shadow-card">
            <option value="">All Years</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
      </div>

      {/* Search */}
      <div className="max-w-xs">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={(e) => handleSearch(e.target.value)} placeholder="Search name or roll #..." className="w-full rounded-lg border border-input bg-card pl-9 pr-3 py-2 text-sm shadow-card focus:ring-2 focus:ring-ring outline-none" />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
          <Skeleton className="h-56 rounded-xl" />
        </div>
      ) : results.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-xl shadow-card">
          <GraduationCap className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No results found.</p>
        </div>
      ) : (
        <>
          {/* My Result (student only) */}
          {myResult && (
            <div className="bg-gradient-to-r from-primary/5 to-accent/5 border-2 border-primary/30 rounded-xl p-5">
              <h3 className="font-heading font-bold text-primary text-sm mb-3">📊 Your Result</h3>
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <p className="text-2xl font-heading font-extrabold text-foreground">{myResult.obtained_marks}/{myResult.total_marks}</p>
                  <p className="text-xs text-muted-foreground">Marks</p>
                </div>
                <div>
                  <p className="text-2xl font-heading font-extrabold text-primary">{(myResult.percentage || 0).toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground">Percentage</p>
                </div>
                <span className={`text-sm font-bold px-3 py-1 rounded-full ${getGradeColor(myResult.grade || getGradeFromPercentage(myResult.percentage || 0))}`}>
                  {myResult.grade || getGradeFromPercentage(myResult.percentage || 0)}
                </span>
                {myResult.position && <span className="text-sm font-bold text-foreground">Rank #{myResult.position}</span>}
                <span className={`text-sm font-bold px-3 py-1 rounded-full ${myResult.is_pass ? "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]" : "bg-destructive/15 text-destructive"}`}>
                  {myResult.is_pass ? "PASS ✓" : "FAIL ✗"}
                </span>
              </div>
            </div>
          )}

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {[
                { icon: Users, label: "Total", value: stats.total },
                { icon: Award, label: "Passed", value: `${stats.passed} (${stats.passPct.toFixed(0)}%)` },
                { icon: XCircle, label: "Failed", value: stats.failed },
                { icon: TrendingUp, label: "Avg", value: `${stats.avgPct.toFixed(1)}%` },
                { icon: Trophy, label: "Highest", value: stats.highest },
              ].map((s) => (
                <div key={s.label} className="bg-card rounded-lg p-3 shadow-card text-center">
                  <s.icon className="w-4 h-4 text-primary mx-auto mb-0.5" />
                  <div className="text-sm font-heading font-bold text-foreground">{s.value}</div>
                  <div className="text-[10px] text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Top 3 */}
          {top3.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {top3.map((r, i) => {
                const style = positionStyles[i];
                const grade = r.grade || getGradeFromPercentage(r.percentage || 0);
                return (
                  <div key={r.id} className={`bg-card rounded-xl p-4 shadow-card border-2 ${style.border} ${style.bg} text-center`}>
                    <span className={`inline-block text-xs font-bold ${style.badge} text-white px-2.5 py-0.5 rounded-full mb-2`}>{style.label}</span>
                    <h4 className="font-heading font-bold text-foreground text-sm">{r.students?.full_name || "Unknown"}</h4>
                    <p className="text-lg font-heading font-extrabold text-primary mt-1">{r.obtained_marks}/{r.total_marks}</p>
                    <p className="text-xs text-muted-foreground">{(r.percentage || 0).toFixed(1)}%</p>
                    <span className={`inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-full ${getGradeColor(grade)}`}>{grade}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Table */}
          <div className="bg-card rounded-xl shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="gradient-hero text-primary-foreground">
                    <th className="px-3 py-2.5 text-left font-medium">#</th>
                    <th className="px-3 py-2.5 text-left font-medium">Name</th>
                    <th className="px-3 py-2.5 text-left font-medium">Roll</th>
                    <th className="px-3 py-2.5 text-left font-medium">Marks</th>
                    <th className="px-3 py-2.5 text-left font-medium">%</th>
                    <th className="px-3 py-2.5 text-left font-medium">Grade</th>
                    <th className="px-3 py-2.5 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => {
                    const grade = r.grade || getGradeFromPercentage(r.percentage || 0);
                    const isMe = myResult?.id === r.id;
                    return (
                      <tr key={r.id} className={`border-t border-border hover:bg-secondary/50 ${i % 2 === 1 ? "bg-secondary/20" : ""} ${isMe ? "bg-primary/5 font-semibold" : ""}`}>
                        <td className="px-3 py-2">{r.position || i + 1}</td>
                        <td className="px-3 py-2 text-foreground">{r.students?.full_name || "Unknown"}{isMe && " ⭐"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.students?.roll_number}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.obtained_marks}/{r.total_marks}</td>
                        <td className="px-3 py-2 text-foreground">{(r.percentage || 0).toFixed(1)}%</td>
                        <td className="px-3 py-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getGradeColor(grade)}`}>{grade}</span></td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.is_pass ? "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]" : "bg-destructive/15 text-destructive"}`}>
                            {r.is_pass ? "Pass" : "Fail"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ResultsTab;
