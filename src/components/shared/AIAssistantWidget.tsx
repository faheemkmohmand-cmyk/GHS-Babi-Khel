// src/components/shared/AIAssistantWidget.tsx
// Floating "AI Assistant" circle button (bottom-right) — homepage only.
// Clicking it opens a wider chat panel where visitors can ask questions
// about the school / website, answered by Z.AI's free GLM flash models
// via our own /api/ai-chat serverless proxy.
//
// STREAMING + TYPING EFFECT:
//   /api/ai-chat returns a Server-Sent Events stream of { token: "..." }
//   frames as the model writes its answer. This component consumes that
//   stream with fetch + ReadableStream, pushes tokens into a reveal queue
//   and drains ONE CHARACTER at a time on a fast interval — so the visitor
//   sees true letter-by-letter typing (like Claude/DeepSeek) no matter how
//   big each network chunk was.
//
// CLAUDE-STYLE POLISH (per site-owner request, 2026-08-31):
//   1. ANIMATED SPARKLE — while the assistant is working (before the first
//      token and while it's busy overall, including the header avatar), the
//      sparkle glyph now actually "sparkles": a slow continuous rotation
//      plus a heartbeat scale pulse and an orange glow, exactly like
//      Claude's thinking state. Previously it was a flat static glyph.
//   2. EDIT + COPY ON YOUR OWN MESSAGES — hovering (desktop) or tapping
//      (mobile) a user bubble reveals two small actions, Copy and Edit,
//      just like Claude. Copy puts the message text on the clipboard and
//      flashes "Copied". Edit turns the bubble into an inline editor with
//      Cancel / Save; saving replaces that message, drops everything after
//      it (including any in-flight partial answer) and re-asks the
//      assistant, streaming a fresh response.
//
// WHY A SERVERLESS PROXY (not Puter.js, not a direct browser call):
//   - A direct browser → Z.AI call would leak the API key.
//   - A same-origin POST to /api/ai-chat is allowed by CSP
//     (connect-src 'self'), keeps the key server-side, and gives us a
//     real AbortController timeout on the client too.
//
//   Get a free Z.AI API key: https://docs.z.ai/guides/llm/glm-4.7

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { m, AnimatePresence } from "framer-motion";
import { X, Send, Copy, Check, Pencil } from "lucide-react";
import AiSparkleIcon from "./AiSparkleIcon";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  // `streaming` = true while tokens are still arriving for this message.
  // Used to show a subtle blinking caret at the end of the partial text.
  streaming?: boolean;
}

const API_ENDPOINT = "/api/ai-chat";
// Hard client-side cap — the server's retry budget (≈52s) always fires
// first in practice; this is just a last-resort safety net.
const CLIENT_TIMEOUT_MS = 60000;

// Expanded starter suggestions — covers the four most common homepage
// questions (results, admissions, notices, news) so visitors see at a
// glance that the assistant can answer real questions, not just point at
// pages.
const STARTER_SUGGESTIONS = [
  "When will the result be announced?",
  "How do I apply for admission?",
  "What's new on the Notices page?",
  "How do I check my result by roll number?",
];

// ── Animated sparkle (Claude-style "thinking" glyph) ──────────────────────
// The site's 12-ray sparkle glyph with two stacked motions: a slow endless
// rotation on the outer wrapper and a heartbeat scale pulse on the inner
// one (two separate wrappers because CSS/transform animations on the same
// element would overwrite each other). `active=false` eases everything back
// to rest, so it can sit in the header and only come alive while the AI
// is working.
const AnimatedSparkle = ({
  size = 20,
  active = true,
  className = "text-orange-500",
}: {
  size?: number;
  active?: boolean;
  className?: string;
}) => (
  <m.span
    className="inline-flex will-change-transform"
    animate={active ? { rotate: 360 } : { rotate: 0 }}
    transition={
      active
        ? { repeat: Infinity, duration: 2.4, ease: "linear" }
        : { duration: 0.25 }
    }
  >
    <m.span
      className="inline-flex will-change-transform"
      animate={active ? { scale: [1, 1.22, 1] } : { scale: 1 }}
      transition={
        active
          ? { repeat: Infinity, duration: 1.05, ease: "easeInOut" }
          : { duration: 0.2 }
      }
    >
      <AiSparkleIcon
        size={size}
        className={`${className} [filter:drop-shadow(0_0_4px_rgba(249,115,22,0.55))]`}
      />
    </m.span>
  </m.span>
);

