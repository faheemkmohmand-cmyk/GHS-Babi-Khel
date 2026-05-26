import { useState, lazy, Suspense, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import AdminLayout from "@/components/layout/AdminLayout";
import { Skeleton } from "@/components/ui/skeleton";

const AdminOverview          = lazy(() => import("./tabs/AdminOverview"));
const AdminSchoolSettings    = lazy(() => import("./tabs/AdminSchoolSettings"));
const AdminTeachers          = lazy(() => import("./tabs/AdminTeachers"));
const AdminStudents          = lazy(() => import("./tabs/AdminStudents"));
const AdminResults           = lazy(() => import("./tabs/AdminResults"));
const AdminAttendance        = lazy(() => import("./tabs/AdminAttendance"));
const AdminTimetables        = lazy(() => import("./tabs/AdminTimetables"));
const AdminAnnouncements     = lazy(() => import("./tabs/AdminAnnouncements"));
const AdminLibrary           = lazy(() => import("./tabs/AdminLibrary"));
const AdminExamRollNumbers   = lazy(() => import("./tabs/AdminExamRollNumbers"));
const AdminVideos            = lazy(() => import("./tabs/AdminVideos"));
const AdminNotes             = lazy(() => import("../notes/AdminNotes"));
// ── New feature admin tabs ──
const AdminExtras            = lazy(() => import("./tabs/AdminExtras"));
const AdminOnlineClasses     = lazy(() => import("./tabs/AdminOnlineClasses") as any);
const AdminSiteAnalytics     = lazy(() => import("./tabs/AdminSiteAnalytics"));
const AdminAdmissions        = lazy(() => import("./tabs/AdminAdmissions"));
const AdminFinance           = lazy(() => import("./tabs/AdminFinance"));
const AdminSchoolAnalytics   = lazy(() => import("../dashboard/tabs/SchoolAnalyticsTab"));
// ── Student Credentials (ID Cards + Monitor Pass) ──
const AdminStudentCredentials = lazy(() => import("./tabs/AdminStudentCredentials"));

const tabMap: Record<string, React.LazyExoticComponent<React.ComponentType<any>>> = {
  overview:           AdminOverview,
  "analytics":        AdminSchoolAnalytics,
  "site-analytics":   AdminSiteAnalytics,
  settings:           AdminSchoolSettings,
  teachers:           AdminTeachers,
  students:           AdminStudents,
  results:            AdminResults,
  attendance:         AdminAttendance,
  timetables:         AdminTimetables,
  announcements:      AdminAnnouncements,
  library:            AdminLibrary,
  "exam-rolls":       AdminExamRollNumbers,
  notes:              AdminNotes,
  videos:             AdminVideos,
  extras:             AdminExtras,
  "online-classes":   AdminOnlineClasses,
  admissions:         AdminAdmissions,
  finance:            AdminFinance,
  // "id-cards" now lives inside credentials
  "credentials":      AdminStudentCredentials,
};

const Fallback = () => (
  <div className="space-y-4">
    <Skeleton className="h-8 w-48" />
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
    </div>
    <Skeleton className="h-64 rounded-xl" />
  </div>
);

const AdminDashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Derive activeTab purely from URL — no local useState so back/forward
  // navigation and refresh always show the correct tab without desync.
  const urlTab = searchParams.get("tab");
  const activeTab = urlTab && tabMap[urlTab] ? urlTab : "overview";

  const setActiveTab = useCallback((tab: string) => {
    // replace: true keeps the browser history clean — back button goes to
    // wherever the user came from before the dashboard, not to a previous tab.
    setSearchParams({ tab }, { replace: true });
  }, [setSearchParams]);

  const ActiveComponent = tabMap[activeTab] || AdminOverview;

  return (
    <AdminLayout activeTab={activeTab} onTabChange={setActiveTab}>
      <Suspense fallback={<Fallback />}>
        <ActiveComponent />
      </Suspense>
    </AdminLayout>
  );
};

export default AdminDashboard;
  
