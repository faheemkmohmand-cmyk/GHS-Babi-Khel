// api/phet-asset.js
// Vercel Serverless Function — proxies individual PhET simulation assets
// (JS, CSS, images, fonts) so they load under our own domain.
//
// Usage: /api/phet-asset?path=sims/html/wave-on-a-string/latest/wave-on-a-string.js

const ALLOWED_EXTENSIONS = /\.(js|css|png|jpg|jpeg|svg|ico|woff|woff2|ttf|eot|gif|mp3|ogg|wav|json|html)$/i;
const PHET_BASE = "https://phet.colorado.edu/";

export default async function handler(req, res) {
  const { path: assetPath } = req.query;

  if (!assetPath) {
    return res.status(400).send("Missing path");
  }

  // Decode and sanitise — no directory traversal
  const decoded = decodeURIComponent(assetPath).replace(/\.\.\//g, "");

  if (!ALLOWED_EXTENSIONS.test(decoded)) {
    return res.status(403).send("Forbidden file type");
  }

  const upstreamUrl = `${PHET_BASE}${decoded}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GHSBabiKhel/1.0)",
        Referer: "https://phet.colorado.edu/",
      },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).send(`Asset not found: ${decoded}`);
    }

    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");
    // Forward as a stream
    const buffer = await upstream.arrayBuffer();
    return res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    console.error("phet-asset error:", err);
    return res.status(502).send("Failed to fetch asset");
  }
}
