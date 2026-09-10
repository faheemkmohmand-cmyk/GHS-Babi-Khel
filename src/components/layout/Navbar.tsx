import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu, X, GraduationCap, LogIn, UserPlus, ArrowRight,
  LayoutDashboard, LogOut, Shield, Search, ChevronDown,
  Home, Landmark, Mail, Newspaper, Megaphone, CalendarDays,
  Trophy, Medal, BookOpen, Library, Images, ClipboardList, HelpCircle,
  Hash, Video, Timer,
  type LucideIcon,
} from "lucide-react";
import { useRollSlipCountdown, compactCountdown } from "@/hooks/useRollSlipCountdown";
import { useResultsCountdown, compactCountdown as compactResultsCountdown } from "@/hooks/useResultsCountdown";
import { useSchoolSettings, safeMediaUrl } from "@/hooks/useSchoolSettings";
import { useSiteSearch } from "@/hooks/useSiteSearch";
import { useAuth } from "@/hooks/useAuth";
import NotificationBell from "@/components/shared/NotificationBell";
import ThemeSwitcher, { ThemeInlineSelector } from "@/components/shared/ThemeSwitcher";
import HexagonLogoFrame from "@/components/shared/HexagonLogoFrame";
import NavSearchDropdown from "@/components/layout/NavSearchDropdown";
import { intentPrefetchHandlers } from "@/lib/routePrefetch";

/* ═══════════════════════════════════════════════════════════════════════════
   NAV MODEL — the 15 site pages are grouped into 4 tidy drop-down sections
   (+ Home and Admission as direct links), so the top bar stays clean while
   every page remains one hover / one tap away.

   Each link carries: icon, one-line description and its own gradient tile
   colour, used by the desktop mega panels and the mobile accordion groups. */
interface NavLinkItem {
  to: string;
  label: string;
  icon: LucideIcon;
  desc: string;
  tile: string; // icon-tile gradient classes
}

interface NavSection {
  id: string;
  label: string;
  icon: LucideIcon;
  tagline: string;
  tile: string;
  links: NavLinkItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    id: "school",
    label: "Our School",
    icon: Landmark,
    tagline: "Who we are & how to reach us",
    tile: "from-sky-500 to-blue-600",
    links: [
      { to: "/about",   label: "About",   icon: Landmark,   desc: "History, mission & facilities",      tile: "from-sky-500 to-blue-600" },
      { to: "/gallery", label: "Gallery", icon: Images,     desc: "Photos & videos of school life",     tile: "from-pink-500 to-rose-500" },
      { to: "/contact", label: "Contact", icon: Mail,       desc: "Address, phone & location map",      tile: "from-emerald-500 to-teal-600" },
      { to: "/faq",     label: "FAQs",    icon: HelpCircle, desc: "Answers to common questions",        tile: "from-amber-500 to-orange-600" },
    ],
  },
  {
    id: "news",
    label: "News & Events",
    icon: Newspaper,
    tagline: "Latest updates & important dates",
    tile: "from-orange-500 to-red-500",
    links: [
      { to: "/news",     label: "News",     icon: Newspaper,   desc: "Stories & latest updates",     tile: "from-orange-500 to-red-500" },
      { to: "/notices",  label: "Notices",  icon: Megaphone,   desc: "Official announcements",       tile: "from-violet-500 to-purple-600" },
      { to: "/calendar", label: "Calendar", icon: CalendarDays, desc: "Events & academic dates",     tile: "from-cyan-500 to-sky-600" },
    ],
  },
  {
    id: "results",
    label: "Results",
    icon: Trophy,
    tagline: "Exam outcomes, toppers & slips",
    tile: "from-yellow-500 to-amber-600",
    links: [
      { to: "/results",   label: "Results",   icon: Trophy, desc: "Exam results & DMCs",           tile: "from-yellow-500 to-amber-600" },
      { to: "/merit-list", label: "Merit List", icon: Medal, desc: "Toppers & position holders",   tile: "from-fuchsia-500 to-pink-600" },
    ],
  },
  {
    id: "academics",
    label: "Academics",
    icon: BookOpen,
    tagline: "Learn anywhere, anytime",
    tile: "from-violet-500 to-purple-600",
    links: [
      { to: "/online-classes", label: "Online Classes", icon: Video,   desc: "Live & recorded lectures",         tile: "from-red-500 to-rose-600" },
      { to: "/notes",          label: "Notes",          icon: BookOpen, desc: "Study notes by class & subject",   tile: "from-lime-500 to-green-600" },
      { to: "/library",        label: "Library",        icon: Library,  desc: "Books & reading resources",        tile: "from-indigo-500 to-blue-600" },
    ],
  },
];

