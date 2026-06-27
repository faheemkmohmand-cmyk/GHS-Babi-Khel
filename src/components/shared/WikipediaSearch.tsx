import { useState, useEffect, useRef, useCallback } from "react";
import {
  Search, Mic, MicOff, Star, StarOff, Clock, X, BookOpen,
  ExternalLink, ChevronRight, Loader2, Atom, History, Calculator,
  Globe, Sparkles, AlertCircle, Shuffle, ChevronDown, Brain,
  Lightbulb, HelpCircle, ArrowRight
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────────
interface WikiArticle {
  title: string;
  extract: string;
  thumbnail?: { source: string; width: number; height: number };
  content_urls?: { desktop: { page: string } };
}
interface RelatedItem {
  title: string; extract: string;
  thumbnail?: { source: string };
  content_urls?: { desktop: { page: string } };
}
interface SearchSuggestion { title: string; snippet: string; }
interface SavedFavorite {
  title: string; extract: string;
  thumbnail?: string; url?: string; savedAt: number;
}
interface SmartResult {
  type: "direct" | "question";
  query: string; keywords: string[];
  aiAnswer?: string;
  articles: WikiArticle[];
  related: RelatedItem[];
}

// ─── Constants ───────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: "all",     label: "All",     icon: Globe      },
  { id: "science", label: "Science", icon: Atom       },
  { id: "history", label: "History", icon: History    },
  { id: "math",    label: "Math",    icon: Calculator },
];
const CATEGORY_SEEDS: Record<string, string[]> = {
  science: ["Photosynthesis","Gravity","DNA","Solar System","Evolution","Atom","Newton's laws of motion"],
  history: ["World War II","Indus Valley civilization","Muhammad Ali Jinnah","Mughal Empire","Alexander the Great"],
  math:    ["Pythagorean theorem","Prime number","Algebra","Pi","Calculus","Fibonacci number"],
  all:     ["Pakistan","Water cycle","Human body","Electricity","Internet","Climate change","Democracy"],
};
const STORAGE_RECENTS   = "wiki_recent_searches";
const STORAGE_FAVORITES = "wiki_favorites";

function loadJSON<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; }
  catch { return fallback; }
}
function saveJSON(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /**/ }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMART QUESTION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════
export function isQuestion(input: string): boolean {
  const t = input.trim().toLowerCase();
  const qwords = ["what","who","why","how","when","where","which","whose","define","explain","tell me","give me"];
  if (qwords.some(w => t.startsWith(w + " ") || t.startsWith(w + "'"))) return true;
  if (t.endsWith("?")) return true;
  if (/\b(what|who|why|how|when|where|which)\b/.test(t)) return true;
  return false;
}

