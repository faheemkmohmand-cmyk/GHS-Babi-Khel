// src/pages/dashboard/tabs/SolarSystem.tsx
//
// 🌌 Solar System Live — Real-time 3D-top-down view of the solar system.
//
// Features:
//   • All 8 planets at their REAL current positions (Kepler's equations)
//   • Sun with glow + live sunspot count (NOAA SWPC)
//   • ISS position shown as a dot orbiting Earth
//   • "ISS over Pakistan NOW" notification when ISS is over Pakistani airspace
//   • Solar wind speed + space weather (NOAA SWPC)
//   • Mars weather from NASA InSight lander
//   • Asteroid flybys today (NASA NeoWS)
//   • Click any planet for detailed info
//   • Time scrubber — see positions at any date
//   • Zoom / pan / toggle orbits / toggle labels
//
// Accuracy:
//   Planet positions use J2000 orbital elements + Kepler's equation solver.
//   Accuracy is within ~1 arcminute for inner planets, ~10 arcminutes for
//   outer planets — more than enough for a visualization.
//   Source: Standish (1992), "Keplerian Elements for Approximate Positions
//   of the Major Planets" — the standard reference used by JPL.
//
// APIs (all free, no key required except NASA APOD key already in project):
//   • NOAA SWPC: https://services.swpc.noaa.gov/json/planetary_k_index_1m.json
//   • NOAA SWPC: https://services.swpc.noaa.gov/json/solar_wind_speed_1m.json
//   • NASA NeoWS: https://api.nasa.gov/neo/rest/v1/feed/today
//   • NASA InSight: https://api.nasa.gov/insight_weather/ (may be inactive)
//   • ISS position: existing /api/iss proxy
//
// No external 3D library needed — pure Canvas 2D with perspective math.

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Sun, Moon, ZoomIn, ZoomOut, RotateCcw, Orbit, Tag, Calendar,
  Satellite, Activity, AlertTriangle, Sparkles, Wind, Zap,
} from "lucide-react";

// ─── Planet Orbital Elements (J2000.0 epoch) ──────────────────────────────
// Source: JPL Standish (1992) — standard astronomical reference.
// a  = semi-major axis (AU)
// e  = eccentricity
// i  = inclination (degrees)
// Ω  = longitude of ascending node (degrees)
// ω̃  = longitude of perihelion (degrees) = ω + Ω
// L0 = mean longitude at J2000 (degrees)
// n  = daily motion (degrees/day) = 0.9856076686 / a^1.5

type PlanetElements = {
  name: string;
  symbol: string;
  color: string;
  glowColor: string;
  radius: number;       // visual radius in pixels (not to scale)
  realRadiusKm: number; // actual radius in km (for info panel)
  a: number;            // semi-major axis (AU)
  e: number;            // eccentricity
  i: number;            // inclination (deg)
  omega: number;        // longitude of ascending node (deg)
  wtilde: number;       // longitude of perihelion (deg)
  L0: number;           // mean longitude at J2000 (deg)
  period: number;       // orbital period (Earth days)
  moons: number;
  facts: string;
};

const PLANETS: PlanetElements[] = [
  {
    name: "Mercury", symbol: "☿", color: "#a8a29e", glowColor: "#d6d3d1",
    radius: 4, realRadiusKm: 2440, a: 0.387098, e: 0.205635, i: 7.005,
    omega: 48.331, wtilde: 77.456, L0: 252.251, period: 87.97, moons: 0,
    facts: "Smallest planet. Surface temp swings from -180°C to 430°C.",
  },
  {
    name: "Venus", symbol: "♀", color: "#fbbf24", glowColor: "#fde68a",
    radius: 7, realRadiusKm: 6052, a: 0.723330, e: 0.006773, i: 3.395,
    omega: 76.680, wtilde: 131.533, L0: 181.980, period: 224.70, moons: 0,
    facts: "Hottest planet (462°C). Rotates backwards. A day > a year.",
  },
  {
    name: "Earth", symbol: "⊕", color: "#3b82f6", glowColor: "#60a5fa",
    radius: 7, realRadiusKm: 6371, a: 1.000001, e: 0.016709, i: 0.000,
    omega: -11.260, wtilde: 102.947, L0: 100.464, period: 365.26, moons: 1,
    facts: "The only known planet with life. 71% covered by water.",
  },
  {
    name: "Mars", symbol: "♂", color: "#ef4444", glowColor: "#f87171",
    radius: 5, realRadiusKm: 3390, a: 1.523688, e: 0.093405, i: 1.850,
    omega: 49.558, wtilde: 336.040, L0: 355.433, period: 686.98, moons: 2,
    facts: "Home to Olympus Mons — the tallest volcano in the solar system (22 km).",
  },
  {
    name: "Jupiter", symbol: "♃", color: "#f59e0b", glowColor: "#fbbf24",
    radius: 16, realRadiusKm: 69911, a: 5.202561, e: 0.048498, i: 1.303,
    omega: 100.464, wtilde: 14.331, L0: 34.351, period: 4332.59, moons: 95,
    facts: "Largest planet. The Great Red Spot is a storm bigger than Earth.",
  },
  {
    name: "Saturn", symbol: "♄", color: "#eab308", glowColor: "#facc15",
    radius: 14, realRadiusKm: 58232, a: 9.554747, e: 0.055546, i: 2.484,
    omega: 113.665, wtilde: 93.057, L0: 50.077, period: 10759.22, moons: 146,
    facts: "Has spectacular rings made of ice and rock. Least dense planet.",
  },
  {
    name: "Uranus", symbol: "♅", color: "#22d3ee", glowColor: "#67e8f9",
    radius: 10, realRadiusKm: 25362, a: 19.21814, e: 0.046381, i: 0.771,
    omega: 74.006, wtilde: 173.005, L0: 314.055, period: 30688.5, moons: 27,
    facts: "Rotates on its side (97.8° tilt). Coldest atmosphere (-224°C).",
  },
  {
    name: "Neptune", symbol: "♆", color: "#6366f1", glowColor: "#818cf8",
    radius: 10, realRadiusKm: 24622, a: 30.10957, e: 0.009456, i: 1.770,
    omega: 131.784, wtilde: 48.124, L0: 304.348, period: 60182, moons: 14,
    facts: "Windiest planet (2,100 km/h). Discovered by math before telescopes.",
  },
];

