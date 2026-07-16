// api/sitemap.js
// Vercel Serverless Function — generates sitemap.xml dynamically.
//
// Fixes for issues 2.7 + 2.8 (batch 2):
//
//   • 2.7 — The static `public/sitemap.xml` file was dead code (vercel.json
//     rewrites /sitemap.xml → /api/sitemap) AND had stale 2025-01-10..2025-06-01
//     <lastmod> dates, which Google interprets as "low crawl priority". The
//     static file should be DELETED; this dynamic generator is the single
//     source of truth.
//
//     Additionally, the previous version of this file used `new Date().today`
//     as <lastmod> for EVERY URL — which is a sitemap-spam signal (Google
//     penalises sites that claim every page changed today). We now query
//     Supabase for the real MAX(updated_at) per content type and map each
//     content type to its corresponding URL. Pages with no DB backing fall
//     back to a build-time constant (DEPLOY_TIME) so they don't all read
//     "today".
//
//   • 2.8 — /contact was missing from the OLD static sitemap. It was already
//     present in the previous version of this dynamic generator; verified
//     again below. (No action needed beyond confirmation.)
//
// Access at: /api/sitemap  (vercel.json rewrites /sitemap.xml → here)

import { createClient } from "@supabase/supabase-js";

const SITE_URL = "https://ghsbabikhel.indevs.in";

// Deploy-time anchor for static pages (about, contact, weather, etc.).
// Falls back to today's date if Vercel doesn't inject BUILD_TIMESTAMP.
const STATIC_LASTMOD = process.env.BUILD_TIMESTAMP || new Date().toISOString().split("T")[0];

// Static pages with their SEO metadata.
// `dbSource` (optional) maps a page to a Supabase table whose MAX(updated_at)
// will be used as <lastmod>. Pages without `dbSource` use STATIC_LASTMOD.
const STATIC_PAGES = [
  { path: "/", changefreq: "daily",   priority: "1.0", dbSource: { table: "notices",     column: "updated_at" } },
  { path: "/admission", changefreq: "weekly",  priority: "0.9", dbSource: { table: "admissions",  column: "updated_at" } },
  { path: "/notices", changefreq: "daily",   priority: "0.9", dbSource: { table: "notices",     column: "updated_at" } },
  { path: "/news", changefreq: "daily",   priority: "0.9", dbSource: { table: "news",        column: "updated_at" } },
  // /results is boosted to priority 1.0 + daily changefreq because:
  //   • It is the primary landing page for our highest-intent SEO keywords
  //     (BISE Peshawar Result, SSC Result, BISEP Result, Peshawar Board Result).
  //   • The page renders live exam-result data fetched from BISEP via the
  //     /api/bisep-proxy serverless function, so its content can change
  //     daily during result season (July–November).
  //   • Google's crawler uses <priority> as a relative hint (not absolute),
  //     so 1.0 here signals "crawl this page before others on this site".
  { path: "/results", changefreq: "daily",   priority: "1.0", dbSource: { table: "results",     column: "updated_at" } },
  { path: "/calendar", changefreq: "daily",   priority: "0.9", dbSource: { table: "events",      column: "updated_at" } },
  { path: "/contact", changefreq: "monthly", priority: "0.8" },  // ← 2.8: present (was missing from old static file)
  { path: "/about", changefreq: "monthly", priority: "0.8" },
  { path: "/teachers", changefreq: "monthly", priority: "0.8", dbSource: { table: "teachers",    column: "updated_at" } },
  { path: "/online-classes", changefreq: "weekly",  priority: "0.8", dbSource: { table: "online_classes", column: "updated_at" } },
  { path: "/notes", changefreq: "weekly",  priority: "0.8", dbSource: { table: "notes",        column: "updated_at" } },
  { path: "/library", changefreq: "weekly",  priority: "0.8", dbSource: { table: "library_files", column: "updated_at" } },
  { path: "/duty", changefreq: "weekly",  priority: "0.7", dbSource: { table: "duty_roster", column: "updated_at" } },
  { path: "/result-card", changefreq: "weekly",  priority: "0.7", dbSource: { table: "results",     column: "updated_at" } },
  { path: "/gallery", changefreq: "weekly",  priority: "0.7", dbSource: { table: "gallery_photos", column: "updated_at" } },
  { path: "/weather", changefreq: "daily",   priority: "0.5" },
];

const SUBJECT_PAGES = [
  "math", "physics", "chemistry", "biology", "english",
  "urdu", "islamiat", "pakistan-studies", "computer",
];

// ── Supabase client (serverless, no session) ────────────────────────────────
// We create a fresh, lightweight client per request — no auth, no persistence.
// env vars are exposed by Vercel at runtime.
const supabaseUrl    = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  if (!supabaseUrl || !supabaseAnonKey) return null;
  _supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return _supabase;
}

/**
 * Fetch MAX(updated_at) for a single table.
 * Returns an ISO date string (YYYY-MM-DD) or null if the query fails /
 * the table is empty / the column doesn't exist.
 *
 * We use Supabase's `select` with `order` + `limit 1` instead of an RPC
 * because anon RLS policies typically allow SELECT on public-facing tables
 * but may not allow aggregate functions.
 */
async function getLastMod(table, column) {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from(table)
      .select(column)
      .order(column, { ascending: false, nullsFirst: false })
      .limit(1);
    if (error || !data || data.length === 0) return null;
    const val = data[0]?.[column];
    if (!val) return null;
    // Supabase returns timestamps like "2025-06-12T14:23:11+00:00".
    // Sitemaps want plain YYYY-MM-DD.
    return new Date(val).toISOString().split("T")[0];
  } catch {
    return null;
  }
}

/**
 * Build the <url> XML element for one page.
 * Falls back to STATIC_LASTMOD if no DB-backed timestamp is available.
 */
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
  // ── Resolve real lastmod per page (in parallel) ──────────────────────────
  // For pages with a dbSource, fire off a MAX(updated_at) query.
  // For pages without one, use STATIC_LASTMOD.
  const lastmodPromises = STATIC_PAGES.map(async (page) => {
    if (!page.dbSource) return { page, lastmod: STATIC_LASTMOD };
    const lm = await getLastMod(page.dbSource.table, page.dbSource.column);
    return { page, lastmod: lm || STATIC_LASTMOD };
  });

  // Subject pages (/notes/math, etc.) share the /notes lastmod.
  const notesLastmodPromise = getLastMod("notes", "updated_at");

  const [pageResults, notesLastmod] = await Promise.all([
    Promise.all(lastmodPromises),
    notesLastmodPromise,
  ]);

  const staticEntries = pageResults.map(({ page, lastmod }) => buildUrlEntry(page, lastmod));
  const subjectLastmod = notesLastmod || STATIC_LASTMOD;
  const subjectEntries = SUBJECT_PAGES.map((subject) =>
    buildUrlEntry(
      { path: `/notes/${subject}`, changefreq: "weekly", priority: "0.7" },
      subjectLastmod
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
  // Cache at the CDN for 1 hour, but allow serving stale for up to 24h
  // while revalidating in the background. This keeps the sitemap cheap
  // even if Google hammers it.
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).send(xml);
}