export function extractKeywords(question: string): string[] {
  const t = question.trim().toLowerCase().replace(/[?!.,;:'"]/g, "");

  const fillerPatterns = [
    /^(what is|what are|what was|what were|what's)\s+/,
    /^(who is|who are|who was|who were|who's)\s+/,
    /^(why is|why are|why was|why were)\s+/,
    /^(how is|how are|how does|how do|how did|how was)\s+/,
    /^(where is|where are|where was)\s+/,
    /^(when is|when was|when were|when did)\s+/,
    /^(which is|which are|which was)\s+/,
    /^(define|explain|describe|tell me about|give me info on)\s+/,
    /^(can you explain|please explain|what do you know about)\s+/,
    /^(is it true that|is there a|are there)\s+/,
  ];
  let cleaned = t;
  for (const pat of fillerPatterns) { cleaned = cleaned.replace(pat, ""); }

  const stopWords = new Set(["the","a","an","of","in","on","at","to","for","with","by","from","and","or","but","not","this","that","these","those","it","its","he","she","they","we","you","i","my","our","your","their","his","her","be","been","being","have","has","had","do","does","did","will","would","could","should","may","might","shall","must","very","also","just","more","most","some","any","all","both","each","few","many","much","other","than","then","so","if","about","into","through","during","before","after"]);

  const phraseMap: Record<string, string[]> = {
    "quantum tunneling":   ["quantum tunneling"],
    "quantum radar":       ["quantum radar"],
    "speed of light":      ["speed of light"],
    "theory of relativity":["theory of relativity","Albert Einstein"],
    "big bang":            ["Big Bang theory"],
    "black hole":          ["black hole"],
    "photosynthesis":      ["photosynthesis"],
    "dna":                 ["DNA","deoxyribonucleic acid"],
    "evolution":           ["evolution","Charles Darwin"],
    "gravity":             ["gravity","Newton's law of gravitation"],
    "electricity":         ["electricity"],
    "nuclear energy":      ["nuclear energy"],
    "climate change":      ["climate change"],
    "periodic table":      ["periodic table"],
    "goat football":       ["Lionel Messi","Cristiano Ronaldo","football records"],
    "goat cricket":        ["Sachin Tendulkar","cricket records"],
    "goat basketball":     ["Michael Jordan","LeBron James"],
    "inventor computer":   ["Charles Babbage","computer history"],
    "invented telephone":  ["Alexander Graham Bell","telephone"],
    "invented electricity": ["Benjamin Franklin","Michael Faraday"],
    "invented airplane":   ["Wright brothers","aviation"],
    "invented internet":   ["Tim Berners-Lee","ARPANET"],
    "father of computer":  ["Charles Babbage"],
    "father of pakistan":  ["Muhammad Ali Jinnah"],
    "world war":           ["World War II"],
    "mughal empire":       ["Mughal Empire"],
    "french revolution":   ["French Revolution"],
    "pythagoras theorem":  ["Pythagorean theorem"],
    "pythagorean theorem": ["Pythagorean theorem"],
    "prime number":        ["prime number"],
    "calculus":            ["calculus"],
    "fibonacci":           ["Fibonacci sequence"],
  };
  const cleanedLower = cleaned.trim();
  for (const [phrase, keywords] of Object.entries(phraseMap)) {
    if (cleanedLower.includes(phrase) || t.includes(phrase)) return keywords;
  }

  const originalLower = t;
  if (/^who (invented|created|discovered|made|built|founded)\s+/.test(originalLower)) {
    const subject = originalLower.replace(/^who (invented|created|discovered|made|built|founded)\s+/, "");
    return [subject, subject + " inventor", subject + " history"].filter(Boolean);
  }
  if (/^why (is|are|was|were)\s+/.test(originalLower)) {
    const subject = originalLower.replace(/^why (is|are|was|were)\s+/, "").replace(/\s+(not|un|im)\w*\s*\w*$/, "");
    return [subject.trim()].filter(s => s.length > 2);
  }
  if (/goat of/.test(originalLower)) {
    const sport = originalLower.replace(/.*goat of\s+/, "").trim();
    return ["greatest " + sport + " player", sport + " records", sport];
  }
  if (/^how does\s+/.test(originalLower) || /^how do\s+/.test(originalLower)) {
    const subject = originalLower.replace(/^how (does|do)\s+/, "").replace(/\s+work.*$/, "");
    return [subject.trim()];
  }

  const words = cleaned.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
  if (words.length === 0) return [question.replace(/[?!]/g, "").trim()];
  if (words.length <= 3) return [words.join(" ")];
  const generic = new Set(["available","possible","reason","cause","effect","result","thing","things","way","ways"]);
  const meaningful = words.filter(w => !generic.has(w));
  return [(meaningful.slice(0,3).join(" ")) || words.slice(0,4).join(" ")];
}

function generateAIAnswer(question: string, article: WikiArticle): string {
  const extract = article.extract;
  if (!extract) return "";
  const sentences = extract.match(/[^.!?]+[.!?]+/g) || [];
  return sentences.slice(0, 3).join(" ").trim();
}

// ─── Wikipedia API ────────────────────────────────────────────────────────────
async function fetchSuggestions(query: string): Promise<SearchSuggestion[]> {
  if (!query.trim()) return [];
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=6&namespace=0&format=json&origin=*`;
    const res = await fetch(url);
    const [, titles, snippets] = await res.json();
    return (titles as string[]).map((title: string, i: number) => ({ title, snippet: (snippets as string[])[i] || "" }));
  } catch { return []; }
}

async function fetchArticle(title: string): Promise<WikiArticle | null> {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

async function searchArticle(query: string): Promise<WikiArticle | null> {
  const direct = await fetchArticle(query);
  if (direct && direct.extract && direct.extract.length > 50) return direct;
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json&origin=*`;
    const res = await fetch(url);
    const data = await res.json();
    const hits = data?.query?.search || [];
    if (!hits.length) return null;
    return fetchArticle(hits[0].title);
  } catch { return null; }
}

async function fetchRelated(title: string): Promise<RelatedItem[]> {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/related/${encodeURIComponent(title)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.pages || []).slice(0, 4);
  } catch { return []; }
}

async function fetchRandomArticle(): Promise<WikiArticle | null> {
  try {
    const res = await fetch("https://en.wikipedia.org/api/rest_v1/page/random/summary");
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

async function smartSearch(input: string): Promise<SmartResult> {
  const isQ = isQuestion(input);
  const keywords = isQ ? extractKeywords(input) : [input.trim()];
  const articles: WikiArticle[] = [];
  for (const kw of keywords.slice(0, 3)) {
    const art = await searchArticle(kw);
    if (art && !articles.find(a => a.title === art.title)) articles.push(art);
  }
  const primary = articles[0] || null;
  const aiAnswer = (isQ && primary) ? generateAIAnswer(input, primary) : undefined;
  const related  = primary ? await fetchRelated(primary.title) : [];
  return { type: isQ ? "question" : "direct", query: input, keywords, aiAnswer, articles, related };
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
interface WikipediaSearchProps { compact?: boolean; }

const WikipediaSearch = ({ compact = false }: WikipediaSearchProps) => {
  const [query,            setQuery]            = useState("");
  const [suggestions,      setSuggestions]      = useState<SearchSuggestion[]>([]);
  const [result,           setResult]           = useState<SmartResult | null>(null);
  const [isLoading,        setIsLoading]        = useState(false);
  const [isRandomLoading,  setIsRandomLoading]  = useState(false);
  const [error,            setError]            = useState<string | null>(null);
  const [showSuggestions,  setShowSuggestions]  = useState(false);
  const [activeCategory,   setActiveCategory]   = useState("all");
  const [recentSearches,   setRecentSearches]   = useState<string[]>(() => loadJSON(STORAGE_RECENTS,   []));
  const [favorites,        setFavorites]        = useState<SavedFavorite[]>(() => loadJSON(STORAGE_FAVORITES, []));
  const [view,             setView]             = useState<"search"|"recents"|"favorites">("search");
  const [isListening,      setIsListening]      = useState(false);
  const [dailyFact,        setDailyFact]        = useState<WikiArticle | null>(null);
  const [showFullExtract,  setShowFullExtract]  = useState(false);
  const [activeArtIdx,     setActiveArtIdx]     = useState(0);

  const inputRef      = useRef<HTMLInputElement>(null);
  const debounceRef   = useRef<ReturnType<typeof setTimeout>>();
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const seeds = CATEGORY_SEEDS[activeCategory] || CATEGORY_SEEDS.all;
    fetchArticle(seeds[new Date().getDate() % seeds.length]).then(a => { if (a) setDailyFact(a); });
  }, [activeCategory]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.trim().length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      const kw = isQuestion(query) ? (extractKeywords(query)[0] || query) : query;
      const s = await fetchSuggestions(kw);
      setSuggestions(s); setShowSuggestions(true);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const doSearch = useCallback(async (term: string) => {
    if (!term.trim()) return;
    setShowSuggestions(false); setIsLoading(true);
    setError(null); setResult(null); setShowFullExtract(false); setActiveArtIdx(0);
    try {
      const res = await smartSearch(term);
      if (!res.articles.length) { setError(term); }
      else {
        setResult(res);
        const updated = [term, ...recentSearches.filter(r => r !== term)].slice(0, 10);
        setRecentSearches(updated); saveJSON(STORAGE_RECENTS, updated);
      }
    } catch { setError(term); }
    finally { setIsLoading(false); }
  }, [recentSearches]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") doSearch(query);
    if (e.key === "Escape") setShowSuggestions(false);
  };

  const handleRandom = async () => {
    setIsRandomLoading(true); setError(null);
    const art = await fetchRandomArticle();
    if (art) {
      setQuery(art.title);
      setResult({ type:"direct", query:art.title, keywords:[art.title], articles:[art], related:[] });
      fetchRelated(art.title).then(r => setResult(prev => prev ? { ...prev, related: r } : prev));
    }
    setIsRandomLoading(false);
  };

  const toggleVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Voice search not supported in this browser."); return; }
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const r = new SR(); recognitionRef.current = r;
    r.lang = "en-US"; r.interimResults = false;
    r.onresult = (e: any) => { const t = e.results[0][0].transcript; setQuery(t); setIsListening(false); doSearch(t); };
    r.onerror = () => setIsListening(false);
    r.onend   = () => setIsListening(false);
    r.start(); setIsListening(true);
  };

  const primaryArticle = result?.articles[activeArtIdx] ?? result?.articles[0] ?? null;
  const isFavorited    = primaryArticle ? favorites.some(f => f.title === primaryArticle.title) : false;

  const toggleFavorite = () => {
    if (!primaryArticle) return;
    const updated = isFavorited
      ? favorites.filter(f => f.title !== primaryArticle.title)
      : [{ title:primaryArticle.title, extract:primaryArticle.extract.slice(0,200), thumbnail:primaryArticle.thumbnail?.source, url:primaryArticle.content_urls?.desktop.page, savedAt:Date.now() }, ...favorites].slice(0,20);
    setFavorites(updated); saveJSON(STORAGE_FAVORITES, updated);
  };

  // ─── CSS ───────────────────────────────────────────────────────────────────
  const css = `
    .wsr { font-family:inherit; }
    .wsr-hero { background:linear-gradient(135deg,#0086FF 0%,#0066CC 55%,#004999 100%); border-radius:20px; padding:20px 22px 16px; margin-bottom:16px; color:#fff; display:flex; align-items:center; gap:12px; }
    .wsr-hero-icon { width:38px; height:38px; border-radius:10px; background:rgba(255,255,255,.12); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .wsr-hero-title { font-weight:800; font-size:15px; letter-spacing:-.3px; }
    .wsr-hero-sub { font-size:11px; opacity:.6; margin-top:2px; }
    .wsr-card { background:hsl(var(--card)); border:1px solid hsl(var(--border)); border-radius:16px; box-shadow:0 1px 4px rgba(0,0,0,.07),0 4px 16px rgba(0,0,0,.05); transition:box-shadow .2s,transform .2s; }
    .wsr-chips { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px; }
    .wsr-chip { display:inline-flex; align-items:center; gap:4px; padding:5px 13px; border-radius:999px; font-size:12px; font-weight:600; cursor:pointer; border:1.5px solid transparent; transition:all .15s; white-space:nowrap; }
    .wsr-chip-on  { background:hsl(var(--primary)); color:hsl(var(--primary-foreground)); }
    .wsr-chip-off { background:hsl(var(--secondary)); color:hsl(var(--secondary-foreground)); border-color:transparent; }
    .wsr-chip-off:hover { border-color:hsl(var(--primary)); color:hsl(var(--primary)); }
    /* search bar */
    .wsr-bar-wrap { position:relative; z-index:200; margin-bottom:16px; }
    .wsr-bar-row  { display:flex; gap:8px; }
    .wsr-inp-wrap { position:relative; flex:1; }
    .wsr-inp { width:100%; padding:10px 36px 10px 36px; border-radius:12px; border:1.5px solid hsl(var(--border)); background:hsl(var(--background)); color:hsl(var(--foreground)); font-size:14px; outline:none; transition:border-color .15s,box-shadow .15s; box-sizing:border-box; }
    .wsr-inp:focus { border-color:hsl(var(--primary)); box-shadow:0 0 0 3px hsl(var(--primary)/.12); }
    .wsr-inp-icon  { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:hsl(var(--muted-foreground)); pointer-events:none; }
    .wsr-inp-clear { position:absolute; right:10px; top:50%; transform:translateY(-50%); cursor:pointer; color:hsl(var(--muted-foreground)); background:none; border:none; padding:2px; display:flex; align-items:center; }
    .wsr-btn { display:inline-flex; align-items:center; justify-content:center; gap:5px; padding:10px 14px; border-radius:12px; font-size:13px; font-weight:600; cursor:pointer; border:none; transition:all .15s; white-space:nowrap; flex-shrink:0; }
    .wsr-btn-primary { background:hsl(var(--primary)); color:hsl(var(--primary-foreground)); }
    .wsr-btn-primary:disabled { opacity:.4; cursor:not-allowed; }
    .wsr-btn-ghost { background:hsl(var(--background)); border:1.5px solid hsl(var(--border)); color:hsl(var(--foreground)); }
    .wsr-btn-ghost:hover { background:hsl(var(--secondary)); }
    .wsr-voice-on { background:#ef4444!important; color:#fff!important; animation:wsr-pulse 1s infinite; }
    /* suggestions */
    .wsr-sugs { position:absolute; top:calc(100% + 6px); left:0; right:0; background:hsl(var(--card)); border:1.5px solid hsl(var(--border)); border-radius:14px; z-index:9999; box-shadow:0 16px 48px rgba(0,0,0,.2),0 2px 8px rgba(0,0,0,.1); overflow:hidden; max-height:270px; overflow-y:auto; }
    .dark .wsr-sugs { box-shadow:0 16px 48px rgba(0,0,0,.5); }
    .wsr-sug { padding:11px 16px; cursor:pointer; border-bottom:1px solid hsl(var(--border)/.6); background:hsl(var(--card)); transition:background .1s; }
    .wsr-sug:last-child { border-bottom:none; }
    .wsr-sug:hover { background:hsl(var(--accent)); }
    .wsr-sug-title { font-size:13px; font-weight:700; color:hsl(var(--foreground)); }
    .wsr-sug-snip  { font-size:11px; color:hsl(var(--muted-foreground)); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    /* hint */
    .wsr-qhint { margin-top:6px; display:flex; align-items:center; gap:5px; font-size:11px; color:hsl(var(--primary)); }
    /* ai box */
    .wsr-ai { background:linear-gradient(135deg,hsl(var(--primary)/.08),hsl(var(--primary)/.02)); border:1.5px solid hsl(var(--primary)/.25); border-radius:14px; padding:14px 16px; margin-bottom:2px; }
    .wsr-ai-lbl { display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:700; color:hsl(var(--primary)); text-transform:uppercase; letter-spacing:.06em; margin-bottom:6px; }
    .wsr-ai-txt { font-size:13.5px; line-height:1.72; color:hsl(var(--foreground)); }
    /* q-detected bar */
    .wsr-qbar { display:flex; align-items:flex-start; gap:8px; padding:10px 14px; background:hsl(var(--secondary)); border-radius:12px; margin-bottom:2px; }
    .wsr-qbar-lbl { font-size:11px; font-weight:700; color:hsl(var(--primary)); margin-bottom:2px; }
    .wsr-qbar-kws  { font-size:12px; color:hsl(var(--muted-foreground)); }
    /* article tabs */
    .wsr-tabs { display:flex; gap:4px; flex-wrap:wrap; margin-bottom:10px; }
    .wsr-tab { font-size:11px; font-weight:600; padding:4px 12px; border-radius:8px; cursor:pointer; border:1.5px solid transparent; transition:all .15s; }
    .wsr-tab-on  { background:hsl(var(--primary)); color:hsl(var(--primary-foreground)); }
    .wsr-tab-off { background:hsl(var(--secondary)); color:hsl(var(--muted-foreground)); }
    .wsr-tab-off:hover { border-color:hsl(var(--primary)/.4); }
    /* article card */
    .wsr-art { padding:18px 18px 16px; }
    .wsr-art::after { content:""; display:table; clear:both; }
    .wsr-art-title { font-size:18px; font-weight:800; color:hsl(var(--foreground)); margin-bottom:3px; }
    .wsr-art-link { display:inline-flex; align-items:center; gap:4px; font-size:12px; color:hsl(var(--primary)); text-decoration:none; margin-bottom:12px; }
    .wsr-art-link:hover { text-decoration:underline; }
    .wsr-art-img { float:right; margin:0 0 10px 14px; width:130px; height:105px; border-radius:10px; object-fit:cover; display:block; }
    @media(max-width:480px){ .wsr-art-img { float:none; width:100%; height:150px; margin:0 0 12px 0; } }
    .wsr-extract { font-size:14px; line-height:1.76; color:hsl(var(--foreground)/.84); }
    .wsr-readmore { display:inline-flex; align-items:center; gap:3px; font-size:12px; color:hsl(var(--primary)); background:none; border:none; cursor:pointer; margin-top:7px; padding:0; }
    .wsr-fav-btn { padding:7px; border-radius:10px; border:none; cursor:pointer; flex-shrink:0; transition:background .15s; }
    /* related */
    .wsr-related-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:8px; }
    @media(max-width:500px){ .wsr-related-grid { grid-template-columns:1fr; } }
    .wsr-rel-item { display:flex; gap:10px; align-items:center; padding:10px 12px; background:hsl(var(--secondary)); border-radius:12px; cursor:pointer; border:1.5px solid transparent; transition:all .15s; width:100%; text-align:left; }
    .wsr-rel-item:hover { background:hsl(var(--accent)); border-color:hsl(var(--primary)/.2); transform:translateY(-1px); }
    .wsr-rel-img { width:40px; height:40px; border-radius:8px; object-fit:cover; flex-shrink:0; }
    .wsr-rel-title { font-size:12px; font-weight:700; color:hsl(var(--foreground)); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .wsr-rel-snip  { font-size:11px; color:hsl(var(--muted-foreground)); margin-top:2px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; line-height:1.45; }
    /* not found */
    .wsr-nf { padding:24px; text-align:center; }
    .wsr-nf-title { font-weight:700; font-size:15px; margin:10px 0 4px; }
    .wsr-nf-sub { font-size:13px; color:hsl(var(--muted-foreground)); margin-bottom:14px; }
    /* daily */
    .wsr-daily { border-left:4px solid hsl(var(--primary)/.45); padding:14px 16px; }
    /* skeleton */
    .wsr-skel { background:linear-gradient(90deg,hsl(var(--muted)) 0%,hsl(var(--accent)) 50%,hsl(var(--muted)) 100%); background-size:200% 100%; animation:wsr-shimmer 1.4s infinite; border-radius:8px; }
    @keyframes wsr-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
    @keyframes wsr-pulse   { 0%,100%{opacity:1} 50%{opacity:.5} }
    .wsr-fade { animation:wsr-fadein .3s ease; }
    @keyframes wsr-fadein  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
    /* section title */
    .wsr-sec-title { font-weight:700; font-size:13px; display:flex; align-items:center; gap:6px; color:hsl(var(--foreground)); margin-bottom:9px; }
  `;

  return (
    <div className="wsr">
      <style>{css}</style>

      {/* Hero */}
      {!compact && (
        <div className="wsr-hero">
          <div className="wsr-hero-icon"><Brain size={20} /></div>
          <div style={{flex:1}}>
            <div className="wsr-hero-title">Smart Wikipedia Search</div>
            <div className="wsr-hero-sub">Ask questions or search topics — AI extracts the right keywords automatically</div>
          </div>
          <button onClick={handleRandom} disabled={isRandomLoading}
            style={{display:"flex",alignItems:"center",gap:5,padding:"7px 12px",borderRadius:9,background:"rgba(255,255,255,.12)",border:"none",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",flexShrink:0}}>
            {isRandomLoading ? <Loader2 size={13} className="animate-spin" /> : <Shuffle size={13} />} Random
          </button>
        </div>
      )}

      {/* Category + view chips */}
      <div className="wsr-chips">
        {CATEGORIES.map(cat => {
          const Icon = cat.icon;
          return (
            <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
              className={"wsr-chip " + (activeCategory === cat.id ? "wsr-chip-on" : "wsr-chip-off")}>
              <Icon size={12} />{cat.label}
            </button>
          );
        })}
        <div style={{marginLeft:"auto",display:"flex",gap:5,flexWrap:"wrap"}}>
          {(["search","recents","favorites"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={"wsr-chip " + (view === v ? "wsr-chip-on" : "wsr-chip-off")} style={{fontSize:11}}>
              {v === "search"    && <Search size={11} />}
              {v === "recents"   && <Clock  size={11} />}
              {v === "favorites" && <Star   size={11} />}
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Search bar */}
      <div className="wsr-bar-wrap">
        <div className="wsr-bar-row">
          <div className="wsr-inp-wrap">
            <span className="wsr-inp-icon"><Search size={15} /></span>
            <input ref={inputRef} value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 260)}
              placeholder='Search or ask "What is quantum tunneling?"'
              className="wsr-inp"
            />
            {query && (
              <button className="wsr-inp-clear" onClick={() => { setQuery(""); setSuggestions([]); setResult(null); setError(null); }}>
                <X size={14} />
              </button>
            )}
            {showSuggestions && suggestions.length > 0 && (
              <div className="wsr-sugs">
                {suggestions.map(s => (
                  <div key={s.title} className="wsr-sug"
                    onMouseDown={() => { setQuery(s.title); doSearch(s.title); }}>
                    <div className="wsr-sug-title">{s.title}</div>
                    {s.snippet && <div className="wsr-sug-snip">{s.snippet}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button onClick={toggleVoice} className={"wsr-btn wsr-btn-ghost" + (isListening ? " wsr-voice-on" : "")} title="Voice search">
            {isListening ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
          <button onClick={() => doSearch(query)} disabled={isLoading || !query.trim()} className="wsr-btn wsr-btn-primary">
            {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            <span style={{display:"none"}} className="sm:inline">Go</span>
          </button>
        </div>

        {query && isQuestion(query) && !isLoading && (
          <div className="wsr-qhint">
            <Brain size={12} />
            <span>Question detected — searching: <strong>{extractKeywords(query).slice(0,2).join(" · ")}</strong></span>
          </div>
        )}
      </div>

      {/* ── RECENTS ──────────────────────────────────────────────────────── */}
      {view === "recents" && (
        <div className="wsr-card wsr-fade" style={{padding:16}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div style={{fontWeight:700,fontSize:14,display:"flex",alignItems:"center",gap:6}}>
              <Clock size={15} style={{color:"hsl(var(--primary))"}} /> Recent Searches
            </div>
            {recentSearches.length > 0 && (
              <button onClick={() => { setRecentSearches([]); saveJSON(STORAGE_RECENTS,[]); }}
                style={{fontSize:11,color:"hsl(var(--destructive))",background:"none",border:"none",cursor:"pointer"}}>Clear all</button>
            )}
          </div>
          {recentSearches.length === 0
            ? <p style={{fontSize:13,color:"hsl(var(--muted-foreground))",textAlign:"center",padding:"20px 0"}}>No recent searches yet.</p>
            : <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                {recentSearches.map(r => (
                  <button key={r} onClick={() => { setQuery(r); doSearch(r); setView("search"); }}
                    style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:10,background:"hsl(var(--secondary))",border:"none",fontSize:12,cursor:"pointer",color:"hsl(var(--foreground))"}}>
                    <Clock size={11} style={{color:"hsl(var(--muted-foreground))"}} />{r}
                  </button>
                ))}
              </div>
          }
        </div>
      )}

      {/* ── FAVORITES ─────────────────────────────────────────────────────── */}
      {view === "favorites" && (
        <div className="wsr-fade">
          <div className="wsr-sec-title"><Star size={14} style={{color:"#1e3a8a"}} /> Saved Favorites</div>
          {favorites.length === 0
            ? <div className="wsr-card" style={{padding:28,textAlign:"center"}}>
                <Star size={32} style={{color:"hsl(var(--muted-foreground))",margin:"0 auto 8px"}} />
                <p style={{fontSize:13,color:"hsl(var(--muted-foreground))"}}>No favorites yet. Star an article to save it!</p>
              </div>
            : <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>
                {favorites.map(fav => (
                  <div key={fav.title} className="wsr-card" style={{padding:13,display:"flex",gap:10}}>
                    {fav.thumbnail && <img src={fav.thumbnail} alt="" style={{width:50,height:50,borderRadius:8,objectFit:"cover",flexShrink:0}} />}
                    <div style={{flex:1,minWidth:0}}>
                      <button onClick={() => { setQuery(fav.title); doSearch(fav.title); setView("search"); }}
                        style={{fontWeight:700,fontSize:13,color:"hsl(var(--primary))",background:"none",border:"none",cursor:"pointer",textAlign:"left",padding:0,marginBottom:3}}>
                        {fav.title}
                      </button>
                      <p style={{fontSize:11,color:"hsl(var(--muted-foreground))",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden",lineHeight:1.5}}>{fav.extract}</p>
                      <div style={{display:"flex",gap:8,marginTop:5}}>
                        {fav.url && <a href={fav.url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:"hsl(var(--primary))",display:"flex",alignItems:"center",gap:3}}><ExternalLink size={10} />Open</a>}
                        <button onClick={() => { const u=favorites.filter(f=>f.title!==fav.title); setFavorites(u); saveJSON(STORAGE_FAVORITES,u); }}
                          style={{fontSize:11,color:"hsl(var(--destructive))",background:"none",border:"none",cursor:"pointer",marginLeft:"auto"}}>Remove</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      {/* ── SEARCH VIEW ──────────────────────────────────────────────────── */}
      {view === "search" && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>

          {/* Loading */}
          {isLoading && (
            <div className="wsr-card wsr-fade" style={{padding:20}}>
              <div className="wsr-skel" style={{height:22,width:"42%",marginBottom:14}} />
              <div style={{display:"flex",gap:14}}>
                <div className="wsr-skel" style={{width:96,height:88,flexShrink:0}} />
                <div style={{flex:1,display:"flex",flexDirection:"column",gap:8}}>
                  {[1,2,3].map(i => <div key={i} className="wsr-skel" style={{height:12,width: i===3?"60%":"100%"}} />)}
                </div>
              </div>
            </div>
          )}

          {/* Not found */}
          {error && !isLoading && (
            <div className="wsr-card wsr-fade">
              <div className="wsr-nf">
                <AlertCircle size={38} style={{color:"hsl(var(--muted-foreground))",margin:"0 auto"}} />
                <p className="wsr-nf-title">No results found</p>
                <p className="wsr-nf-sub">Couldn't find "{error}" on Wikipedia. Try a related term:</p>
                <div style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center",marginBottom:14}}>
                  {extractKeywords(error).map(kw => (
                    <button key={kw} onClick={() => doSearch(kw)} className={"wsr-chip wsr-chip-off"} style={{fontSize:12}}>
                      <Search size={11} />{kw}
                    </button>
                  ))}
                </div>
                <div style={{display:"flex",gap:8,justifyContent:"center"}}>
                  <button onClick={handleRandom} className="wsr-btn wsr-btn-ghost" style={{fontSize:12}}>
                    <Shuffle size={12} />Random
                  </button>
                  <button onClick={() => { setError(null); inputRef.current?.focus(); }}
                    className="wsr-btn wsr-btn-primary" style={{fontSize:12}}>
                    <Search size={12} />Try Again
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Result */}
          {result && !isLoading && (
            <div className="wsr-fade" style={{display:"flex",flexDirection:"column",gap:12}}>

              {/* Question-detected bar */}
              {result.type === "question" && (
                <div className="wsr-qbar">
                  <Brain size={15} style={{color:"hsl(var(--primary))",flexShrink:0,marginTop:2}} />
                  <div>
                    <div className="wsr-qbar-lbl">Question Detected</div>
                    <div className="wsr-qbar-kws">
                      Searched for: <strong style={{color:"hsl(var(--foreground))"}}>{result.keywords.join(" · ")}</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Multi-article tabs */}
              {result.articles.length > 1 && (
                <div className="wsr-tabs">
                  {result.articles.map((art, i) => (
                    <button key={art.title} onClick={() => { setActiveArtIdx(i); setShowFullExtract(false); }}
                      className={"wsr-tab " + (activeArtIdx === i ? "wsr-tab-on" : "wsr-tab-off")}>
                      {art.title.length > 24 ? art.title.slice(0,24)+"…" : art.title}
                    </button>
                  ))}
                </div>
              )}

              {/* AI Answer */}
              {result.aiAnswer && (
                <div className="wsr-ai wsr-card">
                  <div className="wsr-ai-lbl"><Lightbulb size={12} />AI Answer</div>
                  <p className="wsr-ai-txt">{result.aiAnswer}</p>
                </div>
              )}

              {/* Article */}
              {primaryArticle && (
                <div className="wsr-card">
                  <div className="wsr-art">
                    <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:2}}>
                      <div style={{flex:1,minWidth:0}}>
                        <h3 className="wsr-art-title">{primaryArticle.title}</h3>
                        <a href={primaryArticle.content_urls?.desktop.page} target="_blank" rel="noopener noreferrer" className="wsr-art-link">
                          <ExternalLink size={11} />Open full article on Wikipedia
                        </a>
                      </div>
                      <button onClick={toggleFavorite} className="wsr-fav-btn"
                        style={{background:isFavorited?"hsl(var(--primary)/.1)":"hsl(var(--secondary))"}}>
                        {isFavorited
                          ? <Star size={17} style={{color:"#1e3a8a",fill:"#1e3a8a"}} />
                          : <StarOff size={17} style={{color:"hsl(var(--muted-foreground))"}} />}
                      </button>
                    </div>
                    {primaryArticle.thumbnail && (
                      <img src={primaryArticle.thumbnail.source} alt={primaryArticle.title} className="wsr-art-img" />
                    )}
                    <p className="wsr-extract">
                      {showFullExtract ? primaryArticle.extract : primaryArticle.extract.slice(0,420) + (primaryArticle.extract.length > 420 ? "…" : "")}
                    </p>
                    {primaryArticle.extract.length > 420 && (
                      <button className="wsr-readmore" onClick={() => setShowFullExtract(s => !s)}>
                        <ChevronDown size={13} style={{transform:showFullExtract?"rotate(180deg)":"none",transition:"transform .2s"}} />
                        {showFullExtract ? "Show less" : "Read more"}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Related */}
              {result.related.length > 0 && (
                <div>
                  <div className="wsr-sec-title"><Sparkles size={14} style={{color:"hsl(var(--primary))"}} />Related Topics</div>
                  <div className="wsr-related-grid">
                    {result.related.map(r => (
                      <button key={r.title} className="wsr-rel-item" onClick={() => { setQuery(r.title); doSearch(r.title); }}>
                        {r.thumbnail && <img src={r.thumbnail.source} alt="" className="wsr-rel-img" />}
                        <div style={{flex:1,minWidth:0}}>
                          <div className="wsr-rel-title">{r.title}</div>
                          <div className="wsr-rel-snip">{r.extract}</div>
                        </div>
                        <ChevronRight size={14} style={{color:"hsl(var(--muted-foreground))",flexShrink:0}} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Daily fact */}
          {!result && !isLoading && !error && dailyFact && (
            <div className="wsr-fade">
              <div className="wsr-sec-title"><Sparkles size={14} style={{color:"#1e3a8a"}} />Daily Knowledge Fact</div>
              <div className="wsr-card wsr-daily">
                <div style={{display:"flex",gap:12}}>
                  {dailyFact.thumbnail && <img src={dailyFact.thumbnail.source} alt="" style={{width:58,height:58,borderRadius:10,objectFit:"cover",flexShrink:0}} />}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>{dailyFact.title}</div>
                    <div style={{fontSize:12,color:"hsl(var(--muted-foreground))",lineHeight:1.6}}>{dailyFact.extract.slice(0,180)}…</div>
                    <button onClick={() => { setQuery(dailyFact.title); doSearch(dailyFact.title); }}
                      style={{display:"flex",alignItems:"center",gap:4,fontSize:12,fontWeight:600,color:"hsl(var(--primary))",background:"none",border:"none",cursor:"pointer",marginTop:7,padding:0}}>
                      <ArrowRight size={12} />Learn more
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Empty */}
          {!result && !isLoading && !error && !dailyFact && (
            <div style={{textAlign:"center",padding:"36px 0"}}>
              <BookOpen size={38} style={{color:"hsl(var(--muted-foreground))",margin:"0 auto 10px"}} />
              <p style={{fontSize:13,color:"hsl(var(--muted-foreground))"}}>Search any topic or ask a question<br/><em style={{opacity:.7}}>"What is quantum tunneling?" · "Who invented computer?"</em></p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WikipediaSearch;
