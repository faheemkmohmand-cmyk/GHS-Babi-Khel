import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu, X, GraduationCap, LogIn, UserPlus,
  LayoutDashboard, LogOut, Shield, Search,
} from "lucide-react";
import { useSchoolSettings, safeMediaUrl } from "@/hooks/useSchoolSettings";
import { useAuth } from "@/hooks/useAuth";
import NotificationBell from "@/components/shared/NotificationBell";
import ThemeSwitcher, { ThemeInlineSelector } from "@/components/shared/ThemeSwitcher";

const navLinks = [
  { to: "/",          label: "Home" },
  { to: "/about",     label: "About" },
  { to: "/contact",   label: "Contact" },
  { to: "/news",      label: "News" },
  { to: "/notices",   label: "Notices" },
  { to: "/calendar",  label: "Calendar" },
  { to: "/results",   label: "Results" },
  { to: "/notes",     label: "Notes" },
  { to: "/gallery",   label: "Gallery" },
  { to: "/admission", label: "Admission" },
];

const primaryLinks = navLinks;
const moreLinks: { to: string; label: string }[] = [];

const Navbar = () => {
  const [open, setOpen]           = useState(false);
  // Desktop inline search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchVal, setSearchVal]   = useState("");
  // Mobile search state
  const [mobileSearch, setMobileSearch] = useState("");

  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);

  const [scrolled, setScrolled]   = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const location  = useLocation();
  const navigate  = useNavigate();
  const { data: settings } = useSchoolSettings();
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const isAdmin = profile?.role === "admin";

  useEffect(() => { setLogoFailed(false); }, [settings?.logo_url]);
  useEffect(() => { setOpen(false); setSearchOpen(false); setSearchVal(""); }, [location.pathname]);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // Focus search input when it opens
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 80);
    }
  }, [searchOpen]);

  // Focus mobile search when mobile menu opens
  useEffect(() => {
    if (open) {
      setTimeout(() => mobileSearchRef.current?.focus(), 150);
    } else {
      setMobileSearch("");
    }
  }, [open]);

  // Desktop: submit search → navigate to /search?q=...
  const handleDesktopSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const q = searchVal.trim();
    if (!q) return;
    navigate(`/search?q=${encodeURIComponent(q)}`);
    setSearchOpen(false);
    setSearchVal("");
  }, [searchVal, navigate]);

  // Desktop: close search on Escape
  const handleDesktopKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setSearchOpen(false);
      setSearchVal("");
    }
  }, []);

  // Mobile: submit search → navigate to /search?q=...
  const handleMobileSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const q = mobileSearch.trim();
    if (!q) return;
    navigate(`/search?q=${encodeURIComponent(q)}`);
    setOpen(false);
    setMobileSearch("");
  }, [mobileSearch, navigate]);

  return (
    <nav
      className={`sticky top-0 z-50 border-b transition-all duration-300 ${
        scrolled
          ? "bg-background border-border shadow-card"
          : "bg-background border-border/80"
      }`}
    >
      {/* ── Top bar ── */}
      <div className="container mx-auto flex items-center justify-between h-16 px-4">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 shrink-0">
          {settings?.logo_url && !logoFailed ? (
            <img
              src={safeMediaUrl(settings.logo_url)!}
              alt={`${settings?.school_name || "GHS Babi Khel"} logo`}
              className="w-10 h-10 rounded-xl object-cover"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
          )}
          <div className="hidden sm:block">
            <span className="font-heading font-bold text-base text-foreground leading-tight block">
              {settings?.school_name || "GHS Babi Khel"}
            </span>
            <span className="text-[11px] text-muted-foreground leading-none">
              District Mohmand, KPK
            </span>
          </div>
        </Link>

        {/* ── Desktop nav links ── */}
        <div className="hidden lg:flex items-center gap-0.5">
          {primaryLinks.map((link) => {
            const active = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`relative px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                {link.label}
                {active && (
                  <div className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-primary" />
                )}
              </Link>
            );
          })}

          {/* ── Inline Search ── */}
          <div className="relative ml-1 flex items-center">
            <AnimatePresence mode="wait">
              {searchOpen ? (
                /* Expanded search bar */
                <motion.form
                  key="search-form"
                  onSubmit={handleDesktopSearch}
                  initial={{ width: 32, opacity: 0 }}
                  animate={{ width: 220, opacity: 1 }}
                  exit={{ width: 32, opacity: 0 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  className="flex items-center overflow-hidden rounded-lg border border-primary/50 bg-background shadow-sm"
                  style={{ height: 34 }}
                >
                  <Search className="w-3.5 h-3.5 text-primary shrink-0 ml-2.5" />
                  <input
                    ref={searchInputRef}
                    value={searchVal}
                    onChange={(e) => setSearchVal(e.target.value)}
                    onKeyDown={handleDesktopKeyDown}
                    placeholder="Search…"
                    aria-label="Search site"
                    className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none px-2 py-0"
                    style={{ lineHeight: "34px" }}
                  />
                  {/* Submit / clear */}
                  {searchVal ? (
                    <button
                      type="submit"
                      aria-label="Go"
                      className="shrink-0 px-2.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                    >
                      Go
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label="Close search"
                      onClick={() => { setSearchOpen(false); setSearchVal(""); }}
                      className="shrink-0 px-2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </motion.form>
              ) : (
                /* Collapsed — just the icon button */
                <motion.button
                  key="search-icon"
                  type="button"
                  aria-label="Open search"
                  onClick={() => setSearchOpen(true)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <Search className="w-4 h-4" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Desktop right-side controls */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          {!authLoading && (
            user ? (
              <>
                <NotificationBell />
                <ThemeSwitcher />
                {isAdmin && (
                  <Link
                    to="/admin"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
                  >
                    <Shield className="w-4 h-4" /> Admin
                  </Link>
                )}
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-[#C96B3B] text-white shadow-card hover:bg-[#C96B3B]/90 hover:shadow-elevated transition-all"
                >
                  <LayoutDashboard className="w-4 h-4" /> Dashboard
                </Link>
                <button
                  onClick={signOut}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden xl:inline">Sign Out</span>
                </button>
              </>
            ) : (
              <>
                <ThemeSwitcher />
                <Link
                  to="/auth/signin"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
                >
                  <LogIn className="w-4 h-4" /> Sign In
                </Link>
                <Link
                  to="/auth/signup"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-[#C96B3B] text-white shadow-card hover:bg-[#C96B3B]/90 hover:shadow-elevated transition-all"
                >
                  <UserPlus className="w-4 h-4" /> Sign Up
                </Link>
              </>
            )
          )}
        </div>

        {/* Mobile: Search icon + Hamburger — outside the drawer */}
        <div className="lg:hidden flex items-center gap-1 shrink-0 ml-2">
          <button
            onClick={() => { setOpen(false); setSearchOpen((v) => !v); }}
            className="p-2 rounded-lg text-foreground hover:bg-secondary transition-colors"
            aria-label="Toggle search"
          >
            {searchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
          </button>
          <button
            onClick={() => { setSearchOpen(false); setOpen(!open); }}
            className="p-2 rounded-lg text-foreground hover:bg-secondary transition-colors"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-menu"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile search bar — slides in below top bar */}
      <AnimatePresence>
        {searchOpen && !open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="lg:hidden border-b border-border bg-card px-4 py-3"
          >
            <form
              onSubmit={handleMobileSearch}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                borderRadius: "12px",
                border: "1.5px solid hsl(var(--border))",
                backgroundColor: "hsl(var(--background))",
              }}
            >
              <Search style={{ width: 16, height: 16, color: "hsl(var(--muted-foreground))", flexShrink: 0 }} />
              <input
                ref={mobileSearchRef}
                value={mobileSearch}
                onChange={(e) => setMobileSearch(e.target.value)}
                placeholder="Search notices, news, teachers…"
                aria-label="Search site"
                autoFocus
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontSize: "14px",
                  color: "hsl(var(--foreground))",
                  minWidth: 0,
                }}
              />
              {mobileSearch.trim() && (
                <button
                  type="submit"
                  aria-label="Search"
                  style={{
                    flexShrink: 0,
                    padding: "4px 10px",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: "hsl(var(--primary))",
                    color: "hsl(var(--primary-foreground))",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Go
                </button>
              )}
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════════ MOBILE MENU ════════════ */}
      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            role="navigation"
            aria-label="Mobile navigation"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="lg:hidden border-t border-border"
            style={{
              backgroundColor: "hsl(var(--card))",
              maxHeight: "calc(100svh - 64px)",
              overflowY: "auto",
              overflowX: "hidden",
            }}
          >
            <div style={{ padding: "12px 12px 24px" }}>



              {/* ── Nav links ── */}
              {navLinks.map((link) => {
                const active = location.pathname === link.to;
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "11px 16px",
                      borderRadius: "12px",
                      marginBottom: "2px",
                      fontSize: "14px",
                      fontWeight: 500,
                      textDecoration: "none",
                      backgroundColor: active ? "hsl(var(--primary))" : "transparent",
                      color: active
                        ? "hsl(var(--primary-foreground))"
                        : "hsl(var(--muted-foreground))",
                      transition: "background 0.15s",
                    }}
                  >
                    {link.label}
                  </Link>
                );
              })}

              {/* ── Divider ── */}
              <div style={{ height: "1px", backgroundColor: "hsl(var(--border))", margin: "12px 0" }} />

              {/* ── Theme selector ── */}
              <ThemeInlineSelector />

              {/* ── Divider ── */}
              <div style={{ height: "1px", backgroundColor: "hsl(var(--border))", margin: "12px 0" }} />

              {/* ── Auth buttons ── */}
              {!authLoading && (
                user ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {isAdmin && (
                      <Link
                        to="/admin"
                        onClick={() => setOpen(false)}
                        style={{
                          display: "flex", alignItems: "center", gap: "10px",
                          padding: "13px 16px", borderRadius: "12px",
                          backgroundColor: "hsl(var(--primary))",
                          color: "hsl(var(--primary-foreground))",
                          fontWeight: 600, fontSize: "14px", textDecoration: "none",
                        }}
                      >
                        <Shield style={{ width: "18px", height: "18px" }} />
                        Admin Panel
                      </Link>
                    )}
                    <Link
                      to="/dashboard"
                      onClick={() => setOpen(false)}
                      style={{
                        display: "flex", alignItems: "center", gap: "10px",
                        padding: "13px 16px", borderRadius: "12px",
                        color: "#ffffff", backgroundColor: "#C96B3B",
                        fontWeight: 600, fontSize: "14px", textDecoration: "none",
                      }}
                    >
                    <LayoutDashboard style={{ width: "18px", height: "18px" }} />
                      Dashboard
                    </Link>
                    <button
                      onClick={() => { signOut(); setOpen(false); }}
                      style={{
                        display: "flex", alignItems: "center", gap: "10px",
                        padding: "13px 16px", borderRadius: "12px",
                        border: "none", cursor: "pointer",
                        width: "100%", textAlign: "left",
                        backgroundColor: "hsl(var(--destructive) / 0.1)",
                        color: "hsl(var(--destructive))",
                        fontWeight: 600, fontSize: "14px",
                        transition: "background 0.15s",
                      }}
                    >
                      <LogOut style={{ width: "18px", height: "18px" }} />
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <Link
                      to="/auth/signin"
                      onClick={() => setOpen(false)}
                      style={{
                        display: "flex", alignItems: "center", gap: "10px",
                        padding: "13px 16px", borderRadius: "12px",
                        color: "hsl(var(--muted-foreground))",
                        fontWeight: 500, fontSize: "14px", textDecoration: "none",
                        backgroundColor: "hsl(var(--secondary))",
                      }}
                    >
                      <LogIn style={{ width: "18px", height: "18px" }} />
                      Sign In
                    </Link>
                    <Link
                      to="/auth/signup"
                      onClick={() => setOpen(false)}
                      style={{
                        display: "flex", alignItems: "center", gap: "10px",
                        padding: "13px 16px", borderRadius: "12px",
                        color: "#ffffff", backgroundColor: "#C96B3B",
                        fontWeight: 600, fontSize: "14px", textDecoration: "none",
                      }}
                    >
                      <UserPlus style={{ width: "18px", height: "18px" }} />
                      Sign Up
                    </Link>
                  </div>
                )
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
