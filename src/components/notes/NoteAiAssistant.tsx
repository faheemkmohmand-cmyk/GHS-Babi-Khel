// src/components/notes/NoteAiAssistant.tsx
//
// AI Study Buddy panel for the Notes chapter page.
//
// Replaces the previous Wikipedia Study Assistant (WikiNoteAssistant) inside
// ChapterPage. Instead of searching Wikipedia, it streams answers from the
// SAME /api/ai-chat serverless proxy the homepage AIAssistantWidget already
// uses — Z.AI's free GLM-4.5-Flash model — but with `mode: "notes"` so the
// server swaps in a study-focused system prompt that includes the chapter
// title, subject name, and a short plain-text snippet of the chapter
// content. The student gets accurate, chapter-aware help (explain, summarize,
// practice questions, examples) in their own language, streamed live.
//
// Why reuse /api/ai-chat instead of a new endpoint:
//   - One serverless function = one place to manage the Z.AI key, model name,
//     rate limits, error handling, and SSE plumbing. Less to break.
//   - The endpoint already supports streaming via SSE; we just send an extra
//     `mode` field + chapter context and the server picks the right system
//     prompt. The homepage widget keeps working unchanged (mode defaults to
//     "homepage").
//
// This component is CONTROLLED (open / onOpenChange) — it does not render its
// own floating button. ChapterPage already renders one in the FAB stack
// (mobile bottom row + desktop right-side stack) and toggles `open` via
// setShowAiAssistant, exactly like the old Wiki widget.
//
// Streaming UX mirrors AIAssistantWidget: a small "typing dots" indicator
// appears while waiting for the first token, then characters reveal one at
// a time on a 12ms interval so multi-char SSE deltas still look like real
// typing instead of popping in as chunks.

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { m, AnimatePresence } from "framer-motion";
import { Sparkles, X, Send, Bot, BookOpen } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  // `streaming` = true while tokens are still arriving for this message.
  // Used to show a subtle blinking caret at the end of the partial text.
  streaming?: boolean;
}

interface NoteAiAssistantProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapterTitle: string;
  subjectName: string;
  subjectColor: string;
  subjectEmoji?: string;
  // Raw chapter HTML — we strip tags client-side and send the first ~3000
  // chars as context so the AI can answer chapter-specific questions
  // accurately. Server further caps at 4000 chars as a safety net.
  chapterContent?: string;
}

const API_ENDPOINT = "/api/ai-chat";
const CLIENT_TIMEOUT_MS = 60000; // streaming responses can take longer than the old 30s cap
const SNIPPET_MAX_CHARS = 3000; // cap chapter context sent to the model

// Study-focused starter suggestions — shown in the empty state so students
// immediately see what kinds of help the AI can give. Each one is a single
// click, no typing required, and covers the four most common study actions.
const STARTER_SUGGESTIONS = [
  "Explain this chapter in simple words",
  "What are the key points to remember?",
  "Give me 5 practice questions",
  "Summarize in 3 bullets",
];

// ── Tiny inline markdown renderer ─────────────────────────────────────────
// Same renderer as AIAssistantWidget — supports line breaks, bullet lists,
// numbered lists, bold, and inline code. Used for the FINAL rendered HTML of
// each assistant message once it has finished streaming (during streaming, we
// show the raw text with a blinking caret so the visitor sees characters
// appear live).
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
  let inOl = false;

  const closeUl = () => {
    if (inUl) {
      html.push("</ul>");
      inUl = false;
    }
  };
  const closeOl = () => {
    if (inOl) {
      html.push("</ol>");
      inOl = false;
    }
  };

  for (const line of lines) {
    const t = line.trimEnd();
    if (!t.trim()) {
      closeUl();
      closeOl();
      continue;
    }
    const bulletMatch = t.match(/^\s*(?:[-•])\s+(.*)$/);
    if (bulletMatch) {
      closeOl();
      if (!inUl) {
        html.push('<ul class="ml-1 list-disc space-y-0.5">');
        inUl = true;
      }
      html.push(`<li>${renderInline(bulletMatch[1])}</li>`);
      continue;
    }
    const numMatch = t.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (numMatch) {
      closeUl();
      if (!inOl) {
        html.push('<ol class="ml-1 list-decimal space-y-0.5">');
        inOl = true;
      }
      html.push(`<li>${renderInline(numMatch[2])}</li>`);
      continue;
    }
    closeUl();
    closeOl();
    html.push(`<p>${renderInline(t)}</p>`);
  }
  closeUl();
  closeOl();
  return html.join("");
}

