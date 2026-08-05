import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, Square, X, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { detectTextLanguage } from "@/lib/newsUtils";

interface TTSPlayerProps {
  text: string;
  title: string;
  onClose: () => void;
}

const speeds = [0.75, 1, 1.25, 1.5, 2];

const cleanText = (t: string) =>
  t.replace(/[\u{1F600}-\u{1F9FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}]/gu, "").trim();

/**
 * Picks the best available system voice for the detected language.
 * Prefers a native Urdu voice; falls back to Arabic (closest phonetic match
 * available in most browsers/OSes), then any voice at all for English.
 */
function pickVoice(voices: SpeechSynthesisVoice[], lang: "ur" | "en") {
  if (!voices.length) return undefined;
  if (lang === "ur") {
    return (
      voices.find(v => v.lang?.toLowerCase().startsWith("ur")) ||
      voices.find(v => v.lang?.toLowerCase().startsWith("ar")) ||
      voices.find(v => /urdu/i.test(v.name)) ||
      voices.find(v => v.lang?.toLowerCase().startsWith("hi")) // Hindi is the next-closest phonetically
    );
  }
  return (
    voices.find(v => v.lang?.toLowerCase() === "en-us") ||
    voices.find(v => v.lang?.toLowerCase().startsWith("en-gb")) ||
    voices.find(v => v.lang?.toLowerCase().startsWith("en"))
  );
}

const TextToSpeechPlayer = ({ text, title, onClose }: TTSPlayerProps) => {
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(() => {
    const saved = localStorage.getItem("tts-speed");
    return saved ? Number(saved) : 1;
  });
  const [progress, setProgress] = useState(0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const cleaned = cleanText(text);
  const detectedLang = useMemo(() => detectTextLanguage(cleaned), [cleaned]);
  const voice = useMemo(() => pickVoice(voices, detectedLang), [voices, detectedLang]);

  // Voice lists load asynchronously in most browsers — wait for them.
  useEffect(() => {
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const configureUtterance = useCallback((utter: SpeechSynthesisUtterance) => {
    utter.lang = detectedLang === "ur" ? (voice?.lang || "ur-PK") : (voice?.lang || "en-US");
    if (voice) utter.voice = voice;
    utter.pitch = 1;
  }, [detectedLang, voice]);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setPlaying(false);
    setPaused(false);
    setProgress(0);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const play = useCallback(() => {
    stop();
    const utter = new SpeechSynthesisUtterance(cleaned);
    utter.rate = speed;
    configureUtterance(utter);
    utter.onend = () => { setPlaying(false); setPaused(false); setProgress(100); };
    utterRef.current = utter;
    window.speechSynthesis.speak(utter);
    setPlaying(true);
    setPaused(false);

    // Estimate progress
    const wpm = detectedLang === "ur" ? 130 : 150;
    const estimatedDuration = (cleaned.split(/\s+/).length / (wpm * speed)) * 60 * 1000;
    const start = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.min(100, (elapsed / estimatedDuration) * 100));
    }, 200);
  }, [cleaned, speed, stop, configureUtterance, detectedLang]);

  const togglePause = () => {
    if (paused) {
      window.speechSynthesis.resume();
      setPaused(false);
    } else {
      window.speechSynthesis.pause();
      setPaused(true);
    }
  };

  const changeSpeed = (s: number) => {
    setSpeed(s);
    localStorage.setItem("tts-speed", String(s));
    if (playing) {
      stop();
      setTimeout(() => {
        const utter = new SpeechSynthesisUtterance(cleaned);
        utter.rate = s;
        configureUtterance(utter);
        utter.onend = () => { setPlaying(false); setPaused(false); setProgress(100); };
        utterRef.current = utter;
        window.speechSynthesis.speak(utter);
        setPlaying(true);
      }, 100);
    }
  };

  useEffect(() => {
    return () => { window.speechSynthesis.cancel(); if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-gold/30 shadow-elevated p-3 lg:bottom-0"
      >
        <div className="container mx-auto max-w-2xl flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary-light flex items-center justify-center shrink-0">
            <Volume2 className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate" dir={detectedLang === "ur" ? "rtl" : "ltr"}>{title}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {detectedLang === "ur" ? "Urdu narration" : "English narration"}
            </p>
            <div className="w-full bg-secondary rounded-full h-1.5 mt-1.5">
              <div className="bg-gradient-to-r from-primary to-gold h-1.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!playing ? (
              <Button size="icon" variant="ghost" onClick={play} className="text-primary"><Play className="w-5 h-5" /></Button>
            ) : (
              <Button size="icon" variant="ghost" onClick={togglePause}>{paused ? <Play className="w-5 h-5 text-primary" /> : <Pause className="w-5 h-5 text-primary" />}</Button>
            )}
            <Button size="icon" variant="ghost" onClick={stop} disabled={!playing}><Square className="w-4 h-4" /></Button>
            <select
              value={speed}
              onChange={e => changeSpeed(Number(e.target.value))}
              className="text-xs bg-secondary rounded px-1.5 py-1 border-none outline-none"
            >
              {speeds.map(s => <option key={s} value={s}>{s}x</option>)}
            </select>
            <Button size="icon" variant="ghost" onClick={() => { stop(); onClose(); }}><X className="w-4 h-4" /></Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default TextToSpeechPlayer;

// Listen button component
export const ListenButton = ({ onClick }: { onClick: (e: React.MouseEvent) => void }) => (
  <button
    onClick={onClick}
    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors bg-gold-soft/60 hover:bg-gold-soft px-2.5 py-1 rounded-full"
  >
    <Volume2 className="w-3.5 h-3.5" /> Listen
  </button>
);