// The Roll No. Slip page gets its own spotlight card inside the Results
// panel (with the live countdown badge) instead of a plain row.
const rollSlipItem: NavLinkItem = {
  to: "/roll-no-slip", label: "Roll No. Slip", icon: Hash,
  desc: "Find, download & share your slip", tile: "from-emerald-500 to-green-600",
};

/* ── Roll No. Slip live countdown ────────────────────────────────────────────
   When the admin schedules Exam Roll Numbers, a live countdown appears on
   every "Roll No. Slip" entry point in the navbar:
     • chip       → desktop top bar (gold pill, ticking HH:MM:SS)
     • strip      → slim bar under the navbar on smaller screens
     • menu-badge → mini badge beside the Roll No. Slip row in the menus
   The countdown is driven by useRollSlipCountdown() — the exact same source
   the /roll-no-slip page uses, so everything ticks in sync. When the timer
   reaches zero the indicator flips to a green "LIVE" state for ~90 seconds
   (slips are already published by then — publishing is instant), then hides. ──*/
const LIVE_GRACE_MS = 90 * 1000;

function RollSlipCountdown({ variant }: { variant: "chip" | "strip" | "menu-badge" }) {
  const { scheduled } = useRollSlipCountdown();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Tick only while a countdown is actually on screen.
    if (!scheduled) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [scheduled]);

  if (!scheduled || !scheduled.publish_at) return null;
  const diff = new Date(scheduled.publish_at).getTime() - now;
  if (diff <= -LIVE_GRACE_MS) return null; // countdown over + grace elapsed → hide
  const live = diff <= 0;

  if (variant === "chip") {
    return (
      <Link
        to="/roll-no-slip"
        aria-label="Roll No. Slip countdown — tap to open"
        className={`hidden lg:inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm no-underline ${
          live
            ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-500/30"
            : "bg-gradient-to-r from-gold/25 to-gold/10 border border-gold/50 text-foreground hover:from-gold/35 hover:to-gold/15"
        }`}        
      >
        <Timer className={`w-4 h-4 ${live ? "" : "text-gold"}`} />
        <span className="leading-none">
          {live ? (
            <span className="tracking-wide">Slips LIVE</span>
          ) : (
            <span className="font-mono tabular-nums">{compactCountdown(diff)}</span>
          )}
        </span>
        {!live && <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" aria-hidden="true" />}
      </Link>
    );
  }

  if (variant === "strip") {
    return (
      <Link
        to="/roll-no-slip"
        aria-label="Roll No. Slip countdown — tap to open"
        className={`lg:hidden flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold no-underline transition-colors ${
          live
            ? "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white"
            : "bg-red-50 text-red-600 border-b border-red-200"
        }`}
      >
        <Timer className={`w-3.5 h-3.5 shrink-0 ${live ? "" : "text-red-600"}`} />
        <span className="truncate">
          {live ? (
            <>Roll No. Slips are <span className="underline underline-offset-2">LIVE</span> — tap to view</>
          ) : (
            <>Roll No. Slip in <span className="font-mono tabular-nums font-bold text-red-600">{compactCountdown(diff)}</span></>
          )}
        </span>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 animate-pulse ${live ? "bg-white" : "bg-red-500"}`} aria-hidden="true" />
      </Link>
    );
  }

  // menu-badge — tiny inline badge beside the Roll No. Slip row
  return (
    <span
      className={`ml-auto shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
        live
          ? "bg-emerald-500 text-white"
          : "bg-white/90 text-emerald-700 border border-white/60"
      }`}    >
      {live ? "LIVE" : <span className="font-mono tabular-nums">{compactCountdown(diff)}</span>}
    </span>
  );
}

/* ── Results live countdown (school / BISE Peshawar) ─────────────────────
   Same pattern as RollSlipCountdown's "strip" variant above, so when a
   results publish is scheduled, a small red countdown strip appears above
   the announcements ticker too — mirroring the Roll No. Slip strip. ──────*/
function ResultsCountdown() {
  const { scheduled } = useResultsCountdown();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!scheduled) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [scheduled]);

  if (!scheduled || !scheduled.publish_at) return null;
  const diff = new Date(scheduled.publish_at).getTime() - now;
  if (diff <= -LIVE_GRACE_MS) return null;
  const live = diff <= 0;

  return (
    <Link
      to="/results"
      aria-label="Results countdown — tap to open"
      className={`lg:hidden flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold no-underline transition-colors ${
        live
          ? "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white"
          : "bg-red-50 text-red-600 border-b border-red-200"
      }`}
    >
      <Timer className={`w-3.5 h-3.5 shrink-0 ${live ? "" : "text-red-600"}`} />
      <span className="truncate">
        {live ? (
          <>Results are <span className="underline underline-offset-2">LIVE</span> — tap to view</>
        ) : (
          <>Results in <span className="font-mono tabular-nums font-bold text-red-600">{compactResultsCountdown(diff)}</span></>
        )}
      </span>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 animate-pulse ${live ? "bg-white" : "bg-red-500"}`} aria-hidden="true" />
    </Link>
  );
}

