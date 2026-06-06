import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Home, Calendar, BarChart3, Bell, BookOpen, Image, Trophy,
  Users, User, LogOut, GraduationCap, Menu, X, Shield, ExternalLink, Moon, Sun,
  Video, BookMarked, TrendingUp, Search, CreditCard, Sparkles
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import NotificationBell from "@/components/shared/NotificationBell";
import { useDarkMode } from "@/hooks/useDarkMode";

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
}

const navItems: NavItem[] = [
  { id: "overview",       label: "Overview",         icon: Home,        color: "#3b82f6" }, // blue
  { id: "timetable",      label: "Schedule",         icon: Calendar,    color: "#8b5cf6" }, // violet
  { id: "results",        label: "Results",          icon: BarChart3,   color: "#f59e0b" }, // amber
  { id: "merit-list",     label: "Merit List",       icon: Trophy,      color: "#eab308" }, // yellow
  { id: "notices",        label: "Notices & News",   icon: Bell,        color: "#f97316" }, // orange
  { id: "notes",          label: "Notes Manager",    icon: BookMarked,  color: "#06b6d4" }, // cyan
  { id: "library",        label: "Library",          icon: BookOpen,    color: "#10b981" }, // emerald
  { id: "gallery",        label: "Media",            icon: Image,       color: "#ec4899" }, // pink
  { id: "online-classes", label: "Online Classes",   icon: Video,       color: "#ef4444" }, // red
  { id: "analytics",      label: "Analytics",        icon: TrendingUp,  color: "#14b8a6" }, // teal
  { id: "credentials",    label: "Credentials",      icon: CreditCard,  color: "#6366f1" }, // indigo
  { id: "teachers",       label: "Teachers",         icon: Users,       color: "#0ea5e9" }, // sky
  { id: "extra",          label: "Extra",            icon: Sparkles,    color: "#a855f7" }, // purple
  { id: "profile",        label: "My Profile",       icon: User,        color: "#84cc16" }, // lime
];

/** Flatten navItems for finding label by activeTab id */
function findLabel(items: NavItem[], tabId: string): string | undefined {
  return items.find(item => item.id === tabId)?.label;
}

interface DashboardLayoutProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  children: React.ReactNode;
}

