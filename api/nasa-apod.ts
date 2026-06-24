// api/nasa-apod.ts
// Vercel Serverless Function — proxies NASA APOD API with fallback.
//
// Why: NASA's APOD API (api.nasa.gov) is often unreliable (503 errors,
// upstream timeouts). This proxy:
//   1. Tries the NASA API server-side (avoids CORS)
//   2. Caches successful responses for 6 hours
//   3. Rewrites apod.nasa.gov image URLs → /api/nasa-image?url=... so the
//      browser never tries to connect to apod.nasa.gov directly (it blocks
//      browser connections with "refused to connect")
//   4. Falls back to a known-good recent APOD if the API is down
//
// Browser → /api/nasa-apod?date=2026-06-24 → this function → NASA API → rewritten JSON

const NASA_API_KEY = process.env.VITE_NASA_API_KEY ||
  "I7E0FR0gL0Lvt9cnxh5jsRSvAzWlJVzeYFZRQTKy";

// In-memory cache: date → { data, time }
const cache = new Map();
const CACHE_TTL = 21600000; // 6 hours

// Fallback APOD data (used when NASA API is down)
const FALLBACK_APOD = {
  date: new Date().toISOString().split("T")[0],
  title: "Stereo Helene",
  explanation:
    "Get out your red/blue glasses and float next to Helene, small, icy moon of Saturn! Appropriately named Helene is one of four known Trojan moons, so called because it orbits at a Lagrange point. A Lagrange point is a gravitationally stable position near two massive bodies. In this case, the stable L4 point lies near the orbit of the much larger Saturnian moon Dione. In fact, the irregularly shaped (~30 km across) Helene orbits at Dione's leading Lagrange point while the smaller, also irregularly shaped Polydeuces is at Dione's trailing Lagrange point. The sharp stereo anaglyph was created from two Cassini images recorded during a close flyby of the moon in 2011.",
  url: "/api/nasa-image?url=https%3A%2F%2Fapod.nasa.gov%2Fapod%2Fimage%2F2406%2FN00172886_92_beltramini.jpg",
  hdurl:
    "https://apod.nasa.gov/apod/image/2406/N00172886_92_beltramini.jpg",
  media_type: "image",
  copyright: "NASA/Cassini Imaging Team",
};

// Extract YouTube video ID from embed or watch URL
function getYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.pathname.startsWith("/embed/")) return u.pathname.split("/embed/")[1].split("?")[0];
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    if (u.hostname === "youtu.be") return u.pathname.slice(1);
  } catch { /* ignore */ }
  return null;
}

// Rewrite APOD URLs:
// - Images from apod.nasa.gov → proxied through /api/nasa-image (browser can't load directly)
// - Video url (MP4) → kept as-is (direct link works fine for <video> tags and download links)
// - thumbnail_url → if YouTube video, use YouTube's img CDN (no auth needed, no CORS issues)
//                   if apod.nasa.gov thumbnail, proxy through nasa-image
function rewriteApodUrls(data: any): any {
  const isVideo = data.media_type === "video";

  // For images: proxy the url through nasa-image
  const rewriteImageUrl = (url: string | undefined): string | undefined => {
    if (!url) return url;
    try {
      if (new URL(url).hostname === "apod.nasa.gov") {
        return `/api/nasa-image?url=${encodeURIComponent(url)}`;
      }
    } catch { /* ignore */ }
    return url;
  };

  // For video thumbnail: prefer YouTube CDN, fall back to proxied apod thumbnail
  let thumbnailUrl = data.thumbnail_url;
  if (isVideo) {
    // Try to get YouTube thumbnail from the embed url
    const ytId = getYouTubeId(data.url);
    if (ytId) {
      thumbnailUrl = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
    } else if (thumbnailUrl) {
      // It's a direct video (MP4) with an apod.nasa.gov thumbnail — proxy it
      try {
        if (new URL(thumbnailUrl).hostname === "apod.nasa.gov") {
          thumbnailUrl = `/api/nasa-image?url=${encodeURIComponent(thumbnailUrl)}`;
        }
      } catch { /* ignore */ }
    }
  }

  return {
    ...data,
    // Videos: keep original url (direct mp4/youtube embed link — works as href or <video src>)
    // Images: proxy through nasa-image so browser can load them
    url: isVideo ? data.url : rewriteImageUrl(data.url),
    hdurl: data.hdurl, // always keep as-is (used for "Full HD" external link)
    thumbnail_url: thumbnailUrl,
  };
}

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

    const raw = await response.json();
    // Rewrite before caching so cache also stores safe URLs
    const data = rewriteApodUrls(raw);

    cache.set(cacheKey, { data, time: Date.now() });

    return res.status(200).json(data);
  } catch (err: any) {
    console.error("NASA APOD proxy error:", err.message);

    if (cached) {
      return res.status(200).json(cached.data);
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toISOString().split("T")[0];
    const yesterdayCached = cache.get(yesterdayKey);
    if (yesterdayCached) {
      return res.status(200).json(yesterdayCached.data);
    }

    const fallback = { ...FALLBACK_APOD, date: targetDate };
    return res.status(200).json(fallback);
  }
}
