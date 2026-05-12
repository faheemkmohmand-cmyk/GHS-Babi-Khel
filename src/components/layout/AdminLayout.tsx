import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BarChart3, Settings, Users, GraduationCap, ClipboardList, CheckSquare,
  Calendar, Bell, BookOpen, LogOut,
  Menu, X, ExternalLink, Shield, Moon, Sun, Video, Hash,
  BookMarked, TrendingUp, Star, Globe, DollarSign, Search
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useDarkMode } from "@/hooks/useDarkMode";

const navItems = [
  { id: "overview",          label: "Overview",           icon: BarChart3      },
  { id: "settings",          label: "School Settings",    icon: Settings       },
  { id: "teachers",          label: "Manage Teachers",    icon: Users          },
  { id: "students",          label: "Manage Students",    icon: GraduationCap  },
  { id: "admissions",        label: "Admissions",         icon: GraduationCap  },
  { id: "results",           label: "Manage Results",     icon: ClipboardList  },
  { id: "attendance",        label: "Attendance",         icon: CheckSquare    },
  { id: "timetables",        label: "Timetables",         icon: Calendar       },
  { id: "announcements",     label: "Announcements",      icon: Bell           },
  { id: "library",           label: "Library",            icon: BookOpen       },
  { id: "exam-rolls",        label: "Exam Roll Numbers",  icon: Hash           },
  { id: "notes",             label: "Notes Manager",      icon: BookMarked     },
  { id: "videos",            label: "Videos & Gallery",   icon: Video          },
  { id: "online-classes",    label: "Online Classes",     icon: Video          },
  { id: "analytics",         label: "Analytics",          icon: TrendingUp     },
  { id: "extras",            label: "Extras",             icon: Star           },
  { id: "finance",           label: "Finance & Fees",     icon: DollarSign     },
  { id: "site-analytics",    label: "Site Analytics",     icon: Globe          },
];

interface AdminLayoutProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  children: React.ReactNode;
}

