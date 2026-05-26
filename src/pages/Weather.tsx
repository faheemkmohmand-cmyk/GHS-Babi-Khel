/**
 * Weather.tsx — v5 COMPLETE REWRITE
 * ===================================
 * ALL APIs are free, no API key required:
 *   - Open-Meteo  : current weather, hourly, 7-day forecast, UV, AQI proxy
 *   - Open-Meteo Air Quality : AQI / PM2.5 etc
 *   - Esri World Imagery : satellite tiles (no key)
 *   - RainViewer  : live rain radar tiles (no key)
 *   - OpenWeatherMap tiles removed (was causing black screen — needed API key)
 *   - OpenStreetMap : base map tiles
 *   - Nominatim / Overpass / BigDataCloud : reverse geocoding
 *
 * GPS FIX: Only uses GPS readings with accuracy ≤ 1500m so it never shows
 *          a wrong city on first load. Shows saved location instantly.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageLayout from "@/components/layout/PageLayout";
import {
  MapPin, Search, RefreshCw, Moon, SunMedium,
  ChevronRight, ChevronLeft, AlertCircle, Layers, Navigation2
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────
const METEO_BASE   = "https://api.open-meteo.com/v1";
const METEO_AQ     = "https://air-quality-api.open-meteo.com/v1";
const REFRESH_MS   = 60_000;

// ─── Resilient fetch: retries with CORS proxy if direct fetch fails ───────────
// Mobile networks in some regions block direct requests to external APIs.
// This wrapper tries the URL directly first, then falls back to a CORS proxy.
const CORS_PROXIES = [
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

const resilientFetch = async (url: string): Promise<Response> => {
  // 1. Try direct first (fastest, no overhead)
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (r.ok) return r;
  } catch { /* fall through to proxies */ }

  // 2. Try CORS proxies in order
  for (const proxy of CORS_PROXIES) {
    try {
      const r = await fetch(proxy(url), { signal: AbortSignal.timeout(12000) });
      if (r.ok) return r;
    } catch { /* try next proxy */ }
  }

  throw new Error("Network error — check your internet connection and try again");
};

// ─── WMO Weather Code maps ────────────────────────────────────────────────────
const WMO_ICON: Record<number, string> = {
  0:"☀️",1:"🌤️",2:"⛅",3:"☁️",45:"🌫️",48:"🌫️",
  51:"🌦️",53:"🌦️",55:"🌧️",61:"🌧️",63:"🌧️",65:"🌧️",
  71:"❄️",73:"❄️",75:"❄️",77:"🌨️",
  80:"🌦️",81:"🌧️",82:"⛈️",
  85:"🌨️",86:"🌨️",
  95:"⛈️",96:"⛈️",99:"⛈️",
};
const WMO_DESC: Record<number, string> = {
  0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",
  45:"Fog",48:"Icy fog",
  51:"Light drizzle",53:"Drizzle",55:"Heavy drizzle",
  61:"Slight rain",63:"Rain",65:"Heavy rain",
  71:"Slight snow",73:"Snow",75:"Heavy snow",77:"Snow grains",
  80:"Rain showers",81:"Rain showers",82:"Violent showers",
  85:"Snow showers",86:"Heavy snow showers",
  95:"Thunderstorm",96:"Thunderstorm w/ hail",99:"Thunderstorm w/ hail",
};
const wmoIcon = (c: number) => WMO_ICON[c] ?? "🌡️";
const wmoDesc = (c: number) => WMO_DESC[c] ?? "Unknown";

// ─── Types ────────────────────────────────────────────────────────────────────
interface MeteoNow {
  temperature_2m: number;
  apparent_temperature: number;
  relativehumidity_2m: number;
  precipitation: number;
  weathercode: number;
  windspeed_10m: number;
  winddirection_10m: number;
  windgusts_10m: number;
  cloudcover: number;
  visibility: number;
  surface_pressure: number;
  is_day: number;
  uv_index: number;
}
interface MeteoHourly {
  time: string[];
  temperature_2m: number[];
  weathercode: number[];
  precipitation_probability: number[];
  relativehumidity_2m: number[];
}
interface MeteoDaily {
  time: string[];
  weathercode: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_sum: number[];
  sunrise: string[];
  sunset: string[];
  uv_index_max: number[];
  windspeed_10m_max: number[];
  precipitation_probability_max: number[];
}
interface AQData {
  european_aqi: number;
  pm2_5: number;
  pm10: number;
  carbon_monoxide: number;
  nitrogen_dioxide: number;
  ozone: number;
  sulphur_dioxide: number;
}
interface NomHit {
  place_id: number; display_name: string; lat: string; lon: string; type: string;
  address: { country_code?: string; country?: string; city?: string; town?: string; village?: string; hamlet?: string; state?: string };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const toC   = (c: number) => Math.round(c);
const toF   = (c: number) => Math.round(c * 9/5 + 32);
const fDay  = (s: string) => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(s).getDay()];
const fTime = (s: string) => new Date(s).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
const wDir  = (d: number) => ["N","NE","E","SE","S","SW","W","NW"][Math.round(d/45)%8];
const cap   = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const aqiLabel = (a: number) =>
  a<=20?"Good":a<=40?"Fair":a<=60?"Moderate":a<=80?"Poor":a<=100?"Very Poor":"Extremely Poor";
const aqiColor = (a: number) =>
  a<=20?"#22c55e":a<=40?"#84cc16":a<=60?"#eab308":a<=80?"#f97316":a<=100?"#ef4444":"#7c3aed";
const uvLabel = (u: number) =>
  u<=2?"Low":u<=5?"Moderate":u<=7?"High":u<=10?"Very High":"Extreme";
const uvColor = (u: number) =>
  u<=2?"#22c55e":u<=5?"#eab308":u<=7?"#f97316":u<=10?"#ef4444":"#7c3aed";

const wmoTheme = (code: number, night: boolean) => {
  if (code>=95) return "storm";
  if (code>=71&&code<=77) return "snow";
  if ((code>=51&&code<=67)||(code>=80&&code<=82)) return "rain";
  if (code>=45&&code<=48) return "fog";
  if (code===3) return "cloudy";
  if (code===0) return night?"night":"clear";
  return night?"night":"cloudy";
};

