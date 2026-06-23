// api/space-weather.js
// Vercel Serverless Function — proxies NOAA SWPC + NASA space weather APIs.
//
// Browser → /api/space-weather?type=solar_wind    → NOAA ACE solar wind speed
// Browser → /api/space-weather?type=kp_index      → NOAA planetary K-index
// Browser → /api/space-weather?type=sunspots      → NOAA predicted sunspot count
// Browser → /api/space-weather?type=asteroids     → NASA NeoWS asteroids today
// Browser → /api/space-weather?type=mars_weather  → NASA InSight Mars weather
//
// Why: NOAA SWPC APIs support CORS but can be flaky from the browser.
//      NASA NeoWS requires an API key (don't want to expose in client).
//      This proxy adds caching + reliability.

const NASA_API_KEY = process.env.VITE_NASA_API_KEY ||
  "I7E0FR0gL0Lvt9cnxh5jsRSvAzWlJVzeYFZRQTKy";

// In-memory cache (per serverless instance, survives warm invocations)
const cache = new Map();
const CACHE_TTL = 60000; // 1 minute for real-time data
const CACHE_TTL_ASTEROIDS = 3600000; // 1 hour for asteroids
const CACHE_TTL_MARS = 1800000; // 30 minutes for Mars weather

function getCached(key, ttl) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.time > ttl) return null;
  return entry.data;
}

function setCached(key, data) {
  cache.set(key, { data, time: Date.now() });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "public, max-age=60");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { type } = req.query;
  let upstreamUrl;
  let ttl = CACHE_TTL;

  switch (type) {
    case "solar_wind":
      // DSCOVR plasma — current primary solar wind source
      upstreamUrl = "https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json";
      break;
    case "kp_index":
      upstreamUrl = "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json";
      break;
    case "sunspots":
      // Observed daily sunspot number
      upstreamUrl = "https://services.swpc.noaa.gov/json/solar-cycle/swpc_observed_ssn.json";
      break;
    case "asteroids": {
      const cached = getCached("asteroids", CACHE_TTL_ASTEROIDS);
      if (cached) return res.status(200).json(cached);
      const today = new Date().toISOString().split("T")[0];
      upstreamUrl = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${today}&end_date=${today}&api_key=${NASA_API_KEY}`;
      ttl = CACHE_TTL_ASTEROIDS;
      break;
    }
    case "mars_weather": {
      const cached = getCached("mars_weather", CACHE_TTL_MARS);
      if (cached) return res.status(200).json(cached);
      upstreamUrl = `https://api.nasa.gov/insight_weather/?api_key=${NASA_API_KEY}&feedtype=json&ver=1.0`;
      ttl = CACHE_TTL_MARS;
      break;
    }
    default:
      return res.status(400).json({ error: "Invalid type. Use: solar_wind, kp_index, sunspots, asteroids, mars_weather" });
  }

  // Check cache for real-time data
  const cacheKey = type;
  const cached = getCached(cacheKey, ttl);
  if (cached) {
    return res.status(200).json(cached);
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { "User-Agent": "GHSBabiKhel/1.0" },
      signal: AbortSignal.timeout(10000),
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: `Upstream API returned ${upstream.status}`,
      });
    }

    const data = await upstream.json();
    setCached(cacheKey, data);
    return res.status(200).json(data);
  } catch (err) {
    console.error(`Space weather proxy error (${type}):`, err);
    return res.status(500).json({
      error: "Failed to fetch space weather data",
      detail: err.message,
    });
  }
}
