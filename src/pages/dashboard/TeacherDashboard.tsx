import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Home, Calendar, BarChart3, Bell, Newspaper, BookOpen, Image, Trophy,
  Users, User, LogOut, GraduationCap, Menu, X, ExternalLink, Moon, Sun,
  Video, Hash, FileText, ClipboardList, Shield, MessageSquare, ClipboardCheck, ScanLine
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import NotificationBell from "@/components/shared/NotificationBell";
import { useDarkMode } from "@/hooks/useDarkMode";

// ── User dashboard tabs (view-only) ──
import OverviewTab      from "@/pages/dashboard/tabs/OverviewTab";
import NoticesTab       from "@/pages/dashboard/tabs/NoticesTab";
import NewsTab          from "@/pages/dashboard/tabs/NewsTab";
import LibraryTab       from "@/pages/dashboard/tabs/LibraryTab";
import GalleryTab       from "@/pages/dashboard/tabs/GalleryTab";
import VideosTab        from "@/pages/dashboard/tabs/VideosTab";
import AchievementsTab  from "@/pages/dashboard/tabs/AchievementsTab";
import TeachersTab      from "@/pages/dashboard/tabs/TeachersTab";
import ProfileTab       from "@/pages/dashboard/tabs/ProfileTab";
import RollNumbersTab   from "@/pages/dashboard/tabs/RollNumbersTab";
import ResultCardTab    from "@/pages/dashboard/tabs/ResultCardTab";
import ResultsTab       from "@/pages/dashboard/tabs/ResultsTab";
import TimetableTab     from "@/pages/dashboard/tabs/TimetableTab";

// ── Teacher-only tabs (edit access) ──
import TeacherOnlineClassesTab from "@/pages/dashboard/tabs/TeacherOnlineClassesTab";
import TeacherExamScanTab from "@/pages/dashboard/tabs/TeacherExamScanTab";
import AdminTimetables  from "@/pages/admin/tabs/AdminTimetables";
import AdminResults     from "@/pages/admin/tabs/AdminResults";
import AdminAttendance  from "@/pages/admin/tabs/AdminAttendance";
import AdminTests       from "@/pages/admin/tabs/AdminTests";

// Nav items visible to teachers
const navItems = [
  // ── View tabs (same as user dashboard) ──
  { id: "overview",        label: "Overview",        icon: Home,         section: "view"   },
  { id: "timetable",       label: "Timetable",       icon: Calendar,     section: "view"   },
  { id: "results",         label: "Results",         icon: BarChart3,    section: "view"   },
  { id: "exam-rolls",      label: "Exam Roll No",    icon: Hash,         section: "view"   },
  { id: "result-card",     label: "Result Card",     icon: FileText,     section: "view"   },
  { id: "notices",         label: "Notices",         icon: Bell,         section: "view"   },
  { id: "news",            label: "News",            icon: Newspaper,    section: "view"   },
  { id: "library",         label: "Library",         icon: BookOpen,     section: "view"   },
  { id: "gallery",         label: "Gallery",         icon: Image,        section: "view"   },
  { id: "videos",          label: "Videos",          icon: Video,        section: "view"   },
  { id: "achievements",    label: "Achievements",    icon: Trophy,       section: "view"   },
  { id: "teachers",        label: "Teachers",        icon: Users,        section: "view"   },
  { id: "profile",         label: "My Profile",      icon: User,         section: "view"   },
  // ── Teacher edit tabs ──
  { id: "edit-timetable",  label: "Edit Timetable",  icon: Calendar,     section: "edit"   },
  { id: "upload-results",  label: "Upload Results",  icon: BarChart3,    section: "edit"   },
  { id: "attendance",      label: "Attendance",      icon: ClipboardList,section: "edit"   },
  { id: "mcq-tests",       label: "MCQ Tests",       icon: ClipboardCheck,section: "edit"   },
  { id: "online-classes",  label: "Online Classes",  icon: Video,        section: "edit"   },
  { id: "exam-scan",       label: "Exam Attendance", icon: ScanLine,     section: "edit"   },
];

