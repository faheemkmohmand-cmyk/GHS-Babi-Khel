// api/nasa-image.ts
// Vercel Serverless Function — proxies NASA APOD media (images & videos) to the browser.
//
// Why: apod.nasa.gov refuses direct browser connections ("refused to connect"),
// but allows server-to-server requests. This function fetches the media
// server-side and streams the bytes back, so <img> and <video> tags work.
//
// Usage: /api/nasa-image?url=https://apod.nasa.gov/apod/image/...
//        /api/nasa-image?url=https://apod.nasa.gov/apod/image/.../video.mp4
//
// Security: only proxies URLs from apod.nasa.gov (allowlisted).
// Cached for 24 hours via CDN headers.

export const config = {
  api: {
    responseLimit: false, // allow large video files through
  },
};

const ALLOWED_HOST = "apod.nasa.gov";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { url } = req.query as { url?: string };

  if (!url) {
    return res.status(400).json({ error: "Missing url parameter" });
  }

  // Security: only proxy media from apod.nasa.gov
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }

  if (parsed.hostname !== ALLOWED_HOST) {
    return res.status(403).json({ error: "URL not allowed" });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; GHSBabiKhel/1.0; +https://ghsbabikhel.indevs.in)",
        Referer: "https://apod.nasa.gov/",
        // Forward Range header if browser requests partial content (video scrubbing)
        ...(req.headers["range"] ? { Range: req.headers["range"] } : {}),
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok && response.status !== 206) {
      return res
        .status(response.status)
        .json({ error: `Upstream returned ${response.status}` });
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const contentLength = response.headers.get("content-length");
    const contentRange = response.headers.get("content-range");
    const acceptRanges = response.headers.get("accept-ranges");

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, immutable"); // 24h CDN cache
    if (contentLength) res.setHeader("Content-Length", contentLength);
    if (contentRange) res.setHeader("Content-Range", contentRange);
    if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges);

    res.status(response.status);

    // Stream the body — avoids loading entire MP4 into memory
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
      } finally {
        reader.releaseLock();
      }
    }

    res.end();
  } catch (err: any) {
    console.error("NASA media proxy error:", err.message);
    if (!res.headersSent) {
      return res.status(502).json({ error: "Failed to fetch media", detail: err.message });
    }
    res.end();
  }
}
