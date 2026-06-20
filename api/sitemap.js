// api/sitemap.js
// Vercel Serverless Function — generates sitemap.xml dynamically.
// This ensures the sitemap always includes the latest URLs and correct lastmod dates.
// Access at: /api/sitemap

const SITE_URL = "https://ghsbabikhel.indevs.in";

// Static pages with their SEO metadata
const STATIC_PAGES = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/admission", changefreq: "weekly", priority: "0.9" },
  { path: "/notices", changefreq: "daily", priority: "0.9" },
  { path: "/news", changefreq: "daily", priority: "0.9" },
  { path: "/results", changefreq: "weekly", priority: "0.9" },
  { path: "/calendar", changefreq: "daily", priority: "0.9" },
  { path: "/contact", changefreq: "monthly", priority: "0.8" },
  { path: "/about", changefreq: "monthly", priority: "0.8" },
  { path: "/teachers", changefreq: "monthly", priority: "0.8" },
  { path: "/online-classes", changefreq: "weekly", priority: "0.8" },
  { path: "/notes", changefreq: "weekly", priority: "0.8" },
  { path: "/library", changefreq: "weekly", priority: "0.8" },
  { path: "/duty", changefreq: "weekly", priority: "0.7" },
  { path: "/result-card", changefreq: "weekly", priority: "0.7" },
  { path: "/gallery", changefreq: "weekly", priority: "0.7" },
  { path: "/weather", changefreq: "daily", priority: "0.5" },
];

const SUBJECT_PAGES = [
  "math", "physics", "chemistry", "biology", "english",
  "urdu", "islamiat", "pakistan-studies", "computer",
];

function buildUrlEntry(page, lastmod) {
  const url = `${SITE_URL}${page.path}`;
  const hreflangEntries = `
    <xhtml:link rel="alternate" hreflang="en-PK"    href="${url}"/>
    <xhtml:link rel="alternate" hreflang="ur"        href="${url}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${url}"/>`;

  return `  <url>
    <loc>${url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>${hreflangEntries}
  </url>`;
}

export default async function handler(req, res) {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  const staticEntries = STATIC_PAGES.map((page) => buildUrlEntry(page, today));

  const subjectEntries = SUBJECT_PAGES.map((subject) =>
    buildUrlEntry(
      { path: `/notes/${subject}`, changefreq: "weekly", priority: "0.7" },
      today
    )
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml">

 ${staticEntries.join("\n\n")}

 ${subjectEntries.join("\n")}

</urlset>`;

  res.setHeader("Content-Type", "application/xml");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).send(xml);
}
