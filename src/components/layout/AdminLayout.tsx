import { useState, useCallback, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogOut, Menu, X, ExternalLink, Moon, Sun, Search, GraduationCap, BarChart2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useDarkMode } from "@/hooks/useDarkMode";

// ── Emoji icon component ──────────────────────────────────────────────────────
const EmojiIcon = ({ emoji, size = "w-5 h-5" }: { emoji: string; size?: string }) => (
  <span className={`${size} flex items-center justify-center text-base leading-none select-none`} aria-hidden>
    {emoji}
  </span>
);

// ── Nav structure with sections ───────────────────────────────────────────────
interface NavItem {
  id: string;
  label: string;
  emoji: string;
  lucideIcon?: React.ElementType;
  lucideColor?: string;
}
interface NavSection {
  heading: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    heading: "OVERVIEW",
    items: [
      { id: "overview",         label: "Overview",              emoji: "📊" },
      { id: "settings",         label: "School Settings",       emoji: "⚙️" },
      { id: "site-analytics",   label: "Site Analytics",        emoji: "📈",
        lucideIcon: BarChart2,  lucideColor: "text-violet-500" },
    ],
  },
  {
    heading: "STUDENTS",
    items: [
      { id: "students",     label: "Manage Students",     emoji: "🎓" },
      { id: "admissions",   label: "Admissions",          emoji: "📋" },
      { id: "results",      label: "Manage Results",      emoji: "📝" },
      { id: "attendance",   label: "Attendance",          emoji: "✅" },
      { id: "exam-rolls",   label: "Exam Roll Numbers",   emoji: "🔢" },
      { id: "credentials",  label: "Student Credentials", emoji: "🪪" },
      { id: "fees",          label: "Fee Management",       emoji: "💰" },
    ],
  },
  {
    heading: "SCHOOL",
    items: [
      { id: "teachers",      label: "Manage Teachers",   emoji: "👨‍🏫" },
      { id: "timetables",    label: "Timetables",        emoji: "📅" },
      { id: "events",        label: "Event Calendar",    emoji: "🗓️" },
      { id: "announcements", label: "Announcements",     emoji: "📢" },
      { id: "library",       label: "Library",           emoji: "📚" },
      { id: "online-classes",label: "Online Classes",    emoji: "💻" },
    ],
  },
  {
    heading: "CONTENT",
    items: [
      { id: "notes",   label: "Notes Manager",    emoji: "📓" },
      { id: "videos",  label: "Videos & Gallery", emoji: "🎬" },
      { id: "extras",  label: "Extras",           emoji: "⭐" },
    ],
  },
];

// Flat list for searching
const allNavItems: NavItem[] = navSections.flatMap(s => s.items);

// First few items for the mobile bottom bar quick-access row
const bottomBarItems: NavItem[] = allNavItems.slice(0, 4);

