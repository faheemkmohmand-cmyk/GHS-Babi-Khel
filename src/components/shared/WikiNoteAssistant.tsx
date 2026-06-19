import { useState, useCallback, useRef } from "react";
import {
  BookOpen, X, Search, Brain, Lightbulb, ExternalLink,
  ChevronRight, Loader2, Sparkles, Minimize2, Maximize2, Mic, MicOff
} from "lucide-react";
import { isQuestion, extractKeywords } from "@/components/shared/WikipediaSearch";

// ── Types ─────────────────────────────────────────────────────────────────────
interface WikiArticle {
  title: string; extract: string;
  thumbnail?: { source: string };
  content_urls?: { desktop: { page: string } };
}
interface RelatedItem {
  title: string; extract: string;
  thumbnail?: { source: string };
  content_urls?: { desktop: { page: string } };
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function searchWiki(query: string): Promise<WikiArticle | null> {
  try {
    const direct = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`
    );
    if (direct.ok) {
      const data = await direct.json();
      if (data.extract && data.extract.length > 50) return data;
    }
    // fallback: search API
    const sr = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=2&format=json&origin=*`
    );
    const sd = await sr.json();
    const hits = sd?.query?.search || [];
    if (!hits.length) return null;
    const r2 = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hits[0].title)}`
    );
    return r2.ok ? r2.json() : null;
  } catch { return null; }
}

async function fetchRelated(title: string): Promise<RelatedItem[]> {
  try {
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/related/${encodeURIComponent(title)}`);
    if (!r.ok) return [];
    const d = await r.json();
    return (d.pages || []).slice(0, 3);
  } catch { return []; }
}

