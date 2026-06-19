/**
 * CalendarSubscribe.tsx
 * Card explaining how to subscribe to the school .ics feed in
 * Google Calendar / iPhone Calendar. One-click copy of the URL.
 */
import { useState } from "react";
import { CalendarPlus, Copy, Check, Apple, Chrome, HelpCircle } from "lucide-react";

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-blue-700 text-xs font-bold hover:bg-white/90 transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied!" : label}
    </button>
  );
}

export default function CalendarSubscribe() {
  const [showHelp, setShowHelp] = useState(false);
  const [icsUrl, setIcsUrl] = useState("");

  // Set on mount (client-side only) to avoid SSR mismatch
  useState(() => {
    if (typeof window !== "undefined") {
      setIcsUrl(`${window.location.origin}/calendar.ics`);
    }
  });

  const googleCalendarUrl = icsUrl
    ? `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(icsUrl)}`
    : "";

  return (
    <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-5 text-white shadow-lg">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
          <CalendarPlus className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-base mb-0.5">Sync to Your Calendar</h3>
          <p className="text-xs text-white/80">
            Subscribe once — all future exams, holidays & events auto-appear in your calendar. Updates every 6 hours.
          </p>
        </div>
      </div>

      {/* Quick-add buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        {googleCalendarUrl && (
          <a
            href={googleCalendarUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-blue-700 text-xs font-bold hover:bg-white/90 transition-colors"
          >
            <Chrome className="w-3.5 h-3.5" /> Add to Google
          </a>
        )}
        {icsUrl && (
          <a
            href={icsUrl}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-colors"
          >
            <Apple className="w-3.5 h-3.5" /> Open in iPhone
          </a>
        )}
        {icsUrl && <CopyButton text={icsUrl} label="Copy .ics URL" />}
      </div>

      {/* URL display */}
      {icsUrl && (
        <div className="bg-black/20 rounded-lg p-2 flex items-center gap-2 mb-3">
          <code className="text-[11px] font-mono text-white/90 flex-1 min-w-0 truncate">{icsUrl}</code>
        </div>
      )}

      {/* Help toggle */}
      <button
        onClick={() => setShowHelp(!showHelp)}
        className="inline-flex items-center gap-1.5 text-xs text-white/80 hover:text-white"
      >
        <HelpCircle className="w-3.5 h-3.5" />
        {showHelp ? "Hide instructions" : "How to subscribe?"}
      </button>

      {showHelp && (
        <div className="mt-3 space-y-2 text-xs text-white/90">
          <div className="bg-white/10 rounded-lg p-3">
            <p className="font-semibold mb-1 flex items-center gap-1.5"><Chrome className="w-3.5 h-3.5" /> Google Calendar (web)</p>
            <ol className="list-decimal list-inside space-y-0.5 text-white/80">
              <li>Click "Add to Google" above — opens Google Calendar</li>
              <li>Click "Add" when prompted</li>
              <li>Done — events appear within 6 hours</li>
            </ol>
          </div>
          <div className="bg-white/10 rounded-lg p-3">
            <p className="font-semibold mb-1 flex items-center gap-1.5"><Apple className="w-3.5 h-3.5" /> iPhone / iPad</p>
            <ol className="list-decimal list-inside space-y-0.5 text-white/80">
              <li>Tap "Open in iPhone" above</li>
              <li>iOS prompts "Subscribe to calendar?" → tap Subscribe</li>
              <li>Settings → Calendar → Accounts → verify "GHS Babi Khel" is on</li>
            </ol>
          </div>
          <div className="bg-white/10 rounded-lg p-3">
            <p className="font-semibold mb-1">Manually (any calendar app)</p>
            <ol className="list-decimal list-inside space-y-0.5 text-white/80">
              <li>Copy the .ics URL above</li>
              <li>Open your calendar app's "Add calendar from URL" option</li>
              <li>Paste the URL and save</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
