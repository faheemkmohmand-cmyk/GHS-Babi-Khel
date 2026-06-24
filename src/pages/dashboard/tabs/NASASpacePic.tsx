// src/pages/dashboard/tabs/NASASpacePic.tsx
import { useState, useEffect } from "react";

const NASA_API_KEY = "I7E0FR0gL0Lvt9cnxh5jsRSvAzWlJVzeYFZRQTKy";
const CACHE_KEY_PREFIX = "nasa_apod_";

interface APODData {
  title: string;
  explanation: string;
  url: string;
  hdurl?: string;
  media_type: "image" | "video";
  date: string;
  copyright?: string;
}

// ── Cache helpers ──────────────────────────────────────────────────
// Cache is keyed by date (e.g. "nasa_apod_2026-06-06") so each day's
// picture is stored separately. Old entries are automatically ignored
// because the key won't match today's date.
function getCached(date: string): APODData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + date);
    if (!raw) return null;
    return JSON.parse(raw) as APODData;
  } catch {
    return null;
  }
}

function setCache(date: string, data: APODData): void {
  try {
    // Clean up any old APOD cache entries to avoid filling localStorage
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(CACHE_KEY_PREFIX) && key !== CACHE_KEY_PREFIX + date) {
        localStorage.removeItem(key);
      }
    }
    localStorage.setItem(CACHE_KEY_PREFIX + date, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable — silently skip caching
  }
}

// Route apod.nasa.gov image URLs through our proxy to avoid "refused to connect".
// Other hosts (e.g. Wikipedia mirrors) are served directly.
function proxyImageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "apod.nasa.gov") {
      return `/api/nasa-image?url=${encodeURIComponent(url)}`;
    }
  } catch {
    // not a valid URL — return as-is
  }
  return url;
}

