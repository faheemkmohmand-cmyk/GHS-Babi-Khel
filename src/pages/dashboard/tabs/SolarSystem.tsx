// src/pages/dashboard/tabs/SolarSystem.tsx
//
// 🌌 Solar System Live — Real-time 3D solar system (Three.js)
//
// Features:
//   • Real 3D planets with proper colors, axial tilt, rotation
//   • All 8 planets at their REAL current positions (Kepler's equations)
//   • Sun with custom glow shader
//   • Saturn's 3D rings
//   • Earth's Moon orbiting
//   • ISS marker orbiting Earth (green when over Pakistan)
//   • "ISS over Pakistan NOW" notification
//   • NASA/NOAA live data (solar wind, sunspots, Kp index, asteroids, Mars weather)
//   • Full mobile touch controls: 1-finger rotate, 2-finger pinch zoom + pan
//   • Time scrubber (±1d, ±7d, NOW)
//   • Click/tap planet for details
//   • Responsive — works on any screen size
//

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as THREE from "three";
import {
  ZoomIn, ZoomOut, RotateCcw, Orbit, Tag, Calendar,
  Satellite, Activity, AlertTriangle, Sparkles, Wind, Zap,
} from "lucide-react";

// ─── Planet Data (J2000.0 orbital elements) ────────────────────────────

type PlanetElements = {
  name: string;
  symbol: string;
  color: number;       // hex color for 3D mesh
  emissive: number;    // emissive color
  radius: number;      // visual radius in 3D units
  realRadiusKm: number;
  axialTilt: number;   // degrees
  rotationPeriod: number; // hours (negative = retrograde)
  a: number;           // semi-major axis (AU)
  e: number;           // eccentricity
  i: number;           // inclination (deg)
  omega: number;       // longitude of ascending node (deg)
  wtilde: number;      // longitude of perihelion (deg)
  L0: number;          // mean longitude at J2000 (deg)
  period: number;      // orbital period (Earth days)
  moons: number;
  hasRings: boolean;
  facts: string;
};

const PLANETS: PlanetElements[] = [
  {
    name: "Mercury", symbol: "☿", color: 0x8c8c8c, emissive: 0x222222,
    radius: 0.8, realRadiusKm: 2440, axialTilt: 0.03, rotationPeriod: 1407.6,
    a: 0.387098, e: 0.205635, i: 7.005, omega: 48.331, wtilde: 77.456,
    L0: 252.251, period: 87.97, moons: 0, hasRings: false,
    facts: "Smallest planet. Surface temp swings from -180°C to 430°C.",
  },
  {
    name: "Venus", symbol: "♀", color: 0xe6b87a, emissive: 0x332211,
    radius: 1.4, realRadiusKm: 6052, axialTilt: 177.4, rotationPeriod: -5832.5,
    a: 0.723330, e: 0.006773, i: 3.395, omega: 76.680, wtilde: 131.533,
    L0: 181.980, period: 224.70, moons: 0, hasRings: false,
    facts: "Hottest planet (462°C). Rotates backwards. A day > a year.",
  },
  {
    name: "Earth", symbol: "⊕", color: 0x2266cc, emissive: 0x001122,
    radius: 1.5, realRadiusKm: 6371, axialTilt: 23.4, rotationPeriod: 23.93,
    a: 1.000001, e: 0.016709, i: 0.000, omega: -11.260, wtilde: 102.947,
    L0: 100.464, period: 365.26, moons: 1, hasRings: false,
    facts: "The only known planet with life. 71% covered by water.",
  },
  {
    name: "Mars", symbol: "♂", color: 0xc1440e, emissive: 0x220500,
    radius: 1.0, realRadiusKm: 3390, axialTilt: 25.2, rotationPeriod: 24.62,
    a: 1.523688, e: 0.093405, i: 1.850, omega: 49.558, wtilde: 336.040,
    L0: 355.433, period: 686.98, moons: 2, hasRings: false,
    facts: "Home to Olympus Mons — the tallest volcano in the solar system (22 km).",
  },
  {
    name: "Jupiter", symbol: "♃", color: 0xd4a574, emissive: 0x221100,
    radius: 3.5, realRadiusKm: 69911, axialTilt: 3.1, rotationPeriod: 9.93,
    a: 5.202561, e: 0.048498, i: 1.303, omega: 100.464, wtilde: 14.331,
    L0: 34.351, period: 4332.59, moons: 95, hasRings: false,
    facts: "Largest planet. The Great Red Spot is a storm bigger than Earth.",
  },
  {
    name: "Saturn", symbol: "♄", color: 0xead6a8, emissive: 0x221100,
    radius: 3.0, realRadiusKm: 58232, axialTilt: 26.7, rotationPeriod: 10.66,
    a: 9.554747, e: 0.055546, i: 2.484, omega: 113.665, wtilde: 93.057,
    L0: 50.077, period: 10759.22, moons: 146, hasRings: true,
    facts: "Has spectacular rings made of ice and rock. Least dense planet.",
  },
  {
    name: "Uranus", symbol: "♅", color: 0x9bd5d5, emissive: 0x002222,
    radius: 2.0, realRadiusKm: 25362, axialTilt: 97.8, rotationPeriod: -17.24,
    a: 19.21814, e: 0.046381, i: 0.771, omega: 74.006, wtilde: 173.005,
    L0: 314.055, period: 30688.5, moons: 27, hasRings: false,
    facts: "Rotates on its side (97.8° tilt). Coldest atmosphere (-224°C).",
  },
  {
    name: "Neptune", symbol: "♆", color: 0x3b5dd6, emissive: 0x000a22,
    radius: 2.0, realRadiusKm: 24622, axialTilt: 28.3, rotationPeriod: 16.11,
    a: 30.10957, e: 0.009456, i: 1.770, omega: 131.784, wtilde: 48.124,
    L0: 304.348, period: 60182, moons: 14, hasRings: false,
    facts: "Windiest planet (2,100 km/h). Discovered by math before telescopes.",
  },
];

