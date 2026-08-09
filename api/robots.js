// api/robots.js
// Vercel Serverless Function — generates robots.txt dynamically.
// SECURITY FIX: Removed sensitive path disclosure - no longer reveals admin/auth paths

const SITE_URL = "https://ghsbabikhel.indevs.in";

export default async function handler(req, res) {
  const txt = `# ── Robots.txt — GHS Babi Khel ────────────────────────────────────────────
# Allows all major search engine crawlers full access to public pages.
# Sensitive areas are protected by server-side authentication, not robots.txt.

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

# ── Sitemap ───────────────────────────────────────────────────────────────
Sitemap: ${SITE_URL}/api/sitemap
`;

  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).send(txt);
}
