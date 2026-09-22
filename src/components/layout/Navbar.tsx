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
import { useResultsCountdown, compactCountdown as compactResultsCountdown } from "@/hooks/useResultsCountdown";
import { useBisepCurrentExam } from "@/hooks/useBisepCurrentExam";
import { useSchoolSettings, safeMediaUrl } from "@/hooks/useSchoolSettings";
import { useSiteSearch } from "@/hooks/useSiteSearch";
import { useAuth } from "@/hooks/useAuth";
import NotificationBell from "@/components/shared/NotificationBell";
import ThemeSwitcher, { ThemeInlineSelector } from "@/components/shared/ThemeSwitcher";
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
    tint: "bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300",
    links: [
      { to: "/about",   label: "About",   icon: Landmark,   desc: "History, mission & facilities",      tint: "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300" },
      { to: "/gallery", label: "Gallery", icon: Images,     desc: "Photos & videos of school life",     tint: "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300" },
      { to: "/contact", label: "Contact", icon: Mail,       desc: "Address, phone & location map",      tint: "bg-teal-100 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300" },
      { to: "/faq",     label: "FAQs",    icon: HelpCircle, desc: "Answers to common questions",        tint: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300" },
    ],
  },
  {
    id: "news",
    label: "News & Events",
    icon: Newspaper,
    tagline: "Latest updates & important dates",
    tint: "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
    links: [
      { to: "/news",     label: "News",     icon: Newspaper,   desc: "Stories & latest updates",     tint: "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300" },
      { to: "/notices",  label: "Notices",  icon: Megaphone,   desc: "Official announcements",       tint: "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300" },
      { to: "/calendar", label: "Calendar", icon: CalendarDays, desc: "Events & academic dates",     tint: "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300" },
    ],
  },
  {
    id: "results",
    label: "Results",
    icon: Trophy,
    tagline: "Exam outcomes, toppers & slips",
    tint: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
    links: [
      { to: "/results",   label: "Results",   icon: Trophy, desc: "Exam results & DMCs",           tint: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300" },
      { to: "/merit-list", label: "Merit List", icon: Medal, desc: "Toppers & position holders",   tint: "bg-orange-100 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300" },
    ],
  },
  {
    id: "academics",
    label: "Academics",
    icon: BookOpen,
    tagline: "Learn anywhere, anytime",
    tint: "bg-teal-100 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300",
    links: [
      { to: "/online-classes", label: "Online Classes", icon: Video,   desc: "Live & recorded lectures",         tint: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-400/15 dark:text-fuchsia-300" },
      { to: "/notes",          label: "Notes",          icon: BookOpen, desc: "Study notes by class & subject",   tint: "bg-teal-100 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300" },
      { to: "/library",        label: "Library",        icon: Library,  desc: "Books & reading resources",        tint: "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300" },
    ],
  },
];

// The Roll No. Slip page gets its own spotlight card inside the Results
// panel (with the live countdown badge) instead of a plain row.
const rollSlipItem: NavLinkItem = {
  to: "/roll-no-slip", label: "Roll No. Slip", icon: Hash,
  desc: "Find, download & share your slip", tint: "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
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
          ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white"
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

/* ── BISE Peshawar board countdown strip (homepage header) ───────────────
   Same visual pattern as ResultsCountdown above, but driven by the LIVE
   BISE Peshawar exam countdown (useBisepCurrentExam → /api/bisep-proxy),
   not the school's own publish schedule. Whenever BISEP has a
   pre-announcement countdown running (e.g. "HSSC Annual-I Examination 2026
   Results will be announced on…"), this strip shows "Results in HH:MM:SS"
   the same way the school-results strip does, and disappears once BISEP's
   results go live. Renders independently of ResultsCountdown — both can be
   visible at once if both a school schedule AND a BISEP countdown are
   active. */
function BisepResultsCountdown() {
  const { data: bisepMeta } = useBisepCurrentExam();
  const [now, setNow] = useState(() => Date.now());

  const countdownDate = bisepMeta?.countdown_date;
  const isLive = bisepMeta?.is_live ?? false;

  useEffect(() => {
    if (!countdownDate || isLive) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [countdownDate, isLive]);

  if (!countdownDate || isLive) return null;
  const diff = new Date(countdownDate).getTime() - now;
  if (diff <= -LIVE_GRACE_MS) return null;
  const live = diff <= 0;

  return (
    <Link
      to="/results"
      aria-label="BISE Peshawar results countdown — tap to open"
      className={`lg:hidden flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold no-underline transition-colors ${
        live
          ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white"
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

/* ── Mobile accordion link row — mirrors the desktop MegaRow language:
      soft tinted chip, label + description, glowing gold active bar and a
      whisper-quiet chevron for affordance.
      memo() so a group re-render never re-paints its sibling rows. ────── */
const MobileLinkRow = memo(function MobileLinkRow({ link, active, onNavigate }: { link: NavLinkItem; active: boolean; onNavigate: () => void }) {
  const Icon = link.icon;
  return (
    <Link
      to={link.to}
      onClick={onNavigate}
      className={`relative flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm no-underline transition-colors duration-150 ${
        active ? "bg-azure/[0.10]" : "hover:bg-secondary active:bg-secondary/80"
      }`}
    >
      {active && (
        <span
          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-azure"
          aria-hidden="true"
        />
      )}
      <span
        className={`w-7 h-7 rounded-lg ${link.tint} flex items-center justify-center shrink-0`}
        aria-hidden="true"
      >
        <Icon className="w-3.5 h-3.5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block text-[12.5px] font-semibold leading-tight ${active ? "text-azure-strong dark:text-azure" : "text-foreground"}`}>
          {link.label}
        </span>
        <span className="block text-[10px] text-muted-foreground leading-tight mt-px truncate">
          {link.desc}
        </span>
      </span>
      <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground/50" aria-hidden="true" />
    </Link>
  );
});

/* ── Mobile direct-link row (Home / Admission) — its own soft card with the
      same tinted-chip language as the accordion groups, so the whole drawer
      reads as one designed system. ── */
const MobileDirectRow = memo(function MobileDirectRow({ to, label, icon: Icon, tint, active, onNavigate }: {
  to: string;
  label: string;
  icon: LucideIcon;
  tint: string;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={`relative flex items-center gap-3 px-3 py-2.5 rounded-2xl border bg-secondary/40 text-sm font-bold no-underline transition-colors duration-150 ${
        active ? "border-azure/35 bg-azure/[0.06] text-azure-strong dark:text-azure" : "border-border/50 text-foreground active:bg-secondary/70"
      }`}
    >
      {active && (
        <span
          className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-azure"
          aria-hidden="true"
        />
      )}
      <span
        className={`w-9 h-9 rounded-xl ${tint} flex items-center justify-center shrink-0`}
        aria-hidden="true"
      >
        <Icon className="w-[18px] h-[18px]" />
      </span>
      <span className="flex-1">{label}</span>
      <ArrowRight className="w-4 h-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
    </Link>
  );
});

/* ── After a group finishes expanding, glide the drawer just far enough
      that the revealed card is fully on screen. It only scrolls when the
      card is actually clipped — short groups on tall phones never jump.
      Runs AFTER the height animation, so measurements are exact. ──────── */
function revealPanelInDrawer(panel: HTMLElement | null) {
  if (!panel) return;
  const drawer = panel.closest("#mobile-menu") as HTMLElement | null;
  if (!drawer) return;
  const drawerRect = drawer.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const clipped = panelRect.bottom - drawerRect.bottom + 14;
  if (clipped > 4) {
    drawer.scrollTo({ top: drawer.scrollTop + clipped, behavior: "smooth" });
  }
}

/* ── Mobile accordion group — one of the four drop-downs, styled as its own
      quiet card (soft tinted chip, spring chevron, inset row well).
      · memo() → tapping a group re-renders only that group and the one
        closing; the other groups (20+ rows, countdown hooks and all) never
        touch the DOM. This removes the freeze-at-tap that felt like the
        menu was "hanging / stuck" on budget phones.
      · whileTap scale + a spring-rotated chevron give instant physical
        feedback the very first frame after the finger lands.
      · Height runs on the iOS sheet curve [0.32, 0.72, 0, 1] — full speed
        almost immediately, so the panel never crawls out — while links
        cascade in with a 45ms stagger so the reveal feels designed.
      All motion here is framer-motion inline transforms (the site's global
      CSS neutralises Tailwind scale/translate utilities). ──────────────── */
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
  const SectionIcon = section.icon;
  const panelRef = useRef<HTMLDivElement>(null);
  const sectionActive =
    section.links.some((l) => l.to === pathname) ||
    (section.id === "results" && pathname === "/roll-no-slip");

  return (
    <div
      className={`rounded-2xl border overflow-hidden transition-colors duration-200 ${
        sectionActive ? "border-azure/30 bg-azure/[0.04]" : "border-border/50 bg-secondary/40"
      }`}
    >
      <motion.button
        type="button"
        onClick={() => onToggle(section.id)}
        aria-expanded={isOpen}
        aria-controls={`m-panel-${section.id}`}
        whileTap={{ scale: 0.985 }}
        className="relative w-full flex items-center gap-3 px-3 py-2.5 text-left no-underline touch-manipulation select-none"
      >
        {sectionActive && (
          <span
            className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-azure"
            aria-hidden="true"
          />
        )}
        <span
          className={`w-9 h-9 rounded-xl ${section.tint} flex items-center justify-center shrink-0`}
          aria-hidden="true"
        >
          <SectionIcon className="w-[18px] h-[18px]" />
        </span>
        <span className="flex-1 min-w-0">
          <span className={`block text-[13.5px] font-bold leading-tight ${sectionActive ? "text-azure-strong dark:text-azure" : "text-foreground"}`}>
            {section.label}
          </span>
          <span className="block text-[10.5px] text-muted-foreground leading-tight mt-px truncate">
            {section.tagline}
          </span>
        </span>
        <motion.span
          aria-hidden="true"
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 38 }}
          className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors duration-200 ${
            isOpen ? "text-azure bg-azure/10" : "text-muted-foreground/60"
          }`}
        >
          <ChevronDown className="w-4 h-4" />
        </motion.span>
      </motion.button>

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
                gridTemplateRows: { duration: 0.32, ease: [0.32, 0.72, 0, 1] },
                opacity: { duration: 0.22, ease: "easeOut" },
              },
            }}
            exit={{
              gridTemplateRows: "0fr",
              opacity: 0,
              transition: {
                gridTemplateRows: { duration: 0.22, ease: [0.55, 0, 0.55, 0.2] },
                opacity: { duration: 0.14, ease: "easeIn" },
              },
            }}
            style={{ display: "grid", willChange: "grid-template-rows, opacity" }}
            className="overflow-hidden"
            onAnimationComplete={() => revealPanelInDrawer(panelRef.current)}
          >
            <div className="min-h-0 overflow-hidden">
            <div ref={panelRef} className="px-2 pb-2 pt-0.5">
              {/* inset well — rows sit on a quieter surface than the card */}
              <div className="rounded-xl border border-border/40 bg-background/60 p-1">
                {section.links.map((link, i) => (
                  <motion.div
                    key={link.to}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 + i * 0.045, duration: 0.24, ease: "easeOut" }}
                  >
                    <MobileLinkRow link={link} active={pathname === link.to} onNavigate={onNavigate} />
                  </motion.div>
                ))}
                {/* Results group: Roll No. Slip row — same cream-card row
                    language as its siblings, live countdown badge kept */}
                {section.id === "results" && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 + section.links.length * 0.045, duration: 0.24, ease: "easeOut" }}
                  >
                    <Link
                      to={rollSlipItem.to}
                      onClick={onNavigate}
                      className={`relative flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm no-underline transition-colors duration-150 ${
                        pathname === rollSlipItem.to ? "bg-azure/[0.10]" : "hover:bg-secondary active:bg-secondary/80"
                      }`}
                    >
                      {pathname === rollSlipItem.to && (
                        <span
                          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-azure"
                          aria-hidden="true"
                        />
                      )}
                      <span
                        className={`w-7 h-7 rounded-lg ${rollSlipItem.tint} flex items-center justify-center shrink-0`}
                        aria-hidden="true"
                      >
                        <Hash className="w-3.5 h-3.5" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className={`block text-[12.5px] font-semibold leading-tight ${pathname === rollSlipItem.to ? "text-azure-strong dark:text-azure" : "text-foreground"}`}>
                          {rollSlipItem.label}
                        </span>
                        <span className="block text-[10px] text-muted-foreground leading-tight mt-px truncate">
                          {rollSlipItem.desc}
                        </span>
                      </span>
                      <RollSlipCountdown variant="menu-badge" />
                    </Link>
                  </motion.div>
                )}
              </div>
            </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

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
                          <div className="absolute top-0 inset-x-5 h-px bg-gradient-to-r from-transparent via-azure/50 to-transparent" aria-hidden="true" />
                          
                          {/* micro eyebrow — small azure icon + tagline, one whisper line */}
                          <div className="relative flex items-center gap-2 px-4 pt-3 pb-1">
                            <SectionIcon className="w-3 h-3 text-azure shrink-0" aria-hidden="true" />
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

        {/* Mobile: Search icon + Hamburger — outside the drawer.
            The search icon now opens the full ⌘K command palette (fuzzy
            search + quick actions + recents) instead of the old inline
            search bar, so mobile gets the exact same experience as
            desktop's Cmd/Ctrl+K. */}
        <div className="lg:hidden flex items-center gap-1 shrink-0 ml-2">
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

      {/* subtle gold hairline glowing along the navbar's bottom edge — base
          wash stays static so the line is never fully invisible, and the
          reactive spotlight (nav-spotlight-line, driven by --mouse-x from
          handleNavMouseMove above) brightens only under the cursor */}
      <div className="pointer-events-none absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" aria-hidden="true" />
      <div className="nav-spotlight-line pointer-events-none absolute bottom-0 inset-x-0 h-px" aria-hidden="true" />

      {/* Roll No. Slip live countdown strip (mobile / tablet — the desktop
          chip covers large screens) — tap jumps straight to /roll-no-slip */}
      <RollSlipCountdown variant="strip" />

      {/* Results live countdown strip — same spot, appears whenever a
          school/BISE results publish is scheduled, tap jumps to /results */}
      <ResultsCountdown />

      {/* BISE Peshawar board countdown strip — same spot, appears whenever
          BISEP itself has a pre-announcement countdown running (independent
          of the school's own publish schedule above) */}
      <BisepResultsCountdown />

      {/* Mobile search bar — replaced by the ⌘K command palette (opened via
          the search icon above), so this inline slide-down panel is no
          longer shown on mobile. Left removed rather than dead code. */}

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
            <div className="p-3 pb-5 space-y-2.5" style={{ WebkitTapHighlightColor: "transparent" }}>

              {/* eyebrow — ties the drawer to the school brand */}
              <div className="flex items-center justify-between px-1.5">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground/80">Menu</p>
                <p className="text-[10px] text-muted-foreground/70">{settings?.school_name || "GHS Babi Khel"}</p>
              </div>

              {/* ── Direct link: Home ── */}
              <MobileDirectRow
                to="/"
                label="Home"
                icon={Home}
                tint="bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"
                active={location.pathname === "/"}
                onNavigate={closeAllMenus}
              />

              {/* ── Grouped accordion sections — four quiet cards, one per
                     section. Each group is a memoised component:
                     opening one never re-renders the others, the expand runs
                     on the iOS sheet curve with a staggered link cascade,
                     and a finished group glides into view if it was clipped
                     — silky, never "hanging". ──────────────────────────── */}
              <div className="space-y-2">
                {NAV_SECTIONS.map((section) => (
                  <MobileAccordionSection
                    key={section.id}
                    section={section}
                    pathname={location.pathname}
                    isOpen={mobileOpenSection === section.id}
                    onToggle={toggleMobileSection}
                    onNavigate={closeAllMenus}
                  />
                ))}
              </div>

              {/* ── Direct link: Admission ── */}
              <MobileDirectRow
                to="/admission"
                label="Admission"
                icon={ClipboardList}
                tint="bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"
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
                  <div className="rounded-[22px] border border-border/70 bg-secondary/30 p-1.5 space-y-1">
                    {isAdmin && (
                      <Link
                        to="/admin"
                        onClick={closeAllMenus}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-background/70 border border-border/60 text-foreground font-semibold text-sm no-underline transition-colors duration-150 active:bg-secondary/70"
                      >
                        <span className="w-10 h-10 rounded-[13px] bg-gradient-to-br from-sky-600 to-indigo-700 text-white flex items-center justify-center shrink-0 shadow-sm ring-1 ring-inset ring-white/25" aria-hidden="true">
                          <Shield className="w-[18px] h-[18px]" />
                        </span>
                        <span className="flex-1">Admin Panel</span>
                        <ArrowRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
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
        className={`lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-card/95 backdrop-blur-sm border-t border-border transition-transform duration-300 ease-out ${
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
              className={`flex-1 flex flex-col items-center justify-center py-2.5 ${
                location.pathname === "/" ? "text-accent" : "text-muted-foreground"
              }`}
            >
              <Home className="w-5 h-5" fill={location.pathname === "/" ? "currentColor" : "none"} />
            </Link>

            {/* Search — opens the ⌘K command palette (the working mobile
                search UI on this site; the old setSearchOpen only rendered
                inside the desktop-only container, so it did nothing here). */}
            <button
              type="button"
              aria-label="Search"
              onClick={() => { closeAllMenus(); openCommandPalette(); }}
              className="flex-1 flex flex-col items-center justify-center py-2.5 text-muted-foreground"
            >
              <Search className="w-5 h-5" />
            </button>

            {/* Results */}
            <Link
              to="/results"
              aria-label="Results"
              data-active={location.pathname === "/results" || undefined}
              onClick={closeAllMenus}
              className={`flex-1 flex flex-col items-center justify-center py-2.5 ${
                location.pathname === "/results" ? "text-accent" : "text-muted-foreground"
              }`}
            >
              <Trophy className="w-5 h-5" fill={location.pathname === "/results" ? "currentColor" : "none"} />
            </Link>

            {/* Notifications — opens the existing NotificationBell panel */}
            <NotificationBell variant="bottom-bar" />

            {/* Admission */}
            <Link
              to="/admission"
              aria-label="Admission"
              data-active={location.pathname === "/admission" || undefined}
              onClick={closeAllMenus}
              className={`flex-1 flex flex-col items-center justify-center py-2.5 ${
                location.pathname === "/admission" ? "text-accent" : "text-muted-foreground"
              }`}
            >
              <FileSignature className="w-5 h-5" fill={location.pathname === "/admission" ? "currentColor" : "none"} />
            </Link>
          </div>
      </div>
    )}
    </>
  );
};

export default Navbar;
