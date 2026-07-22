// src/components/shared/AIAssistantWidget.tsx
// Floating "AI Assistant" circle button (bottom-right) — homepage only.
// Clicking it opens a wider chat panel where visitors can ask questions
// about the school / website, answered by Z.AI's free GLM-4.5-Flash model
// via our own /api/ai-chat serverless proxy.
//
// WHY A SERVERLESS PROXY (not Puter.js, not a direct browser call):
//   - A direct browser → Z.AI call would leak the API key.
//   - The previous Puter.js approach hung forever in production because
//     vercel.json's strict CSP blocked https://js.puter.com (script-src)
//     and https://api.puter.com (connect-src), and the script loader had
//     a Promise that never settled on a failed preload (loading state
//     stuck on, "Thinking…" spinner forever).
//   - A same-origin POST to /api/ai-chat is allowed by CSP
//     (connect-src 'self'), keeps the key server-side, and gives us a
//     real AbortController timeout on the client too.
//
//   Get a free Z.AI API key: https://docs.z.ai/guides/llm/glm-4.7

import { useState, useRef, useEffect, useMemo } from "react";
import { m, AnimatePresence } from "framer-motion";
import { Sparkles, X, Send, Loader2, Bot } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const API_ENDPOINT = "/api/ai-chat";
const CLIENT_TIMEOUT_MS = 30000; // hard client-side cap (server cap is 25s)

// Expanded starter suggestions — covers the four most common homepage
// questions (results, admissions, notices, news) so visitors see at a
// glance that the assistant can answer real questions, not just point at
// pages. Updated per site-owner request (2026-07-22) so the assistant is
// presented as a Q&A bot, not a "where do I click" guide.
const STARTER_SUGGESTIONS = [
  "When will the result be announced?",
  "How do I apply for admission?",
  "What's new on the Notices page?",
  "How do I check my result by roll number?",
];

// ── Tiny inline markdown renderer ─────────────────────────────────────────
// The assistant now returns multi-line answers with bullets, bold text and
// emoji prefixes (see api/ai-chat.ts SYSTEM_CONTEXT). We don't want to pull
// a full markdown library into the homepage bundle just for this widget, so
// we hand-roll a tiny renderer that supports:
//   • line breaks            (single \n → <br/>)
//   • bullet list items      (lines starting with "- " or "• ")
//   • bold spans             (**text** → <strong>)
//   • inline code spans      (`text` → <code>)
//   • a trailing "page path" hint line (e.g. "👉 You can do this on the
//     Results page (/results).") — kept as plain text, just styled.
//
// Anything else is passed through as plain text. Output is set via
// dangerouslySetInnerHTML — the input is the model's reply (server-side
// controlled, never user-controlled), and we aggressively escape HTML
// before re-inserting our own tags, so there is no XSS surface from user
// input. The model output is also already trimmed/filtered upstream.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(s: string): string {
  // Escape first, then re-introduce our own safe inline tags.
  let out = escapeHtml(s);
  // Bold: **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Inline code: `text`
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
    // Bullet line: "- ..." or "• ..."
    const bulletMatch = t.match(/^\s*(?:[-•])\s+(.*)$/);
    if (bulletMatch) {
      if (!inUl) {
        html.push('<ul class="ml-1 list-disc space-y-0.5">');
        inUl = true;
      }
      html.push(`<li>${renderInline(bulletMatch[1])}</li>`);
      continue;
    }
    // Plain paragraph line
    closeUl();
    html.push(`<p>${renderInline(t)}</p>`);
  }
  closeUl();
  return html.join("");
}

