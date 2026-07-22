// src/components/shared/AiResultSummaryCard.tsx
// "AI Summary" card shown beside (or below, on mobile) each exam result card
// on the /results page. Auto-fetches a short, friendly, 4–5 line personalized
// summary of the student's result from the /api/ai-result-summary serverless
// function (which calls Z.AI's GLM-4.5-Flash).
//
// Per site-owner request (2026-07-22):
//   • Summary should be 4–5 short sentences with emojis, like:
//       "🎯 You scored 78% with a B grade — solid effort!
//        💪 Math is your superpower at 92% — keep that momentum.
//        📚 English at 54% is your growth zone — 15 min of daily reading will lift it.
//        🏆 You're ranked #4 in class — top 10%, well done!
//        🚀 Aim for 85%+ next term — you've got the foundation, now push consistency."
//   • Auto-fetches by default the moment a result is shown (no button click).
//   • Mobile-friendly: card stacks below the result card on small screens,
//     sits beside it (right column) on lg+ screens.
//   • Errors / timeouts are non-fatal — the card just shows a graceful
//     "couldn't load AI summary" message; the result card itself is unaffected.

import { useEffect, useState } from "react";
import { m } from "framer-motion";
import { Sparkles, Loader2, RefreshCw, AlertCircle } from "lucide-react";

// ── Payload type ──────────────────────────────────────────────────────────
// Mirrors the shape accepted by /api/ai-result-summary. Both the school's
// own result (RCResult) and the BISE Peshawar result (BiseResult) are
// mapped into this shape by the caller before passing it in.
export interface AiResultSummaryPayload {
  name?: string | null;
  roll_no?: string | null;
  class?: string | null;
  exam_type?: string | null;
  year?: number | null;
  total_marks?: number | null;
  obtained_marks?: number | null;
  percentage?: number | null;
  grade?: string | null;
  is_pass?: boolean | null;
  position?: number | null;
  school_rank?: number | null;
  total_students?: number | null;
  subject_marks?: Record<string, { obtained: number; total: number }> | null;
  subjects?: Array<{ subject?: string; theory?: string; practical?: string }> | null;
  source?: "school" | "bisep" | null;
}

interface AiResultSummaryCardProps {
  result: AiResultSummaryPayload;
  // Optional key — when this changes, the summary is refetched. Useful when
  // the parent reuses the component instance across different results
  // (e.g. when the visitor searches a new roll number).
  fetchKey?: string | number;
}

const API_ENDPOINT = "/api/ai-result-summary";
const CLIENT_TIMEOUT_MS = 30000; // hard client cap (server cap is 25s)

const AiResultSummaryCard = ({ result, fetchKey }: AiResultSummaryCardProps) => {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-fetch whenever the result payload or fetchKey changes. This is the
  // "default AI summarize" behavior the site owner asked for — no button to
  // click, the summary appears automatically the moment a result is shown.
  useEffect(() => {
    let cancelled = false;

    const fetchSummary = async () => {
      setLoading(true);
      setError(null);
      setSummary(null);

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

        const res = await fetch(API_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ result }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || `Request failed (${res.status}).`);
        }
        const reply: string = data?.summary ?? "";
        if (!reply || !reply.trim()) {
          throw new Error("AI did not return a summary.");
        }
        if (!cancelled) setSummary(reply.trim());
      } catch (err: any) {
        if (cancelled) return;
        if (err?.name === "AbortError") {
          setError("The AI is taking too long. Tap retry to try again.");
        } else {
          setError(err?.message || "Couldn't load AI summary.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSummary();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey]);

  // A small accent header strip whose color depends on pass/fail — gives
  // the card a quick visual tie to the result card it sits beside.
  const accentBar = result.is_pass === false
    ? "from-rose-500/80 to-amber-500/70"
    : "from-emerald-500/80 to-sky-500/70";

  return (
    <m.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card to-muted/40 shadow-card"
    >
      {/* Accent strip — quick pass/fail visual cue, matches the result card */}
      <div className={`h-1.5 w-full bg-gradient-to-r ${accentBar}`} />

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card/60">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-primary">
          <Sparkles className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground leading-tight">AI Summary</p>
          <p className="text-[11px] text-muted-foreground leading-tight">
            Auto-generated · study tips &amp; focus areas
          </p>
        </div>
        {loading && (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground ml-auto" />
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3.5">
        {loading && (
          <div className="space-y-2 animate-pulse">
            <div className="h-3 rounded-full bg-muted/80 w-[92%]" />
            <div className="h-3 rounded-full bg-muted/80 w-[85%]" />
            <div className="h-3 rounded-full bg-muted/80 w-[78%]" />
            <div className="h-3 rounded-full bg-muted/70 w-[70%]" />
            <div className="h-3 rounded-full bg-muted/60 w-[60%]" />
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-start gap-2 text-left">
            <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="leading-relaxed">{error}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                // Bump fetchKey-equivalent by re-triggering the effect via
                // state toggle — simplest is to clear error + set loading
                // and re-fetch inline. We just re-use the same effect by
                // toggling a re-render via setSummary(null) and forcing
                // the effect to re-run via the empty payload dep change.
                setError(null);
                setSummary(null);
                // Force the parent effect to refetch by toggling a state
                // value the effect depends on — here we just refetch inline.
                (async () => {
                  try {
                    setLoading(true);
                    const controller = new AbortController();
                    const t = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
                    const res = await fetch(API_ENDPOINT, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ result }),
                      signal: controller.signal,
                    });
                    clearTimeout(t);
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data?.error || "Retry failed.");
                    const reply: string = data?.summary ?? "";
                    if (!reply.trim()) throw new Error("AI did not return a summary.");
                    setSummary(reply.trim());
                  } catch (err: any) {
                    setError(err?.message || "Couldn't load AI summary.");
                  } finally {
                    setLoading(false);
                  }
                })();
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        )}

        {!loading && !error && summary && (
          // Each line of the summary is rendered as its own paragraph — the
          // model returns 4–5 newline-separated lines per the system prompt.
          // Leading emoji stays inline; lines wrap on small screens.
          <div className="space-y-1.5">
            {summary
              .split(/\r?\n/)
              .map((line, i) => (
                <p
                  key={i}
                  className="text-sm leading-snug text-foreground/90 flex gap-1.5"
                >
                  <span className="shrink-0">{i + 1}.</span>
                  <span className="whitespace-pre-wrap">{line.trim()}</span>
                </p>
              ))}
          </div>
        )}
      </div>

      {/* Footer — tiny disclaimer so visitors know it's AI-generated */}
      {!loading && !error && summary && (
        <div className="px-4 py-2 border-t border-border bg-card/40">
          <p className="text-[10px] text-muted-foreground leading-tight">
            ✨ AI-generated study suggestions based on your marks. Always
            verify official records with the school office.
          </p>
        </div>
      )}
    </m.div>
  );
};

export default AiResultSummaryCard;
