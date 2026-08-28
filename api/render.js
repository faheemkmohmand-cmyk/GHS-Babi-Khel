// ─────────────────────────────────────────────────────────────────────────────
// api/render.js — ONE function, TWO live modes  (function-limit consolidation)
//
//   • /api/render?path=/admission   → complete LIVE HTML page for crawlers
//   • /api/render?feed=ai           → complete LIVE JSON feed for AI tools
//     (old /api/ai-data, /ai-data.json and /ai.json URLs are rewritten to
//      this function by vercel.json — every public URL is unchanged)
//
// WHY ONE FUNCTION?
//   Vercel's Hobby plan allows a maximum of 12 Serverless Functions per
//   deployment. The repo previously had 14 separate function files, which
//   would make every deploy fail with "exceeded the maximum number of
//   Serverless Functions". render.js (crawler HTML) and ai-data.js (AI JSON
//   feed) share the same data layer, so they are now ONE function with a tiny
//   query-param dispatcher. The four machine endpoints robots/sitemap/llms/rss
//   were merged the same way into api/seo.js. Total functions: 10 (2 spare
//   slots for future growth).
//
// WHY THE DATA LAYER IS INLINED HERE (no api/_site-data.mjs import):
//   Every helper file inside api/ was one more file the deployment depended
//   on that is NOT a function — and a deleted helper once broke the whole
//   production build. This function is now fully SELF-CONTAINED: its only
//   imports are the @supabase/supabase-js dependency, the canonical FAQ
//   dataset (src/data/faqData.mjs) and the shared page-content module
//   (scripts/seo-page-content.mjs) — both bundled by Vercel automatically.
//   Nothing in api/ except the 10 function files needs to exist.
//
// ── MODE 1: LIVE DYNAMIC RENDERING FOR CRAWLERS (?path=/…) ──────────────────
//
// THE PROBLEM THIS SOLVES
// ──────────────────────
// The site ships build-time prerendered pages (great for humans and as a
// crawlable floor), but their content freezes at the last deploy. The admin
// changes admission status, publishes notices/news/results and edits events
// in the dashboard daily — AI and search crawlers must see those changes in
// near-real-time, not next deploy.
//
// HOW IT WORKS (classic SaaS "dynamic rendering")
// ───────────────────────────────────────────────
//   1. middleware.ts detects AI/search crawler user-agents (GPTBot, ClaudeBot,
//      PerplexityBot, Googlebot, Bingbot, …) on public page routes.
//   2. Those requests are proxied HERE (?path=/admission …).
//   3. This function fetches the LIVE data from Supabase (same tables the
//      admin dashboard writes to) and returns a complete, standalone,
//      semantic HTML document: real headings, lists, full notice/news text,
//      per-route JSON-LD (FAQPage, ItemList, Article…), canonical + OG tags.
//   4. Humans are NOT affected — they still get the real React app, identical
//      design and behaviour. Nothing visual changes for users.
//
// CONTENT GUARANTEES
//   • Same facts as the React pages (same database, same tables).
//   • Every page ends with full internal navigation → one fetch lets a
//     crawler discover every public section of the site.
//   • Detail routes /notices/<id> and /news/<id> render the FULL content of
//     any published item — not just the latest 20 that are prerendered.
//
// ── MODE 2: LIVE MACHINE-READABLE FEED FOR AI TOOLS (?feed=ai) ──────────────
//
// One public JSON endpoint that carries the COMPLETE current state of every
// dynamic thing on the site, straight from the database. An AI tool fetches
// this single URL and gets the latest admission procedure + status, results
// info, notices, news, events, contacts and the full FAQ — in one round trip.
// Access (all open, GET only — aliases are rewrites in vercel.json):
//   https://ghsbabikhel.indevs.in/api/ai-data
//   https://ghsbabikhel.indevs.in/ai-data.json
//   https://ghsbabikhel.indevs.in/ai.json
//
// SAFETY (both modes)
//   • Strict route allow-list; unknown paths → 404 (no open proxy).
//   • UUID validation before any id-based query.
//   • Public tables only — NO student records, NO marks, NO application data.
//   • Edge-cached (HTML 120 s / JSON 60 s, stale-while-revalidate) → fast + DB-safe.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { getPageMeta, NAV_LINKS, SITE_URL, SITE_NAME } from "../scripts/seo-page-content.mjs";
import { FAQ_ITEMS, FAQ_CATEGORIES, buildFaqJsonLd } from "../src/data/faqData.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// INLINED LIVE-DATA LAYER (formerly api/_site-data.mjs — now part of THIS
// function so no helper file inside api/ can ever break the deployment).
//
// DESIGN GOALS
//   • ALWAYS-FRESH: every call queries Supabase directly — whatever the admin
//     changed in the dashboard is reflected within the CDN cache window
//     (60–120 s), not on the next deploy. This is the fix for "content changes
//     by admin but AI tools keep reading the build-time snapshot".
//   • NEVER FAILS: every section is fetched independently with its own
//     try/catch and a sensible static fallback. A Supabase hiccup degrades one
//     section, never the whole endpoint.
//   • NEVER LEAKS PRIVATE DATA: only genuinely public tables are read
//     (school_settings, admission_settings, published notices/news/events,
//     active teachers, library files, published online classes). The
//     `admissions` and `results` tables contain personal data and are NOT
//     dumped here — the endpoints only explain how to search them.
// ─────────────────────────────────────────────────────────────────────────────

