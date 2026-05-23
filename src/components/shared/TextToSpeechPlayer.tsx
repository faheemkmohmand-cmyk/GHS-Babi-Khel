import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, Square, X, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TTSPlayerProps {
  text: string;
  title: string;
  onClose: () => void;
}

const speeds = [0.75, 1, 1.25, 1.5, 2];

const cleanText = (t: string) =>
  t.replace(/[\u{1F600}-\u{1F9FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}]/gu, "").trim();

const TextToSpeechPlayer = ({ text, title, onClose }: TTSPlayerProps) => {
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(() => {
    const saved = localStorage.getItem("tts-speed");
    return saved ? Number(saved) : 1;
  });
  const [progress, setProgress] = useState(0);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const cleaned = cleanText(text);

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
    utter.onend = () => { setPlaying(false); setPaused(false); setProgress(100); };
    utterRef.current = utter;
    window.speechSynthesis.speak(utter);
    setPlaying(true);
    setPaused(false);

    // Estimate progress
    const estimatedDuration = (cleaned.split(/\s+/).length / (150 * speed)) * 60 * 1000;
    const start = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.min(100, (elapsed / estimatedDuration) * 100));
    }, 200);
  }, [cleaned, speed, stop]);

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
        className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-elevated p-3 lg:bottom-0"
      >
        <div className="container mx-auto max-w-2xl flex items-center gap-3">
          <Volume2 className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{title}</p>
            <div className="w-full bg-secondary rounded-full h-1.5 mt-1.5">
              <div className="bg-primary h-1.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
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
export const ListenButton = ({ onClick }: { onClick: () => void }) => (
  <button
    onClick={onClick}
    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
  >
    <Volume2 className="w-3.5 h-3.5" /> Listen
  </button>
);