// ── Tiny inline markdown renderer ─────────────────────────────────────────
// Same renderer as before — supports line breaks, bullet lists, bold, and
// inline code. Used for the FINAL rendered HTML of each assistant message
// once it has finished streaming (during streaming, we show the raw text
// with a blinking caret so the visitor sees characters appear live).
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(s: string): string {
  let out = escapeHtml(s);
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-muted text-[0.85em] font-mono">$1</code>');
  return out;
}

function renderAssistantContent(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const html: string[] = [];
  let inUl = false;

  const closeUl = () => {
    if (inUl) {
      html.push("</ul>");
      inUl = false;
    }
  };

  for (const line of lines) {
    const t = line.trimEnd();
    if (!t.trim()) {
      closeUl();
      continue;
    }
    const bulletMatch = t.match(/^\s*(?:[-•])\s+(.*)$/);
    if (bulletMatch) {
      if (!inUl) {
        html.push('<ul class="ai-bullet-list">');
        inUl = true;
      }
      html.push(`<li>${renderInline(bulletMatch[1])}</li>`);
      continue;
    }
    closeUl();
    html.push(`<p>${renderInline(t)}</p>`);
  }
  closeUl();
  return html.join("");
}

// ── SSE stream parser ─────────────────────────────────────────────────────
// Reads from a fetch Response's body stream, parses SSE frames
// (`data: {...}\n\n`), and yields parsed JSON objects. Stops at [DONE].
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
          // Ignore malformed frames (keepalive comments, etc.)
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

