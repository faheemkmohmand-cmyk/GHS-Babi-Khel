/**
 * WeatherWidget.tsx — Compact dashboard weather card
 * FIX: Multi-service reverse geocoding for exact village name
 *  - BigDataCloud primary (best village-level data for Pakistan)
 *  - Nominatim fallback with zoom=18
 *  - watchPosition for real GPS satellite fix (like Google Maps)
 *  - localStorage persistence of best GPS fix
 *  - Auto-refresh every 60s
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { m } from "framer-motion";
import { Wind, Droplets, ArrowRight, MapPin } from "lucide-react";

// Open-Meteo: completely free, no API key required
// Docs: https://open-meteo.com/en/docs
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

// Resilient fetch: retries with CORS proxy if direct call fails (common on mobile networks)
const CORS_PROXIES = [
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

const resilientFetch = async (url: string): Promise<Response> => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (r.ok) return r;
  } catch { /* try proxies */ }
  for (const proxy of CORS_PROXIES) {
    try {
      const r = await fetch(proxy(url), { signal: AbortSignal.timeout(12000) });
      if (r.ok) return r;
    } catch { /* next */ }
  }
  throw new Error("Failed to fetch weather data");
};

// EMOJI map removed — using WMO codes via wmoGet() instead

// WMO code ranges: 0=clear, 1-3=cloudy, 45-48=fog, 51-67=rain/drizzle, 71-77=snow, 80-82=showers, 85-86=snow showers, 95-99=thunderstorm
const gradient = (wmo:number, night:boolean) => {
  if (wmo>=95)            return "linear-gradient(135deg,#1a1a2e,#2d3561)"; // thunderstorm
  if (wmo>=71&&wmo<=77)   return "linear-gradient(135deg,#c5dff8,#a3c4f0)"; // snow
  if (wmo>=51&&wmo<=67)   return "linear-gradient(135deg,#1e3a5f,#2d6a8c)"; // rain/drizzle
  if (wmo>=80&&wmo<=82)   return "linear-gradient(135deg,#1e3a5f,#2d6a8c)"; // showers
  if (wmo>=45&&wmo<=48)   return "linear-gradient(135deg,#b0bec5,#90a4ae)"; // fog
  if (wmo===3)            return "linear-gradient(135deg,#4a5568,#718096)";  // overcast
  if (wmo===0)            return night ? "linear-gradient(135deg,#0a0a2e,#1a1a4e)" : "linear-gradient(135deg,#1a6dff,#00d4ff)"; // clear
  return night ? "linear-gradient(135deg,#1a2a4a,#2d4a6a)" : "linear-gradient(135deg,#2d6a9f,#4a9fd4)"; // partly cloudy
};

// WMO Weather Code → { emoji, description }
const WMO: Record<number, { emoji: string; description: string }> = {
  0:  { emoji: "☀️", description: "Clear sky" },
  1:  { emoji: "🌤️", description: "Mainly clear" },
  2:  { emoji: "⛅", description: "Partly cloudy" },
  3:  { emoji: "☁️", description: "Overcast" },
  45: { emoji: "🌫️", description: "Foggy" },
  48: { emoji: "🌫️", description: "Icy fog" },
  51: { emoji: "🌦️", description: "Light drizzle" },
  53: { emoji: "🌦️", description: "Drizzle" },
  55: { emoji: "🌧️", description: "Heavy drizzle" },
  61: { emoji: "🌧️", description: "Slight rain" },
  63: { emoji: "🌧️", description: "Rain" },
  65: { emoji: "🌧️", description: "Heavy rain" },
  71: { emoji: "❄️", description: "Slight snow" },
  73: { emoji: "❄️", description: "Snow" },
  75: { emoji: "❄️", description: "Heavy snow" },
  80: { emoji: "🌦️", description: "Rain showers" },
  81: { emoji: "🌧️", description: "Rain showers" },
  82: { emoji: "⛈️", description: "Violent showers" },
  95: { emoji: "⛈️", description: "Thunderstorm" },
  99: { emoji: "⛈️", description: "Thunderstorm w/ hail" },
};
const wmoGet = (code: number) => WMO[code] ?? { emoji: "🌡️", description: "Unknown" };

interface WData {
  temp: number;
  humidity: number;
  windspeed: number;
  weathercode: number;
  is_day: number;
  // mapped fields for display compatibility
  description: string;
  emoji: string;
}

