// src/components/shared/AiResultSummaryCard.tsx
// "AI Summary" card shown beside (or below, on mobile) each exam result card
// on the /results page. Auto-fetches a short, friendly, 4–5 line personalized
// summary of the student's result from the /api/ai-result-summary serverless
// function (which calls Z.AI's GLM-4.5-Flash).
//
// STREAMING (per site-owner request, 2026-07-22):
//   The /api/ai-result-summary endpoint now returns a Server-Sent Events
//   stream. The first SSE event is a deterministic `fallback` summary built
//   directly from the result payload (visible in <50ms — guarantees the
//   visitor ALWAYS sees something useful, even if the model is slow/down).
//   The model's tokens then stream in via `{ token }` events and REPLACE
//   the fallback once they start arriving. The summary text updates LIVE
//   in the card as tokens arrive — no more "Loading…" spinner for 4 seconds
//   followed by a wall of text.
//
//   Per site-owner request:
//   • Auto-fetches by default the moment a result is shown (no button click).
//   • Mobile-friendly: card stacks below the result card on small screens,
//     sits beside it (right column) on lg+ screens.
//   • Errors / timeouts are non-fatal — the deterministic fallback is kept
//     visible; the result card itself is unaffected.

import { useEffect, useState, useRef } from "react";
import { m } from "framer-motion";
import { Sparkles, RefreshCw, AlertCircle } from "lucide-react";

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
  fetchKey?: string | number;
}

const API_ENDPOINT = "/api/ai-result-summary";
const CLIENT_TIMEOUT_MS = 60000;

// ── SSE stream parser (same as in AIAssistantWidget) ──────────────────────
async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<any, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let lineBuf = "";

  try {
    while (true) {
      if (signal?.aborted) break;
      const { value, done } = await reader.read();
      if (done) break;

      lineBuf += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = lineBuf.indexOf("\n\n")) !== -1) {
        const frame = lineBuf.slice(0, idx);
        lineBuf = lineBuf.slice(idx + 2);

        const dataLines = frame
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim());
        if (dataLines.length === 0) continue;

        const dataStr = dataLines[dataLines.length - 1];
        if (dataStr === "[DONE]") return;

        try {
          yield JSON.parse(dataStr);
        } catch {
          // Ignore malformed frames
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // already released
    }
  }
}

interface StreamState {
  // The deterministic fallback summary — shown FIRST, before any model
  // tokens arrive. Stays visible if the model fails.
  fallback: string | null;
  // The model's streamed text so far (empty until the first token).
  modelText: string;
  // True once the first model token has arrived (fallback is hidden).
  modelStarted: boolean;
  // True while the stream is still open.
  streaming: boolean;
  // Set if the model stream failed and we're keeping the fallback.
  modelError: string | null;
}

