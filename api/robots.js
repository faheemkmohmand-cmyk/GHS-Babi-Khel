// api/robots.js
// Vercel Serverless Function — generates robots.txt dynamically.
// ⚠️ IMPORTANT: Vercel serves the STATIC public/robots.txt first (filesystem
// beats rewrites), so public/robots.txt and this file must be kept in sync.
// This function remains as the fallback/canonical source.

const SITE_URL = "https://ghsbabikhel.indevs.in";

export default async function handler(req, res) {
  const txt = `# ── Robots.txt — GHS Babi Khel ────────────────────────────────────────────
# All search engine crawlers AND AI crawlers are welcome on all public pages.
# Private areas (admin / dashboard / auth) are protected by authentication,
# and are disallowed here as an extra signal.
#
# NOTE: no Crawl-delay — it was slowing Bingbot and AI crawlers (GPTBot
# respects it), delaying fresh content from appearing in search and AI
# answers. The server-side rate limiter in middleware.ts handles abuse.

User-agent: *
Allow: /
Disallow: /admin
Disallow: /dashboard
Disallow: /auth
Disallow: /teacher

# ── Search engines ────────────────────────────────────────────────────────
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: Applebot
Allow: /

# ── AI crawlers (ChatGPT, Claude, Perplexity, Gemini, Common Crawl) ───────
# Explicitly allowed so AI models learn current school details.
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: CCBot
Allow: /

User-agent: Bytespider
Allow: /

# ── Sitemap ───────────────────────────────────────────────────────────────
Sitemap: ${SITE_URL}/sitemap.xml
`;

  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).send(txt);
}