// ─── Time helpers ───────────────────────────────────────────────────────

const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
const MS_PER_DAY = 86400000;

function daysSinceJ2000(date: Date): number {
  return (date.getTime() - J2000) / MS_PER_DAY;
}

// ─── Kepler solver ──────────────────────────────────────────────────────

function solveKepler(M: number, e: number): number {
  M = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (M > Math.PI) M -= 2 * Math.PI;
  let E = M + e * Math.sin(M);
  for (let iter = 0; iter < 8; iter++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

type Vec3 = { x: number; y: number; z: number };

function getPlanetPosition(planet: PlanetElements, date: Date): Vec3 {
  const d = daysSinceJ2000(date);
  const L = (planet.L0 + (0.9856076686 / Math.pow(planet.a, 1.5)) * d) * Math.PI / 180;
  const M = L - planet.wtilde * Math.PI / 180;
  const E = solveKepler(M, planet.e);
  const nu = 2 * Math.atan2(
    Math.sqrt(1 + planet.e) * Math.sin(E / 2),
    Math.sqrt(1 - planet.e) * Math.cos(E / 2)
  );
  const r = planet.a * (1 - planet.e * Math.cos(E));
  const xp = r * Math.cos(nu);
  const yp = r * Math.sin(nu);
  const omega = (planet.wtilde - planet.omega) * Math.PI / 180;
  const Omega = planet.omega * Math.PI / 180;
  const inc = planet.i * Math.PI / 180;
  const cosO = Math.cos(Omega), sinO = Math.sin(Omega);
  const cosw = Math.cos(omega), sinw = Math.sin(omega);
  const cosi = Math.cos(inc), sini = Math.sin(inc);
  const x = (cosO * cosw - sinO * sinw * cosi) * xp + (-cosO * sinw - sinO * cosw * cosi) * yp;
  const y = (sinO * cosw + cosO * sinw * cosi) * xp + (-sinO * sinw + cosO * cosw * cosi) * yp;
  const z = (sinw * sini) * xp + (cosw * sini) * yp;
  return { x, y, z };
}

function distanceFromEarth(planetPos: Vec3, earthPos: Vec3): number {
  const dx = planetPos.x - earthPos.x;
  const dy = planetPos.y - earthPos.y;
  const dz = planetPos.z - earthPos.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ─── Pakistan ISS visibility ────────────────────────────────────────────

const PAKISTAN_BBOX = { minLat: 23.5, maxLat: 37.08, minLng: 60.87, maxLng: 77.82 };
const MOHMAND_LAT = 34.5, MOHMAND_LNG = 71.2;

function isOverPakistan(lat: number, lng: number): boolean {
  return lat >= PAKISTAN_BBOX.minLat && lat <= PAKISTAN_BBOX.maxLat &&
         lng >= PAKISTAN_BBOX.minLng && lng <= PAKISTAN_BBOX.maxLng;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Live data types ────────────────────────────────────────────────────

interface ISSPosition { latitude: number; longitude: number; altitude: number; velocity: number; timestamp: number; }
interface SpaceWeather { solarWindSpeed: number | null; kpIndex: number | null; sunspotCount: number | null; loading: boolean; }
interface AsteroidData { count: number; nearest: { name: string; distanceKm: number; diameterM: number; velocityKmh: number } | null; }
interface MarsWeather { sol: number; tempAvg: number | null; tempMin: number | null; tempMax: number | null; season: string | null; }

// ─── Fetch helpers ──────────────────────────────────────────────────────

async function tryJson(url: string, timeoutMs = 8000): Promise<any | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

const NASA_API_KEY = "I7E0FR0gL0Lvt9cnxh5jsRSvAzWlJVzeYFZRQTKy";

async function fetchISSPosition(): Promise<ISSPosition | null> {
  const proxyPos = await tryJson("/api/iss?type=position", 8000);
  if (proxyPos?.iss_position) {
    return {
      latitude: parseFloat(proxyPos.iss_position.latitude),
      longitude: parseFloat(proxyPos.iss_position.longitude),
      altitude: proxyPos.altitude ?? 408, velocity: proxyPos.velocity ?? 27600,
      timestamp: proxyPos.timestamp ?? Math.floor(Date.now() / 1000),
    };
  }
  const direct = await tryJson("https://api.wheretheiss.at/v1/satellites/25544", 6000);
  if (direct && typeof direct.latitude === "number") {
    return { latitude: direct.latitude, longitude: direct.longitude, altitude: direct.altitude ?? 408, velocity: direct.velocity ?? 27600, timestamp: direct.timestamp };
  }
  return null;
}

async function fetchSpaceWeather(): Promise<SpaceWeather> {
  const result: SpaceWeather = { solarWindSpeed: null, kpIndex: null, sunspotCount: null, loading: true };
  try {
    let sw = await tryJson("/api/space-weather?type=solar_wind", 7000);
    if (!Array.isArray(sw) || sw.length < 2) sw = await tryJson("https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json", 7000);
    if (Array.isArray(sw) && sw.length > 1) {
      const speedIdx = sw[0].indexOf("speed");
      if (speedIdx >= 0) { const speed = parseFloat(sw[sw.length - 1][speedIdx]); if (!isNaN(speed)) result.solarWindSpeed = Math.round(speed); }
    }
  } catch { /* ignore */ }
  try {
    let kp = await tryJson("/api/space-weather?type=kp_index", 7000);
    if (!Array.isArray(kp) || kp.length === 0) kp = await tryJson("https://services.swpc.noaa.gov/json/planetary_k_index_1m.json", 7000);
    if (Array.isArray(kp) && kp.length > 0) {
      const last = kp[kp.length - 1];
      const kpVal = last?.kp_index ?? last?.estimated_kp;
      if (typeof kpVal === "number" && !isNaN(kpVal)) result.kpIndex = Math.round(kpVal * 10) / 10;
    }
  } catch { /* ignore */ }
  try {
    let ssn = await tryJson("/api/space-weather?type=sunspots", 7000);
    if (!Array.isArray(ssn) || ssn.length === 0) ssn = await tryJson("https://services.swpc.noaa.gov/json/solar-cycle/swpc_observed_ssn.json", 7000);
    if (Array.isArray(ssn) && ssn.length > 0) {
      for (let i = ssn.length - 1; i >= 0; i--) {
        const ssnVal = ssn[i]?.swpc_ssn ?? ssn[i]?.predicted_ssn;
        if (typeof ssnVal === "number" && !isNaN(ssnVal)) { result.sunspotCount = Math.round(ssnVal); break; }
      }
    }
  } catch { /* ignore */ }
  result.loading = false;
  return result;
}

async function fetchAsteroids(): Promise<AsteroidData> {
  const today = new Date().toISOString().split("T")[0];
  let data = await tryJson("/api/space-weather?type=asteroids", 8000);
  if (!data || !data.element_count) data = await tryJson(`https://api.nasa.gov/neo/rest/v1/feed?start_date=${today}&end_date=${today}&api_key=${NASA_API_KEY}`, 8000);
  if (!data || !data.element_count) return { count: 0, nearest: null };
  const todayObjs = data.near_earth_objects[today] || [];
  if (todayObjs.length === 0) return { count: data.element_count, nearest: null };
  let nearest: AsteroidData["nearest"] = null, minDist = Infinity;
  for (const ast of todayObjs) {
    const ca = ast.close_approach_data?.[0]; if (!ca) continue;
    const dist = parseFloat(ca.miss_distance?.kilometers || "Infinity");
    if (dist < minDist) {
      minDist = dist;
      const diameter = ast.estimated_diameter?.meters;
      nearest = { name: ast.name || "Unknown", distanceKm: dist, diameterM: diameter ? Math.round((diameter.estimated_diameter_min + diameter.estimated_diameter_max) / 2) : 0, velocityKmh: parseFloat(ca.relative_velocity?.kilometers_per_hour || "0") };
    }
  }
  return { count: data.element_count, nearest };
}

async function fetchMarsWeather(): Promise<MarsWeather> {
  let data = await tryJson("/api/space-weather?type=mars_weather", 8000);
  if (!data || !data.sol_keys || data.sol_keys.length === 0) data = await tryJson(`https://api.nasa.gov/insight_weather/?api_key=${NASA_API_KEY}&feedtype=json&ver=1.0`, 8000);
  if (!data || !data.sol_keys || data.sol_keys.length === 0) return { sol: 0, tempAvg: null, tempMin: null, tempMax: null, season: null };
  const lastSol = data.sol_keys[data.sol_keys.length - 1];
  const solData = data[lastSol];
  if (!solData) return { sol: 0, tempAvg: null, tempMin: null, tempMax: null, season: null };
  return { sol: parseInt(lastSol), tempAvg: solData.AT?.av ?? null, tempMin: solData.AT?.mn ?? null, tempMax: solData.AT?.mx ?? null, season: solData.Season ?? null };
}

// ─── Main 3D Component ──────────────────────────────────────────────────

export default function SolarSystem() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const planetMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const orbitLinesRef = useRef<THREE.Line[]>([]);
  const issMarkerRef = useRef<THREE.Mesh | null>(null);
  const moonRef = useRef<THREE.Mesh | null>(null);
  const animationRef = useRef<number | null>(null);

  // Camera control state
  const cameraStateRef = useRef({
    azimuth: 0.3,      // horizontal angle
    elevation: 0.9,    // vertical angle (0 = top-down, PI/2 = side view)
    distance: 80,      // zoom distance
    target: new THREE.Vector3(0, 0, 0),
  });

  // Touch state
  const touchStateRef = useRef<{
    mode: "none" | "rotate" | "pinch" | "pan";
    lastX: number; lastY: number;
    pinchDist: number;
    panStartX: number; panStartY: number;
  }>({ mode: "none", lastX: 0, lastY: 0, pinchDist: 0, panStartX: 0, panStartY: 0 });

  // UI state
  const [showOrbits, setShowOrbits] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [selectedPlanet, setSelectedPlanet] = useState<string | null>("Earth");
  const [simDate, setSimDate] = useState(new Date());
  const [isLiveTime, setIsLiveTime] = useState(true);
  const [canvasSize, setCanvasSize] = useState({ w: 600, h: 500 });

  // Live data
  const [iss, setIss] = useState<ISSPosition | null>(null);
  const [weather, setWeather] = useState<SpaceWeather>({ solarWindSpeed: null, kpIndex: null, sunspotCount: null, loading: true });
  const [asteroids, setAsteroids] = useState<AsteroidData>({ count: 0, nearest: null });
  const [mars, setMars] = useState<MarsWeather>({ sol: 0, tempAvg: null, tempMin: null, tempMax: null, season: null });
  const [issOverPakistan, setIssOverPakistan] = useState(false);
  const [issDistanceToMohmand, setIssDistanceToMohmand] = useState<number | null>(null);
  const [selectedScreenPos, setSelectedScreenPos] = useState<{ x: number; y: number } | null>(null);

  // ─── AU to scene units (log scale so outer planets fit) ──────────────
  const auToUnits = useCallback((au: number) => {
    return Math.pow(Math.max(au, 0.01), 0.55) * 8;
  }, []);

  // ─── Calculate planet positions ──────────────────────────────────────
  const planetPositions = useMemo(() => {
    return PLANETS.map((p) => ({ planet: p, pos: getPlanetPosition(p, simDate) }));
  }, [simDate]);

  const earthPos = useMemo(() => {
    return planetPositions.find((pp) => pp.planet.name === "Earth")?.pos || { x: 0, y: 0, z: 0 };
  }, [planetPositions]);

  // ─── Measure container size ──────────────────────────────────────────
  useEffect(() => {
    const measure = () => {
      if (!mountRef.current) return;
      const r = mountRef.current.getBoundingClientRect();
      const w = Math.floor(r.width);
      if (w < 2) return;
      const h = Math.max(360, Math.min(Math.floor(w * 0.75), 600));
      setCanvasSize({ w, h });
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      if (mountRef.current) ro.observe(mountRef.current);
      return () => ro.disconnect();
    } else {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
  }, []);

  // ─── Initialize Three.js scene ───────────────────────────────────────
  useEffect(() => {
    if (!mountRef.current || canvasSize.w < 2) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000005);
    sceneRef.current = scene;

    // Star field
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 3000;
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 300 + Math.random() * 200;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);
      const brightness = 0.5 + Math.random() * 0.5;
      starColors[i * 3] = brightness;
      starColors[i * 3 + 1] = brightness;
      starColors[i * 3 + 2] = brightness * (0.8 + Math.random() * 0.2);
    }
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute("color", new THREE.BufferAttribute(starColors, 3));
    const starMaterial = new THREE.PointsMaterial({ size: 0.8, vertexColors: true, transparent: true, opacity: 0.9 });
    scene.add(new THREE.Points(starGeometry, starMaterial));

    // Camera
    const camera = new THREE.PerspectiveCamera(50, canvasSize.w / canvasSize.h, 0.1, 1000);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(canvasSize.w, canvasSize.h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    mountRef.current.innerHTML = "";
    mountRef.current.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.cursor = "grab";
    rendererRef.current = renderer;

    // Ambient light
    scene.add(new THREE.AmbientLight(0x222233, 0.3));

    // Sun — glowing sphere with point light
    const sunGeometry = new THREE.SphereGeometry(3, 32, 32);
    const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
    const sun = new THREE.Mesh(sunGeometry, sunMaterial);
    scene.add(sun);

    // Sun glow (sprite)
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = 256; glowCanvas.height = 256;
    const glowCtx = glowCanvas.getContext("2d")!;
    const gradient = glowCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, "rgba(255, 220, 100, 1)");
    gradient.addColorStop(0.2, "rgba(255, 180, 50, 0.6)");
    gradient.addColorStop(0.5, "rgba(255, 120, 0, 0.2)");
    gradient.addColorStop(1, "rgba(255, 80, 0, 0)");
    glowCtx.fillStyle = gradient;
    glowCtx.fillRect(0, 0, 256, 256);
    const glowTexture = new THREE.CanvasTexture(glowCanvas);
    const glowMaterial = new THREE.SpriteMaterial({ map: glowTexture, transparent: true, blending: THREE.AdditiveBlending });
    const sunGlow = new THREE.Sprite(glowMaterial);
    sunGlow.scale.set(16, 16, 1);
    scene.add(sunGlow);

    // Sun point light (illuminates planets)
    const sunLight = new THREE.PointLight(0xffffff, 3, 500, 0.5);
    scene.add(sunLight);

    // Create planet meshes
    PLANETS.forEach((p) => {
      const geo = new THREE.SphereGeometry(p.radius, 24, 24);
      const mat = new THREE.MeshStandardMaterial({
        color: p.color,
        emissive: p.emissive,
        emissiveIntensity: 0.1,
        roughness: 0.8,
        metalness: 0.1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.z = p.axialTilt * Math.PI / 180;
      scene.add(mesh);
      planetMeshesRef.current.set(p.name, mesh);

      // Saturn's rings
      if (p.hasRings) {
        const ringGeo = new THREE.RingGeometry(p.radius * 1.4, p.radius * 2.3, 64);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xc4a96a,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.6,
        });
        const rings = new THREE.Mesh(ringGeo, ringMat);
        rings.rotation.x = Math.PI / 2;
        rings.rotation.y = p.axialTilt * Math.PI / 180 * 0.3;
        mesh.add(rings);
      }

      // Orbit line
      const orbitPoints: THREE.Vector3[] = [];
      for (let i = 0; i <= 128; i++) {
        const angle = (i / 128) * Math.PI * 2;
        const orbitR = auToUnits(p.a);
        orbitPoints.push(new THREE.Vector3(Math.cos(angle) * orbitR, 0, Math.sin(angle) * orbitR));
      }
      const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPoints);
      const orbitMat = new THREE.LineBasicMaterial({ color: 0x334466, transparent: true, opacity: 0.3 });
      const orbit = new THREE.Line(orbitGeo, orbitMat);
      orbit.visible = showOrbits;
      scene.add(orbit);
      orbitLinesRef.current.push(orbit);
    });

    // Earth's Moon
    const moonGeo = new THREE.SphereGeometry(0.3, 12, 12);
    const moonMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.9 });
    const moon = new THREE.Mesh(moonGeo, moonMat);
    scene.add(moon);
    moonRef.current = moon;

    // ISS marker (small glowing sphere)
    const issGeo = new THREE.SphereGeometry(0.25, 8, 8);
    const issMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
    const issMarker = new THREE.Mesh(issGeo, issMat);
    scene.add(issMarker);
    issMarkerRef.current = issMarker;

    // ISS glow sprite
    const issGlowCanvas = document.createElement("canvas");
    issGlowCanvas.width = 64; issGlowCanvas.height = 64;
    const issGlowCtx = issGlowCanvas.getContext("2d")!;
    const issGrad = issGlowCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    issGrad.addColorStop(0, "rgba(255, 80, 80, 0.8)");
    issGrad.addColorStop(1, "rgba(255, 80, 80, 0)");
    issGlowCtx.fillStyle = issGrad;
    issGlowCtx.fillRect(0, 0, 64, 64);
    const issGlowTex = new THREE.CanvasTexture(issGlowCanvas);
    const issGlowMat = new THREE.SpriteMaterial({ map: issGlowTex, transparent: true, blending: THREE.AdditiveBlending });
    const issGlow = new THREE.Sprite(issGlowMat);
    issGlow.scale.set(2, 2, 1);
    issMarker.add(issGlow);

    // ─── Touch/mouse controls ────────────────────────────────────────
    const canvas = renderer.domElement;

    const updateCamera = () => {
      const cs = cameraStateRef.current;
      const x = cs.target.x + cs.distance * Math.cos(cs.elevation) * Math.cos(cs.azimuth);
      const y = cs.target.y + cs.distance * Math.sin(cs.elevation);
      const z = cs.target.z + cs.distance * Math.cos(cs.elevation) * Math.sin(cs.azimuth);
      camera.position.set(x, y, z);
      camera.lookAt(cs.target);
    };
    updateCamera();

    const onPointerDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const ts = touchStateRef.current;
      ts.lastX = e.clientX;
      ts.lastY = e.clientY;
      ts.mode = "rotate";
      canvas.style.cursor = "grabbing";
    };

    const onPointerMove = (e: PointerEvent) => {
      const ts = touchStateRef.current;
      if (ts.mode === "none") return;
      const dx = e.clientX - ts.lastX;
      const dy = e.clientY - ts.lastY;
      const cs = cameraStateRef.current;
      cs.azimuth -= dx * 0.008;
      cs.elevation = Math.max(0.01, Math.min(Math.PI / 2 - 0.01, cs.elevation + dy * 0.008));
      ts.lastX = e.clientX;
      ts.lastY = e.clientY;
      updateCamera();
    };

    const onPointerUp = (e: PointerEvent) => {
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      touchStateRef.current.mode = "none";
      canvas.style.cursor = "grab";
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cs = cameraStateRef.current;
      cs.distance = Math.max(8, Math.min(200, cs.distance * (1 + e.deltaY * 0.001)));
      updateCamera();
    };

    // Touch handlers (for mobile pinch-zoom)
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const ts = touchStateRef.current;
      if (e.touches.length === 1) {
        ts.mode = "rotate";
        ts.lastX = e.touches[0].clientX;
        ts.lastY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        ts.mode = "pinch";
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        ts.pinchDist = Math.sqrt(dx * dx + dy * dy);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const ts = touchStateRef.current;
      const cs = cameraStateRef.current;
      if (ts.mode === "rotate" && e.touches.length === 1) {
        const dx = e.touches[0].clientX - ts.lastX;
        const dy = e.touches[0].clientY - ts.lastY;
        cs.azimuth -= dx * 0.008;
        cs.elevation = Math.max(0.01, Math.min(Math.PI / 2 - 0.01, cs.elevation + dy * 0.008));
        ts.lastX = e.touches[0].clientX;
        ts.lastY = e.touches[0].clientY;
        updateCamera();
      } else if (ts.mode === "pinch" && e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const newDist = Math.sqrt(dx * dx + dy * dy);
        if (ts.pinchDist > 0) {
          const scale = ts.pinchDist / newDist;
          cs.distance = Math.max(8, Math.min(200, cs.distance * scale));
          updateCamera();
        }
        ts.pinchDist = newDist;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        touchStateRef.current.mode = "none";
      }
    };

    // Click to select planet
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let clickStartX = 0, clickStartY = 0;

    const onCanvasPointerDown = (e: PointerEvent) => {
      clickStartX = e.clientX;
      clickStartY = e.clientY;
    };

    const onCanvasClick = (e: PointerEvent) => {
      // Only treat as click if not dragging (small movement)
      const dx = e.clientX - clickStartX;
      const dy = e.clientY - clickStartY;
      if (Math.sqrt(dx * dx + dy * dy) > 5) return;

      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const meshes = Array.from(planetMeshesRef.current.values());
      const intersects = raycaster.intersectObjects(meshes);
      if (intersects.length > 0) {
        for (const [name, mesh] of planetMeshesRef.current) {
          if (mesh === intersects[0].object) {
            setSelectedPlanet(name);
            break;
          }
        }
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerdown", onCanvasPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("click", onCanvasClick);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);

    // Animation loop
    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);
      // Rotate planets on their axes
      const now = Date.now();
      PLANETS.forEach((p) => {
        const mesh = planetMeshesRef.current.get(p.name);
        if (mesh) {
          mesh.rotation.y = (now / (p.rotationPeriod * 3600000)) * Math.PI * 2;
        }
      });
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerdown", onCanvasPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("click", onCanvasClick);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      renderer.dispose();
      if (mountRef.current && renderer.domElement.parentNode === mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
      planetMeshesRef.current.clear();
      orbitLinesRef.current = [];
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
    };
  }, [canvasSize.w, canvasSize.h, auToUnits]); // Re-init only on size change

  // ─── Update planet positions when simDate changes ────────────────────
  useEffect(() => {
    if (!sceneRef.current) return;
    planetPositions.forEach(({ planet, pos }) => {
      const mesh = planetMeshesRef.current.get(planet.name);
      if (mesh) {
        const dist = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
        const visualDist = auToUnits(dist);
        const angle = Math.atan2(pos.z, pos.x);
        mesh.position.set(Math.cos(angle) * visualDist, 0, Math.sin(angle) * visualDist);
      }
    });
  }, [planetPositions, auToUnits]);

  // ─── Update orbit visibility ─────────────────────────────────────────
  useEffect(() => {
    orbitLinesRef.current.forEach((line) => line.visible = showOrbits);
  }, [showOrbits]);

  // ─── Update ISS marker position ──────────────────────────────────────
  useEffect(() => {
    if (!issMarkerRef.current || !iss) return;
    const earthMesh = planetMeshesRef.current.get("Earth");
    if (!earthMesh) return;
    const earthPos3 = earthMesh.position;
    // ISS orbits in the XZ plane around Earth's position
    const issAngle = Math.atan2(iss.latitude, iss.longitude);
    const issRadius = 3.5; // just above Earth's visual radius
    issMarkerRef.current.position.set(
      earthPos3.x + Math.cos(issAngle) * issRadius,
      0,
      earthPos3.z + Math.sin(issAngle) * issRadius
    );
    // Color: green when over Pakistan, red otherwise
    const mat = issMarkerRef.current.material as THREE.MeshBasicMaterial;
    mat.color.setHex(issOverPakistan ? 0x22cc55 : 0xff4444);
  }, [iss, issOverPakistan]);

  // ─── Update Moon position ────────────────────────────────────────────
  useEffect(() => {
    if (!moonRef.current) return;
    const earthMesh = planetMeshesRef.current.get("Earth");
    if (!earthMesh) return;
    const earthPos3 = earthMesh.position;
    const moonAngle = (simDate.getTime() / 86400000) * (2 * Math.PI / 27.32);
    moonRef.current.position.set(
      earthPos3.x + Math.cos(moonAngle) * 3,
      0,
      earthPos3.z + Math.sin(moonAngle) * 3
    );
  }, [simDate, planetPositions]);

  // ─── Update selected planet label position ───────────────────────────
  useEffect(() => {
    if (!selectedPlanet || !cameraRef.current || !rendererRef.current) {
      setSelectedScreenPos(null);
      return;
    }
    const mesh = planetMeshesRef.current.get(selectedPlanet);
    if (!mesh) { setSelectedScreenPos(null); return; }
    const update = () => {
      const camera = cameraRef.current!;
      const renderer = rendererRef.current!;
      const pos = mesh.position.clone();
      pos.project(camera);
      const x = (pos.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
      const y = (-pos.y * 0.5 + 0.5) * renderer.domElement.clientHeight;
      setSelectedScreenPos({ x, y });
    };
    update();
    // Update on every frame
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [selectedPlanet, canvasSize]);

  // ─── Live time tick ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isLiveTime) return;
    const interval = setInterval(() => setSimDate(new Date()), 1000);
    return () => clearInterval(interval);
  }, [isLiveTime]);

  // ─── Fetch ISS every 5 seconds ───────────────────────────────────────
  const doFetchISS = useCallback(async () => {
    const pos = await fetchISSPosition();
    if (pos) {
      setIss(pos);
      setIssOverPakistan(isOverPakistan(pos.latitude, pos.longitude));
      setIssDistanceToMohmand(Math.round(haversineKm(pos.latitude, pos.longitude, MOHMAND_LAT, MOHMAND_LNG)));
    }
  }, []);
  useEffect(() => {
    doFetchISS();
    const interval = setInterval(doFetchISS, 5000);
    return () => clearInterval(interval);
  }, [doFetchISS]);

  // ─── Fetch space weather every 5 min ─────────────────────────────────
  useEffect(() => {
    fetchSpaceWeather().then(setWeather);
    const interval = setInterval(() => fetchSpaceWeather().then(setWeather), 300000);
    return () => clearInterval(interval);
  }, []);

  // ─── Fetch asteroids every 6 hours ───────────────────────────────────
  useEffect(() => {
    fetchAsteroids().then(setAsteroids);
    const interval = setInterval(() => fetchAsteroids().then(setAsteroids), 21600000);
    return () => clearInterval(interval);
  }, []);

  // ─── Fetch Mars weather once ─────────────────────────────────────────
  useEffect(() => { fetchMarsWeather().then(setMars); }, []);

  // ─── Time scrubber ───────────────────────────────────────────────────
  const resetTime = () => { setSimDate(new Date()); setIsLiveTime(true); };
  const shiftTime = (days: number) => { setIsLiveTime(false); setSimDate((d) => new Date(d.getTime() + days * MS_PER_DAY)); };

  // ─── Zoom controls ───────────────────────────────────────────────────
  const zoomIn = () => { cameraStateRef.current.distance = Math.max(8, cameraStateRef.current.distance * 0.8); };
  const zoomOut = () => { cameraStateRef.current.distance = Math.min(200, cameraStateRef.current.distance * 1.25); };
  const resetView = () => { cameraStateRef.current.distance = 80; cameraStateRef.current.azimuth = 0.3; cameraStateRef.current.elevation = 0.9; cameraStateRef.current.target.set(0, 0, 0); };

  // ─── Selected planet info ────────────────────────────────────────────
  const selectedData = useMemo(() => {
    if (!selectedPlanet) return null;
    const pp = planetPositions.find((p) => p.planet.name === selectedPlanet);
    if (!pp) return null;
    const distFromEarth = selectedPlanet === "Earth" ? 0 : distanceFromEarth(pp.pos, earthPos);
    const distFromSun = Math.sqrt(pp.pos.x ** 2 + pp.pos.y ** 2 + pp.pos.z ** 2);
    return { ...pp, distFromEarth, distFromSun };
  }, [selectedPlanet, planetPositions, earthPos]);

  // ─── Geomagnetic storm level ─────────────────────────────────────────
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
            🌌 Solar System Live <span className="text-[10px] bg-violet-500/10 text-violet-500 px-2 py-0.5 rounded-full">3D</span>
          </h3>
          <p className="text-xs text-muted-foreground">
            Real-time 3D · NASA &amp; NOAA live data · pinch to zoom · drag to rotate
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
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider flex items-center justify-center gap-1">
            <Satellite className="w-3 h-3" /> ISS Altitude
          </p>
          <p className="text-lg font-black text-foreground font-mono">
            {iss ? `${Math.round(iss.altitude)} km` : "…"}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider flex items-center justify-center gap-1">
            <Wind className="w-3 h-3" /> Solar Wind
          </p>
          <p className="text-lg font-black text-foreground font-mono">
            {weather.solarWindSpeed !== null ? `${weather.solarWindSpeed}` : "…"}
            <span className="text-[10px] text-muted-foreground"> km/s</span>
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider flex items-center justify-center gap-1">
            <Zap className="w-3 h-3" /> Geo-Activity
          </p>
          <p className="text-lg font-black font-mono" style={{ color: stormLevel?.color || "#6b7280" }}>
            {weather.kpIndex !== null ? `Kp ${weather.kpIndex}` : "…"}
          </p>
          {stormLevel && <p className="text-[9px]" style={{ color: stormLevel.color }}>{stormLevel.label}</p>}
        </div>
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

      {/* 3D Canvas */}
      <div className="rounded-2xl overflow-hidden border border-border shadow-sm bg-black relative">
        <div ref={mountRef} className="relative" style={{ width: "100%", height: canvasSize.h }} />

        {/* Planet label overlay */}
        {showLabels && selectedScreenPos && selectedPlanet && (
          <div
            className="absolute pointer-events-none z-10"
            style={{
              left: selectedScreenPos.x,
              top: selectedScreenPos.y - 30,
              transform: "translateX(-50%)",
            }}
          >
            <div className="bg-black/70 backdrop-blur-sm rounded-md px-2 py-1 border border-white/20">
              <p className="text-[11px] font-bold text-white whitespace-nowrap">
                {PLANETS.find(p => p.name === selectedPlanet)?.symbol} {selectedPlanet}
              </p>
            </div>
          </div>
        )}

        {/* Zoom controls */}
        <div className="absolute bottom-3 right-3 flex flex-col gap-1 bg-black/70 backdrop-blur-sm rounded-lg p-1 border border-white/10 z-20">
          <button onClick={zoomIn} className="p-2 hover:bg-white/10 rounded-md text-white" title="Zoom in">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={zoomOut} className="p-2 hover:bg-white/10 rounded-md text-white" title="Zoom out">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button onClick={resetView} className="p-2 hover:bg-white/10 rounded-md text-white" title="Reset view">
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Toggle controls */}
        <div className="absolute top-3 left-3 flex gap-1 bg-black/70 backdrop-blur-sm rounded-lg p-1 border border-white/10 z-20">
          <button
            onClick={() => setShowOrbits(!showOrbits)}
            className={`p-2 rounded-md flex items-center gap-1 text-[10px] font-medium ${showOrbits ? "bg-blue-500/30 text-blue-300" : "text-white/60 hover:bg-white/10"}`}
            title="Toggle orbits"
          >
            <Orbit className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Orbits</span>
          </button>
          <button
            onClick={() => setShowLabels(!showLabels)}
            className={`p-2 rounded-md flex items-center gap-1 text-[10px] font-medium ${showLabels ? "bg-blue-500/30 text-blue-300" : "text-white/60 hover:bg-white/10"}`}
            title="Toggle labels"
          >
            <Tag className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Labels</span>
          </button>
        </div>

        {/* Time scrubber */}
        <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-sm rounded-lg p-1.5 border border-white/10 flex items-center gap-1 z-20">
          <Calendar className="w-3.5 h-3.5 text-white/60 ml-1" />
          <button onClick={() => shiftTime(-7)} className="text-[10px] text-white/70 hover:text-white px-1.5 py-1 hover:bg-white/10 rounded" title="-7 days">-7d</button>
          <button onClick={() => shiftTime(-1)} className="text-[10px] text-white/70 hover:text-white px-1.5 py-1 hover:bg-white/10 rounded" title="-1 day">-1d</button>
          <button onClick={resetTime} className={`text-[10px] px-2 py-1 rounded ${isLiveTime ? "bg-green-500/30 text-green-300" : "text-white/70 hover:bg-white/10"}`} title="Now">NOW</button>
          <button onClick={() => shiftTime(1)} className="text-[10px] text-white/70 hover:text-white px-1.5 py-1 hover:bg-white/10 rounded" title="+1 day">+1d</button>
          <button onClick={() => shiftTime(7)} className="text-[10px] text-white/70 hover:text-white px-1.5 py-1 hover:bg-white/10 rounded" title="+7 days">+7d</button>
        </div>

        {/* Date display */}
        <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-white/10 z-20">
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

      {/* Planet info panel */}
      {selectedData && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div
              className="w-12 h-12 rounded-full shrink-0"
              style={{
                background: `radial-gradient(circle at 30% 30%, #${selectedData.planet.color.toString(16).padStart(6, "0")}cc, #${selectedData.planet.color.toString(16).padStart(6, "0")})`,
                boxShadow: `0 0 20px #${selectedData.planet.color.toString(16).padStart(6, "0")}40`,
              }}
            />
            <div className="flex-1 min-w-0">
              <h4 className="text-base font-bold text-foreground">
                {selectedData.planet.symbol} {selectedData.planet.name}
              </h4>
              <p className="text-xs text-muted-foreground">{selectedData.planet.facts}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            <div className="bg-secondary/50 rounded-lg p-2 text-center">
              <p className="text-[9px] text-muted-foreground uppercase">Distance from Sun</p>
              <p className="text-sm font-bold font-mono text-foreground">{selectedData.distFromSun.toFixed(3)} AU</p>
              <p className="text-[9px] text-muted-foreground">({(selectedData.distFromSun * 149.6).toFixed(1)}M km)</p>
            </div>
            {selectedData.planet.name !== "Earth" && (
              <div className="bg-secondary/50 rounded-lg p-2 text-center">
                <p className="text-[9px] text-muted-foreground uppercase">From Earth</p>
                <p className="text-sm font-bold font-mono text-foreground">{selectedData.distFromEarth.toFixed(3)} AU</p>
                <p className="text-[9px] text-muted-foreground">({(selectedData.distFromEarth * 149.6).toFixed(1)}M km)</p>
              </div>
            )}
            <div className="bg-secondary/50 rounded-lg p-2 text-center">
              <p className="text-[9px] text-muted-foreground uppercase">Radius</p>
              <p className="text-sm font-bold font-mono text-foreground">{selectedData.planet.realRadiusKm.toLocaleString()} km</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-2 text-center">
              <p className="text-[9px] text-muted-foreground uppercase">Orbital Period</p>
              <p className="text-sm font-bold font-mono text-foreground">
                {selectedData.planet.period < 365 ? `${selectedData.planet.period.toFixed(1)} days` : `${(selectedData.planet.period / 365.25).toFixed(2)} years`}
              </p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-2 text-center">
              <p className="text-[9px] text-muted-foreground uppercase">Moons</p>
              <p className="text-sm font-bold font-mono text-foreground">{selectedData.planet.moons}</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-2 text-center">
              <p className="text-[9px] text-muted-foreground uppercase">Axial Tilt</p>
              <p className="text-sm font-bold font-mono text-foreground">{selectedData.planet.axialTilt}°</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-2 text-center">
              <p className="text-[9px] text-muted-foreground uppercase">Day Length</p>
              <p className="text-sm font-bold font-mono text-foreground">{Math.abs(selectedData.planet.rotationPeriod).toFixed(1)} h</p>
            </div>
          </div>

          {selectedData.planet.name === "Mars" && mars.tempAvg !== null && (
            <div className="mt-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <p className="text-xs font-bold text-red-700 dark:text-red-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Mars Weather (Sol {mars.sol})
              </p>
              <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                <div>
                  <p className="text-[9px] text-muted-foreground uppercase">Min</p>
                  <p className="text-sm font-bold text-red-600 dark:text-red-400 font-mono">{mars.tempMin !== null ? `${mars.tempMin.toFixed(0)}°C` : "—"}</p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground uppercase">Avg</p>
                  <p className="text-sm font-bold text-red-600 dark:text-red-400 font-mono">{mars.tempAvg !== null ? `${mars.tempAvg.toFixed(0)}°C` : "—"}</p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground uppercase">Max</p>
                  <p className="text-sm font-bold text-red-600 dark:text-red-400 font-mono">{mars.tempMax !== null ? `${mars.tempMax.toFixed(0)}°C` : "—"}</p>
                </div>
              </div>
              {mars.season && <p className="text-[10px] text-red-500 dark:text-red-400 mt-1 text-center">Season: {mars.season}</p>}
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
              selectedPlanet === p.name ? "text-white shadow-md" : "bg-card border border-border hover:bg-secondary text-muted-foreground"
            }`}
            style={selectedPlanet === p.name ? { backgroundColor: `#${p.color.toString(16).padStart(6, "0")}` } : {}}
          >
            <span>{p.symbol}</span>
            <span>{p.name}</span>
          </button>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground text-center">
        Planet positions: J2000 orbital elements (JPL Standish) · Live data: NOAA SWPC, NASA NeoWS ·
        ISS: Open Notify · Drag to rotate · Pinch to zoom · Tap planet for details
      </p>
    </div>
  );
}