function simplify(text: string): string {
  // Return first 2 sentences max for student-friendly brevity
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  return sentences.slice(0, 2).join(" ").trim();
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface WikiNoteAssistantProps {
  chapterTitle?: string;
  subjectColor?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
const WikiNoteAssistant = ({
  chapterTitle = "",
  subjectColor = "#3b82f6"
}: WikiNoteAssistantProps) => {
  const [open,         setOpen]         = useState(false);
  const [minimized,    setMinimized]    = useState(false);
  const [query,        setQuery]        = useState("");
  const [isLoading,    setIsLoading]    = useState(false);
  const [article,      setArticle]      = useState<WikiArticle | null>(null);
  const [related,      setRelated]      = useState<RelatedItem[]>([]);
  const [aiAnswer,     setAiAnswer]     = useState<string>("");
  const [isQ,         setIsQ]           = useState(false);
  const [keywords,     setKeywords]     = useState<string[]>([]);
  const [error,        setError]        = useState(false);
  const [isListening,  setIsListening]  = useState(false);
  const [history,      setHistory]      = useState<string[]>([]);

  const inputRef      = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const doSearch = useCallback(async (term: string) => {
    if (!term.trim()) return;
    setIsLoading(true); setArticle(null); setRelated([]); setAiAnswer(""); setError(false);

    const q = isQuestion(term);
    const kws = q ? extractKeywords(term) : [term.trim()];
    setIsQ(q); setKeywords(kws);

    const art = await searchWiki(kws[0] || term);
    if (!art) { setError(true); setIsLoading(false); return; }

    setArticle(art);
    if (q) setAiAnswer(simplify(art.extract));
    setHistory(h => [term, ...h.filter(x => x !== term)].slice(0, 6));
    setIsLoading(false);
    fetchRelated(art.title).then(setRelated);
  }, []);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") doSearch(query);
  };

  const quickSearch = (term: string) => {
    setQuery(term); doSearch(term);
  };

  const toggleVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const r = new SR(); recognitionRef.current = r;
    r.lang = "en-US"; r.interimResults = false;
    r.onresult = (e: any) => {
      const t = e.results[0][0].transcript;
      setQuery(t); setIsListening(false); doSearch(t);
    };
    r.onerror = () => setIsListening(false);
    r.onend   = () => setIsListening(false);
    r.start(); setIsListening(true);
  };

  // ── CSS ───────────────────────────────────────────────────────────────────
  const css = `
    .wna-fab {
      position:fixed; bottom:80px; left:12px; z-index:45;
      width:48px; height:48px; border-radius:50%;
      display:flex; align-items:center; justify-content:center;
      border:none; cursor:pointer;
      box-shadow:0 4px 20px rgba(0,0,0,.22);
      transition:transform .2s,box-shadow .2s;
    }
    @media(min-width:640px){
      .wna-fab { bottom:96px; left:16px; width:48px; height:48px; }
    }
    .wna-fab:hover { transform:scale(1.08); box-shadow:0 6px 28px rgba(0,0,0,.28); }
    .wna-fab-label {
      position:absolute; left:56px; top:50%; transform:translateY(-50%);
      background:#1e293b; color:#fff; font-size:11px; font-weight:600;
      padding:4px 10px; border-radius:6px; white-space:nowrap;
      opacity:0; pointer-events:none; transition:opacity .15s;
    }
    .wna-fab:hover .wna-fab-label { opacity:1; }
    .wna-fab-badge {
      position:absolute; top:-3px; right:-3px;
      width:15px; height:15px; border-radius:50%;
      background:#1e3a8a; border:2px solid hsl(var(--background));
      display:flex; align-items:center; justify-content:center;
      font-size:8px; font-weight:800; color:#fff;
    }
    .wna-panel {
      position:fixed; bottom:56px; left:8px; right:8px; z-index:46;
      width:auto;
      background:hsl(var(--card)); border:1.5px solid hsl(var(--border));
      border-radius:16px;
      box-shadow:0 -4px 24px rgba(0,0,0,.15),0 8px 32px rgba(0,0,0,.12);
      display:flex; flex-direction:column;
      height:72vh;
      max-height:72vh;
      overflow:hidden;
    }
    @media(min-width:640px){
      .wna-panel {
        bottom:96px; left:16px; right:auto;
        width:min(360px, calc(100vw - 24px));
        border-radius:20px;
        box-shadow:0 12px 48px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.1);
        height:auto;
        max-height:min(560px, calc(100vh - 120px));
      }
    }
    .dark .wna-panel { box-shadow:0 12px 48px rgba(0,0,0,.45); }
    .wna-panel-min { max-height:56px!important; overflow:hidden; }
    .wna-header {
      display:flex; align-items:center; gap:10px; padding:13px 14px;
      border-bottom:1px solid hsl(var(--border));
      flex-shrink:0; cursor:default;
    }
    .wna-header-icon { width:32px; height:32px; border-radius:9px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .wna-header-title { font-weight:700; font-size:13px; color:hsl(var(--foreground)); }
    .wna-header-sub   { font-size:10px; color:hsl(var(--muted-foreground)); margin-top:1px; }
    .wna-body { flex:1; overflow-y:auto; overflow-x:hidden; padding:12px 13px 16px; display:flex; flex-direction:column; gap:10px; -webkit-overflow-scrolling:touch; overscroll-behavior:contain; }
    /* search row */
    .wna-srow { display:flex; gap:6px; }
    .wna-sinp {
      flex:1; padding:8px 12px 8px 32px; border-radius:10px;
      border:1.5px solid hsl(var(--border)); background:hsl(var(--background));
      color:hsl(var(--foreground)); font-size:13px; outline:none;
      transition:border-color .15s; min-width:0;
    }
    .wna-sinp:focus { border-color:hsl(var(--primary)); }
    .wna-sinp-wrap { position:relative; flex:1; }
    .wna-sinp-icon { position:absolute; left:9px; top:50%; transform:translateY(-50%); color:hsl(var(--muted-foreground)); pointer-events:none; }
    .wna-sbtn {
      padding:8px 11px; border-radius:10px; border:none; cursor:pointer;
      font-size:12px; font-weight:600; display:flex; align-items:center; gap:4px; flex-shrink:0;
    }
    .wna-sbtn-p { background:hsl(var(--primary)); color:hsl(var(--primary-foreground)); }
    .wna-sbtn-p:disabled { opacity:.4; cursor:not-allowed; }
    .wna-sbtn-g { background:hsl(var(--secondary)); border:1.5px solid hsl(var(--border)); color:hsl(var(--foreground)); }
    .wna-voice-on { background:#ef4444!important; color:#fff!important; animation:wna-pulse 1s infinite; }
    @keyframes wna-pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
    /* qhint */
    .wna-qhint { font-size:11px; color:hsl(var(--primary)); display:flex; align-items:center; gap:4px; }
    /* chapter pill */
    .wna-cpill { font-size:11px; font-weight:600; display:flex; align-items:center; gap:5px; padding:5px 10px; border-radius:8px; background:hsl(var(--secondary)); flex-wrap:wrap; }
    /* quick actions */
    .wna-qa-row { display:flex; gap:5px; flex-wrap:wrap; }
    .wna-qa-btn { font-size:10px; font-weight:600; padding:4px 10px; border-radius:7px; background:hsl(var(--secondary)); border:1px solid hsl(var(--border)); cursor:pointer; color:hsl(var(--foreground)); transition:background .1s; }
    .wna-qa-btn:hover { background:hsl(var(--accent)); }
    /* history */
    .wna-hist-row { display:flex; flex-wrap:wrap; gap:5px; }
    .wna-hist-btn { font-size:10px; padding:3px 9px; border-radius:6px; background:hsl(var(--secondary)); border:none; cursor:pointer; color:hsl(var(--muted-foreground)); }
    .wna-hist-btn:hover { color:hsl(var(--foreground)); background:hsl(var(--accent)); }
    /* ai box */
    .wna-ai { border-radius:12px; padding:11px 13px; border:1.5px solid; }
    .wna-ai-lbl { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; display:flex; align-items:center; gap:4px; margin-bottom:5px; }
    .wna-ai-txt { font-size:13px; line-height:1.68; }
    /* article */
    .wna-article { background:hsl(var(--secondary)); border-radius:12px; padding:12px; }
    .wna-art-title { font-weight:700; font-size:14px; color:hsl(var(--foreground)); margin-bottom:3px; }
    .wna-art-link { display:inline-flex; align-items:center; gap:3px; font-size:11px; color:hsl(var(--primary)); text-decoration:none; margin-bottom:8px; }
    .wna-art-link:hover { text-decoration:underline; }
    .wna-art-img { width:100%; border-radius:9px; object-fit:cover; max-height:120px; display:block; margin-bottom:8px; }
    .wna-art-extract { font-size:12.5px; line-height:1.7; color:hsl(var(--foreground)/.84); }
    /* related */
    .wna-rel-item { display:flex; gap:8px; align-items:center; padding:8px 10px; background:hsl(var(--card)); border:1px solid hsl(var(--border)); border-radius:10px; cursor:pointer; transition:background .12s; width:100%; text-align:left; }
    .wna-rel-item:hover { background:hsl(var(--accent)); }
    .wna-rel-img { width:36px; height:36px; border-radius:7px; object-fit:cover; flex-shrink:0; }
    .wna-rel-title { font-size:12px; font-weight:600; color:hsl(var(--foreground)); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .wna-rel-snip  { font-size:10.5px; color:hsl(var(--muted-foreground)); overflow:hidden; display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; }
    /* skeleton */
    .wna-skel { background:linear-gradient(90deg,hsl(var(--muted)) 0%,hsl(var(--accent)) 50%,hsl(var(--muted)) 100%); background-size:200% 100%; animation:wna-shimmer 1.4s infinite; border-radius:7px; }
    @keyframes wna-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
    .wna-fade { animation:wna-fadein .25s ease; }
    @keyframes wna-fadein { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:translateY(0)} }
    /* sec label */
    .wna-sec { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:hsl(var(--muted-foreground)); margin-bottom:5px; }
    /* error */
    .wna-err { font-size:12.5px; color:hsl(var(--muted-foreground)); text-align:center; padding:16px 0; }
    /* kw tag */
    .wna-kw { font-size:10px; font-weight:600; padding:2px 8px; border-radius:999px; background:hsl(var(--primary)/.1); color:hsl(var(--primary)); display:inline-block; }
  `;

  // ── Quick searches based on chapter title ──────────────────────────────────
  const quickActions = chapterTitle
    ? [chapterTitle, `What is ${chapterTitle}?`, `${chapterTitle} examples`, `${chapterTitle} history`].slice(0, 4)
    : ["Photosynthesis","Quantum physics","Algebra","World War II"];

  return (
    <>
      <style>{css}</style>

      {/* FAB button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="wna-fab"
          style={{ background: subjectColor }}
          title="Wikipedia Study Assistant"
          aria-label="Wikipedia Study Assistant"
        >
          <BookOpen size={22} color="#fff" />
          <span className="wna-fab-badge">W</span>
          <span className="wna-fab-label">Wikipedia Assistant</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className={"wna-panel" + (minimized ? " wna-panel-min" : "")}>

          {/* Header */}
          <div className="wna-header">
            <div className="wna-header-icon" style={{ background: subjectColor + "22" }}>
              <BookOpen size={16} style={{ color: subjectColor }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="wna-header-title">Study Assistant</div>
              {!minimized && <div className="wna-header-sub">Ask anything while you study</div>}
            </div>
            <button onClick={() => setMinimized(m => !m)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "hsl(var(--muted-foreground))", display: "flex", alignItems: "center" }}>
              {minimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
            </button>
            <button onClick={() => { setOpen(false); setMinimized(false); }}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "hsl(var(--muted-foreground))", display: "flex", alignItems: "center" }}>
              <X size={15} />
            </button>
          </div>

          {/* Body */}
          {!minimized && (
            <div className="wna-body">

              {/* Chapter context pill */}
              {chapterTitle && (
                <div className="wna-cpill" style={{ color: subjectColor }}>
                  <Brain size={12} />
                  <span style={{ color: "hsl(var(--muted-foreground))", fontWeight: 400 }}>Reading:</span>
                  <span style={{ color: "hsl(var(--foreground))" }}>{chapterTitle}</span>
                  <button onClick={() => quickSearch(chapterTitle)}
                    style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: subjectColor, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    Search this →
                  </button>
                </div>
              )}

              {/* Search input */}
              <div className="wna-srow">
                <div className="wna-sinp-wrap">
                  <span className="wna-sinp-icon"><Search size={13} /></span>
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder='Ask a question or search a topic…'
                    className="wna-sinp"
                    autoComplete="off"
                  />
                </div>
                <button onClick={toggleVoice}
                  className={"wna-sbtn wna-sbtn-g" + (isListening ? " wna-voice-on" : "")}>
                  {isListening ? <MicOff size={13} /> : <Mic size={13} />}
                </button>
                <button onClick={() => doSearch(query)} disabled={isLoading || !query.trim()} className="wna-sbtn wna-sbtn-p">
                  {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                </button>
              </div>

              {/* Question hint */}
              {query && isQuestion(query) && !isLoading && (
                <div className="wna-qhint">
                  <Brain size={11} />
                  <span>Question → keywords: <strong>{extractKeywords(query).slice(0,2).join(", ")}</strong></span>
                </div>
              )}

              {/* Quick searches */}
              {!article && !isLoading && !error && (
                <>
                  <div className="wna-sec">Quick Search</div>
                  <div className="wna-qa-row">
                    {quickActions.map(a => (
                      <button key={a} className="wna-qa-btn" onClick={() => quickSearch(a)}>
                        {a.length > 26 ? a.slice(0,26)+"…" : a}
                      </button>
                    ))}
                  </div>
                  {history.length > 0 && (
                    <>
                      <div className="wna-sec" style={{marginTop:4}}>Recent</div>
                      <div className="wna-hist-row">
                        {history.map(h => (
                          <button key={h} className="wna-hist-btn" onClick={() => quickSearch(h)}>
                            {h.length > 22 ? h.slice(0,22)+"…" : h}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Loading */}
              {isLoading && (
                <div className="wna-fade" style={{display:"flex",flexDirection:"column",gap:8}}>
                  <div className="wna-skel" style={{height:14,width:"50%"}} />
                  <div className="wna-skel" style={{height:60}} />
                  <div className="wna-skel" style={{height:11}} />
                  <div className="wna-skel" style={{height:11,width:"75%"}} />
                </div>
              )}

              {/* Error */}
              {error && !isLoading && (
                <div className="wna-err">
                  <p>😕 No results found.</p>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5,justifyContent:"center",marginTop:8}}>
                    {extractKeywords(query).map(kw => (
                      <button key={kw} onClick={() => quickSearch(kw)}
                        style={{fontSize:11,padding:"3px 10px",borderRadius:7,background:"hsl(var(--secondary))",border:"none",cursor:"pointer",color:"hsl(var(--foreground))"}}>
                        Try: {kw}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Result */}
              {article && !isLoading && (
                <div className="wna-fade" style={{display:"flex",flexDirection:"column",gap:9}}>

                  {/* Q-detected */}
                  {isQ && (
                    <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"hsl(var(--primary))"}}>
                      <Brain size={12} />
                      <span>Searched: {keywords.map(k => <span key={k} className="wna-kw" style={{marginLeft:3}}>{k}</span>)}</span>
                    </div>
                  )}

                  {/* AI Answer */}
                  {aiAnswer && (
                    <div className="wna-ai" style={{background:subjectColor+"0D",borderColor:subjectColor+"33"}}>
                      <div className="wna-ai-lbl" style={{color:subjectColor}}>
                        <Lightbulb size={11} /> Simple Answer
                      </div>
                      <p className="wna-ai-txt">{aiAnswer}</p>
                    </div>
                  )}

                  {/* Article */}
                  <div className="wna-article">
                    <div className="wna-art-title">{article.title}</div>
                    <a href={article.content_urls?.desktop.page} target="_blank" rel="noopener noreferrer" className="wna-art-link">
                      <ExternalLink size={10} /> Open on Wikipedia
                    </a>
                    {article.thumbnail && (
                      <img src={article.thumbnail.source} alt={article.title} className="wna-art-img" />
                    )}
                    <p className="wna-art-extract">{article.extract.slice(0, 300)}{article.extract.length > 300 ? "…" : ""}</p>
                  </div>

                  {/* Related */}
                  {related.length > 0 && (
                    <div>
                      <div className="wna-sec" style={{display:"flex",alignItems:"center",gap:4}}>
                        <Sparkles size={11} /> Related Topics
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:5}}>
                        {related.map(r => (
                          <button key={r.title} className="wna-rel-item" onClick={() => quickSearch(r.title)}>
                            {r.thumbnail && <img src={r.thumbnail.source} alt="" className="wna-rel-img" />}
                            <div style={{flex:1,minWidth:0}}>
                              <div className="wna-rel-title">{r.title}</div>
                              <div className="wna-rel-snip">{r.extract}</div>
                            </div>
                            <ChevronRight size={13} style={{color:"hsl(var(--muted-foreground))",flexShrink:0}} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Back */}
                  <button onClick={() => { setArticle(null); setAiAnswer(""); setRelated([]); setError(false); setQuery(""); }}
                    style={{fontSize:11,color:"hsl(var(--primary))",background:"none",border:"none",cursor:"pointer",padding:0,alignSelf:"flex-start"}}>
                    ← Search again
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default WikiNoteAssistant;
