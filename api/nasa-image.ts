// api/nasa-image.ts
// Vercel Serverless Function — proxies NASA APOD image bytes to the browser.
//
// Why: apod.nasa.gov refuses direct browser connections ("refused to connect"),
// but allows server-to-server requests. This function fetches the image
// server-side and streams the bytes back, so the <img> tag works.
//
// Usage: /api/nasa-image?url=https://apod.nasa.gov/apod/image/...
//
// Security: only proxies URLs from apod.nasa.gov (allowlisted).
// Cached for 24 hours via CDN headers.

const ALLOWED_HOST = "apod.nasa.gov";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { url } = req.query as { url?: string };

  if (!url) {
    return res.status(400).json({ error: "Missing url parameter" });
  }

  // Security: only proxy images from apod.nasa.gov
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
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: `Upstream returned ${response.status}` });
    }

    const contentType =
      response.headers.get("content-type") || "image/jpeg";
    const buffer = await response.arrayBuffer();

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, immutable"); // 24h CDN cache
    res.setHeader("Content-Length", buffer.byteLength);
    res.status(200).send(Buffer.from(buffer));
  } catch (err: any) {
    console.error("NASA image proxy error:", err.message);
    return res.status(502).json({ error: "Failed to fetch image", detail: err.message });
  }
}
