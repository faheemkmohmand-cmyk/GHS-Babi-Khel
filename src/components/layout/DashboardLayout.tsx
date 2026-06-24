import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogOut, Menu, X, ExternalLink, Moon, Sun, Search, Shield } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import NotificationBell from "@/components/shared/NotificationBell";
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
}
interface NavSection {
  heading: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    heading: "OVERVIEW",
    items: [
      { id: "overview",   label: "Overview",      emoji: "🏠" },
      { id: "profile",    label: "My Profile",    emoji: "👤" },
    ],
  },
  {
    heading: "STUDENTS",
    items: [
      { id: "results",     label: "Results",          emoji: "📝" },
      { id: "merit-list",  label: "Merit List",       emoji: "🏆" },
      { id: "credentials", label: "Credentials",      emoji: "🪪" },
      { id: "fees",        label: "Fee Status",       emoji: "💰" },
    ],
  },
  {
    heading: "SCHOOL",
    items: [
      { id: "timetable",      label: "Schedule",        emoji: "📅" },
      { id: "notices",        label: "Notices & News",  emoji: "📢" },
      { id: "teachers",       label: "Teachers",        emoji: "👨‍🏫" },
      { id: "online-classes", label: "Online Classes",  emoji: "💻" },
    ],
  },
  {
    heading: "LEARNING",
    items: [
      { id: "notes",       label: "Notes Manager",    emoji: "📓" },
      { id: "leaderboard", label: "Leaderboard",      emoji: "🏆" },
      { id: "library",     label: "Library",           emoji: "📚" },
      { id: "gallery",     label: "Media",             emoji: "🎬" },
      { id: "extra",       label: "Extra",             emoji: "⭐" },
    ],
  },
];

// Flat list for bottom bar / searching
const allNavItems: NavItem[] = navSections.flatMap(s => s.items);