const AIAssistantWidget = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Focus the input shortly after the panel opens, so visitors can start
  // typing without an extra tap. Skipped on touch devices to avoid popping
  // the on-screen keyboard before the user has chosen to type.
  useEffect(() => {
    if (!open) return;
    const isTouch = matchMedia("(hover: none)").matches;
    if (isTouch) return;
    const t = setTimeout(() => inputRef.current?.focus(), 220);
    return () => clearTimeout(t);
  }, [open]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      // Hard client-side timeout — if the serverless function or the
      // upstream Z.AI API stalls, we abort and surface an error instead
      // of leaving the spinner spinning forever (the old Puter.js bug).
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

      const res = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status}).`);
      }

      const reply: string = data?.reply ?? "";
      if (!reply) throw new Error("AI Assistant did not return a response. Please try again.");

      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setError("The AI is taking too long. Please try again.");
      } else {
        setError(err?.message || "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  // Pre-render the assistant's last message HTML once per render cycle.
  // Memoized on the messages array reference so we don't re-escape on every
  // keystroke into the input box.
  const renderedAssistant = useMemo(() => {
    return messages.map((m) =>
      m.role === "assistant" ? renderAssistantContent(m.content) : null
    );
  }, [messages]);

  return (
    <>
      {/* Floating toggle button */}
      <m.button
        type="button"
        aria-label={open ? "Close AI Assistant" : "Open AI Assistant"}
        onClick={() => setOpen((o) => !o)}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1, type: "spring", stiffness: 260, damping: 20 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.94 }}
        className="fixed bottom-6 right-5 sm:right-6 z-[60] w-14 h-14 rounded-full bg-primary text-white shadow-xl shadow-primary/30 flex items-center justify-center"
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
              key="sparkle"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Sparkles className="w-6 h-6" />
            </m.span>
          )}
        </AnimatePresence>
        {!open && (
          <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping [animation-duration:2.5s]" />
        )}
      </m.button>

      {/* Chat panel — wider on mobile AND desktop per site-owner request.
          Old: w-[calc(100vw-2.5rem)] max-w-sm h-[28rem] max-h-[70vh]
                (max-w-sm = 24rem ≈ 384px → too narrow for multi-bullet answers)
          New: w-[calc(100vw-2rem)] max-w-md h-[34rem] max-h-[78vh]
                (max-w-md = 28rem ≈ 448px on desktop, near-full-width on mobile) */}
      <AnimatePresence>
        {open && (
          <m.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed bottom-24 right-3 sm:right-6 z-[60] w-[calc(100vw-1.5rem)] max-w-md h-[34rem] max-h-[78vh] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3 bg-primary text-white shrink-0">
              <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                <Bot className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold leading-tight truncate">AI Assistant</p>
                <p className="text-[11px] text-white/75 leading-tight">
                  GHS Babi Khel · Ask about results, admissions, notices & more
                </p>
              </div>
            </div>

            {/* Messages — wider column for assistant bubbles so bullet lists
                don't wrap awkwardly. */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3 bg-background"
            >
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground px-1 leading-relaxed">
                    Hi! I can answer questions about <strong>results</strong>,{" "}
                    <strong>admissions</strong>, <strong>notices</strong>,{" "}
                    <strong>news</strong>, the <strong>student portal</strong>, and{" "}
                    <strong>navigating the site</strong>. Try one of these:
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
                  ) : (
                    // Assistant bubble — wider (max-w-[92%]) so bullet lists
                    // and inline emoji + bold + page-path hints all render
                    // on a single visible line where possible.
                    <div
                      className="max-w-[92%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm leading-relaxed bg-card border border-border text-foreground
                                 [&_p]:my-0 [&_p+p]:mt-1.5
                                 [&_ul]:my-0.5 [&_li]:leading-snug
                                 [&_strong]:font-semibold"
                      dangerouslySetInnerHTML={{
                        __html: renderedAssistant[i] ?? "",
                      }}
                    />
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-3.5 py-2.5 flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Thinking…</span>
                  </div>
                </div>
              )}

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
                placeholder="Ask about results, admission, notices…"
                disabled={loading}
                className="flex-1 min-w-0 text-sm px-3.5 py-2.5 rounded-full bg-muted border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="Send message"
                className="shrink-0 w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center disabled:opacity-40 transition-opacity"
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
