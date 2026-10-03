import { useState, useEffect, useRef, useCallback, memo, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu, X, GraduationCap, LogIn, UserPlus, ArrowRight,
  LayoutDashboard, LogOut, Shield, Search, ChevronDown, ChevronRight,
  Home, Landmark, Mail, Newspaper, Megaphone, CalendarDays,
  Trophy, Medal, BookOpen, Library, Images, ClipboardList, HelpCircle,
  Hash, Video, Timer, Command as CommandIcon,
  Bell, FileSignature, type LucideIcon,
} from "lucide-react";
import { useRollSlipCountdown, compactCountdown } from "@/hooks/useRollSlipCountdown";
import { useResultsCountdown, splitCountdown } from "@/hooks/useResultsCountdown";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { armAutoPublish, serverNow, syncServerClock } from "@/lib/autoPublish";
import { supabase } from "@/lib/supabase";
import { examTypeLabel } from "@/utils/examTypeLabel";
import { useBisepCurrentExam, FALLBACK_TITLE } from "@/hooks/useBisepCurrentExam";
import { useSchoolSettings, safeMediaUrl } from "@/hooks/useSchoolSettings";
import { useSiteSearch } from "@/hooks/useSiteSearch";
import { useAuth } from "@/hooks/useAuth";
import NotificationBell from "@/components/shared/NotificationBell";
import ThemeSwitcher from "@/components/shared/ThemeSwitcher";
import ThemeToggleButton from "@/components/shared/ThemeToggleButton";
import HexagonLogoFrame from "@/components/shared/HexagonLogoFrame";
import NavSearchDropdown from "@/components/layout/NavSearchDropdown";
import { openCommandPalette } from "@/components/shared/CommandPalette";
import { intentPrefetchHandlers } from "@/lib/routePrefetch";

/* ═══════════════════════════════════════════════════════════════════════════
   NAV MODEL — the 15 site pages are grouped into 4 tidy drop-down sections
   (+ Home and Admission as direct links), so the top bar stays clean while
   every page remains one hover / one tap away.

   Each link carries: icon, one-line description and its own soft "tint"
   chip colour — a light pastel / dark translucent wash instead of a loud
   gradient square — shared by the desktop panels and the mobile accordion
   groups. Soft chips keep both menus calm, modern and premium. */
interface NavLinkItem {
  to: string;
  label: string;
  icon: LucideIcon;
  desc: string;
  tint: string; // soft icon-chip tint classes (bg + text, light & dark)
}

interface NavSection {
  id: string;
  label: string;
  icon: LucideIcon;
  tagline: string;
  tint: string;
  links: NavLinkItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    id: "school",
    label: "Our School",
    icon: Landmark,
    tagline: "Who we are & how to reach us",
    tint: "bg-secondary text-primary dark:bg-primary/15 dark:text-primary-light",
    links: [
      { to: "/about",   label: "About",   icon: Landmark,   desc: "History, mission & facilities",      tint: "bg-secondary text-primary dark:bg-primary/15 dark:text-primary-light" },
      { to: "/gallery", label: "Gallery", icon: Images,     desc: "Photos & videos of school life",     tint: "bg-secondary text-primary dark:bg-primary/15 dark:text-primary-light" },
      { to: "/contact", label: "Contact", icon: Mail,       desc: "Address, phone & location map",      tint: "bg-secondary text-primary dark:bg-primary/15 dark:text-primary-light" },
      { to: "/faq",     label: "FAQs",    icon: HelpCircle, desc: "Answers to common questions",        tint: "bg-secondary text-primary dark:bg-primary/15 dark:text-primary-light" },
    ],
  },
  {
    id: "news",
    label: "News & Events",
    icon: Newspaper,
    tagline: "Latest updates & important dates",
    tint: "bg-secondary text-primary dark:bg-primary/15 dark:text-primary-light",
    links: [
      { to: "/news",     label: "News",     icon: Newspaper,   desc: "Stories & latest updates",     tint: "bg-secondary text-primary dark:bg-primary/15 dark:text-primary-light" },
      { to: "/notices",  label: "Notices",  icon: Megaphone,   desc: "Official announcements",       tint: "bg-secondary text-primary dark:bg-primary/15 dark:text-primary-light" },
      { to: "/calendar", label: "Calendar", icon: CalendarDays, desc: "Events & academic dates",     tint: "bg-secondary text-primary dark:bg-primary/15 dark:text-primary-light" },
    ],
  },
  {
    id: "results",
    label: "Results",
    icon: Trophy,
    tagline: "Exam outcomes, toppers & slips",
    tint: "bg-gold-soft text-[hsl(43_89%_29%)] dark:bg-gold/15 dark:text-gold",
    links: [
      { to: "/results",   label: "Results",   icon: Trophy, desc: "Exam results & DMCs",           tint: "bg-gold-soft text-[hsl(43_89%_29%)] dark:bg-gold/15 dark:text-gold" },
      { to: "/merit-list", label: "Merit List", icon: Medal, desc: "Toppers & position holders",   tint: "bg-gold-soft text-[hsl(43_89%_29%)] dark:bg-gold/15 dark:text-gold" },
    ],
  },
  {
    id: "academics",
    label: "Academics",
    icon: BookOpen,
    tagline: "Learn anywhere, anytime",
    tint: "bg-secondary text-primary dark:bg-primary/15 dark:text-primary-light",
    links: [
      { to: "/online-classes", label: "Online Classes", icon: Video,   desc: "Live & recorded lectures",         tint: "bg-secondary text-primary dark:bg-primary/15 dark:text-primary-light" },
      { to: "/notes",          label: "Notes",          icon: BookOpen, desc: "Study notes by class & subject",   tint: "bg-secondary text-primary dark:bg-primary/15 dark:text-primary-light" },
      { to: "/library",        label: "Library",        icon: Library,  desc: "Books & reading resources",        tint: "bg-secondary text-primary dark:bg-primary/15 dark:text-primary-light" },
    ],
  },
];

