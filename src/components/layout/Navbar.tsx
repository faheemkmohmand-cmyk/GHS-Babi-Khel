import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu, X, GraduationCap, LogIn, UserPlus,
  LayoutDashboard, LogOut, Shield, Search, ChevronDown,
} from "lucide-react";
import { useSchoolSettings, safeMediaUrl } from "@/hooks/useSchoolSettings";
import { useAuth } from "@/hooks/useAuth";
import NotificationBell from "@/components/shared/NotificationBell";
import ThemeSwitcher, { ThemeInlineSelector } from "@/components/shared/ThemeSwitcher";
import HexagonLogoFrame from "@/components/shared/HexagonLogoFrame";

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

// Desktop only: show the first 6 directly, tuck the rest into a "More" dropdown.
// Mobile menu always renders the full navLinks list, so nothing is ever hidden there.
const primaryLinks = navLinks.slice(0, 6);
const moreLinks = navLinks.slice(6);

const Navbar = () => {
  const [open, setOpen]           = useState(false);
  const [moreOpen, setMoreOpen]   = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
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
  const prevPathnameRef = useRef(location.pathname);
  useEffect(() => {
    if (prevPathnameRef.current === location.pathname) return;
    prevPathnameRef.current = location.pathname;
    setOpen(false); setSearchOpen(false); setSearchVal(""); setMoreOpen(false);
  }, [location.pathname]);

  // Close "More" dropdown when clicking outside it
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen]);

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

  // Desktop: close search on Escape
  const handleDesktopKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setSearchOpen(false);
      setSearchVal("");
    }
  }, []);

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
          <HexagonLogoFrame size={40}>
            {settings?.logo_url && !logoFailed ? (
              <img
                src={safeMediaUrl(settings.logo_url)!}
                alt={`${settings?.school_name || "GHS Babi Khel"} logo`}
                className="w-full h-full object-cover"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <GraduationCap className="w-5 h-5 text-white" />
            )}
          </HexagonLogoFrame>
          <div className="hidden sm:block">
            <span className="font-display font-semibold text-lg text-foreground leading-tight block tracking-tight">
              {settings?.school_name || "GHS Babi Khel"}
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-gold leading-none">
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
                    ? "text-accent"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                {link.label}
                {active && (
                  <div className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-accent" />
                )}
              </Link>
            );
          })}

          {moreLinks.length > 0 && (
            <div className="relative" ref={moreRef}>
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
                className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                  moreLinks.some((l) => l.to === location.pathname)
                    ? "text-accent"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                More
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence>
                {moreOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full left-0 mt-1 min-w-[160px] rounded-xl border border-border bg-card shadow-elevated py-1.5 z-50"
                  >
                    {moreLinks.map((link) => {
                      const active = location.pathname === link.to;
                      return (
                        <Link
                          key={link.to}
                          to={link.to}
                          onClick={() => setMoreOpen(false)}
                          className={`block px-4 py-2 text-sm font-medium transition-colors ${
                            active
                              ? "text-accent bg-accent/5"
                              : "text-foreground hover:bg-secondary"
                          }`}
                        >
                          {link.label}
                        </Link>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* ── Inline Search ── */}
          <div className="relative ml-1 flex items-center">
            <AnimatePresence mode="wait">
              {searchOpen ? (
                /* Expanded search bar */
                <motion.div
                  key="search-form"
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
                    onKeyDown={(e) => {
                      handleDesktopKeyDown(e);
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const q = searchVal.trim();
                        if (!q) return;
                        navigate(`/search?q=${encodeURIComponent(q)}`);
                        setSearchOpen(false);
                        setSearchVal("");
                      }
                    }}
                    placeholder="Search…"
                    aria-label="Search site"
                    className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none px-2 py-0"
                    style={{ lineHeight: "34px" }}
                  />
                  {/* Submit / clear */}
                  {searchVal ? (
                    <button
                      type="button"
                      aria-label="Go"
                      onClick={() => {
                        // Plain click handler, no form/submit involved at
                        // all, so there's no native submit event, no
                        // preventDefault race, and nothing for the
                        // framer-motion exit animation to interrupt.
                        const q = searchVal.trim();
                        if (!q) return;
                        navigate(`/search?q=${encodeURIComponent(q)}`);
                        setSearchOpen(false);
                        setSearchVal("");
                      }}
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
                </motion.div>
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
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-accent text-accent-foreground shadow-card hover:bg-accent/90 hover:shadow-elevated transition-all"
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
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-accent text-accent-foreground shadow-card hover:bg-accent/90 hover:shadow-elevated transition-all"
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
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border-[1.5px] border-border bg-background">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                ref={mobileSearchRef}
                value={mobileSearch}
                onChange={(e) => setMobileSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const q = mobileSearch.trim();
                    if (!q) return;
                    navigate(`/search?q=${encodeURIComponent(q)}`);
                    setOpen(false);
                    setMobileSearch("");
                  }
                }}
                placeholder="Search notices, news, teachers…"
                aria-label="Search site"
                autoFocus
                enterKeyHint="search"
                type="search"
                className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm text-foreground"
              />
              {mobileSearch.trim() && (
                <button
                  type="button"
                  aria-label="Search"
                  onClick={() => {
                    // Plain click handler, no form/submit involved.
                    const q = mobileSearch.trim();
                    if (!q) return;
                    navigate(`/search?q=${encodeURIComponent(q)}`);
                    setOpen(false);
                    setMobileSearch("");
                  }}
                  className="shrink-0 px-2.5 py-1 rounded-lg border-none bg-primary text-primary-foreground text-xs font-semibold cursor-pointer"
                >
                  Go
                </button>
              )}
            </div>
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
            className="lg:hidden border-t border-border bg-card overflow-y-auto overflow-x-hidden"
            style={{ maxHeight: "calc(100svh - 64px)" }}
          >
            <div className="p-3 pb-6">



              {/* ── Nav links ── */}
              {navLinks.map((link) => {
                const active = location.pathname === link.to;
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setOpen(false)}
                    className={`flex items-center px-4 py-2.5 rounded-xl mb-0.5 text-sm font-medium no-underline transition-colors ${
                      active
                        ? "bg-accent text-accent-foreground"
                        : "bg-transparent text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}

              {/* ── Divider ── */}
              <div className="h-px bg-border my-3" />

              {/* ── Theme selector ── */}
              <ThemeInlineSelector />

              {/* ── Divider ── */}
              <div className="h-px bg-border my-3" />

              {/* ── Auth buttons ── */}
              {!authLoading && (
                user ? (
                  <div className="flex flex-col gap-1.5">
                    {isAdmin && (
                      <Link
                        to="/admin"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm no-underline"
                      >
                        <Shield className="w-[18px] h-[18px]" />
                        Admin Panel
                      </Link>
                    )}
                    <Link
                      to="/dashboard"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-accent text-accent-foreground font-semibold text-sm no-underline"
                    >
                      <LayoutDashboard className="w-[18px] h-[18px]" />
                      Dashboard
                    </Link>
                    <button
                      onClick={() => { signOut(); setOpen(false); }}
                      className="flex items-center gap-2.5 px-4 py-3 rounded-xl border-none cursor-pointer w-full text-left bg-destructive/10 text-destructive font-semibold text-sm transition-colors hover:bg-destructive/20"
                    >
                      <LogOut className="w-[18px] h-[18px]" />
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <Link
                      to="/auth/signin"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-muted-foreground font-medium text-sm no-underline bg-secondary"
                    >
                      <LogIn className="w-[18px] h-[18px]" />
                      Sign In
                    </Link>
                    <Link
                      to="/auth/signup"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-accent text-accent-foreground font-semibold text-sm no-underline"
                    >
                      <UserPlus className="w-[18px] h-[18px]" />
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