// Strip HTML tags + collapse whitespace so we can send a clean plain-text
// snippet of the chapter to the model. We also decode the most common HTML
// entities so formulas like "H₂O" (written as H<sub>2</sub>O in the source)
// don't arrive as "H2O" without context — though we keep this lightweight
// (no full entity table) since the model is forgiving.
function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

const NoteAiAssistant = ({
  open,
  onOpenChange,
  chapterTitle,
  subjectName,
  subjectColor,
  subjectEmoji,
  chapterContent,
}: NoteAiAssistantProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false); // true while streaming is in progress
  const [error, setError] = useState<string | null>(null);
  const [waitingFirstToken, setWaitingFirstToken] = useState(false); // true between send and first token
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Pre-compute the chapter snippet ONCE per chapter so we don't re-strip
  // HTML on every render. Memoized on chapterContent + chapterTitle.
  const chapterSnippet = useMemo(() => {
    if (!chapterContent) return "";
    const plain = htmlToPlainText(chapterContent);
    if (plain.length <= SNIPPET_MAX_CHARS) return plain;
    // Truncate at a sentence boundary if possible — avoid cutting mid-word.
    const slice = plain.slice(0, SNIPPET_MAX_CHARS);
    const lastStop = Math.max(
      slice.lastIndexOf(". "),
      slice.lastIndexOf("? "),
      slice.lastIndexOf("! "),
      slice.lastIndexOf("\n")
    );
    return (lastStop > SNIPPET_MAX_CHARS * 0.6 ? slice.slice(0, lastStop + 1) : slice) + " …";
  }, [chapterContent]);

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

  // Abort any in-flight stream when the panel closes — saves server CPU
  // and bandwidth if the student closes the chat mid-answer.
  useEffect(() => {
    if (!open && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setLoading(false);
      setWaitingFirstToken(false);
      // Mark the last assistant message as no longer streaming.
      setMessages((prev) =>
        prev.map((m, i) =>
          i === prev.length - 1 && m.role === "assistant"
            ? { ...m, streaming: false }
            : m
        )
      );
    }
  }, [open]);

  // Reset the conversation when the chapter changes — stale Q&A from the
  // previous chapter would be confusing and the chapter context the server
  // uses would no longer match.
  useEffect(() => {
    setMessages([]);
    setError(null);
    setInput("");
    // If a stream is in flight from the previous chapter, abort it.
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setLoading(false);
      setWaitingFirstToken(false);
    }
  }, [chapterTitle, subjectName]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
      // Pre-add an empty assistant message that we'll fill as tokens arrive.
      { role: "assistant", content: "", streaming: true },
    ];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setLoading(true);
    setWaitingFirstToken(true);

    // Index of the assistant message we're streaming into.
    const assistantIdx = nextMessages.length - 1;

    const controller = new AbortController();
    abortRef.current = controller;

    // ── Letter-by-letter reveal queue ──────────────────────────────────────
    // Z.AI's deltas can arrive as multi-character chunks (e.g. "Hello",
    // " there"), which would otherwise pop onto the screen as a whole chunk
    // at once. To get a true DeepSeek-style typing effect, we push incoming
    // text into a small queue and drain ONE character at a time on a fast
    // interval, independent of how big each network delta was.
    let revealQueue = "";
    let revealTimer: ReturnType<typeof setInterval> | null = null;
    const CHAR_INTERVAL_MS = 12; // ~80 chars/sec — fast but visibly "typed"

    const appendToAssistant = (chunk: string) => {
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

    // Drain whatever's left in the queue instantly (used on completion/error
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
          // Tell the server to use the notes-focused system prompt and pass
          // chapter context so the model can give chapter-specific answers.
          mode: "notes",
          subject: subjectName,
          chapterTitle: chapterTitle,
          chapterSnippet: chapterSnippet,
          // Send only the user/assistant turns BEFORE the empty assistant
          // placeholder — the server doesn't need to see the empty one.
          messages: nextMessages.slice(0, -1).map((m) => ({
            role: m.role,
            content: m.content,
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

      // ── Consume the SSE stream ──────────────────────────────────────────
      for await (const evt of parseSseStream(res.body, controller.signal)) {
        if (evt?.token && typeof evt.token === "string") {
          if (waitingFirstToken) {
            setWaitingFirstToken(false);
          }
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
      setMessages((prev) => {
        const copy = prev.slice();
        const cur = copy[assistantIdx];
        if (cur && cur.role === "assistant") {
          copy[assistantIdx] = { ...cur, streaming: false, content: cur.content.trim() };
        }
        return copy;
      });
    } catch (err: any) {
      flushRevealQueue();
      if (err?.name === "AbortError") {
        // Silent on user-initiated abort (panel closed).
        if (!open) return;
        setError("The AI is taking too long. Please try again.");
      } else {
        setError(err?.message || "Something went wrong. Please try again.");
      }
      // Remove the empty/partial assistant placeholder on error.
      setMessages((prev) => {
        const copy = prev.slice();
        if (copy.length > 0 && copy[copy.length - 1].role === "assistant") {
          const last = copy[copy.length - 1];
          if (!last.content.trim()) {
            copy.pop();
          } else {
            copy[copy.length - 1] = { ...last, streaming: false };
          }
        }
        return copy;
      });
    } finally {
      stopRevealTimer();
      setLoading(false);
      setWaitingFirstToken(false);
      abortRef.current = null;
    }
  }, [messages, loading, open, waitingFirstToken, chapterTitle, subjectName, chapterSnippet]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  // Pre-render the assistant's last message HTML once per render cycle.
  const renderedAssistant = useMemo(() => {
    return messages.map((m) =>
      m.role === "assistant" && !m.streaming ? renderAssistantContent(m.content) : null
    );
  }, [messages]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — click anywhere outside to close. Semi-transparent
              instead of solid black so the chapter content stays slightly
              visible (less jarring on mobile where the panel covers most
              of the screen). */}
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => onOpenChange(false)}
            className="fixed inset-0 z-[59] bg-black/30 backdrop-blur-[1px]"
          />

          {/* Chat panel — wider on mobile AND desktop. */}
          <m.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed bottom-28 right-3 sm:right-6 z-[60] w-[calc(100vw-1.5rem)] max-w-md h-[34rem] max-h-[78vh] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header — uses the subject color so the panel feels tied to
                the chapter the student is reading. */}
            <div className="flex items-center gap-2.5 px-4 py-3 text-white shrink-0" style={{ backgroundColor: subjectColor }}>
              <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                <Bot className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold leading-tight truncate flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  AI Study Buddy
                </p>
                <p className="text-[11px] text-white/80 leading-tight truncate flex items-center gap-1">
                  {subjectEmoji && <span>{subjectEmoji}</span>}
                  <span className="truncate">{subjectName} · {chapterTitle}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Close AI Study Buddy"
                className="shrink-0 w-7 h-7 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3 bg-background"
            >
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground px-1 leading-relaxed flex items-start gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
                    <span>
                      Hi! I'm your study buddy for{" "}
                      <strong>{chapterTitle}</strong>{" "}
                      ({subjectName}). Ask me to explain a concept, summarize the
                      key points, give you practice questions, or work through an
                      example. Try one of these:
                    </span>
                  </p>
                  <div className="grid grid-cols-1 gap-1.5">
                    {STARTER_SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => sendMessage(s)}
                        className="text-left text-xs px-3 py-2 rounded-xl bg-muted hover:bg-muted/70 border border-border text-foreground transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {m.role === "user" ? (
                    <div className="max-w-[85%] rounded-2xl rounded-br-sm px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap bg-primary text-white">
                      {m.content}
                    </div>
                  ) : m.streaming ? (
                    <div className="max-w-[92%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm leading-relaxed bg-card border border-border text-foreground min-w-[64px]">
                      {waitingFirstToken && !m.content ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/70 animate-bounce [animation-delay:-0.3s] [animation-duration:0.8s]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/70 animate-bounce [animation-delay:-0.15s] [animation-duration:0.8s]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/70 animate-bounce [animation-duration:0.8s]" />
                        </span>
                      ) : (
                        <span className="whitespace-pre-wrap break-words">
                          {m.content}
                          <span className="inline-block w-1.5 h-3.5 ml-0.5 align-text-bottom bg-primary animate-pulse" />
                        </span>
                      )}
                    </div>
                  ) : (
                    <div
                      className="max-w-[92%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm leading-relaxed bg-card border border-border text-foreground
                                 [&_p]:my-0 [&_p+p]:mt-1.5
                                 [&_ul]:my-0.5 [&_ol]:my-0.5 [&_li]:leading-snug
                                 [&_strong]:font-semibold
                                 [&_code]:text-[0.85em]"
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
              className="shrink-0 flex items-center gap-2 p-2.5 border-t border-border bg-card"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Ask about ${chapterTitle.slice(0, 28)}${chapterTitle.length > 28 ? "…" : ""}`}
                disabled={loading}
                className="flex-1 min-w-0 text-sm px-3.5 py-2.5 rounded-full bg-muted border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="Send message"
                className="shrink-0 w-9 h-9 rounded-full text-white flex items-center justify-center disabled:opacity-40 transition-opacity"
                style={{ backgroundColor: subjectColor }}
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </m.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default NoteAiAssistant;
