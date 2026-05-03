import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import {
  Sparkles, Send, Loader2, BookOpen, Calculator, FlaskConical,
  Globe, RotateCcw, Copy, Check, Atom, Scroll, AlertCircle
} from "lucide-react";

const DEEPSEEK_API_KEY = "sk-6ca31945b2f042898bc1282e738ba427";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

interface Message {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  timestamp: Date;
}

const QUICK_PROMPTS = [
  { icon: Calculator, label: "Math Problem",     color: "from-blue-500 to-cyan-500",    text: "Solve this math problem step by step: " },
  { icon: Atom,       label: "Physics Help",     color: "from-purple-500 to-violet-500",text: "Explain this Physics concept simply: " },
  { icon: FlaskConical,label: "Chemistry",       color: "from-green-500 to-emerald-500",text: "Explain this Chemistry topic: " },
  { icon: BookOpen,   label: "English Grammar",  color: "from-orange-500 to-blue-500", text: "Explain this English grammar rule: " },
  { icon: Globe,      label: "Pakistan Studies", color: "from-red-500 to-rose-500",     text: "Tell me about this Pakistan Studies topic: " },
  { icon: Scroll,     label: "Islamiyat",        color: "from-teal-500 to-cyan-600",    text: "Explain this Islamiyat topic: " },
];

const SYSTEM_PROMPT = `You are GHS Babi Khel's AI Study Assistant — a friendly, smart tutor for students at Government High School Babi Khel, District Mohmand, KPK, Pakistan.

Rules:
- Help with: Mathematics, Physics, Chemistry, Biology, English, Urdu, Islamiyat, Pakistan Studies, Computer Science (Classes 6-10)
- Always show step-by-step solutions for Math and Science problems
- Respond in the same language the student uses (English or Urdu)
- Be warm and encouraging — these students are from rural KPK
- Focus on BISE Peshawar exam patterns and important topics
- Use numbered steps and bullet points for clarity
- Keep answers focused and not too long
- If asked non-educational questions, politely redirect to studies`;

function formatText(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, `<code style="background:rgba(139,92,246,0.15);color:#7c3aed;padding:1px 5px;border-radius:4px;font-size:0.85em">$1</code>`)
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="shrink-0 p-1.5 rounded-lg bg-black/10 hover:bg-black/20 transition-colors"
      title="Copy"
    >
      {copied
        ? <Check className="w-3 h-3 text-green-500" />
        : <Copy className="w-3 h-3 text-white/70" />}
    </button>
  );
}

