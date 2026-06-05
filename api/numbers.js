// api/numbers.js
// Vercel Serverless Function — proxies numbersapi.com server-side
// Browser calls /api/numbers?path=42/trivia  → this function fetches numbersapi.com/42/trivia
// No CORS issue because the fetch happens on the server, not the browser

export default async function handler(req, res) {
  // Allow requests from our own origin only
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { path } = req.query;

  if (!path) {
    return res.status(400).json({ error: "Missing path parameter" });
  }

  // Validate path — only allow numbers, slashes, letters (prevent injection)
  if (!/^[\d\/a-z]+$/.test(path)) {
    return res.status(400).json({ error: "Invalid path" });
  }

  const url = `http://numbersapi.com/${path}?json`;

  try {
    const upstream = await fetch(url, {
      headers: {
        "User-Agent": "GHS-BabiKhel-School/1.0",
        "Accept": "application/json, text/plain",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Numbers API returned ${upstream.status}` });
    }

    const contentType = upstream.headers.get("content-type") || "";
    let body;

    if (contentType.includes("json")) {
      body = await upstream.json();
      return res.status(200).json(body);
    } else {
      // numbersapi sometimes returns plain text
      const text = await upstream.text();
      return res.status(200).json({ text, found: true, type: "trivia", number: 0 });
    }
  } catch (err) {
    console.error("Numbers API proxy error:", err);
    return res.status(500).json({ error: "Failed to fetch from Numbers API", detail: err.message });
  }
}
