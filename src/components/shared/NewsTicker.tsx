import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
   ticker never shows an empty or stale feature.

   Every query below is wrapped so a single failing/missing table can never
   blank the whole ticker — each source degrades to "no headline from this
   source" on error, instead of throwing and starving the others. ═════════ */

interface HeadlineItem {
  id: string;
  text: string;
  to: string;
}

/** Never throws — a failed source just contributes nothing. */
async function safeQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/* ── Is there a published school result right now? (mirrors Results.tsx) ── */
function usePublishedSchoolResults() {
  return useQuery<boolean>({
    queryKey: ["ticker-has-published-school-results"],
    queryFn: () =>
      safeQuery(async () => {
        const { count, error } = await supabase
          .from("results")
          .select("id", { count: "exact", head: true })
          .eq("is_published", true);
        if (error) throw error;
        return (count ?? 0) > 0;
      }, false),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}

/* ── Most recent published merit list, if any ── */
function useLatestMeritList() {
  return useQuery({
    queryKey: ["ticker-latest-merit-list"],
    queryFn: () =>
      safeQuery(async () => {
        const { data, error } = await supabase
          .from("merit_lists")
          .select("id, scope, class, exam_type, year, title")
          .eq("is_published", true)
          .order("created_at", { ascending: false })
          .limit(1);
        if (error) throw error;
        return data?.[0] ?? null;
      }, null),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}

/* ── Any published / currently-live roll-no-slip session? ── */
function useLiveRollSlipSession() {
  return useQuery({
    queryKey: ["ticker-live-roll-slip-session"],
    queryFn: () =>
      safeQuery(async () => {
        const { data, error } = await supabase
          .from("exam_roll_sessions")
          .select("id, title, exam_year, exam_term")
          .eq("is_published", true)
          .order("created_at", { ascending: false })
          .limit(1);
        if (error) throw error;
        return data?.[0] ?? null;
      }, null),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000,
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

    // Results: reflects whichever mode /results is actually in right now —
    // school results once the admin publishes any, BISE Peshawar until then.
    if (hasSchoolResults) {
      list.push({
        id: "results-live",
        text: "School Exam Results Are Live — Check Your Result Now",
        to: "/results",
      });
    } else {
      list.push({
        id: "results-bisep",
        text: "BISE Peshawar Results Available — Search Your Roll Number",
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
        text: `Merit List Published — ${latestMeritList.title || scopeLabel + " Toppers"}${latestMeritList.year ? ` (${latestMeritList.year})` : ""}`,
        to: "/merit-list",
      });
    }

    if (liveRollSlip) {
      const label = liveRollSlip.title || `${liveRollSlip.exam_term ?? ""} ${liveRollSlip.exam_year ?? ""}`.trim();
      list.push({
        id: `rollslip-${liveRollSlip.id}`,
        text: `Roll No. Slips Available${label ? ` — ${label}` : ""} — Download Yours Now`,
        to: "/roll-no-slip",
      });
    }

    for (const n of notices) {
      list.push({ id: `notice-${n.id}`, text: n.title, to: `/notices/${n.id}` });
    }

    for (const n of news) {
      list.push({ id: `news-${n.id}`, text: n.title, to: `/news/${n.id}` });
    }

    if (list.length === 0) {
      list.push({
        id: "welcome",
        text: "Welcome to GHS Babi Khel — Excellence in Education",
        to: "/",
      });
    }

    return list;
  }, [isAdmissionEffectivelyOpen, admSettings, hasSchoolResults, latestMeritList, liveRollSlip, notices, news]);

  // Duplicate the sequence exactly once so the strip can scroll one full
  // copy-width and loop with zero seam: the second copy is already onscreen,
  // sliding in from the right, by the time the first copy exits left. It
  // never resets or snaps — it just keeps gliding continuously.
  const loopItems = [...items, ...items];

  // Fixed, brisk px/second speed (not item-count based) so the strip never
  // feels sluggish on mobile regardless of how much content is queued —
  // duration is derived from content length so speed (not pace-per-item)
  // stays constant.
  const PIXELS_PER_SECOND = 90;
  const APPROX_CHARS_PER_ITEM_PX = 8.5; // rough px width per character at text-sm
  const approxContentWidth = items.reduce((sum, it) => sum + it.text.length * APPROX_CHARS_PER_ITEM_PX + 60, 0);
  const durationSecs = Math.max(6, approxContentWidth / PIXELS_PER_SECOND);

  return (
    <div className="relative bg-gradient-to-r from-azure-strong via-azure to-azure-strong py-1.5 overflow-hidden">
      <div className="px-4 flex items-center">
        {/* Scrolling headline strip — full-bleed, no label chip */}
        <div className="flex-1 overflow-hidden relative">
          {/* Fade edges so items appear/disappear softly, not with a hard cut */}
          <div className="absolute left-0 top-0 h-full w-6 sm:w-10 bg-gradient-to-r from-azure-strong to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 h-full w-6 sm:w-10 bg-gradient-to-l from-azure-strong to-transparent z-10 pointer-events-none" />

          <div
            className="flex gap-10 whitespace-nowrap will-change-transform"
            style={{ animation: `ticker-scroll ${durationSecs}s linear infinite` }}
          >
            {loopItems.map((item, idx) => (
              <Link
                key={`${item.id}-${idx}`}
                to={item.to}
                className="text-xs sm:text-sm font-medium inline-flex items-center gap-2 text-white/95 hover:text-white underline-offset-2 hover:underline cursor-pointer transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white/70 inline-block shrink-0" aria-hidden="true" />
                {item.text}
              </Link>
            ))}
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
