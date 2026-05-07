import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Home, Calendar, BarChart3, Bell, BookOpen, Image, Trophy,
  Users, User, LogOut, GraduationCap, Menu, X, Shield, ExternalLink, Moon, Sun,
  Video, BookMarked, TrendingUp
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import NotificationBell from "@/components/shared/NotificationBell";
import { useDarkMode } from "@/hooks/useDarkMode";

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { id: "overview",       label: "Overview",         icon: Home           },
  { id: "timetable",      label: "Schedule",         icon: Calendar       },
  { id: "results",        label: "Results",          icon: BarChart3      },
  { id: "merit-list",     label: "Merit List",       icon: Trophy         },
  { id: "notices",        label: "Notices & News",   icon: Bell           },
  { id: "notes",          label: "Notes Manager",    icon: BookMarked     },
  { id: "library",        label: "Library",          icon: BookOpen       },
  { id: "gallery",        label: "Media",            icon: Image          },
  { id: "online-classes", label: "Online Classes",   icon: Video          },
  { id: "analytics",      label: "Analytics",        icon: TrendingUp     },
  { id: "teachers",       label: "Teachers",         icon: Users          },
  { id: "profile",        label: "My Profile",       icon: User           },
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
  const navigate = useNavigate();
  const { isDark, toggle } = useDarkMode();

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
          : "text-muted-foreground hover:text-foreground hover:bg-secondary"
      }`}
    >
      <item.icon className="w-4 h-4 shrink-0" />
      {item.label}
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

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => renderNavItem(item, false))}
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
        <header className="sticky top-0 z-40 h-14 bg-card/80 backdrop-blur-xl border-b border-border flex items-center px-4 gap-3">
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

      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-xl border-t border-border">
        <div className="flex items-center justify-around py-1">
          {navItems.slice(0, 4).map((item) => (
            <button
              key={item.id}
              onClick={() => handleTabChange(item.id)}
              className={`flex flex-col items-center gap-0.5 p-2 min-w-[3rem] ${
                activeTab === item.id ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <item.icon className="w-5 h-5" />
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
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-72 bg-card h-full shadow-elevated flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <span className="font-heading font-bold text-foreground">Menu</span>
              <button onClick={() => setSidebarOpen(false)} className="p-2 rounded-lg hover:bg-secondary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
              {navItems.map((item) => renderNavItem(item, true))}
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