export default function NASASpacePic() {
  const todayStr = new Date().toISOString().split("T")[0];

  const [apod, setApod] = useState<APODData | null>(() => getCached(todayStr));
  const [loading, setLoading] = useState<boolean>(() => getCached(todayStr) === null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const fetchAPOD = async (date: string, force = false) => {
    // If we already have a valid cache for this date, skip the network call
    // unless the user explicitly hit Retry (force=true)
    const cached = getCached(date);
    if (cached && !force) {
      setApod(cached);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setImgLoaded(false);
    try {
      // Use our serverless proxy instead of calling NASA API directly.
      // The proxy handles 503 errors, caching, and fallback images.
      const url = `/api/nasa-apod?date=${date}`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (res.status === 429) throw new Error("NASA rate limit reached. Try again later.");
        if (res.status === 400) throw new Error("No NASA image available for this date.");
        throw new Error(`NASA API error (${res.status}): ${body.slice(0, 120)}`);
      }
      const data: APODData = await res.json();
      setCache(date, data);
      setApod(data);
    } catch (e: any) {
      setError(e.message || "Failed to load NASA Picture of the Day.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAPOD(selectedDate);
  }, [selectedDate]);

  const formattedDate = apod
    ? new Date(apod.date + "T00:00:00").toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  const shortExplanation = apod
    ? apod.explanation.slice(0, 280) + (apod.explanation.length > 280 ? "…" : "")
    : "";

  const goToPrevDay = () => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const goToNextDay = () => {
    const today = new Date().toISOString().split("T")[0];
    if (selectedDate >= today) return;
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const isToday = selectedDate === new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-heading font-bold text-foreground flex items-center gap-2">
            🌌 NASA Space Picture of the Day
          </h3>
          <p className="text-xs text-muted-foreground">
            Astronomy Picture of the Day · Powered by NASA API
          </p>
        </div>
        {!isToday && (
          <button
            onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])}
            className="text-[11px] font-bold bg-primary/10 text-primary px-3 py-1.5 rounded-full hover:bg-primary/20 transition-colors"
          >
            Today ↩
          </button>
        )}
      </div>

      {/* Date navigation */}
      <div className="flex items-center gap-2 bg-secondary rounded-xl p-2">
        <button
          onClick={goToPrevDay}
          className="p-2 rounded-lg hover:bg-card text-muted-foreground hover:text-foreground transition-colors text-lg font-bold"
          title="Previous day"
        >
          ‹
        </button>
        <input
          type="date"
          value={selectedDate}
          max={new Date().toISOString().split("T")[0]}
          min="1995-06-16"
          onChange={(e) => setSelectedDate(e.target.value)}
          className="flex-1 text-xs text-center bg-transparent outline-none font-mono text-foreground"
        />
        <button
          onClick={goToNextDay}
          disabled={isToday}
          className="p-2 rounded-lg hover:bg-card text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 text-lg font-bold"
          title="Next day"
        >
          ›
        </button>
      </div>

      {loading && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="h-64 sm:h-80 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center">
            <div className="text-center">
              <div className="text-5xl mb-3 animate-pulse">🔭</div>
              <p className="text-white/60 text-sm">Fetching from NASA…</p>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div className="h-5 bg-secondary rounded-lg w-3/4 animate-pulse" />
            <div className="h-3 bg-secondary rounded w-full animate-pulse" />
            <div className="h-3 bg-secondary rounded w-5/6 animate-pulse" />
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6 text-center">
          <p className="text-3xl mb-2">🛑</p>
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={() => fetchAPOD(selectedDate, true)}
            className="mt-3 text-xs bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {apod && !loading && !error && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          {/* Image / Video */}
          {apod.media_type === "image" ? (
            <div className="relative bg-slate-950" style={{ minHeight: 220 }}>
              {!imgLoaded && (
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center">
                  <div className="text-5xl animate-pulse">🌌</div>
                </div>
              )}
              <img
                src={proxyImageUrl(apod.url)}
                alt={apod.title}
                onLoad={() => setImgLoaded(true)}
                onError={() => setImgLoaded(true)}
                className={`w-full object-cover transition-opacity duration-700 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
                style={{ maxHeight: 420 }}
              />
              {imgLoaded && apod.hdurl && (
                <a
                  href={apod.hdurl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute bottom-3 right-3 text-[10px] bg-black/60 text-white px-2.5 py-1 rounded-full backdrop-blur-sm hover:bg-black/80 transition-colors"
                >
                  🔍 Full HD
                </a>
              )}
            </div>
          ) : (
            <div className="relative bg-slate-950 aspect-video">
              <iframe
                src={apod.url}
                title={apod.title}
                className="w-full h-full"
                allow="autoplay; encrypted-media"
                allowFullScreen
              />
            </div>
          )}

          {/* Content */}
          <div className="p-4 space-y-3">
            <div>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <h4 className="font-bold text-base text-foreground leading-snug flex-1">{apod.title}</h4>
                {apod.media_type === "video" && (
                  <span className="text-[10px] bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-0.5 rounded-full font-bold shrink-0">
                    📹 VIDEO
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{formattedDate}</p>
              {apod.copyright && (
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">© {apod.copyright}</p>
              )}
            </div>

            <div className="text-xs text-muted-foreground leading-relaxed">
              <p>{expanded ? apod.explanation : shortExplanation}</p>
              {apod.explanation.length > 280 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="mt-1.5 text-primary font-semibold hover:underline"
                >
                  {expanded ? "Show less ▲" : "Read more ▼"}
                </button>
              )}
            </div>

            <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-xl p-3">
              <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold">
                🚀 This image comes from {apod.media_type === "video" ? "space" : "another corner of the universe"}. Science class just got real! 🌟
              </p>
            </div>

            <p className="text-[10px] text-muted-foreground/50 text-center">
              Powered by NASA Astronomy Picture of the Day API · nasa.gov
            </p>
          </div>
        </div>
      )}
    </div>
  );
      }


      