const AIAssistantWidget = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false); // true while streaming is in progress
  const [error, setError] = useState<string | null>(null);
  const [waitingFirstToken, setWaitingFirstToken] = useState(false); // true between send and first token
  // ── Edit / Copy state (Claude-style message actions) ────────────────────
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [actionsIdx, setActionsIdx] = useState<number | null>(null); // touch devices: tapped bubble
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const abortKindRef = useRef<"panel" | "edit" | "timeout" | null>(null);
  const waitingRef = useRef(false);
  // Generation counter: every runStream call takes a new generation. All
  // state mutations inside a stream are guarded by it, so a stale abort
  // (e.g. "Edit" canceling an in-flight answer) can never corrupt the
  // state of a newer conversation turn.
  const streamGenRef = useRef(0);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Hover-capable device? Desktop shows actions on hover; touch devices
  // show them after tapping the bubble.
  const canHover = useMemo(
    () => typeof matchMedia === "function" && !matchMedia("(hover: none)").matches,
    []
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, waitingFirstToken]);

  // Focus the input shortly after the panel opens. Skipped on touch devices
  // to avoid popping the on-screen keyboard before the user has chosen to type.
  useEffect(() => {
    if (!open) return;
    const isTouch = matchMedia("(hover: none)").matches;
    if (isTouch) return;
    const t = setTimeout(() => inputRef.current?.focus(), 220);
    return () => clearTimeout(t);
  }, [open]);

  // Focus + select the textarea when entering edit mode.
  useEffect(() => {
    if (editingIdx === null) return;
    const el = editTextareaRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editingIdx]);

  // Abort any in-flight stream when the panel closes — saves server CPU
  // and bandwidth if the visitor closes the chat mid-answer.
  useEffect(() => {
    if (!open && abortRef.current) {
      abortKindRef.current = "panel";
      abortRef.current.abort();
      abortRef.current = null;
      setLoading(false);
      setWaitingFirstToken(false);
      waitingRef.current = false;
      // Mark the last assistant message as no longer streaming.
      setMessages((prev) =>
        prev.map((msg, i) =>
          i === prev.length - 1 && msg.role === "assistant"
            ? { ...msg, streaming: false }
            : msg
        )
      );
    }
  }, [open]);

  // ── Core streaming pipeline ───────────────────────────────────────────────
  // Takes the conversation INCLUDING the latest user turn (but WITHOUT the
  // empty assistant placeholder), appends the placeholder, and streams the
  // answer into it character by character. Used both by normal sends and by
  // "Save" after editing a message.
  const runStream = useCallback(
    async (base: ChatMessage[]) => {
      const nextMessages: ChatMessage[] = [
        ...base,
        // Pre-add an empty assistant message that we'll fill as tokens arrive.
        { role: "assistant", content: "", streaming: true },
      ];
      setMessages(nextMessages);
      setError(null);
      setLoading(true);
      setWaitingFirstToken(true);
      waitingRef.current = true;
      setActionsIdx(null);

      // Index of the assistant message we're streaming into.
      const assistantIdx = nextMessages.length - 1;

      const controller = new AbortController();
      abortRef.current = controller;
      abortKindRef.current = null;
      const myGen = ++streamGenRef.current;
      const isCurrent = () => streamGenRef.current === myGen;

      // Hard client-side safety net (the server's own watchdogs normally
      // finish long before this).
      const clientTimer = setTimeout(() => {
        abortKindRef.current = "timeout";
        controller.abort();
      }, CLIENT_TIMEOUT_MS);

      // ── Letter-by-letter reveal queue ──────────────────────────────────
      // Z.AI's deltas can arrive as multi-character chunks (e.g. "Hello",
      // " there"), which would otherwise pop onto the screen as a whole
      // chunk at once. To get a true Claude-style typing effect, we push
      // incoming text into a small queue and drain ONE character at a time
      // on a fast interval, independent of how big each network delta was.
      let revealQueue = "";
      let revealTimer: ReturnType<typeof setInterval> | null = null;
      const CHAR_INTERVAL_MS = 11; // ~90 chars/sec — fast but visibly "typed"

      const appendToAssistant = (chunk: string) => {
        if (!isCurrent()) return;
        setMessages((prev) => {
          const copy = prev.slice();
          const cur = copy[assistantIdx];
          if (cur && cur.role === "assistant") {
            copy[assistantIdx] = { ...cur, content: cur.content + chunk };
          }
          return copy;
        });
      };

      const startRevealTimer = () => {
        if (revealTimer) return;
        revealTimer = setInterval(() => {
          if (revealQueue.length === 0) return;
          const nextChar = revealQueue[0];
          revealQueue = revealQueue.slice(1);
          appendToAssistant(nextChar);
        }, CHAR_INTERVAL_MS);
      };

      const stopRevealTimer = () => {
        if (revealTimer) {
          clearInterval(revealTimer);
          revealTimer = null;
        }
      };

      // Drain whatever's left in the queue instantly (used on error/abort
      // so the visitor never loses the tail end of an answer).
      const flushRevealQueue = () => {
        if (revealQueue) {
          appendToAssistant(revealQueue);
          revealQueue = "";
        }
        stopRevealTimer();
      };

      try {
        const res = await fetch(API_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            // Send only the user/assistant turns BEFORE the empty assistant
            // placeholder — the server doesn't need to see the empty one.
            messages: nextMessages.slice(0, -1).map((msg) => ({
              role: msg.role,
              content: msg.content,
            })),
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          // Try to parse a JSON error body (non-streaming error response).
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || `Request failed (${res.status}).`);
        }
        if (!res.body) {
          throw new Error("AI Assistant did not return a stream. Please try again.");
        }

        // ── Consume the SSE stream ────────────────────────────────────────
        // For each { token } event, append to the last assistant message's
        // content. The first token also clears `waitingFirstToken` so the
        // animated sparkle disappears and the streaming text takes over.
        for await (const evt of parseSseStream(res.body, controller.signal)) {
          if (evt?.token && typeof evt.token === "string") {
            if (waitingRef.current) {
              waitingRef.current = false;
              setWaitingFirstToken(false);
            }
            // Push into the reveal queue instead of appending directly —
            // the interval timer drains it one character at a time so the
            // visitor sees true letter-by-letter typing regardless of how
            // large this particular network chunk was.
            revealQueue += evt.token;
            startRevealTimer();
          } else if (evt?.error && typeof evt.error === "string") {
            throw new Error(evt.error);
          } else if (evt?.done === true) {
            break;
          }
        }

        // Stream finished on the network side — let the reveal queue finish
        // draining naturally (don't force-flush here, so the tail end of the
        // answer still types out letter by letter instead of popping in).
        await new Promise<void>((resolve) => {
          const check = setInterval(() => {
            if (revealQueue.length === 0) {
              clearInterval(check);
              resolve();
            }
          }, CHAR_INTERVAL_MS);
        });
        stopRevealTimer();

        // Mark the message as no longer streaming.
        if (!isCurrent()) return;
        setMessages((prev) => {
          const copy = prev.slice();
          const cur = copy[assistantIdx];
          if (cur && cur.role === "assistant") {
            copy[assistantIdx] = { ...cur, streaming: false, content: cur.content.trim() };
          }
          return copy;
        });
      } catch (err: any) {
        // A newer stream owns the conversation state now (e.g. this stream
        // was aborted by "Edit") — drop everything silently.
        if (!isCurrent()) return;
        flushRevealQueue();
        if (err?.name === "AbortError") {
          if (abortKindRef.current === "panel") {
            // Silent — panel closed mid-answer.
          } else if (abortKindRef.current === "edit") {
            // Silent — the edit flow takes over the conversation state.
          } else {
            setError("The AI is taking too long. Please try again.");
          }
        } else {
          setError(err?.message || "Something went wrong. Please try again.");
        }
        // Remove the empty/partial assistant placeholder on error/abort —
        // but never touch state that belongs to a newer conversation
        // (e.g. after an edit truncated the messages array).
        setMessages((prev) => {
          const copy = prev.slice();
          const last = copy[copy.length - 1];
          if (copy.length > 0 && last?.role === "assistant" && last.streaming !== undefined) {
            if (!last.content.trim()) {
              copy.pop();
            } else {
              copy[copy.length - 1] = { ...last, streaming: false };
            }
          }
          return copy;
        });
      } finally {
        clearTimeout(clientTimer);
        stopRevealTimer();
        // Only the CURRENT stream may reset the shared busy flags — a stale
        // stream's finally must not clobber a newer turn that is still running.
        if (isCurrent()) {
          setLoading(false);
          setWaitingFirstToken(false);
          waitingRef.current = false;
          if (abortRef.current === controller) {
            abortRef.current = null;
            abortKindRef.current = null;
          }
        }
      }
    },
    [open]
  );

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      const base: ChatMessage[] = [
        ...messages,
        { role: "user", content: trimmed },
      ];
      void runStream(base);
    },
    [messages, loading, runStream]
  );

  // ── Copy / Edit actions (Claude-style) ────────────────────────────────────
  const copyMessage = useCallback(async (idx: number) => {
    const msg = messages[idx];
    if (!msg) return;
    try {
      await navigator.clipboard.writeText(msg.content);
    } catch {
      // Clipboard API can be unavailable (permissions / older webviews) —
      // fall back to a temporary textarea + execCommand.
      const ta = document.createElement("textarea");
      ta.value = msg.content;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        // give up silently — nothing else we can do
      }
      ta.remove();
    }
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 1600);
  }, [messages]);

  const startEdit = useCallback(
    (idx: number) => {
      const msg = messages[idx];
      if (!msg || msg.role !== "user") return;
      // If an answer is currently streaming, stop it first — exactly like
      // Claude, editing a message cancels the in-flight response.
      if (abortRef.current) {
        abortKindRef.current = "edit";
        abortRef.current.abort();
        abortRef.current = null;
        setLoading(false);
        setWaitingFirstToken(false);
        waitingRef.current = false;
      }
      // Everything after the edited message (including any partial answer)
      // is dropped — it will be regenerated after saving.
      setMessages((prev) => prev.slice(0, idx + 1));
      setEditDraft(msg.content);
      setEditingIdx(idx);
      setActionsIdx(null);
      setError(null);
    },
    [messages]
  );

  const cancelEdit = useCallback(() => {
    setEditingIdx(null);
    setEditDraft("");
  }, []);

  const saveEdit = useCallback(() => {
    if (editingIdx === null) return;
    const draft = editDraft.trim();
    if (!draft) return;
    // Replace the edited message, drop everything after it, and re-ask.
    const base: ChatMessage[] = [
      ...messages.slice(0, editingIdx),
      { role: "user", content: draft },
    ];
    setEditingIdx(null);
    setEditDraft("");
    void runStream(base);
  }, [editingIdx, editDraft, messages, runStream]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
    setInput("");
  };

  // Pre-render the assistant's last message HTML once per render cycle.
  // Memoized on the messages array reference. For streaming messages we
  // render the raw text + caret instead of the markdown HTML so the user
  // sees characters appear live (re-parsing markdown on every token is
  // expensive and causes flicker).
  const renderedAssistant = useMemo(() => {
    return messages.map((msg) =>
      msg.role === "assistant" && !msg.streaming ? renderAssistantContent(msg.content) : null
    );
  }, [messages]);

  const busy = loading || waitingFirstToken;

  return (
    <>
      {/* Floating toggle button.
          Fully transparent background, a thin orange border, and the
          "sparkle burst" glyph matching Claude's assistant styling. */}
      <m.button
        type="button"
        aria-label={open ? "Close AI Assistant" : "Open AI Assistant"}
        onClick={() => setOpen((o) => !o)}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1, type: "spring", stiffness: 260, damping: 20 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.94 }}
        className="fixed bottom-6 right-5 sm:right-6 z-[60] w-[48px] h-[48px] flex items-center justify-center text-orange-600"
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <m.span
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <X className="w-6 h-6" />
            </m.span>
          ) : (
            <m.span
              key="bot"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {/* Sparkle-burst icon matching Claude style: 12 bold
                  rays radiating from center, alternating long/short lengths,
                  thick solid bodies with flat angular cut ends. */}
              <AiSparkleIcon size={34} />
            </m.span>
          )}
        </AnimatePresence>
        {!open && (
          <span className="absolute inset-0 rounded-full animate-ping [animation-duration:2.5s] opacity-20 bg-orange-500/30" />
        )}
      </m.button>

      {/* Chat panel — wider on mobile AND desktop. */}
      <AnimatePresence>
        {open && (
          <m.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed bottom-24 right-3 sm:right-6 z-[60] w-[calc(100vw-1.5rem)] max-w-md h-[34rem] max-h-[78vh] bg-[#FAFAF8] dark:bg-[#1A1918] border border-black/[0.08] dark:border-white/[0.08] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header — neutral paper tone. The sparkle avatar now comes
                alive (rotate + pulse + glow) while the assistant is busy. */}
            <div className="flex items-center gap-2.5 px-4 py-3.5 bg-[#FAFAF8] dark:bg-[#1A1918] border-b border-black/[0.06] dark:border-white/[0.06] shrink-0">
              <span className="shrink-0 inline-flex">
                <AnimatedSparkle size={22} active={busy} className="text-orange-600" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight truncate text-[#1F1E1D] dark:text-[#F2F1EE]">
                  AI Assistant
                </p>
                <p className="text-[11px] text-[#6B6963] dark:text-[#A8A69F] leading-tight">
                  {waitingFirstToken
                    ? "Thinking…"
                    : loading
                      ? "Typing…"
                      : "GHS Babi Khel · Ask about results, admissions, notices & more"}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3 bg-[#FAFAF8] dark:bg-[#1A1918]"
            >
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-xs text-[#6B6963] dark:text-[#A8A69F] px-1 leading-relaxed">
                    Hi! I can answer questions about <strong className="text-[#1F1E1D] dark:text-[#F2F1EE] font-semibold">results</strong>,{" "}
                    <strong className="text-[#1F1E1D] dark:text-[#F2F1EE] font-semibold">admissions</strong>,{" "}
                    <strong className="text-[#1F1E1D] dark:text-[#F2F1EE] font-semibold">notices</strong>,{" "}
                    <strong className="text-[#1F1E1D] dark:text-[#F2F1EE] font-semibold">news</strong>, the{" "}
                    <strong className="text-[#1F1E1D] dark:text-[#F2F1EE] font-semibold">student portal</strong>, and{" "}
                    <strong className="text-[#1F1E1D] dark:text-[#F2F1EE] font-semibold">navigating the site</strong>.
                    Try one of these:
                  </p>
                  <div className="grid grid-cols-1 gap-1.5">
                    {STARTER_SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => sendMessage(s)}
                        className="text-left text-xs px-3.5 py-2.5 rounded-xl bg-white dark:bg-white/[0.04] hover:bg-orange-50 dark:hover:bg-white/[0.07] border border-black/[0.08] dark:border-white/[0.08] hover:border-orange-300/60 text-[#3D3B37] dark:text-[#E4E2DD] transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex flex-col ${
                    msg.role === "user" ? "items-end group" : "items-start"
                  }`}
                >
                  {msg.role === "user" ? (
                    editingIdx === i ? (
                      /* ── Inline edit mode (Claude-style) ──────────────── */
                      <div className="w-[92%] rounded-2xl rounded-br-sm bg-[#3D3B37] dark:bg-[#E4E2DD] px-2.5 pt-2.5 pb-2 shadow-sm">
                        <textarea
                          ref={editTextareaRef}
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              e.preventDefault();
                              cancelEdit();
                            } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                              e.preventDefault();
                              saveEdit();
                            }
                          }}
                          rows={Math.min(6, Math.max(2, editDraft.split("\n").length))}
                          className="w-full bg-transparent text-sm leading-relaxed text-white dark:text-[#1A1918] resize-none focus:outline-none placeholder:text-white/50 dark:placeholder:text-black/40"
                          placeholder="Edit your message…"
                        />
                        <div className="flex items-center justify-end gap-1.5 pt-1.5">
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="text-[11px] px-2.5 py-1 rounded-full text-white/70 hover:text-white hover:bg-white/10 dark:text-black/60 dark:hover:text-black dark:hover:bg-black/10 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={saveEdit}
                            disabled={!editDraft.trim()}
                            className="text-[11px] px-3 py-1 rounded-full bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 transition-colors"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* ── The user's bubble ─────────────────────────── */}
                        <div
                          onClick={() => {
                            if (!canHover) {
                              // Touch devices: tap toggles the action row.
                              setActionsIdx((cur) => (cur === i ? null : i));
                            }
                          }}
                          className={`max-w-[85%] rounded-2xl rounded-br-sm px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words bg-[#3D3B37] dark:bg-[#E4E2DD] text-white dark:text-[#1A1918] ${
                            canHover ? "" : "cursor-pointer"
                          }`}
                        >
                          {msg.content}
                        </div>
                        {/* ── Copy / Edit actions (Claude-style) ──────────
                            Desktop: appear on hover. Touch: appear after a
                            tap. Small, quiet, accurate — like Claude. */}
                        <div
                          className={`flex items-center gap-0.5 mt-1 mr-1 transition-opacity duration-150 ${
                            canHover
                              ? "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                              : actionsIdx === i
                                ? "opacity-100"
                                : "opacity-0 pointer-events-none"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => copyMessage(i)}
                            aria-label="Copy message"
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] leading-none text-[#8A8880] hover:text-[#3D3B37] hover:bg-black/[0.06] dark:text-[#8A8880] dark:hover:text-[#E4E2DD] dark:hover:bg-white/[0.08] transition-colors"
                          >
                            {copiedIdx === i ? (
                              <>
                                <Check className="w-3 h-3 text-green-600" />
                                <span className="text-green-600">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                Copy
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => startEdit(i)}
                            aria-label="Edit message"
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] leading-none text-[#8A8880] hover:text-[#3D3B37] hover:bg-black/[0.06] dark:text-[#8A8880] dark:hover:text-[#E4E2DD] dark:hover:bg-white/[0.08] transition-colors"
                          >
                            <Pencil className="w-3 h-3" />
                            Edit
                          </button>
                        </div>
                      </>
                    )
                  ) : msg.streaming ? (
                    /* ── Streaming bubble ──────────────────────────────────────
                       While waiting for the first token: the animated
                       Claude-style sparkle (rotate + heartbeat + glow).
                       Once tokens arrive: partial text typed LIVE letter
                       by letter with a blinking caret. */
                    <div className="max-w-[92%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm leading-relaxed bg-white dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] text-[#3D3B37] dark:text-[#E4E2DD] min-w-[52px]">
                      {waitingFirstToken && !msg.content ? (
                        <span className="inline-flex items-center justify-center h-6 min-w-[24px]">
                          <AnimatedSparkle size={20} active />
                        </span>
                      ) : (
                        <span className="whitespace-pre-wrap break-words">
                          {msg.content}
                          <span className="inline-block w-[3px] h-3.5 ml-0.5 align-text-bottom rounded-[1px] bg-orange-500 animate-pulse" />
                        </span>
                      )}
                    </div>
                  ) : (
                    <div
                      className="ai-message-bubble max-w-[92%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm leading-relaxed bg-white dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] text-[#3D3B37] dark:text-[#E4E2DD]"
                      dangerouslySetInnerHTML={{
                        __html: renderedAssistant[i] ?? "",
                      }}
                    />
                  )}
                </div>
              ))}

              {error && (
                <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2">
                  {error}
                </div>
              )}
            </div>

            {/* Input */}
            <form
              onSubmit={handleSubmit}
              className="shrink-0 flex items-center gap-2 p-2.5 border-t border-black/[0.06] dark:border-white/[0.06] bg-[#FAFAF8] dark:bg-[#1A1918]"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about results, admission, notices…"
                disabled={loading}
                className="flex-1 min-w-0 text-sm px-3.5 py-2.5 rounded-full bg-white dark:bg-white/[0.04] border border-black/[0.1] dark:border-white/[0.1] text-[#1F1E1D] dark:text-[#F2F1EE] placeholder:text-[#9C9A93] focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400/60 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="Send message"
                className="shrink-0 w-9 h-9 rounded-full bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center disabled:opacity-40 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AIAssistantWidget;