const tabComponents: Record<string, React.ComponentType<any>> = {
  overview:        OverviewTab,
  timetable:       TimetableTab,
  results:         ResultsTab,
  "exam-rolls":    RollNumbersTab,
  "result-card":   ResultCardTab,
  notices:         NoticesTab,
  news:            NewsTab,
  library:         LibraryTab,
  gallery:         GalleryTab,
  videos:          VideosTab,
  achievements:    AchievementsTab,
  teachers:        TeachersTab,
  profile:         ProfileTab,  "edit-timetable": AdminTimetables,
  "upload-results": AdminResults,
  attendance:       AdminAttendance,
  "mcq-tests":      AdminTests,
  "online-classes": TeacherOnlineClassesTab,
  "exam-scan":      TeacherExamScanTab,
};

const TeacherDashboard = () => {
  const { profile, signOut } = useAuth();
  const [activeTab, setActiveTab]   = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate  = useNavigate();
  const { isDark, toggle } = useDarkMode();

  const TabComponent = tabComponents[activeTab] || OverviewTab;

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const initials = profile?.full_name
    ?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "T";

  const viewItems = navItems.filter(n => n.section === "view");
  const editItems = navItems.filter(n => n.section === "edit");

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="p-4 border-b border-border">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg gradient-hero flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-heading font-bold text-foreground">GHS Babi Khel</span>
        </Link>
      </div>

      {/* Profile */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full gradient-accent flex items-center justify-center text-primary-foreground text-sm font-bold">
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{profile?.full_name || "Teacher"}</p>
            <span className="inline-block text-xs font-medium capitalize bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full mt-0.5">
              Teacher
            </span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 overflow-y-auto space-y-4">
        {/* View section */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-3 mb-1">Dashboard</p>
          <div className="space-y-0.5">
            {viewItems.map((item) => (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === item.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Teacher edit section */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 px-3 mb-1">Teacher Tools</p>
          <div className="space-y-0.5">
            {editItems.map((item) => (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === item.id
                    ? "bg-emerald-500 text-white"
                    : "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                }`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-border space-y-1">
        <Link
          to="/"
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          Main Website
        </Link>
        {profile?.role === "admin" && (
          <Link
            to="/admin"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-warning hover:bg-warning/10 transition-colors"
          >
            <Shield className="w-4 h-4" />
            Admin Panel
          </Link>
        )}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-card border-r border-border shrink-0 sticky top-0 h-screen">
        <SidebarContent />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-40 h-14 bg-card/80 backdrop-blur-xl border-b border-border flex items-center px-4 gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-lg hover:bg-secondary text-foreground"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="font-heading font-semibold text-foreground capitalize">
            {navItems.find((n) => n.id === activeTab)?.label || "Teacher Dashboard"}
          </h1>
          {/* Teacher badge in header */}
          <span className="hidden sm:inline-flex items-center text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full">
            Teacher Portal
          </span>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            <button
              onClick={toggle}
              className="p-2 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button onClick={() => setActiveTab("profile")} className="p-1">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full gradient-accent flex items-center justify-center text-primary-foreground text-xs font-bold">
                  {initials}
                </div>
              )}
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 md:p-6 pb-20 lg:pb-6">
          <TabComponent onNavigate={setActiveTab} />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-xl border-t border-border">
        <div className="flex items-center justify-around py-1">
          {[navItems[0], navItems[13], navItems[14], navItems[15]].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center gap-0.5 p-2 min-w-[3.5rem] ${
                activeTab === item.id ? "text-emerald-500" : "text-muted-foreground"
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[9px] font-medium leading-tight text-center">{item.label}</span>
            </button>
          ))}
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex flex-col items-center gap-0.5 p-2 min-w-[3.5rem] text-muted-foreground"
          >
            <Menu className="w-5 h-5" />
            <span className="text-[9px] font-medium">More</span>
          </button>
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-72 bg-card h-full shadow-elevated flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <span className="font-heading font-bold text-foreground">Teacher Menu</span>
              <button onClick={() => setSidebarOpen(false)} className="p-2 rounded-lg hover:bg-secondary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <SidebarContent />
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherDashboard;


            