const SCHOOL_TZ = "Asia/Karachi";

const FALLBACK_SETTINGS = {
  school_name: "GHS Babi Khel",
  phone: "+92 346 9898295",
  email: "ghsbabikhel@gmail.com",
  principal: "Mr. Imdad Ullah",
  established: "2018",
  emis: "60673",
  address: "Babi Khel, District Mohmand, Khyber Pakhtunkhwa, Pakistan",
};

const supabaseUrl = process.env.VITE_SUPABASE_URL;
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

/** Run a Supabase query with a hard timeout; returns [] on any failure.
 *  Also used for single-item (detail) queries below. */
async function safeQuery(label, run, timeoutMs = 8000) {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const result = await Promise.race([
      run(sb),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs)
      ),
    ]);
    const { data, error } = result;
    if (error) throw error;
    return Array.isArray(data) ? data : data ? [data] : [];
  } catch (err) {
    console.warn(`[site-data] ${label} failed:`, err?.message || err);
    return [];
  }
}

// ── Individual section fetchers ──────────────────────────────────────────────

async function fetchSchoolProfile() {
  const rows = await safeQuery("school_settings", (sb) =>
    sb
      .from("school_settings")
      .select(
        "school_name, phone, email, principal_name, established_year, emis_code, address, tagline, description"
      )
      .eq("id", 1)
      .limit(1)
  );
  const s = rows[0] || {};
  return {
    name: s.school_name || FALLBACK_SETTINGS.school_name,
    full_name: "Government High School Babi Khel",
    location: s.address || FALLBACK_SETTINGS.address,
    district: "Mohmand",
    province: "Khyber Pakhtunkhwa",
    country: "Pakistan",
    established: String(s.established_year || FALLBACK_SETTINGS.established),
    emis_code: String(s.emis_code || FALLBACK_SETTINGS.emis),
    principal: s.principal_name || FALLBACK_SETTINGS.principal,
    phone: s.phone || FALLBACK_SETTINGS.phone,
    email: s.email || FALLBACK_SETTINGS.email,
    tagline: s.tagline || "Excellence in Education",
    description:
      s.description ||
      "Official website of Government High School Babi Khel — online admissions, exam results, notices, news, free study notes and more for classes 6 to 10.",
    classes_offered: ["6", "7", "8", "9", "10"],
    board: "BISE Peshawar",
    website: SITE_URL,
    facebook: "https://www.facebook.com/share/1EERTSk1W7/",
  };
}

async function fetchAdmissionInfo() {
  const rows = await safeQuery("admission_settings", (sb) =>
    sb
      .from("admission_settings")
      .select(
        "id, is_open, session_year, open_date, last_date, banner_message, notes, updated_at"
      )
      .eq("id", 1)
      .limit(1)
  );
  const a = rows[0] || null;
  // Live status straight from the admin dashboard — falls back to a clear
  // "check the page" message when the table can't be read.
  return {
    currently_open: a ? Boolean(a.is_open) : null,
    session_year: a?.session_year || null,
    open_date: a?.open_date || null,
    last_date: a?.last_date || null,
    banner_message: a?.banner_message || null,
    notes: a?.notes || null,
    updated_at: a?.updated_at || null,
    apply_url: `${SITE_URL}/admission`,
    track_url: `${SITE_URL}/admission`,
    classes: ["6", "7", "8", "9", "10"],
    fee: "Free of charge (government school)",
    how_to_apply: [
      "Fill the online admission form at " +
        `${SITE_URL}/admission and submit it`,
      "Save the reference number issued after submission",
      "Track the application any time by reference number, B-Form number or contact number",
      "Once approved, download the printable form, attach documents and complete enrolment at the school office",
    ],
    required_documents: [
      "Student B-Form (NADRA)",
      "Recent passport-size photograph",
      "Previous class result card (where applicable)",
      "School Leaving Certificate (SLC) — required for ALL admissions, fresh and migration",
      "Father's/Guardian's CNIC copy",
      "For class 9/10 migration from another board/school: DMC, migration certificate and enrollment letter — processed by the schools on the BISE Peshawar portal",
    ],
  };
}

async function fetchNotices(limit = 20) {
  const rows = await safeQuery("notices", (sb) =>
    sb
      .from("notices")
      .select("id, title, content, category, is_urgent, created_at")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(limit)
  );
  return rows.map((n) => ({
    id: n.id,
    title: n.title,
    content: (n.content || "").slice(0, 2000),
    category: n.category || "General",
    urgent: Boolean(n.is_urgent),
    published_at: n.created_at,
    url: `${SITE_URL}/notices/${n.id}`,
  }));
}

async function fetchNews(limit = 20) {
  const rows = await safeQuery("news", (sb) =>
    sb
      .from("news")
      .select("id, title, content, image_url, created_at")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(limit)
  );
  return rows.map((n) => ({
    id: n.id,
    title: n.title,
    content: (n.content || "").slice(0, 2000),
    image_url: n.image_url || null,
    published_at: n.created_at,
    url: `${SITE_URL}/news/${n.id}`,
  }));
}

