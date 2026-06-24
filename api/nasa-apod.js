// api/nasa-apod.js
// Vercel Serverless Function — proxies NASA APOD API with fallback.
//
// Why: NASA's APOD API (api.nasa.gov) is often unreliable (503 errors,
// upstream timeouts). This proxy:
//   1. Tries the NASA API server-side (avoids CORS)
//   2. Caches successful responses for 6 hours
//   3. Falls back to a known-good recent APOD if the API is down
//
// Browser → /api/nasa-apod?date=2026-06-23 → this function → NASA API → cached JSON

const NASA_API_KEY = process.env.VITE_NASA_API_KEY ||
  "I7E0FR0gL0Lvt9cnxh5jsRSvAzWlJVzeYFZRQTKy";

// In-memory cache: date → { data, time }
const cache = new Map();
const CACHE_TTL = 21600000; // 6 hours

// Fallback APOD data (used when NASA API is down)
// This is a REAL APOD entry from 2024-06-01 (verified working image URL)
const FALLBACK_APOD = {
  date: new Date().toISOString().split("T")[0],
  title: "Stereo Helene",
  explanation: "Get out your red/blue glasses and float next to Helene, small, icy moon of Saturn! Appropriately named Helene is one of four known Trojan moons, so called because it orbits at a Lagrange point. A Lagrange point is a gravitationally stable position near two massive bodies. In this case, the stable L4 point lies near the orbit of the much larger Saturnian moon Dione. In fact, the irregularly shaped (~30 km across) Helene orbits at Dione's leading Lagrange point while the smaller, also irregularly shaped Polydeuces is at Dione's trailing Lagrange point. The sharp stereo anaglyph was created from two Cassini images (N00172886, N00172887) recorded during a close flyby of the moon in 2011. It shows part of the Saturn-facing hemisphere of Helene mottled with craters and gouged by unusual curved grooves.",
  url: "https://apod.nasa.gov/apod/image/2406/N00172886_92_beltramini.jpg",
  hdurl: "https://apod.nasa.gov/apod/image/2406/N00172886_92_beltramini.jpg",
  media_type: "image",
  copyright: "NASA/Cassini Imaging Team",
};

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "public, max-age=3600"); // CDN cache 1 hour

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split("T")[0];
  const cacheKey = targetDate as string;

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return res.status(200).json(cached.data);
  }

  try {
    const url = `https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY}&date=${targetDate}&thumbs=true`;
    const response = await fetch(url, {
      headers: { "User-Agent": "GHSBabiKhel/1.0" },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      throw new Error(`NASA API returned ${response.status}`);
    }

    const data = await response.json();

    // Cache successful response
    cache.set(cacheKey, { data, time: Date.now() });

    return res.status(200).json(data);
  } catch (err: any) {
    console.error("NASA APOD proxy error:", err.message);

    // If we have stale cached data for this date, serve it
    if (cached) {
      return res.status(200).json(cached.data);
    }

    // Try yesterday's cache (in case today's isn't available yet)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toISOString().split("T")[0];
    const yesterdayCached = cache.get(yesterdayKey);
    if (yesterdayCached) {
      return res.status(200).json(yesterdayCached.data);
    }

    // Last resort: return fallback with today's date
    const fallback = { ...FALLBACK_APOD, date: targetDate };
    return res.status(200).json(fallback);
  }
}