// Deep search index
const searchIndex: { label: string; sublabel?: string; tabId: string }[] = [
  ...allNavItems.map(item => ({ label: item.label, tabId: item.id })),
  { label: "ID Cards",          sublabel: "Credentials",      tabId: "credentials" },
  { label: "Monitor Pass",      sublabel: "Credentials",      tabId: "credentials" },
  { label: "Student ID",        sublabel: "Credentials",      tabId: "credentials" },
  { label: "Notices",           sublabel: "Notices & News",   tabId: "notices" },
  { label: "News",              sublabel: "Notices & News",   tabId: "notices" },
  { label: "Result Card",       sublabel: "Results",          tabId: "results" },
  { label: "Exam Roll Numbers", sublabel: "Results",          tabId: "results" },
  { label: "Fee Vouchers",      sublabel: "Fee Status",       tabId: "fees" },
  { label: "Fee Structure",     sublabel: "Fee Status",       tabId: "fees" },
  { label: "Payment Status",    sublabel: "Fee Status",       tabId: "fees" },
  { label: "Timetable",         sublabel: "Schedule",         tabId: "timetable" },
  { label: "Exam Schedule",     sublabel: "Schedule",         tabId: "timetable" },
  { label: "Gallery",           sublabel: "Media",            tabId: "gallery" },
  { label: "Videos",            sublabel: "Media",            tabId: "gallery" },
  { label: "Achievements",      sublabel: "Media",            tabId: "gallery" },
  { label: "Notes",             sublabel: "Notes Manager",    tabId: "notes" },
  { label: "Leaderboard",      sublabel: "Leaderboard",      tabId: "leaderboard" },
  { label: "Badges",           sublabel: "Leaderboard",      tabId: "leaderboard" },
  { label: "Houses",           sublabel: "Leaderboard",      tabId: "leaderboard" },
  { label: "Achievements",     sublabel: "Leaderboard",      tabId: "leaderboard" },
  { label: "MCQ Tests",         sublabel: "Notes Manager",    tabId: "notes" },
  { label: "Daily Quiz",        sublabel: "Notes Manager",    tabId: "notes" },
  { label: "ISS Tracker",       sublabel: "Extra",            tabId: "extra" },
  { label: "NASA",              sublabel: "Extra",            tabId: "extra" },
  { label: "World Explorer",    sublabel: "Extra",            tabId: "extra" },
  { label: "School Files",      sublabel: "Library",          tabId: "library" },
  { label: "Virtual Library",   sublabel: "Library",          tabId: "library" },
  { label: "Free Books",        sublabel: "Library",          tabId: "library" },
];

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
  const mobileNavRef = useRef<HTMLElement>(null);

  // The dashboard scrolls at the window/document level (the sidebar is
  // sticky, not the content pane), so switching features must reset the
  // window scroll position — otherwise the new feature renders while the
  // page stays scrolled wherever the previous feature left it.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [activeTab]);

  // When the mobile "Menu" slide-out opens, it always renders scrolled to
  // the top of the list — so if the active feature is further down (e.g.
  // "Online Classes" or below), it's hidden off-screen and looks like
  // nothing is selected. Scroll the highlighted item into view instead.
  useEffect(() => {
    if (!sidebarOpen) return;
    const el = mobileNavRef.current?.querySelector(`[data-nav-id="${activeTab}"]`);
    if (el) {
      // Run after the panel has actually painted/opened.
      requestAnimationFrame(() => {
        el.scrollIntoView({ block: "center" });
      });
    }
  }, [sidebarOpen, activeTab]);

  const searchResults = searchQuery.trim()
    ? searchIndex.filter(e =>
        e.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.sublabel?.toLowerCase().includes(searchQuery.toLowerCase())
      ).reduce<typeof searchIndex>((acc, entry) => {
        if (!acc.find(e => e.label === entry.label && e.tabId === entry.tabId)) acc.push(entry);
        return acc;
      }, [])
    : null;

  const handleSignOut = async () => { await signOut(); navigate("/"); };
  const handleTabChange = (tabId: string) => { onTabChange(tabId); setSidebarOpen(false); };

  const initials = profile?.full_name
    ?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "U";

  // ── Single nav button ──
  const NavBtn = ({ item, isMobile = false, onItemClick }: { item: NavItem; isMobile?: boolean; onItemClick?: () => void }) => (
    <button
      key={item.id}
      data-nav-id={item.id}
      onClick={() => { handleTabChange(item.id); onItemClick?.(); }}
      className={`w-full flex items-center gap-3 px-3 ${isMobile ? "py-2.5" : "py-2"} rounded-lg text-sm font-medium transition-colors ${
        activeTab === item.id
          ? "bg-primary text-primary-foreground"
          : "hover:bg-secondary text-foreground"
      }`}
    >
      <EmojiIcon emoji={item.emoji} size="w-5 h-5" />
      <span className={activeTab === item.id ? "" : "text-muted-foreground"}>{item.label}</span>
    </button>
  );

  // ── Full sectioned nav ──
  const SectionedNav = ({ isMobile = false, onItemClick }: { isMobile?: boolean; onItemClick?: () => void }) => {
    if (searchResults !== null) {
      if (searchResults.length === 0)
        return <p className="text-xs text-muted-foreground text-center py-4">No results found</p>;
      const matchedItems = allNavItems.filter(item => searchResults.some(r => r.tabId === item.id));
      return (
        <div className="space-y-0.5">
          {matchedItems.map(item => (
            <button
              key={item.id}
              onClick={() => { handleTabChange(item.id); onItemClick?.(); }}
              className={`w-full flex items-center gap-3 px-3 ${isMobile ? "py-2.5" : "py-2"} rounded-lg text-sm font-medium transition-colors ${
                activeTab === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              <EmojiIcon emoji={item.emoji} />
              <span className="flex-1 text-left">
                {searchResults.find(r => r.tabId === item.id)?.label || item.label}
                {searchResults.find(r => r.tabId === item.id)?.sublabel && (
                  <span className="block text-[10px] opacity-60 font-normal">
                    {searchResults.find(r => r.tabId === item.id)?.sublabel}
                  </span>
                )}
              </span>
            </button>
          ))}
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
              {section.items.map(item => <NavBtn key={item.id} item={item} isMobile={isMobile} onItemClick={onItemClick} />)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Bottom bar: first 4 items from all nav + Website + More
  const bottomBarItems = allNavItems.slice(0, 4);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-card border-r border-border shrink-0 sticky top-0 h-screen">
        <div className="p-4 border-b border-border">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 ring-1 ring-border">
              <img src="/icon-512.png" alt="GHS Babi Khel logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <span className="font-heading font-bold text-foreground text-sm leading-tight block">GHS Babi Khel</span>
              <p className="text-[10px] text-muted-foreground font-medium leading-tight">User Panel</p>
            </div>
          </Link>
        </div>

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
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <nav className="flex-1 p-3 overflow-y-auto">
          <SectionedNav />
        </nav>

        <div className="p-3 border-t border-border space-y-1">
          <Link to="/" className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <ExternalLink className="w-4 h-4" /> Main Website
          </Link>
          {profile?.role === "admin" && (
            <Link to="/admin" className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-warning hover:bg-warning/10 transition-colors">
              <Shield className="w-4 h-4" /> Admin Panel
            </Link>
          )}
          {profile?.role === "teacher" && (
            <Link to="/teacher" className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors">
              <Shield className="w-4 h-4" /> Teacher Panel
            </Link>
          )}
          <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-40 h-14 bg-card border-b border-border flex items-center px-4 gap-3">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-secondary text-foreground">
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="font-heading font-semibold text-foreground capitalize">
            {allNavItems.find(item => item.id === activeTab)?.label || "Dashboard"}
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
            <NotificationBell />
            <button onClick={toggle} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground transition-colors" title={isDark ? "Switch to light mode" : "Switch to dark mode"}>
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

        <main className="flex-1 p-4 md:p-6 pb-20 lg:pb-6">{children}</main>
      </div>

      {/* Mobile bottom bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border">
        <div className="flex items-center justify-around py-1">
          {bottomBarItems.map(item => (
            <button
              key={item.id}
              onClick={() => handleTabChange(item.id)}
              className={`flex flex-col items-center gap-0.5 p-2 min-w-[3rem] ${activeTab === item.id ? "text-primary" : "text-muted-foreground"}`}
            >
              <span className="text-lg leading-none">{item.emoji}</span>
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          ))}
          <Link to="/" className="flex flex-col items-center gap-0.5 p-2 min-w-[3rem] text-primary">
            <ExternalLink className="w-5 h-5" />
            <span className="text-[10px] font-medium">Website</span>
          </Link>
          <button onClick={() => setSidebarOpen(true)} className="flex flex-col items-center gap-0.5 p-2 min-w-[3rem] text-muted-foreground">
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
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 ring-1 ring-border">
                  <img src="/icon-512.png" alt="GHS Babi Khel logo" className="w-full h-full object-cover" />
                </div>
                <div>
                  <span className="font-heading font-bold text-foreground text-sm leading-tight block">GHS Babi Khel</span>
                  <p className="text-[10px] text-muted-foreground font-medium leading-tight">User Panel</p>
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
              <SectionedNav isMobile onItemClick={() => setSidebarOpen(false)} />
            </nav>
            <div className="p-3 border-t border-border space-y-1">
              <Link to="/" onClick={() => setSidebarOpen(false)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary">
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

export default DashboardLayout;
