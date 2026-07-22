// src/components/shared/AiResultSummaryCard.tsx
// "AI Summary" card shown beside (or below, on mobile) each exam result card
// on the /results page. Auto-fetches a short, friendly, 3–4 line personalized
// summary of the student's result from the /api/ai-result-summary serverless
// function (which calls Z.AI's GLM-4.5-Flash).
//
// STREAMING + NO FALLBACK (per site-owner request, 2026-07-22):
//   The /api/ai-result-summary endpoint returns a Server-Sent Events stream
//   of word-sized chunks. This component consumes that stream and renders
//   the summary LIVE, one word at a time, as the model writes it.
//
//   There is NO deterministic fallback summary anymore — the visitor only
//   sees AI-generated content. While waiting for the first word to arrive
//   (typically <500ms), a small pulsing "writing…" indicator is shown.
//   If the model fails completely, an error message + Retry button appears.
//
//   Per site-owner request:
//   • Auto-fetches by default the moment a result is shown (no button click).
//   • Mobile-friendly: card stacks below the result card on small screens,
//     sits beside it (right column) on lg+ screens.
//   • Each result gets a UNIQUE summary (server-side prompt varies per
//     student via temperature + unique ID hint).
//   • Errors / timeouts are non-fatal to the result card itself — only the
//     AI Summary card shows the error state.

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

// ── SSE stream parser ─────────────────────────────────────────────────────
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
  // The model's streamed text so far (empty until the first word arrives).
  modelText: string;
  // True while the stream is still open.
  streaming: boolean;
  // Set if the model stream failed.
  modelError: string | null;
  // True once the first word has arrived.
  started: boolean;
}

const AiResultSummaryCard = ({ result, fetchKey }: AiResultSummaryCardProps) => {
  const [state, setState] = useState<StreamState>({
    modelText: "",
    streaming: true,
    modelError: null,
    started: false,
  });
  const [reloadToken, setReloadToken] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = controller;

    // Reset state for the new fetch.
    setState({
      modelText: "",
      streaming: true,
      modelError: null,
      started: false,
    });

    // ── Letter-by-letter reveal queue ──────────────────────────────────────
    // The server now forwards raw deltas immediately (no word-buffering),
    // which can arrive as multi-character chunks. To get true DeepSeek-style
    // typing, we queue incoming text and drain it one character at a time on
    // a fast interval, independent of how large each network chunk was.
    let revealQueue = "";
    let revealTimer: ReturnType<typeof setInterval> | null = null;
    const CHAR_INTERVAL_MS = 12; // ~80 chars/sec

    const appendChar = (ch: string) => {
      if (cancelled) return;
      setState((s) => ({ ...s, started: true, modelText: s.modelText + ch }));
    };

    const startRevealTimer = () => {
      if (revealTimer) return;
      revealTimer = setInterval(() => {
        if (revealQueue.length === 0) return;
        const nextChar = revealQueue[0];
        revealQueue = revealQueue.slice(1);
        appendChar(nextChar);
      }, CHAR_INTERVAL_MS);
    };

    const stopRevealTimer = () => {
      if (revealTimer) {
        clearInterval(revealTimer);
        revealTimer = null;
      }
    };

    // Wait until the reveal queue has fully drained (used before marking
    // streaming=false, so the tail of the summary still types out instead
    // of popping in all at once).
    const waitForQueueDrain = () =>
      new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (cancelled || revealQueue.length === 0) {
            clearInterval(check);
            resolve();
          }
        }, CHAR_INTERVAL_MS);
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

        // ── Consume the SSE stream, queueing characters for reveal ─────────
        for await (const evt of parseSseStream(res.body, controller.signal)) {
          if (cancelled) break;

          if (typeof evt?.token === "string" && evt.token.length > 0) {
            revealQueue += evt.token;
            startRevealTimer();
          } else if (evt?.error && typeof evt.error === "string") {
            // Let whatever's already queued finish typing, then show error
            // only if nothing rendered at all.
            await waitForQueueDrain();
            stopRevealTimer();
            setState((s) => ({
              ...s,
              streaming: false,
              modelError: evt.error,
            }));
            return;
          } else if (evt?.done === true) {
            break;
          }
        }

        // Let the reveal queue finish draining naturally before marking done.
        await waitForQueueDrain();
        stopRevealTimer();

        if (!cancelled) {
          setState((s) => ({ ...s, streaming: false }));
        }
      } catch (err: any) {
        stopRevealTimer();
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
      stopRevealTimer();
      controller.abort();
      abortRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey, reloadToken]);

  // Split the streamed text into lines for rendering. As words stream in,
  // the LAST line will be partial (still being written) — we show it with
  // a blinking caret to make the "typing" feel alive.
  const lines = state.modelText
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0 || l === "");

  // A small accent header strip whose color depends on pass/fail.
  const accentBar = result.is_pass === false
    ? "from-rose-500/80 to-amber-500/70"
    : "from-emerald-500/80 to-sky-500/70";

  // Loading state: stream is open but no words yet. Show pulsing dots.
  const showLoadingDots = state.streaming && !state.started && !state.modelError;

  // Error state with no partial content.
  const showError = state.modelError && !state.modelText;

  // Active content state: we have at least some text (streaming or done).
  const showContent = state.modelText.length > 0;

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
          <p className="text-[13px] sm:text-sm font-bold text-foreground leading-tight truncate">GHS Babi Khel Summary</p>
          <p className="text-[11px] text-muted-foreground leading-tight">
            {state.streaming && state.started
              ? "Writing…"
              : state.streaming
                ? "Thinking…"
                : state.modelError && !showContent
                  ? "Couldn't load"
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
        {/* Loading — pulsing dots while waiting for first word */}
        {showLoadingDots && (
          <div className="flex items-center gap-1.5 py-3">
            <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.3s] [animation-duration:0.8s]" />
            <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.15s] [animation-duration:0.8s]" />
            <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce [animation-duration:0.8s]" />
            <span className="text-xs text-muted-foreground ml-2">AI is writing your summary…</span>
          </div>
        )}

        {/* Error with no content — show message + Retry */}
        {showError && (
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

        {/* Content — the AI's streamed text, rendered line-by-line with
            a blinking caret on the last (in-progress) line. */}
        {showContent && (
          <div className="space-y-1.5">
            {lines.map((line, i) => {
              const isLastLine = i === lines.length - 1;
              const isStreamingThisLine = state.streaming && isLastLine;
              // Skip rendering empty trailing lines while streaming.
              if (line.trim() === "" && isLastLine && state.streaming) return null;
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
          </div>
        )}
      </div>

      {/* Footer — tiny disclaimer so visitors know it's AI-generated.
          Only shown once the summary is finalized (not while streaming). */}
      {!state.streaming && showContent && (
        <div className="px-4 py-2 border-t border-border bg-card/40">
          <p className="text-[10px] text-muted-foreground leading-tight">
            ✨ GHS Babi Khel Summary based on your marks. Always
            verify official records with the school office.
          </p>
        </div>
      )}
    </m.div>
  );
};

export default AiResultSummaryCard;