async function fetchEvents(limit = 30) {
  const today = new Date().toISOString().slice(0, 10);
  // Upcoming first (soonest → latest), then recent past as context.
  const upcoming = await safeQuery("school_events_upcoming", (sb) =>
    sb
      .from("school_events")
      .select("id, title, description, event_type, start_date, end_date, updated_at")
      .eq("is_published", true)
      .or(`end_date.gte.${today},and(end_date.is.null,start_date.gte.${today})`)
      .order("start_date", { ascending: true })
      .limit(limit)
  );
  const recent = await safeQuery("school_events_recent", (sb) =>
    sb
      .from("school_events")
      .select("id, title, description, event_type, start_date, end_date, updated_at")
      .eq("is_published", true)
      .lt("start_date", today)
      .order("start_date", { ascending: false })
      .limit(10)
  );
  const shape = (e) => ({
    id: e.id,
    title: e.title,
    description: e.description || null,
    type: e.event_type || "general",
    start_date: e.start_date,
    end_date: e.end_date || null,
  });
  return { upcoming: upcoming.map(shape), recent: recent.map(shape) };
}

async function fetchTeachers(limit = 50) {
  const rows = await safeQuery("teachers", (sb) =>
    sb
      .from("teachers")
      .select("id, full_name, subject, qualification, experience, bio")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .limit(limit)
  );
  return rows.map((t) => ({
    name: t.full_name,
    subject: t.subject || null,
    qualification: t.qualification || null,
    experience: t.experience || null,
    bio: t.bio || null,
  }));
}

async function fetchLibraryFiles(limit = 20) {
  const rows = await safeQuery("library_files", (sb) =>
    sb
      .from("library_files")
      .select("id, title, description, category, class, subject, file_url, file_type, created_at")
      .order("created_at", { ascending: false })
      .limit(limit)
  );
  return rows.map((f) => ({
    id: f.id,
    title: f.title,
    description: f.description || null,
    category: f.category || null,
    class: f.class || null,
    subject: f.subject || null,
    file_type: f.file_type || null,
    download_url: f.file_url || null,
    added_at: f.created_at,
  }));
}

async function fetchOnlineClasses(limit = 15) {
  const rows = await safeQuery("online_classes", (sb) =>
    sb
      .from("online_classes")
      .select(
        "id, title, subject, class_name, teacher_name, scheduled_date, start_time, duration_minutes, status"
      )
      .in("status", ["upcoming", "live"])
      .order("scheduled_date", { ascending: true })
      .limit(limit)
  );
  return rows.map((c) => ({
    title: c.title,
    subject: c.subject,
    class: c.class_name,
    teacher: c.teacher_name,
    date: c.scheduled_date,
    start_time: c.start_time,
    duration_minutes: c.duration_minutes,
    status: c.status,
  }));
}

async function fetchExamInfo() {
  // Which exams exist (names + years only — NO student rows, NO marks).
  // The results table is PII-sensitive; this metadata alone is safe and is
  // all an AI needs to answer "which results are published?".
  const rows = await safeQuery("results_meta", (sb) =>
    sb
      .from("results")
      .select("exam_name, exam_year, class_level")
      .order("created_at", { ascending: false })
      .limit(500)
  );
  const seen = new Set();
  const exams = [];
  for (const r of rows) {
    const key = `${r.exam_name}|${r.exam_year}|${r.class_level}`;
    if (!r.exam_name || seen.has(key)) continue;
    seen.add(key);
    exams.push({
      exam: r.exam_name,
      year: r.exam_year ?? null,
      class: r.class_level ?? null,
    });
    if (exams.length >= 12) break;
  }
  return {
    published_exams: exams,
    how_to_check:
      "Select the exam on ghsbabikhel.indevs.in/results and enter the student's roll number. Result cards with subject-wise marks are on ghsbabikhel.indevs.in/result-card. BISE Peshawar SSC results are fetched live from the official board portal on the same page.",
    grading: {
      "A+": "90% and above",
      A: "80–89%",
      B: "60–79%",
      C: "45–59%",
      D: "33–44%",
      Fail: "below 33%",
    },
    note: "Individual student marks are private — they are only shown to the person searching with the exact roll number, never listed publicly.",
  };
}

/**
 * Fetch the complete live snapshot. Every section is independent — a failure
 * in one never blocks the others. Runs everything in parallel; worst case is
 * bounded by the 8 s per-section timeout.
 */
async function getLiveSiteData() {
  const [
    school,
    admission,
    notices,
    news,
    events,
    teachers,
    library,
    onlineClasses,
    exams,
  ] = await Promise.all([
    fetchSchoolProfile(),
    fetchAdmissionInfo(),
    fetchNotices(20),
    fetchNews(20),
    fetchEvents(30),
    fetchTeachers(50),
    fetchLibraryFiles(20),
    fetchOnlineClasses(15),
    fetchExamInfo(),
  ]);

  return {
    school,
    admission,
    notices,
    news,
    events,
    teachers,
    library,
    onlineClasses,
    exams,
    faq: { categories: FAQ_CATEGORIES, items: FAQ_ITEMS },
  };
}

/** ISO timestamp right now, in the school's timezone, for display. */
function nowInSchoolTz() {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: SCHOOL_TZ,
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
  } catch {
    return new Date().toISOString();
  }
}

/** Escape a string for safe interpolation into HTML. */
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escape a string for safe interpolation inside a JS/JSON <script> tag. */
function escJson(obj) {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

/** Pretty date (dd Month yyyy, school timezone) from an ISO string. */
function prettyDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: SCHOOL_TZ,
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    return "";
  }
}
// ───────────────────────────── end inlined data layer ────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Static routes this renderer accepts (mirrors prerender STATIC_ROUTES).
const STATIC_ROUTES = new Set([
  "/", "/about", "/contact", "/admission", "/notices", "/news", "/results",
  "/result-card", "/calendar", "/teachers", "/gallery", "/library",
  "/online-classes", "/duty", "/notes", "/notes/math", "/notes/physics",
  "/notes/chemistry", "/notes/biology", "/notes/english", "/notes/urdu",
  "/notes/islamiat", "/notes/pakistan-studies", "/notes/computer", "/faq",
]);

