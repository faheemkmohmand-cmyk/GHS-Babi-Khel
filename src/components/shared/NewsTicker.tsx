import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useNotices } from "@/hooks/useNotices";
import { useNews } from "@/hooks/useNews";
import { useAdmissionSettings } from "@/hooks/useAdmission";
import { useBisepCurrentExam } from "@/hooks/useBisepCurrentExam";

/* ═══════════════════════════════════════════════════════════════════════════
   HOMEPAGE HEADLINE TICKER — one live, auto-updating strip that reflects
   whatever is CURRENTLY real on the site: open admissions, published
   results (school or the live BISE Peshawar exam title), a live merit
   list, an active roll-no slip session, plus the latest notices and news.
   Every source is optional — a source with nothing published simply
   contributes no headline, so the ticker never shows an empty/stale
   feature. Every query is wrapped so one failing source can never blank
   the others. ═══════════════════════════════════════════════════════════ */

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

/* ── Any published roll-no-slip session? ── */
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
  const { data: bisepMeta } = useBisepCurrentExam();

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

    // Results: school results once the admin publishes any; otherwise the
    // live BISE Peshawar exam title (real title fetched from BISEP itself,
    // same source /results uses). Wording stays neutral either way, since
    // the admin can switch from BISE fallback to school results at any time.
    if (hasSchoolResults) {
      list.push({
        id: "results-live",
        text: "School Exam Results 2026 Are Live",
        to: "/results",
      });
    } else if (bisepMeta?.exam_title) {
      list.push({
        id: "results-bisep",
        text: `BISE Peshawar ${bisepMeta.exam_title} Results Available`,
        to: "/results",
      });
    }

    if (latestMeritList) {
      const scopeLabel =
        latestMeritList.scope === "class" && latestMeritList.class
          ? `Class ${latestMeritList.class}`
          : "School-wide";
      const baseLabel = latestMeritList.title?.trim() || `${scopeLabel} Toppers`;
      // Only append the year if it isn't already present in the title
      // (admin-entered titles like "9th & 10th Merit List 2026" already
      // include it — appending again produced "2026 (2026)").
      const yearSuffix =
        latestMeritList.year && !baseLabel.includes(String(latestMeritList.year))
          ? ` (${latestMeritList.year})`
          : "";
      list.push({
        id: `merit-${latestMeritList.id}`,
        text: `Merit List Published — ${baseLabel}${yearSuffix}`,
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
  }, [isAdmissionEffectivelyOpen, admSettings, hasSchoolResults, bisepMeta, latestMeritList, liveRollSlip, notices, news]);

  // A stable content signature — only changes when the actual visible text
  // changes (not on every background refetch). Prevents the animation from
  // restarting/"shaking" on routine polling when nothing actually changed.
  const contentKey = items.map((it) => it.id + "|" + it.text).join("~~");

  return <TickerStrip items={items} contentKey={contentKey} />;
};

/* ── The actual scrolling strip, isolated so it can measure real rendered
      pixel widths (not guessed) and only restart its animation when the
      content itself changes. This is what makes the loop a genuine,
      continuous right-to-left "news ticker" motion: one copy of the
      content is measured, a second identical copy is placed immediately
      after it, and the whole track is animated by exactly that measured
      width — so the last headline fully exits on the left before its
      own repeat re-enters on the right, with no jump, snap or shake. ── */
function TickerStrip({ items, contentKey }: { items: HeadlineItem[]; contentKey: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [singleWidth, setSingleWidth] = useState(0);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    // The track currently renders ONE copy (see below) — measure it, then
    // we duplicate in render using that measurement for the animation.
    const measure = () => setSingleWidth(el.scrollWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey]);

  // Fixed, brisk pace in px/second — real news-ticker speed, independent
  // of item count, so it never feels sluggish no matter how much content
  // is queued.
  const PIXELS_PER_SECOND = 48;
  const durationSecs = singleWidth > 0 ? Math.max(4, singleWidth / PIXELS_PER_SECOND) : 20;

  const renderRow = (copyIndex: 0 | 1) => (
    <div
      key={copyIndex}
      ref={copyIndex === 0 ? trackRef : undefined}
      className="flex gap-10 whitespace-nowrap shrink-0"
      aria-hidden={copyIndex === 1}
    >
      {items.map((item, idx) => (
        <Link
          key={`${item.id}-${copyIndex}-${idx}`}
          to={item.to}
          className="text-xs sm:text-sm font-medium inline-flex items-center gap-2 text-white/95 hover:text-white underline-offset-2 hover:underline cursor-pointer transition-colors"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-white/70 inline-block shrink-0" aria-hidden="true" />
          {item.text}
        </Link>
      ))}
    </div>
  );

  return (
    <div className="relative bg-gradient-to-r from-azure-strong via-azure to-azure-strong py-1.5 overflow-hidden">
      <div className="px-4 flex items-center">
        <div className="flex-1 overflow-hidden relative">
          <div className="absolute left-0 top-0 h-full w-6 sm:w-10 bg-gradient-to-r from-azure-strong to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 h-full w-6 sm:w-10 bg-gradient-to-l from-azure-strong to-transparent z-10 pointer-events-none" />

          {/* The strip starts fully off-screen to the RIGHT and scrolls to
              exactly -singleWidth (one full copy width) to the LEFT, then
              restarts — since the second copy is glued right after the
              first, the restart is invisible: it's the same pixels in the
              same place, mid-stride, not a snap. */}
          <div
            className="flex will-change-transform"
            style={
              singleWidth > 0
                ? {
                    animation: `ticker-scroll-${Math.round(singleWidth)} ${durationSecs}s linear infinite`,
                  }
                : undefined
            }
          >
            {renderRow(0)}
            <div className="w-10 shrink-0" aria-hidden="true" />
            {renderRow(1)}
            <div className="w-10 shrink-0" aria-hidden="true" />
          </div>
        </div>
      </div>

      {singleWidth > 0 && (
        <style>{`
          @keyframes ticker-scroll-${Math.round(singleWidth)} {
            0%   { transform: translateX(0); }
            100% { transform: translateX(-${singleWidth + 40}px); }
          }
        `}</style>
      )}
    </div>
  );
}

export default NewsTicker;
