import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Megaphone, Trophy, Medal, Hash, Bell, Newspaper as NewsIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useNotices } from "@/hooks/useNotices";
import { useNews } from "@/hooks/useNews";
import { useAdmissionSettings } from "@/hooks/useAdmission";

/* ═══════════════════════════════════════════════════════════════════════════
   HOMEPAGE HEADLINE TICKER — one live, auto-updating strip that reflects
   whatever is CURRENTLY real on the site: open admissions, published
   results (school or BISE Peshawar), a live merit list, an active roll-no
   slip session, plus the latest notices and news. Every source is optional —
   a source with nothing published simply contributes no headline, so the
   ticker never shows an empty or stale feature. ═══════════════════════════ */

interface HeadlineItem {
  id: string;
  kind: "admission" | "results" | "merit" | "rollslip" | "notice" | "news";
  text: string;
  to: string;
}

const KIND_ICON: Record<HeadlineItem["kind"], typeof Megaphone> = {
  admission: Megaphone,
  results: Trophy,
  merit: Medal,
  rollslip: Hash,
  notice: Bell,
  news: NewsIcon,
};

/* ── Is there a published school result right now? (mirrors Results.tsx) ── */
function usePublishedSchoolResults() {
  return useQuery<boolean>({
    queryKey: ["ticker-has-published-school-results"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("results")
        .select("id", { count: "exact", head: true })
        .eq("is_published", true);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

/* ── Most recent published merit list, if any ── */
function useLatestMeritList() {
  return useQuery({
    queryKey: ["ticker-latest-merit-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merit_lists")
        .select("id, scope, class, exam_type, year, title")
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

/* ── Any published / currently-live roll-no-slip session? ── */
function useLiveRollSlipSession() {
  return useQuery({
    queryKey: ["ticker-live-roll-slip-session"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_roll_sessions")
        .select("id, title, exam_year, exam_term")
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

const NewsTicker = () => {
  const { data: notices = [] } = useNotices(6);
  const { data: news = [] } = useNews(6);
  const { data: admSettings } = useAdmissionSettings();
  const { data: hasSchoolResults } = usePublishedSchoolResults();
  const { data: latestMeritList } = useLatestMeritList();
  const { data: liveRollSlip } = useLiveRollSlipSession();

  // Admissions: closed if last_date has passed, even if DB is_open=true —
  // mirrors the same fix on /admission and Home.tsx.
  const isAdmissionEffectivelyOpen = (() => {
    if (!admSettings?.is_open) return false;
    if (!admSettings.last_date) return true;
    return new Date(admSettings.last_date) >= new Date(new Date().toDateString());
  })();

  const items = useMemo<HeadlineItem[]>(() => {
    const list: HeadlineItem[] = [];

    if (isAdmissionEffectivelyOpen && admSettings) {
      list.push({
        id: "admission-open",
        kind: "admission",
        text:
          admSettings.banner_message ??
          `Admissions Open for Session ${admSettings.session_year} — Apply Online Today${
            admSettings.last_date
              ? ` | Last Date: ${new Date(admSettings.last_date).toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" })}`
              : ""
          }`,
        to: "/admission",
      });
    }

    if (hasSchoolResults) {
      list.push({
        id: "results-live",
        kind: "results",
        text: "School Exam Results Are Live — Check Your Result Now",
        to: "/results",
      });
    } else {
      // No school result published yet → the /results page itself falls back
      // to live BISE Peshawar search, so the ticker reflects that mode too.
      list.push({
        id: "results-bisep",
        kind: "results",
        text: "BISE Peshawar Results — Search Your Roll Number Now",
        to: "/results",
      });
    }

    if (latestMeritList) {
      const scopeLabel =
        latestMeritList.scope === "class" && latestMeritList.class
          ? `Class ${latestMeritList.class}`
          : "School-wide";
      list.push({
        id: `merit-${latestMeritList.id}`,
        kind: "merit",
        text: `Merit List Published — ${latestMeritList.title || scopeLabel + " Toppers"}${latestMeritList.year ? ` (${latestMeritList.year})` : ""}`,
        to: "/merit-list",
      });
    }

    if (liveRollSlip) {
      const label = liveRollSlip.title || `${liveRollSlip.exam_term ?? ""} ${liveRollSlip.exam_year ?? ""}`.trim();
      list.push({
        id: `rollslip-${liveRollSlip.id}`,
        kind: "rollslip",
        text: `Roll No. Slips Available${label ? ` — ${label}` : ""} — Download Yours Now`,
        to: "/roll-no-slip",
      });
    }

    for (const n of notices) {
      list.push({ id: `notice-${n.id}`, kind: "notice", text: n.title, to: `/notices/${n.id}` });
    }

    for (const n of news) {
      list.push({ id: `news-${n.id}`, kind: "news", text: n.title, to: `/news/${n.id}` });
    }

    if (list.length === 0) {
      list.push({
        id: "welcome",
        kind: "notice",
        text: "Welcome to GHS Babi Khel — Excellence in Education",
        to: "/",
      });
    }

    return list;
  }, [isAdmissionEffectivelyOpen, admSettings, hasSchoolResults, latestMeritList, liveRollSlip, notices, news]);

  // Duplicate the sequence so the strip can scroll one full width and loop
  // with zero seam — the "second copy" is already onscreen sliding in from
  // the right by the time the first copy exits left, so it never resets or
  // jumps; it just keeps gliding.
  const loopItems = [...items, ...items];

  // Speed scales gently with content so a longer headline set doesn't feel
  // rushed, but never crawls either.
  const durationSecs = Math.max(18, items.length * 6);

  return (
    <div className="relative bg-gradient-to-r from-azure-strong via-azure to-azure-strong text-white py-1.5 overflow-hidden shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_-1px_0_rgba(0,0,0,0.08)_inset]">
      <div className="container mx-auto px-4 flex items-center gap-3">
        {/* Label chip — bright blue brand, matches the new bar */}
        <div
          className="flex items-center gap-1.5 shrink-0 bg-white/15 backdrop-blur-sm py-1 pl-4 pr-4 text-xs font-bold uppercase tracking-wider text-white -ml-4 ring-1 ring-inset ring-white/20"
          style={{ clipPath: "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)" }}
        >
          <Megaphone className="w-3 h-3 animate-pulse" />
          Live Updates
        </div>

        {/* Scrolling headline strip */}
        <div className="flex-1 overflow-hidden relative">
          {/* Fade edges so items appear/disappear softly, not with a hard cut */}
          <div className="absolute left-0 top-0 h-full w-8 bg-gradient-to-r from-azure to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-azure to-transparent z-10 pointer-events-none" />

          <div
            className="flex gap-12 whitespace-nowrap will-change-transform"
            style={{ animation: `ticker-scroll ${durationSecs}s linear infinite` }}
          >
            {loopItems.map((item, idx) => {
              const Icon = KIND_ICON[item.kind];
              return (
                <Link
                  key={`${item.id}-${idx}`}
                  to={item.to}
                  className="text-sm font-medium inline-flex items-center gap-2 text-white/95 hover:text-white underline-offset-2 hover:underline cursor-pointer transition-colors"
                >
                  <Icon className="w-3.5 h-3.5 shrink-0 opacity-90" aria-hidden="true" />
                  {item.text}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes ticker-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
};

export default NewsTicker;