const DashboardLayout = ({ activeTab, onTabChange, children }: DashboardLayoutProps) => {
  const { profile, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();
  const { isDark, toggle } = useDarkMode();

  // Deep search index: sub-features inside merged hub tabs
  const searchIndex: { label: string; sublabel?: string; tabId: string }[] = [
    ...navItems.map((item) => ({ label: item.label, tabId: item.id })),
    // credentials hub
    { label: "ID Cards",       sublabel: "Credentials",  tabId: "credentials" },
    { label: "Monitor Pass",   sublabel: "Credentials",  tabId: "credentials" },
    { label: "Duty",           sublabel: "Credentials",  tabId: "credentials" },
    { label: "Student ID",     sublabel: "Credentials",  tabId: "credentials" },
    { label: "Notices",        sublabel: "Notices & News", tabId: "notices" },
    { label: "News",           sublabel: "Notices & News", tabId: "notices" },
    // results hub
    { label: "Results",        sublabel: "Results Hub",    tabId: "results" },
    { label: "Exam Roll Numbers", sublabel: "Results Hub", tabId: "results" },
    { label: "Result Card",    sublabel: "Results Hub",    tabId: "results" },
    // schedule hub
    { label: "Timetable",      sublabel: "Schedule Hub",   tabId: "timetable" },
    { label: "Exam Schedule",  sublabel: "Schedule Hub",   tabId: "timetable" },
    // media hub
    { label: "Gallery",        sublabel: "Media",          tabId: "gallery" },
    { label: "Videos",         sublabel: "Media",          tabId: "gallery" },
    { label: "Achievements",   sublabel: "Media",          tabId: "gallery" },
    { label: "Honor Roll",     sublabel: "Media",          tabId: "gallery" },
    // notes hub
    { label: "Notes",          sublabel: "Notes Manager",  tabId: "notes" },
    { label: "MCQ Tests",      sublabel: "Notes Manager",  tabId: "notes" },
    { label: "Daily Quiz",     sublabel: "Notes Manager",  tabId: "notes" },
    // extra hub
    { label: "ISS Tracker",    sublabel: "Extra",          tabId: "extra" },
    { label: "ISS Live",       sublabel: "Extra",          tabId: "extra" },
    { label: "NASA",           sublabel: "Extra",          tabId: "extra" },
    { label: "Space Picture",  sublabel: "Extra",          tabId: "extra" },
    { label: "Astronomy",      sublabel: "Extra",          tabId: "extra" },
    // library hub
    { label: "School Files",   sublabel: "Library",        tabId: "library" },
    { label: "Virtual Library", sublabel: "Library",       tabId: "library" },
    { label: "Free Books",     sublabel: "Library",        tabId: "library" },
    { label: "Ebooks",         sublabel: "Library",        tabId: "library" },
    { label: "Gutenberg",      sublabel: "Library",        tabId: "library" },
    { label: "Open Library",   sublabel: "Library",        tabId: "library" },
  ];

  const searchResults = searchQuery.trim()
    ? searchIndex.filter((entry) =>
        entry.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.sublabel?.toLowerCase().includes(searchQuery.toLowerCase())
      ).reduce<typeof searchIndex>((acc, entry) => {
        if (!acc.find((e) => e.label === entry.label && e.tabId === entry.tabId)) acc.push(entry);
        return acc;
      }, [])
    : null;

  const filteredNavItems = searchResults
    ? navItems.filter((item) => searchResults.some((r) => r.tabId === item.id))
    : navItems;

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const handleTabChange = (tabId: string) => {
    onTabChange(tabId);
    setSidebarOpen(false);
  };

  const initials = profile?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "U";

  const renderNavItem = (item: NavItem, isMobile = false) => (
    <button
      key={item.id}
      onClick={() => handleTabChange(item.id)}
      className={`w-full flex items-center gap-3 px-3 ${isMobile ? 'py-2.5' : 'py-2'} rounded-lg text-sm font-medium transition-colors ${
        activeTab === item.id
          ? "bg-primary text-primary-foreground"
          : "hover:bg-secondary"
      }`}
    >
      <item.icon
        className="w-4 h-4 shrink-0"
        style={{ color: activeTab === item.id ? 'currentColor' : item.color }}
      />
      <span className={activeTab === item.id ? "" : "text-muted-foreground"}>
        {item.label}
      </span>
    </button>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-card border-r border-border shrink-0 sticky top-0 h-screen">
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
              <img src={profile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" loading="lazy" />
            ) : (
              <div className="w-10 h-10 rounded-full gradient-accent flex items-center justify-center text-primary-foreground text-sm font-bold">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{profile?.full_name || "User"}</p>
              <span className="inline-block text-xs font-medium capitalize bg-primary/10 text-primary px-2 py-0.5 rounded-full mt-0.5">
                {profile?.role || "user"}
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

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {searchResults !== null ? (
            searchResults.length > 0 ? searchResults.map((result) => {
              const navItem = navItems.find((n) => n.id === result.tabId)!;
              return (
                <button
                  key={result.label + result.tabId}
                  onClick={() => handleTabChange(result.tabId)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === result.tabId
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  <navItem.icon className="w-4 h-4 shrink-0" style={activeTab !== result.tabId ? { color: navItem.color } : undefined} />
                  <span className="flex-1 text-left">
                    {result.label}
                    {result.sublabel && (
                      <span className="block text-[10px] opacity-60 font-normal">{result.sublabel}</span>
                    )}
                  </span>
                </button>
              );
            }) : <p className="text-xs text-muted-foreground text-center py-4">No results found</p>
          ) : navItems.map((item) => renderNavItem(item, false))}
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
          {(profile?.role === "teacher") && (
            <Link
              to="/teacher"
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
            >
              <Shield className="w-4 h-4" />
              Teacher Panel
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
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-40 h-14 bg-card border-b border-border flex items-center px-4 gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-lg hover:bg-secondary text-foreground"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="font-heading font-semibold text-foreground capitalize">
            {findLabel(navItems, activeTab) || "Dashboard"}
          </h1>
          <div className="ml-auto flex items-center gap-2">
            {/* Header search toggle */}
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
            <NotificationBell />
            <button
              onClick={toggle}
              className="p-2 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button onClick={() => onTabChange("profile")} className="p-1">
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
        <main className="flex-1 p-4 md:p-6 pb-20 lg:pb-6">{children}</main>
      </div>

      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border">
        <div className="flex items-center justify-around py-1">
          {navItems.slice(0, 4).map((item) => (
            <button
              key={item.id}
              onClick={() => handleTabChange(item.id)}
              className={`flex flex-col items-center gap-0.5 p-2 min-w-[3rem] ${
                activeTab === item.id ? "text-primary" : ""
              }`}
            >
              <item.icon
                className="w-5 h-5"
                style={{ color: activeTab === item.id ? undefined : item.color }}
              />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          ))}
          {/* Main Website button */}
          <Link
            to="/"
            className="flex flex-col items-center gap-0.5 p-2 min-w-[3rem] text-primary"
          >
            <ExternalLink className="w-5 h-5" />
            <span className="text-[10px] font-medium">Website</span>
          </Link>
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex flex-col items-center gap-0.5 p-2 min-w-[3rem] text-muted-foreground"
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-foreground/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-72 bg-card h-full shadow-elevated flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <span className="font-heading font-bold text-foreground">Menu</span>
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
                      onClick={() => handleTabChange(result.tabId)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        activeTab === result.tabId
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      <navItem.icon className="w-4 h-4 shrink-0" style={activeTab !== result.tabId ? { color: navItem.color } : undefined} />
                      <span className="flex-1 text-left">
                        {result.label}
                        {result.sublabel && (
                          <span className="block text-[10px] opacity-60 font-normal">{result.sublabel}</span>
                        )}
                      </span>
                    </button>
                  );
                }) : <p className="text-xs text-muted-foreground text-center py-4">No results found</p>
              ) : navItems.map((item) => renderNavItem(item, true))}
            </nav>
            <div className="p-3 border-t border-border space-y-1">
              <Link
                to="/"
                onClick={() => setSidebarOpen(false)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary"
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

export default DashboardLayout;