const WeatherWidget = () => {
  const [data,      setData]      = useState<WData|null>(null);
  const [locName,   setLocName]   = useState("");
  const [loading,   setLoading]   = useState(true);
  const coordsRef = useRef<{lat:number;lon:number}|null>(null);

  // ── Multi-source reverse geocode → exact village name (Google-level) ─────
  // PROBLEM: BigDataCloud & Nominatim return ADMIN BOUNDARY names (e.g. "Halimzai"
  // which is a Tehsil), not the actual nearest village ("Durba Khel", "Ghallanai").
  //
  // SOLUTION: Use Overpass API as PRIMARY source — it finds the CLOSEST named
  // settlement by distance (exactly what Google Maps does). Then fall back to
  // Nominatim (d.name = specific feature) and BigDataCloud (locality).
  // All 3 services run in parallel for speed.
  const reverseGeocode = useCallback(async (lat:number, lon:number) => {
    const setResult = (place: string, cc: string) => {
      if (place) setLocName(`${place}${cc ? `, ${cc}` : ""}`);
    };

    // ── Run all 3 services in parallel ──────────────────────────────────────
    const [overpassRes, nomRes, bdcRes] = await Promise.allSettled([

      // ── Service 1: Overpass API — nearest named settlement ──────────────
      // This is THE key to Google-level accuracy. Instead of returning the
      // administrative boundary name (like "Halimzai" Tehsil), it searches
      // for all named villages/hamlets within 3 km and picks the CLOSEST one
      // by distance. For rural Pakistan this correctly returns "Durba Khel"
      // or "Ghallanai" instead of the broader "Halimzai".
      (async (): Promise<{name:string;cc:string}|null> => {
        try {
          const q = `[out:json][timeout:5];(node["place"~"village|hamlet|isolated_dwelling|locality|town"](around:3000,${lat},${lon});way["place"~"village|hamlet|isolated_dwelling|locality|town"](around:3000,${lat},${lon}););out center qt 10;`;
          const r = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`);
          if (!r.ok) return null;
          const d = await r.json();
          if (!d.elements?.length) return null;

          // Find the closest named settlement to the user's coordinates
          let closest: any = null;
          let minDist = Infinity;
          for (const el of d.elements) {
            const elat = el.lat ?? el.center?.lat;
            const elon = el.lon ?? el.center?.lon;
            const name = el.tags?.name;
            if (elat && elon && name) {
              const dist = Math.sqrt((elat - lat) ** 2 + (elon - lon) ** 2);
              if (dist < minDist) { minDist = dist; closest = el; }
            }
          }
          if (closest?.tags?.name) {
            return { name: closest.tags.name, cc: "" };
          }
          return null;
        } catch { return null; }
      })(),

      // ── Service 2: Nominatim with zoom=18 ─────────────────────────────
      // Check d.name FIRST — it's the specific OSM feature name at these
      // exact coordinates, which often differs from address.village (the
      // broader admin boundary like "Halimzai" Tehsil).
      (async (): Promise<{name:string;cc:string}|null> => {
        try {
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=18&addressdetails=1&accept-language=en`,
            { headers:{ "User-Agent":"OceanSchoolHub/1.0" } }
          );
          if (!r.ok) return null;
          const d = await r.json();
          const a = d.address || {};
          const cc = a.country_code?.toUpperCase() || "";
          const name = d.name || a.isolated_dwelling || a.farm || a.hamlet ||
                       a.village || a.neighbourhood || a.suburb || a.quarter ||
                       a.city_district || a.town || a.city || a.municipality ||
                       a.county || null;
          return name ? { name, cc } : null;
        } catch { return null; }
      })(),

      // ── Service 3: BigDataCloud (locality-level) ──────────────────────
      (async (): Promise<{name:string;cc:string}|null> => {
        try {
          const r = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
            { headers: { "Accept": "application/json" } }
          );
          if (!r.ok) return null;
          const d = await r.json();
          if (d?.error) return null;
          const locality = d.locality?.trim();
          const city = d.city?.trim();
          const cc = d.countryCode || "";
          return { name: locality || city || null, cc };
        } catch { return null; }
      })(),
    ]);

    // ── Pick the best result ────────────────────────────────────────────────
    // Priority: Overpass (closest named place) > Nominatim (specific feature) > BigDataCloud (locality)
    const overpass = overpassRes.status === "fulfilled" ? overpassRes.value : null;
    const nom      = nomRes.status      === "fulfilled" ? nomRes.value      : null;
    const bdc      = bdcRes.status      === "fulfilled" ? bdcRes.value      : null;

    // Get best available country code
    const cc = overpass?.cc || nom?.cc || bdc?.cc || "PK";

    if (overpass?.name) {
      setResult(overpass.name, cc);
      return;
    }
    if (nom?.name) {
      setResult(nom.name, cc);
      return;
    }
    if (bdc?.name) {
      setResult(bdc.name, cc);
      return;
    }
    // All services failed — OWM city name will be used as fallback
  }, []);

  // ── Fetch OWM weather ─────────────────────────────────────────────────────
  const fetchW = useCallback(async (lat:number, lon:number) => {
    coordsRef.current = { lat, lon };
    try {
      const url = `${OPEN_METEO_URL}?latitude=${lat}&longitude=${lon}` +
        `&current_weather=true&hourly=relativehumidity_2m&timezone=auto&forecast_days=1`;
      const r = await resilientFetch(url);
      if (!r.ok) return;
      const json = await r.json();
      const cw = json.current_weather;
      const { emoji, description } = wmoGet(cw.weathercode);
      // humidity: pick the hourly value closest to current hour
      const currentHourIdx = new Date().getHours();
      const humidity = json.hourly?.relativehumidity_2m?.[currentHourIdx] ?? 0;
      setData({
        temp: Math.round(cw.temperature),
        humidity,
        windspeed: Math.round(cw.windspeed),
        weathercode: cw.weathercode,
        is_day: cw.is_day,
        description,
        emoji,
      });
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  // ── localStorage persistence ──────────────────────────────────────────────
  const LOC_KEY = "ghs_weather_loc_v2";
  const saveLoc = (lat: number, lon: number, acc?: number) => {
    try { localStorage.setItem(LOC_KEY, JSON.stringify({ lat, lon, acc: acc ?? null, ts: Date.now() })); } catch {}
  };
  const loadLoc = (): { lat: number; lon: number } | null => {
    try { const s = localStorage.getItem(LOC_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  };

  // ── IP chain fallback ──────────────────────────────────────────────────────
  const byIP = async () => {
    try {
      const r = await fetch("https://ipapi.co/json/");
      const d = await r.json();
      if (d.latitude && !d.error) {
        const lat = parseFloat(d.latitude), lon = parseFloat(d.longitude);
        reverseGeocode(lat, lon);
        saveLoc(lat, lon, 5000);
        return fetchW(lat, lon);
      }
    } catch {/*next*/}
    try {
      const r = await fetch("https://ipwho.is/");
      const d = await r.json();
      if (d.success && d.latitude) {
        reverseGeocode(d.latitude, d.longitude);
        saveLoc(d.latitude, d.longitude, 5000);
        return fetchW(d.latitude, d.longitude);
      }
    } catch {/*next*/}
    try {
      const r = await fetch("https://freeipapi.com/api/json");
      const d = await r.json();
      if (d.latitude) {
        reverseGeocode(d.latitude, d.longitude);
        saveLoc(d.latitude, d.longitude, 5000);
        return fetchW(d.latitude, d.longitude);
      }
    } catch {/*fallback*/}
    setLocName("Ghallanai, PK");
    fetchW(34.4907, 71.5275);
  };

  // ── Location detection — watchPosition for real GPS satellite fix ─────────
  // Same approach as Weather.tsx: use watchPosition instead of getCurrentPosition
  // to wait for a real satellite GPS fix instead of a coarse cell-tower estimate.
  useEffect(() => {
    if (!navigator.geolocation) {
      byIP();
      return;
    }

    // First try saved location for instant display
    const saved = loadLoc();
    if (saved) {
      reverseGeocode(saved.lat, saved.lon);
      fetchW(saved.lat, saved.lon);
    }

    let watchId: number | null = null;
    let bestAcc: number = saved?.lat ? Infinity : Infinity;
    let done = false;

    const cleanup = () => {
      done = true;
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
    };

    const hardTimeout = setTimeout(() => {
      if (!done) cleanup();
    }, 20000);

    watchId = navigator.geolocation.watchPosition(
      ({ coords: { latitude: lat, longitude: lon, accuracy: acc } }) => {
        if (done) return;

        if (acc < bestAcc) {
          bestAcc = acc;
          saveLoc(lat, lon, acc);
          reverseGeocode(lat, lon);
          fetchW(lat, lon);
        }

        // Good enough satellite fix — stop watching
        if (acc <= 100) {
          clearTimeout(hardTimeout);
          cleanup();
        }
      },
      () => {
        clearTimeout(hardTimeout);
        cleanup();
        // If no saved location and GPS failed, try IP
        if (!saved) byIP();
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );

    return () => {
      clearTimeout(hardTimeout);
      cleanup();
    };
  }, [fetchW, reverseGeocode]);

  // ── Auto-refresh every 60s ────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      if (coordsRef.current) fetchW(coordsRef.current.lat, coordsRef.current.lon);
    }, 60_000);
    return () => clearInterval(id);
  }, [fetchW]);

  if (loading) {
    return (
      <div className="rounded-2xl h-36 bg-muted/40 animate-pulse flex items-center justify-center">
        <span className="text-3xl">🌤️</span>
      </div>
    );
  }
  if (!data) return null;

  // Open-Meteo returns temp already in °C — no Kelvin conversion needed
  const tempC    = data.temp;
  const isNight  = data.is_day === 0;
  const bg       = gradient(data.weathercode, isNight);
  const emoji    = data.emoji;
  const windKmh  = data.windspeed; // already km/h from Open-Meteo
  const desc     = data.description;
  const nameDisp = locName || "Babi Khel, PK";

  return (
    <m.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:0.5}}
      style={{background:bg, borderRadius:"20px", overflow:"hidden", position:"relative", isolation:"isolate"}}
      className="shadow-lg">

      {/* Decorative glow */}
      <div style={{position:"absolute",top:"-30px",right:"-30px",width:"120px",height:"120px",
        background:"rgba(255,255,255,0.07)",borderRadius:"50%",filter:"blur(20px)"}}/>

      <div style={{padding:"20px",position:"relative",zIndex:1}}>
        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:"5px",marginBottom:"3px"}}>
              <MapPin size={11} color="rgba(255,255,255,0.7)"/>
              <span style={{color:"rgba(255,255,255,0.8)",fontSize:"11px",fontWeight:600,
                maxWidth:"160px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {nameDisp}
              </span>
              {/* live dot */}
              <span style={{width:"6px",height:"6px",borderRadius:"50%",background:"#4ade80",
                flexShrink:0, animation:"wPulse 1.5s ease-in-out infinite"}}/>
            </div>
            <div style={{display:"flex",alignItems:"baseline",gap:"4px"}}>
              <span style={{fontSize:"44px",fontWeight:800,color:"white",lineHeight:1,
                letterSpacing:"-2px",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                {tempC}°C
              </span>
            </div>
            <p style={{color:"rgba(255,255,255,0.75)",fontSize:"12px",marginTop:"3px"}}>{desc}</p>
          </div>
          <div style={{fontSize:"52px",lineHeight:1,filter:"drop-shadow(0 4px 12px rgba(0,0,0,0.3))",
            animation:"wFloat 3s ease-in-out infinite", willChange:"transform"}}>
            {emoji}
          </div>
        </div>

        {/* Stats row */}
        <div style={{display:"flex",gap:"14px",marginTop:"14px",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",gap:"12px"}}>
            <div style={{display:"flex",alignItems:"center",gap:"4px"}}>
              <Droplets size={12} color="rgba(255,255,255,0.7)"/>
              <span style={{color:"rgba(255,255,255,0.8)",fontSize:"11px"}}>{data.humidity}%</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:"4px"}}>
              <Wind size={12} color="rgba(255,255,255,0.7)"/>
              <span style={{color:"rgba(255,255,255,0.8)",fontSize:"11px"}}>{windKmh} km/h</span>
            </div>
          </div>
          <Link to="/weather" style={{display:"flex",alignItems:"center",gap:"4px",color:"white",
            fontSize:"11px",fontWeight:700,background:"rgba(255,255,255,0.18)",
            border:"1px solid rgba(255,255,255,0.25)",borderRadius:"50px",padding:"5px 11px",
            textDecoration:"none",transition:"all .3s"}}>
            Full Forecast <ArrowRight size={10}/>
          </Link>
        </div>
      </div>

      <style>{`
        @keyframes wFloat {0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes wPulse {0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(1.4)}}
      `}</style>
    </m.div>
  );
};

export default WeatherWidget;

        