// ── Minimal inline styling — for the rare human eye; bots read the text ─────
const CSS = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.7;color:#1a2b22;background:#fff}
header,footer{background:#0f4c3a;color:#fff;padding:20px}
header a,footer a{color:#d9f2e5}
.wrap{max-width:860px;margin:0 auto;padding:24px 20px}
h1{font-size:1.7em;margin:.2em 0 .6em;line-height:1.25}
h2{font-size:1.25em;margin:1.6em 0 .5em;color:#0f4c3a;border-bottom:2px solid #e3efe8;padding-bottom:.25em}
a{color:#0b6e4f}
table{border-collapse:collapse;width:100%;margin:1em 0}
th,td{border:1px solid #d5e3da;padding:8px 10px;text-align:left;vertical-align:top}
th{background:#eef6f1}
.badge{display:inline-block;font-size:.75em;font-weight:700;padding:2px 10px;border-radius:999px;margin-right:6px;vertical-align:middle}
.badge-open{background:#dcfce7;color:#166534}
.badge-closed{background:#fee2e2;color:#991b1b}
.meta{color:#5b6b62;font-size:.9em}
article{border:1px solid #d5e3da;border-radius:10px;padding:16px 18px;margin:14px 0}
footer .cols{display:flex;flex-wrap:wrap;gap:24px}
footer ul{list-style:none;padding:0;margin:0}
.small{font-size:.85em}
`;

// ── Detail fetchers (full content of ONE published item) ────────────────────
async function fetchNoticeDetail(id) {
  const rows = await safeQuery(`notice:${id}`, (sb) =>
    sb
      .from("notices")
      .select("id, title, content, category, is_urgent, created_at")
      .eq("id", id)
      .eq("is_published", true)
      .limit(1)
  );
  return rows[0] || null;
}
async function fetchNewsDetail(id) {
  const rows = await safeQuery(`news:${id}`, (sb) =>
    sb
      .from("news")
      .select("id, title, content, image_url, created_at")
      .eq("id", id)
      .eq("is_published", true)
      .limit(1)
  );
  return rows[0] || null;
}

// ── Small HTML helpers ───────────────────────────────────────────────────────
const listHtml = (items) =>
  items.length
    ? `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`
    : "";
const linkList = (items, emptyText) =>
  items.length
    ? `<ul>${items
        .map(
          ([label, href, extra]) =>
            `<li><a href="${esc(href)}">${esc(label)}</a>${extra ? ` — <span class="meta">${esc(extra)}</span>` : ""}</li>`
        )
        .join("")}</ul>`
    : `<p class="meta">${esc(emptyText || "")}</p>`;

/** Admission live-status box (rendered into /admission and /). */
function admissionStatusHtml(admission) {
  const open = admission.currently_open;
  const badge =
    open === true
      ? `<span class="badge badge-open">OPEN</span>`
      : open === false
        ? `<span class="badge badge-closed">PAUSED</span>`
        : `<span class="badge" style="background:#e2e8f0;color:#334155">SEE PAGE</span>`;
  const lines = [];
  if (admission.session_year) lines.push(`Session: ${admission.session_year}`);
  if (admission.open_date) lines.push(`Applications open: ${prettyDate(admission.open_date)}`);
  if (admission.last_date) lines.push(`Last date to apply: ${prettyDate(admission.last_date)}`);
  return `<h2>Admission status — updated live</h2>
<p><strong>${badge} ${esc(
    open === true ? "Online admission form is open" : open === false ? "Online admission form is paused" : "Check the Admission page for the live status"
  )}</strong></p>
${lines.length ? `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
${admission.banner_message ? `<p><em>${esc(admission.banner_message)}</em></p>` : ""}`;
}

/** Route-specific LIVE sections appended after the static blocks. */
function liveSections(route, data) {
  const parts = [];
  const { admission, notices, news, events, exams, teachers, library, onlineClasses } = data;

  switch (route) {
    case "/": {
      parts.push("<h2>Latest notices (live)</h2>");
      parts.push(
        linkList(
          notices.slice(0, 10).map((n) => [n.title, `/notices/${n.id}`, prettyDate(n.published_at)]),
          "Open the Notices page for the latest official notices."
        )
      );
      parts.push("<h2>Latest news (live)</h2>");
      parts.push(
        linkList(
          news.slice(0, 10).map((n) => [n.title, `/news/${n.id}`, prettyDate(n.published_at)]),
          "Open the News page for the latest school news."
        )
      );
      if (events.upcoming.length) {
        parts.push("<h2>Upcoming events (live)</h2>");
        parts.push(
          `<table><tr><th>Date</th><th>Event</th></tr>${events.upcoming
            .slice(0, 10)
            .map(
              (e) =>
                `<tr><td>${esc(prettyDate(e.start_date))}</td><td>${esc(e.title)}${
                  e.end_date && e.end_date !== e.start_date ? ` – ${esc(prettyDate(e.end_date))}` : ""
                }</td></tr>`
            )
            .join("")}</table>`
        );
      }
      break;
    }
    case "/admission": {
      parts.push(admissionStatusHtml(admission));
      parts.push("<h2>How to apply (full procedure)</h2>");
      parts.push(
        `<ol>${admission.how_to_apply.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`
      );
      parts.push("<h2>Required documents</h2>");
      parts.push(listHtml(admission.required_documents.map((d) => esc(d))));
      break;
    }
    case "/notices": {
      parts.push("<h2>All recent notices (live, newest first)</h2>");
      parts.push(
        notices
          .map(
            (n) => `<article><h3><a href="/notices/${esc(n.id)}">${esc(n.title)}</a></h3>
<p class="meta">${esc(prettyDate(n.published_at))}${n.category ? ` · ${esc(n.category)}` : ""}${n.urgent ? " · <strong>URGENT</strong>" : ""}</p>
<p>${esc((n.content || "").slice(0, 600))}${(n.content || "").length > 600 ? "…" : ""}</p></article>`
          )
          .join("") || `<p class="meta">No notices published yet.</p>`
      );
      break;
    }
    case "/news": {
      parts.push("<h2>All recent news (live, newest first)</h2>");
      parts.push(
        news
          .map(
            (n) => `<article><h3><a href="/news/${esc(n.id)}">${esc(n.title)}</a></h3>
<p class="meta">${esc(prettyDate(n.published_at))}</p>
<p>${esc((n.content || "").slice(0, 600))}${(n.content || "").length > 600 ? "…" : ""}</p></article>`
          )
          .join("") || `<p class="meta">No news published yet.</p>`
      );
      break;
    }
    case "/results": {
      if (exams.published_exams.length) {
        parts.push("<h2>Currently published exams (live)</h2>");
        parts.push(
          `<ul>${exams.published_exams
            .map((e) => `<li>${esc(e.exam)}${e.class ? ` — Class ${esc(e.class)}` : ""}${e.year ? ` (${esc(String(e.year))})` : ""}</li>`)
            .join("")}</ul>`
        );
      }
      parts.push(
        `<p class="meta">Individual results are private: they appear only when the correct roll number is entered on the Results page. Student marks are never listed publicly on this site.</p>`
      );
      break;
    }
    case "/calendar": {
      parts.push("<h2>School events (live)</h2>");
      if (events.upcoming.length) {
        parts.push("<h3>Upcoming</h3>");
        parts.push(
          `<table><tr><th>Date</th><th>Event</th><th>Type</th></tr>${events.upcoming
            .map(
              (e) =>
                `<tr><td>${esc(prettyDate(e.start_date))}${e.end_date && e.end_date !== e.start_date ? ` – ${esc(prettyDate(e.end_date))}` : ""}</td><td>${esc(e.title)}${e.description ? `<br><span class="meta">${esc(e.description)}</span>` : ""}</td><td>${esc(e.type)}</td></tr>`
            )
            .join("")}</table>`
        );
      }
      if (events.recent.length) {
        parts.push("<h3>Recent past</h3>");
        parts.push(
          `<ul>${events.recent.slice(0, 8).map((e) => `<li>${esc(e.title)} — ${esc(prettyDate(e.start_date))}</li>`).join("")}</ul>`
        );
      }
      if (!events.upcoming.length && !events.recent.length)
        parts.push(`<p class="meta">No events published yet.</p>`);
      break;
    }
    case "/teachers": {
      if (teachers.length) {
        parts.push("<h2>Current staff directory (live)</h2>");
        parts.push(
          `<ul>${teachers
            .map(
              (t) =>
                `<li><strong>${esc(t.name)}</strong>${t.subject ? ` — ${esc(t.subject)}` : ""}${t.qualification ? ` · ${esc(t.qualification)}` : ""}</li>`
            )
            .join("")}</ul>`
        );
      }
      break;
    }
    case "/library": {
      if (library.length) {
        parts.push("<h2>Latest downloadable materials (live)</h2>");
        parts.push(
          `<ul>${library
            .map(
              (f) =>
                `<li><a href="${esc(f.download_url || "/library")}">${esc(f.title)}</a>${f.class ? ` — Class ${esc(f.class)}` : ""}${f.subject ? ` · ${esc(f.subject)}` : ""}</li>`
            )
            .join("")}</ul>`
        );
      }
      break;
    }
    case "/online-classes": {
      if (onlineClasses.length) {
        parts.push("<h2>Scheduled online classes (live)</h2>");
        parts.push(
          `<ul>${onlineClasses
            .map(
              (c) =>
                `<li>${esc(c.title)} — ${esc(c.subject)}, Class ${esc(c.class)} · ${esc(prettyDate(c.date))} ${esc(c.start_time || "")} (${esc(c.status)})</li>`
            )
            .join("")}</ul>`
        );
      }
      break;
    }
    case "/faq": {
      // Grouped Q&A — the full FAQ with every answer inline.
      const byCat = new Map();
      for (const item of FAQ_ITEMS) {
        if (!byCat.has(item.category)) byCat.set(item.category, []);
        byCat.get(item.category).push(item);
      }
      for (const [cat, items] of byCat) {
        parts.push(`<h2>${esc(cat)}</h2>`);
        parts.push(
          items
            .map(
              (it) =>
                `<article><h3>${esc(it.question)}</h3><p>${esc(it.answer)}</p></article>`
            )
            .join("")
        );
      }
      break;
    }
    default:
      break;
  }
  return parts.join("\n");
}

/** JSON-LD per route (always fresh). */
function jsonLdFor(route, data, detail) {
  const graph = [
    {
      "@type": "EducationalOrganization",
      name: "Government High School Babi Khel, District Mohmand",
      alternateName: SITE_NAME,
      url: SITE_URL,
      telephone: data.school.phone,
      email: data.school.email,
      foundingDate: data.school.established,
      address: {
        "@type": "PostalAddress",
        streetAddress: "Babi Khel",
        addressLocality: "Babi Khel",
        addressRegion: "Khyber Pakhtunkhwa",
        addressCountry: "PK",
      },
    },
    {
      "@type": "WebPage",
      name: detail?.title || getPageMeta(route)?.title || SITE_NAME,
      url: `${SITE_URL}${route}`,
      isPartOf: { "@type": "WebSite", name: "Government High School Babi Khel", url: SITE_URL },
    },
  ];

  if (route === "/faq") graph.push(buildFaqJsonLd());

  if (route === "/notices" && data.notices.length) {
    graph.push({
      "@type": "ItemList",
      name: "Recent notices — GHS Babi Khel",
      itemListElement: data.notices.slice(0, 20).map((n, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: n.title,
        url: n.url,
      })),
    });
  }
  if (route === "/news" && data.news.length) {
    graph.push({
      "@type": "ItemList",
      name: "Recent news — GHS Babi Khel",
      itemListElement: data.news.slice(0, 20).map((n, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: n.title,
        url: n.url,
      })),
    });
  }
  if (route.startsWith("/notices/") && detail) {
    graph.push({
      "@type": "Article",
      headline: detail.title,
      datePublished: detail.created_at,
      author: { "@type": "Organization", name: "GHS Babi Khel" },
      publisher: { "@type": "Organization", name: "GHS Babi Khel" },
      mainEntityOfPage: `${SITE_URL}${route}`,
    });
  }
  if (route.startsWith("/news/") && detail) {
    graph.push({
      "@type": "NewsArticle",
      headline: detail.title,
      datePublished: detail.created_at,
      author: { "@type": "Organization", name: "GHS Babi Khel" },
      publisher: { "@type": "Organization", name: "GHS Babi Khel" },
      mainEntityOfPage: `${SITE_URL}${route}`,
    });
  }
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
}

// ── MODE 2 constants — the machine-readable AI feed (former ai-data.js) ─────

// Static, timeless navigation + procedures that belong in every snapshot.
const PAGES_GUIDE = [
  { path: "/", purpose: "School overview, latest notices, news and highlights" },
  { path: "/admission", purpose: "Online admission application form + application status tracker (classes 6–10)" },
  { path: "/results", purpose: "Search school exam results by roll number; BISE Peshawar SSC results live from the board portal" },
  { path: "/result-card", purpose: "Detailed result cards with subject-wise marks, grades and class position" },
  { path: "/notices", purpose: "Official notices — exams, holidays, fee deadlines, parent-teacher meetings" },
  { path: "/news", purpose: "School news — events, achievements, sports" },
  { path: "/calendar", purpose: "Academic calendar — exam dates, holidays, events (ICS feed: /calendar.ics)" },
  { path: "/teachers", purpose: "Teaching staff directory" },
  { path: "/notes", purpose: "Free study notes for 9 subjects, classes 6–10, with quizzes and flashcards" },
  { path: "/library", purpose: "Downloadable books, notes and past papers" },
  { path: "/gallery", purpose: "Photos of school events" },
  { path: "/contact", purpose: "Contact details, map, WhatsApp and contact form" },
  { path: "/about", purpose: "School history, mission and vision" },
  { path: "/faq", purpose: "Frequently asked questions — admissions, results, contact, website usage" },
];

const RESULT_SEARCH_STEPS = [
  "Open " + "https://ghsbabikhel.indevs.in/results",
  "Select the exam (class + examination name)",
  "Enter the student's roll number exactly as on the admit card",
  "View total/obtained marks, percentage, grade and pass status; open /result-card for the printable subject-wise card",
];

// ── MODE 2 handler — the JSON feed (former api/ai-data.js, behaviour intact) ─
async function aiDataHandler(req, res) {
  // ── CORS: readable from any origin (AI agents, browser tools) — GET only ──
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Max-Age", "86400");
    return res.status(204).end();
  }
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed. Use GET." });
  }

  const data = await getLiveSiteData();

  const payload = {
    // ── Meta ────────────────────────────────────────────────────────────────
    meta: {
      name: "GHS Babi Khel — AI data feed",
      description:
        "Live, machine-readable snapshot of Government High School Babi Khel (District Mohmand, KPK, Pakistan): school profile, admission status and procedure, results info, latest notices, news, events, teachers, library files, online classes and the full FAQ. Generated on request from the school's own database — safe to quote.",
      generated_at: new Date().toISOString(),
      generated_at_display: `${nowInSchoolTz()} (PKT)`,
      timezone: "Asia/Karachi",
      freshness:
        "Data is fetched live from the school database on every request; the CDN cache is 60 seconds, so answers reflect dashboard changes within about a minute.",
      site_url: "https://ghsbabikhel.indevs.in",
      companion_sources: [
        "https://ghsbabikhel.indevs.in/llms.txt",
        "https://ghsbabikhel.indevs.in/sitemap.xml",
        "https://ghsbabikhel.indevs.in/rss.xml",
      ],
      content_type: "application/json; charset=utf-8",
    },

    // ── School profile (live) ───────────────────────────────────────────────
    school: data.school,

    // ── Admissions (live status + timeless procedure) ───────────────────────
    admission: {
      ...data.admission,
      status_text:
        data.admission.currently_open === true
          ? `Admissions are OPEN${data.admission.session_year ? ` for session ${data.admission.session_year}` : ""}. Apply at ${data.admission.apply_url}.`
          : data.admission.currently_open === false
            ? `The online admission form is currently PAUSED by the school${data.admission.session_year ? ` (session ${data.admission.session_year})` : ""}. Check ${data.admission.apply_url} — it shows the live status — or download the printable form from the same page and submit it at the school office.`
            : `Admissions run every academic session for classes 6–10. Check ${data.admission.apply_url} for the current status.`,
      deadline_text: data.admission.last_date
        ? `Application deadline: ${data.admission.last_date}`
        : "No application deadline is currently published; see the Admission page for the live status.",
    },

    // ── Results (metadata only — no student data, ever) ─────────────────────
    results: {
      ...data.exams,
      search_steps: RESULT_SEARCH_STEPS,
    },

    // ── Latest content (live, newest first) ─────────────────────────────────
    latest_notices: data.notices,
    latest_news: data.news,
    calendar: {
      upcoming_events: data.events.upcoming,
      recent_events: data.events.recent,
      subscribe_ics: "https://ghsbabikhel.indevs.in/calendar.ics",
    },
    teachers: data.teachers,
    library: data.library,
    online_classes: data.onlineClasses,

    // ── FAQ (complete, categorised) ─────────────────────────────────────────
    faq: {
      page_url: "https://ghsbabikhel.indevs.in/faq",
      categories: data.faq.categories,
      items: data.faq.items,
      count: FAQ_ITEMS.length,
    },

    // ── Where each piece of information lives ───────────────────────────────
    pages: PAGES_GUIDE,
  };

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=60, stale-while-revalidate=600, max-age=0"
  );
  return res.status(200).send(JSON.stringify(payload));
}

// ── MODE 1 handler — live crawler HTML (former default export, intact) ──────
async function renderHandler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed. Use GET." });
  }

  const rawPath = String(req.query?.path || "/");
  let route = "/";
  try {
    route = decodeURIComponent(rawPath.split("?")[0] || "/");
  } catch {
    route = String(rawPath || "/");
  }
  if (route.length > 1 && route.endsWith("/")) route = route.slice(0, -1);
  if (!route.startsWith("/")) route = "/" + route;

  // Detail routes: /notices/<uuid>, /news/<uuid>
  const detailMatch = route.match(/^\/(notices|news)\/([^/]+)$/);
  let detail = null;
  let detailKind = null;

  if (detailMatch) {
    detailKind = detailMatch[1];
    const id = detailMatch[2];
    if (!UUID_RE.test(id)) {
      return res.status(404).setHeader("Content-Type", "text/html; charset=utf-8").send(notFoundHtml(route));
    }
    detail = detailKind === "notices" ? await fetchNoticeDetail(id) : await fetchNewsDetail(id);
    if (!detail) {
      return res.status(404).setHeader("Content-Type", "text/html; charset=utf-8").send(notFoundHtml(route));
    }
  } else if (!STATIC_ROUTES.has(route)) {
    // Strict allow-list — anything else is a 404 for crawlers.
    return res.status(404).setHeader("Content-Type", "text/html; charset=utf-8").send(notFoundHtml(route));
  }

  // Full live snapshot (parallel, fault-tolerant). For a single detail page we
  // still fetch the snapshot because the header/nav/footer reuse school facts.
  const data = await getLiveSiteData();

  // ── Title / description ────────────────────────────────────────────────────
  let title, description, h1;
  if (detail) {
    title = `${detail.title} — ${detailKind === "notices" ? "Notice" : "News"} | GHS Babi Khel`;
    description =
      (detail.content || "").replace(/\s+/g, " ").trim().slice(0, 155) ||
      `${detailKind === "notices" ? "Official notice" : "News article"} from Government High School Babi Khel, District Mohmand.`;
    h1 = detail.title;
  } else {
    const meta = getPageMeta(route);
    title = meta?.title || `${SITE_NAME}`;
    description = meta?.description || "";
    h1 = meta?.h1 || SITE_NAME;
  }
  const canonical = `${SITE_URL}${route === "/" ? "/" : route}`;

  // ── Body content ───────────────────────────────────────────────────────────
  let contentHtml;
  if (detail) {
    contentHtml = `<p class="meta">${esc(prettyDate(detail.created_at))}${
      detail.category ? ` · ${esc(detail.category)}` : ""
    }${detail.is_urgent ? " · <strong>URGENT</strong>" : ""}</p>
${detail.content ? detail.content.split(/\n{2,}|\n/).map((p) => `<p>${esc(p)}</p>`).join("") : "<p class=\"meta\">(No further text — see the page for details or contact the school.)</p>"}
<p><a href="/${detailKind}">← All ${detailKind}</a></p>`;
  } else {
    // Static blocks from the shared content module + LIVE sections appended.
    const meta = getPageMeta(route);
    const staticBlocks = (meta?.blocks || [])
      .map((block) => {
        const parts = [];
        if (block.__faqCategory) {
          // FAQ page — every canonical Q&A of this category (src/data/faqData.mjs).
          const items = FAQ_ITEMS.filter((it) => it.category === block.__faqCategory);
          if (block.h2) parts.push(`<h2>${esc(block.h2)}</h2>`);
          for (const it of items) {
            parts.push(`<article><h3>${esc(it.question)}</h3><p>${esc(it.answer)}</p></article>`);
          }
          return parts.join("\n");
        }
        if (block.h2) parts.push(`<h2>${esc(block.h2)}</h2>`);
        if (block.p) for (const para of block.p) parts.push(`<p>${esc(para)}</p>`);
        if (block.ul) parts.push(`<ul>${block.ul.map((li) => `<li>${esc(li)}</li>`).join("")}</ul>`);
        if (block.links?.nav) {
          parts.push(
            `<ul>${NAV_LINKS.filter(([l, href]) => href !== route)
              .map(([l, href]) => `<li><a href="${esc(href)}">${esc(l)}</a></li>`)
              .join("")}</ul>`
          );
        }
        // `links: {source}` markers (build-time concept) are skipped here —
        // the live sections below always carry fresh lists instead.
        return parts.join("\n");
      })
      .join("\n");
    contentHtml = staticBlocks + (route === "/faq" ? "" : "\n" + liveSections(route, data));
  }

  // Admission live box also belongs on the homepage of crawler HTML.
  if (route === "/" && !detail) {
    contentHtml = admissionStatusHtml(data.admission) + "\n" + contentHtml;
  }

  // ── Page shell ─────────────────────────────────────────────────────────────
  const nav = NAV_LINKS.map(
    ([label, href]) => `<a href="${esc(href)}" style="margin-right:14px">${esc(label)}</a>`
  ).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${esc(canonical)}" />
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
<meta name="generator" content="GHS Babi Khel live renderer — dynamic rendering for AI/search crawlers; humans receive the full interactive site" />
<meta property="og:type" content="${detail && detailKind === "news" ? "article" : "website"}" />
<meta property="og:site_name" content="${esc(SITE_NAME)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${esc(canonical)}" />
<meta property="og:image" content="${SITE_URL}/og-image.jpg" />
<meta name="twitter:card" content="summary_large_image" />
<script type="application/ld+json">${jsonLdFor(route, data, detail)}</script>
<style>${CSS}</style>
</head>
<body>
<!-- Rendered live by /api/render from the school database at ${new Date().toISOString()} -->
<header>
  <div class="wrap" style="padding:0">
    <strong>${esc(data.school.name)}</strong> — ${esc(data.school.tagline)}<br>
    <span class="small">${esc(data.school.location)} · Phone ${esc(data.school.phone)} · ${esc(data.school.email)}</span>
  </div>
</header>
<main class="wrap">
<h1>${esc(h1)}</h1>
${contentHtml}
<h2>Website sections</h2>
${nav ? `<nav>${nav}</nav>` : ""}
<p>Machine-readable data: <a href="/api/ai-data">/api/ai-data</a> (live JSON — school profile, admission status, notices, news, events, FAQ) · <a href="/llms.txt">/llms.txt</a> · <a href="/sitemap.xml">/sitemap.xml</a> · <a href="/rss.xml">/rss.xml</a></p>
</main>
<footer>
  <div class="wrap" style="padding:0">
    <div class="cols">
      <div><strong>${esc(data.school.full_name || data.school.name)}</strong><br>
      ${esc(data.school.location)}<br>
      Principal: ${esc(data.school.principal)} · EMIS ${esc(data.school.emis_code)}<br>
      Phone: ${esc(data.school.phone)} · Email: ${esc(data.school.email)}</div>
      <div class="small">${NAV_LINKS.map(([l, href]) => `<a href="${esc(href)}">${esc(l)}</a>`).join(" · ")}</div>
    </div>
    <p class="small">© ${new Date().getFullYear()} ${esc(data.school.name)}. Free government education — District Mohmand, Khyber Pakhtunkhwa.</p>
  </div>
</footer>
<script type="application/json" id="ghs-live-data">${escJson({
    generated_at: new Date().toISOString(),
    school: data.school,
    admission: data.admission,
  })}</script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=86400, max-age=0");
  res.setHeader("X-GHS-Render", `live; generated=${new Date().toISOString()}`);
  return res.status(200).send(html);
}

// ── 404 page for unknown routes (also helps crawlers stop asking) ───────────
function notFoundHtml(pathname) {
  const links = NAV_LINKS.map(([l, href]) => `<a href="${esc(href)}">${esc(l)}</a>`).join(" · ");
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><title>Page not found — ${esc(SITE_NAME)}</title>
<meta name="robots" content="noindex" /><style>${CSS}</style></head>
<body><main class="wrap"><h1>Page not found</h1>
<p>The address <code>${esc(pathname)}</code> does not exist on this website. All public sections are listed below.</p>
<p>${links}</p>
<p class="small">Machine-readable data: <a href="/api/ai-data">/api/ai-data</a> · <a href="/llms.txt">/llms.txt</a></p>
</main></body></html>`;
}

// ── Entry point — tiny dispatcher, zero overhead ─────────────────────────────
//   ?feed=ai  → JSON feed (the old /api/ai-data behaviour; vercel.json rewrites
//               /api/ai-data, /ai-data.json and /ai.json here with feed=ai)
//   otherwise → live crawler HTML (?path=/…)
export default async function handler(req, res) {
  if (String(req.query?.feed || "").toLowerCase() === "ai") {
    return aiDataHandler(req, res);
  }
  return renderHandler(req, res);
}
