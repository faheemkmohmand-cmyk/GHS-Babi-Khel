// api/robots.js
// Vercel Serverless Function — generates robots.txt dynamically.
// Ensures Disallow rules are properly scoped under the wildcard User-agent.
// Access at: /api/robots

const SITE_URL = "https://ghsbabikhel.indevs.in";

export default async function handler(req, res) {
  const txt = `# ── Robots.txt — GHS Babi Khel ────────────────────────────────────────────
# Allows all major search engine crawlers full access to public pages.
# Private dashboards and admin panel are blocked.

User-agent: Googlebot
Allow: /
Crawl-delay: 1

User-agent: Bingbot
Allow: /
Crawl-delay: 2

User-agent: Twitterbot
Allow: /

User-agent: facebookexternalhit
Allow: /

User-agent: LinkedInBot
Allow: /

User-agent: WhatsApp
Allow: /

User-agent: *
Allow: /
Crawl-delay: 5
# ── Private pages — no indexing ───────────────────────────────────────────
Disallow: /admin
Disallow: /admin/
Disallow: /teacher
Disallow: /teacher/
Disallow: /dashboard
Disallow: /dashboard/
Disallow: /auth
Disallow: /auth/
Disallow: /api
Disallow: /api/

# ── Sitemap ───────────────────────────────────────────────────────────────
Sitemap: ${SITE_URL}/api/sitemap
`;

  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).send(txt);
}
