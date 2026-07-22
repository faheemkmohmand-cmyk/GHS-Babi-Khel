// src/components/shared/AIAssistantWidget.tsx
// Floating "AI Assistant" circle button (bottom-right) — homepage only.
// Clicking it opens a small chat panel where visitors can ask questions
// about the school / website, answered by GLM-4.7-Flash via Puter.js.
//
// WHY PUTER.JS (not a direct Z.AI API call)?
//   Z.AI's official REST API (api.z.ai) requires a server-side API key.
//   Puter.js (https://js.puter.com/v2/) instead gives free, keyless,
//   client-side access to GLM-4.7-Flash via its "User-Pays" model — each
//   visitor's own browser session covers usage, so no backend, no secret,
//   and no api/*.js proxy is needed at all. See:
//   https://developer.puter.com/tutorials/free-unlimited-zai-glm-api/

import { useState, useRef, useEffect } from "react";
import { m, AnimatePresence } from "framer-motion";
import { Sparkles, X, Send, Loader2, Bot } from "lucide-react";

declare global {
  interface Window {
    puter?: {
      ai: {
        chat: (
          message: string,
          options?: { model?: string }
        ) => Promise<any>;
      };
    };
  }
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const PUTER_SCRIPT_SRC = "https://js.puter.com/v2/";
const GLM_MODEL = "z-ai/glm-4.7-flash";

const STARTER_SUGGESTIONS = [
  "How do I check my result?",
  "How can I apply for admission?",
  "How do I sign in to the student portal?",
];

// Keeps the assistant scoped to the school — sent as extra context ahead
// of every user message (Puter's simple chat() call has no system-role
// param, so we prepend instructions directly into the prompt instead).
const SYSTEM_CONTEXT = `You are the AI Assistant for Government High School Babi Khel's official website (ghsbabikhel.indevs.in), located in Babi Khel, District Mohmand, KPK, Pakistan. Classes offered: 6 to 10.

Help visitors with: checking results (Results page, roll number lookup, BISE Peshawar fallback), admissions (Admission page), signing in to the student portal, notices, timetable, fee info, gallery, and general navigation of the website (Home, About, Results, Admission, Gallery, Notices, Portal Sign In).

Keep answers short, friendly, and specific to this school and website. If you don't know something (e.g. a student's personal record or live data), tell the user to check the Results page, sign in to their portal, or contact the school office — never invent facts, marks, or dates. If asked something unrelated to the school/website, politely redirect: explain you're the GHS Babi Khel website assistant and can help with school/website questions instead.`;

function loadPuterScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.puter) return resolve();
    const existing = document.querySelector(`script[src="${PUTER_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Puter.js")));
      return;
    }
    const script = document.createElement("script");
    script.src = PUTER_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Puter.js"));
    document.body.appendChild(script);
  });
}

const AIAssistantWidget = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Preload the Puter script as soon as the panel opens so the first
  // message doesn't wait on the script load + chat call back-to-back.
  useEffect(() => {
    if (open) loadPuterScript().catch(() => {});
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
      await loadPuterScript();
      if (!window.puter) throw new Error("AI Assistant failed to load. Please try again.");

      // Build a short running transcript so the model has conversation
      // context (Puter's chat() takes a single prompt string, not a
      // messages array), capped to keep prompts small and fast.
      const recentTurns = nextMessages.slice(-8)
        .map(m => `${m.role === "user" ? "Visitor" : "Assistant"}: ${m.content}`)
        .join("\n");
      const prompt = `${SYSTEM_CONTEXT}\n\nConversation so far:\n${recentTurns}\n\nAssistant:`;

      const response = await window.puter.ai.chat(prompt, { model: GLM_MODEL });
      const reply =
        typeof response === "string"
          ? response
          : response?.message?.content ?? response?.text ?? "";

      if (!reply) throw new Error("AI Assistant did not return a response. Please try again.");

      setMessages(prev => [...prev, { role: "assistant", content: reply.trim() }]);
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <>
      {/* Floating toggle button */}
      <m.button
        type="button"
        aria-label={open ? "Close AI Assistant" : "Open AI Assistant"}
        onClick={() => setOpen(o => !o)}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1, type: "spring", stiffness: 260, damping: 20 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.94 }}
        className="fixed bottom-6 right-5 sm:right-6 z-[60] w-14 h-14 rounded-full bg-primary text-white shadow-xl shadow-primary/30 flex items-center justify-center"
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <m.span key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <X className="w-6 h-6" />
            </m.span>
          ) : (
            <m.span key="sparkle" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <Sparkles className="w-6 h-6" />
            </m.span>
          )}
        </AnimatePresence>
        {!open && (
          <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping [animation-duration:2.5s]" />
        )}
      </m.button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <m.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed bottom-24 right-5 sm:right-6 z-[60] w-[calc(100vw-2.5rem)] max-w-sm h-[28rem] max-h-[70vh] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3 bg-primary text-white shrink-0">
              <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                <Bot className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold leading-tight truncate">AI Assistant</p>
                <p className="text-[11px] text-white/75 leading-tight">GHS Babi Khel · Ask me anything</p>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3 bg-background">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground px-1">
                    Hi! I can help with results, admissions, the student portal, and finding your way around the site.
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {STARTER_SUGGESTIONS.map(s => (
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
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-primary text-white rounded-br-sm"
                        : "bg-card border border-border text-foreground rounded-bl-sm"
                    }`}
                  >
                    {m.content}
                  </div>
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
            <form onSubmit={handleSubmit} className="shrink-0 flex items-center gap-2 p-2.5 border-t border-border bg-card">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask about results, admission…"
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