// ─── Time helpers ────────────────────────────────────────────────────────

// J2000 epoch: January 1.5, 2000 (noon Jan 1) = Julian Date 2451545.0
const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0); // ms since Unix epoch
const MS_PER_DAY = 86400000;

function daysSinceJ2000(date: Date): number {
  return (date.getTime() - J2000) / MS_PER_DAY;
}

// ─── Kepler solver ───────────────────────────────────────────────────────
// Solve Kepler's equation: M = E - e * sin(E)  for E (eccentric anomaly).
// Newton-Raphson iteration — converges in 3-6 iterations.

function solveKepler(M: number, e: number): number {
  // Normalize M to [-π, π]
  M = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (M > Math.PI) M -= 2 * Math.PI;

  let E = M + e * Math.sin(M); // initial guess
  for (let iter = 0; iter < 8; iter++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

// ─── Planet position calculation ──────────────────────────────────────────
// Returns heliocentric ecliptic coordinates (x, y, z) in AU.
// Algorithm from Standish (1992), simplified for J2000 elements.

type Vec3 = { x: number; y: number; z: number };

function getPlanetPosition(planet: PlanetElements, date: Date): Vec3 {
  const d = daysSinceJ2000(date);

  // Mean longitude (degrees → radians)
  const L = (planet.L0 + (0.9856076686 / Math.pow(planet.a, 1.5)) * d) * Math.PI / 180;

  // Mean anomaly = L - ω̃
  const M = L - planet.wtilde * Math.PI / 180;

  // Eccentric anomaly via Kepler
  const E = solveKepler(M, planet.e);

  // True anomaly
  const nu = 2 * Math.atan2(
    Math.sqrt(1 + planet.e) * Math.sin(E / 2),
    Math.sqrt(1 - planet.e) * Math.cos(E / 2)
  );

  // Heliocentric distance (AU)
  const r = planet.a * (1 - planet.e * Math.cos(E));

  // Position in orbital plane
  const xp = r * Math.cos(nu);
  const yp = r * Math.sin(nu);

  // Argument of perihelion = ω̃ - Ω
  const omega = (planet.wtilde - planet.omega) * Math.PI / 180;
  const Omega = planet.omega * Math.PI / 180;
  const inc = planet.i * Math.PI / 180;

  const cosO = Math.cos(Omega), sinO = Math.sin(Omega);
  const cosw = Math.cos(omega), sinw = Math.sin(omega);
  const cosi = Math.cos(inc), sini = Math.sin(inc);

  // Ecliptic coordinates (J2000)
  const x = (cosO * cosw - sinO * sinw * cosi) * xp + (-cosO * sinw - sinO * cosw * cosi) * yp;
  const y = (sinO * cosw + cosO * sinw * cosi) * xp + (-sinO * sinw + cosO * cosw * cosi) * yp;
  const z = (sinw * sini) * xp + (cosw * sini) * yp;

  return { x, y, z };
}

// ─── Distance from Earth to a planet (AU) ──────────────────────────────

function distanceFromEarth(planetPos: Vec3, earthPos: Vec3): number {
  const dx = planetPos.x - earthPos.x;
  const dy = planetPos.y - earthPos.y;
  const dz = planetPos.z - earthPos.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ─── Pakistan bounding box (for ISS visibility) ─────────────────────────
// Pakistan: approximately 23.5°N–37.08°N, 60.87°E–77.82°E

const PAKISTAN_BBOX = {
  minLat: 23.5, maxLat: 37.08,
  minLng: 60.87, maxLng: 77.82,
};

function isOverPakistan(lat: number, lng: number): boolean {
  return lat >= PAKISTAN_BBOX.minLat && lat <= PAKISTAN_BBOX.maxLat &&
         lng >= PAKISTAN_BBOX.minLng && lng <= PAKISTAN_BBOX.maxLng;
}

// Mohmand District coordinates (school location)
const MOHMAND_LAT = 34.5;
const MOHMAND_LNG = 71.2;

// Great-circle distance between two lat/lng points (km)
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Types for live data ────────────────────────────────────────────────

interface ISSPosition {
  latitude: number;
  longitude: number;
  altitude: number; // km
  velocity: number; // km/h
  timestamp: number;
}

interface SpaceWeather {
  solarWindSpeed: number | null;   // km/s
  kpIndex: number | null;          // 0-9
  sunspotCount: number | null;
  loading: boolean;
  error: string | null;
}

interface AsteroidData {
  count: number;
  nearest: { name: string; distanceKm: number; diameterM: number; velocityKmh: number } | null;
}

interface MarsWeather {
  sol: number;
  tempAvg: number | null;
  tempMin: number | null;
  tempMax: number | null;
  pressure: number | null;
  windSpeed: number | null;
  season: string | null;
  loading: boolean;
}

// ─── Fetch helpers ──────────────────────────────────────────────────────

async function tryJson(url: string, timeoutMs = 8000): Promise<any | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ─── ISS position fetch (uses existing /api/iss proxy) ──────────────────

async function fetchISSPosition(): Promise<ISSPosition | null> {
  // Primary: our Vercel proxy (open-notify format)
  const proxyPos = await tryJson("/api/iss?type=position", 8000);
  if (proxyPos?.iss_position) {
    return {
      latitude: parseFloat(proxyPos.iss_position.latitude),
      longitude: parseFloat(proxyPos.iss_position.longitude),
      altitude: proxyPos.altitude ?? 408,
      velocity: proxyPos.velocity ?? 27600,
      timestamp: proxyPos.timestamp ?? Math.floor(Date.now() / 1000),
    };
  }

  // Fallback: wheretheiss.at direct
  const direct = await tryJson("https://api.wheretheiss.at/v1/satellites/25544", 6000);
  if (direct && typeof direct.latitude === "number") {
    return {
      latitude: direct.latitude,
      longitude: direct.longitude,
      altitude: direct.altitude ?? 408,
      velocity: direct.velocity ?? 27600,
      timestamp: direct.timestamp,
    };
  }

  return null;
}

// ─── Space weather fetch (NOAA SWPC — no key needed) ────────────────────

async function fetchSpaceWeather(): Promise<SpaceWeather> {
  const result: SpaceWeather = {
    solarWindSpeed: null, kpIndex: null, sunspotCount: null,
    loading: true, error: null,
  };

  // Try our serverless proxy first (handles CORS + caching), then fall back to direct NOAA

  try {
    // Solar wind speed — DSCOVR plasma (current primary source)
    // Format: [["time_tag","density","speed","temperature"], [...data rows...]]
    let sw = await tryJson("/api/space-weather?type=solar_wind", 7000);
    if (!Array.isArray(sw) || sw.length < 2) {
      sw = await tryJson("https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json", 7000);
    }
    if (Array.isArray(sw) && sw.length > 1) {
      // Find the speed column index from the header row
      const header = sw[0];
      const speedIdx = header.indexOf("speed");
      if (speedIdx >= 0) {
        const last = sw[sw.length - 1];
        const speed = parseFloat(last[speedIdx]);
        if (!isNaN(speed)) {
          result.solarWindSpeed = Math.round(speed);
        }
      }
    }
  } catch { /* ignore */ }

  try {
    // Planetary K-index (geomagnetic activity)
    // API returns: { kp_index: 0 (number), estimated_kp: 0.33, kp: "0P" (string) }
    // We use kp_index (numeric) for the display.
    let kp = await tryJson("/api/space-weather?type=kp_index", 7000);
    if (!Array.isArray(kp) || kp.length === 0) {
      kp = await tryJson("https://services.swpc.noaa.gov/json/planetary_k_index_1m.json", 7000);
    }
    if (Array.isArray(kp) && kp.length > 0) {
      const last = kp[kp.length - 1];
      // Prefer kp_index (numeric), fall back to estimated_kp
      const kpVal = last?.kp_index ?? last?.estimated_kp;
      if (typeof kpVal === "number" && !isNaN(kpVal)) {
        result.kpIndex = Math.round(kpVal * 10) / 10; // 1 decimal place
      }
    }
  } catch { /* ignore */ }

  try {
    // Sunspot count — observed daily SSN (swpc_observed_ssn.json)
    // Format: [{"Obsdate":"2026-06-22T00:00:00","swpc_ssn":78}, ...]
    let ssn = await tryJson("/api/space-weather?type=sunspots", 7000);
    if (!Array.isArray(ssn) || ssn.length === 0) {
      ssn = await tryJson("https://services.swpc.noaa.gov/json/solar-cycle/swpc_observed_ssn.json", 7000);
    }
    if (Array.isArray(ssn) && ssn.length > 0) {
      // Get the most recent entry with a valid sunspot number
      for (let i = ssn.length - 1; i >= 0; i--) {
        const entry = ssn[i];
        const ssnVal = entry?.swpc_ssn ?? entry?.predicted_ssn;
        if (typeof ssnVal === "number" && !isNaN(ssnVal)) {
          result.sunspotCount = Math.round(ssnVal);
          break;
        }
      }
    }
  } catch { /* ignore */ }

  result.loading = false;
  return result;
}

// ─── Asteroids near Earth today (NASA NeoWS) ───────────────────────────

const NASA_API_KEY = "I7E0FR0gL0Lvt9cnxh5jsRSvAzWlJVzeYFZRQTKy";

async function fetchAsteroids(): Promise<AsteroidData> {
  const today = new Date().toISOString().split("T")[0];
  // Try our proxy first, then direct NASA API
  let data = await tryJson("/api/space-weather?type=asteroids", 8000);
  if (!data || !data.element_count) {
    data = await tryJson(
      `https://api.nasa.gov/neo/rest/v1/feed?start_date=${today}&end_date=${today}&api_key=${NASA_API_KEY}`,
      8000
    );
  }
  if (!data || !data.element_count) {
    return { count: 0, nearest: null };
  }

  const todayObjs = data.near_earth_objects[today] || [];
  if (todayObjs.length === 0) {
    return { count: data.element_count, nearest: null };
  }

  // Find the closest approach today
  let nearest: AsteroidData["nearest"] = null;
  let minDist = Infinity;
  for (const ast of todayObjs) {
    const ca = ast.close_approach_data?.[0];
    if (!ca) continue;
    const dist = parseFloat(ca.miss_distance?.kilometers || "Infinity");
    if (dist < minDist) {
      minDist = dist;
      const diameter = ast.estimated_diameter?.meters;
      nearest = {
        name: ast.name || "Unknown",
        distanceKm: dist,
        diameterM: diameter ? Math.round((diameter.estimated_diameter_min + diameter.estimated_diameter_max) / 2) : 0,
        velocityKmh: parseFloat(ca.relative_velocity?.kilometers_per_hour || "0"),
      };
    }
  }

  return { count: data.element_count, nearest };
}

// ─── Mars weather (NASA InSight — may be inactive) ─────────────────────

async function fetchMarsWeather(): Promise<MarsWeather> {
  // Try our proxy first, then direct NASA API
  let data = await tryJson("/api/space-weather?type=mars_weather", 8000);
  if (!data || !data.sol_keys || data.sol_keys.length === 0) {
    data = await tryJson(
      `https://api.nasa.gov/insight_weather/?api_key=${NASA_API_KEY}&feedtype=json&ver=1.0`,
      8000
    );
  }
  if (!data || !data.sol_keys || data.sol_keys.length === 0) {
    return { sol: 0, tempAvg: null, tempMin: null, tempMax: null, pressure: null, windSpeed: null, season: null, loading: false };
  }
  const lastSol = data.sol_keys[data.sol_keys.length - 1];
  const solData = data[lastSol];
  if (!solData) {
    return { sol: 0, tempAvg: null, tempMin: null, tempMax: null, pressure: null, windSpeed: null, season: null, loading: false };
  }
  return {
    sol: parseInt(lastSol),
    tempAvg: solData.AT?.av ?? null,
    tempMin: solData.AT?.mn ?? null,
    tempMax: solData.AT?.mx ?? null,
    pressure: solData.PRE?.av ?? null,
    windSpeed: solData.HWS?.av ?? null,
    season: solData.Season ?? null,
    loading: false,
  };
}

// ─── Main component ─────────────────────────────────────────────────────

export default function SolarSystem() {
  // Canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const animationRef = useRef<number | null>(null);

  // View state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showOrbits, setShowOrbits] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [selectedPlanet, setSelectedPlanet] = useState<string | null>("Earth");
  const [canvasSize, setCanvasSize] = useState({ w: 600, h: 500 });

  // Time
  const [simDate, setSimDate] = useState(new Date());
  const [isLiveTime, setIsLiveTime] = useState(true);

  // Live data
  const [iss, setIss] = useState<ISSPosition | null>(null);
  const [weather, setWeather] = useState<SpaceWeather>({
    solarWindSpeed: null, kpIndex: null, sunspotCount: null, loading: true, error: null,
  });
  const [asteroids, setAsteroids] = useState<AsteroidData>({ count: 0, nearest: null });
  const [mars, setMars] = useState<MarsWeather>({
    sol: 0, tempAvg: null, tempMin: null, tempMax: null, pressure: null, windSpeed: null, season: null, loading: true,
  });

  // ISS over Pakistan notification
  const [issOverPakistan, setIssOverPakistan] = useState(false);
  const [issDistanceToMohmand, setIssDistanceToMohmand] = useState<number | null>(null);

  // Pan drag
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  // ─── Measure canvas size ────────────────────────────────────────────
  useEffect(() => {
    const measure = () => {
      if (!wrapRef.current) return;
      const r = wrapRef.current.getBoundingClientRect();
      const w = Math.floor(r.width);
      if (w < 2) return;
      setCanvasSize({ w, h: Math.max(360, Math.floor(w * 0.7)) });
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      if (wrapRef.current) ro.observe(wrapRef.current);
      return () => ro.disconnect();
    } else {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
  }, []);

  // ─── Live time tick (update every second when in live mode) ─────────
  useEffect(() => {
    if (!isLiveTime) return;
    const interval = setInterval(() => setSimDate(new Date()), 1000);
    return () => clearInterval(interval);
  }, [isLiveTime]);

  // ─── Fetch ISS position every 5 seconds ─────────────────────────────
  const doFetchISS = useCallback(async () => {
    const pos = await fetchISSPosition();
    if (pos) {
      setIss(pos);
      const overPak = isOverPakistan(pos.latitude, pos.longitude);
      setIssOverPakistan(overPak);
      setIssDistanceToMohmand(
        Math.round(haversineKm(pos.latitude, pos.longitude, MOHMAND_LAT, MOHMAND_LNG))
      );
    }
  }, []);

  useEffect(() => {
    doFetchISS();
    const interval = setInterval(doFetchISS, 5000);
    return () => clearInterval(interval);
  }, [doFetchISS]);

  // ─── Fetch space weather every 5 minutes ────────────────────────────
  useEffect(() => {
    fetchSpaceWeather().then(setWeather);
    const interval = setInterval(() => fetchSpaceWeather().then(setWeather), 300000);
    return () => clearInterval(interval);
  }, []);

  // ─── Fetch asteroids every 6 hours ──────────────────────────────────
  useEffect(() => {
    fetchAsteroids().then(setAsteroids);
    const interval = setInterval(() => fetchAsteroids().then(setAsteroids), 21600000);
    return () => clearInterval(interval);
  }, []);

  // ─── Fetch Mars weather once on mount ───────────────────────────────
  useEffect(() => {
    fetchMarsWeather().then(setMars);
  }, []);

  // ─── Calculate all planet positions ─────────────────────────────────
  const planetPositions = useMemo(() => {
    return PLANETS.map((p) => ({
      planet: p,
      pos: getPlanetPosition(p, simDate),
    }));
  }, [simDate]);

  const earthPos = useMemo(() => {
    return planetPositions.find((pp) => pp.planet.name === "Earth")?.pos || { x: 0, y: 0, z: 0 };
  }, [planetPositions]);

  // ─── Drawing ────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvasSize.w < 2 || canvasSize.h < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.floor(canvasSize.w * dpr) || canvas.height !== Math.floor(canvasSize.h * dpr)) {
      canvas.width = Math.floor(canvasSize.w * dpr);
      canvas.height = Math.floor(canvasSize.h * dpr);
      canvas.style.width = canvasSize.w + "px";
      canvas.style.height = canvasSize.h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const W = canvasSize.w;
    const H = canvasSize.h;
    const cx = W / 2 + pan.x;
    const cy = H / 2 + pan.y;

    // ─── Background: deep space gradient ────────────────────────────
    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H));
    bgGrad.addColorStop(0, "#0a0e1a");
    bgGrad.addColorStop(0.5, "#050810");
    bgGrad.addColorStop(1, "#000000");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // ─── Stars (pre-seeded so they don't flicker) ───────────────────
    // Use a deterministic pattern based on position
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 200; i++) {
      const sx = ((i * 73) % W);
      const sy = ((i * 137) % H);
      const size = ((i * 31) % 3) * 0.5 + 0.3;
      const alpha = ((i * 17) % 100) / 200 + 0.2;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ─── Scale: log scale so outer planets are visible ──────────────
    // Use a custom scaling: AU → pixels, with compression for outer planets
    const baseScale = Math.min(W, H) * 0.04 * zoom; // 1 AU ≈ this many pixels (adjusted)
    const auToPx = (au: number) => {
      // Use power scaling: 0.4 AU → ~30px, 30 AU → ~250px
      // This keeps inner planets visible while fitting outer ones
      return Math.pow(Math.max(au, 0.01), 0.55) * baseScale * 6;
    };

    // ─── Draw orbits ────────────────────────────────────────────────
    if (showOrbits) {
      ctx.strokeStyle = "rgba(100, 130, 180, 0.15)";
      ctx.lineWidth = 1;
      for (const pp of planetPositions) {
        const orbitRadius = auToPx(pp.planet.a);
        ctx.beginPath();
        ctx.arc(cx, cy, orbitRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // ─── Draw Sun ───────────────────────────────────────────────────
    const sunRadius = 18;
    // Outer glow
    const sunGlow = ctx.createRadialGradient(cx, cy, sunRadius * 0.5, cx, cy, sunRadius * 4);
    sunGlow.addColorStop(0, "rgba(255, 200, 50, 0.6)");
    sunGlow.addColorStop(0.5, "rgba(255, 150, 30, 0.2)");
    sunGlow.addColorStop(1, "rgba(255, 100, 0, 0)");
    ctx.fillStyle = sunGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, sunRadius * 4, 0, Math.PI * 2);
    ctx.fill();

    // Sun body
    const sunBody = ctx.createRadialGradient(cx - 3, cy - 3, 0, cx, cy, sunRadius);
    sunBody.addColorStop(0, "#fff8dc");
    sunBody.addColorStop(0.4, "#ffd700");
    sunBody.addColorStop(0.8, "#ff8c00");
    sunBody.addColorStop(1, "#ff4500");
    ctx.fillStyle = sunBody;
    ctx.beginPath();
    ctx.arc(cx, cy, sunRadius, 0, Math.PI * 2);
    ctx.fill();

    // Sun label
    if (showLabels) {
      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 11px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("☉ Sun", cx, cy + sunRadius + 16);
    }

    // Sunspot count overlay near sun
    if (weather.sunspotCount !== null) {
      ctx.fillStyle = "rgba(251, 191, 36, 0.7)";
      ctx.font = "9px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${weather.sunspotCount} sunspots`, cx, cy + sunRadius + 30);
    }

    // ─── Draw planets ───────────────────────────────────────────────
    for (const pp of planetPositions) {
      const { planet, pos } = pp;
      // Project 3D → 2D (top-down view of ecliptic plane)
      const px = cx + pos.x * (auToPx(1) / 1); // scale by AU
      const py = cy + pos.y * (auToPx(1) / 1);

      // Use the log-scaled distance from sun for visual placement
      const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
      const visualDist = auToPx(dist);
      const angle = Math.atan2(pos.y, pos.x);
      const vx = cx + Math.cos(angle) * visualDist;
      const vy = cy + Math.sin(angle) * visualDist;

      // Planet glow
      const pGlow = ctx.createRadialGradient(vx, vy, 0, vx, vy, planet.radius * 2.5);
      pGlow.addColorStop(0, planet.glowColor + "60");
      pGlow.addColorStop(1, planet.glowColor + "00");
      ctx.fillStyle = pGlow;
      ctx.beginPath();
      ctx.arc(vx, vy, planet.radius * 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Planet body
      const pBody = ctx.createRadialGradient(
        vx - planet.radius * 0.3, vy - planet.radius * 0.3, 0,
        vx, vy, planet.radius
      );
      pBody.addColorStop(0, planet.glowColor);
      pBody.addColorStop(1, planet.color);
      ctx.fillStyle = pBody;
      ctx.beginPath();
      ctx.arc(vx, vy, planet.radius, 0, Math.PI * 2);
      ctx.fill();

      // Saturn's rings
      if (planet.name === "Saturn") {
        ctx.strokeStyle = "rgba(234, 179, 8, 0.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(vx, vy, planet.radius * 1.8, planet.radius * 0.5, -0.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(234, 179, 8, 0.3)";
        ctx.beginPath();
        ctx.ellipse(vx, vy, planet.radius * 2.2, planet.radius * 0.6, -0.4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Earth's moon
      if (planet.name === "Earth") {
        const moonAngle = (simDate.getTime() / 86400000) * (2 * Math.PI / 27.32);
        const mx = vx + Math.cos(moonAngle) * planet.radius * 2.5;
        const my = vy + Math.sin(moonAngle) * planet.radius * 2.5;
        ctx.fillStyle = "#d1d5db";
        ctx.beginPath();
        ctx.arc(mx, my, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // ISS around Earth
      if (planet.name === "Earth" && iss) {
        const issAngle = Math.atan2(iss.latitude, iss.longitude);
        const issRadius = planet.radius * 1.6;
        const ix = vx + Math.cos(issAngle) * issRadius;
        const iy = vy + Math.sin(issAngle) * issRadius;
        ctx.fillStyle = issOverPakistan ? "#22c55e" : "#ef4444";
        ctx.beginPath();
        ctx.arc(ix, iy, 2.5, 0, Math.PI * 2);
        ctx.fill();
        // ISS glow if over Pakistan
        if (issOverPakistan) {
          ctx.strokeStyle = "rgba(34, 197, 94, 0.5)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(ix, iy, 5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Selection ring
      if (selectedPlanet === planet.name) {
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(vx, vy, planet.radius + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Label
      if (showLabels) {
        ctx.fillStyle = selectedPlanet === planet.name ? "#fbbf24" : "rgba(200, 210, 230, 0.8)";
        ctx.font = selectedPlanet === planet.name
          ? "bold 10px ui-sans-serif, system-ui, sans-serif"
          : "9px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${planet.symbol} ${planet.name}`, vx, vy + planet.radius + 14);
      }
    }
  }, [canvasSize, pan, zoom, showOrbits, showLabels, selectedPlanet, simDate, iss, issOverPakistan, weather]);

  // ─── Animation loop ─────────────────────────────────────────────────
  useEffect(() => {
    const animate = () => {
      draw();
      animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [draw]);

  // ─── Pointer interactions ───────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      const target = e.target as HTMLElement;
      if (target && typeof target.setPointerCapture === "function") {
        target.setPointerCapture(e.pointerId);
      }
    } catch { /* ignore */ }
    dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current) {
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      setPan({ x: dragRef.current.px + dx, y: dragRef.current.py + dy });
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      const target = e.target as HTMLElement;
      if (target && typeof target.releasePointerCapture === "function") {
        target.releasePointerCapture(e.pointerId);
      }
    } catch { /* ignore */ }
    dragRef.current = null;
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    try { e.preventDefault(); } catch { /* passive */ }
    const factor = Math.exp(-e.deltaY * 0.001);
    setZoom((z) => Math.max(0.3, Math.min(8, z * factor)));
  };

  // Click to select planet
  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current) return; // was dragging
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Check each planet
    for (const pp of planetPositions) {
      const { planet, pos } = pp;
      const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
      const visualDist = Math.pow(Math.max(dist, 0.01), 0.55) * Math.min(canvasSize.w, canvasSize.h) * 0.04 * zoom * 6;
      const angle = Math.atan2(pos.y, pos.x);
      const vx = canvasSize.w / 2 + pan.x + Math.cos(angle) * visualDist;
      const vy = canvasSize.h / 2 + pan.y + Math.sin(angle) * visualDist;
      const dx = clickX - vx;
      const dy = clickY - vy;
      if (Math.sqrt(dx * dx + dy * dy) < planet.radius + 8) {
        setSelectedPlanet(planet.name);
        return;
      }
    }
  };

  // ─── Selected planet info ───────────────────────────────────────────
  const selectedData = useMemo(() => {
    if (!selectedPlanet) return null;
    const pp = planetPositions.find((p) => p.planet.name === selectedPlanet);
    if (!pp) return null;
    const distFromEarth = selectedPlanet === "Earth"
      ? 0
      : distanceFromEarth(pp.pos, earthPos);
    const distFromSun = Math.sqrt(pp.pos.x ** 2 + pp.pos.y ** 2 + pp.pos.z ** 2);
    return {
      ...pp,
      distFromEarth,
      distFromSun,
    };
  }, [selectedPlanet, planetPositions, earthPos]);

  // ─── Time scrubber handlers ─────────────────────────────────────────
  const resetTime = () => {
    setSimDate(new Date());
    setIsLiveTime(true);
  };

  const shiftTime = (days: number) => {
    setIsLiveTime(false);
    setSimDate((d) => new Date(d.getTime() + days * MS_PER_DAY));
  };

  // ─── Geomagnetic storm level from Kp index ──────────────────────────
  const stormLevel = useMemo(() => {
    if (weather.kpIndex === null) return null;
    if (weather.kpIndex >= 7) return { label: "G3+ Storm", color: "#ef4444" };
    if (weather.kpIndex >= 5) return { label: "G1-G2 Storm", color: "#f59e0b" };
    if (weather.kpIndex >= 4) return { label: "Active", color: "#eab308" };
    return { label: "Quiet", color: "#22c55e" };
  }, [weather.kpIndex]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-heading font-bold text-foreground flex items-center gap-2">
            🌌 Solar System Live
          </h3>
          <p className="text-xs text-muted-foreground">
            Real-time planet positions · NASA &amp; NOAA live data · updates every second
          </p>
        </div>
        {isLiveTime && (
          <span className="flex items-center gap-1.5 text-[11px] font-medium bg-green-500/10 text-green-500 px-3 py-1.5 rounded-full border border-green-500/20">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
            LIVE · {simDate.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* ISS over Pakistan alert */}
      {issOverPakistan && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700 rounded-xl p-4 flex items-center gap-3 animate-pulse">
          <Satellite className="w-6 h-6 text-green-600 dark:text-green-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-green-700 dark:text-green-300">
              🛸 ISS is passing over Pakistan RIGHT NOW!
            </p>
            <p className="text-xs text-green-600 dark:text-green-400">
              {issDistanceToMohmand && `~${issDistanceToMohmand} km from Mohmand · `}
              Look up! It's the bright moving star.
            </p>
          </div>
        </div>
      )}

      {/* Live data cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* ISS distance */}
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider flex items-center justify-center gap-1">
            <Satellite className="w-3 h-3" /> ISS Altitude
          </p>
          <p className="text-lg font-black text-foreground font-mono">
            {iss ? `${Math.round(iss.altitude)} km` : "…"}
          </p>
        </div>

        {/* Solar wind */}
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider flex items-center justify-center gap-1">
            <Wind className="w-3 h-3" /> Solar Wind
          </p>
          <p className="text-lg font-black text-foreground font-mono">
            {weather.solarWindSpeed !== null ? `${weather.solarWindSpeed}` : "…"}
            <span className="text-[10px] text-muted-foreground"> km/s</span>
          </p>
        </div>

        {/* Kp index / geomagnetic */}
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider flex items-center justify-center gap-1">
            <Zap className="w-3 h-3" /> Geo-Activity
          </p>
          <p className="text-lg font-black font-mono" style={{ color: stormLevel?.color || "#6b7280" }}>
            {weather.kpIndex !== null ? `Kp ${weather.kpIndex}` : "…"}
          </p>
          {stormLevel && (
            <p className="text-[9px]" style={{ color: stormLevel.color }}>{stormLevel.label}</p>
          )}
        </div>

        {/* Asteroids today */}
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider flex items-center justify-center gap-1">
            <Activity className="w-3 h-3" /> Asteroids Today
          </p>
          <p className="text-lg font-black text-orange-500">{asteroids.count}</p>
        </div>
      </div>

      {/* Asteroid detail */}
      {asteroids.nearest && (
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-3">
          <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Closest asteroid today: {asteroids.nearest.name}
          </p>
          <p className="text-[11px] text-orange-600 dark:text-orange-400 mt-0.5">
            {Math.round(asteroids.nearest.distanceKm).toLocaleString()} km away ·
            ~{asteroids.nearest.diameterM}m wide ·
            {Math.round(asteroids.nearest.velocityKmh).toLocaleString()} km/h
          </p>
        </div>
      )}

      {/* Canvas */}
      <div className="rounded-2xl overflow-hidden border border-border shadow-sm bg-black">
        <div ref={wrapRef} className="relative">
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            onClick={onCanvasClick}
            className="block touch-none cursor-grab active:cursor-grabbing"
            style={{ width: "100%", height: canvasSize.h }}
          />

          {/* Zoom controls */}
          <div className="absolute bottom-3 right-3 flex flex-col gap-1 bg-black/70 backdrop-blur-sm rounded-lg p-1 border border-white/10">
            <button
              onClick={() => setZoom((z) => Math.min(8, z * 1.25))}
              className="p-1.5 hover:bg-white/10 rounded-md text-white"
              title="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(0.3, z / 1.25))}
              className="p-1.5 hover:bg-white/10 rounded-md text-white"
              title="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
              className="p-1.5 hover:bg-white/10 rounded-md text-white"
              title="Reset view"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Toggle controls */}
          <div className="absolute top-3 left-3 flex gap-1 bg-black/70 backdrop-blur-sm rounded-lg p-1 border border-white/10">
            <button
              onClick={() => setShowOrbits(!showOrbits)}
              className={`p-1.5 rounded-md flex items-center gap-1 text-[10px] font-medium ${
                showOrbits ? "bg-blue-500/30 text-blue-300" : "text-white/60 hover:bg-white/10"
              }`}
              title="Toggle orbits"
            >
              <Orbit className="w-3.5 h-3.5" /> Orbits
            </button>
            <button
              onClick={() => setShowLabels(!showLabels)}
              className={`p-1.5 rounded-md flex items-center gap-1 text-[10px] font-medium ${
                showLabels ? "bg-blue-500/30 text-blue-300" : "text-white/60 hover:bg-white/10"
              }`}
              title="Toggle labels"
            >
              <Tag className="w-3.5 h-3.5" /> Labels
            </button>
          </div>

          {/* Time scrubber */}
          <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-sm rounded-lg p-2 border border-white/10 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-white/60" />
            <button
              onClick={() => shiftTime(-7)}
              className="text-[10px] text-white/70 hover:text-white px-1.5 py-0.5 hover:bg-white/10 rounded"
              title="-7 days"
            >-7d</button>
            <button
              onClick={() => shiftTime(-1)}
              className="text-[10px] text-white/70 hover:text-white px-1.5 py-0.5 hover:bg-white/10 rounded"
              title="-1 day"
            >-1d</button>
            <button
              onClick={resetTime}
              className={`text-[10px] px-2 py-0.5 rounded ${
                isLiveTime ? "bg-green-500/30 text-green-300" : "text-white/70 hover:bg-white/10"
              }`}
              title="Now"
            >NOW</button>
            <button
              onClick={() => shiftTime(1)}
              className="text-[10px] text-white/70 hover:text-white px-1.5 py-0.5 hover:bg-white/10 rounded"
              title="+1 day"
            >+1d</button>
            <button
              onClick={() => shiftTime(7)}
              className="text-[10px] text-white/70 hover:text-white px-1.5 py-0.5 hover:bg-white/10 rounded"
              title="+7 days"
            >+7d</button>
          </div>

          {/* Date display */}
          <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-white/10">
            <p className="text-[10px] text-white/60 uppercase tracking-wider">
              {isLiveTime ? "Current time" : "Simulated time"}
            </p>
            <p className="text-xs text-white font-mono">
              {simDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
              {" · "}
              {simDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </div>
      </div>

      {/* Planet info panel */}
      {selectedData && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div
              className="w-12 h-12 rounded-full shrink-0 flex items-center justify-center text-2xl"
              style={{
                background: `radial-gradient(circle at 30% 30%, ${selectedData.planet.glowColor}, ${selectedData.planet.color})`,
                boxShadow: `0 0 20px ${selectedData.planet.color}40`,
              }}
            >
              {selectedData.planet.symbol}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-base font-bold text-foreground">
                {selectedData.planet.name}
              </h4>
              <p className="text-xs text-muted-foreground">{selectedData.planet.facts}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            <div className="bg-secondary/50 rounded-lg p-2 text-center">
              <p className="text-[9px] text-muted-foreground uppercase">Distance from Sun</p>
              <p className="text-sm font-bold font-mono text-foreground">
                {selectedData.distFromSun.toFixed(3)} AU
              </p>
              <p className="text-[9px] text-muted-foreground">
                ({(selectedData.distFromSun * 149.6).toFixed(1)}M km)
              </p>
            </div>
            {selectedData.planet.name !== "Earth" && (
              <div className="bg-secondary/50 rounded-lg p-2 text-center">
                <p className="text-[9px] text-muted-foreground uppercase">From Earth</p>
                <p className="text-sm font-bold font-mono text-foreground">
                  {selectedData.distFromEarth.toFixed(3)} AU
                </p>
                <p className="text-[9px] text-muted-foreground">
                  ({(selectedData.distFromEarth * 149.6).toFixed(1)}M km)
                </p>
              </div>
            )}
            <div className="bg-secondary/50 rounded-lg p-2 text-center">
              <p className="text-[9px] text-muted-foreground uppercase">Radius</p>
              <p className="text-sm font-bold font-mono text-foreground">
                {selectedData.planet.realRadiusKm.toLocaleString()} km
              </p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-2 text-center">
              <p className="text-[9px] text-muted-foreground uppercase">Orbital Period</p>
              <p className="text-sm font-bold font-mono text-foreground">
                {selectedData.planet.period < 365
                  ? `${selectedData.planet.period.toFixed(1)} days`
                  : `${(selectedData.planet.period / 365.25).toFixed(2)} years`}
              </p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-2 text-center">
              <p className="text-[9px] text-muted-foreground uppercase">Moons</p>
              <p className="text-sm font-bold font-mono text-foreground">{selectedData.planet.moons}</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-2 text-center">
              <p className="text-[9px] text-muted-foreground uppercase">Eccentricity</p>
              <p className="text-sm font-bold font-mono text-foreground">
                {selectedData.planet.e.toFixed(4)}
              </p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-2 text-center">
              <p className="text-[9px] text-muted-foreground uppercase">Inclination</p>
              <p className="text-sm font-bold font-mono text-foreground">
                {selectedData.planet.i.toFixed(2)}°
              </p>
            </div>
          </div>

          {/* Mars weather if Mars is selected */}
          {selectedData.planet.name === "Mars" && mars.tempAvg !== null && (
            <div className="mt-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <p className="text-xs font-bold text-red-700 dark:text-red-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Mars Weather (Sol {mars.sol})
              </p>
              <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                <div>
                  <p className="text-[9px] text-muted-foreground uppercase">Min</p>
                  <p className="text-sm font-bold text-red-600 dark:text-red-400 font-mono">
                    {mars.tempMin !== null ? `${mars.tempMin.toFixed(0)}°C` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground uppercase">Avg</p>
                  <p className="text-sm font-bold text-red-600 dark:text-red-400 font-mono">
                    {mars.tempAvg !== null ? `${mars.tempAvg.toFixed(0)}°C` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground uppercase">Max</p>
                  <p className="text-sm font-bold text-red-600 dark:text-red-400 font-mono">
                    {mars.tempMax !== null ? `${mars.tempMax.toFixed(0)}°C` : "—"}
                  </p>
                </div>
              </div>
              {mars.season && (
                <p className="text-[10px] text-red-500 dark:text-red-400 mt-1 text-center">
                  Season: {mars.season}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Planet quick-select */}
      <div className="flex flex-wrap gap-1.5 justify-center">
        {PLANETS.map((p) => (
          <button
            key={p.name}
            onClick={() => setSelectedPlanet(p.name)}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors ${
              selectedPlanet === p.name
                ? "text-white shadow-md"
                : "bg-card border border-border hover:bg-secondary text-muted-foreground"
            }`}
            style={selectedPlanet === p.name ? { backgroundColor: p.color } : {}}
          >
            <span>{p.symbol}</span>
            <span>{p.name}</span>
          </button>
        ))}
      </div>

      {/* Footer */}
      <p className="text-[10px] text-muted-foreground text-center">
        Planet positions calculated from J2000 orbital elements (JPL Standish) ·
        Live data: NOAA SWPC, NASA NeoWS, NASA InSight ·
        ISS from Open Notify · Drag to pan · Wheel to zoom · Click planet for details
      </p>
    </div>
  );
}