// INSTANT NAVIGATION: one delegated listener set on the navbar root covers
// every link inside it. The instant a finger touches or a cursor hovers a
// link, the target page's JS chunk starts downloading — by the time the tap
// completes, navigation is instant even on slow internet.
const navIntentPrefetch = intentPrefetchHandlers();

/* ── Desktop mega-panel link row — icon tile, label + description, and an
      arrow that slides in on hover. Staggered entrance per row. ──────────── */
function MegaRow({ link, index, active, onNavigate }: {
  link: NavLinkItem;
  index: number;
  active: boolean;
  onNavigate: () => void;
}) {
  const Icon = link.icon;
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.045 * index, duration: 0.25, ease: "easeOut" }}
    >
      <Link
        to={link.to}
        onClick={onNavigate}
        className={`group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 no-underline transition-colors duration-150 ${
          active ? "bg-accent/10" : "hover:bg-secondary"
        }`}
      >
        {active && (
          <span
            className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-full bg-gold shadow-[0_0_8px_hsl(var(--gold)/0.9)]"
            aria-hidden="true"
          />
        )}
        <span
          className={`w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br ${link.tile} text-white flex items-center justify-center shadow-sm transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-3`}
          aria-hidden="true"
        >
          <Icon className="w-[18px] h-[18px]" />
        </span>
        <span className="flex-1 min-w-0">
          <span className={`block text-sm font-semibold leading-tight ${active ? "text-primary" : "text-foreground"}`}>
            {link.label}
          </span>
          <span className="block text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">
            {link.desc}
          </span>
        </span>
        <ArrowRight
          className="w-4 h-4 shrink-0 -translate-x-1 opacity-0 text-gold transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
          aria-hidden="true"
        />
      </Link>
    </motion.div>
  );
}

/* ── Mobile accordion link row — mirrors the desktop MegaRow language:
      gradient tile, label + description, glowing gold active bar. ─────── */
function MobileLinkRow({ link, active, onNavigate }: { link: NavLinkItem; active: boolean; onNavigate: () => void }) {
  const Icon = link.icon;
  return (
    <Link
      to={link.to}
      onClick={onNavigate}
      className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm no-underline transition-colors ${
        active ? "bg-accent/10" : "hover:bg-secondary"
      }`}
    >
      {active && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-full bg-gold shadow-[0_0_8px_hsl(var(--gold)/0.9)]"
          aria-hidden="true"
        />
      )}
      <span
        className={`w-8 h-8 rounded-lg bg-gradient-to-br ${link.tile} text-white flex items-center justify-center shrink-0 shadow-sm`}
        aria-hidden="true"
      >
        <Icon className="w-4 h-4" />
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block text-sm font-semibold leading-tight ${active ? "text-primary" : "text-foreground"}`}>
          {link.label}
        </span>
        <span className="block text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">
          {link.desc}
        </span>
      </span>
    </Link>
  );
}