const AIAssistantTab = () => {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [history, setHistory] = useState<{ role: string; content: string }[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    setShowWelcome(false);
    setInput("");
    setLoading(true);

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text.trim(), timestamp: new Date() };
    setMessages(p => [...p, userMsg]);

    const newHistory = [...history, { role: "user", content: text.trim() }];

    try {
      const res = await fetch(DEEPSEEK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...newHistory,
          ],
          max_tokens: 1024,
          temperature: 0.7,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errMsg = data?.error?.message || `API error ${res.status}`;
        throw new Error(errMsg);
      }

      const reply = data.choices?.[0]?.message?.content;
      if (!reply) throw new Error("No response from AI. Please try again.");

      setMessages(p => [...p, { id: (Date.now()+1).toString(), role: "assistant", content: reply, timestamp: new Date() }]);
      setHistory([...newHistory, { role: "assistant", content: reply }]);

    } catch (err: any) {
      setMessages(p => [...p, {
        id: (Date.now()+1).toString(),
        role: "error",
        content: `Error: ${err.message || "Something went wrong. Please try again."}`,
        timestamp: new Date(),
      }]);
    }
    setLoading(false);
  };

  const clearChat = () => { setMessages([]); setHistory([]); setShowWelcome(true); };
  const firstName = profile?.full_name?.split(" ")[0] || "Student";

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-h-[820px]">

      {/* Header */}
      <div className="flex items-center justify-between pb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative w-12 h-12 shrink-0">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-600 opacity-30 animate-pulse" />
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-600 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
          </div>
          <div>
            <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
              AI Study Assistant
              <span className="text-[10px] font-bold bg-gradient-to-r from-violet-500 to-indigo-500 text-white px-2 py-0.5 rounded-full">BETA</span>
            </h2>
            <p className="text-xs text-muted-foreground">Powered by DeepSeek AI · GHS Babi Khel</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={clearChat}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground bg-secondary px-3 py-1.5 rounded-lg transition-colors">
            <RotateCcw className="w-3.5 h-3.5" /> New Chat
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">

        {/* Welcome screen */}
        <AnimatePresence>
          {showWelcome && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-5">

              {/* Hero card */}
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 p-6 text-white shadow-xl">
                <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/5 rounded-full" />
                <div className="absolute -bottom-6 -left-6 w-28 h-28 bg-white/5 rounded-full" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-semibold opacity-90">Hello, {firstName}! 👋</span>
                  </div>
                  <h3 className="text-2xl font-bold mb-2 leading-tight">Your AI Study Buddy</h3>
                  <p className="text-sm opacity-80 leading-relaxed">
                    Ask me anything about your subjects. I speak English and Urdu both! 🎓
                  </p>
                  <div className="flex flex-wrap gap-2 mt-4">
                    {["Math ✏️", "Physics ⚡", "Chemistry 🧪", "English 📝", "Islamiyat 📖", "Urdu 🌙"].map(s => (
                      <span key={s} className="text-xs bg-white/15 px-2.5 py-1 rounded-full">{s}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Quick prompts */}
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Quick Start ⚡</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {QUICK_PROMPTS.map(q => (
                    <motion.button key={q.label} whileTap={{ scale: 0.97 }}
                      onClick={() => { setInput(q.text); inputRef.current?.focus(); }}
                      className="flex items-center gap-2.5 p-3 bg-card border border-border rounded-xl text-left hover:border-violet-400/60 hover:shadow-sm transition-all">
                      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${q.color} flex items-center justify-center shrink-0`}>
                        <q.icon className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-xs font-semibold text-foreground">{q.label}</span>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Tips */}
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-500/20 rounded-xl p-3 space-y-1">
                <p className="text-xs font-bold text-blue-800 dark:text-blue-400">💡 Tips for best results</p>
                <p className="text-xs text-blue-800/80 dark:text-blue-400/70">• Be specific: "Explain Newton's 2nd law with example"</p>
                <p className="text-xs text-blue-800/80 dark:text-blue-400/70">• Tell your class: "I'm in Class 10"</p>
                <p className="text-xs text-blue-800/80 dark:text-blue-400/70">• Ask in Urdu: Main Urdu mein bhi jawab de sakta hoon</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat messages */}
        {messages.map((msg) => (
          <motion.div key={msg.id}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
            className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>

            {/* AI avatar */}
            {(msg.role === "assistant" || msg.role === "error") && (
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-1 ${msg.role === "error" ? "bg-destructive/20" : "bg-gradient-to-br from-violet-500 to-indigo-600"}`}>
                {msg.role === "error"
                  ? <AlertCircle className="w-4 h-4 text-destructive" />
                  : <Sparkles className="w-4 h-4 text-white" />}
              </div>
            )}

            <div className={`max-w-[80%] flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
              <div className={`rounded-2xl px-4 py-3 ${
                msg.role === "user"
                  ? "bg-gradient-to-br from-violet-500 to-indigo-600 text-white rounded-tr-sm"
                  : msg.role === "error"
                  ? "bg-destructive/10 border border-destructive/30 text-destructive rounded-tl-sm"
                  : "bg-card border border-border shadow-sm rounded-tl-sm"
              }`}>
                {msg.role === "user" ? (
                  <div className="flex items-start gap-2">
                    <p className="text-sm leading-relaxed flex-1">{msg.content}</p>
                    <CopyBtn text={msg.content} />
                  </div>
                ) : msg.role === "error" ? (
                  <p className="text-sm">{msg.content}</p>
                ) : (
                  <div className="flex items-start gap-2">
                    <div className="text-sm leading-relaxed flex-1 text-foreground"
                      dangerouslySetInnerHTML={{ __html: formatText(msg.content) }} />
                    <CopyBtn text={msg.content} />
                  </div>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground px-1">
                {msg.timestamp.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>

            {/* User avatar */}
            {msg.role === "user" && (
              <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shrink-0 mt-1 text-primary-foreground text-xs font-bold">
                {firstName[0]?.toUpperCase()}
              </div>
            )}
          </motion.div>
        ))}

        {/* Typing indicator */}
        <AnimatePresence>
          {loading && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex gap-2.5 items-start">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                <div className="flex items-center gap-1.5">
                  {[0, 150, 300].map(delay => (
                    <div key={delay} className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                  ))}
                  <span className="text-xs text-muted-foreground ml-2">Thinking...</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="pt-3 shrink-0">
        <div className="bg-card border border-border rounded-2xl shadow-sm focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-400/20 transition-all">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder="Ask me anything about your studies... (Enter to send)"
            rows={2}
            disabled={loading}
            className="w-full bg-transparent px-4 pt-3 pb-1 text-sm resize-none outline-none placeholder:text-muted-foreground disabled:opacity-50"
          />
          <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
            <p className="text-[10px] text-muted-foreground">Shift+Enter for new line</p>
            <motion.button whileTap={{ scale: 0.95 }}
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              className="flex items-center gap-1.5 bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-xs font-semibold px-4 py-2 rounded-xl disabled:opacity-40 transition-opacity shadow-sm">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {loading ? "Thinking..." : "Send"}
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIAssistantTab;
