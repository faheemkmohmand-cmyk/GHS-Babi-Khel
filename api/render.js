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
//   feed) share the same data layer (api/_site-data.mjs + api/_faq.mjs), so
//   they are now ONE function with a tiny query-param dispatcher. The four
//   machine endpoints robots/sitemap/llms/rss were merged the same way into
//   api/seo.js. Total functions: 10 (2 spare slots for future growth).
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

import { getLiveSiteData, nowInSchoolTz, safeQuery, esc, escJson, prettyDate } from "./_site-data.mjs";
import { getPageMeta, NAV_LINKS, SITE_URL, SITE_NAME } from "../scripts/seo-page-content.mjs";
import { FAQ_ITEMS, buildFaqJsonLd } from "./_faq.mjs";

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
          // FAQ page — every canonical Q&A of this category (api/_faq.mjs).
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
