// src/pages/dashboard/tabs/NumberFacts.tsx
import { useState } from "react";

type FactType = "trivia" | "math" | "year" | "date";

interface Fact {
  text: string;
  number: number | string;
  type: string;
  found: boolean;
}

// 1️⃣ Try our own Vercel serverless proxy at /api/numbers (no CORS issue).
// 2️⃣ If the proxy returns 404/500 (e.g. local dev), fall back to hitting
//    numbersapi.com directly — it supports CORS so browsers can fetch it.
async function fetchFact(path: string): Promise<Fact | null> {
  // --- Attempt 1: proxy ---
  try {
    const res = await fetch(`/api/numbers?path=${encodeURIComponent(path)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.text) return data as Fact;
    }
    // 404 means the serverless function isn't deployed here — fall through
    if (res.status !== 404 && res.status !== 500) {
      // Any other non-ok status (e.g. 429) → surface the error, don't retry
      throw new Error(`Proxy returned ${res.status}`);
    }
  } catch (e: unknown) {
    // Only swallow 404/timeout so we can try the fallback
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("404") && !msg.includes("Failed to fetch") && !msg.includes("AbortError")) {
      console.error("NumberFacts fetch error:", e);
      return null;
    }
  }

  // --- Attempt 2: direct (CORS-enabled) ---
  try {
    const res = await fetch(`https://numbersapi.com/${path}?json`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`numbersapi.com returned ${res.status}`);
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("json")) {
      return (await res.json()) as Fact;
    }
    const text = await res.text();
    return { text, found: true, type: "trivia", number: 0 };
  } catch (e) {
    console.error("NumberFacts fetch error:", e);
    return null;
  }
}

