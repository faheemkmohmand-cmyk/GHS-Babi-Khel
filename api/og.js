// api/og.js
// Vercel Serverless Function — returns fully-formed static HTML with the
// correct <title>, <meta description>, Open Graph, Twitter Card, canonical,
// and JSON-LD tags for a given path. middleware.ts routes known social
// media crawlers (WhatsApp, Facebook, LinkedIn, X/Twitter, Slack, Discord,
// iMessage/Applebot, etc.) here instead of the normal SPA shell, because
// those crawlers read raw HTML once and never execute the JavaScript that
// would otherwise inject these tags via React Helmet.
//
// This mirrors the route table in src/components/seo/RouteSEOInjector.tsx
// so crawler previews match what users actually see once the page loads.
// Keep both in sync when adding new top-level routes.
//
// Access at: /api/og?path=/some/route  (middleware.ts sets this query param)

const SITE_URL = "https://ghsbabikhel.indevs.in";
const SITE_NAME = "GHS Babi Khel";
const DEFAULT_IMAGE = `${SITE_URL}/og-image.jpg`;
const DEFAULT_IMAGE_WIDTH = "1730";
const DEFAULT_IMAGE_HEIGHT = "909";
const TWITTER_SITE = "@GHSBabiKhel";

// Static route metadata — mirrors RouteSEOInjector.tsx's ROUTES table.
// Dynamic detail pages (/news/:id, /notices/:id, /notes/:subject/:chapter)
// use a sensible generic description below since this function has no
// database access; the canonical URL still points at the exact shared
// link, so the destination is always correct even though the preview
// text is generic for those specific pages.
const ROUTES = [
  { pattern: "/", title: "GHS Babi Khel — Government High School, District Mohmand KPK", description: "Government High School Babi Khel, District Mohmand, KPK Pakistan. Quality education, notices, news, results, online classes, library and admissions." },
  { pattern: "/about", title: "About GHS Babi Khel — History, Mission & Vision | District Mohmand KPK", description: "Learn about Government High School Babi Khel — our history since 2018, mission, vision, faculty and commitment to quality education in District Mohmand." },
  { pattern: "/teachers", title: "Teachers & Faculty — GHS Babi Khel | District Mohmand KPK", description: "Meet the qualified teachers and faculty of GHS Babi Khel — dedicated educators shaping the future of students in District Mohmand, KPK." },
  { pattern: "/notices", title: "School Notices & Announcements — GHS Babi Khel", description: "Browse the latest school notices, urgent announcements, academic updates and event information from Government High School Babi Khel." },
  { pattern: "/news", title: "News & Updates — GHS Babi Khel | District Mohmand", description: "Read the latest news, stories and achievements from Government High School Babi Khel — events, sports, academics and student success." },
  { pattern: "/results", title: "Exam Results — GHS Babi Khel | Annual & Term Results", description: "View annual and term examination results for all classes at GHS Babi Khel. Check student performance, position and grade reports." },
  { pattern: "/result-card", title: "Result Card — GHS Babi Khel Student Performance Report", description: "Download or view your detailed student result card from GHS Babi Khel with subject-wise marks, grade and overall performance." },
  { pattern: "/gallery", title: "Photo Gallery — GHS Babi Khel School Events & Activities", description: "Explore the photo and video gallery of Government High School Babi Khel — events, sports, academic activities and celebrations." },
  { pattern: "/library", title: "Digital Library — GHS Babi Khel | Books, Notes & Past Papers", description: "Access the digital library of GHS Babi Khel — books, study notes, past papers and educational resources for all classes." },
  { pattern: "/weather", title: "Weather — District Mohmand KPK | GHS Babi Khel", description: "Live weather forecast for Babi Khel and District Mohmand, KPK — temperature, conditions and outlook for the school community." },
  { pattern: "/online-classes", title: "Online Classes — GHS Babi Khel | Live & Recorded Lectures", description: "Join live online classes and access recorded lectures from GHS Babi Khel — flexible learning anytime, anywhere." },
  { pattern: "/admission", title: "Admissions Open — GHS Babi Khel | Apply Online District Mohmand", description: "Apply for admission at Government High School Babi Khel — eligibility, fee structure, required documents and online application form." },
  { pattern: "/notes", title: "Study Notes — GHS Babi Khel | Subject-wise Notes & Resources", description: "Access subject-wise study notes, summaries and chapter resources for all classes at GHS Babi Khel — interactive learning made easy." },
  { pattern: "/duty", title: "School Duty Board — GHS Babi Khel | Class Monitors & Proctors", description: "View official duty assignments for GHS Babi Khel — class monitors, proctors, social workers, head boys and nazira for Classes 6 to 10." },
  { pattern: "/search", title: "Search — GHS Babi Khel", description: "Search across notices, news, teachers and notes at Government High School Babi Khel." },
  // Dynamic / nested routes — generic but on-brand previews.
  { pattern: /^\/notes\/[^/]+\/[^/]+$/, title: "Chapter Notes — GHS Babi Khel | Detailed Study Material", description: "Read detailed chapter notes, examples and revision content. Interactive study resources for GHS Babi Khel students.", type: "article" },
  { pattern: /^\/notes\/[^/]+$/, title: "Subject Notes — GHS Babi Khel | Chapter-wise Study Material", description: "Browse chapter-wise notes and lessons for the selected subject. Comprehensive study material curated for GHS Babi Khel students." },
  { pattern: /^\/news\/.+$/, title: "News Article — GHS Babi Khel", description: "Read the latest news from Government High School Babi Khel.", type: "article" },
  { pattern: /^\/notices\/.+$/, title: "School Notice — GHS Babi Khel", description: "Read the full school notice from Government High School Babi Khel.", type: "article" },
];

