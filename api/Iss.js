// api/iss.js
// Vercel Serverless Function — proxies Open Notify ISS APIs.
// Browser → /api/iss?type=position → this function → http://api.open-notify.org/iss-now.json
// Browser → /api/iss?type=astros   → this function → http://api.open-notify.org/astros.json
//
// Why: api.wheretheiss.at is down, corsproxy.io requires paid plan,
//      api.open-notify.org only works on HTTP (no HTTPS, no CORS headers).
//      This server-side proxy bypasses all those issues.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { type } = req.query;

  let upstreamUrl;
  if (type === "astros") {
    upstreamUrl = "http://api.open-notify.org/astros.json";
  } else {
    // Default: position
    upstreamUrl = "http://api.open-notify.org/iss-now.json";
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { "User-Agent": "OceanSchoolHub/1.0" },
      signal: AbortSignal.timeout(10000),
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: `ISS API returned ${upstream.status}`,
      });
    }

    const data = await upstream.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error("ISS API proxy error:", err);
    return res.status(500).json({
      error: "Failed to fetch ISS data",
      detail: err.message,
    });
  }
}
