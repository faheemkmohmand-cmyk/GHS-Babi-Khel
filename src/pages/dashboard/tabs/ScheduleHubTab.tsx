// Combined Schedule tab: Timetable + Exam Schedule
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Calendar, CalendarCheck } from "lucide-react";
import TimetableTab from "./TimetableTab";

// ExamScheduleTab is defined inline in UserDashboard, so we import it dynamically
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
// ExamScheduleTab is exported from UserDashboard as an inline component,
// so we re-implement a thin wrapper that pulls the tab from UserDashboard's tabComponents
// Instead, accept it as a prop so UserDashboard can pass it cleanly
const ScheduleHubTab = ({ ExamScheduleTab }: { ExamScheduleTab: React.ComponentType<any> }) => (
  <div className="space-y-4">
    <div>
      <h2 className="text-xl font-heading font-bold text-foreground">Schedule</h2>
      <p className="text-sm text-muted-foreground mt-0.5">Class timetable and exam schedule</p>
    </div>
    <Tabs defaultValue="timetable" className="w-full">
      <TabsList className="w-full grid grid-cols-2 sm:inline-flex sm:w-auto">
        <TabsTrigger value="timetable" className="gap-1.5 text-xs sm:text-sm">
          <Calendar className="w-3.5 h-3.5" /><span>Timetable</span>
        </TabsTrigger>
        <TabsTrigger value="exam" className="gap-1.5 text-xs sm:text-sm">
          <CalendarCheck className="w-3.5 h-3.5" /><span>Exam Schedule</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="timetable" className="mt-4"><TimetableTab /></TabsContent>
      <TabsContent value="exam" className="mt-4"><ExamScheduleTab /></TabsContent>
    </Tabs>
  </div>
);

export default ScheduleHubTab;