const NOT_FOUND = {
  title: "Page Not Found — GHS Babi Khel",
  description: "The page you are looking for could not be found. Return to GHS Babi Khel home page.",
};

function matchRoute(path) {
  for (const r of ROUTES) {
    if (typeof r.pattern === "string") {
      if (r.pattern === path) return r;
    } else if (r.pattern.test(path)) {
      return r;
    }
  }
  return null;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default async function handler(req, res) {
  const rawPath = (req.query && req.query.path) || "/";
  // Normalize: strip query/hash if somehow present, collapse trailing slash.
  const path = ("/" + String(rawPath).replace(/^\/+/, "")).replace(/\/$/, "") || "/";

  const matched = matchRoute(path) || NOT_FOUND;
  const fullTitle = matched.title.includes(SITE_NAME) ? matched.title : `${matched.title} | ${SITE_NAME}`;
  const description = matched.description;
  const url = `${SITE_URL}${path === "/" ? "" : path}`;
  const type = matched.type || "website";
  const isNotFound = matched === NOT_FOUND;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": type === "article" ? "Article" : "WebPage",
    name: fullTitle,
    description,
    url,
  };

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<meta name="robots" content="${isNotFound ? "noindex, nofollow" : "index, follow"}" />
<link rel="canonical" href="${escapeHtml(url)}" />

<meta property="og:title" content="${escapeHtml(fullTitle)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:type" content="${type}" />
<meta property="og:url" content="${escapeHtml(url)}" />
<meta property="og:image" content="${DEFAULT_IMAGE}" />
<meta property="og:image:width" content="${DEFAULT_IMAGE_WIDTH}" />
<meta property="og:image:height" content="${DEFAULT_IMAGE_HEIGHT}" />
<meta property="og:image:alt" content="${escapeHtml(fullTitle)}" />
<meta property="og:site_name" content="${SITE_NAME}" />
<meta property="og:locale" content="en_PK" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="${TWITTER_SITE}" />
<meta name="twitter:title" content="${escapeHtml(fullTitle)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${DEFAULT_IMAGE}" />
<meta name="twitter:image:alt" content="${escapeHtml(fullTitle)}" />

<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>

<!-- This response is served only to social-media link-preview crawlers
     (see middleware.ts). Real visitors get the full single-page app. -->
<meta http-equiv="refresh" content="0; url=${escapeHtml(url)}" />
</head>
<body>
<p>${escapeHtml(fullTitle)}</p>
<p>${escapeHtml(description)}</p>
<p><a href="${escapeHtml(url)}">Continue to ${SITE_NAME}</a></p>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return res.status(isNotFound ? 404 : 200).send(html);
}
