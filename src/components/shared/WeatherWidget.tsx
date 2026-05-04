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
import { motion } from "framer-motion";
import { Wind, Droplets, ArrowRight, MapPin } from "lucide-react";

const API_KEY  = "7b65a0e9302a64320622c0973e306e18";
const BASE_URL = "https://api.openweathermap.org/data/2.5";

const EMOJI: Record<string,string> = {
  "01d":"☀️","01n":"🌙","02d":"⛅","02n":"☁️","03d":"☁️","03n":"☁️","04d":"☁️","04n":"☁️",
  "09d":"🌧️","09n":"🌧️","10d":"🌦️","10n":"🌧️","11d":"⛈️","11n":"⛈️","13d":"❄️","13n":"❄️","50d":"🌫️","50n":"🌫️",
};

const gradient = (id:number, night:boolean) => {
  if (id>=200&&id<300) return "linear-gradient(135deg,#1a1a2e,#2d3561)";
  if (id>=300&&id<600) return "linear-gradient(135deg,#1e3a5f,#2d6a8c)";
  if (id>=600&&id<700) return "linear-gradient(135deg,#c5dff8,#a3c4f0)";
  if (id>=700&&id<800) return "linear-gradient(135deg,#b0bec5,#90a4ae)";
  if (id===800) return night ? "linear-gradient(135deg,#0a0a2e,#1a1a4e)" : "linear-gradient(135deg,#1a6dff,#00d4ff)";
  return "linear-gradient(135deg,#4a5568,#718096)";
};

interface WData {
  name: string;
  sys: { country:string; sunrise:number; sunset:number };
  main: { temp:number; humidity:number };
  weather: Array<{ id:number; icon:string; description:string }>;
  wind: { speed:number };
  dt: number;
}

const WeatherWidget = () => {
  const [data,      setData]      = useState<WData|null>(null);
  const [locName,   setLocName]   = useState("");
  const [loading,   setLoading]   = useState(true);
  const coordsRef = useRef<{lat:number;lon:number}|null>(null);

  // ── Multi-service reverse geocode → exact village name ─────────────────────
  // Same approach as Weather.tsx: BigDataCloud first (best for Pakistani villages),
  // then Nominatim as fallback with zoom=18 for maximum precision.
  const reverseGeocode = useCallback(async (lat:number, lon:number) => {
    const setResult = (place: string, cc: string) => {
      if (place) setLocName(`${place}${cc ? `, ${cc}` : ""}`);
    };

    // ── Service 1: BigDataCloud (best village-level data) ──
    try {
      const r = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
        { headers: { "Accept": "application/json" } }
      );
      if (r.ok) {
        const d = await r.json();
        if (d && !d.error) {
          const locality = d.locality?.trim();
          const city = d.city?.trim();
          const cc = d.countryCode || "";
          if (locality && locality !== city) {
            setResult(locality, cc);
          } else if (locality) {
            setResult(locality, cc);
          } else if (city) {
            setResult(city, cc);
          }
          if (locality || city) return;
        }
      }
    } catch { /* try next */ }

    // ── Service 2: Nominatim with zoom=18 (building-level) ──
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=18&accept-language=en`,
        { headers:{ "User-Agent":"OceanSchoolHub/1.0" } }
      );
      if (!r.ok) return;
      const d = await r.json();
      const a = d.address || {};
      const place =
        a.isolated_dwelling || a.farm || a.village || a.hamlet ||
        a.neighbourhood || a.suburb || a.quarter || a.city_district ||
        a.town || a.city || a.municipality || a.county || d.name || "";
      const cc = a.country_code?.toUpperCase() || "";
      setResult(place, cc);
    } catch { /* use OWM name */ }
  }, []);

  // ── Fetch OWM weather ─────────────────────────────────────────────────────
  const fetchW = useCallback(async (lat:number, lon:number) => {
    coordsRef.current = { lat, lon };
    try {
      const r = await fetch(`${BASE_URL}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}`);
      if (r.ok) setData(await r.json());
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

  const tempC    = Math.round(data.main.temp - 273.15);
  const icon     = data.weather[0].icon;
  const id       = data.weather[0].id;
  const isNight  = data.dt < data.sys.sunrise || data.dt > data.sys.sunset;
  const bg       = gradient(id, isNight);
  const emoji    = EMOJI[icon] || "🌤️";
  const windKmh  = Math.round(data.wind.speed * 3.6);
  const desc     = data.weather[0].description.replace(/\b\w/g, c => c.toUpperCase());
  const nameDisp = locName || `${data.name}, ${data.sys.country}`;

  return (
    <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:0.5}}
      style={{background:bg, borderRadius:"20px", overflow:"hidden", position:"relative"}}
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
            animation:"wFloat 3s ease-in-out infinite"}}>
            {emoji}
          </div>
        </div>

        {/* Stats row */}
        <div style={{display:"flex",gap:"14px",marginTop:"14px",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",gap:"12px"}}>
            <div style={{display:"flex",alignItems:"center",gap:"4px"}}>
              <Droplets size={12} color="rgba(255,255,255,0.7)"/>
              <span style={{color:"rgba(255,255,255,0.8)",fontSize:"11px"}}>{data.main.humidity}%</span>
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
    </motion.div>
  );
};

export default WeatherWidget;
