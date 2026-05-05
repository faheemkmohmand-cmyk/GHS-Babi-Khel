import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, GraduationCap, LogIn, UserPlus, LayoutDashboard, LogOut, Shield } from "lucide-react";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { useAuth } from "@/hooks/useAuth";
import NotificationBell from "@/components/shared/NotificationBell";
import ThemeSwitcher, { ThemeInlineSelector } from "@/components/shared/ThemeSwitcher";

const navLinks = [
  { to: "/",               label: "Home" },
  { to: "/about",          label: "About" },
  { to: "/teachers",       label: "Teachers" },
  { to: "/notices",        label: "Notices" },
  { to: "/results",        label: "Results" },
  { to: "/notes",          label: "Notes" },
  { to: "/weather",        label: "Weather" },
  { to: "/online-classes", label: "Online Classes" },
  { to: "/admission",      label: "Admission" },
];

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const { data: settings } = useSchoolSettings();
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const isAdmin = profile?.role === "admin";

  useEffect(() => { setOpen(false); }, [location.pathname]);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <nav className={`sticky top-0 z-50 border-b transition-all duration-300 ${
      scrolled ? "bg-card/90 backdrop-blur-xl border-border shadow-card"
               : "bg-card/70 backdrop-blur-lg border-transparent"
    }`}>
      {/* ── Top bar ── */}
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 shrink-0">
          {settings?.logo_url ? (
            <img src={settings.logo_url} alt="Logo" className="w-10 h-10 rounded-xl object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-primary-foreground" />
            </div>
          )}
          <div className="hidden sm:block">
            <span className="font-heading font-bold text-base text-foreground leading-tight block">
              {settings?.school_name || "GHS Babi Khel"}
            </span>
            <span className="text-[11px] text-muted-foreground leading-none">District Mohmand, KPK</span>
          </div>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden lg:flex items-center gap-0.5">
          {navLinks.map((link) => {
            const active = location.pathname === link.to;
            return (
              <Link key={link.to} to={link.to}
                className={`relative px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}>
                {link.label}
                {active && (
                  <motion.div layoutId="nav-underline"
                    className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }} />
                )}
              </Link>
            );
          })}
        </div>

        {/* Desktop right side */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          {!authLoading && (
            user ? (
              <>
                <NotificationBell />
                <ThemeSwitcher />
                {isAdmin && (
                  <Link to="/admin" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-all">
                    <Shield className="w-4 h-4" /> Admin
                  </Link>
                )}
                <Link to="/dashboard" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold gradient-accent text-primary-foreground shadow-card hover:shadow-elevated transition-all">
                  <LayoutDashboard className="w-4 h-4" /> Dashboard
                </Link>
                <button onClick={signOut}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                  <LogOut className="w-4 h-4" />
                  <span className="hidden xl:inline">Sign Out</span>
                </button>
              </>
            ) : (
              <>
                <ThemeSwitcher />
                <Link to="/auth/signin" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors">
                  <LogIn className="w-4 h-4" /> Sign In
                </Link>
                <Link to="/auth/signup" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold gradient-accent text-primary-foreground shadow-card hover:shadow-elevated transition-all">
                  <UserPlus className="w-4 h-4" /> Sign Up
                </Link>
              </>
            )
          )}
        </div>

        {/* Hamburger */}
        <button onClick={() => setOpen(!open)}
          className="lg:hidden p-2 rounded-lg text-foreground hover:bg-secondary transition-colors shrink-0 ml-2"
          aria-label="Toggle menu">
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* ════════ MOBILE MENU ════════ */}
      <AnimatePresence>
        {open && (
          <motion.div
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
                  <Link key={link.to} to={link.to} onClick={() => setOpen(false)}
                    style={{
                      display: "flex", alignItems: "center",
                      padding: "11px 16px", borderRadius: "12px",
                      marginBottom: "2px", fontSize: "14px", fontWeight: 500,
                      textDecoration: "none",
                      backgroundColor: active ? "hsl(var(--primary))" : "transparent",
                      color: active ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                      transition: "background 0.15s",
                    }}>
                    {link.label}
                  </Link>
                );
              })}

              {/* ── Divider ── */}
              <div style={{ height: "1px", backgroundColor: "hsl(var(--border))", margin: "12px 0" }} />

              {/* ── THEME INLINE SELECTOR ── */}
              <ThemeInlineSelector />

              {/* ── Divider ── */}
              <div style={{ height: "1px", backgroundColor: "hsl(var(--border))", margin: "12px 0" }} />

              {/* ── Auth buttons ── */}
              {!authLoading && (
                user ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {isAdmin && (
                      <Link to="/admin" onClick={() => setOpen(false)}
                        style={{
                          display: "flex", alignItems: "center", gap: "10px",
                          padding: "13px 16px", borderRadius: "12px",
                          backgroundColor: "#f59e0b", color: "#fff",
                          fontWeight: 600, fontSize: "14px", textDecoration: "none",
                        }}>
                        <Shield style={{ width: "18px", height: "18px" }} />
                        Admin Panel
                      </Link>
                    )}
                    <Link to="/dashboard" onClick={() => setOpen(false)}
                      className="gradient-accent"
                      style={{
                        display: "flex", alignItems: "center", gap: "10px",
                        padding: "13px 16px", borderRadius: "12px",
                        color: "hsl(var(--primary-foreground))",
                        fontWeight: 600, fontSize: "14px", textDecoration: "none",
                      }}>
                      <LayoutDashboard style={{ width: "18px", height: "18px" }} />
                      Dashboard
                    </Link>
                    {/* SIGN OUT — always visible */}
                    <button
                      onClick={() => { signOut(); setOpen(false); }}
                      style={{
                        display: "flex", alignItems: "center", gap: "10px",
                        padding: "13px 16px", borderRadius: "12px",
                        border: "none", cursor: "pointer", width: "100%", textAlign: "left",
                        backgroundColor: "hsl(var(--destructive) / 0.1)",
                        color: "hsl(var(--destructive))",
                        fontWeight: 600, fontSize: "14px",
                        transition: "background 0.15s",
                      }}>
                      <LogOut style={{ width: "18px", height: "18px" }} />
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <Link to="/auth/signin" onClick={() => setOpen(false)}
                      style={{
                        display: "flex", alignItems: "center", gap: "10px",
                        padding: "13px 16px", borderRadius: "12px",
                        color: "hsl(var(--muted-foreground))",
                        fontWeight: 500, fontSize: "14px", textDecoration: "none",
                        backgroundColor: "hsl(var(--secondary))",
                      }}>
                      <LogIn style={{ width: "18px", height: "18px" }} />
                      Sign In
                    </Link>
                    <Link to="/auth/signup" onClick={() => setOpen(false)}
                      className="gradient-accent"
                      style={{
                        display: "flex", alignItems: "center", gap: "10px",
                        padding: "13px 16px", borderRadius: "12px",
                        color: "hsl(var(--primary-foreground))",
                        fontWeight: 600, fontSize: "14px", textDecoration: "none",
                      }}>
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


        
