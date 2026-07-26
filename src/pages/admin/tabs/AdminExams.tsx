// src/pages/admin/tabs/AdminExams.tsx
// "Exams" hub — combines the three previously-separate admin tabs:
//   1. Exam Roll Numbers  (was its own sidebar item: "exam-rolls")
//   2. Exam Seating        (was its own sidebar item: "exam-seating", itself already
//                            nested Seating Plans / Live Console internally)
//   3. Exam Date Sheet     (was buried inside "Extras" — now its own advanced manager)
// This mirrors the same pill-toggle pattern AdminExamSeating already used internally
// for Seating Plans vs Live Console.

import { useState } from "react";
import { Hash, LayoutGrid, Calendar } from "lucide-react";
import AdminExamRollNumbers from "./AdminExamRollNumbers";
import AdminExamSeating from "./AdminExamSeating";
import AdminExamSchedule from "./AdminExamSchedule";

type ExamTopTab = "rolls" | "seating" | "schedule";

const AdminExams = () => {
  const [topTab, setTopTab] = useState<ExamTopTab>("schedule");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl md:text-2xl font-heading font-bold text-foreground">Exams</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Date sheets, roll numbers, and seating plans — everything exam-related in one place</p>
      </div>

      <div className="flex gap-1 bg-secondary/50 rounded-xl p-1 flex-wrap sm:flex-nowrap">
        <button onClick={() => setTopTab("schedule")}
          className={`flex-1 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${
            topTab === "schedule" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}>
          <Calendar className="w-3.5 h-3.5" /> Date Sheet
        </button>
        <button onClick={() => setTopTab("rolls")}
          className={`flex-1 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${
            topTab === "rolls" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}>
          <Hash className="w-3.5 h-3.5" /> Roll Numbers
        </button>
        <button onClick={() => setTopTab("seating")}
          className={`flex-1 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${
            topTab === "seating" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}>
          <LayoutGrid className="w-3.5 h-3.5" /> Seating
        </button>
      </div>

      {topTab === "schedule" && <AdminExamSchedule />}
      {topTab === "rolls" && <AdminExamRollNumbers />}
      {topTab === "seating" && <AdminExamSeating />}
    </div>
  );
};

export default AdminExams;