// Deep search index
const searchIndex: { label: string; sublabel?: string; tabId: string }[] = [
  ...allNavItems.map(item => ({ label: item.label, tabId: item.id })),
  { label: "Analytics",         sublabel: "Site Analytics",          tabId: "site-analytics" },
  { label: "Page Views",        sublabel: "Site Analytics",          tabId: "site-analytics" },
  { label: "Visitors",          sublabel: "Site Analytics",          tabId: "site-analytics" },
  { label: "Notices",          sublabel: "Announcements",        tabId: "announcements" },
  { label: "Exam Dates",       sublabel: "Event Calendar",       tabId: "events" },
  { label: "Holidays",         sublabel: "Event Calendar",       tabId: "events" },
  { label: "PTM",              sublabel: "Event Calendar",       tabId: "events" },
  { label: "Sports Day",       sublabel: "Event Calendar",       tabId: "events" },
  { label: "Results Day",      sublabel: "Event Calendar",       tabId: "events" },
  { label: "News",             sublabel: "Announcements",        tabId: "announcements" },
  { label: "Achievements",     sublabel: "Announcements",        tabId: "announcements" },
  { label: "Merit List",       sublabel: "Announcements",        tabId: "announcements" },
  { label: "Videos",           sublabel: "Videos & Gallery",     tabId: "videos" },
  { label: "Gallery",          sublabel: "Videos & Gallery",     tabId: "videos" },
  { label: "YouTube",          sublabel: "Videos & Gallery",     tabId: "videos" },
  { label: "Daily Quotes",     sublabel: "Extras",               tabId: "extras" },
  { label: "Honor Roll",       sublabel: "Extras",               tabId: "extras" },
  { label: "Exam Schedule",    sublabel: "Extras",               tabId: "extras" },
  { label: "Users",            sublabel: "Extras",               tabId: "extras" },
  { label: "Mark Attendance",  sublabel: "Attendance",           tabId: "attendance" },
  { label: "Monthly Report",   sublabel: "Attendance",           tabId: "attendance" },
  { label: "Upload Results",   sublabel: "Manage Results",       tabId: "results" },
  { label: "Marksheet",        sublabel: "Manage Results",       tabId: "results" },
  { label: "Class Timetable",  sublabel: "Timetables",           tabId: "timetables" },
  { label: "Exam Timetable",   sublabel: "Timetables",           tabId: "timetables" },
  { label: "Student ID Cards", sublabel: "Student Credentials",  tabId: "credentials" },
  { label: "Monitor Pass",     sublabel: "Student Credentials",  tabId: "credentials" },
  { label: "Hall Pass",        sublabel: "Student Credentials",  tabId: "credentials" },
  { label: "School Files",     sublabel: "Library",              tabId: "library" },
  { label: "Virtual Library",  sublabel: "Library",              tabId: "library" },
  { label: "Free Books",       sublabel: "Library",              tabId: "library" },
  { label: "Fee Structures",   sublabel: "Fee Management",       tabId: "fees" },
  { label: "Fee Vouchers",     sublabel: "Fee Management",       tabId: "fees" },
  { label: "Payments",         sublabel: "Fee Management",       tabId: "fees" },
  { label: "Fee Reports",      sublabel: "Fee Management",       tabId: "fees" },
  { label: "Defaulters List",  sublabel: "Fee Management",       tabId: "fees" },
];

interface AdminLayoutProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  children: React.ReactNode;
}