// The Roll No. Slip page gets its own spotlight card inside the Results
// panel (with the live countdown badge) instead of a plain row.
const rollSlipItem: NavLinkItem = {
  to: "/roll-no-slip", label: "Roll No. Slip", icon: Hash,
  desc: "Find, download & share your slip", tint: "bg-gold-soft text-[hsl(43_89%_29%)] dark:bg-gold/15 dark:text-gold",
};

/* ── Roll No. Slip live countdown ────────────────────────────────────────────
   When the admin schedules Exam Roll Numbers, a live countdown appears on
   every "Roll No. Slip" entry point in the navbar:
     • chip       → desktop top bar (gold pill, ticking HH:MM:SS)
     • strip      → slim bar under the navbar on smaller screens
     • menu-badge → mini badge beside the Roll No. Slip row in the menus
   The countdown is driven by useRollSlipCountdown() — the exact same source
   the /roll-no-slip page uses, so everything ticks in sync. When the timer
   reaches zero the indicator flips to an orange "LIVE" state for ~90 seconds
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
            ? "bg-orange-600 text-white hover:bg-orange-700 shadow-orange-600/30"
            : "bg-azure/10 border border-azure/40 text-foreground hover:bg-azure/15"
        }`}        
      >
        <Timer className={`w-4 h-4 ${live ? "" : "text-azure"}`} />
        <span className="leading-none">
          {live ? (
            <span className="tracking-wide">Slips LIVE</span>
          ) : (
            <span className="font-mono tabular-nums">{compactCountdown(diff)}</span>
          )}
        </span>
        {!live && <span className="w-1.5 h-1.5 rounded-full bg-azure animate-pulse" aria-hidden="true" />}
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
            ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white"
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
          ? "bg-azure text-white"
          : "bg-secondary text-azure-strong dark:text-azure border border-border/60"
      }`}    >
      {live ? "LIVE" : <span className="font-mono tabular-nums">{compactCountdown(diff)}</span>}
    </span>
  );
}

/* ── Results top strip (mobile, tablet & desktop) ─────────────────────────────────
   ONE golden strip pinned ABOVE the school name (top of the header) that
   replaces the old red strips under it:
     1. A school results publish OR a BISE Peshawar countdown is running →
        stylish "RESULTS IN [02] : [05] : [09]" with dark-green digit chips.
     2. Countdown just hit zero → "Results are LIVE — tap to view" (short
        grace period, same as before).
     3. No countdown → a single line "Results · <title>" fetched live:
        the latest published school exam (e.g. "1st Semester 2026"), or —
        when no school result is published — BISE Peshawar's live exam
        title. Tap opens /results in every case. ─────────────────────────*/
