import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Clock, Bookmark, BookmarkCheck, Download,
  CheckCircle, ChevronRight, Zap, Trophy, RotateCcw, ThumbsUp,
  ThumbsDown, Menu, X, Volume2, Play, Pause, Square, BookOpen,
  Flag, Star, Award, Lock, Headphones
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import PageLayout from "@/components/layout/PageLayout";
import {
  useNoteSubjects, useNoteChapters, useNoteQuiz, useNoteQuestions,
  useNoteProgress, useFlashcards, useGamification,
  saveProgress, saveQuizResult, saveWrongAnswer, removeWrongAnswer,
  awardPoints, NoteQuestion, incrementViewCount
} from "@/hooks/useNotes";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import confetti from "canvas-confetti";
import WikiNoteAssistant from "@/components/shared/WikiNoteAssistant";
import AnnotationOverlay from "@/components/notes/AnnotationOverlay";
import KaTeXRenderer from "@/components/notes/KaTeXRenderer";
import AudioNotesPlayer from "@/components/notes/AudioNotesPlayer";
import InteractiveLabs from "@/components/interactive/InteractiveLabs";
 
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// READ ALOUD — Completely rewritten using chunked approach
// The previous approach failed because:
// 1. Single long utterance gets silently killed by browsers after ~15s
// 2. Voices weren't loaded when speak() was called
// 3. HTML content wasn't properly stripped
// FIX: Split text into sentence chunks, speak one at a time with queue
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 
function htmlToText(html: string): string {
  // Use DOMParser — most reliable for HTML stripping
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,noscript").forEach(el => el.remove());
  const text = doc.body.textContent || "";
  // Normalize whitespace
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function splitIntoChunks(text: string, maxLen = 180): string[] {
  // Split by sentences first, then by maxLen
  const sentences = text.match(/[^.!?\n]+[.!?\n]*/g) || [text];
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    if ((current + s).length > maxLen) {
      if (current.trim()) chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(c => c.length > 2);
}

const AudioPlayer = ({ content, onClose }: { content: string; onClose: () => void }) => {
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused]   = useState(false);
  const [speed, setSpeed]     = useState(1);
  const [chunkIdx, setChunkIdx] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);

  const chunksRef     = useRef<string[]>([]);
  const currentIdxRef = useRef(0);
  const speedRef      = useRef(1);
  const activeRef     = useRef(false);    // true = should be playing
  const voicesRef     = useRef<SpeechSynthesisVoice[]>([]);
  const keepAliveRef  = useRef<ReturnType<typeof setInterval>>();

  // Load voices — must happen before first speak
  const loadVoices = useCallback(() => {
    const v = window.speechSynthesis.getVoices();
    if (v.length) voicesRef.current = v;
  }, []);

  const getBestVoice = (): SpeechSynthesisVoice | null => {
    const v = voicesRef.current;
    return v.find(x => x.name.includes("Google US English"))
      || v.find(x => x.name === "Samantha")
      || v.find(x => x.lang === "en-US" && !x.localService)
      || v.find(x => x.lang.startsWith("en"))
      || v[0] || null;
  };

  // Speak one chunk, then automatically queue the next.
  // KEY FIXES vs previous version:
  // 1. NO window.speechSynthesis.cancel() inside speakChunk — causes silent drop on Chrome mobile
  // 2. NO keepAlive pause/resume — it interrupts the chain and causes the "stops after 3 lines" bug
  // 3. NO lang="en-US" — blocks on many Android devices
  // 4. Queue all chunks upfront using SpeechSynthesisUtterance queue (speak() queues natively)
  const speakChunk = useCallback((idx: number) => {
    if (!activeRef.current) return;
    if (idx >= chunksRef.current.length) {
      activeRef.current = false;
      setPlaying(false); setPaused(false);
      setChunkIdx(0); currentIdxRef.current = 0;
      clearInterval(keepAliveRef.current);
      return;
    }

    const text = chunksRef.current[idx];
    if (!text || text.trim().length < 2) {
      // Skip empty chunks immediately
      speakChunk(idx + 1);
      return;
    }

    const utt = new SpeechSynthesisUtterance(text);
    utt.rate   = speedRef.current;
    utt.pitch  = 1.0;
    utt.volume = 1.0;
    // Do NOT set utt.lang — let browser use device default (fixes Android block)

    const voice = getBestVoice();
    if (voice) utt.voice = voice;

    utt.onstart = () => {
      currentIdxRef.current = idx;
      setChunkIdx(idx);
      setPlaying(true); setPaused(false);
    };

    utt.onend = () => {
      if (!activeRef.current) return;
      // Use setTimeout(0) to yield to the browser event loop before chaining
      // This prevents the "silent cancel" bug on Chrome mobile
      setTimeout(() => {
        if (activeRef.current) speakChunk(idx + 1);
      }, 0);
    };

    utt.onerror = (e: SpeechSynthesisErrorEvent) => {
      if (e.error === "interrupted" || e.error === "canceled") return;
      // On real errors, skip this chunk and continue
      setTimeout(() => {
        if (activeRef.current) speakChunk(idx + 1);
      }, 150);
    };

    // Do NOT cancel before speaking — let the queue work naturally
    window.speechSynthesis.speak(utt);
  }, []);

  // keepAlive: inject a silent utterance every 8s to prevent Chrome's TTS timeout
  // This does NOT interrupt the current utterance — it queues after it
  // The silent utterance trick is safer than pause/resume which breaks chaining
  const startKeepAlive = useCallback(() => {
    clearInterval(keepAliveRef.current);
    keepAliveRef.current = setInterval(() => {
      if (!activeRef.current) return;
      // Only poke if NOT currently speaking (between chunks gap)
      if (!window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        // Synth went idle unexpectedly — resume from current index
        if (activeRef.current && currentIdxRef.current < chunksRef.current.length) {
          speakChunk(currentIdxRef.current);
        }
      }
    }, 5000);
  }, [speakChunk]);

  const startFrom = useCallback((idx: number) => {
    activeRef.current = true;
    // Wait for voices if not loaded yet
    if (!voicesRef.current.length) {
      window.speechSynthesis.onvoiceschanged = () => {
        loadVoices();
        window.speechSynthesis.onvoiceschanged = null;
        speakChunk(idx);
        startKeepAlive();
      };
      // Also try with a timeout fallback
      setTimeout(() => {
        loadVoices();
        if (activeRef.current && !window.speechSynthesis.speaking) {
          speakChunk(idx);
          startKeepAlive();
        }
      }, 600);
    } else {
      speakChunk(idx);
      startKeepAlive();
    }
  }, [speakChunk, startKeepAlive, loadVoices]);

  // Initialize on mount
  useEffect(() => {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = () => { loadVoices(); };
    const text = htmlToText(content);
    const chunks = splitIntoChunks(text);
    chunksRef.current = chunks;
    setTotalChunks(chunks.length);
    return () => {
      activeRef.current = false;
      clearInterval(keepAliveRef.current);
      window.speechSynthesis.cancel();
    };
  }, [content, loadVoices]);

  const handlePlay = () => {
    speedRef.current = speed;
    if (paused) {
      activeRef.current = true;
      window.speechSynthesis.resume();
      setPaused(false); setPlaying(true);
      startKeepAlive();
    } else {
      startFrom(currentIdxRef.current);
    }
  };

  const handlePause = () => {
    activeRef.current = false;
    clearInterval(keepAliveRef.current);
    window.speechSynthesis.pause();
    setPaused(true); setPlaying(false);
  };

  const handleStop = () => {
    activeRef.current = false;
    clearInterval(keepAliveRef.current);
    window.speechSynthesis.cancel();
    setPlaying(false); setPaused(false);
    setChunkIdx(0); currentIdxRef.current = 0;
  };

  const handleSpeed = (s: number) => {
    setSpeed(s); speedRef.current = s;
    if (playing || paused) {
      const resumeIdx = currentIdxRef.current;
      handleStop();
      setTimeout(() => startFrom(resumeIdx), 200);
    }
  };

  const progressPct = totalChunks > 0 ? Math.round((chunkIdx / totalChunks) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-24 right-4 z-50 bg-card border border-border rounded-2xl shadow-2xl p-4 w-72"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
            <Volume2 className="w-4 h-4 text-primary" />
          </div>
          <span className="text-sm font-bold text-foreground">Read Aloud</span>
          {playing && (
            <span className="flex gap-0.5 items-end h-3.5">
              {[0,1,2].map(i => (
                <span key={i} className="w-1 rounded-full bg-primary animate-bounce"
                  style={{ height: `${6+i*3}px`, animationDelay: `${i*120}ms` }} />
              ))}
            </span>
          )}
        </div>
        <button onClick={() => { handleStop(); onClose(); }}
          className="p-1.5 hover:bg-secondary rounded-lg transition-colors">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Progress */}
      <div className="h-1.5 bg-muted rounded-full mb-1 overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${progressPct}%` }} />
      </div>
      <p className="text-[10px] text-muted-foreground mb-3">
        {chunkIdx + 1} / {totalChunks} sections
      </p>

      {/* Controls */}
      <div className="flex gap-2 mb-3">
        {(!playing || paused) ? (
          <button onClick={handlePlay}
            className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-primary-foreground py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
            <Play className="w-4 h-4" /> {paused ? "Resume" : "Play"}
          </button>
        ) : (
          <button onClick={handlePause}
            className="flex-1 flex items-center justify-center gap-1.5 bg-blue-500 text-white py-2.5 rounded-xl text-sm font-semibold hover:opacity-90">
            <Pause className="w-4 h-4" /> Pause
          </button>
        )}
        <button onClick={handleStop}
          className="w-10 h-10 flex items-center justify-center border border-border rounded-xl hover:bg-secondary transition-colors">
          <Square className="w-4 h-4" />
        </button>
      </div>

      {/* Speed */}
      <div className="flex gap-1">
        {[0.75, 1, 1.25, 1.5].map(s => (
          <button key={s} onClick={() => handleSpeed(s)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${speed === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-secondary/70"}`}>
            {s}x
          </button>
        ))}
      </div>
    </motion.div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CHART RENDERER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Animation code wrapper — supports Three.js r128, p5.js, vanilla Canvas, or full HTML
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CRITICAL FIX: Custom Three.js code from the internet commonly uses
// document.body.appendChild, wrong container ids, ES module imports, etc.
// We normalize ALL of these patterns so any valid Three.js code works.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function buildSrcDoc(code: string): string {
  const trimmedLower = code.trim().toLowerCase();

  // Detect Three.js — check for THREE.* usage or import three
  const isThree = /\bTHREE\s*\./.test(code)
    || /new\s+THREE\s*\./.test(code)
    || /import\s+.*['"']three['"]/.test(code)
    || /require\s*\(\s*['"]three['"]\s*\)/.test(code);

  const isP5 = /\bfunction\s+setup\s*\(/.test(code) || /\bfunction\s+draw\s*\(/.test(code);

  // ── Patch Three.js code to work universally ────────────────────────────────
  function patchThreeCode(src: string): string {
    let out = src;

    // ── Sanitize invalid JS lines (=== separators, decorative headers) ────────
    // e.g. "=== MY CODE ===" is a JS syntax error (=== needs operands)
    // This causes a black blank screen. Convert these lines to // comments.
    out = out.split('\n').map((line: string) => {
      const t = line.trim();
      if (t.length === 0) return line;
      // Pure separator lines: ===, ---, ###, ***, ~~~
      if (/^[=\-*#~]{3,}/.test(t) && !/^(const|let|var|if|for|while|function|class|return|import|export|\/\/)/.test(t)) {
        return '// ' + line;
      }
      return line;
    }).join('\n');

    // 1. Strip ES module imports for Three.js (THREE is already global from CDN)
    //    e.g.: import * as THREE from 'three'
    //          import { ... } from 'three'
    //          import THREE from "three"
    out = out.replace(/^\s*import\s+[\s\S]*?from\s+['"]three['"]\s*;?\s*$/gm, '// [three.js loaded from CDN]');
    out = out.replace(/^\s*import\s+[\s\S]*?from\s+['"]https?:\/\/[^'"]+three[^'"]*['"]\s*;?\s*$/gm, '// [three.js loaded from CDN]');
    // Also strip OrbitControls / other addons that won't be available
    // (we'll handle OrbitControls separately below)
    out = out.replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]*three[^'"]*['"]\s*;?\s*$/gm, '// [addon import skipped]');

    // 2. Replace document.body.appendChild(renderer.domElement) 
    //    → document.getElementById("c").appendChild(renderer.domElement)
    out = out.replace(
      /document\.body\.appendChild\s*\(\s*renderer\.domElement\s*\)/g,
      'document.getElementById("c").appendChild(renderer.domElement)'
    );
    // Also handle: document.body.append(renderer.domElement)
    out = out.replace(
      /document\.body\.append\s*\(\s*renderer\.domElement\s*\)/g,
      'document.getElementById("c").append(renderer.domElement)'
    );

    // 3. Replace common wrong container ids
    //    document.getElementById("container") → document.getElementById("c")
    //    document.getElementById("canvas-container") → document.getElementById("c")
    //    document.getElementById("webgl") → document.getElementById("c")
    //    document.getElementById("scene") → document.getElementById("c")
    //    document.querySelector("#container") → document.getElementById("c")
    out = out.replace(
      /document\.getElementById\s*\(\s*["'](container|canvas-container|webgl|scene|app|root|three-container|mount|canvas)["']\s*\)/g,
      'document.getElementById("c")'
    );
    out = out.replace(
      /document\.querySelector\s*\(\s*["']#(container|canvas-container|webgl|scene|app|root|three-container|mount|canvas)["']\s*\)/g,
      'document.getElementById("c")'
    );

    // 4. Auto-register renderer and camera for resize helper
    //    After: new THREE.WebGLRenderer(...) → register it as window.__renderer
    //    This uses a post-processing trick: wrap the assignment
    out = out.replace(
      /((?:const|let|var)\s+(\w+)\s*=\s*new\s+THREE\.WebGLRenderer\s*\([^)]*\))/g,
      (match: string, fullAssign: string, varName: string) => {
        return fullAssign + '; window.__renderer = ' + varName;
      }
    );
    // Also handle: renderer = new THREE.WebGLRenderer (no const/let/var)
    out = out.replace(
      /(^|[\n;,\s])(renderer\s*=\s*new\s+THREE\.WebGLRenderer\s*\([^)]*\))/gm,
      (match: string, pre: string, assign: string) => {
        return pre + assign + '; window.__renderer = renderer';
      }
    );

    // 5. Auto-register PerspectiveCamera as window.__camera
    out = out.replace(
      /((?:const|let|var)\s+(\w+)\s*=\s*new\s+THREE\.PerspectiveCamera\s*\([^)]*\))/g,
      (match: string, fullAssign: string, varName: string) => {
        return fullAssign + '; window.__camera = ' + varName;
      }
    );
    out = out.replace(
      /(^|[\n;,\s])(camera\s*=\s*new\s+THREE\.PerspectiveCamera\s*\([^)]*\))/gm,
      (match: string, pre: string, assign: string) => {
        return pre + assign + '; window.__camera = camera';
      }
    );

    // 6. Stub OrbitControls if used but not available
    //    THREE.OrbitControls is not in r128 core
    if (/OrbitControls/.test(out)) {
      out = 'if(!THREE.OrbitControls){THREE.OrbitControls=function(cam,el){this.enableDamping=false;this.dampingFactor=0.05;this.update=function(){};this.dispose=function(){};};}'
        + '\n' + out;
    }

    return out;
  }

  const ensureViewport = (html: string) => {
    if (html.toLowerCase().includes("viewport")) return html;
    return html.replace(/<head>/i, '<head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">');
  };

  // ── Base CSS for Three.js ──────────────────────────────────────────────────
  // KEY: Do NOT force canvas width/height via CSS — let Three.js control it.
  // Instead we make #c fill the viewport, and Three.js sizes its canvas to match.
  const threeCSS = [
    '*{margin:0;padding:0;box-sizing:border-box}',
    'html,body{width:100%;height:100%;overflow:hidden;display:block;background:#0a0a1a}',
    'body{position:relative}',
    '#c{position:fixed;top:0;left:0;width:100%;height:100%;overflow:hidden}',
    // Let Three.js canvas fill its container naturally — NO forced size override
    '#c canvas{display:block!important;outline:none;touch-action:none}',
  ].join('');

  const resizeHelper = [
    'window.__container = document.getElementById("c") || document.body;',
    'window.addEventListener("resize", function() {',
    '  if (typeof onWindowResize === "function") { onWindowResize(); return; }',
    '  if (window.__renderer) {',
    '    var w = window.__container.clientWidth || innerWidth;',
    '    var h = window.__container.clientHeight || innerHeight;',
    '    window.__renderer.setSize(w, h);',
    '    if (window.__camera) {',
    '      window.__camera.aspect = w / h;',
    '      window.__camera.updateProjectionMatrix();',
    '    }',
    '  }',
    '});',
  ].join('\n');

  // Already full HTML — patch it and pass through
  if (trimmedLower.startsWith("<!doctype") || trimmedLower.startsWith("<html")) {
    let html = ensureViewport(code);
    if (isThree) {
      // Patch the JS inside script tags
      html = html.replace(
        /(<script(?![^>]*src)[^>]*>)([\s\S]*?)(<\/script>)/gi,
        (_: string, open: string, js: string, close: string) => open + patchThreeCode(js) + close
      );
      // Inject Three.js CDN if not already present
      if (!html.includes('three.js') && !html.includes('three.min.js')) {
        html = html.replace(
          '</head>',
          '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></scr'+'ipt>\n</head>'
        );
      }
      // Inject resize helper
      html = html.replace('</body>', '<script>' + resizeHelper + '</script>\n</body>');
    }
    return html;
  }

  // Escape </script> inside user JS to prevent HTML parser from breaking
  const safeCode = patchThreeCode(code).replace(/<\/script>/gi, "<\\/script>");

  if (isThree) {
    return [
      '<!DOCTYPE html><html><head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">',
      '<style>', threeCSS, '</style>',
      '</head>',
      '<body><div id="c"></div>',
      // Load Three.js FIRST, synchronously, before user code
      '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></scr'+'ipt>',
      // Then inject resize helper + user code in ONE script block (guarantees THREE is defined)
      '<script>',
      resizeHelper,
      safeCode,
      '</script>',
      '</body></html>',
    ].join('\n');
  }

  if (isP5) {
    const safeP5 = code.replace(/<\/script>/gi, "<\\/script>");
    return [
      '<!DOCTYPE html><html><head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">',
      '<style>*{margin:0;padding:0}html,body{width:100%;height:100%;overflow:hidden;background:#f8f9ff}canvas{display:block;touch-action:none}</style>',
      '</head><body>',
      '<script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js"></scr'+'ipt>',
      '<script>function windowResized(){if(typeof resizeCanvas==="function")resizeCanvas(windowWidth,windowHeight);}',
      safeP5,
      '</script></body></html>',
    ].join('\n');
  }

  // ── Vanilla JS / 2D Canvas / GSAP / Anime.js / D3 fallback ─────────────────
  const isGSAP2  = /\bgsap\b/i.test(code) || /\bTweenMax\b/.test(code);
  const isAnime2 = /\banime\s*\(/.test(code);
  const isD32    = /\bd3\s*\./.test(code);

  function patch2DCode(src: string): string {
    let out = src;
    out = out.split('\n').map((line: string) => {
      const t = line.trim();
      if (!t) return line;
      if (/^[=\-*#~^]{3,}/.test(t) && !/^(const|let|var|if|for|while|function|class|return|import|export|\/\/)/.test(t)) return '// ' + line;
      if (/^={2,}/.test(t)) return '// ' + line;
      return line;
    }).join('\n');
    out = out.replace(/document\.body\.appendChild\s*\(/g, 'document.getElementById("main-container").appendChild(');
    out = out.replace(/document\.body\.append\s*\(/g, 'document.getElementById("main-container").append(');
    out = out.replace(/document\.getElementById\s*\(\s*["\'](container|canvas-container|app|root|mount|wrapper|scene)["\']/g, 'document.getElementById("main-container"');
    return out;
  }

  const safeVanilla = patch2DCode(code).replace(/<\/script>/gi, "<\\/script>");

  const extraLibs: string[] = [];
  if (isGSAP2)  extraLibs.push('<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></scr'+'ipt>');
  if (isAnime2) extraLibs.push('<script src="https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js"></scr'+'ipt>');
  if (isD32)    extraLibs.push('<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></scr'+'ipt>');

  return [
    '<!DOCTYPE html><html><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">',
    '<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden;background:#0a0a1a;font-family:system-ui,sans-serif}canvas{display:block;touch-action:none}canvas:not([style]){width:100%!important;height:100%!important}#main-container{position:fixed;top:0;left:0;width:100%;height:100%;overflow:hidden}</style>',
    '</head>',
    '<body>',
    '<script>window.onerror=function(msg,src,line,col,err){var d=document.createElement("div");d.style="position:fixed;top:0;left:0;right:0;background:#c00;color:#fff;font:13px monospace;padding:10px;z-index:9999;white-space:pre-wrap";d.textContent="JS Error: "+msg+"\\nLine: "+line+(err?"\\n"+err.stack:"");document.body.appendChild(d);return false;};</script>',
    '<div id="main-container"></div>',
    ...extraLibs,
    '<script>',
    'Object.defineProperty(window,"innerWidth",{get:function(){return document.documentElement.clientWidth||window.screen.width;}});',
    'Object.defineProperty(window,"innerHeight",{get:function(){return document.documentElement.clientHeight||window.screen.height;}});',
    'window.addEventListener("resize",function(){document.querySelectorAll("canvas").forEach(function(c){if(!c.style.width&&!c.style.height){c.width=innerWidth;c.height=innerHeight;}});if(typeof onWindowResize==="function")onWindowResize();if(typeof windowResized==="function")windowResized();});',
    '</script>',
    '<script>', safeVanilla, '</script>',
    '</body></html>',
  ].join('\n');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// InteractiveIframe — Blob URL so CDN scripts (Three.js r128, p5.js) load correctly
// overflow-hidden on an iframe parent clips the iframe on webkit mobile browsers.
// We apply border-radius directly on the iframe element instead.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const InteractiveIframe = ({ code, subjectColor }: { code: string; subjectColor: string }) => {
  const [frameKey, setFrameKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string>("");

  // Blob URL — gives the iframe a real origin so external CDN scripts (p5.js) load correctly.
  // srcDoc uses about:srcdoc origin which blocks external CDN scripts on mobile browsers.
  useEffect(() => {
    if (!code?.trim()) { setBlobUrl(""); return; }
    const html = buildSrcDoc(code);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [code, frameKey]);

  if (!code?.trim()) return null;

  const restart = () => setFrameKey(k => k + 1);

  // Inline iframe styles — border-radius on the iframe itself (not on a clipping parent)
  const inlineFrameStyle: React.CSSProperties = {
    width: "100%",
    height: "clamp(320px, 75vw, 520px)",
    border: "none",
    display: "block",
    borderRadius: "16px",
    background: "#f8f9ff",
  };

  const fsFrameStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    border: "none",
    display: "block",
  };

  return (
    <>
      {/* Fullscreen overlay */}
      {fullscreen && (
        <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-900 shrink-0">
            <span className="text-white font-semibold text-sm flex items-center gap-2">
              <Zap className="w-4 h-4 text-violet-400" /> Interactive Demo
            </span>
            <div className="flex items-center gap-2">
              <button onClick={restart}
                className="text-xs text-gray-300 hover:text-white px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" /> Restart
              </button>
              <button onClick={() => setFullscreen(false)}
                className="text-xs text-gray-300 hover:text-white px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600">
                ✕ Close
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <iframe
              key={"fs-" + frameKey}
              src={blobUrl}
              style={fsFrameStyle}
              title="Interactive Demo Fullscreen"
              allow="accelerometer; gyroscope; autoplay"
              
            />
          </div>
        </div>
      )}

      <div className="mt-8">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: subjectColor + "20" }}>
              <Zap className="w-3.5 h-3.5" style={{ color: subjectColor }} />
            </div>
            Interactive Demo
          </h3>
          <div className="flex items-center gap-2">
            <button onClick={restart}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-xl border border-border hover:bg-secondary transition-colors">
              <RotateCcw className="w-3 h-3" /> Restart
            </button>
            <button onClick={() => setFullscreen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-white px-3 py-1.5 rounded-xl hover:opacity-90 transition-opacity"
              style={{ backgroundColor: subjectColor }}>
              ⛶ Fullscreen
            </button>
          </div>
        </div>

        {/* Iframe — NO overflow-hidden wrapper, border-radius on iframe itself */}
        <div
          className="w-full shadow-lg"
          style={{
            border: `2px solid ${subjectColor}40`,
            borderRadius: "16px",
            lineHeight: 0,          /* kills any gap between div and iframe */
            fontSize: 0,
          }}
        >
          <iframe
            key={frameKey}
            src={blobUrl}
            style={inlineFrameStyle}
            title="Interactive Demo"
            allow="accelerometer; gyroscope; autoplay"
          />
        </div>

        <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
          ⚡ Tap Fullscreen for best experience on mobile
        </p>
      </div>
    </>
  );
};


function ChapterChart({ config }: { config: any }) {
  if (!config) return null;
  const COLORS = config.colors || ["#6366f1","#1e3a8a","#10b981","#ef4444","#8b5cf6"];
  let data = config.data || [];
  if (config.equation) {
    data = [];
    const [xMin, xMax] = config.xRange || [-10, 10];
    for (let x = xMin; x <= xMax; x += 0.5) {
      try {
        const eq = config.equation.replace(/\^/g,"**").replace(/sin\(/g,"Math.sin(").replace(/cos\(/g,"Math.cos(").replace(/tan\(/g,"Math.tan(").replace(/sqrt\(/g,"Math.sqrt(").replace(/abs\(/g,"Math.abs(").replace(/log\(/g,"Math.log(").replace(/pi/gi,"Math.PI");
        // eslint-disable-next-line no-new-func
        const y = new Function("x", `return ${eq}`)(x);
        if (isFinite(y)) data.push({ name: x.toFixed(1), value: parseFloat(y.toFixed(3)) });
      } catch {}
    }
  }
  const type = config.type || (config.equation ? "line" : "bar");
  const cp = { data, margin: { top:10, right:20, left:0, bottom:0 } };
  return (
    <div className="bg-card border border-border rounded-2xl p-5 mt-8">
      {config.title && <h3 className="text-base font-bold text-foreground mb-3">📊 {config.title}</h3>}
      {config.equation && <p className="text-sm text-muted-foreground mb-3 font-mono bg-muted px-3 py-1 rounded-lg inline-block">y = {config.equation}</p>}
      <ResponsiveContainer width="100%" height={300}>
        {type === "bar" ? (
          <BarChart {...cp}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{fontSize:11}} /><YAxis tick={{fontSize:11}} /><Tooltip /><Legend /><Bar dataKey="value" fill={COLORS[0]} radius={[4,4,0,0]} />{data[0]?.value2 !== undefined && <Bar dataKey="value2" fill={COLORS[1]} radius={[4,4,0,0]} />}</BarChart>
        ) : type === "area" ? (
          <AreaChart {...cp}><defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.3}/><stop offset="95%" stopColor={COLORS[0]} stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{fontSize:11}} /><YAxis tick={{fontSize:11}} /><Tooltip /><Area type="monotone" dataKey="value" stroke={COLORS[0]} fill="url(#g1)" strokeWidth={2} /></AreaChart>
        ) : type === "pie" ? (
          <PieChart><Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} label>{data.map((_:any,i:number)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Pie><Tooltip /><Legend /></PieChart>
        ) : (
          <LineChart {...cp}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{fontSize:11}} /><YAxis tick={{fontSize:11}} /><Tooltip formatter={(v:any)=>[parseFloat(String(v)).toFixed(3),"y"]} /><Line type="monotone" dataKey="value" stroke={COLORS[0]} strokeWidth={2.5} dot={false} />{data[0]?.value2 !== undefined && <Line type="monotone" dataKey="value2" stroke={COLORS[1]} strokeWidth={2.5} dot={false} />}</LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POMODORO TIMER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const PomodoroTimer = ({ onClose }: { onClose: () => void }) => {
  const [mode, setMode] = useState<"study"|"break">("study");
  const [secs, setSecs] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSecs(s => {
          if (s <= 1) {
            clearInterval(intervalRef.current); setRunning(false);
            if (mode === "study") { setMode("break"); setSecs(5*60); }
            else { setMode("study"); setSecs(25*60); }
            try { const ctx = new AudioContext(); const o = ctx.createOscillator(); o.connect(ctx.destination); o.frequency.value = 800; o.start(); setTimeout(()=>o.stop(),300); } catch {}
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [running, mode]);
  const fmt = (s: number) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  return (
    <div className="fixed top-20 right-4 z-40 bg-card border border-border rounded-2xl shadow-xl p-4 w-52">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold">{mode==="study"?"🍅 Study":"☕ Break"}</span>
        <button onClick={onClose} className="p-1 hover:bg-secondary rounded"><X className="w-3.5 h-3.5" /></button>
      </div>
      <div className={`text-3xl font-black text-center font-mono mb-3 ${mode==="study"?"text-red-500":"text-green-500"}`}>{fmt(secs)}</div>
      <div className="flex gap-2">
        <button onClick={() => setRunning(r=>!r)}
          className={`flex-1 py-2 rounded-xl text-white text-sm font-semibold ${running?"bg-blue-500":"bg-primary"}`}>
          {running?"Pause":"Start"}
        </button>
        <button onClick={() => { setRunning(false); setMode("study"); setSecs(25*60); }}
          className="p-2 rounded-xl border border-border hover:bg-secondary">
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// REPORT MISTAKE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const ReportMistake = ({ chapterId, userId, onClose }: { chapterId: string; userId: string; onClose: () => void }) => {
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    await supabase.from("mistake_reports").insert({ chapter_id: chapterId, user_id: userId, report: text.trim(), status: "pending" });
    setSent(true); setSending(false);
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
      <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
        {sent ? (
          <div className="text-center py-4">
            <p className="text-3xl mb-3">✅</p>
            <p className="font-bold text-foreground">Report Sent!</p>
            <p className="text-sm text-muted-foreground mt-1">Admin will review and fix the issue.</p>
            <button onClick={onClose} className="mt-4 px-6 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold">Close</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-foreground flex items-center gap-2"><Flag className="w-4 h-4 text-red-500" /> Report a Mistake</h3>
              <button onClick={onClose} className="p-1.5 hover:bg-secondary rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={4}
              placeholder="Describe the mistake or error you found in this chapter..."
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring resize-none mb-4" />
            <div className="flex gap-3">
              <button onClick={send} disabled={!text.trim() || sending}
                className="flex-1 bg-red-500 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-red-600 disabled:opacity-50">
                {sending ? "Sending..." : "Submit Report"}
              </button>
              <button onClick={onClose} className="flex-1 border border-border py-2.5 rounded-xl text-sm font-semibold hover:bg-secondary">Cancel</button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPLETION STAMP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const CompletionStamp = ({ subjectColor, show }: { subjectColor: string; show: boolean }) => {
  if (!show) return null;
  return (
    <motion.div initial={{ scale: 0, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: -8, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 15 }}
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-white text-xs font-black border-2 border-white/50 shadow-lg"
      style={{ backgroundColor: subjectColor }}>
      <Award className="w-3.5 h-3.5" /> COMPLETED ✓
    </motion.div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CHAPTER Q&A
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const ChapterQnA = ({ chapterId, userId, userRole }: { chapterId: string; userId?: string; userRole?: string }) => {
  const [questions, setQuestions] = useState<any[]>([]);
  const [newQ, setNewQ] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<string|null>(null);
  const [replyText, setReplyText] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.from("chapter_questions")
      .select("*, profiles(full_name, role), chapter_answers(id, answer, created_at, profiles(full_name, role)), upvotes")
      .eq("chapter_id", chapterId).order("upvotes", { ascending: false });
    setQuestions(data || []);
  }, [chapterId]);

  useEffect(() => { load(); }, [load]);

  const submitQ = async () => {
    if (!newQ.trim() || !userId) return;
    setSending(true);
    await supabase.from("chapter_questions").insert({ chapter_id: chapterId, user_id: userId, question: newQ.trim(), upvotes: 0 });
    setNewQ(""); setSending(false); load();
  };

  const submitAnswer = async (qId: string) => {
    if (!replyText.trim() || !userId) return;
    await supabase.from("chapter_answers").insert({ question_id: qId, user_id: userId, answer: replyText.trim() });
    setReplyTo(null); setReplyText(""); load();
  };

  const upvote = async (qId: string, current: number) => {
    await supabase.from("chapter_questions").update({ upvotes: current + 1 }).eq("id", qId);
    load();
  };

  const canAnswer = userRole === "admin" || userRole === "teacher";

  return (
    <div className="mt-10">
      <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
        💬 Questions & Answers
        <span className="text-sm font-normal text-muted-foreground">({questions.length})</span>
      </h3>

      {userId && (
        <div className="mb-6">
          <textarea value={newQ} onChange={e => setNewQ(e.target.value)} rows={2}
            placeholder="Ask a question about this chapter..."
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring resize-none mb-2" />
          <button onClick={submitQ} disabled={!newQ.trim() || sending}
            className="px-5 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50">
            {sending ? "Posting..." : "Ask Question"}
          </button>
        </div>
      )}

      <div className="space-y-4">
        {questions.map(q => (
          <div key={q.id} className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                {(q.profiles?.full_name||"?")[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-sm font-semibold text-foreground">{q.profiles?.full_name || "Student"}</span>
                  <span className="text-xs text-muted-foreground">{new Date(q.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-sm text-foreground">{q.question}</p>
                <div className="flex items-center gap-3 mt-2">
                  <button onClick={() => upvote(q.id, q.upvotes || 0)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                    ▲ {q.upvotes || 0} helpful
                  </button>
                  {canAnswer && (
                    <button onClick={() => setReplyTo(replyTo === q.id ? null : q.id)}
                      className="text-xs text-primary font-semibold hover:underline">
                      Answer
                    </button>
                  )}
                </div>

                {replyTo === q.id && (
                  <div className="mt-3">
                    <textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={2}
                      placeholder="Write your answer..."
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none mb-2" />
                    <div className="flex gap-2">
                      <button onClick={() => submitAnswer(q.id)}
                        className="px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold">Post Answer</button>
                      <button onClick={() => setReplyTo(null)}
                        className="px-4 py-1.5 border border-border rounded-lg text-xs hover:bg-secondary">Cancel</button>
                    </div>
                  </div>
                )}

                {(q.chapter_answers || []).length > 0 && (
                  <div className="mt-3 space-y-2">
                    {q.chapter_answers.map((a: any) => (
                      <div key={a.id} className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-green-700 dark:text-green-400">
                            {a.profiles?.role === "admin" ? "👑 Admin" : a.profiles?.role === "teacher" ? "🎓 Teacher" : "Student"}
                          </span>
                          <span className="text-xs text-muted-foreground">{a.profiles?.full_name}</span>
                        </div>
                        <p className="text-sm text-foreground">{a.answer}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {questions.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-3xl mb-2">💬</p>
            <p className="text-sm">No questions yet. Be the first to ask!</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SMART REVISION REMINDERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const RevisionReminder = ({ chapterId, chapterTitle, userId }: { chapterId: string; chapterTitle: string; userId: string }) => {
  const [reminder, setReminder] = useState<any>(null);
  useEffect(() => {
    supabase.from("revision_reminders")
      .select("*").eq("user_id", userId).eq("chapter_id", chapterId)
      .lte("remind_at", new Date().toISOString()).maybeSingle()
      .then(({ data }) => setReminder(data));
  }, [userId, chapterId]);
  if (!reminder) return null;
  const dismiss = async () => {
    const days = reminder.times_reminded < 1 ? 7 : reminder.times_reminded < 2 ? 30 : 0;
    if (days > 0) {
      const next = new Date(Date.now() + days * 86400000).toISOString();
      await supabase.from("revision_reminders").update({ remind_at: next, times_reminded: (reminder.times_reminded||0)+1 }).eq("id", reminder.id);
    } else {
      await supabase.from("revision_reminders").delete().eq("id", reminder.id);
    }
    setReminder(null);
  };
  return (
    <motion.div initial={{ opacity:0, y:-10 }} animate={{ opacity:1, y:0 }}
      className="bg-blue-50 dark:bg-blue-950/20 border border-blue-300 dark:border-blue-800 rounded-2xl p-4 mb-4 flex items-start gap-3">
      <span className="text-2xl">🔔</span>
      <div className="flex-1">
        <p className="text-sm font-bold text-blue-900 dark:text-blue-300">Time to Revise!</p>
        <p className="text-xs text-blue-800 dark:text-blue-400 mt-0.5">
          You completed "{chapterTitle}" earlier. A quick revision now will help you remember it much longer.
        </p>
      </div>
      <button onClick={dismiss} className="text-xs font-semibold text-blue-800 dark:text-blue-400 hover:underline shrink-0">Dismiss</button>
    </motion.div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GAMIFICATION BAR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const GamificationBar = ({ userId }: { userId: string }) => {
  const { data: g } = useGamification(userId);
  if (!g) return null;
  const allBadges = [
    { id:"first_step",emoji:"🌟"},{id:"bookworm",emoji:"📚"},{id:"quiz_master",emoji:"🏆"},
    { id:"on_fire",emoji:"🔥"},{id:"legend",emoji:"👑"},{id:"top_student",emoji:"⭐"},
    { id:"first_chapter",emoji:"📖"},{id:"seven_streak",emoji:"🔥"},{id:"perfect_quiz",emoji:"🎯"},
    { id:"speed_reader",emoji:"⚡"},{id:"helpful_peer",emoji:"🤝"},{id:"subject_master",emoji:"🏆"},
  ];
  return (
    <div className="flex items-center gap-3 flex-wrap mb-4">
      <span className="text-sm font-bold text-blue-700">⭐ {g.total_points} pts</span>
      <span className="text-sm font-bold text-orange-500">🔥 {g.streak_days} day streak</span>
      {(g.badges||[]).slice(0,4).map((b:string) => {
        const badge = allBadges.find(x=>x.id===b);
        return badge ? <span key={b} className="text-lg" title={b}>{badge.emoji}</span> : null;
      })}
    </div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ADAPTIVE QUIZ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const AdaptiveQuiz = ({ quizId, chapterId, userId }: { quizId: string; chapterId: string; userId: string }) => {
  const { data: allQ = [] } = useNoteQuestions(quizId);
  const { data: quiz } = useNoteQuiz(chapterId);
  const [step, setStep]   = useState<"cooldown"|"start"|"quiz"|"result">("start");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<string|null>(null);
  const [revealed, setRevealed] = useState(false);
  const [adaptiveDiff, setAdaptiveDiff] = useState<"easy"|"medium"|"hard">("medium");
  const [streak, setStreak] = useState(0);
  const [pts, setPts] = useState(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [diffMsg, setDiffMsg] = useState("");

  // Quiz retry cooldown check (5 minutes = 300s)
  useEffect(() => {
    const key = `quiz_last_fail_${quizId}`;
    const lastFail = localStorage.getItem(key);
    if (lastFail) {
      const elapsed = (Date.now() - parseInt(lastFail)) / 1000;
      if (elapsed < 300) {
        setCooldownLeft(Math.ceil(300 - elapsed));
        setStep("cooldown");
      }
    }
  }, [quizId]);

  useEffect(() => {
    if (step !== "cooldown" || cooldownLeft <= 0) return;
    const t = setInterval(() => {
      setCooldownLeft(c => {
        if (c <= 1) { clearInterval(t); setStep("start"); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [step, cooldownLeft]);

  if (!allQ.length) return null;
  const pool = allQ.slice(0, 10);
  const q = pool[Math.min(current, pool.length-1)];
  if (!q) return null;
  const totalQ = pool.length;
  const score = Object.values(answers).filter((a,i) => pool[i] && a === pool[i].correct).length;
  const pct = Math.round((score / Math.max(totalQ,1)) * 100);

  const selectAnswer = async (opt: string) => {
    if (revealed) return;
    setSelected(opt); setRevealed(true);
    setAnswers(p=>({...p,[current]:opt}));
    const correct = opt === q.correct;
    const qpts = q.difficulty==="hard"?3:q.difficulty==="medium"?2:1;
    if (correct) {
      setPts(p=>p+qpts);
      const ns = streak+1; setStreak(ns);
      if (ns>=2 && adaptiveDiff!=="hard") { setAdaptiveDiff(d=>d==="easy"?"medium":"hard"); setDiffMsg("🔥 Moving to harder!"); }
      await removeWrongAnswer(userId, q.id);
    } else {
      setStreak(0);
      if (adaptiveDiff!=="easy") { setAdaptiveDiff(d=>d==="hard"?"medium":"easy"); setDiffMsg("💪 Easier one next!"); }
      await saveWrongAnswer(userId, q.id, opt);
    }
  };

  const next = async () => {
    if (current < totalQ-1) { setCurrent(c=>c+1); setSelected(null); setRevealed(false); setDiffMsg(""); }
    else {
      const passed = pct >= (quiz?.pass_score||60);
      await saveQuizResult(userId, quizId, score, totalQ, passed);
      await saveProgress(userId, chapterId, { completed: true });
      if (!passed) localStorage.setItem(`quiz_last_fail_${quizId}`, String(Date.now()));
      const bpts = pct===100?75:passed?25:10;
      await awardPoints(userId, bpts, pct===100?"quiz_master":undefined);
      if (pct===100) confetti({ particleCount:200, spread:90, origin:{y:0.5} });
      else if (passed) confetti({ particleCount:100, spread:70, origin:{y:0.6} });
      // Set revision reminders
      const remind3  = new Date(Date.now()+3*86400000).toISOString();
      await supabase.from("revision_reminders").upsert({ user_id:userId, chapter_id:chapterId, remind_at:remind3, times_reminded:0 },{ onConflict:"user_id,chapter_id" });
      setStep("result");
    }
  };

  const optStyle = (opt: string) => {
    if (!revealed) return "bg-card border-border hover:border-primary hover:bg-primary/5 cursor-pointer";
    if (opt===q.correct) return "bg-green-50 border-green-500 dark:bg-green-900/20";
    if (opt===selected && opt!==q.correct) return "bg-red-50 border-red-400 dark:bg-red-900/20";
    return "bg-card border-border opacity-50";
  };

  const diffClr = adaptiveDiff==="hard"?"text-red-500 bg-red-50 dark:bg-red-900/20":adaptiveDiff==="medium"?"text-blue-500 bg-blue-50 dark:bg-blue-950/20":"text-green-500 bg-green-50 dark:bg-green-900/20";

  if (step==="cooldown") return (
    <div className="mt-10 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-3xl p-8 text-center">
      <p className="text-4xl mb-3">⏳</p>
      <h3 className="text-xl font-black text-foreground mb-2">Quiz Cooldown</h3>
      <p className="text-muted-foreground mb-1">You need to wait before retrying this quiz.</p>
      <p className="text-3xl font-black font-mono text-blue-700 my-4">
        {String(Math.floor(cooldownLeft/60)).padStart(2,"0")}:{String(cooldownLeft%60).padStart(2,"0")}
      </p>
      <p className="text-sm text-muted-foreground">Use this time to re-read the chapter!</p>
    </div>
  );

  if (step==="start") return (
    <div className="bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-900/20 dark:to-indigo-900/20 border border-violet-200 dark:border-violet-700/30 rounded-3xl p-6 md:p-8 text-center mt-10">
      <p className="text-5xl mb-3">🧠</p>
      <h3 className="text-2xl font-black text-foreground mb-2">Chapter Quiz</h3>
      <p className="text-muted-foreground mb-1">{totalQ} questions • Pass: {quiz?.pass_score||60}%</p>
      <p className="text-sm text-muted-foreground mb-4">🎯 Adaptive difficulty • 5min cooldown if failed</p>
      <button onClick={()=>setStep("quiz")}
        className="bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-bold px-8 py-3 rounded-2xl hover:opacity-90 transition-opacity">
        Start Quiz 🚀
      </button>
    </div>
  );

  if (step==="quiz") return (
    <div className="mt-10 bg-card border border-border rounded-3xl overflow-hidden shadow-lg">
      <div className="h-1.5 bg-muted">
        <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-600 transition-all duration-500" style={{width:`${(current/totalQ)*100}%`}} />
      </div>
      <div className="p-5 md:p-8">
        <div className="flex justify-between items-center mb-5 flex-wrap gap-2">
          <span className="text-sm font-semibold text-muted-foreground">Q {current+1}/{totalQ}</span>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${diffClr}`}>{adaptiveDiff}</span>
            <span className="text-sm bg-blue-100 text-blue-800 font-bold px-3 py-1 rounded-full">⭐ {pts}pts</span>
          </div>
        </div>
        {diffMsg && <p className="text-sm font-semibold text-center mb-4 text-violet-600 bg-violet-50 dark:bg-violet-900/20 py-2 rounded-xl">{diffMsg}</p>}
        <AnimatePresence mode="wait">
          <motion.div key={current} initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-20}}>
            <h4 className="text-lg md:text-xl font-bold text-foreground mb-5 leading-relaxed">{q.question}</h4>
            <div className="grid grid-cols-1 gap-3">
              {(["a","b","c","d"] as const).map(opt => (
                <button key={opt} onClick={()=>selectAnswer(opt)} disabled={revealed}
                  className={`w-full text-left px-4 py-4 rounded-2xl border-2 font-medium transition-all duration-200 min-h-[56px] ${optStyle(opt)}`}>
                  <span className="font-black text-primary mr-3 uppercase">{opt}.</span>
                  {q[`option_${opt}` as keyof NoteQuestion] as string}
                  {revealed && opt===q.correct && <span className="ml-2">✅</span>}
                  {revealed && opt===selected && opt!==q.correct && <span className="ml-2">❌</span>}
                </button>
              ))}
            </div>
            {revealed && (
              <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} className="mt-4 space-y-3">
                {selected!==q.correct && q.explanation && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 dark:text-blue-300">
                    <p className="font-bold mb-1">📖 Explanation:</p><p>{q.explanation}</p>
                  </div>
                )}
                {selected!==q.correct && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 rounded-xl p-3 text-sm text-green-700 dark:text-green-400">
                    ✅ Correct: <strong>{q.correct.toUpperCase()}. {q[`option_${q.correct}` as keyof NoteQuestion] as string}</strong>
                  </div>
                )}
                <button onClick={next} className="w-full bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-bold py-3.5 rounded-2xl hover:opacity-90">
                  {current<totalQ-1?"Next Question →":"See Results 🏆"}
                </button>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );

  if (step==="result") {
    const emoji = pct===100?"🏆":pct>=80?"⭐":pct>=60?"👍":"💪";
    const msg   = pct===100?"Perfect! Amazing!":pct>=80?"Excellent!":pct>=60?"Good Job!":"Keep Practicing!";
    return (
      <motion.div initial={{opacity:0,scale:0.9}} animate={{opacity:1,scale:1}}
        className="mt-10 bg-card border border-border rounded-3xl p-6 md:p-8 text-center shadow-lg">
        <p className="text-6xl mb-3">{emoji}</p>
        <h3 className="text-2xl font-black text-foreground mb-1">{msg}</h3>
        <p className="text-5xl font-black text-primary my-3">{score}/{totalQ}</p>
        <div className="w-full bg-muted rounded-full h-3 mb-1">
          <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-600" style={{width:`${pct}%`}} />
        </div>
        <p className="text-muted-foreground text-sm mb-2">{pct}%</p>
        <p className="text-blue-700 font-bold text-sm mb-6">⭐ +{pts} points earned!</p>
        {pct < 60 && <p className="text-blue-700 text-xs mb-3">You can retry in 5 minutes</p>}
        <button onClick={()=>{setCurrent(0);setAnswers({});setSelected(null);setRevealed(false);setPts(0);setStreak(0);setAdaptiveDiff("medium");
          const key=`quiz_last_fail_${quizId}`;const lf=localStorage.getItem(key);
          if(lf){const el=(Date.now()-parseInt(lf))/1000;if(el<300){setCooldownLeft(Math.ceil(300-el));setStep("cooldown");return;}}
          setStep("quiz");}}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-border hover:bg-secondary font-semibold text-sm mx-auto">
          <RotateCcw className="w-4 h-4" /> Try Again
        </button>
      </motion.div>
    );
  }
  return null;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FLASHCARD MODE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const FlashcardMode = ({ chapterId, onClose }: { chapterId: string; onClose: () => void }) => {
  const { data: cards = [] } = useFlashcards(chapterId);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<string>>(new Set());
  const [done, setDone] = useState(false);
  if (!cards.length) return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-card rounded-3xl p-8 text-center max-w-sm w-full">
        <p className="text-4xl mb-3">📇</p><p className="font-bold text-foreground">No flashcards yet</p>
        <button onClick={onClose} className="mt-4 px-6 py-2 rounded-xl bg-primary text-primary-foreground font-semibold">Close</button>
      </div>
    </div>
  );
  const remaining = cards.filter(c => !known.has(c.id));
  const card = remaining[idx % Math.max(remaining.length,1)];
  const progress = Math.round((known.size / Math.max(cards.length,1)) * 100);
  const markKnown = () => {
    const nk = new Set(known); nk.add(card.id); setKnown(nk); setFlipped(false);
    if (nk.size === cards.length) { setDone(true); return; }
    setIdx(i => (i+1) % Math.max(cards.filter(c=>!nk.has(c.id)).length,1));
  };
  const markReview = () => { setFlipped(false); setIdx(i => (i+1) % Math.max(remaining.length,1)); };
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-card rounded-3xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div><h3 className="font-bold text-foreground">📇 Flashcards</h3><p className="text-xs text-muted-foreground">{known.size}/{cards.length} mastered</p></div>
          <div className="flex items-center gap-3">
            <div className="w-24 bg-muted rounded-full h-2"><div className="h-full bg-green-500 rounded-full" style={{width:`${progress}%`}} /></div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary"><X className="w-5 h-5" /></button>
          </div>
        </div>
        {done ? (
          <div className="p-10 text-center">
            <p className="text-5xl mb-4">🎉</p><h3 className="text-xl font-black text-foreground mb-2">All Mastered!</h3>
            <div className="flex gap-3 justify-center mt-6">
              <button onClick={()=>{setKnown(new Set());setIdx(0);setDone(false);setFlipped(false);}}
                className="px-5 py-2.5 rounded-xl border border-border hover:bg-secondary font-semibold text-sm flex items-center gap-2"><RotateCcw className="w-4 h-4" /> Restart</button>
              <button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm">Done ✓</button>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <p className="text-xs text-center text-muted-foreground mb-4">Tap the card to flip</p>
            <div className="cursor-pointer mb-6" onClick={()=>setFlipped(f=>!f)} style={{perspective:"1000px"}}>
              <motion.div animate={{rotateY:flipped?180:0}} transition={{duration:0.5}} style={{transformStyle:"preserve-3d",position:"relative",height:"200px"}}>
                <div style={{backfaceVisibility:"hidden",WebkitBackfaceVisibility:"hidden"}} className="absolute inset-0 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl flex items-center justify-center p-6">
                  <p className="text-white text-lg font-bold text-center leading-relaxed">{card?.front}</p>
                </div>
                <div style={{backfaceVisibility:"hidden",WebkitBackfaceVisibility:"hidden",transform:"rotateY(180deg)"}} className="absolute inset-0 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center p-6">
                  <p className="text-white text-base text-center leading-relaxed">{card?.back}</p>
                </div>
              </motion.div>
            </div>
            {flipped ? (
              <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} className="flex gap-3">
                <button onClick={markReview} className="flex-1 py-3 rounded-2xl border-2 border-blue-400 bg-blue-50 dark:bg-blue-950/20 text-blue-800 font-bold text-sm">🔄 Review Again</button>
                <button onClick={markKnown} className="flex-1 py-3 rounded-2xl border-2 border-green-400 bg-green-50 dark:bg-green-900/20 text-green-700 font-bold text-sm">✅ Got It!</button>
              </motion.div>
            ) : <p className="text-center text-sm text-muted-foreground mt-2">👆 Tap to see answer</p>}
          </div>
        )}
      </div>
    </div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PRINT OPTIMIZED
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const PrintOptimized = ({ chapter, subject, schoolName, onClose }: any) => {
  useEffect(() => { setTimeout(() => window.print(), 300); }, []);
  return (
    <div className="fixed inset-0 z-50 bg-white" id="print-view">
      <style>{`@media print { body > *:not(#print-view) { display:none!important; } #print-view { position:static!important; } }`}</style>
      <div className="max-w-3xl mx-auto p-8">
        <div className="flex justify-between items-start mb-6">
          <div><h1 className="text-2xl font-black text-gray-900">{chapter.title}</h1><p className="text-gray-500">{subject.emoji} {subject.name} — Chapter {chapter.chapter_number}</p></div>
          <button onClick={onClose} className="print:hidden px-4 py-2 border rounded-xl text-sm hover:bg-gray-50"><X className="w-4 h-4" /></button>
        </div>
        <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{__html: chapter.content || ""}} />
        {/* Note: Print view uses raw HTML without KaTeX for print compatibility */}
        <div className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-400 flex justify-between">
          <span>{schoolName}</span><span>{chapter.title}</span>
        </div>
      </div>
    </div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONCEPT CONNECTIONS (See Also)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const ConceptConnections = ({ chapterId }: { chapterId: string }) => {
  const [connections, setConnections] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("chapter_connections")
      .select("*, related_chapter:related_chapter_id(id,title,slug,note_subjects(name,slug,emoji,color))")
      .eq("chapter_id", chapterId)
      .then(({ data }) => setConnections(data || []));
  }, [chapterId]);
  if (!connections.length) return null;
  return (
    <div className="mt-8">
      <h3 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">🔗 See Also — Related Topics</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {connections.map((c: any) => {
          const rc = c.related_chapter;
          const subj = rc?.note_subjects;
          return (
            <Link key={c.id} to={`/notes/${subj?.slug}/${rc?.slug}`}>
              <div className="flex items-center gap-3 bg-card border border-border rounded-xl p-3 hover:shadow-md hover:border-primary/40 transition-all">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0" style={{backgroundColor:`${subj?.color}20`}}>
                  {subj?.emoji}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{rc?.title}</p>
                  <p className="text-xs text-muted-foreground">{subj?.name}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN CHAPTER PAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const ChapterPage = () => {
  const { subject: subjectSlug, chapter: chapterSlug } = useParams<{ subject: string; chapter: string }>();
  const { user, profile } = useAuth();
  const contentRef = useRef<HTMLDivElement>(null);
  const iframeRef  = useRef<HTMLIFrameElement>(null);
  const readStartRef = useRef<number>(0);

  const [readProgress, setReadProgress] = useState(0);
  const [bookmarked, setBookmarked]   = useState(false);
  const [completed, setCompleted]     = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [helpful, setHelpful]         = useState<"yes"|"no"|null>(null);
  const [showAudio, setShowAudio]     = useState(false);
  const [showPomodoro, setShowPomodoro] = useState(false);
  const [showFlashcards, setShowFlashcards] = useState(false);
  const [showPrint, setShowPrint]     = useState(false);
  const [showReport, setShowReport]   = useState(false);
  const [showWikiAssistant, setShowWikiAssistant] = useState(false);
  const [liteMode, setLiteMode]       = useState(() => {
    try { return JSON.parse(localStorage.getItem("lite-mode")||"false"); } catch { return false; }
  });

  const { data: subjects = [] } = useNoteSubjects();
  const subject = subjects.find(s => s.slug === subjectSlug);
  const { data: chapters = [] } = useNoteChapters(subject?.id);
  const chapter = chapters.find(c => c.slug === chapterSlug);
  const { data: progress = [] } = useNoteProgress(user?.id);
  const { data: quiz }         = useNoteQuiz(chapter?.id);
  const { data: flashcards = [] } = useFlashcards(chapter?.id);

  const chapterIdx  = chapters.findIndex(c => c.slug === chapterSlug);
  const prevChapter = chapters[chapterIdx - 1];
  const nextChapter = chapters[chapterIdx + 1];

  // Check prerequisite
  const prereqChapterId: string | null = (chapter as any)?.prerequisite_chapter_id || null;
  const prereqMet = !prereqChapterId || progress.some(p => p.chapter_id === prereqChapterId && p.completed);
  const prereqChapter = prereqChapterId ? chapters.find(c => c.id === prereqChapterId) : null;

  useEffect(() => {
    if (!chapter || !progress.length) return;
    const p = progress.find(p => p.chapter_id === chapter.id);
    if (p) { setBookmarked(p.bookmarked); setCompleted(p.completed); }
  }, [chapter, progress]);

  useEffect(() => {
    if (user && chapter) {
      saveProgress(user.id, chapter.id, { started: true });
      awardPoints(user.id, 5);
      incrementViewCount(chapter.id);
      readStartRef.current = Date.now();
    }
    return () => {
      // Save actual reading time on unmount
      if (user && chapter && readStartRef.current > 0) {
        const mins = Math.round((Date.now() - readStartRef.current) / 60000);
        if (mins > 0) {
          supabase.from("chapter_reading_times").upsert(
            { user_id: user.id, chapter_id: chapter.id, minutes: mins, recorded_at: new Date().toISOString() },
            { onConflict: "user_id,chapter_id" }
          );
        }
      }
    };
  }, [user?.id, chapter?.id]);

  const onScroll = useCallback(() => {
    if (!contentRef.current) return;
    const { scrollTop, clientHeight } = document.documentElement;
    const elTop = contentRef.current.getBoundingClientRect().top + window.scrollY;
    const pct = Math.min(100, Math.max(0, Math.round(((scrollTop - elTop + clientHeight) / contentRef.current.offsetHeight) * 100)));
    setReadProgress(pct);
    if (pct >= 90 && !completed && user && chapter) {
      setCompleted(true);
      saveProgress(user.id, chapter.id, { completed: true });
      awardPoints(user.id, 20, "first_step");
    }
  }, [completed, user, chapter]);

  useEffect(() => { window.addEventListener("scroll", onScroll); return () => window.removeEventListener("scroll", onScroll); }, [onScroll]);
  useEffect(() => { try { localStorage.setItem("lite-mode", JSON.stringify(liteMode)); } catch {} }, [liteMode]);

  // Animation: now handled by iframe — no useEffect needed

  const toggleBookmark = async () => {
    if (!user||!chapter) return;
    const next = !bookmarked; setBookmarked(next);
    await saveProgress(user.id, chapter.id, { bookmarked: next });
    if (next) await awardPoints(user.id, 5);
  };

  if (!subject || !chapter) return (
    <PageLayout><div className="max-w-4xl mx-auto px-4 py-20 text-center">
      <p className="text-4xl mb-4">📭</p><p className="font-semibold">Chapter not found</p>
      <Link to="/notes" className="text-primary text-sm mt-2 inline-block">← Back to Notes</Link>
    </div></PageLayout>
  );

  // Prerequisite gate
  if (!prereqMet && prereqChapter) return (
    <PageLayout><div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
        <Lock className="w-10 h-10 text-muted-foreground" />
      </div>
      <h2 className="text-2xl font-black text-foreground mb-3">Chapter Locked</h2>
      <p className="text-muted-foreground mb-6">You need to complete <strong>{prereqChapter.title}</strong> first before accessing this chapter.</p>
      <Link to={`/notes/${subjectSlug}/${prereqChapter.slug}`}
        className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-2xl font-semibold hover:opacity-90">
        Go to {prereqChapter.title} <ChevronRight className="w-4 h-4" />
      </Link>
    </div></PageLayout>
  );

  return (
    <PageLayout>
      {/* Reading progress bar */}
      <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-muted">
        <div className="h-full transition-all duration-300" style={{ width:`${readProgress}%`, backgroundColor:subject.color }} />
      </div>

      {/* Overlays */}
      <AnimatePresence>
        {showAudio && chapter.content && <AudioPlayer content={chapter.content} onClose={()=>setShowAudio(false)} />}
      </AnimatePresence>
      {showPomodoro && <PomodoroTimer onClose={()=>setShowPomodoro(false)} />}
      {showFlashcards && <FlashcardMode chapterId={chapter.id} onClose={()=>setShowFlashcards(false)} />}
      {showPrint && <PrintOptimized chapter={chapter} subject={subject} schoolName="GHS Babi Khel" onClose={()=>setShowPrint(false)} />}
      {showReport && user && <ReportMistake chapterId={chapter.id} userId={user.id} onClose={()=>setShowReport(false)} />}
      {user && <AnnotationOverlay chapterId={chapter.id} contentRef={contentRef} />}

      {/* Floating buttons */}
      <div className="fixed bottom-28 right-4 z-40 flex flex-col gap-2">
        <button onClick={()=>setShowPomodoro(v=>!v)} title="Study Timer"
          className="w-12 h-12 rounded-full bg-red-500 text-white shadow-lg hover:bg-red-600 flex items-center justify-center text-xl">🍅</button>
        {/* Audio Notes Player (pre-recorded audio) — shown when chapter has audio_url */}
        {(chapter as any).audio_url ? (
          <AudioNotesPlayer
            audioUrl={(chapter as any).audio_url}
            chapterTitle={chapter.title}
            chapters={chapters.map(ch => ({
              id: ch.id,
              title: ch.title,
              audio_url: (ch as any).audio_url || null,
              chapter_number: ch.chapter_number,
            }))}
            subjectColor={subject.color}
            subjectEmoji={subject.emoji}
          />
        ) : (
          /* Fallback to TTS Read Aloud if no pre-recorded audio */
          chapter.audio_enabled !== false && (
            <button onClick={()=>setShowAudio(v=>!v)} title="Read Aloud (TTS)"
              className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-colors ${showAudio?"bg-primary/80":"bg-primary"} text-primary-foreground hover:opacity-90`}>
              <Volume2 className="w-5 h-5" />
            </button>
          )
        )}
        {flashcards.length > 0 && (
          <button onClick={()=>setShowFlashcards(true)} title="Flashcards"
            className="w-12 h-12 rounded-full bg-emerald-500 text-white shadow-lg hover:bg-emerald-600 flex items-center justify-center">📇</button>
        )}
        {user && (
          <button onClick={()=>setShowReport(true)} title="Report Mistake"
            className="w-12 h-12 rounded-full bg-card border border-border text-muted-foreground shadow-lg hover:bg-secondary flex items-center justify-center">
            <Flag className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="max-w-5xl mx-auto px-3 md:px-4 py-6 md:py-8 flex gap-6 md:gap-8">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-60 shrink-0">
          <div className="sticky top-8 bg-card border border-border rounded-2xl overflow-hidden">
            <div className="p-4 text-white font-bold text-sm" style={{backgroundColor:subject.color}}>{subject.emoji} {subject.name}</div>
            <div className="p-2 max-h-[70vh] overflow-y-auto">
              {chapters.map((ch,i) => {
                const chProgress = progress.find(p=>p.chapter_id===ch.id);
                const chPrereq = (ch as any).prerequisite_chapter_id;
                const chUnlocked = !chPrereq || progress.some(p=>p.chapter_id===chPrereq&&p.completed);
                return (
                  <Link key={ch.id} to={chUnlocked?`/notes/${subjectSlug}/${ch.slug}`:"#"}
                    onClick={e=>{if(!chUnlocked)e.preventDefault();}}>
                    <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-colors ${ch.slug===chapterSlug?"font-bold text-white":"text-muted-foreground hover:bg-secondary hover:text-foreground"} ${!chUnlocked?"opacity-50":""}`}
                      style={ch.slug===chapterSlug?{backgroundColor:subject.color}:{}}>
                      <span className="w-5 h-5 rounded-full bg-current/20 flex items-center justify-center text-[10px] font-black shrink-0">{i+1}</span>
                      <span className="truncate flex-1">{ch.title}</span>
                      {!chUnlocked && <Lock className="w-3 h-3 shrink-0" />}
                      {chProgress?.completed && chUnlocked && <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Mobile sidebar */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/50" onClick={()=>setSidebarOpen(false)} />
            <div className="relative w-72 bg-card h-full flex flex-col">
              <div className="p-4 text-white font-bold flex justify-between" style={{backgroundColor:subject.color}}>
                <span>{subject.emoji} {subject.name}</span>
                <button onClick={()=>setSidebarOpen(false)}><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {chapters.map((ch,i) => {
                  const chPrereq = (ch as any).prerequisite_chapter_id;
                  const chUnlocked = !chPrereq||progress.some(p=>p.chapter_id===chPrereq&&p.completed);
                  return (
                    <Link key={ch.id} to={chUnlocked?`/notes/${subjectSlug}/${ch.slug}`:"#"}
                      onClick={e=>{if(!chUnlocked)e.preventDefault();setSidebarOpen(false);}}>
                      <div className={`flex items-center gap-2 px-3 py-3 rounded-xl text-sm ${ch.slug===chapterSlug?"font-bold text-white":"text-muted-foreground"} ${!chUnlocked?"opacity-50":""}`}
                        style={ch.slug===chapterSlug?{backgroundColor:subject.color}:{}}>
                        <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] shrink-0">{i+1}</span>
                        <span className="flex-1 truncate">{ch.title}</span>
                        {!chUnlocked && <Lock className="w-3 h-3 shrink-0" />}
                        {progress.find(p=>p.chapter_id===ch.id&&p.completed)&&chUnlocked&&<CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 min-w-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4 flex-wrap">
            <Link to="/notes" className="hover:text-foreground">Notes</Link>
            <ChevronRight className="w-3 h-3" />
            <Link to={`/notes/${subjectSlug}`} className="hover:text-foreground">{subject.name}</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-foreground font-medium truncate max-w-[150px]">{chapter.title}</span>
          </div>

          {/* Gamification + revision reminder */}
          {user && <GamificationBar userId={user.id} />}
          {user && completed && <RevisionReminder chapterId={chapter.id} chapterTitle={chapter.title} userId={user.id} />}

          {/* Chapter header */}
          <div className="relative overflow-hidden rounded-3xl p-6 md:p-8 mb-6 md:mb-8 text-white"
            style={{background:`linear-gradient(135deg,${subject.color},${subject.color}99)`}}>
            <div className="absolute top-0 right-0 text-7xl md:text-8xl opacity-10">{subject.emoji}</div>
            <div className="relative">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="bg-white/20 px-2.5 py-1 rounded-full text-xs font-bold">Chapter {chapter.chapter_number}</span>
                <span className="bg-white/20 px-2.5 py-1 rounded-full text-xs font-bold capitalize">{chapter.difficulty}</span>
                {(chapter as any).bise_important && (
                  <span className="bg-red-500 px-2.5 py-1 rounded-full text-xs font-bold">🎯 BISE Topic — {(chapter as any).bise_years} past papers</span>
                )}
                <CompletionStamp subjectColor={subject.color} show={completed} />
              </div>
              <h1 className="text-xl md:text-3xl font-black leading-tight mb-2 md:mb-3">{chapter.title}</h1>
              {chapter.description && <p className="text-white/80 text-sm">{chapter.description}</p>}
              <div className="flex flex-wrap items-center gap-2 md:gap-4 mt-4">
                <div className="flex items-center gap-1.5 text-sm text-white/80"><Clock className="w-4 h-4" /> {chapter.read_time_mins} min</div>
                {chapter.animation_code && <div className="flex items-center gap-1.5 text-sm text-white/80"><Zap className="w-4 h-4" /> Interactive</div>}
                {(chapter as any).audio_url && <div className="flex items-center gap-1.5 text-sm text-white/80"><Headphones className="w-4 h-4" /> Audio Notes</div>}
                {flashcards.length>0 && <div className="flex items-center gap-1.5 text-sm text-white/80">📇 {flashcards.length} cards</div>}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <button onClick={toggleBookmark}
                    className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-xl text-sm font-medium">
                    {bookmarked?<BookmarkCheck className="w-4 h-4"/>:<Bookmark className="w-4 h-4"/>}
                    <span className="hidden sm:inline">{bookmarked?"Saved":"Save"}</span>
                  </button>
                  <button onClick={()=>setShowPrint(true)}
                    className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-xl text-sm font-medium">
                    <Download className="w-4 h-4" /><span className="hidden sm:inline">Print</span>
                  </button>
                  {chapter.pdf_url && (
                    <a href={chapter.pdf_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-xl text-sm font-medium">
                      <Download className="w-4 h-4" /><span className="hidden sm:inline">PDF</span>
                    </a>
                  )}
                  <button onClick={()=>setLiteMode(!liteMode)} title={liteMode?"Disable Lite Mode":"Lite Mode"}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium ${liteMode?"bg-white/30":"bg-white/20 hover:bg-white/30"} text-white`}>
                    {liteMode?"🔆":"📡"}
                  </button>
                  <button onClick={()=>setSidebarOpen(true)}
                    className="lg:hidden flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-xl text-sm font-medium">
                    <Menu className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Chapter Content — with KaTeX formula rendering */}
          <div ref={contentRef}
            className={`notes-content prose prose-base md:prose-lg max-w-none dark:prose-invert
              prose-h2:text-orange-500 prose-h2:font-black
              prose-h3:text-blue-600 prose-h3:font-bold
              prose-strong:text-foreground
              prose-code:bg-primary/10 prose-code:text-primary prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
              prose-table:border prose-th:bg-muted prose-td:border prose-td:border-border ${liteMode?"prose-img:hidden":""}`}
            style={{fontSize:"17px",lineHeight:"1.85"}}>
            {chapter.content
              ? <KaTeXRenderer content={chapter.content} liteMode={liteMode} />
              : <div className="text-center py-16 text-muted-foreground"><p className="text-4xl mb-3">📝</p><p>Content coming soon...</p></div>
            }
          </div>

          {/* Animation */}
          {chapter.animation_code && !liteMode && (
            <InteractiveIframe code={chapter.animation_code} subjectColor={subject.color} />
          )}

          {/* Chart */}
          {!liteMode && !chapter.animation_code && <ChapterChart config={chapter.graph_config} />}

          {/* Interactive Labs — Desmos / GeoGebra / PhET / 3D molecules / code playground / concept map */}
          {!liteMode && (
            <InteractiveLabs
              subjectName={subject.name}
              subjectSlug={subjectSlug || subject.slug}
              subjectColor={subject.color}
              chapterTitle={chapter.title}
              chapterContent={chapter.content || ""}
              liteMode={liteMode}
            />
          )}

          {/* Concept connections */}
          <ConceptConnections chapterId={chapter.id} />

          {/* Helpful */}
          <div className="mt-8 flex items-center gap-4 bg-secondary/50 rounded-2xl p-4">
            <p className="text-sm font-semibold text-foreground flex-1">Was this chapter helpful?</p>
            <div className="flex gap-2">
              <button onClick={()=>setHelpful("yes")}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${helpful==="yes"?"bg-green-500 text-white":"bg-card border border-border hover:border-green-500"}`}>
                <ThumbsUp className="w-4 h-4" /> Yes
              </button>
              <button onClick={()=>setHelpful("no")}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${helpful==="no"?"bg-red-500 text-white":"bg-card border border-border hover:border-red-400"}`}>
                <ThumbsDown className="w-4 h-4" /> No
              </button>
            </div>
          </div>

          {/* Flashcards */}
          {flashcards.length > 0 && (
            <button onClick={()=>setShowFlashcards(true)}
              className="mt-6 w-full flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-bold hover:bg-emerald-100 transition-colors">
              📇 Study {flashcards.length} Flashcards
            </button>
          )}

          {/* Quiz */}
          {quiz && user && <AdaptiveQuiz quizId={quiz.id} chapterId={chapter.id} userId={user.id} />}
          {!user && quiz && (
            <div className="mt-10 bg-primary/5 border border-primary/20 rounded-2xl p-6 text-center">
              <Trophy className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="font-semibold text-foreground">Sign in to take the quiz</p>
              <Link to="/auth/signin" className="inline-block mt-3 bg-primary text-primary-foreground px-6 py-2 rounded-xl text-sm font-semibold">Sign In</Link>
            </div>
          )}

          {/* Chapter Q&A */}
          <ChapterQnA chapterId={chapter.id} userId={user?.id} userRole={profile?.role} />

          {/* Prev / Next */}
          <div className="flex gap-3 mt-8 mb-4">
            {prevChapter
              ? <Link to={`/notes/${subjectSlug}/${prevChapter.slug}`} className="flex-1">
                  <div className="flex items-center gap-3 bg-card border border-border hover:border-primary/50 rounded-2xl p-4 transition-all hover:shadow-md group h-full">
                    <ArrowLeft className="w-5 h-5 text-muted-foreground group-hover:text-primary shrink-0" />
                    <div className="min-w-0"><p className="text-xs text-muted-foreground">Previous</p><p className="text-sm font-semibold text-foreground truncate">{prevChapter.title}</p></div>
                  </div>
                </Link>
              : <div className="flex-1" />}
            {nextChapter && (
              <Link to={`/notes/${subjectSlug}/${nextChapter.slug}`} className="flex-1">
                <div className="flex items-center gap-3 bg-card border border-border hover:border-primary/50 rounded-2xl p-4 transition-all hover:shadow-md group h-full">
                  <div className="min-w-0 text-right flex-1"><p className="text-xs text-muted-foreground">Next</p><p className="text-sm font-semibold text-foreground truncate">{nextChapter.title}</p></div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary shrink-0" />
                </div>
              </Link>
            )}
          </div>

          {/* Wikipedia Study Assistant */}
          <WikiNoteAssistant
            chapterTitle={chapter.title}
            subjectColor={subject.color}
          />

          {/* Mobile bottom nav */}
          <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-card/95 backdrop-blur-sm border-t border-border flex">
            {prevChapter
              ? <Link to={`/notes/${subjectSlug}/${prevChapter.slug}`} className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="w-4 h-4" /> Prev
                </Link>
              : <div className="flex-1" />}
            <button onClick={()=>setSidebarOpen(true)}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold text-primary border-x border-border">
              <BookOpen className="w-4 h-4" /> Chapters
            </button>
            {nextChapter
              ? <Link to={`/notes/${subjectSlug}/${nextChapter.slug}`} className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground">
                  Next <ArrowRight className="w-4 h-4" />
                </Link>
              : <div className="flex-1" />}
          </div>
        </main>
      </div>
    </PageLayout>
  );
};

export default ChapterPage;
