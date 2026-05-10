/**
 * Weather.tsx — v4 FINAL
 * =======================
 * FIX 1 — SEARCH:     Nominatim with clean URL (removed invalid featuretype param).
 *                     onSubmit no longer auto-picks. User MUST click a dropdown result.
 *                     Location name is set directly from Nominatim result.
 * FIX 2 — LOCATION:   GPS accuracy check REMOVED. Trust GPS directly.
 *                     Nominatim REVERSE GEOCODE shows real village name (e.g. "Ghallanai")
 *                     instead of OWM's nearest city ("Tangi").
 * FIX 3 — SATELLITE:  Google Maps satellite tiles — instant, full colour, global coverage.
 *                     eachLayer() clears all tiles cleanly before switching.
 * FIX 4 — RADAR ZOOM: Initialised at zoom 14 (village/street level).
 * FIX 5 — REAL-TIME:  Silent auto-refresh every 60 seconds.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageLayout from "@/components/layout/PageLayout";
import {
  MapPin, Search, RefreshCw, Moon, SunMedium,
  ChevronRight, ChevronLeft, AlertCircle, Layers, Navigation2
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────
const OWM_KEY  = import.meta.env.VITE_OWM_KEY ?? "";
const OWM_BASE = "https://api.openweathermap.org/data/2.5";
const REFRESH_MS = 60_000; // live refresh every 60 s

// ─── Types ────────────────────────────────────────────────────────────────────
interface WMain { temp:number;feels_like:number;temp_min:number;temp_max:number;pressure:number;humidity:number; }
interface WDesc { id:number;main:string;description:string;icon:string; }
interface Wind  { speed:number;deg:number;gust?:number; }
interface Current {
  name:string; sys:{country:string;sunrise:number;sunset:number};
  main:WMain; weather:WDesc[]; wind:Wind;
  visibility:number; dt:number; timezone:number;
  coord:{lat:number;lon:number}; clouds:{all:number};
}
interface FItem { dt:number;main:WMain;weather:WDesc[];wind:Wind;pop:number;dt_txt:string; }
interface AQI   { list:Array<{main:{aqi:number};components:{co:number;no:number;no2:number;o3:number;so2:number;pm2_5:number;pm10:number;nh3:number}}>; }
interface NomHit { place_id:number;display_name:string;lat:string;lon:string;type:string;
  address:{country_code?:string;country?:string;city?:string;town?:string;village?:string;hamlet?:string;state?:string}; }

// ─── Helpers ─────────────────────────────────────────────────────────────────
const toC   = (k:number) => Math.round(k - 273.15);
const toF   = (k:number) => Math.round((k - 273.15) * 9/5 + 32);
const fDay  = (u:number) => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(u*1000).getDay()];
const wDir  = (d:number) => ["N","NE","E","SE","S","SW","W","NW"][Math.round(d/45)%8];
const fTime = (u:number) => new Date(u*1000).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
const cap   = (s:string) => s.replace(/\b\w/g, c=>c.toUpperCase());

const aqiInfo = (a:number) => [
  {label:"Good",color:"#22c55e"},{label:"Fair",color:"#84cc16"},
  {label:"Moderate",color:"#eab308"},{label:"Poor",color:"#f97316"},{label:"Very Poor",color:"#ef4444"},
][Math.min(a-1,4)];

const uvInfo = (u:number) =>
  u<=2?{label:"Low",c:"#22c55e"}:u<=5?{label:"Moderate",c:"#eab308"}:
  u<=7?{label:"High",c:"#f97316"}:u<=10?{label:"Very High",c:"#ef4444"}:{label:"Extreme",c:"#7c3aed"};

const bgTheme = (id:number, night:boolean) =>
  id>=200&&id<300?"storm":id>=300&&id<600?"rain":id>=600&&id<700?"snow":
  id>=700&&id<800?"fog":id===800?(night?"night":"clear"):"cloudy";

const E:Record<string,string> = {
  "01d":"☀️","01n":"🌙","02d":"⛅","02n":"☁️","03d":"☁️","03n":"☁️","04d":"☁️","04n":"☁️",
  "09d":"🌧️","09n":"🌧️","10d":"🌦️","10n":"🌧️","11d":"⛈️","11n":"⛈️","13d":"❄️","13n":"❄️","50d":"🌫️","50n":"🌫️",
};

// ─── Animated Background ──────────────────────────────────────────────────────
const WeatherBG = ({theme}:{theme:string}) => {
  const BG:Record<string,string> = {
    clear:"linear-gradient(135deg,#0052d4,#4364f7,#6fb1fc)",
    night:"linear-gradient(135deg,#0a0a2e,#1a1a4e,#2d1b69)",
    cloudy:"linear-gradient(135deg,#2c3e50,#3d5166,#4a6080)",
    rain:"linear-gradient(135deg,#0f0c29,#302b63,#24243e)",
    snow:"linear-gradient(135deg,#4b6cb7,#6a8fd8,#8fb3f5)",
    storm:"linear-gradient(135deg,#0a0a0a,#1a1a1a,#2d1b00)",
    fog:"linear-gradient(135deg,#606c88,#3f4c6b,#606c88)",
  };
  const n = Array.from({length: theme==="rain"||theme==="storm"?70:theme==="snow"?40:10});
  return (
    <div style={{position:"fixed",inset:0,zIndex:0,overflow:"hidden",
      background:BG[theme]||BG.clear, transition:"background 1.5s ease"}}>
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
@keyframes fadeInUp   {from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
/* Glass card — dark overlay so text is always readable on any bright background */
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
/* Suggestions */
.sug-box{position:absolute;top:calc(100% + 6px);left:0;right:0;background:rgba(8,8,20,0.98);backdrop-filter:blur(28px);border:1px solid rgba(255,255,255,0.15);border-radius:18px;overflow:hidden;z-index:9999;max-height:300px;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,0.7)}
.lm .sug-box{background:rgba(255,255,255,0.99);border:1px solid rgba(0,0,0,0.1);box-shadow:0 12px 40px rgba(0,0,0,0.15)}
.sug-item{padding:11px 15px;cursor:pointer;display:flex;align-items:flex-start;gap:10px;border-bottom:1px solid rgba(255,255,255,0.06);transition:background .18s}
.sug-item:last-child{border-bottom:none}
.sug-item:hover,.sug-item:active{background:rgba(96,165,250,0.25)}
.lm .sug-item{border-bottom-color:rgba(0,0,0,0.05)}.lm .sug-item:hover{background:rgba(59,130,246,0.09)}
.sug-hint{padding:14px 16px;text-align:center;color:rgba(255,255,255,0.45);font-size:12px}
.lm .sug-hint{color:rgba(0,0,0,0.4)}
/* Ctrl buttons */
.cbtn{background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.25);border-radius:50px;padding:8px 13px;color:white;cursor:pointer;backdrop-filter:blur(10px);display:flex;align-items:center;gap:5px;font-size:12px;font-weight:600;transition:all .3s;white-space:nowrap}
.cbtn:hover{background:rgba(0,0,0,0.4)}
.cbtn:disabled{opacity:0.5;cursor:not-allowed}
/* Live dot */
.live-dot{width:7px;height:7px;border-radius:50%;background:#22c55e;animation:livePulse 1.5s ease-in-out infinite}
@keyframes livePulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(1.4)}}
/* Leaflet */
.leaflet-container{border-radius:20px!important}
.leaflet-control-attribution{font-size:9px!important}
`;

// ─── RadarMap — Leaflet with clean layer switching ────────────────────────────
const OWM_TILES: Record<string,string> = {
  rain:   "precipitation_new",
  clouds: "clouds_new",
  wind:   "wind_new",
};

const RadarMap = ({ lat, lon }: { lat:number; lon:number }) => {
  const divRef   = useRef<HTMLDivElement>(null);
  const mapRef   = useRef<any>(null);
  const [active, setActive] = useState<"rain"|"clouds"|"wind"|"satellite">("rain");
  const activeRef = useRef<string>("rain"); // readable inside async callbacks

  // ── Remove every TileLayer from the map (not markers/circles) ────────────
  const clearTiles = (L:any, map:any) => {
    const list: any[] = [];
    map.eachLayer((l:any) => { if (l instanceof L.TileLayer) list.push(l); });
    list.forEach(l => map.removeLayer(l));
  };

  // ── Add base + optional overlay for a layer name ─────────────────────────
  const applyLayer = (L:any, map:any, layer:string) => {
    clearTiles(L, map);

    if (layer === "satellite") {
      // Google Maps Satellite — instant, full-colour, excellent Pakistan coverage
      L.tileLayer("https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
        subdomains: ["0","1","2","3"],
        attribution: "© Google Maps",
        maxZoom: 21,
        maxNativeZoom: 20,
      }).addTo(map);
    } else {
      // OSM base
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);
      // OWM weather overlay on top
      L.tileLayer(
        `https://tile.openweathermap.org/map/${OWM_TILES[layer]}/{z}/{x}/{y}.png?appid=${OWM_KEY}`,
        { opacity: 0.72, maxZoom: 19 }
      ).addTo(map);
    }
  };

  // ── Initialise Leaflet map ────────────────────────────────────────────────
  useEffect(() => {
    // Leaflet CSS
    if (!document.getElementById("lf-css")) {
      const link = document.createElement("link");
      link.id="lf-css"; link.rel="stylesheet";
      link.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    const buildMap = (L:any) => {
      if (!divRef.current || mapRef.current) return;

      const map = L.map(divRef.current, {
        center: [lat, lon],
        zoom: 14,             // ← village-level zoom
        zoomControl: true,
        scrollWheelZoom: true,
      });
      mapRef.current = map;

      // Apply whichever layer is currently active
      applyLayer(L, map, activeRef.current);

      // Precise location marker
      L.circleMarker([lat, lon], {
        radius: 9, fillColor: "#60a5fa", color: "#fff",
        weight: 3, fillOpacity: 1,
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

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, [lat, lon]); // rebuild when user location changes

  // ── Layer switch — called directly from button click ─────────────────────
  const switchLayer = (layer: "rain"|"clouds"|"wind"|"satellite") => {
    setActive(layer);
    activeRef.current = layer;
    const L = (window as any).L;
    const map = mapRef.current;
    if (!L || !map) return;
    applyLayer(L, map, layer);
  };

  const BTNS = [
    {k:"rain",      l:"🌧️ Rain"      },
    {k:"clouds",    l:"☁️ Clouds"    },
    {k:"wind",      l:"💨 Wind"      },
    {k:"satellite", l:"🛰️ Satellite" },
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
        background:"#0f0f1a",
      }}/>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const Weather = () => {
  const [current,      setCurrent]      = useState<Current|null>(null);
  const [forecast,     setForecast]     = useState<FItem[]>([]);
  const [aqi,          setAQI]          = useState<AQI|null>(null);
  const [uv,           setUV]           = useState<number|null>(null);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);  // silent bg refresh
  const [error,        setError]        = useState<string|null>(null);
  const [darkMode,     setDarkMode]     = useState(true);
  const [unit,         setUnit]         = useState<"C"|"F">("C");
  const [query,        setQuery]        = useState("");
  const [suggests,     setSuggests]     = useState<NomHit[]>([]);
  const [showSug,      setShowSug]      = useState(false);
  const [searchMsg,    setSearchMsg]    = useState<string>("");  // hint below search
  const [coords,       setCoords]       = useState<{lat:number;lon:number}|null>(null);
  const [showRadar,    setShowRadar]    = useState(false);
  const [locMsg,       setLocMsg]       = useState("Detecting location…");
  const [locationName, setLocationName] = useState<string>("");  // Nominatim reverse-geocode name

  const hourlyRef = useRef<HTMLDivElement>(null);
  const debounce  = useRef<ReturnType<typeof setTimeout>|null>(null);
  const T = useCallback((k:number)=>unit==="C"?`${toC(k)}°C`:`${toF(k)}°F`,[unit]);

  // ── Fetch all weather data for coordinates ────────────────────────────────
  const fetchWeather = useCallback(async (lat:number, lon:number, silent=false) => {
    if (silent) setRefreshing(true);
    else { setLoading(true); setError(null); }

    try {
      const [cR,fR,aR] = await Promise.all([
        fetch(`${OWM_BASE}/weather?lat=${lat}&lon=${lon}&appid=${OWM_KEY}`),
        fetch(`${OWM_BASE}/forecast?lat=${lat}&lon=${lon}&appid=${OWM_KEY}&cnt=56`),
        fetch(`${OWM_BASE}/air_pollution?lat=${lat}&lon=${lon}&appid=${OWM_KEY}`),
      ]);
      if (!cR.ok) throw new Error(`OWM API error ${cR.status} — check API key`);
      const [c,f,a] = await Promise.all([cR.json(), fR.json(), aR.json()]);
      setCurrent(c); setForecast(f.list||[]); setAQI(a); setCoords({lat,lon});

      try {
        const uR = await fetch(`${OWM_BASE}/uvi?lat=${lat}&lon=${lon}&appid=${OWM_KEY}`);
        if (uR.ok) setUV((await uR.json()).value);
      } catch { setUV(null); }
    } catch(e) {
      if (!silent) setError(e instanceof Error ? e.message : "Weather fetch failed");
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

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
      if (place) setLocationName(`${place}${cc ? `, ${cc}` : ""}`);
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
            // Also try to get country code from Nominatim later; use PK default
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
            { headers:{"User-Agent":"OceanSchoolHub/1.0"} }
          );
          if (!r.ok) return null;
          const d = await r.json();
          const a = d.address || {};
          const cc = a.country_code?.toUpperCase() || "";
          // d.name = specific feature at these coords (most precise)
          // address fields = broader admin boundaries (less precise)
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
    // All services failed — OWM city name will be used as fallback (displayName logic)
  }, []);

  // ── localStorage helpers — persist best GPS fix across sessions ──────────
  // Once the device gets a real satellite GPS fix, we save it.
  // Next visit / refresh uses saved location instantly instead of guessing.
  const LOC_KEY = "ghs_weather_loc_v2";
  const saveLoc = (lat: number, lon: number, acc?: number) => {
    try { localStorage.setItem(LOC_KEY, JSON.stringify({ lat, lon, acc: acc ?? null, ts: Date.now() })); } catch { /**/ }
  };
  const loadLoc = (): { lat: number; lon: number; acc?: number | null; ts?: number } | null => {
    try { const s = localStorage.getItem(LOC_KEY); return s ? JSON.parse(s) : null; }
    catch { return null; }
  };

  // ── detectLocation — uses watchPosition to wait for REAL GPS fix ──────────
  //
  // WHY watchPosition instead of getCurrentPosition:
  //   getCurrentPosition returns IMMEDIATELY with whatever the device has —
  //   usually a coarse cell-tower / WiFi position (accuracy ~1000-5000m).
  //   That's why it shows "Tangi" — it's the nearest cell tower cluster.
  //
  //   watchPosition keeps receiving positions. The FIRST one is the quick
  //   cell-tower guess. Over the next 5-15 seconds, the GPS chip locks onto
  //   satellites and accuracy improves from ~3000m → ~50m.
  //   We keep the BEST (most accurate) reading and save it to localStorage.
  //
  // Result: first load might briefly show Tangi, then updates to Ghallanai /
  //   Durba Khel as the satellite fix arrives. On every subsequent visit the
  //   saved accurate location is used immediately — no waiting.
  const detectLocation = useCallback(() => {
    setLocMsg("Getting GPS fix…");
    setLocationName("");

    // ── No geolocation API ──────────────────────────────────────────────────
    if (!navigator.geolocation) {
      const saved = loadLoc();
      if (saved) {
        setLocMsg("Using saved location");
        reverseGeocode(saved.lat, saved.lon);
        fetchWeather(saved.lat, saved.lon);
      } else {
        setLocationName("Ghallanai, PK");
        fetchWeather(34.4907, 71.5275);
      }
      return;
    }

    let watchId:    number | null = null;
    let bestAcc:    number        = Infinity;
    let gotAnyFix:  boolean       = false;
    let done:       boolean       = false;

    const cleanup = () => {
      done = true;
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
    };

    // Hard timeout — stop watching after 25 s regardless
    const hardTimeout = setTimeout(() => {
      if (done) return;
      cleanup();
      if (!gotAnyFix) {
        // No GPS at all — try saved location, then hardcoded default
        const saved = loadLoc();
        if (saved) {
          setLocMsg("Using saved location");
          reverseGeocode(saved.lat, saved.lon);
          fetchWeather(saved.lat, saved.lon);
        } else {
          setLocationName("Ghallanai, PK");
          fetchWeather(34.4907, 71.5275);
        }
      }
      // If we already got a fix, it was already displayed — do nothing extra
    }, 25000);

    watchId = navigator.geolocation.watchPosition(
      ({ coords: { latitude: lat, longitude: lon, accuracy: acc } }) => {
        if (done) return;

        setLocMsg(`📍 GPS locking… ±${Math.round(acc)}m`);

        // Always update if this is the most accurate reading we've seen
        if (acc < bestAcc) {
          bestAcc     = acc;
          gotAnyFix   = true;

          // Save to localStorage — next visit uses this immediately
          saveLoc(lat, lon, acc);

          // Update map + weather with the best position so far
          reverseGeocode(lat, lon);
          fetchWeather(lat, lon);
        }

        // ≤ 100 m = real satellite GPS fix — stop watching (very accurate for village level)
        if (acc <= 100) {
          clearTimeout(hardTimeout);
          cleanup();
          setLocMsg(`📍 Locked ±${Math.round(acc)}m`);
        }
      },
      (err) => {
        clearTimeout(hardTimeout);
        cleanup();
        if (err.code === 1) {
          // PERMISSION_DENIED — try saved location
          setLocMsg("Location permission denied");
        } else {
          setLocMsg("GPS unavailable");
        }
        const saved = loadLoc();
        if (saved) {
          setLocMsg("Using saved location");
          reverseGeocode(saved.lat, saved.lon);
          fetchWeather(saved.lat, saved.lon);
        } else {
          setLocationName("Ghallanai, PK");
          fetchWeather(34.4907, 71.5275);
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 25000 }
    );
  }, [fetchWeather, reverseGeocode]);

  // Run location detection once on mount — uses watchPosition internally
  useEffect(() => { detectLocation(); }, [detectLocation]);

  // ── Real-time auto-refresh every 60 seconds ─────────────────────────────
  // Always uses the best-ever saved GPS location, not the coords state
  // (which might be a fallback if location detection ran before GPS fix)
  useEffect(() => {
    const id = setInterval(() => {
      try {
        const s = localStorage.getItem("ghs_weather_loc_v2");
        const saved = s ? JSON.parse(s) : null;
        const lat = saved?.lat ?? coords?.lat;
        const lon = saved?.lon ?? coords?.lon;
        if (lat && lon) fetchWeather(lat, lon, true);
      } catch {
        if (coords) fetchWeather(coords.lat, coords.lon, true);
      }
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [coords, fetchWeather]);

  // ── Nominatim search — clean URL, no invalid params ───────────────────────
  // FIX: removed `featuretype=city,town,village` which is NOT a valid Nominatim param
  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setSuggests([]); setShowSug(false); return; }
    try {
      const url = `https://nominatim.openstreetmap.org/search`
        + `?q=${encodeURIComponent(q.trim())}`
        + `&format=json&addressdetails=1&limit=8&accept-language=en`;
      const res = await fetch(url, {
        headers: { "User-Agent": "OceanSchoolHub/1.0", "Accept-Language": "en" }
      });
      if (!res.ok) throw new Error("Search failed");
      const raw: NomHit[] = await res.json();

      if (raw.length === 0) {
        setSuggests([]);
        setSearchMsg("No results. Try a different spelling or add country name.");
        return;
      }

      // Rank: populated places (city/town/village) first
      const ranked = [...raw].sort((a, b) => {
        const rank = (r: NomHit) =>
          ["city","town","village","hamlet","suburb","municipality"].includes(r.type) ? 2 :
          ["county","state","country"].includes(r.type) ? 1 : 0;
        return rank(b) - rank(a);
      });

      setSuggests(ranked.slice(0, 7));
      setShowSug(true);
      setSearchMsg(""); // clear any previous message
    } catch {
      setSearchMsg("Search error. Check internet connection.");
    }
  }, []);

  // Debounced input change
  const onQueryChange = (val: string) => {
    setQuery(val);
    setSearchMsg("");
    if (debounce.current) clearTimeout(debounce.current);
    if (!val.trim()) { setSuggests([]); setShowSug(false); return; }
    // 500ms debounce — Nominatim rate-limit is 1 req/s
    debounce.current = setTimeout(() => doSearch(val), 500);
  };

  // Pick a result — set locationName directly from Nominatim
  const pickResult = (r: NomHit) => {
    const place = r.address?.village || r.address?.hamlet || r.address?.town || r.address?.city || r.display_name.split(",")[0];
    const cc    = r.address?.country_code?.toUpperCase() || "";
    setLocationName(`${place}${cc ? `, ${cc}` : ""}`);
    setQuery(""); setSuggests([]); setShowSug(false); setSearchMsg("");
    fetchWeather(parseFloat(r.lat), parseFloat(r.lon));
  };

  // FIX: onSubmit no longer auto-picks suggests[0].
  // It just triggers the search and shows results. User must click a result.
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length >= 2) {
      doSearch(query);
    }
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const isNight  = current ? (current.dt < current.sys.sunrise || current.dt > current.sys.sunset) : false;
  const theme    = current ? bgTheme(current.weather[0].id, isNight) : "clear";
  const daily7   = forecast.filter((_,i) => i%8 === 0).slice(0, 7);
  const hourly8  = forecast.slice(0, 8);
  const tw       = darkMode ? "white"                   : "#1a1a2e";
  const ts       = darkMode ? "rgba(255,255,255,0.65)"  : "#5b6170";

  // Display name: prefer Nominatim reverse geocode, fallback to OWM city name
  const displayName = locationName || (current ? `${current.name}, ${current.sys.country}` : "");

  const subName = (r: NomHit) =>
    r.display_name.split(",").slice(1, 4).map(s => s.trim()).join(", ");

  return (
    <>
      <style>{CSS}</style>
      <PageLayout>
        <div className={`relative min-h-screen${darkMode ? "" : " lm"}`}
          style={{ paddingTop:"80px", paddingBottom:"40px" }}>

          <WeatherBG theme={theme} />

          <div style={{ position:"relative", zIndex:10, padding:"0 16px", maxWidth:"1000px", margin:"0 auto" }}>

            {/* ── Top Bar ── */}
            <motion.div initial={{opacity:0,y:-20}} animate={{opacity:1,y:0}}
              style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"22px",flexWrap:"wrap"}}>

              {/* Search */}
              <form onSubmit={onSubmit} style={{flex:1,minWidth:"220px",position:"relative"}}>
                <div style={{position:"relative"}}>
                  <Search size={15} style={{position:"absolute",left:"14px",top:"50%",transform:"translateY(-50%)",color:"rgba(255,255,255,0.5)",zIndex:2,pointerEvents:"none"}}/>
                  <input
                    className="srch"
                    placeholder="Type city, town or village to search…"
                    value={query}
                    onChange={e => onQueryChange(e.target.value)}
                    onFocus={() => suggests.length > 0 && setShowSug(true)}
                    onBlur={() => setTimeout(() => setShowSug(false), 250)}
                    autoComplete="off" spellCheck={false}
                  />
                  {/* Spinning loader inside search while debounce fires */}
                  {query.length >= 2 && !showSug && !suggests.length && (
                    <div style={{position:"absolute",right:"14px",top:"50%",transform:"translateY(-50%)",
                      width:"14px",height:"14px",borderRadius:"50%",
                      border:"2px solid rgba(255,255,255,0.2)",borderTopColor:"rgba(255,255,255,0.7)",
                      animation:"spin 0.8s linear infinite"}}/>
                  )}
                </div>

                {/* Hint below search box */}
                {searchMsg && (
                  <p style={{fontSize:"11px",color:"rgba(255,255,255,0.6)",marginTop:"5px",paddingLeft:"14px"}}>
                    {searchMsg}
                  </p>
                )}
                {showSug && suggests.length > 0 && (
                  <p style={{fontSize:"11px",color:"rgba(96,165,250,0.8)",marginTop:"5px",paddingLeft:"14px"}}>
                    👆 Click a result below to load weather
                  </p>
                )}

                {/* Dropdown */}
                <AnimatePresence>
                  {showSug && suggests.length > 0 && (
                    <motion.div className="sug-box"
                      initial={{opacity:0,y:-8,scale:0.97}} animate={{opacity:1,y:0,scale:1}}
                      exit={{opacity:0,y:-8,scale:0.97}} transition={{duration:0.14}}>
                      {suggests.map(r => (
                        <div key={r.place_id} className="sug-item" onMouseDown={() => pickResult(r)}>
                          <MapPin size={12} style={{color:"#60a5fa",flexShrink:0,marginTop:"3px"}}/>
                          <div style={{overflow:"hidden",minWidth:0,flex:1}}>
                            <p style={{fontSize:"14px",fontWeight:700,color:tw,
                              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              {r.address?.village || r.address?.hamlet || r.address?.town || r.address?.city || r.display_name.split(",")[0]}
                            </p>
                            <p style={{fontSize:"11px",color:ts,
                              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              {subName(r)}
                            </p>
                          </div>
                          {r.address?.country_code && (
                            <span style={{fontSize:"11px",color:ts,flexShrink:0,fontWeight:700,
                              background:"rgba(255,255,255,0.1)",padding:"2px 7px",borderRadius:"8px"}}>
                              {r.address.country_code.toUpperCase()}
                            </span>
                          )}
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </form>

              {/* Controls */}
              <div style={{display:"flex",gap:"7px",flexWrap:"wrap"}}>
                <button className="cbtn" onClick={() => setUnit(u => u==="C"?"F":"C")}>
                  °{unit==="C"?"F":"C"}
                </button>
                <button className="cbtn" onClick={() => setDarkMode(d => !d)}>
                  {darkMode ? <SunMedium size={14}/> : <Moon size={14}/>}
                </button>
                <button className="cbtn" title="Refresh weather"
                  onClick={() => {
                    // Prefer saved GPS location (most accurate ever recorded)
                    // over coords state (which could be a stale fallback)
                    const saved = (() => {
                      try { const s = localStorage.getItem("ghs_weather_loc_v2"); return s ? JSON.parse(s) : null; } catch { return null; }
                    })();
                    const lat = saved?.lat ?? coords?.lat;
                    const lon = saved?.lon ?? coords?.lon;
                    if (lat && lon) fetchWeather(lat, lon);
                  }}
                  disabled={loading}>
                  <RefreshCw size={14} style={{animation:(loading||refreshing)?"spin 1s linear infinite":"none"}}/>
                </button>
                <button className="cbtn" onClick={detectLocation} disabled={loading} title="Use my real GPS location">
                  <Navigation2 size={14}/> My Location
                </button>
              </div>
            </motion.div>

            {/* ── Error ── */}
            <AnimatePresence>
              {error && (
                <motion.div className="glass" initial={{opacity:0,scale:0.9}} animate={{opacity:1,scale:1}} exit={{opacity:0}}
                  style={{padding:"12px 16px",marginBottom:"14px",display:"flex",alignItems:"center",gap:"10px",color:"#fca5a5"}}>
                  <AlertCircle size={15}/>
                  <span style={{fontSize:"13px"}}>{error}</span>
                  <button onClick={() => setError(null)}
                    style={{marginLeft:"auto",background:"none",border:"none",color:"inherit",cursor:"pointer",fontSize:"18px",lineHeight:1}}>×</button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Loading Spinner ── */}
            {loading && (
              <motion.div initial={{opacity:0}} animate={{opacity:1}}
                style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"280px",gap:"14px"}}>
                <div style={{position:"relative",width:"76px",height:"76px"}}>
                  <div style={{position:"absolute",inset:0,borderRadius:"50%",
                    border:"3px solid rgba(255,255,255,0.2)",borderTopColor:"white",animation:"spin 1s linear infinite"}}/>
                  <div style={{position:"absolute",inset:"15px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"26px"}}>🌤️</div>
                </div>
                <p style={{color:"rgba(255,255,255,0.78)",fontSize:"14px"}}>{locMsg}</p>
              </motion.div>
            )}

            {/* ── Main Weather Display ── */}
            {!loading && current && (
              <AnimatePresence mode="wait">
                <motion.div key={`${coords?.lat.toFixed(4)}_${coords?.lon.toFixed(4)}`}
                  initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} transition={{duration:0.4}}>

                  {/* ── Hero ── */}
                  <motion.div className="glass"
                    style={{padding:"26px 30px",marginBottom:"16px",position:"relative",overflow:"hidden"}}>
                    <div style={{position:"absolute",top:"-50px",right:"-50px",width:"180px",height:"180px",
                      background:"rgba(255,255,255,0.03)",borderRadius:"50%",filter:"blur(35px)"}}/>

                    {/* Location + live indicator */}
                    <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"4px"}}>
                      <div style={{position:"relative"}}>
                        <MapPin size={15} color="white"/>
                        <div style={{position:"absolute",inset:0,background:"rgba(255,255,255,0.28)",
                          borderRadius:"50%",animation:"pulsering 2s ease-out infinite"}}/>
                      </div>
                      <span style={{fontSize:"18px",fontWeight:700,color:"white"}}>{displayName}</span>
                      {/* Live indicator */}
                      {refreshing && (
                        <div style={{display:"flex",alignItems:"center",gap:"4px",marginLeft:"auto",
                          background:"rgba(34,197,94,0.15)",border:"1px solid rgba(34,197,94,0.3)",
                          borderRadius:"50px",padding:"3px 10px"}}>
                          <div className="live-dot"/>
                          <span style={{fontSize:"10px",color:"#4ade80",fontWeight:600}}>LIVE</span>
                        </div>
                      )}
                      {!refreshing && (
                        <div style={{display:"flex",alignItems:"center",gap:"4px",marginLeft:"auto",
                          background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.2)",
                          borderRadius:"50px",padding:"3px 10px"}}>
                          <div className="live-dot"/>
                          <span style={{fontSize:"10px",color:"#4ade80",fontWeight:600}}>LIVE</span>
                        </div>
                      )}
                    </div>

                    <p style={{color:ts,fontSize:"12px",marginBottom:"18px"}}>
                      {new Date(current.dt*1000).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}
                      {" · "}{cap(current.weather[0].description)}
                      {" · Auto-refreshes every 60s"}
                    </p>

                    {/* Temp + emoji */}
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"14px"}}>
                      <div>
                        <div style={{fontSize:"clamp(64px,13vw,104px)",fontWeight:800,color:"white",
                          lineHeight:1,letterSpacing:"-3px",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                          {unit==="C"?toC(current.main.temp):toF(current.main.temp)}
                          <span style={{fontSize:"0.37em",fontWeight:400,opacity:0.62}}>°{unit}</span>
                        </div>
                        <p style={{color:"rgba(255,255,255,0.7)",fontSize:"14px",marginTop:"5px"}}>
                          Feels {T(current.main.feels_like)} · {T(current.main.temp_min)} / {T(current.main.temp_max)}
                        </p>
                      </div>
                      <div className="big-icon" style={{fontSize:"clamp(52px,10vw,86px)"}}>
                        {E[current.weather[0].icon] || "🌤️"}
                      </div>
                    </div>

                    {/* Sunrise / Sunset */}
                    <div style={{display:"flex",gap:"18px",marginTop:"16px",flexWrap:"wrap"}}>
                      {[{e:"🌅",l:"SUNRISE",v:fTime(current.sys.sunrise)},{e:"🌇",l:"SUNSET",v:fTime(current.sys.sunset)}].map(x=>(
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

                  {/* ── Stats ── */}
                  <motion.div initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} transition={{delay:0.08}}
                    style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(108px,1fr))",gap:"9px",marginBottom:"16px"}}>
                    {[
                      {i:"💧",l:"Humidity",   v:`${current.main.humidity}%`},
                      {i:"💨",l:"Wind",       v:`${Math.round(current.wind.speed*3.6)}km/h ${wDir(current.wind.deg)}`},
                      {i:"👁️",l:"Visibility", v:`${(current.visibility/1000).toFixed(1)}km`},
                      {i:"📊",l:"Pressure",   v:`${current.main.pressure}hPa`},
                      {i:"☁️",l:"Cloud Cover",v:`${current.clouds.all}%`},
                      {i:"🌬️",l:"Wind Gust",  v:current.wind.gust?`${Math.round(current.wind.gust*3.6)}km/h`:"N/A"},
                      ...(uv!=null?[{i:"☀️",l:"UV Index",v:`${uv.toFixed(1)} ${uvInfo(uv).label}`}]:[]),
                      ...(aqi?[{i:"🫁",l:"AQI",v:`${aqi.list[0].main.aqi} ${aqiInfo(aqi.list[0].main.aqi).label}`}]:[]),
                    ].map((s,i)=>(
                      <motion.div key={s.l} className="pill"
                        initial={{opacity:0,scale:0.88}} animate={{opacity:1,scale:1}} transition={{delay:0.04*i}}>
                        <span style={{fontSize:"20px"}}>{s.i}</span>
                        <p style={{color:"rgba(255,255,255,0.55)",fontSize:"9px",fontWeight:600,
                          textTransform:"uppercase",letterSpacing:"0.4px"}}>{s.l}</p>
                        <p style={{color:"white",fontSize:"12px",fontWeight:700}}>{s.v}</p>
                      </motion.div>
                    ))}
                  </motion.div>

                  {/* ── Hourly ── */}
                  <motion.div className="glass" initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} transition={{delay:0.14}}
                    style={{padding:"18px",marginBottom:"16px"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
                      <h3 style={{color:"white",fontSize:"14px",fontWeight:700}}>⏱ 24-Hour Forecast</h3>
                      <div style={{display:"flex",gap:"5px"}}>
                        {[<ChevronLeft size={12}/>,<ChevronRight size={12}/>].map((ic,i)=>(
                          <button key={i} onClick={()=>hourlyRef.current?.scrollBy({left:i===0?-200:200,behavior:"smooth"})}
                            style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.18)",
                              borderRadius:"50%",width:"26px",height:"26px",display:"flex",
                              alignItems:"center",justifyContent:"center",color:"white",cursor:"pointer"}}>
                            {ic}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div ref={hourlyRef} className="scr" style={{display:"flex",gap:"8px",overflowX:"auto",paddingBottom:"5px"}}>
                      {hourly8.map((h,i)=>(
                        <div key={i} className="hcard">
                          <p style={{color:"rgba(255,255,255,0.58)",fontSize:"10px",fontWeight:600,marginBottom:"6px"}}>
                            {i===0?"Now":h.dt_txt.slice(11,16)}
                          </p>
                          <div style={{fontSize:"22px",marginBottom:"6px"}}>{E[h.weather[0].icon]||"🌤️"}</div>
                          <p style={{color:"white",fontSize:"13px",fontWeight:700}}>
                            {unit==="C"?toC(h.main.temp):toF(h.main.temp)}°
                          </p>
                          {h.pop>0&&<p style={{fontSize:"9px",color:"#60a5fa",marginTop:"2px"}}>💧{Math.round(h.pop*100)}%</p>}
                        </div>
                      ))}
                    </div>
                  </motion.div>

                  {/* ── 7-Day ── */}
                  <motion.div className="glass" initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} transition={{delay:0.18}}
                    style={{padding:"18px",marginBottom:"16px"}}>
                    <h3 style={{color:"white",fontSize:"14px",fontWeight:700,marginBottom:"8px"}}>📅 7-Day Forecast</h3>
                    {daily7.map((d,i)=>(
                      <motion.div key={i} className="drow"
                        initial={{opacity:0,x:-14}} animate={{opacity:1,x:0}} transition={{delay:0.03*i}}>
                        <span style={{color:"white",fontWeight:600,width:"44px",fontSize:"12px",flexShrink:0}}>
                          {i===0?"Today":fDay(d.dt)}
                        </span>
                        <span style={{fontSize:"19px"}}>{E[d.weather[0].icon]||"🌤️"}</span>
                        <span style={{color:ts,fontSize:"11px",flex:1,textAlign:"center",
                          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {cap(d.weather[0].description)}
                        </span>
                        {d.pop>0&&<span style={{fontSize:"10px",color:"#60a5fa",flexShrink:0}}>💧{Math.round(d.pop*100)}%</span>}
                        <div style={{display:"flex",gap:"6px",minWidth:"74px",justifyContent:"flex-end",flexShrink:0}}>
                          <span style={{color:"white",fontSize:"12px",fontWeight:700}}>
                            {unit==="C"?toC(d.main.temp_max):toF(d.main.temp_max)}°
                          </span>
                          <span style={{color:"rgba(255,255,255,0.5)",fontSize:"12px"}}>
                            {unit==="C"?toC(d.main.temp_min):toF(d.main.temp_min)}°
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>

                  {/* ── AQI ── */}
                  {aqi && (
                    <motion.div className="glass" initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} transition={{delay:0.22}}
                      style={{padding:"18px",marginBottom:"16px"}}>
                      <h3 style={{color:"white",fontSize:"14px",fontWeight:700,marginBottom:"12px"}}>🫁 Air Quality Index</h3>
                      <div style={{display:"flex",alignItems:"center",gap:"13px",marginBottom:"12px"}}>
                        <div style={{width:"62px",height:"62px",borderRadius:"50%",
                          display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",
                          background:`${aqiInfo(aqi.list[0].main.aqi).color}20`,
                          border:`3px solid ${aqiInfo(aqi.list[0].main.aqi).color}`}}>
                          <span style={{color:"white",fontSize:"18px",fontWeight:800}}>{aqi.list[0].main.aqi}</span>
                          <span style={{fontSize:"7px",color:aqiInfo(aqi.list[0].main.aqi).color,fontWeight:700}}>AQI</span>
                        </div>
                        <div>
                          <p style={{color:aqiInfo(aqi.list[0].main.aqi).color,fontSize:"18px",fontWeight:700}}>
                            {aqiInfo(aqi.list[0].main.aqi).label}
                          </p>
                          <p style={{color:ts,fontSize:"11px"}}>Air quality level</p>
                        </div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(84px,1fr))",gap:"7px"}}>
                        {Object.entries(aqi.list[0].components).map(([k,v])=>(
                          <div key={k} style={{background:"rgba(255,255,255,0.055)",borderRadius:"11px",padding:"8px",textAlign:"center"}}>
                            <p style={{color:ts,fontSize:"8px",textTransform:"uppercase",letterSpacing:"0.3px",marginBottom:"3px"}}>{k.replace("_",".")}</p>
                            <p style={{color:"white",fontSize:"11px",fontWeight:700}}>{typeof v==="number"?v.toFixed(1):v}</p>
                            <p style={{color:"rgba(255,255,255,0.38)",fontSize:"7px"}}>μg/m³</p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* ── Radar Map ── */}
                  <motion.div className="glass" initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} transition={{delay:0.26}}
                    style={{padding:"18px",marginBottom:"16px"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
                      <h3 style={{color:"white",fontSize:"14px",fontWeight:700}}>🛰️ Live Weather Radar</h3>
                      <button className="cbtn" onClick={() => setShowRadar(r => !r)}>
                        <Layers size={13}/> {showRadar?"Hide":"Show"} Map
                      </button>
                    </div>

                    <AnimatePresence>
                      {showRadar && coords && (
                        <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}}
                          exit={{opacity:0,height:0}} transition={{duration:0.3}}>
                          <RadarMap lat={coords.lat} lon={coords.lon}/>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {!showRadar && (
                      <div onClick={() => setShowRadar(true)}
                        style={{height:"90px",borderRadius:"16px",background:"rgba(255,255,255,0.035)",
                          display:"flex",alignItems:"center",justifyContent:"center",
                          border:"1px dashed rgba(255,255,255,0.14)",cursor:"pointer",
                          flexDirection:"column",gap:"6px",transition:"all .3s"}}>
                        <span style={{fontSize:"26px"}}>🗺️</span>
                        <p style={{color:ts,fontSize:"12px"}}>
                          Click to open interactive map — Rain, Clouds, Wind &amp; Google Satellite
                        </p>
                      </div>
                    )}
                  </motion.div>

                  {/* Footer */}
                  <p style={{textAlign:"center",fontSize:"10px",color:"rgba(255,255,255,0.35)",marginTop:"6px"}}>
                    OpenWeatherMap · OpenStreetMap Nominatim · Leaflet · GHS Babi Khel
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