function ResultsTopStrip() {
  const { scheduled } = useResultsCountdown();
  const { data: bisepMeta } = useBisepCurrentExam();
  const qc = useQueryClient();
  const [now, setNow] = useState(() => serverNow());

  // Same source of truth as the /results page: has the school published?
  const { data: hasSchool } = useQuery<boolean>({
    queryKey: ["has-published-school-results"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("results").select("id", { count: "exact", head: true }).eq("is_published", true);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    staleTime: 60 * 1000,
  });

  // Latest PUBLISHED school exam — the live "Results · title" line.
  const { data: latestSchool } = useQuery({
    queryKey: ["navbar-latest-school-result"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("exam_type, year, created_at")
        .eq("is_published", true)
        .order("year", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Exact-moment publish works from ANY page, not only /results.
  const schedKey = scheduled?.publish_at ?? "";
  useEffect(() => {
    if (!schedKey) return;
    return armAutoPublish([schedKey], qc);
  }, [schedKey, qc]);

  // Mode — mirrors Results.tsx: school mode when results are published OR a
  // school schedule is pending; BISE Peshawar only when neither exists.
  const schoolAt = scheduled?.publish_at ? new Date(scheduled.publish_at).getTime() : null;
  const schoolMode = hasSchool === true || schoolAt != null;
  const modeKnown = hasSchool !== undefined || schoolAt != null;

  const bisepAt =
    !schoolMode && bisepMeta?.countdown_date && !bisepMeta?.is_live
      ? new Date(bisepMeta.countdown_date).getTime() : null;
  const target =
    schoolAt != null && schoolAt - now > -LIVE_GRACE_MS ? schoolAt
    : bisepAt != null && bisepAt - now > -LIVE_GRACE_MS ? bisepAt
    : null;

  useEffect(() => { void syncServerClock(); }, []);
  useEffect(() => {
    if (target == null) return;
    const t = window.setInterval(() => setNow(serverNow()), 250);
    return () => window.clearInterval(t);
  }, [target]);

  const diff = target != null ? target - now : null;
  // School schedule at zero = "being published" (flips within ~a second);
  // never advertise it as LIVE before results are really readable.
  const live = diff != null && diff <= 0 && target !== schoolAt;
  const publishing = diff != null && diff <= 0 && target === schoolAt;
  const title = schoolMode
    ? (latestSchool ? `${examTypeLabel(latestSchool.exam_type)} ${latestSchool.year}` : "")
    : (bisepMeta?.exam_title || FALLBACK_TITLE || "").trim();

  // Don't guess (e.g. flash the BISE title) until the mode is known.
  if (!modeKnown) return null;
  if (diff == null && !title) return null;

  const pad = (n: number) => String(n).padStart(2, "0");
  const chip = (v: string, unit: string) => (
    <span className="inline-flex items-baseline gap-0.5 rounded-md bg-[#0B2E19] px-1.5 py-[3px] sm:px-2 sm:py-1 leading-none shadow-sm ring-1 ring-[#F2D27A]/20">
      <span className="font-mono tabular-nums text-[13px] sm:text-[15px] font-extrabold text-[#F2D27A]">{v}</span>
      <span className="text-[8px] sm:text-[9px] font-bold uppercase text-[#F2D27A]/70">{unit}</span>
    </span>
  );

  let body: React.ReactNode;
  if (diff != null && !live) {
    const { d, h, m, s: sec } = splitCountdown(diff);
    body = (
      <>
        <Timer className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-[#0B2E19]" />
        <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-[0.14em] text-[#0B2E19]">Results in</span>
        <span className="flex items-center gap-1">
          {d > 0 && chip(String(d), "d")}
          {chip(pad(h), "h")}
          {chip(pad(m), "m")}
          {d === 0 && chip(pad(sec), "s")}
        </span>
      </>
    );
  } else if (publishing) {
    body = (
      <>
        <Timer className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-[#0B2E19] animate-spin" />
        <span className="text-xs sm:text-sm font-extrabold text-[#0B2E19]">Publishing results…</span>
      </>
    );
  } else if (live) {
    body = (
      <>
        <Timer className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-[#0B2E19]" />
        <span className="text-xs sm:text-sm font-extrabold text-[#0B2E19]">Results are <span className="underline underline-offset-2">LIVE</span> — tap to view</span>
      </>
    );
  } else {
    body = (
      <>
        <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-[#0B2E19]" />
        <span className="truncate text-xs sm:text-sm font-extrabold tracking-wide text-[#0B2E19]">Results · {title}</span>
        <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-[#0B2E19]/70 transition-transform group-hover:translate-x-0.5" />
      </>
    );
  }

  return (
    <Link
      to="/results"
      aria-label="Results — tap to open"
      className="group relative flex items-center justify-center gap-2 sm:gap-3 px-4 py-1.5 sm:py-2 min-h-[34px] sm:min-h-[40px] no-underline border-b border-[#8F6508]/50 bg-gradient-to-r from-[#A97C0C] via-[#B8860B] to-[#A97C0C] hover:brightness-110 transition-[filter] overflow-hidden"
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/30" aria-hidden="true" />
      {body}
      {diff != null && (
        <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0 bg-[#0B2E19] animate-pulse" aria-hidden="true" />
      )}
    </Link>
  );
}

// INSTANT NAVIGATION: one delegated listener set on the navbar root covers
// every link inside it. The instant a finger touches or a cursor hovers a
// link, the target page's JS chunk starts downloading — by the time the tap
// completes, navigation is instant even on slow internet.
const navIntentPrefetch = intentPrefetchHandlers();

/* ── Desktop panel link row — slim, quiet-luxury list item: soft tinted
      icon chip, label + one-line description, hairline gold active bar and
      an arrow that slides in on hover. Staggered entrance per row. ──────── */
function MegaRow({ link, index, active, onNavigate }: {
  link: NavLinkItem;
  index: number;
  active: boolean;
  onNavigate: () => void;
}) {
  const Icon = link.icon;
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.035 * index, duration: 0.22, ease: "easeOut" }}
    >
      <Link
        to={link.to}
        onClick={onNavigate}
        className={`group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 no-underline transition-colors duration-150 ${
          active ? "bg-azure/[0.08]" : "hover:bg-secondary"
        }`}
      >
        {active && (
          <span
            className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-azure"
            aria-hidden="true"
          />
        )}
        <span
          className={`w-8 h-8 shrink-0 rounded-[10px] ${link.tint} flex items-center justify-center transition-transform duration-200 group-hover:scale-105`}
          aria-hidden="true"
        >
          <Icon className="w-4 h-4" />
        </span>
        <span className="flex-1 min-w-0">
          <span className={`block text-[13px] font-semibold leading-tight ${active ? "text-azure-strong dark:text-azure" : "text-foreground"}`}>
            {link.label}
          </span>
          <span className="block text-[10.5px] text-muted-foreground leading-tight mt-px truncate">
            {link.desc}
          </span>
        </span>
        <ArrowRight
          className="w-3.5 h-3.5 shrink-0 -translate-x-1 opacity-0 text-azure transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
          aria-hidden="true"
        />
      </Link>
    </motion.div>
  );
}

/* ── Mobile menu rows — clean, professional list (same language as the
      GHSS Ghallanai mobile sheet): plain bold labels, hairline dividers,
      chevron accordions, indented sub-links with a one-line description,
      48px+ tap targets. memo() so opening one group never re-paints the
      others. ─────────────────────────────────────────────────────────── */
const MobileLinkRow = memo(function MobileLinkRow({ link, active, onNavigate }: { link: NavLinkItem; active: boolean; onNavigate: () => void }) {
  return (
    <Link
      to={link.to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-12 flex-col justify-center rounded-lg px-3 py-2 no-underline transition-colors duration-150 ${
        active ? "bg-secondary" : "active:bg-secondary hover:bg-secondary"
      }`}
    >
      {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-gold" aria-hidden="true" />}
      <span className={`text-sm font-semibold leading-tight ${active ? "text-primary" : "text-foreground"}`}>{link.label}</span>
      <span className="mt-0.5 text-xs leading-tight text-muted-foreground">{link.desc}</span>
    </Link>
  );
});

const MobileDirectRow = memo(function MobileDirectRow({ to, label, active, onNavigate }: {
  to: string;
  label: string;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-12 items-center py-3 text-base font-semibold no-underline transition-colors ${
        active ? "text-primary" : "text-foreground"
      }`}
    >
      {active && <span className="absolute -left-4 top-3 bottom-3 w-[3px] rounded-full bg-gold" aria-hidden="true" />}
      {label}
    </Link>
  );
});

/* After a group finishes expanding, glide the drawer just far enough that
   the revealed list is fully on screen (only scrolls when it is clipped). */
function revealPanelInDrawer(panel: HTMLElement | null) {
  if (!panel) return;
  const drawer = panel.closest("#mobile-menu") as HTMLElement | null;
  if (!drawer) return;
  const drawerRect = drawer.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  // leave room for the pinned Admission bar at the bottom of the drawer
  const clipped = panelRect.bottom - (drawerRect.bottom - 84) + 8;
  if (clipped > 4) {
    drawer.scrollTo({ top: drawer.scrollTop + clipped, behavior: "smooth" });
  }
}

const MobileAccordionSection = memo(function MobileAccordionSection({
  section,
  pathname,
  isOpen,
  onToggle,
  onNavigate,
}: {
  section: NavSection;
  pathname: string;
  isOpen: boolean;
  onToggle: (id: string) => void;
  onNavigate: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const sectionActive =
    section.links.some((l) => l.to === pathname) ||
    (section.id === "results" && pathname === "/roll-no-slip");

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(section.id)}
        aria-expanded={isOpen}
        aria-controls={`m-panel-${section.id}`}
        className="relative flex min-h-12 w-full items-center justify-between py-3 text-left text-base font-semibold touch-manipulation select-none"
      >
        {sectionActive && <span className="absolute -left-4 top-3 bottom-3 w-[3px] rounded-full bg-gold" aria-hidden="true" />}
        <span className={sectionActive ? "text-primary" : "text-foreground"}>{section.label}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180 text-gold" : "text-muted-foreground"}`}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key={`${section.id}-panel`}
            id={`m-panel-${section.id}`}
            initial={{ gridTemplateRows: "0fr", opacity: 0 }}
            animate={{
              gridTemplateRows: "1fr",
              opacity: 1,
              transition: {
                gridTemplateRows: { duration: 0.28, ease: [0.32, 0.72, 0, 1] },
                opacity: { duration: 0.2, ease: "easeOut" },
              },
            }}
            exit={{
              gridTemplateRows: "0fr",
              opacity: 0,
              transition: {
                gridTemplateRows: { duration: 0.2, ease: [0.55, 0, 0.55, 0.2] },
                opacity: { duration: 0.12, ease: "easeIn" },
              },
            }}
            style={{ display: "grid" }}
            className="overflow-hidden"
            onAnimationComplete={() => revealPanelInDrawer(panelRef.current)}
          >
            <div className="min-h-0 overflow-hidden">
              <div ref={panelRef} className="space-y-0.5 pb-3 pl-1">
                {section.links.map((link) => (
                  <MobileLinkRow key={link.to} link={link} active={pathname === link.to} onNavigate={onNavigate} />
                ))}
                {/* Results group: Roll No. Slip row with its live countdown badge */}
                {section.id === "results" && (
                  <Link
                    to={rollSlipItem.to}
                    onClick={onNavigate}
                    aria-current={pathname === rollSlipItem.to ? "page" : undefined}
                    className={`relative flex min-h-12 items-center gap-2 rounded-lg px-3 py-2 no-underline transition-colors duration-150 ${
                      pathname === rollSlipItem.to ? "bg-secondary" : "active:bg-secondary hover:bg-secondary"
                    }`}
                  >
                    {pathname === rollSlipItem.to && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-gold" aria-hidden="true" />}
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-semibold leading-tight ${pathname === rollSlipItem.to ? "text-primary" : "text-foreground"}`}>
                        {rollSlipItem.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-tight text-muted-foreground">{rollSlipItem.desc}</span>
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
});

/* Brand wordmark — Playfair bold, last word in heritage gold ("GHS Babi <Khel>") */
function BrandName({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return <>{name}</>;
  const last = parts.pop();
  return <>{parts.join(" ")} <span className="text-gold">{last}</span></>;
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

  // Lock page scroll behind the open mobile menu (menu itself still scrolls)
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);
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

  // ── Scroll-direction-aware retract/reveal ────────────────────────────
  // Scrolling down past the navbar's own height slides it up and out of
  // view (gives the page full screen for reading); any upward scroll —
  // even a small one — slides it back instantly, the way premium mobile
  // navbars behave. Never hides while a menu/drawer/search is open, so
  // the user's active interaction is never yanked off-screen mid-tap.
  const [navHidden, setNavHidden] = useState(false);
  const lastScrollYRef = useRef(0);
  const anyMenuOpen = open || !!openSection || !!mobileOpenSection || searchOpen;
  useEffect(() => {
    lastScrollYRef.current = window.scrollY;
    const NAV_HEIGHT = 64; // matches h-16 top bar; hiding starts only past it
    const onScroll = () => {
      const y = window.scrollY;
      const last = lastScrollYRef.current;
      const delta = y - last;
      if (anyMenuOpen) {
        setNavHidden(false);
      } else if (y <= NAV_HEIGHT) {
        setNavHidden(false);
      } else if (delta > 4) {
        setNavHidden(true);
      } else if (delta < -4) {
        setNavHidden(false);
      }
      lastScrollYRef.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [anyMenuOpen]);

  // ── Mobile bottom bar: hide on scroll down, show on scroll up ──────────
  // Same X (Twitter)-style behaviour, applied to the new fixed bottom dock.
  // Reuses the same `navHidden` toggle so it stays in lockstep with the
  // top nav — they hide/show together as a single coherent unit, not two
  // independent widgets that fight each other.
  //
  // ⚠️ Uses its OWN lastScrollY ref on purpose: this effect's listener runs
  // AFTER the top-nav listener above, which has already written the current
  // scrollY into the shared ref — reading the shared one here always yields
  // delta = 0, so the dock never registered a scroll direction and NEVER
  // hid on scroll-down. The separate ref restores the X-style behaviour.
  const [bottomHidden, setBottomHidden] = useState(false);
  const bottomLastScrollYRef = useRef(0);
  useEffect(() => {
    bottomLastScrollYRef.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const last = bottomLastScrollYRef.current;
      const delta = y - last;
      if (anyMenuOpen) {
        setBottomHidden(false);
      } else if (y <= 64) {
        setBottomHidden(false);
      } else if (delta > 4) {
        setBottomHidden(true);
      } else if (delta < -4) {
        setBottomHidden(false);
      }
      bottomLastScrollYRef.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [anyMenuOpen]);

  // Hide the global bottom bar on routes that have their own dock, e.g.
  // chapter pages already render an X-style FAB row (AI / Timer / Listen
  // / Cards / Notes / Rank), so two docks would overlap. Same for any
  // future sub-route that wants the screen to itself.
  const hideGlobalBottomBar = useMemo(() => {
    const p = location.pathname;
    return /^\/notes\/[^/]+\/[^/]+/.test(p); // /notes/:subject/:chapter
  }, [location.pathname]);

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
      active ? "text-azure-strong dark:text-azure" : "text-muted-foreground hover:text-foreground"
    }`;

  const closeAllMenus = useCallback(() => {
    setOpen(false);
    setOpenSection(null);
    setMobileOpenSection(null);
  }, []);

  // Stable accordion toggle — handed to every memoised mobile group; its
  // identity never changes, so memoisation actually holds and tapping one
  // group never re-renders the others.
  const toggleMobileSection = useCallback((id: string) => {
    setMobileOpenSection((cur) => (cur === id ? null : id));
  }, []);

  // Spotlight hairline: track cursor X across the nav container and expose
  // it as a CSS var; the glow itself is rendered by .nav-spotlight-line in
  // src/index.css (radial-gradient centred on --mouse-x).
  const handleNavMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
  }, []);

  // ⚠️ CONTAINING-BLOCK RULE (why the dock below is NOT inside <nav>):
  // the <nav> toggles Tailwind translate-y-0 / -translate-y-full (hide on
  // scroll). In Tailwind v3 translate-y-0 still emits a non-none CSS
  // transform, and ANY ancestor with a non-none transform becomes the
  // containing block for position:fixed descendants — so a fixed
  // bottom-0 dock inside <nav> was pinned to the BOTTOM OF THE 64px
  // NAVBAR (appearing at the top of the screen on mobile) instead of the
  // bottom of the viewport. Keep the dock a SIBLING of <nav>, and never
  // move it back inside an element that carries a transform/filter class.
  return (
    <>
    <nav
      {...navIntentPrefetch}
      onMouseMove={handleNavMouseMove}
      className={`nav-glass-edges sticky top-0 z-50 border-b transition-all duration-300 ${
        scrolled
          ? "bg-background/95 border-border shadow-card"
          : "bg-background border-border/80"
      } ${navHidden ? "-translate-y-full" : "translate-y-0"}`}
      style={{ transition: "transform 280ms cubic-bezier(0.22, 1, 0.36, 1), background-color 300ms, box-shadow 300ms, border-color 300ms" }}
    >
      {/* Golden results strip — above the school name (mobile / tablet) */}
      <ResultsTopStrip />

      {/* ── Top bar ── */}
      <div className="container mx-auto flex items-center justify-between h-16 px-4">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 sm:gap-4 shrink-0">
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
            <span className="font-display font-bold text-xl sm:text-2xl text-foreground leading-tight block tracking-tight">
              <BrandName name={settings?.school_name || "GHS Babi Khel"} />
            </span>
            <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.2em] sm:tracking-[0.25em] text-muted-foreground/80 leading-none">
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

                {/* Panel — slim editorial dropdown: hairline gold accent,
                    micro eyebrow, compact rows. No bulky header/footer, so it
                    reads light and fast instead of "thick". */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2.5 z-50">
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.98 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        style={{ transformOrigin: "top center" }}
                        className="w-[min(92vw,286px)] max-w-[calc(100vw-2rem)]"
                      >
                        <div className="relative rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-elevated overflow-hidden">
                          {/* thin azure hairline accent */}
                          <div className="absolute top-0 inset-x-5 h-px bg-gradient-to-r from-transparent via-gold/70 to-transparent" aria-hidden="true" />
                          
                          {/* micro eyebrow — small azure icon + tagline, one whisper line */}
                          <div className="relative flex items-center gap-2 px-4 pt-3 pb-1">
                            <SectionIcon className="w-3 h-3 text-gold shrink-0" aria-hidden="true" />
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/80 leading-none truncate">
                              {section.tagline}
                            </p>
                          </div>

                          {/* link rows */}
                          <div className="relative p-1.5 pt-1">
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
                              transition={{ delay: 0.035 * section.links.length + 0.04, duration: 0.26, ease: "easeOut" }}
                              className="relative p-1.5 pt-0.5"
                            >
                              <Link
                                to={rollSlipItem.to}
                                onClick={() => setOpenSection(null)}
                                className="group relative flex items-center gap-2.5 overflow-hidden rounded-xl bg-secondary/60 hover:bg-secondary text-foreground px-3 py-2.5 no-underline border border-border/60 shadow-card hover:shadow-elevated transition-all duration-200"
                              >
                                <span
                                  className="absolute -right-6 -top-8 w-24 h-24 rounded-full bg-azure/5 transition-transform duration-300 group-hover:scale-125"
                                  aria-hidden="true"
                                />
                                <span className={`relative w-9 h-9 rounded-[10px] ${rollSlipItem.tint} flex items-center justify-center shrink-0`} aria-hidden="true">
                                  <Hash className="w-[18px] h-[18px]" />
                                </span>
                                <span className="relative flex-1 min-w-0">
                                  <span className="block text-[12.5px] font-bold leading-tight text-foreground">{rollSlipItem.label}</span>
                                  <span className="block text-[10.5px] text-muted-foreground leading-tight mt-px truncate">{rollSlipItem.desc}</span>
                                </span>
                                <RollSlipCountdown variant="menu-badge" />
                                <ArrowRight className="relative w-3.5 h-3.5 shrink-0 text-azure transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
                              </Link>
                            </motion.div>
                          )}
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
                  className="flex items-center overflow-hidden rounded-lg border border-border bg-background shadow-sm"
                  style={{ height: 34 }}
                >
                  <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-2.5" />
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
                      className="shrink-0 px-2.5 text-xs font-semibold text-azure hover:text-azure/80 transition-colors"
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
                  className="flex items-center gap-1.5 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <Search className="w-4 h-4" />
                  <span
                    className="hidden lg:inline-flex items-center gap-0.5 rounded-md border border-border/70 bg-secondary/60 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground/80"
                    aria-hidden="true"
                    title="Press Cmd/Ctrl+K to open the command palette"
                  >
                    <CommandIcon className="w-2.5 h-2.5" />K
                  </span>
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
              </>
            )
          )}
        </div>

        {/* Mobile: Search icon + Hamburger — outside the drawer.
            The search icon now opens the full ⌘K command palette (fuzzy
            search + quick actions + recents) instead of the old inline
            search bar, so mobile gets the exact same experience as
            desktop's Cmd/Ctrl+K. */}
        <div className="lg:hidden flex items-center gap-0.5 shrink-0 ml-2">
          <ThemeToggleButton />
          <button
            onClick={() => { setSearchOpen(false); setOpen(!open); }}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-secondary transition-colors"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-menu"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* subtle gold hairline glowing along the navbar's bottom edge — base
          wash stays static so the line is never fully invisible, and the
          reactive spotlight (nav-spotlight-line, driven by --mouse-x from
          handleNavMouseMove above) brightens only under the cursor */}
      <div className="pointer-events-none absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" aria-hidden="true" />
      <div className="nav-spotlight-line pointer-events-none absolute bottom-0 inset-x-0 h-px" aria-hidden="true" />

      {/* Roll No. Slip live countdown strip (mobile / tablet — the desktop
          chip covers large screens) — tap jumps straight to /roll-no-slip */}
      <RollSlipCountdown variant="strip" />

      {/* Results strip now lives at the TOP of this <nav> (see ResultsTopStrip). */}

      {/* Mobile search bar — replaced by the ⌘K command palette (opened via
          the search icon above), so this inline slide-down panel is no
          longer shown on mobile. Left removed rather than dead code. */}

      {/* ════════════ MOBILE MENU — clean full-width sheet ════════════
          Plain list with hairline dividers + chevron accordions; Admission
          is pinned as the primary call-to-action at the bottom (safe-area
          aware). Theme control lives in the header as a moon / sun button. */}
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
            className="lg:hidden border-t border-border bg-background overflow-y-auto overflow-x-hidden overscroll-contain"
            style={{ maxHeight: "calc(100svh - 64px)", WebkitTapHighlightColor: "transparent" }}
          >
            <ul className="px-4 pt-1">
              <li className="border-b border-border/60">
                <MobileDirectRow to="/" label="Home" active={location.pathname === "/"} onNavigate={closeAllMenus} />
              </li>
              {NAV_SECTIONS.map((section) => (
                <li key={section.id} className="border-b border-border/60">
                  <MobileAccordionSection
                    section={section}
                    pathname={location.pathname}
                    isOpen={mobileOpenSection === section.id}
                    onToggle={toggleMobileSection}
                    onNavigate={closeAllMenus}
                  />
                </li>
              ))}

              {/* ── Account ── */}
              {!authLoading && (
                user ? (
                  <>
                    {isAdmin && (
                      <li className="border-b border-border/60">
                        <Link
                          to="/admin"
                          onClick={closeAllMenus}
                          className="flex min-h-12 items-center justify-between py-3 text-base font-semibold text-foreground no-underline"
                        >
                          <span className="inline-flex items-center gap-2"><Shield className="h-4 w-4 text-gold" aria-hidden="true" /> Admin Panel</span>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        </Link>
                      </li>
                    )}
                    <li>
                      <button
                        onClick={() => { signOut(); closeAllMenus(); }}
                        className="flex min-h-12 w-full items-center gap-2 border-none bg-transparent py-3 text-left text-base font-semibold text-destructive cursor-pointer"
                      >
                        <LogOut className="h-4 w-4" aria-hidden="true" /> Sign Out
                      </button>
                    </li>
                  </>
                ) : (
                  <li>
                    <Link
                      to="/auth/signin"
                      onClick={closeAllMenus}
                      className="flex min-h-12 items-center gap-2 py-3 text-base font-semibold text-foreground no-underline"
                    >
                      <LogIn className="h-4 w-4 text-gold" aria-hidden="true" /> Sign In
                    </Link>
                  </li>
                )
              )}
            </ul>

            {/* Admission — pinned primary call-to-action */}
            <div className="sticky bottom-0 border-t border-border bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Link
                to="/admission"
                onClick={closeAllMenus}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-base font-semibold text-primary-foreground no-underline shadow-md transition-colors hover:bg-primary/90"
              >
                Apply for Admission
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
    {/* ── Mobile bottom dock (X-style, global) ─────────────────────────────
        5 evenly-spaced icon buttons fixed to the bottom of the viewport on
        screens < lg. Mirrors the X (Twitter) bottom bar: icons only, no
        labels, hides on scroll down, reveals on scroll up. Hidden on the
        chapter page because that page already has its own dock.

        Rendered as a SIBLING of <nav> (outside the fragment's nav element)
        — see the CONTAINING-BLOCK RULE comment above: a position:fixed
        element must not live inside the transformed <nav>, or "bottom: 0"
        pins it to the navbar instead of the viewport. */}
    {!hideGlobalBottomBar && (
      <div
        className={`dock-bar lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-card/95 backdrop-blur-sm border-t border-border transition-transform duration-300 ease-out ${
          bottomHidden ? "translate-y-full" : "translate-y-0"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
          <div className="flex items-stretch justify-around">
            {/* Home */}
            <Link
              to="/"
              aria-label="Home"
              data-active={location.pathname === "/" || undefined}
              onClick={closeAllMenus}
              className={`dock-item flex-1 flex flex-col items-center justify-center py-3 ${
                location.pathname === "/" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Home className="w-7 h-7" fill={location.pathname === "/" ? "currentColor" : "none"} />
            </Link>

            {/* Search — opens the ⌘K command palette (the working mobile
                search UI on this site; the old setSearchOpen only rendered
                inside the desktop-only container, so it did nothing here). */}
            <button
              type="button"
              aria-label="Search"
              onClick={() => { closeAllMenus(); openCommandPalette(); }}
              className="dock-item flex-1 flex flex-col items-center justify-center py-3 text-muted-foreground"
            >
              <Search className="w-7 h-7" />
            </button>

            {/* Results */}
            <Link
              to="/results"
              aria-label="Results"
              data-active={location.pathname === "/results" || undefined}
              onClick={closeAllMenus}
              className={`dock-item flex-1 flex flex-col items-center justify-center py-3 ${
                location.pathname === "/results" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Trophy className="w-7 h-7" fill={location.pathname === "/results" ? "currentColor" : "none"} />
            </Link>

            {/* Notifications — opens the existing NotificationBell panel */}
            <NotificationBell variant="bottom-bar" />

            {/* Admission */}
            <Link
              to="/admission"
              aria-label="Admission"
              data-active={location.pathname === "/admission" || undefined}
              onClick={closeAllMenus}
              className={`dock-item flex-1 flex flex-col items-center justify-center py-3 ${
                location.pathname === "/admission" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <FileSignature className="w-7 h-7" fill={location.pathname === "/admission" ? "currentColor" : "none"} />
            </Link>
          </div>
      </div>
    )}
    </>
  );
};

export default Navbar;