const TYPE_META: Record<FactType, { label: string; emoji: string; color: string; desc: string; placeholder: string }> = {
  trivia: { label: "Trivia",   emoji: "🎯", color: "from-violet-500 to-purple-600", desc: "Interesting fact",       placeholder: "e.g. 42, 7, 100" },
  math:   { label: "Math",     emoji: "📐", color: "from-blue-500 to-indigo-600",   desc: "Mathematical property", placeholder: "e.g. 42, 12, 256" },
  year:   { label: "Year",     emoji: "📅", color: "from-amber-500 to-orange-600",  desc: "Historical year fact",  placeholder: "e.g. 1947, 1969"  },
  date:   { label: "Birthday", emoji: "🎂", color: "from-pink-500 to-rose-600",     desc: "Date in history",       placeholder: ""                  },
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS_IN: Record<number, number> = {1:31,2:29,3:31,4:30,5:31,6:30,7:31,8:31,9:30,10:31,11:30,12:31};

export default function NumberFacts() {
  const [activeMode, setActiveMode] = useState<FactType>("trivia");
  const [numInput, setNumInput] = useState("");
  const [bdMonth, setBdMonth] = useState(1);
  const [bdDay, setBdDay]     = useState(1);
  const [fact, setFact]       = useState<Fact | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [queryLabel, setQueryLabel] = useState("");

  const maxDay = DAYS_IN[bdMonth] ?? 31;

  const go = async (pathOverride?: string, labelOverride?: string) => {
    setLoading(true); setError(null); setFact(null);

    let path = pathOverride ?? "";
    let label = labelOverride ?? "";

    if (!pathOverride) {
      if (activeMode === "date") {
        path  = `${bdMonth}/${bdDay}/date`;
        label = `${MONTHS[bdMonth - 1]} ${bdDay}`;
      } else {
        const n = parseInt(numInput, 10);
        if (!numInput.trim() || isNaN(n)) {
          setError("Please enter a valid number.");
          setLoading(false);
          return;
        }
        path  = `${n}/${activeMode}`;
        label = String(n);
      }
    }

    setQueryLabel(label);
    const result = await fetchFact(path);

    if (result && result.text) {
      setFact(result);
    } else {
      setError("Could not fetch fact. Please try again in a moment.");
    }
    setLoading(false);
  };

  const goRandom = async () => {
    const n = Math.floor(Math.random() * 999) + 1;
    const mode = activeMode === "date" ? "trivia" : activeMode;
    setNumInput(String(n));
    await go(`${n}/${mode}`, String(n));
  };

  const meta = TYPE_META[activeMode];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-lg font-heading font-bold text-foreground flex items-center gap-2">
          🔢 Number Facts &amp; Birthday History
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Enter any number or your birthday — discover hidden facts &amp; history
        </p>
      </div>

      {/* Mode cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(Object.keys(TYPE_META) as FactType[]).map((mode) => {
          const m = TYPE_META[mode];
          const active = activeMode === mode;
          return (
            <button
              key={mode}
              onClick={() => { setActiveMode(mode); setFact(null); setError(null); }}
              className={`rounded-xl p-3 text-left transition-all duration-200 border
                ${active
                  ? "bg-primary text-white border-primary shadow-md scale-[1.02]"
                  : "bg-card text-foreground border-border hover:border-primary/40 hover:bg-secondary"
                }`}
            >
              <div className="text-xl mb-1">{m.emoji}</div>
              <div className={`text-xs font-bold ${active ? "text-white" : "text-foreground"}`}>{m.label}</div>
              <div className={`text-[10px] mt-0.5 leading-tight ${active ? "text-white/75" : "text-muted-foreground"}`}>{m.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Input card */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        {activeMode === "date" ? (
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">🎂 Choose a date</p>
            <div className="flex gap-2">
              <select
                value={bdMonth}
                onChange={(e) => { const m = Number(e.target.value); setBdMonth(m); if (bdDay > (DAYS_IN[m] ?? 31)) setBdDay(1); }}
                className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
              >
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              <select
                value={bdDay}
                onChange={(e) => setBdDay(Number(e.target.value))}
                className="w-24 bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
              >
                {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              What happened on {MONTHS[bdMonth - 1]} {bdDay} in history?
            </p>
          </div>
        ) : (
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">
              {meta.emoji} Enter a number
              <span className="text-muted-foreground font-normal ml-1">({meta.placeholder})</span>
            </p>
            <input
              type="number"
              value={numInput}
              onChange={(e) => setNumInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && go()}
              placeholder={meta.placeholder}
              className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/40 font-mono"
            />
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => go()}
            disabled={loading}
            className="flex-1 bg-primary text-white rounded-xl py-2.5 text-sm font-bold hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Looking up…</>
              : <>{meta.emoji} Get {meta.label} Fact</>
            }
          </button>
          <button
            onClick={goRandom}
            disabled={loading}
            className="px-4 bg-secondary border border-border text-foreground rounded-xl text-sm font-semibold hover:bg-secondary/70 active:scale-95 transition-all disabled:opacity-60"
            title="Random number"
          >
            🎲
          </button>
        </div>
      </div>

      {/* Error */}
      {error && !loading && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-center">
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Fact result */}
      {fact && !loading && (
        <div className="rounded-2xl overflow-hidden shadow-sm">
          <div className={`bg-gradient-to-r ${meta.color} px-5 py-4`}>
            <div className="flex items-center gap-3">
              <span className="text-3xl">{meta.emoji}</span>
              <div>
                <p className="text-white/70 text-[11px] font-semibold uppercase tracking-wider">{meta.label} fact</p>
                <p className="text-white font-black text-lg leading-tight">{queryLabel}</p>
              </div>
            </div>
          </div>
          <div className="bg-card border border-border border-t-0 px-5 py-4 space-y-3">
            <p className="text-sm text-foreground leading-relaxed font-medium">{fact.text}</p>
            <div className="bg-secondary rounded-xl px-4 py-2.5 flex items-start gap-2">
              <span className="text-base shrink-0">💡</span>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {activeMode === "date"   ? "Every date holds a story. Try your own birthday!" :
                 activeMode === "math"   ? "Mathematics is the language of the universe — every number has a story." :
                 activeMode === "year"   ? "Try 1947 — the year Pakistan was founded!" :
                                          "Try your roll number, your age, or any number you like!"}
              </p>
            </div>
            <p className="text-[9px] text-muted-foreground/40 text-center">
              Powered by Numbers API · numbersapi.com
            </p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!fact && !loading && !error && (
        <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-2">
          <p className="text-3xl">🔢</p>
          <p className="text-sm font-semibold text-foreground">Discover the story behind any number</p>
          <p className="text-xs text-muted-foreground">
            Try <span className="font-mono font-bold text-primary">42</span> for trivia,{" "}
            <span className="font-mono font-bold text-primary">1947</span> for year history, or your birthday!
          </p>
        </div>
      )}
    </div>
  );
           }
        