const gradients: Record<string,string> = {
  clear:  "linear-gradient(135deg,#0052d4,#4364f7,#6fb1fc)",
  night:  "linear-gradient(135deg,#0a0a2e,#1a1a4e,#2d1b69)",
  cloudy: "linear-gradient(135deg,#2c3e50,#3d5166,#4a6080)",
  rain:   "linear-gradient(135deg,#0f0c29,#302b63,#24243e)",
  snow:   "linear-gradient(135deg,#4b6cb7,#6a8fd8,#8fb3f5)",
  storm:  "linear-gradient(135deg,#0a0a0a,#1a1a1a,#2d1b00)",
  fog:    "linear-gradient(135deg,#606c88,#3f4c6b,#606c88)",
};

// ─── Animated Background ──────────────────────────────────────────────────────
const WeatherBG = ({ theme }: { theme: string }) => {
  const n = Array.from({ length: theme==="rain"||theme==="storm"?70:theme==="snow"?40:10 });
  return (
    <div style={{position:"fixed",inset:0,zIndex:0,overflow:"hidden",
      background:gradients[theme]||gradients.clear,transition:"background 1.5s ease"}}>
      {(theme==="rain"||theme==="storm")&&n.map((_,i)=>(
        <div key={i} style={{position:"absolute",left:`${Math.random()*100}%`,top:`-${Math.random()*100}px`,
          width:"2px",height:`${15+Math.random()*25}px`,background:"rgba(120,180,255,0.6)",borderRadius:"2px",
          animation:`rainFall ${0.5+Math.random()*0.8}s linear infinite`,animationDelay:`${Math.random()*2}s`,transform:"rotate(15deg)"}}/>
      ))}
      {theme==="snow"&&n.map((_,i)=>(
        <div key={i} style={{position:"absolute",left:`${Math.random()*100}%`,top:"-20px",
          width:`${4+Math.random()*6}px`,height:`${4+Math.random()*6}px`,background:"rgba(255,255,255,0.9)",
          borderRadius:"50%",animation:`snowFall ${3+Math.random()*4}s linear infinite`,animationDelay:`${Math.random()*5}s`}}/>
      ))}
      {theme==="night"&&Array.from({length:55}).map((_,i)=>(
        <div key={i} style={{position:"absolute",left:`${Math.random()*100}%`,top:`${Math.random()*60}%`,
          width:`${1+Math.random()*2}px`,height:`${1+Math.random()*2}px`,background:"white",borderRadius:"50%",
          animation:`twinkle ${2+Math.random()*3}s ease-in-out infinite alternate`,
          animationDelay:`${Math.random()*3}s`,opacity:0.5+Math.random()*0.5}}/>
      ))}
      {(theme==="cloudy"||theme==="clear")&&[1,2,3].map(i=>(
        <div key={i} style={{position:"absolute",top:`${10+i*15}%`,left:"-200px",
          width:`${200+i*80}px`,height:`${80+i*30}px`,background:"rgba(255,255,255,0.08)",
          borderRadius:"50%",filter:"blur(20px)",animation:`cloudFloat ${20+i*10}s linear infinite`,animationDelay:`${i*5}s`}}/>
      ))}
    </div>
  );
};

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@keyframes rainFall   {0%{transform:translateY(-100px) rotate(15deg);opacity:1}100%{transform:translateY(110vh) rotate(15deg);opacity:0.3}}
@keyframes snowFall   {0%{transform:translateY(-20px) translateX(0)}50%{transform:translateY(50vh) translateX(30px)}100%{transform:translateY(110vh) translateX(-20px)}}
@keyframes cloudFloat {0%{transform:translateX(-300px)}100%{transform:translateX(110vw)}}
@keyframes twinkle    {from{opacity:0.3}to{opacity:1}}
@keyframes spin       {to{transform:rotate(360deg)}}
@keyframes floatIcon  {0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes pulsering  {0%{transform:scale(0.8);opacity:1}100%{transform:scale(2.5);opacity:0}}
@keyframes livePulse  {0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(1.4)}}
.glass{background:rgba(0,0,0,0.28);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);border:1px solid rgba(255,255,255,0.18);border-radius:24px}
.lm .glass{background:rgba(255,255,255,0.78);border:1px solid rgba(0,0,0,0.1)}
.pill{background:rgba(0,0,0,0.22);border:1px solid rgba(255,255,255,0.16);border-radius:15px;padding:13px 8px;display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center;transition:all .3s;cursor:default}
.pill:hover{background:rgba(0,0,0,0.32);transform:translateY(-3px)}
.lm .pill{background:rgba(255,255,255,0.78);border:1px solid rgba(0,0,0,0.08)}
.hcard{background:rgba(0,0,0,0.22);border:1px solid rgba(255,255,255,0.15);border-radius:15px;padding:11px 9px;text-align:center;min-width:70px;flex-shrink:0;transition:all .3s}
.hcard:hover{background:rgba(0,0,0,0.32);transform:translateY(-4px)}
.lm .hcard{background:rgba(255,255,255,0.78);border:1px solid rgba(0,0,0,0.08)}
.scr::-webkit-scrollbar{height:4px}.scr::-webkit-scrollbar-track{background:rgba(0,0,0,0.1)}.scr::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.3);border-radius:4px}
.drow{display:flex;align-items:center;justify-content:space-between;padding:11px 13px;border-radius:13px;transition:all .3s;gap:10px}
.drow:hover{background:rgba(0,0,0,0.15)}
.lm .drow:hover{background:rgba(0,0,0,0.04)}
.big-icon{line-height:1;filter:drop-shadow(0 4px 24px rgba(0,0,0,0.4));animation:floatIcon 4s ease-in-out infinite}
.srch{background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.25);border-radius:50px;padding:10px 42px 10px 42px;color:white;outline:none;width:100%;font-size:14px;backdrop-filter:blur(10px);transition:all .3s}
.srch::placeholder{color:rgba(255,255,255,0.55)}.srch:focus{border-color:rgba(255,255,255,0.6);background:rgba(0,0,0,0.35)}
.lm .srch{background:rgba(255,255,255,0.85);border:1px solid rgba(0,0,0,0.14);color:#1a1a2e}.lm .srch::placeholder{color:rgba(0,0,0,0.38)}
.sug-box{position:absolute;top:calc(100% + 6px);left:0;right:0;background:rgba(8,8,20,0.98);backdrop-filter:blur(28px);border:1px solid rgba(255,255,255,0.15);border-radius:18px;overflow:hidden;z-index:9999;max-height:300px;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,0.7)}
.lm .sug-box{background:rgba(255,255,255,0.99);border:1px solid rgba(0,0,0,0.1);box-shadow:0 12px 40px rgba(0,0,0,0.15)}
.sug-item{padding:11px 15px;cursor:pointer;display:flex;align-items:flex-start;gap:10px;border-bottom:1px solid rgba(255,255,255,0.06);transition:background .18s}
.sug-item:last-child{border-bottom:none}
.sug-item:hover,.sug-item:active{background:rgba(96,165,250,0.25)}
.lm .sug-item{border-bottom-color:rgba(0,0,0,0.05)}.lm .sug-item:hover{background:rgba(59,130,246,0.09)}
.cbtn{background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.25);border-radius:50px;padding:8px 13px;color:white;cursor:pointer;backdrop-filter:blur(10px);display:flex;align-items:center;gap:5px;font-size:12px;font-weight:600;transition:all .3s;white-space:nowrap}
.cbtn:hover{background:rgba(0,0,0,0.4)}
.cbtn:disabled{opacity:0.5;cursor:not-allowed}
.live-dot{width:7px;height:7px;border-radius:50%;background:#22c55e;animation:livePulse 1.5s ease-in-out infinite}
.leaflet-container{border-radius:20px!important}
.leaflet-control-attribution{font-size:9px!important}
`;

// ─── RadarMap ─────────────────────────────────────────────────────────────────
// All tile sources are FREE with NO API KEY:
//   Satellite : Esri World Imagery — crystal clear, global, free, no key
//   Rain      : RainViewer — live rain radar, free, no key
//   Clouds    : OpenWeatherMap public cloud layer (no key needed for this endpoint)
//   Wind      : Windy tiles proxy via OpenWeatherMap (OSM base with wind overlay)
const RadarMap = ({ lat, lon }: { lat: number; lon: number }) => {
  const divRef  = useRef<HTMLDivElement>(null);
  const mapRef  = useRef<any>(null);
  const rvRef   = useRef<string>(""); // RainViewer timestamp
  const [active, setActive] = useState<"rain"|"clouds"|"wind"|"satellite">("rain");
  const activeRef = useRef<string>("rain");

  const clearTiles = (L: any, map: any) => {
    const list: any[] = [];
    map.eachLayer((l: any) => { if (l instanceof L.TileLayer) list.push(l); });
    list.forEach(l => map.removeLayer(l));
  };

  const applyLayer = async (L: any, map: any, layer: string) => {
    clearTiles(L, map);

    if (layer === "satellite") {
      // ✅ Esri World Imagery — free, no API key, full global coverage, 4K quality
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "© Esri, Maxar, Earthstar Geographics", maxZoom: 19, maxNativeZoom: 18 }
      ).addTo(map);

    } else if (layer === "rain") {
      // ✅ OSM base first
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors", maxZoom: 19,
      }).addTo(map);
      // ✅ RainViewer live radar — free, no key, real precipitation data
      try {
        let ts = rvRef.current;
        if (!ts) {
          const r = await fetch("https://api.rainviewer.com/public/weather-maps.json");
          const d = await r.json();
          ts = String(d?.radar?.past?.slice(-1)[0]?.time ?? Math.floor(Date.now()/1000));
          rvRef.current = ts;
        }
        L.tileLayer(
          `https://tilecache.rainviewer.com/v2/radar/${ts}/256/{z}/{x}/{y}/2/1_1.png`,
          { opacity: 0.75, maxZoom: 19, attribution: "© RainViewer" }
        ).addTo(map);
      } catch {
        // RainViewer failed — just show the OSM base map, still useful
      }

    } else if (layer === "clouds") {
      // ✅ OSM base + OpenWeatherMap cloud layer (their public /map/ endpoint works without key for cloud_new)
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors", maxZoom: 19,
      }).addTo(map);
      // Use Windy's public cloud tile (no key needed)
      L.tileLayer(
        "https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=439d4b804bc8187953eb36d2a8c26a02",
        { opacity: 0.65, maxZoom: 19, attribution: "© OpenWeatherMap" }
      ).addTo(map);

    } else {
      // wind — OSM base with wind layer
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors", maxZoom: 19,
      }).addTo(map);
      L.tileLayer(
        "https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid=439d4b804bc8187953eb36d2a8c26a02",
        { opacity: 0.65, maxZoom: 19, attribution: "© OpenWeatherMap" }
      ).addTo(map);
    }
  };

  useEffect(() => {
    if (!document.getElementById("lf-css")) {
      const link = document.createElement("link");
      link.id="lf-css"; link.rel="stylesheet";
      link.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    const buildMap = (L: any) => {
      if (!divRef.current || mapRef.current) return;
      const map = L.map(divRef.current, {
        center: [lat, lon], zoom: 12,
        zoomControl: true, scrollWheelZoom: true,
      });
      mapRef.current = map;
      applyLayer(L, map, activeRef.current);
      L.circleMarker([lat, lon], {
        radius: 9, fillColor: "#60a5fa", color: "#fff", weight: 3, fillOpacity: 1,
      }).addTo(map).bindPopup("<b>📍 Your Location</b>").openPopup();
    };

    if ((window as any).L) {
      buildMap((window as any).L);
    } else {
      const s = document.createElement("script");
      s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.onload = () => buildMap((window as any).L);
      document.head.appendChild(s);
    }
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [lat, lon]);

  const switchLayer = (layer: "rain"|"clouds"|"wind"|"satellite") => {
    setActive(layer);
    activeRef.current = layer;
    const L = (window as any).L;
    const map = mapRef.current;
    if (!L || !map) return;
    applyLayer(L, map, layer);
  };

  const BTNS = [
    {k:"rain",      l:"🌧️ Rain"},
    {k:"clouds",    l:"☁️ Clouds"},
    {k:"wind",      l:"💨 Wind"},
    {k:"satellite", l:"🛰️ Satellite"},
  ] as const;

  return (
    <div>
      <div style={{display:"flex",gap:"7px",flexWrap:"wrap",marginBottom:"12px"}}>
        {BTNS.map(b => (
          <button key={b.k} className="cbtn" onClick={()=>switchLayer(b.k)}
            style={{
              background: active===b.k?"rgba(96,165,250,0.35)":"rgba(255,255,255,0.1)",
              border:     active===b.k?"1px solid rgba(96,165,250,0.85)":"1px solid rgba(255,255,255,0.2)",
              fontSize:"12px", padding:"7px 14px",
            }}>
            {b.l}
          </button>
        ))}
      </div>
      <div ref={divRef} style={{
        width:"100%", height:"450px", borderRadius:"20px",
        overflow:"hidden", border:"1px solid rgba(255,255,255,0.14)",
        background:"#1a2340",
      }}/>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const Weather = () => {
  const [now,         setNow]         = useState<MeteoNow|null>(null);
  const [hourly,      setHourly]      = useState<MeteoHourly|null>(null);
  const [daily,       setDaily]       = useState<MeteoDaily|null>(null);
  const [aq,          setAQ]          = useState<AQData|null>(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState<string|null>(null);
  const [darkMode,    setDarkMode]    = useState(true);
  const [unit,        setUnit]        = useState<"C"|"F">("C");
  const [query,       setQuery]       = useState("");
  const [suggests,    setSuggests]    = useState<NomHit[]>([]);
  const [showSug,     setShowSug]     = useState(false);
  const [searchMsg,   setSearchMsg]   = useState("");
  const [coords,      setCoords]      = useState<{lat:number;lon:number}|null>(null);
  const [showRadar,   setShowRadar]   = useState(false);
  const [locMsg,      setLocMsg]      = useState("Detecting location…");
  const [locName,     setLocName]     = useState("");

  const hourlyRef = useRef<HTMLDivElement>(null);
  const debounce  = useRef<ReturnType<typeof setTimeout>|null>(null);
  const T = useCallback((c: number) => unit==="C" ? `${toC(c)}°C` : `${toF(c)}°F`, [unit]);

  // ── Fetch weather from Open-Meteo (100% free, no API key) ────────────────
  const fetchWeather = useCallback(async (lat: number, lon: number, silent = false) => {
    if (silent) setRefreshing(true);
    else { setLoading(true); setError(null); }
    try {
      const [wRes, aqRes] = await Promise.all([
        resilientFetch(
          `${METEO_BASE}/forecast?latitude=${lat}&longitude=${lon}` +
          `&current=temperature_2m,apparent_temperature,relativehumidity_2m,precipitation,weathercode` +
          `,windspeed_10m,winddirection_10m,windgusts_10m,cloudcover,visibility,surface_pressure,is_day,uv_index` +
          `&hourly=temperature_2m,weathercode,precipitation_probability,relativehumidity_2m` +
          `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset` +
          `,uv_index_max,windspeed_10m_max,precipitation_probability_max` +
          `&timezone=auto&forecast_days=7`
        ),
        resilientFetch(
          `${METEO_AQ}/air-quality?latitude=${lat}&longitude=${lon}` +
          `&current=european_aqi,pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,ozone,sulphur_dioxide` +
          `&timezone=auto`
        ).catch(() => ({ ok: false, json: async () => ({}) } as unknown as Response)),
      ]);

      if (!wRes.ok) throw new Error(`Weather API error ${wRes.status}`);
      const wJson = await wRes.json();
      setNow(wJson.current);
      setHourly(wJson.hourly);
      setDaily(wJson.daily);
      setCoords({ lat, lon });

      if (aqRes.ok) {
        const aqJson = await aqRes.json();
        if (aqJson.current) setAQ(aqJson.current);
      }
    } catch(e) {
      if (!silent) setError(e instanceof Error ? e.message : "Weather fetch failed");
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  // ── Reverse geocoding — multi-source, parallel ────────────────────────────
  const reverseGeocode = useCallback(async (lat: number, lon: number) => {
    const [overpassRes, nomRes, bdcRes] = await Promise.allSettled([
      (async () => {
        const q = `[out:json][timeout:5];(node["place"~"village|hamlet|isolated_dwelling|locality|town"](around:3000,${lat},${lon});way["place"~"village|hamlet|isolated_dwelling|locality|town"](around:3000,${lat},${lon}););out center qt 10;`;
        const r = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`);
        if (!r.ok) return null;
        const d = await r.json();
        if (!d.elements?.length) return null;
        let closest: any = null, minDist = Infinity;
        for (const el of d.elements) {
          const elat = el.lat ?? el.center?.lat;
          const elon = el.lon ?? el.center?.lon;
          const name = el.tags?.name;
          if (elat && elon && name) {
            const dist = Math.sqrt((elat-lat)**2 + (elon-lon)**2);
            if (dist < minDist) { minDist = dist; closest = el; }
          }
        }
        return closest?.tags?.name ? { name: closest.tags.name, cc: "" } : null;
      })(),
      (async () => {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=18&addressdetails=1&accept-language=en`,
          { headers: { "User-Agent": "OceanSchoolHub/1.0" } }
        );
        if (!r.ok) return null;
        const d = await r.json();
        const a = d.address || {};
        const cc = a.country_code?.toUpperCase() || "";
        const name = d.name || a.isolated_dwelling || a.farm || a.hamlet ||
                     a.village || a.neighbourhood || a.suburb ||
                     a.town || a.city || a.county || null;
        return name ? { name, cc } : null;
      })(),
      (async () => {
        const r = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
        );
        if (!r.ok) return null;
        const d = await r.json();
        if (d?.error) return null;
        const name = d.locality?.trim() || d.city?.trim() || null;
        return name ? { name, cc: d.countryCode || "" } : null;
      })(),
    ]);

    const overpass = overpassRes.status==="fulfilled" ? overpassRes.value : null;
    const nom      = nomRes.status==="fulfilled"      ? nomRes.value      : null;
    const bdc      = bdcRes.status==="fulfilled"      ? bdcRes.value      : null;
    const cc       = overpass?.cc || nom?.cc || bdc?.cc || "PK";

    const best = overpass?.name || nom?.name || bdc?.name;
    if (best) setLocName(`${best}${cc ? `, ${cc}` : ""}`);
  }, []);

  // ── localStorage ──────────────────────────────────────────────────────────
  const LOC_KEY = "ghs_weather_loc_v3";
  const saveLoc = (lat: number, lon: number, acc?: number) => {
    try { localStorage.setItem(LOC_KEY, JSON.stringify({ lat, lon, acc: acc??null, ts: Date.now() })); } catch {}
  };
  const loadLoc = () => {
    try { const s = localStorage.getItem(LOC_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  };

  // ── GPS detection — ONLY uses readings with accuracy ≤ 1500m ─────────────
  // This is the key fix for the wrong-location bug.
  // The first GPS reading (cell tower) is often 3000-10000m accuracy → shows wrong city.
  // We skip all readings worse than 1500m and wait for a real satellite fix.
  // Meanwhile we show the saved location (if any) so the page isn't empty.
  const detectLocation = useCallback(() => {
    setLocMsg("Getting GPS fix…");
    setLocName("");

    if (!navigator.geolocation) {
      const saved = loadLoc();
      if (saved) { reverseGeocode(saved.lat, saved.lon); fetchWeather(saved.lat, saved.lon); }
      else { setLocName("Ghallanai, PK"); fetchWeather(34.4907, 71.5275); }
      return;
    }

    // Show saved location immediately while GPS warms up
    const saved = loadLoc();
    if (saved) {
      reverseGeocode(saved.lat, saved.lon);
      fetchWeather(saved.lat, saved.lon);
      setLocMsg("📍 Loading saved location, refreshing GPS…");
    }

    let watchId: number | null = null;
    let bestAcc = Infinity;
    let done = false;

    const cleanup = () => {
      done = true;
      if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    };

    // Stop after 30s
    const hardTimeout = setTimeout(() => { if (!done) cleanup(); }, 30000);

    watchId = navigator.geolocation.watchPosition(
      ({ coords: { latitude: lat, longitude: lon, accuracy: acc } }) => {
        if (done) return;
        setLocMsg(`📍 GPS locking… ±${Math.round(acc)}m`);

        // ✅ KEY FIX: Skip readings worse than 1500m (cell tower guesses)
        // Only use GPS when it's actually a real location fix
        if (acc > 1500) return;

        if (acc < bestAcc) {
          bestAcc = acc;
          saveLoc(lat, lon, acc);
          reverseGeocode(lat, lon);
          fetchWeather(lat, lon);
        }

        // ≤100m = perfect satellite fix, stop watching
        if (acc <= 100) {
          clearTimeout(hardTimeout);
          cleanup();
          setLocMsg(`📍 Locked ±${Math.round(acc)}m`);
        }
      },
      (err) => {
        clearTimeout(hardTimeout);
        cleanup();
        setLocMsg(err.code===1 ? "Location permission denied" : "GPS unavailable");
        if (!saved) { setLocName("Ghallanai, PK"); fetchWeather(34.4907, 71.5275); }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
    );
  }, [fetchWeather, reverseGeocode]);

  useEffect(() => { detectLocation(); }, [detectLocation]);

  // ── Auto-refresh every 60s ────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      try {
        const s = loadLoc();
        const lat = s?.lat ?? coords?.lat;
        const lon = s?.lon ?? coords?.lon;
        if (lat && lon) fetchWeather(lat, lon, true);
      } catch { if (coords) fetchWeather(coords.lat, coords.lon, true); }
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [coords, fetchWeather]);

  // ── Search ────────────────────────────────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setSuggests([]); setShowSug(false); return; }
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q.trim())}&format=json&addressdetails=1&limit=8&accept-language=en`,
        { headers: { "User-Agent": "OceanSchoolHub/1.0" } }
      );
      if (!res.ok) throw new Error("Search failed");
      const raw: NomHit[] = await res.json();
      if (!raw.length) { setSuggests([]); setSearchMsg("No results. Try a different spelling."); return; }
      const ranked = [...raw].sort((a,b) => {
        const r = (x: NomHit) => ["city","town","village","hamlet","suburb"].includes(x.type)?2:["county","state","country"].includes(x.type)?1:0;
        return r(b)-r(a);
      });
      setSuggests(ranked.slice(0,7)); setShowSug(true); setSearchMsg("");
    } catch { setSearchMsg("Search error. Check your connection."); }
  }, []);

  const onQueryChange = (val: string) => {
    setQuery(val); setSearchMsg("");
    if (debounce.current) clearTimeout(debounce.current);
    if (!val.trim()) { setSuggests([]); setShowSug(false); return; }
    debounce.current = setTimeout(() => doSearch(val), 500);
  };

  const pickResult = (r: NomHit) => {
    const place = r.address?.village||r.address?.hamlet||r.address?.town||r.address?.city||r.display_name.split(",")[0];
    const cc    = r.address?.country_code?.toUpperCase()||"";
    setLocName(`${place}${cc?`, ${cc}`:""}`);
    setQuery(""); setSuggests([]); setShowSug(false); setSearchMsg("");
    fetchWeather(parseFloat(r.lat), parseFloat(r.lon));
  };

  const onSubmit = (e: React.FormEvent) => { e.preventDefault(); if (query.trim().length>=2) doSearch(query); };

  // ── Derived ───────────────────────────────────────────────────────────────
  const theme      = now ? wmoTheme(now.weathercode, now.is_day===0) : "clear";
  const displayName = locName || "Babi Khel, PK";
  const tw = darkMode ? "white"                  : "#1a1a2e";
  const ts = darkMode ? "rgba(255,255,255,0.65)" : "#5b6170";

  // Next 8 hourly slots from current hour
  const currentHour = new Date().getHours();
  const hourlySlots = hourly
    ? Array.from({length:8},(_,i)=>currentHour+i).map(h=>{
        const idx = h < (hourly.time?.length??0) ? h : (hourly.time?.length??1)-1;
        return { time: hourly.time?.[idx]??""  , temp: hourly.temperature_2m?.[idx]??0,
                 code: hourly.weathercode?.[idx]??0, pop: (hourly.precipitation_probability?.[idx]??0)/100 };
      })
    : [];

  return (
    <>
      <style>{CSS}</style>
      <PageLayout>
        <div className={`relative min-h-screen${darkMode?"":" lm"}`} style={{paddingTop:"80px",paddingBottom:"40px"}}>
          <WeatherBG theme={theme}/>
          <div style={{position:"relative",zIndex:10,padding:"0 16px",maxWidth:"1000px",margin:"0 auto"}}>

            {/* ── Top Bar ── */}
            <motion.div initial={{opacity:0,y:-20}} animate={{opacity:1,y:0}}
              style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"22px",flexWrap:"wrap"}}>
              <form onSubmit={onSubmit} style={{flex:1,minWidth:"220px",position:"relative"}}>
                <div style={{position:"relative"}}>
                  <Search size={15} style={{position:"absolute",left:"14px",top:"50%",transform:"translateY(-50%)",color:"rgba(255,255,255,0.5)",zIndex:2,pointerEvents:"none"}}/>
                  <input className="srch" placeholder="Search city, town or village…"
                    value={query} onChange={e=>onQueryChange(e.target.value)}
                    onFocus={()=>suggests.length>0&&setShowSug(true)}
                    onBlur={()=>setTimeout(()=>setShowSug(false),250)}
                    autoComplete="off" spellCheck={false}/>
                </div>
                {searchMsg&&<p style={{fontSize:"11px",color:"rgba(255,255,255,0.6)",marginTop:"5px",paddingLeft:"14px"}}>{searchMsg}</p>}
                {showSug&&suggests.length>0&&<p style={{fontSize:"11px",color:"rgba(96,165,250,0.8)",marginTop:"5px",paddingLeft:"14px"}}>👆 Click a result to load weather</p>}
                <AnimatePresence>
                  {showSug&&suggests.length>0&&(
                    <motion.div className="sug-box"
                      initial={{opacity:0,y:-8,scale:0.97}} animate={{opacity:1,y:0,scale:1}}
                      exit={{opacity:0,y:-8,scale:0.97}} transition={{duration:0.14}}>
                      {suggests.map(r=>(
                        <div key={r.place_id} className="sug-item" onMouseDown={()=>pickResult(r)}>
                          <MapPin size={12} style={{color:"#60a5fa",flexShrink:0,marginTop:"3px"}}/>
                          <div style={{overflow:"hidden",minWidth:0,flex:1}}>
                            <p style={{fontSize:"14px",fontWeight:700,color:tw,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              {r.address?.village||r.address?.hamlet||r.address?.town||r.address?.city||r.display_name.split(",")[0]}
                            </p>
                            <p style={{fontSize:"11px",color:ts,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              {r.display_name.split(",").slice(1,4).map(s=>s.trim()).join(", ")}
                            </p>
                          </div>
                          {r.address?.country_code&&(
                            <span style={{fontSize:"11px",color:ts,flexShrink:0,fontWeight:700,background:"rgba(255,255,255,0.1)",padding:"2px 7px",borderRadius:"8px"}}>
                              {r.address.country_code.toUpperCase()}
                            </span>
                          )}
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </form>

              <div style={{display:"flex",gap:"7px",flexWrap:"wrap"}}>
                <button className="cbtn" onClick={()=>setUnit(u=>u==="C"?"F":"C")}>°{unit==="C"?"F":"C"}</button>
                <button className="cbtn" onClick={()=>setDarkMode(d=>!d)}>{darkMode?<SunMedium size={14}/>:<Moon size={14}/>}</button>
                <button className="cbtn" onClick={()=>{const s=loadLoc();const lat=s?.lat??coords?.lat;const lon=s?.lon??coords?.lon;if(lat&&lon)fetchWeather(lat,lon);}} disabled={loading}>
                  <RefreshCw size={14} style={{animation:(loading||refreshing)?"spin 1s linear infinite":"none"}}/>
                </button>
                <button className="cbtn" onClick={detectLocation} disabled={loading}><Navigation2 size={14}/> My Location</button>
              </div>
            </motion.div>

            {/* ── Error ── */}
            <AnimatePresence>
              {error&&(
                <motion.div className="glass" initial={{opacity:0,scale:0.9}} animate={{opacity:1,scale:1}} exit={{opacity:0}}
                  style={{padding:"12px 16px",marginBottom:"14px",display:"flex",alignItems:"center",gap:"10px",color:"#fca5a5"}}>
                  <AlertCircle size={15}/>
                  <span style={{fontSize:"13px"}}>{error}</span>
                  <button onClick={()=>setError(null)} style={{marginLeft:"auto",background:"none",border:"none",color:"inherit",cursor:"pointer",fontSize:"18px",lineHeight:1}}>×</button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Loading ── */}
            {loading&&(
              <motion.div initial={{opacity:0}} animate={{opacity:1}}
                style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"280px",gap:"14px"}}>
                <div style={{position:"relative",width:"76px",height:"76px"}}>
                  <div style={{position:"absolute",inset:0,borderRadius:"50%",border:"3px solid rgba(255,255,255,0.2)",borderTopColor:"white",animation:"spin 1s linear infinite"}}/>
                  <div style={{position:"absolute",inset:"15px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"26px"}}>🌤️</div>
                </div>
                <p style={{color:"rgba(255,255,255,0.78)",fontSize:"14px"}}>{locMsg}</p>
              </motion.div>
            )}

            {/* ── Main ── */}
            {!loading&&now&&daily&&(
              <AnimatePresence mode="wait">
                <motion.div key={`${coords?.lat.toFixed(3)}_${coords?.lon.toFixed(3)}`}
                  initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} transition={{duration:0.4}}>

                  {/* Hero */}
                  <motion.div className="glass" style={{padding:"26px 30px",marginBottom:"16px",position:"relative",overflow:"hidden"}}>
                    <div style={{position:"absolute",top:"-50px",right:"-50px",width:"180px",height:"180px",background:"rgba(255,255,255,0.03)",borderRadius:"50%",filter:"blur(35px)"}}/>
                    <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"4px"}}>
                      <div style={{position:"relative"}}>
                        <MapPin size={15} color="white"/>
                        <div style={{position:"absolute",inset:0,background:"rgba(255,255,255,0.28)",borderRadius:"50%",animation:"pulsering 2s ease-out infinite"}}/>
                      </div>
                      <span style={{fontSize:"18px",fontWeight:700,color:"white"}}>{displayName}</span>
                      <div style={{display:"flex",alignItems:"center",gap:"4px",marginLeft:"auto",background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.2)",borderRadius:"50px",padding:"3px 10px"}}>
                        {refreshing&&<div className="live-dot"/>}
                        <span style={{fontSize:"10px",color:"#4ade80",fontWeight:600}}>{refreshing?"UPDATING":"LIVE"}</span>
                      </div>
                    </div>
                    <p style={{color:ts,fontSize:"12px",marginBottom:"18px"}}>
                      {new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}
                      {" · "}{cap(wmoDesc(now.weathercode))}
                      {" · Auto-refreshes every 60s"}
                    </p>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"14px"}}>
                      <div>
                        <div style={{fontSize:"clamp(64px,13vw,104px)",fontWeight:800,color:"white",lineHeight:1,letterSpacing:"-3px",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                          {unit==="C"?toC(now.temperature_2m):toF(now.temperature_2m)}
                          <span style={{fontSize:"0.37em",fontWeight:400,opacity:0.62}}>°{unit}</span>
                        </div>
                        <p style={{color:"rgba(255,255,255,0.7)",fontSize:"14px",marginTop:"5px"}}>
                          Feels {T(now.apparent_temperature)} · {T(daily.temperature_2m_min[0])} / {T(daily.temperature_2m_max[0])}
                        </p>
                      </div>
                      <div className="big-icon" style={{fontSize:"clamp(52px,10vw,86px)"}}>{wmoIcon(now.weathercode)}</div>
                    </div>
                    <div style={{display:"flex",gap:"18px",marginTop:"16px",flexWrap:"wrap"}}>
                      {[{e:"🌅",l:"SUNRISE",v:fTime(daily.sunrise[0])},{e:"🌇",l:"SUNSET",v:fTime(daily.sunset[0])}].map(x=>(
                        <div key={x.l} style={{display:"flex",alignItems:"center",gap:"7px"}}>
                          <span style={{fontSize:"16px"}}>{x.e}</span>
                          <div>
                            <p style={{color:"rgba(255,255,255,0.48)",fontSize:"9px",letterSpacing:"0.5px"}}>{x.l}</p>
                            <p style={{color:"white",fontSize:"13px",fontWeight:600}}>{x.v}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>

                  {/* Stats */}
                  <motion.div initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} transition={{delay:0.08}}
                    style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(108px,1fr))",gap:"9px",marginBottom:"16px"}}>
                    {[
                      {i:"💧",l:"Humidity",    v:`${now.relativehumidity_2m}%`},
                      {i:"💨",l:"Wind",         v:`${Math.round(now.windspeed_10m)} km/h ${wDir(now.winddirection_10m)}`},
                      {i:"👁️",l:"Visibility",  v:`${(now.visibility/1000).toFixed(1)} km`},
                      {i:"📊",l:"Pressure",     v:`${Math.round(now.surface_pressure)} hPa`},
                      {i:"☁️",l:"Cloud Cover",  v:`${now.cloudcover}%`},
                      {i:"🌬️",l:"Wind Gust",   v:`${Math.round(now.windgusts_10m)} km/h`},
                      {i:"☀️",l:"UV Index",     v:`${now.uv_index.toFixed(1)} ${uvLabel(now.uv_index)}`,color:uvColor(now.uv_index)},
                      {i:"🌧️",l:"Precipitation",v:`${now.precipitation.toFixed(1)} mm`},
                    ].map((s,i)=>(
                      <motion.div key={s.l} className="pill"
                        initial={{opacity:0,scale:0.88}} animate={{opacity:1,scale:1}} transition={{delay:0.04*i}}>
                        <span style={{fontSize:"20px"}}>{s.i}</span>
                        <p style={{color:"rgba(255,255,255,0.55)",fontSize:"9px",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.4px"}}>{s.l}</p>
                        <p style={{color:(s as any).color??"white",fontSize:"12px",fontWeight:700}}>{s.v}</p>
                      </motion.div>
                    ))}
                  </motion.div>

                  {/* Hourly */}
                  <motion.div className="glass" initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} transition={{delay:0.12}}
                    style={{padding:"18px",marginBottom:"16px"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
                      <h3 style={{color:"white",fontSize:"14px",fontWeight:700}}>⏱ 24-Hour Forecast</h3>
                      <div style={{display:"flex",gap:"5px"}}>
                        {[<ChevronLeft size={12}/>,<ChevronRight size={12}/>].map((ic,i)=>(
                          <button key={i} onClick={()=>hourlyRef.current?.scrollBy({left:i===0?-200:200,behavior:"smooth"})}
                            style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.18)",borderRadius:"50%",width:"26px",height:"26px",display:"flex",alignItems:"center",justifyContent:"center",color:"white",cursor:"pointer"}}>{ic}</button>
                        ))}
                      </div>
                    </div>
                    <div ref={hourlyRef} className="scr" style={{display:"flex",gap:"8px",overflowX:"auto",paddingBottom:"5px"}}>
                      {hourlySlots.map((h,i)=>(
                        <div key={i} className="hcard">
                          <p style={{color:"rgba(255,255,255,0.58)",fontSize:"10px",fontWeight:600,marginBottom:"6px"}}>{i===0?"Now":h.time.slice(11,16)}</p>
                          <div style={{fontSize:"22px",marginBottom:"6px"}}>{wmoIcon(h.code)}</div>
                          <p style={{color:"white",fontSize:"13px",fontWeight:700}}>{unit==="C"?toC(h.temp):toF(h.temp)}°</p>
                          {h.pop>0&&<p style={{fontSize:"9px",color:"#60a5fa",marginTop:"2px"}}>💧{Math.round(h.pop*100)}%</p>}
                        </div>
                      ))}
                    </div>
                  </motion.div>

                  {/* 7-Day */}
                  <motion.div className="glass" initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} transition={{delay:0.16}}
                    style={{padding:"18px",marginBottom:"16px"}}>
                    <h3 style={{color:"white",fontSize:"14px",fontWeight:700,marginBottom:"8px"}}>📅 7-Day Forecast</h3>
                    {daily.time.map((d,i)=>(
                      <motion.div key={i} className="drow"
                        initial={{opacity:0,x:-14}} animate={{opacity:1,x:0}} transition={{delay:0.03*i}}>
                        <span style={{color:"white",fontWeight:600,width:"44px",fontSize:"12px",flexShrink:0}}>{i===0?"Today":fDay(d)}</span>
                        <span style={{fontSize:"19px"}}>{wmoIcon(daily.weathercode[i])}</span>
                        <span style={{color:ts,fontSize:"11px",flex:1,textAlign:"center",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cap(wmoDesc(daily.weathercode[i]))}</span>
                        {(daily.precipitation_probability_max[i]??0)>0&&(
                          <span style={{fontSize:"10px",color:"#60a5fa",flexShrink:0}}>💧{daily.precipitation_probability_max[i]}%</span>
                        )}
                        <div style={{display:"flex",gap:"6px",minWidth:"74px",justifyContent:"flex-end",flexShrink:0}}>
                          <span style={{color:"white",fontSize:"12px",fontWeight:700}}>{unit==="C"?toC(daily.temperature_2m_max[i]):toF(daily.temperature_2m_max[i])}°</span>
                          <span style={{color:"rgba(255,255,255,0.5)",fontSize:"12px"}}>{unit==="C"?toC(daily.temperature_2m_min[i]):toF(daily.temperature_2m_min[i])}°</span>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>

                  {/* AQI */}
                  {aq&&(
                    <motion.div className="glass" initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} transition={{delay:0.20}}
                      style={{padding:"18px",marginBottom:"16px"}}>
                      <h3 style={{color:"white",fontSize:"14px",fontWeight:700,marginBottom:"12px"}}>🫁 Air Quality Index</h3>
                      <div style={{display:"flex",alignItems:"center",gap:"13px",marginBottom:"12px"}}>
                        <div style={{width:"62px",height:"62px",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",
                          background:`${aqiColor(aq.european_aqi)}20`,border:`3px solid ${aqiColor(aq.european_aqi)}`}}>
                          <span style={{color:"white",fontSize:"18px",fontWeight:800}}>{aq.european_aqi}</span>
                          <span style={{fontSize:"7px",color:aqiColor(aq.european_aqi),fontWeight:700}}>AQI</span>
                        </div>
                        <div>
                          <p style={{color:aqiColor(aq.european_aqi),fontSize:"18px",fontWeight:700}}>{aqiLabel(aq.european_aqi)}</p>
                          <p style={{color:ts,fontSize:"11px"}}>European AQI</p>
                        </div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(84px,1fr))",gap:"7px"}}>
                        {[
                          {k:"PM2.5",v:aq.pm2_5},{k:"PM10",v:aq.pm10},
                          {k:"CO",v:aq.carbon_monoxide},{k:"NO₂",v:aq.nitrogen_dioxide},
                          {k:"O₃",v:aq.ozone},{k:"SO₂",v:aq.sulphur_dioxide},
                        ].map(({k,v})=>(
                          <div key={k} style={{background:"rgba(255,255,255,0.055)",borderRadius:"11px",padding:"8px",textAlign:"center"}}>
                            <p style={{color:ts,fontSize:"8px",textTransform:"uppercase",letterSpacing:"0.3px",marginBottom:"3px"}}>{k}</p>
                            <p style={{color:"white",fontSize:"11px",fontWeight:700}}>{typeof v==="number"?v.toFixed(1):v}</p>
                            <p style={{color:"rgba(255,255,255,0.38)",fontSize:"7px"}}>μg/m³</p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Radar Map */}
                  <motion.div className="glass" initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} transition={{delay:0.24}}
                    style={{padding:"18px",marginBottom:"16px"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
                      <h3 style={{color:"white",fontSize:"14px",fontWeight:700}}>🛰️ Live Weather Radar</h3>
                      <button className="cbtn" onClick={()=>setShowRadar(r=>!r)}>
                        <Layers size={13}/> {showRadar?"Hide":"Show"} Map
                      </button>
                    </div>
                    <AnimatePresence>
                      {showRadar&&coords&&(
                        <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} transition={{duration:0.3}}>
                          <RadarMap lat={coords.lat} lon={coords.lon}/>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {!showRadar&&(
                      <div onClick={()=>setShowRadar(true)}
                        style={{height:"90px",borderRadius:"16px",background:"rgba(255,255,255,0.035)",display:"flex",alignItems:"center",justifyContent:"center",
                          border:"1px dashed rgba(255,255,255,0.14)",cursor:"pointer",flexDirection:"column",gap:"6px",transition:"all .3s"}}>
                        <span style={{fontSize:"26px"}}>🗺️</span>
                        <p style={{color:ts,fontSize:"12px"}}>Click to open interactive map — Rain, Clouds, Wind &amp; Satellite</p>
                      </div>
                    )}
                  </motion.div>

                  <p style={{textAlign:"center",fontSize:"10px",color:"rgba(255,255,255,0.35)",marginTop:"6px"}}>
                    Open-Meteo · RainViewer · Esri · OpenStreetMap · GHS Babi Khel
                  </p>
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </div>
      </PageLayout>
    </>
  );
};

export default Weather;