const AdminLayout = ({ activeTab, onTabChange, children }: AdminLayoutProps) => {
  const { profile, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mobileNavRef = useRef<HTMLElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();
  const { isDark, toggle } = useDarkMode();

  useEffect(() => {
    if (!sidebarOpen) return;
    requestAnimationFrame(() => {
      const nav = mobileNavRef.current;
      if (!nav) return;
      const active = nav.querySelector('[data-active="true"]') as HTMLElement | null;
      if (active) {
        const top = active.offsetTop - nav.clientHeight / 2 + active.clientHeight / 2;
        nav.scrollTop = Math.max(0, top);
      }
    });
  }, [sidebarOpen]);

  const searchResults = searchQuery.trim()
    ? searchIndex.filter(e =>
        e.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.sublabel?.toLowerCase().includes(searchQuery.toLowerCase())
      ).reduce<typeof searchIndex>((acc, entry) => {
        if (!acc.find(e => e.tabId === entry.tabId && !e.sublabel)) acc.push(entry);
        else if (!acc.find(e => e.tabId === entry.tabId && e.label === entry.label)) acc.push(entry);
        return acc;
      }, [])
    : null;

  const handleSignOut = async () => { await signOut(); navigate("/"); };

  const initials = profile?.full_name
    ?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "A";

  // ── Single nav button ──
  const NavBtn = ({ item, onItemClick }: { item: NavItem; onItemClick?: () => void }) => {
    const isActive = activeTab === item.id;
    return (
      <button
        key={item.id}
        data-active={isActive ? "true" : "false"}
        onClick={() => { onTabChange(item.id); onItemClick?.(); }}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? "bg-primary text-primary-foreground shadow-sm"
            : "hover:bg-secondary text-foreground"
        }`}
      >
        {item.lucideIcon ? (
          <item.lucideIcon
            className={`w-5 h-5 shrink-0 ${isActive ? "text-primary-foreground" : item.lucideColor ?? "text-muted-foreground"}`}
          />
        ) : (
          <EmojiIcon emoji={item.emoji} size="w-5 h-5" />
        )}
        <span className="truncate">{item.label}</span>
      </button>
    );
  };

  // ── Full sectioned nav list ──
  const SectionedNav = ({ onItemClick }: { onItemClick?: () => void }) => {
    if (searchResults !== null) {
      if (searchResults.length === 0)
        return <p className="text-xs text-muted-foreground text-center py-4">No results found</p>;
      const matchedItems = allNavItems.filter(item => searchResults.some(r => r.tabId === item.id));
      return (
        <div className="space-y-0.5">
          {matchedItems.map(item => <NavBtn key={item.id} item={item} onItemClick={onItemClick} />)}
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {navSections.map(section => (
          <div key={section.heading}>
            <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase px-3 mb-1.5">
              {section.heading}
            </p>
            <div className="space-y-0.5">
              {section.items.map(item => <NavBtn key={item.id} item={item} onItemClick={onItemClick} />)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-[260px] bg-card border-r border-border shrink-0 sticky top-0 h-screen">
        <div className="p-4 border-b border-border">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 ring-1 ring-border">
              <img src="/icon-512.png" alt="GHS Babi Khel logo" className="w-full h-full object-cover" />
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
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <nav className="flex-1 p-3 overflow-y-auto">
          <SectionedNav />
        </nav>

        <div className="p-3 border-t border-border space-y-1">
          <Link to="/dashboard" className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors">
            <GraduationCap className="w-4 h-4" /> User Dashboard
          </Link>
          <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-40 h-14 bg-card border-b border-border flex items-center px-4 gap-3">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-secondary text-foreground">
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="font-heading font-semibold text-foreground">
            {allNavItems.find(n => n.id === activeTab)?.label || "Admin Dashboard"}
          </h1>
          <div className="ml-auto flex items-center gap-2">
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
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-8 pr-3 py-1.5 text-xs w-48 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <button onClick={() => { setSearchOpen(false); setSearchQuery(""); }} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button onClick={() => setSearchOpen(true)} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground transition-colors" title="Search sections">
                  <Search className="w-4 h-4" />
                </button>
              )}
            </div>
            <a href="/" className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-secondary transition-colors">
              <ExternalLink className="w-3.5 h-3.5" /> View Website
            </a>
            <button onClick={toggle} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground transition-colors" title={isDark ? "Switch to light mode" : "Switch to dark mode"}>
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={handleSignOut} className="flex items-center gap-1.5 text-xs font-medium text-destructive px-3 py-1.5 rounded-lg hover:bg-destructive/10 transition-colors">
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 pb-20 lg:pb-6">{children}</main>
      </div>

      {/* Mobile bottom bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border">
        <div className="flex items-center justify-around py-1">
          {bottomBarItems.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`flex flex-col items-center gap-0.5 p-2 min-w-[3rem] ${isActive ? "text-primary" : "text-muted-foreground"}`}
              >
                {item.lucideIcon ? (
                  <item.lucideIcon className={`w-5 h-5 ${isActive ? "text-primary" : item.lucideColor ?? "text-muted-foreground"}`} />
                ) : (
                  <span className="text-lg leading-none">{item.emoji}</span>
                )}
                <span className="text-[10px] font-medium truncate max-w-[3.5rem]">{item.label}</span>
              </button>
            );
          })}
          <button onClick={() => setSidebarOpen(true)} className="flex flex-col items-center gap-0.5 p-2 min-w-[3rem] text-muted-foreground">
            <Menu className="w-5 h-5" />
            <span className="text-[10px] font-medium">Menu</span>
          </button>
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-foreground/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-72 bg-card h-full shadow-xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 ring-1 ring-border">
                  <img src="/icon-512.png" alt="GHS Babi Khel logo" className="w-full h-full object-cover" />
                </div>
                <div>
                  <span className="font-heading font-bold text-foreground text-sm leading-tight block">GHS Babi Khel</span>
                  <p className="text-[10px] text-muted-foreground font-medium leading-tight">Admin Panel</p>
                </div>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="p-2 rounded-lg hover:bg-secondary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-3 py-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search menu..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <nav ref={mobileNavRef} className="flex-1 p-3 overflow-y-auto">
              <SectionedNav onItemClick={() => setSidebarOpen(false)} />
            </nav>
            <div className="p-3 border-t border-border space-y-1">
              <Link to="/" onClick={() => setSidebarOpen(false)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-primary hover:bg-primary/10 transition-colors">
                <ExternalLink className="w-4 h-4" /> Main Website
              </Link>
              <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10">
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLayout;




   
