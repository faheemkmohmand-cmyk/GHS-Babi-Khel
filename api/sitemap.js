// api/sitemap.js
// Vercel Serverless Function — generates sitemap.xml dynamically.
//
// Fixes in this version (lastmod accuracy — "sitemap lastmod spam"):
//
//   • CORRECT TABLE NAMES: the calendar page reads `school_events` (not
//     "events") and the duty page reads `duty_board` (not "duty_roster").
//     The old names don't exist, so every lookup silently failed and
//     fell back to "today" — making /calendar and /duty claim they change
//     daily. Google learns to distrust lastmod dates that always say
//     "today" and crawls the site less.
//
//   • CORRECT COLUMN NAMES: teachers, online_classes, library_files,
//     gallery_photos, results, notes (note_chapters) and notices/news have
//     NO updated_at column — only created_at. The old code queried
//     updated_at, silently failed, and stamped "today" on all of them.
//
//   • /admission no longer queries the admissions table — that table is
//     now protected for anonymous visitors (see migration
//     20260825000001_014_secure_pii_rls.sql). Its lastmod falls back to the
//     deploy date, which is a fair proxy for when the admission page
//     content last changed.
//
//   • Detail pages for notices/news (latest 200, published only) remain —
//     these carry the school's actual content and help AI crawlers
//     (GPTBot, ClaudeBot, PerplexityBot) discover it.
//
//   • hreflang alternates remain REMOVED (they all pointed at the same
//     URL — a conflicting signal). /weather remains REMOVED (route
//     doesn't exist — was a soft-404 entry).
//
// Access at: /api/sitemap  (vercel.json rewrites /sitemap.xml → here)

import { createClient } from "@supabase/supabase-js";

const SITE_URL = "https://ghsbabikhel.indevs.in";

// Deploy-time anchor for static pages.
const STATIC_LASTMOD = process.env.BUILD_TIMESTAMP || new Date().toISOString().split("T")[0];

// Static pages with their SEO metadata.
// `dbSource` maps a page to a Supabase table + REAL timestamp column whose
// MAX() becomes <lastmod>. Verified against the live schema:
//   school_events.updated_at ✓   duty_board.updated_at ✓
//   notices.created_at ✓         news.created_at ✓
//   teachers.created_at ✓        online_classes.created_at ✓
//   library_files.created_at ✓   gallery_photos.created_at ✓
//   results.created_at ✓         note_chapters.created_at ✓
// Pages without `dbSource` use STATIC_LASTMOD (deploy date).
const STATIC_PAGES = [
  { path: "/", changefreq: "daily",   priority: "1.0", dbSource: { table: "notices",       column: "created_at" } },
  { path: "/admission", changefreq: "weekly",  priority: "0.9" }, // admissions table is PII-locked now
  { path: "/notices", changefreq: "daily",   priority: "0.9", dbSource: { table: "notices",       column: "created_at" } },
  { path: "/news", changefreq: "daily",   priority: "0.9", dbSource: { table: "news",          column: "created_at" } },
  // /results is boosted to priority 1.0 + daily changefreq because it is the
  // primary landing page for our highest-intent SEO keywords.
  { path: "/results", changefreq: "daily",   priority: "1.0", dbSource: { table: "results",       column: "created_at" } },
  { path: "/calendar", changefreq: "daily",   priority: "0.9", dbSource: { table: "school_events", column: "updated_at" } },
  { path: "/contact", changefreq: "monthly", priority: "0.8" },
  { path: "/about", changefreq: "monthly", priority: "0.8" },
  { path: "/teachers", changefreq: "monthly", priority: "0.8", dbSource: { table: "teachers",      column: "created_at" } },
  { path: "/online-classes", changefreq: "weekly",  priority: "0.8", dbSource: { table: "online_classes", column: "created_at" } },
  { path: "/notes", changefreq: "weekly",  priority: "0.8", dbSource: { table: "note_chapters",  column: "created_at" } },
  { path: "/library", changefreq: "weekly",  priority: "0.8", dbSource: { table: "library_files",  column: "created_at" } },
  { path: "/duty", changefreq: "weekly",  priority: "0.7", dbSource: { table: "duty_board",     column: "updated_at" } },
  { path: "/result-card", changefreq: "weekly",  priority: "0.7", dbSource: { table: "results",       column: "created_at" } },
  { path: "/gallery", changefreq: "weekly",  priority: "0.7", dbSource: { table: "gallery_photos", column: "created_at" } },
];

const SUBJECT_PAGES = [
  "math", "physics", "chemistry", "biology", "english",
  "urdu", "islamiat", "pakistan-studies", "computer",
];

// How many notice/news detail URLs to include (most recent first).
const DETAIL_PAGE_LIMIT = 200;

// ── Supabase client (serverless, no session) ────────────────────────────────
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
 * Fetch MAX(timestamp) for a single table+column (verified column names).
 * Returns an ISO date string (YYYY-MM-DD) or null if the query fails /
 * the table is empty. Errors are caught — a locked/missing table just
 * falls back to STATIC_LASTMOD, never crashes the sitemap.
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
    return new Date(val).toISOString().split("T")[0];
  } catch {
    return null;
  }
}

/**
 * Build the <url> XML element for one page.
 * (hreflang alternates intentionally removed — they all pointed at the same
 *  URL, which is a conflicting signal. Re-add when real Urdu URLs exist.)
 */
function buildUrlEntry(page, lastmod) {
  const url = `${SITE_URL}${page.path}`;
  return `  <url>
    <loc>${url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`;
}

/**
 * Fetch recent rows (id + created_at) from a content table and build
 * detail-page <url> entries for them: /<basePath>/<id>.
 * Used for /notices/<id> and /news/<id> — the pages that actually carry the
 * school's content and get shared on social media.
 * Only PUBLISHED rows are included (is_published = true).
 */
async function getDetailEntries(table, basePath) {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from(table)
      .select("id, created_at")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(DETAIL_PAGE_LIMIT);
    if (error || !Array.isArray(data)) return [];
    return data
      .filter((r) => r && r.id)
      .map((r) =>
        buildUrlEntry(
          { path: `${basePath}/${r.id}`, changefreq: "weekly", priority: "0.6" },
          r.created_at ? new Date(r.created_at).toISOString().split("T")[0] : STATIC_LASTMOD
        )
      );
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  // ── Resolve real lastmod per page (in parallel) ──────────────────────────
  const lastmodPromises = STATIC_PAGES.map(async (page) => {
    if (!page.dbSource) return { page, lastmod: STATIC_LASTMOD };
    const lm = await getLastMod(page.dbSource.table, page.dbSource.column);
    return { page, lastmod: lm || STATIC_LASTMOD };
  });

  // Subject pages (/notes/math, etc.) share the notes lastmod (note_chapters).
  const notesLastmodPromise = getLastMod("note_chapters", "created_at");

  // Detail pages for notices and news (in parallel).
  const noticeDetailsPromise = getDetailEntries("notices", "/notices");
  const newsDetailsPromise = getDetailEntries("news", "/news");

  const [pageResults, notesLastmod, noticeDetails, newsDetails] = await Promise.all([
    Promise.all(lastmodPromises),
    notesLastmodPromise,
    noticeDetailsPromise,
    newsDetailsPromise,
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
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

 ${staticEntries.join("\n\n")}

 ${subjectEntries.join("\n")}

 ${noticeDetails.join("\n")}

 ${newsDetails.join("\n")}

</urlset>`;

  res.setHeader("Content-Type", "application/xml");
  // Cache at the CDN for 1 hour, but allow serving stale for up to 24h
  // while revalidating in the background.
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).send(xml);
}
