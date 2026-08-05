import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, Square, X, Volume2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { detectTextLanguage } from "@/lib/newsUtils";

interface TTSPlayerProps {
  text: string;
  title: string;
  onClose: () => void;
  /** When true (default), narration starts automatically as soon as a voice is ready. */
  autoPlay?: boolean;
}

const speeds = [0.75, 1, 1.25, 1.5, 2];

const cleanText = (t: string) =>
  t
    .replace(/[\u{1F600}-\u{1F9FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Picks the best available system voice for the detected language.
 * Prefers a native Urdu voice; falls back to Arabic (closest phonetic match
 * available in most browsers/OSes), then Hindi, then any voice at all.
 */
function pickVoice(voices: SpeechSynthesisVoice[], lang: "ur" | "en") {
  if (!voices.length) return undefined;
  if (lang === "ur") {
    return (
      voices.find(v => v.lang?.toLowerCase().startsWith("ur")) ||
      voices.find(v => v.lang?.toLowerCase().startsWith("ar")) ||
      voices.find(v => /urdu/i.test(v.name)) ||
      voices.find(v => v.lang?.toLowerCase().startsWith("hi")) || // Hindi: next-closest phonetically
      voices.find(v => v.lang?.toLowerCase().startsWith("fa"))    // Persian fallback
    );
  }
  return (
    voices.find(v => v.lang?.toLowerCase() === "en-us") ||
    voices.find(v => v.lang?.toLowerCase().startsWith("en-gb")) ||
    voices.find(v => v.lang?.toLowerCase().startsWith("en-in")) ||
    voices.find(v => v.lang?.toLowerCase().startsWith("en"))
  );
}

const TextToSpeechPlayer = ({ text, title, onClose, autoPlay = true }: TTSPlayerProps) => {
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(() => {
    const saved = localStorage.getItem("tts-speed");
    return saved ? Number(saved) : 1;
  });
  const [progress, setProgress] = useState(0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voicesReady, setVoicesReady] = useState(false);
  const [autoPlayAttempted, setAutoPlayAttempted] = useState(false);

  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const cleaned = useMemo(() => cleanText(text), [text]);
  const detectedLang = useMemo(() => detectTextLanguage(cleaned), [cleaned]);
  const voice = useMemo(() => pickVoice(voices, detectedLang), [voices, detectedLang]);

  // Voice lists load asynchronously in most browsers — wait for them.
  useEffect(() => {
    const load = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length) {
        setVoices(v);
        setVoicesReady(true);
      }
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    // Some browsers need a kick after a short delay
    const kickTimer = setTimeout(load, 250);
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      clearTimeout(kickTimer);
    };
  }, []);

  const configureUtterance = useCallback((utter: SpeechSynthesisUtterance) => {
    const lang = detectedLang === "ur"
      ? (voice?.lang || "ur-PK")
      : (voice?.lang || "en-US");
    utter.lang = lang;
    if (voice) utter.voice = voice;
    utter.pitch = 1;
    // Urdu reads slightly slower by default; gentle nudge for clarity.
    if (detectedLang === "ur") utter.rate = (utter.rate || 1) * 0.95;
  }, [detectedLang, voice]);

  const stop = useCallback(() => {
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    setPlaying(false);
    setPaused(false);
    setProgress(0);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const play = useCallback(() => {
    if (!cleaned) return;
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    const utter = new SpeechSynthesisUtterance(cleaned);
    utter.rate = speed;
    configureUtterance(utter);
    utter.onstart = () => { setPlaying(true); setPaused(false); setProgress(0); };
    utter.onend = () => {
      setPlaying(false);
      setPaused(false);
      setProgress(100);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    utter.onerror = () => {
      setPlaying(false);
      setPaused(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    utterRef.current = utter;
    try {
      window.speechSynthesis.speak(utter);
      setPlaying(true);
      setPaused(false);

      // Estimate progress (per language WPM)
      const wpm = detectedLang === "ur" ? 130 : 150;
      const estimatedDuration = (cleaned.split(/\s+/).length / (wpm * speed)) * 60 * 1000;
      const start = Date.now();
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - start;
        setProgress(Math.min(99, (elapsed / estimatedDuration) * 100));
      }, 200);
    } catch {
      setPlaying(false);
    }
  }, [cleaned, speed, configureUtterance, detectedLang]);

  // ── AUTO-PLAY ──────────────────────────────────────────────────────────
  // As soon as voices are loaded (and we haven't already attempted), kick
  // off narration automatically. This is what makes the player "just start
  // reading" the moment the user clicks the Listen pill — English or Urdu.
  useEffect(() => {
    if (!autoPlay || autoPlayAttempted) return;
    if (!voicesReady) return;
    // tiny delay lets the panel animate in before audio starts
    const t = setTimeout(() => {
      setAutoPlayAttempted(true);
      play();
    }, 350);
    return () => clearTimeout(t);
  }, [autoPlay, autoPlayAttempted, voicesReady, play]);

  // If voices are slow to load, attempt with whatever we have after 1.5s
  useEffect(() => {
    if (!autoPlay || autoPlayAttempted) return;
    const t = setTimeout(() => {
      setAutoPlayAttempted(true);
      play();
    }, 1500);
    return () => clearTimeout(t);
  }, [autoPlay, autoPlayAttempted, play]);

  const togglePause = () => {
    if (paused) {
      try { window.speechSynthesis.resume(); } catch { /* noop */ }
      setPaused(false);
    } else {
      try { window.speechSynthesis.pause(); } catch { /* noop */ }
      setPaused(true);
    }
  };

  const changeSpeed = (s: number) => {
    setSpeed(s);
    localStorage.setItem("tts-speed", String(s));
    if (playing) {
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
      setPlaying(false);
      setTimeout(() => {
        const utter = new SpeechSynthesisUtterance(cleaned);
        utter.rate = s;
        configureUtterance(utter);
        utter.onend = () => { setPlaying(false); setPaused(false); setProgress(100); };
        utterRef.current = utter;
        try { window.speechSynthesis.speak(utter); setPlaying(true); } catch { /* noop */ }
      }, 120);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-gold/40 shadow-elevated p-3 lg:bottom-0"
        style={{
          background: "linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--card) / 0.98) 100%)",
        }}
      >
        <div className="container mx-auto max-w-2xl flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[hsl(348_55%_28%)] to-[hsl(348_50%_22%)] flex items-center justify-center shrink-0 shadow-md">
            {playing && !paused
              ? <Volume2 className="w-4 h-4 text-[hsl(45_40%_95%)] animate-pulse" />
              : !voicesReady && !playing
                ? <Loader2 className="w-4 h-4 text-[hsl(45_40%_95%)] animate-spin" />
                : <Volume2 className="w-4 h-4 text-[hsl(45_40%_95%)]" />}
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-medium text-foreground truncate"
              dir={detectedLang === "ur" ? "rtl" : "ltr"}
            >
              {title}
            </p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/80 flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[hsl(348_55%_28%)]" />
              {detectedLang === "ur" ? "Urdu narration" : "English narration"}
              {detectedLang === "ur" && (
                <span className="text-[9px] italic text-muted-foreground/60">
                  · auto-detected
                </span>
              )}
            </p>
            <div className="w-full bg-secondary rounded-full h-1.5 mt-1.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-[hsl(348_55%_28%)] via-gold to-[hsl(348_55%_28%)] h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!playing ? (
              <Button size="icon" variant="ghost" onClick={play} className="text-[hsl(348_55%_28%)]" aria-label="Play">
                <Play className="w-5 h-5" />
              </Button>
            ) : (
              <Button size="icon" variant="ghost" onClick={togglePause} aria-label="Pause/Resume">
                {paused
                  ? <Play className="w-5 h-5 text-[hsl(348_55%_28%)]" />
                  : <Pause className="w-5 h-5 text-[hsl(348_55%_28%)]" />}
              </Button>
            )}
            <Button size="icon" variant="ghost" onClick={stop} disabled={!playing} aria-label="Stop">
              <Square className="w-4 h-4" />
            </Button>
            <select
              value={speed}
              onChange={e => changeSpeed(Number(e.target.value))}
              className="text-xs bg-secondary rounded px-1.5 py-1 border-none outline-none cursor-pointer"
              aria-label="Playback speed"
            >
              {speeds.map(s => <option key={s} value={s}>{s}x</option>)}
            </select>
            <Button size="icon" variant="ghost" onClick={() => { stop(); onClose(); }} aria-label="Close">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default TextToSpeechPlayer;

// Listen button component — unchanged signature, slightly restyled to match
// the new editorial palette.
export const ListenButton = ({ onClick }: { onClick: (e: React.MouseEvent) => void }) => (
  <button
    onClick={onClick}
    className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full
               bg-gradient-to-r from-[hsl(348_55%_28%)] to-[hsl(348_50%_22%)] text-[hsl(45_40%_95%)]
               hover:brightness-110 active:scale-95 transition-all shadow-sm"
  >
    <Volume2 className="w-3.5 h-3.5" /> Listen
  </button>
);