/* ── Mobile direct-link row (Home / Admission) — same tile language as the
      accordion groups so the whole drawer reads as one designed system. ── */
function MobileDirectRow({ to, label, icon: Icon, tile, active, onNavigate }: {
  to: string;
  label: string;
  icon: LucideIcon;
  tile: string;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={`relative flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-semibold no-underline transition-colors ${
        active ? "bg-accent/10 text-primary" : "text-foreground hover:bg-secondary"
      }`}
    >
      {active && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-full bg-gold shadow-[0_0_8px_hsl(var(--gold)/0.9)]"
          aria-hidden="true"
        />
      )}
      <span
        className={`w-9 h-9 rounded-xl bg-gradient-to-br ${tile} text-white flex items-center justify-center shrink-0 shadow-sm`}
        aria-hidden="true"
      >
        <Icon className="w-[18px] h-[18px]" />
      </span>
      {label}
    </Link>
  );
}

const Navbar = () => {
  const [open, setOpen] = useState(false);
  // Desktop mega-menu: which section panel is open (null = none)
  const [openSection, setOpenSection] = useState<string | null>(null);
  // Mobile accordion: which group is expanded
  const [mobileOpenSection, setMobileOpenSection] = useState<string | null>(null);
  const desktopNavRef = useRef<HTMLDivElement>(null);
  const hoverTimers = useRef<{ enter?: number; leave?: number }>({});

  // Desktop inline search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchVal, setSearchVal]   = useState("");
  // Mobile search state
  const [mobileSearch, setMobileSearch] = useState("");

  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);

  // Live, as-you-type suggestions — no debounce needed, a single keystroke
  // already returns matches (pages, notices, news, teachers), same as
  // typing into Google's search box. Shown in a dropdown under the input;
  // pressing Go / Enter still jumps to the full /search results page.
  const { hits: desktopHits } = useSiteSearch(searchVal, 4);
  const { hits: mobileHits } = useSiteSearch(mobileSearch, 4);

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
    setOpen(false); setSearchOpen(false); setSearchVal("");
    setOpenSection(null); setMobileOpenSection(null);
  }, [location.pathname]);

  // Close the open mega panel on Escape / click outside the desktop nav,
  // and clear hover timers on unmount.
  useEffect(() => {
    if (!openSection) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenSection(null); };
    const onClick = (e: MouseEvent) => {
      if (desktopNavRef.current && !desktopNavRef.current.contains(e.target as Node)) {
        setOpenSection(null);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [openSection]);

  useEffect(() => () => {
    window.clearTimeout(hoverTimers.current.enter);
    window.clearTimeout(hoverTimers.current.leave);
  }, []);

  // Hover-intent open/close: tiny delay on enter (no flicker when skimming
  // across the bar), a small grace period on leave (moving into the panel).
  const sectionEnter = useCallback((id: string) => {
    window.clearTimeout(hoverTimers.current.leave);
    window.clearTimeout(hoverTimers.current.enter);
    hoverTimers.current.enter = window.setTimeout(() => setOpenSection(id), 70);
  }, []);
  const sectionLeave = useCallback(() => {
    window.clearTimeout(hoverTimers.current.enter);
    hoverTimers.current.leave = window.setTimeout(() => setOpenSection(null), 180);
  }, []);
  const toggleSection = useCallback((id: string) => {
    window.clearTimeout(hoverTimers.current.enter);
    window.clearTimeout(hoverTimers.current.leave);
    setOpenSection((cur) => (cur === id ? null : id));
  }, []);

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

  /* Shared styling pieces for the modern link treatment:
     — animated gold underline that grows from the centre (.nav-underline)
     — soft gradient pill behind hover/active (.nav-link::before)
     — glowing gold dot on the active link (.nav-dot)
     All defined once in src/index.css, driven by data-active. */
  const desktopLinkClass = (active: boolean) =>
    `nav-link px-3.5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors duration-200 ${
      active ? "text-primary" : "text-muted-foreground hover:text-foreground"
    }`;

  const closeAllMenus = useCallback(() => {
    setOpen(false);
    setOpenSection(null);
    setMobileOpenSection(null);
  }, []);

  return (
    <nav
      {...navIntentPrefetch}
      className={`sticky top-0 z-50 border-b transition-all duration-300 ${
        scrolled
          ? "bg-background/95 border-border shadow-card"
          : "bg-background border-border/80"
      }`}
    >
      {/* ── Top bar ── */}
      <div className="container mx-auto flex items-center justify-between h-16 px-4">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-4 shrink-0">
          <HexagonLogoFrame size={38}>
            {settings?.logo_url && !logoFailed ? (
              <img
                src={safeMediaUrl(settings.logo_url)!}
                alt={`${settings?.school_name || "GHS Babi Khel"} logo`}
                className="w-full h-full object-cover"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <GraduationCap className="w-4 h-4 text-white" />
            )}
          </HexagonLogoFrame>
          <div>
            <span className="font-display italic font-medium text-xl sm:text-2xl text-foreground leading-tight block tracking-tight">
              {settings?.school_name || "GHS Babi Khel"}
            </span>
            <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.2em] sm:tracking-[0.25em] text-gold leading-none">
              High School · Mohmand
            </span>
          </div>
        </Link>

        {/* ── Desktop nav: direct links + grouped mega drop-downs ── */}
        <div className="hidden lg:flex items-center gap-1" ref={desktopNavRef}>

          {/* Home — direct link */}
          <Link
            to="/"
            data-active={location.pathname === "/" || undefined}
            className={desktopLinkClass(location.pathname === "/")}
          >
            Home
            <span className="nav-underline" aria-hidden="true" />
            <span className="nav-dot" aria-hidden="true" />
          </Link>

          {/* Grouped sections with mega panels */}
          {NAV_SECTIONS.map((section) => {
            const SectionIcon = section.icon;
            const sectionActive =
              section.links.some((l) => l.to === location.pathname) ||
              (section.id === "results" && location.pathname === "/roll-no-slip");
            const isOpen = openSection === section.id;
            return (
              <div
                key={section.id}
                className="relative"
                onMouseEnter={() => sectionEnter(section.id)}
                onMouseLeave={sectionLeave}
              >
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  aria-expanded={isOpen}
                  aria-haspopup="true"
                  data-active={sectionActive || undefined}
                  className={desktopLinkClass(sectionActive)}
                >
                  {section.label}
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                  <span className="nav-underline" aria-hidden="true" />
                  <span className="nav-dot" aria-hidden="true" />
                </button>

                {/* Panel — the static wrapper keeps the hover bridge + centre
                    alignment; framer-motion animates the inner card only (no
                    transform conflicts with -translate-x-1/2). */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 pt-3 z-50">
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 12, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.97 }}
                        transition={{ type: "spring", stiffness: 400, damping: 32 }}
                        style={{ transformOrigin: "top center" }}
                        className="w-[min(92vw,400px)] max-w-[calc(100vw-2rem)]"
                      >
                        <div className="relative rounded-3xl border border-border bg-card/95 backdrop-blur-xl shadow-elevated overflow-hidden">
                          {/* gold hairline accent + soft glow */}
                          <div className="absolute top-0 inset-x-6 h-px bg-gradient-to-r from-transparent via-gold/70 to-transparent" aria-hidden="true" />
                          <div className="orb orb-gold w-36 h-36 -top-14 -right-10 opacity-25 pointer-events-none" aria-hidden="true" />

                          {/* panel header */}
                          <div className="relative px-5 pt-4 pb-3 flex items-center gap-3">
                            <span className={`w-9 h-9 rounded-xl bg-gradient-to-br ${section.tile} text-white flex items-center justify-center shadow-card`} aria-hidden="true">
                              <SectionIcon className="w-[18px] h-[18px]" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-gold leading-none">
                                {section.label}
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-1 leading-none truncate">
                                {section.tagline}
                              </p>
                            </div>
                          </div>

                          {/* link rows */}
                          <div className="relative px-2.5 pb-2 space-y-0.5">
                            {section.links.map((link, i) => (
                              <MegaRow
                                key={link.to}
                                link={link}
                                index={i}
                                active={location.pathname === link.to}
                                onNavigate={() => setOpenSection(null)}
                              />
                            ))}
                          </div>

                          {/* Results panel: Roll No. Slip spotlight card with
                              the live countdown badge */}
                          {section.id === "results" && (
                            <motion.div
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.045 * section.links.length + 0.05, duration: 0.28, ease: "easeOut" }}
                              className="relative px-2.5 pb-3 pt-0.5"
                            >
                              <Link
                                to={rollSlipItem.to}
                                onClick={() => setOpenSection(null)}
                                className="group relative flex items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 text-white px-4 py-3.5 no-underline shadow-card hover:shadow-elevated transition-all duration-200"
                              >
                                <span
                                  className="absolute -right-6 -top-8 w-24 h-24 rounded-full bg-white/10 transition-transform duration-300 group-hover:scale-125"
                                  aria-hidden="true"
                                />
                                <span className="relative w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0" aria-hidden="true">
                                  <Hash className="w-5 h-5" />
                                </span>
                                <span className="relative flex-1 min-w-0">
                                  <span className="block text-sm font-bold leading-tight">{rollSlipItem.label}</span>
                                  <span className="block text-[11px] text-white/85 leading-tight mt-0.5">{rollSlipItem.desc}</span>
                                </span>
                                <RollSlipCountdown variant="menu-badge" />
                                <ArrowRight className="relative w-4 h-4 shrink-0 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
                              </Link>
                            </motion.div>
                          )}

                          {/* panel footer strip */}
                          <div className="relative px-5 py-2.5 border-t border-border/70 bg-secondary/30 flex items-center justify-between">
                            <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-muted-foreground/80">
                              GHS Babi Khel
                            </span>
                            <span className="text-[9px] text-muted-foreground/70">
                              District Mohmand · KPK
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}

          {/* Admission — direct link */}
          <Link
            to="/admission"
            data-active={location.pathname === "/admission" || undefined}
            className={desktopLinkClass(location.pathname === "/admission")}
          >
            Admission
            <span className="nav-underline" aria-hidden="true" />
            <span className="nav-dot" aria-hidden="true" />
          </Link>

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
            {searchOpen && (
              <NavSearchDropdown
                query={searchVal}
                hits={desktopHits}
                className="w-[320px]"
                onSelect={() => { setSearchOpen(false); setSearchVal(""); }}
                onViewAll={() => {
                  const q = searchVal.trim();
                  if (!q) return;
                  navigate(`/search?q=${encodeURIComponent(q)}`);
                  setSearchOpen(false);
                  setSearchVal("");
                }}
              />
            )}
          </div>
        </div>

        {/* Desktop right-side controls */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          {/* Live countdown on the Roll No. Slip link (desktop top bar) */}
          <RollSlipCountdown variant="chip" />
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

      {/* subtle gold hairline glowing along the navbar's bottom edge */}
      <div className="pointer-events-none absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold/35 to-transparent" aria-hidden="true" />

      {/* Roll No. Slip live countdown strip (mobile / tablet — the desktop
          chip covers large screens) — tap jumps straight to /roll-no-slip */}
      <RollSlipCountdown variant="strip" />

      {/* Results live countdown strip — same spot, appears whenever a
          school/BISE results publish is scheduled, tap jumps to /results */}
      <ResultsCountdown />

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
            <div className="relative">
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
                      setSearchOpen(false);
                      setMobileSearch("");
                    }}
                    className="shrink-0 px-2.5 py-1 rounded-lg border-none bg-primary text-primary-foreground text-xs font-semibold cursor-pointer"
                  >
                    Go
                  </button>
                )}
              </div>
              <NavSearchDropdown
                query={mobileSearch}
                hits={mobileHits}
                onSelect={() => { setSearchOpen(false); setMobileSearch(""); }}
                onViewAll={() => {
                  const q = mobileSearch.trim();
                  if (!q) return;
                  navigate(`/search?q=${encodeURIComponent(q)}`);
                  setOpen(false);
                  setSearchOpen(false);
                  setMobileSearch("");
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════════ MOBILE MENU — premium grouped drawer ════════════ */}
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
            className="lg:hidden border-t border-border bg-card overflow-y-auto overflow-x-hidden overscroll-contain"
            style={{ maxHeight: "calc(100svh - 64px)" }}
          >
            <div className="p-3 pb-4 space-y-2.5">

              {/* eyebrow — ties the drawer to the school brand */}
              <div className="flex items-center justify-between px-1.5">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold">Menu</p>
                <p className="text-[10px] text-muted-foreground/70">{settings?.school_name || "GHS Babi Khel"}</p>
              </div>

              {/* ── Direct link: Home ── */}
              <MobileDirectRow
                to="/"
                label="Home"
                icon={Home}
                tile="from-emerald-500 to-teal-600"
                active={location.pathname === "/"}
                onNavigate={closeAllMenus}
              />

              {/* ── Grouped accordion sections — one inset panel, richer
                     rows (tile + tagline + count chip + circular chevron) ── */}
              <div className="rounded-3xl border border-border/70 bg-secondary/30 p-1.5 space-y-3">
                {NAV_SECTIONS.map((section) => {
                  const SectionIcon = section.icon;
                  const sectionActive =
                    section.links.some((l) => l.to === location.pathname) ||
                    (section.id === "results" && location.pathname === "/roll-no-slip");
                  const isOpen = mobileOpenSection === section.id;
                  const linkCount = section.links.length + (section.id === "results" ? 1 : 0);
                  return (
                    <div key={section.id}>
                      <button
                        type="button"
                        onClick={() => setMobileOpenSection(isOpen ? null : section.id)}
                        aria-expanded={isOpen}
                        className={`w-full flex items-center gap-3 px-2.5 py-4 rounded-2xl text-sm no-underline transition-colors ${
                          sectionActive ? "bg-accent/10" : "hover:bg-secondary/70"
                        }`}
                      >
                        <span
                          className={`w-9 h-9 rounded-xl bg-gradient-to-br ${section.tile} text-white flex items-center justify-center shrink-0 shadow-sm ${
                            sectionActive ? "ring-2 ring-gold/50" : ""
                          }`}
                          aria-hidden="true"
                        >
                          <SectionIcon className="w-[18px] h-[18px]" />
                        </span>
                        <span className="flex-1 min-w-0 text-left">
                          <span className={`block text-sm font-bold leading-tight ${sectionActive ? "text-primary" : "text-foreground"}`}>
                            {section.label}
                          </span>
                          <span className="block text-[10.5px] text-muted-foreground leading-tight mt-0.5 truncate">
                            {section.tagline}
                          </span>
                        </span>
                        <span className="shrink-0 min-w-[22px] h-[22px] px-1.5 inline-flex items-center justify-center rounded-lg bg-background border border-border text-[10px] font-black text-muted-foreground">
                          {linkCount}
                        </span>
                        <span
                          className={`shrink-0 w-7 h-7 rounded-full bg-background border flex items-center justify-center transition-all duration-300 ${
                            isOpen ? "border-gold/60 text-gold rotate-180" : "border-border text-muted-foreground"
                          }`}
                          aria-hidden="true"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </span>
                      </button>

                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            key={`${section.id}-panel`}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.26, ease: [0.4, 0, 0.2, 1] }}
                            className="overflow-hidden"
                          >
                            <div className="pl-2.5 pr-1 pt-0.5 pb-1.5">
                              {/* layered white card holds this group's links */}
                              <div className="rounded-2xl bg-card border border-border/60 p-1.5 space-y-0.5 shadow-sm">
                                {section.links.map((link) => (
                                  <MobileLinkRow
                                    key={link.to}
                                    link={link}
                                    active={location.pathname === link.to}
                                    onNavigate={closeAllMenus}
                                  />
                                ))}
                                {/* Results group: Roll No. Slip row — matches
                                    the same cream card style as the other
                                    rows in this group, with the live
                                    countdown badge kept alongside it */}
                                {section.id === "results" && (
                                  <Link
                                    to={rollSlipItem.to}
                                    onClick={closeAllMenus}
                                    className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm no-underline transition-colors ${
                                      location.pathname === rollSlipItem.to ? "bg-accent/10" : "hover:bg-secondary"
                                    }`}
                                  >
                                    {location.pathname === rollSlipItem.to && (
                                      <span
                                        className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-full bg-gold shadow-[0_0_8px_hsl(var(--gold)/0.9)]"
                                        aria-hidden="true"
                                      />
                                    )}
                                    <span
                                      className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm"
                                      aria-hidden="true"
                                    >
                                      <Hash className="w-4 h-4" />
                                    </span>
                                    <span className="flex-1 min-w-0">
                                      <span className={`block text-sm font-semibold leading-tight ${location.pathname === rollSlipItem.to ? "text-primary" : "text-foreground"}`}>
                                        {rollSlipItem.label}
                                      </span>
                                      <span className="block text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">
                                        {rollSlipItem.desc}
                                      </span>
                                    </span>
                                    <RollSlipCountdown variant="menu-badge" />
                                  </Link>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>

              {/* ── Direct link: Admission ── */}
              <MobileDirectRow
                to="/admission"
                label="Admission"
                icon={ClipboardList}
                tile="from-amber-500 to-orange-600"
                active={location.pathname === "/admission"}
                onNavigate={closeAllMenus}
              />

              {/* ── Appearance ── */}
              <div className="rounded-2xl border border-border/70 bg-secondary/30 py-1">
                <ThemeInlineSelector />
              </div>

              {/* ── Account — one cohesive, on-brand group (no more loud
                     clashing full-width colour blocks) ── */}
              {!authLoading && (
                user ? (
                  <div className="rounded-3xl border border-border/70 bg-secondary/30 p-1.5 space-y-1">
                    {isAdmin && (
                      <Link
                        to="/admin"
                        onClick={closeAllMenus}
                        className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-300 font-semibold text-sm no-underline"
                      >
                        <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm" aria-hidden="true">
                          <Shield className="w-[18px] h-[18px]" />
                        </span>
                        Admin Panel
                      </Link>
                    )}
                    <Link
                      to="/dashboard"
                      onClick={closeAllMenus}
                      className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-bold text-sm no-underline shadow-card"
                    >
                      <span className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0" aria-hidden="true">
                        <LayoutDashboard className="w-[18px] h-[18px]" />
                      </span>
                      Dashboard
                    </Link>
                    <button
                      onClick={() => { signOut(); closeAllMenus(); }}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl border-none cursor-pointer text-left bg-transparent text-destructive font-semibold text-sm transition-colors hover:bg-destructive/10"
                    >
                      <span className="w-9 h-9 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0" aria-hidden="true">
                        <LogOut className="w-[18px] h-[18px]" />
                      </span>
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      to="/auth/signin"
                      onClick={closeAllMenus}
                      className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-secondary border border-border/60 text-foreground font-semibold text-sm no-underline"
                    >
                      <LogIn className="w-4 h-4 text-muted-foreground" />
                      Sign In
                    </Link>
                    <Link
                      to="/auth/signup"
                      onClick={closeAllMenus}
                      className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-bold text-sm no-underline shadow-card"
                    >
                      <UserPlus className="w-4 h-4" />
                      Sign Up
                    </Link>
                  </div>
                )
              )}

              {/* ── Drawer footer — the same branding strip as the desktop
                     mega panels, so both menus finish identically ── */}
              <div className="pt-1.5 pb-0.5 text-center">
                <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-muted-foreground/80">GHS Babi Khel</p>
                <p className="text-[9px] text-muted-foreground/60 mt-0.5">District Mohmand · KPK</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
