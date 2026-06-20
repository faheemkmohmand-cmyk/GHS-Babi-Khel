// api/phet-proxy.js
// Vercel Serverless Function — proxies PhET simulation HTML files so they
// load under our own domain, bypassing PhET's frame-ancestors restriction.
//
// Usage: /api/phet-proxy?sim=wave-on-a-string
// Fetches: https://phet.colorado.edu/sims/html/{sim}/latest/{sim}_en-iframe.html
// Rewrites all relative/absolute asset URLs to go through /api/phet-asset
// so scripts, styles, and images also load without CORS issues.

export default async function handler(req, res) {
  const { sim } = req.query;

  // Validate sim ID — only lowercase letters, digits, hyphens
  if (!sim || !/^[a-z0-9-]+$/.test(sim)) {
    return res.status(400).send("Invalid sim ID");
  }

  const simBase = `https://phet.colorado.edu/sims/html/${sim}/latest/`;
  const simUrl = `${simBase}${sim}_en-iframe.html`;

  try {
    const upstream = await fetch(simUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GHSBabiKhel/1.0)",
        Accept: "text/html",
      },
    });

    if (!upstream.ok) {
      return res
        .status(upstream.status)
        .send(`PhET returned ${upstream.status} for sim: ${sim}`);
    }

    let html = await upstream.text();

    // Rewrite absolute phet URLs → our asset proxy
    html = html.replace(
      /https:\/\/phet\.colorado\.edu\/sims\/html\/([^"'\s]+)/g,
      (_, path) =>
        `/api/phet-asset?path=${encodeURIComponent("sims/html/" + path)}`
    );

    // Rewrite root-relative URLs that point to PhET assets
    html = html.replace(
      /(['"])\/([a-zA-Z][^"'\s]*\.(?:js|css|png|svg|ico|woff2?))/g,
      (_, quote, path) =>
        `${quote}/api/phet-asset?path=${encodeURIComponent(path)}`
    );

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    // Allow this response to be iframed from our own origin
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader(
      "Content-Security-Policy",
      "frame-ancestors 'self'"
    );
    // Cache for 1 hour (PhET sims don't change mid-day)
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
    return res.status(200).send(html);
  } catch (err) {
    console.error("phet-proxy error:", err);
    return res.status(502).send("Failed to fetch simulation from PhET");
  }
}