const AdminLayout = ({ activeTab, onTabChange, children }: AdminLayoutProps) => {
  const { profile, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();
  const { isDark, toggle } = useDarkMode();

  // Deep search index: every sub-feature maps to its parent nav tab
  const searchIndex: { label: string; sublabel?: string; tabId: string }[] = [
    // Direct nav items
    ...navItems.map((item) => ({ label: item.label, tabId: item.id })),
    // announcements sub-tabs
    { label: "Notices",        sublabel: "Announcements", tabId: "announcements" },
    { label: "News",           sublabel: "Announcements", tabId: "announcements" },
    { label: "Achievements",   sublabel: "Announcements", tabId: "announcements" },
    { label: "Merit List",     sublabel: "Announcements", tabId: "announcements" },
    // videos sub-tabs
    { label: "Videos",         sublabel: "Videos & Gallery", tabId: "videos" },
    { label: "Gallery",        sublabel: "Videos & Gallery", tabId: "videos" },
    { label: "YouTube",        sublabel: "Videos & Gallery", tabId: "videos" },
    // extras sub-tabs
    { label: "Daily Quotes",   sublabel: "Extras", tabId: "extras" },
    { label: "Quotes",         sublabel: "Extras", tabId: "extras" },
    { label: "Honor Roll",     sublabel: "Extras", tabId: "extras" },
    { label: "Exam Schedule",  sublabel: "Extras", tabId: "extras" },
    { label: "Users",          sublabel: "Extras", tabId: "extras" },
    // attendance sub-tabs
    { label: "Mark Attendance",   sublabel: "Attendance", tabId: "attendance" },
    { label: "Monthly Report",    sublabel: "Attendance", tabId: "attendance" },
    // results sub-tabs
    { label: "Upload Results",    sublabel: "Manage Results", tabId: "results" },
    { label: "Marksheet",         sublabel: "Manage Results", tabId: "results" },
    // timetables sub-tabs
    { label: "Class Timetable",   sublabel: "Timetables", tabId: "timetables" },
    { label: "Exam Timetable",    sublabel: "Timetables", tabId: "timetables" },
  ];

  const searchResults = searchQuery.trim()
    ? searchIndex.filter((entry) =>
        entry.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (entry.sublabel?.toLowerCase().includes(searchQuery.toLowerCase()))
      ).reduce<typeof searchIndex>((acc, entry) => {
        // deduplicate by tabId — keep first match per tab
        if (!acc.find((e) => e.tabId === entry.tabId && !e.sublabel)) {
          acc.push(entry);
        } else if (!acc.find((e) => e.tabId === entry.tabId && e.label === entry.label)) {
          acc.push(entry);
        }
        return acc;
      }, [])
    : null;

  // For sidebar nav rendering when not searching, just show normal navItems
  const filteredNavItems = searchResults
    ? navItems.filter((item) => searchResults.some((r) => r.tabId === item.id))
    : navItems;

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const initials = profile?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "A";

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-[260px] bg-card border-r border-border shrink-0 sticky top-0 h-screen">
        <div className="p-4 border-b border-border">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <span className="font-heading font-bold text-foreground text-sm">GHS Babi Khel</span>
              <p className="text-[10px] text-muted-foreground font-medium">Admin Panel</p>
            </div>
          </Link>
        </div>

        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-3">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{profile?.full_name || "Admin"}</p>
              <span className="inline-block text-[10px] font-semibold uppercase bg-primary text-primary-foreground px-2 py-0.5 rounded-full mt-0.5 tracking-wider">
                Administrator
              </span>
            </div>
          </div>
        </div>

        {/* Desktop Search */}
        <div className="px-3 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search menu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {searchResults !== null ? (
            searchResults.length > 0 ? searchResults.map((result) => {
              const navItem = navItems.find((n) => n.id === result.tabId)!;
              return (
                <button
                  key={result.label + result.tabId}
                  onClick={() => onTabChange(result.tabId)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === result.tabId
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  <navItem.icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-left">
                    {result.label}
                    {result.sublabel && (
                      <span className="block text-[10px] opacity-60 font-normal">{result.sublabel}</span>
                    )}
                  </span>
                </button>
              );
            }) : (
              <p className="text-xs text-muted-foreground text-center py-4">No results found</p>
            )
          ) : navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === item.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-border space-y-1">
          <Link
            to="/"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Main Website
          </Link>
          <Link
            to="/dashboard"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
          >
            <GraduationCap className="w-4 h-4" />
            User Dashboard
          </Link>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-40 h-14 bg-card/80 backdrop-blur-xl border-b border-border flex items-center px-4 gap-3">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-secondary text-foreground">
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="font-heading font-semibold text-foreground">
            {navItems.find((n) => n.id === activeTab)?.label || "Admin Dashboard"}
          </h1>
          <div className="ml-auto flex items-center gap-2">
            {/* Header search toggle for tablet/desktop */}
            <div className="hidden sm:flex items-center">
              {searchOpen ? (
                <div className="flex items-center gap-1">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      autoFocus
                      type="text"
                      placeholder="Search sections..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 pr-3 py-1.5 text-xs w-48 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <button
                    onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                    className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setSearchOpen(true)}
                  className="p-2 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
                  title="Search sections"
                >
                  <Search className="w-4 h-4" />
                </button>
              )}
            </div>
            <a
              href="/"
              className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-secondary transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View Website
            </a>
            <button
              onClick={toggle}
              className="p-2 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-xs font-medium text-destructive px-3 py-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 pb-20 lg:pb-6">{children}</main>
      </div>

      {/* Mobile bottom bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-xl border-t border-border">
        <div className="flex items-center justify-around py-1">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex flex-col items-center gap-0.5 p-2 min-w-[3.5rem] text-muted-foreground"
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px] font-medium">Menu</span>
          </button>
          <Link
            to="/"
            className="flex flex-col items-center gap-0.5 p-2 min-w-[3.5rem] text-primary"
          >
            <ExternalLink className="w-5 h-5" />
            <span className="text-[10px] font-medium">Website</span>
          </Link>
          <button
            onClick={handleSignOut}
            className="flex flex-col items-center gap-0.5 p-2 min-w-[3.5rem] text-destructive"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-[10px] font-medium">Sign Out</span>
          </button>
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-72 bg-card h-full shadow-xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <span className="font-heading font-bold text-foreground">Admin Menu</span>
              <button onClick={() => setSidebarOpen(false)} className="p-2 rounded-lg hover:bg-secondary">
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Mobile search */}
            <div className="px-3 py-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search menu..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
              {searchResults !== null ? (
                searchResults.length > 0 ? searchResults.map((result) => {
                  const navItem = navItems.find((n) => n.id === result.tabId)!;
                  return (
                    <button
                      key={result.label + result.tabId}
                      onClick={() => { onTabChange(result.tabId); setSidebarOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        activeTab === result.tabId
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                      }`}
                    >
                      <navItem.icon className="w-4 h-4 shrink-0" />
                      <span className="flex-1 text-left">
                        {result.label}
                        {result.sublabel && (
                          <span className="block text-[10px] opacity-60 font-normal">{result.sublabel}</span>
                        )}
                      </span>
                    </button>
                  );
                }) : (
                  <p className="text-xs text-muted-foreground text-center py-4">No results found</p>
                )
              ) : navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { onTabChange(item.id); setSidebarOpen(false); }}
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
            </nav>
            <div className="p-3 border-t border-border space-y-1">
              <Link
                to="/"
                onClick={() => setSidebarOpen(false)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Main Website
              </Link>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLayout;
        









    