const AiResultSummaryCard = ({ result, fetchKey }: AiResultSummaryCardProps) => {
  const [state, setState] = useState<StreamState>({
    fallback: null,
    modelText: "",
    modelStarted: false,
    streaming: true,
    modelError: null,
  });
  const [reloadToken, setReloadToken] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = controller;

    // Reset state for the new fetch.
    setState({
      fallback: null,
      modelText: "",
      modelStarted: false,
      streaming: true,
      modelError: null,
    });

    const run = async () => {
      try {
        const res = await fetch(API_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({ result }),
          signal: controller.signal,
        });

        if (!res.ok) {
          // Try to parse a JSON error body.
          let msg = `Request failed (${res.status}).`;
          try {
            const data = await res.json();
            if (data?.error) msg = data.error;
          } catch {
            // ignore
          }
          if (!cancelled) {
            setState((s) => ({
              ...s,
              streaming: false,
              modelError: msg,
            }));
          }
          return;
        }
        if (!res.body) {
          if (!cancelled) {
            setState((s) => ({
              ...s,
              streaming: false,
              modelError: "AI did not return a stream.",
            }));
          }
          return;
        }

        // ── Consume the SSE stream ────────────────────────────────────────
        for await (const evt of parseSseStream(res.body, controller.signal)) {
          if (cancelled) break;

          if (typeof evt?.fallback === "string") {
            // First event: deterministic fallback summary. Show immediately.
            setState((s) => ({ ...s, fallback: evt.fallback }));
          } else if (evt?.model_start === true) {
            // First model token is about to arrive — clear the fallback.
            setState((s) => ({ ...s, modelStarted: true, fallback: null }));
          } else if (typeof evt?.token === "string") {
            // Append the token to the model text buffer. If this is the
            // first token, also clear the fallback.
            setState((s) => ({
              ...s,
              modelStarted: true,
              fallback: null,
              modelText: s.modelText + evt.token,
            }));
          } else if (evt?.error && typeof evt.error === "string") {
            // Model-side error. If we already have some model text, keep
            // it (partial is still useful). Otherwise keep the fallback.
            setState((s) => ({
              ...s,
              streaming: false,
              modelError: evt.fallback_kept ? null : evt.error,
            }));
          } else if (evt?.done === true) {
            setState((s) => ({ ...s, streaming: false }));
            break;
          }
        }

        if (!cancelled) {
          setState((s) => ({ ...s, streaming: false }));
        }
      } catch (err: any) {
        if (cancelled) return;
        if (err?.name === "AbortError") {
          // Silent on unmount / refetch.
          return;
        }
        setState((s) => ({
          ...s,
          streaming: false,
          modelError: err?.message || "Couldn't load AI summary.",
        }));
      }
    };

    run();

    return () => {
      cancelled = true;
      controller.abort();
      abortRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey, reloadToken]);

  // The text we actually display: prefer the model's streamed text, fall
  // back to the deterministic fallback if the model hasn't started yet (or
  // failed without producing any tokens).
  const displayedText: string = state.modelStarted
    ? state.modelText
    : state.fallback ?? "";

  // Split into lines for rendering — both fallback and streamed text are
  // multi-line. We render each line as its own paragraph with a number
  // prefix so the visitor sees the structure clearly. As tokens stream in,
  // the LAST line will be partial (still being written) — we show it with
  // a blinking caret to make the "typing" feel alive.
  const lines = displayedText.split(/\r?\n/).filter((l) => l.trim().length > 0);

  // A small accent header strip whose color depends on pass/fail.
  const accentBar = result.is_pass === false
    ? "from-rose-500/80 to-amber-500/70"
    : "from-emerald-500/80 to-sky-500/70";

  const showSkeleton =
    state.streaming && !displayedText && !state.modelError;

  return (
    <m.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card to-muted/40 shadow-card"
    >
      {/* Accent strip — quick pass/fail visual cue */}
      <div className={`h-1.5 w-full bg-gradient-to-r ${accentBar}`} />

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card/60">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-primary">
          <Sparkles className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground leading-tight">AI Summary</p>
          <p className="text-[11px] text-muted-foreground leading-tight">
            {state.streaming && state.modelStarted
              ? "Writing…"
              : state.streaming && !displayedText
                ? "Loading…"
                : state.modelError && !displayedText
                  ? "Showing quick summary"
                  : "Auto-generated · study tips & focus areas"}
          </p>
        </div>
        {state.streaming && (
          <span className="inline-flex items-center gap-1 text-[11px] text-primary font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            live
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3.5 min-h-[120px]">
        {showSkeleton && (
          <div className="space-y-2 animate-pulse">
            <div className="h-3 rounded-full bg-muted/80 w-[92%]" />
            <div className="h-3 rounded-full bg-muted/80 w-[85%]" />
            <div className="h-3 rounded-full bg-muted/80 w-[78%]" />
            <div className="h-3 rounded-full bg-muted/70 w-[70%]" />
            <div className="h-3 rounded-full bg-muted/60 w-[60%]" />
          </div>
        )}

        {!showSkeleton && state.modelError && !displayedText && (
          <div className="flex flex-col items-start gap-2 text-left">
            <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="leading-relaxed">{state.modelError}</span>
            </div>
            <button
              type="button"
              onClick={() => setReloadToken((t) => t + 1)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        )}

        {!showSkeleton && displayedText && (
          <div className="space-y-1.5">
            {lines.map((line, i) => {
              const isLastLine = i === lines.length - 1;
              const isStreamingThisLine = state.streaming && state.modelStarted && isLastLine;
              return (
                <p
                  key={i}
                  className="text-sm leading-snug text-foreground/90 flex gap-1.5"
                >
                  <span className="shrink-0 text-muted-foreground">{i + 1}.</span>
                  <span className="whitespace-pre-wrap break-words">
                    {line.trim()}
                    {isStreamingThisLine && (
                      <span className="inline-block w-1.5 h-3.5 ml-0.5 align-text-bottom bg-primary animate-pulse" />
                    )}
                  </span>
                </p>
              );
            })}
            {/* If we're showing the fallback (model hasn't started), show a
                subtle hint that the AI is preparing a personalized version. */}
            {state.streaming && !state.modelStarted && state.fallback && (
              <p className="text-[11px] text-muted-foreground italic mt-2">
                ✨ Personalizing with AI…
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer — tiny disclaimer so visitors know it's AI-generated.
          Only shown once the summary is finalized (not while streaming). */}
      {!state.streaming && displayedText && (
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
