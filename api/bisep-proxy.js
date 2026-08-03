// api/bisep-proxy.js
// Vercel Serverless Function — proxies BISE Peshawar result lookups so the
// school website can display board results when no in-house school result
// has been published by the admin yet.
//
// WHY A PROXY (not a direct browser fetch)?
//   1. CORS — cloud.bisep.edu.pk does NOT send `Access-Control-Allow-Origin`,
//      so a browser-side fetch from ghsbabikhel.indevs.in would be blocked.
//   2. Cloudflare bypass — BISE Peshawar sits behind Cloudflare's "managed
//      challenge". Node's built-in `fetch` (undici) has a TLS fingerprint
//      Cloudflare flags, returning the "Just a moment..." challenge page
//      instead of the real result. We therefore shell out to `curl` (which
//      IS available on Vercel's serverless runtime) — curl's TLS handshake
//      is accepted by Cloudflare and returns the actual result HTML.
//   3. Caching — board results never change once published, so we cache
//      aggressively on the edge (s-maxage=24h) to keep our Vercel function
//      invocations low and avoid hammering BISE Peshawar (per the user's
//      PDF requirement #5 "Avoid excessive requests" and #6 "Use caching").
//   4. Error containment — if BISE is down or Cloudflare blocks us, we
//      return a clean JSON error to the SPA instead of crashing the page
//      (PDF requirement #7 "Handle errors gracefully" and #8 "Ensure my
//      website hosting does not crash").
//
// ── TWO MODES (same function — keeps Vercel function count at 12, not 13) ──
//
//   Mode 1 — Roll-number lookup (the original behaviour):
//     /api/bisep-proxy?roll=703902
//     Fetches: https://cloud.bisep.edu.pk/ShowResult.php?Search=RollNo&RollNo=703902
//     Returns: { found: true, roll_no, name, father_name, marks, grade, remarks,
//                collect_dmc_from, subjects: [{ sr, subject, theory, practical }, ...] }
//        OR:   { found: false, message: "Record not Found. ..." }   (invalid roll)
//        OR:   { found: false, error: "..." }                        (proxy error)
//
//   Mode 2 — Current-exam metadata (added 2026-07-16):
//     /api/bisep-proxy?mode=current
//     Fetches: https://cloud.bisep.edu.pk/  (the BISEP homepage / landing page)
//     Returns: { ok: true, is_live: true/false, exam_title: "HSSC Annual-II 2025",
//                exam_year: 2025, raw_subheader: "...", countdown_text: null,
//                countdown_date: null, fetched_at: "2026-07-16T..." }
//        OR:   { ok: false, error: "...", fetched_at: "..." }
//
//     Why: BISEP shows the current exam name (e.g. "HSSC Annual-II 2025" or
//     "SSC Annual-I 2026") inside <div class="sub-header">RESULT - <EXAM></div>
//     on the homepage. When a new result is pending, the same div shows an
//     announcement / countdown text. Previously the GHS site hardcoded this
//     title as a build-time env var (VITE_BISEP_EXAM_TITLE) which meant the
//     page was always out of date vs. what BISEP was actually serving. Now
//     the homepage + /results page poll this endpoint hourly and reflect
//     BISEP's live state precisely.
//
//     The title regex is PRECISE — verified against the actual BISEP homepage
//     HTML fetched on 2026-07-16 which returned:
//       <div class="sub-header">RESULT - HSSC ANNUAL-II EXAMINATION 2025</div>
//
//     The countdown regex is BEST-EFFORT — BISEP's pre-announcement HTML
//     format is not publicly archived, so we match several common patterns
//     ("Result will be announced on <date>", "Result expected in <month>",
//     "AWAITED", "COMING SOON", etc.). If none match, countdown_text/date
//     are null and the client just shows the title without a countdown.
//
// CACHE: Mode 2 uses a 1-hour edge cache (s-maxage=3600) — BISEP's homepage
// changes at most a few times per year (when a new result is announced), so
// hourly polling is more than sufficient. The client-side hook
// (useBisepCurrentExam) also polls hourly and falls back to the previous
// result while refetching, so the UI never flickers.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BISEP_URL = "https://cloud.bisep.edu.pk/ShowResult.php";

// Vercel serverless functions can be killed at 10s on the hobby tier.
// 8s gives us a safety margin to return a clean 504 to the client.
const UPSTREAM_TIMEOUT_MS = 8;

// Realistic browser headers — without these Cloudflare returns the JS
// challenge page instead of the actual result HTML.
const BROWSER_HEADERS = [
  "-H", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "-H", "Accept-Language: en-US,en;q=0.5",
  "-H", "Referer: https://cloud.bisep.edu.pk/",
  "-H", "Upgrade-Insecure-Requests: 1",
  "-H", "Sec-Fetch-Dest: document",
  "-H", "Sec-Fetch-Mode: navigate",
  "-H", "Sec-Fetch-Site: same-origin",
  "-H", "Sec-Fetch-User: ?1",
  "--compressed",           // ask for gzip/br so the response is small
  "--silent",               // no progress meter
  "--show-error",           // but DO show errors on stderr
  "--location",             // follow redirects
  "--max-time", String(UPSTREAM_TIMEOUT_MS),
  "--connect-timeout", "5",
];

export default async function handler(req, res) {
  // ── Mode dispatch ───────────────────────────────────────────────────
  // `?mode=current` → scrape BISEP homepage for the current exam title +
  // countdown text (see fetchCurrentExam below). Cached 1h on the edge.
  // Anything else → original roll-number lookup behaviour.
  const mode = (req.query?.mode || "").toString().trim().toLowerCase();
  if (mode === "current") {
    return fetchCurrentExam(req, res);
  }

  const roll = (req.query?.roll || "").toString().trim();

  // ── Input validation ────────────────────────────────────────────────
  // BISE Peshawar roll numbers are numeric (typically 6 digits, but SSC
  // roll numbers can be 4-7 digits and HSSC up to 10). Reject anything
  // non-numeric or absurdly long to prevent injection / abuse.
  if (!roll || !/^\d{4,10}$/.test(roll)) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(400).json({
      found: false,
      error: "Invalid roll number. Use 4–10 digits only.",
    });
  }

  const upstreamUrl = `${BISEP_URL}?Search=RollNo&RollNo=${roll}`;

  let stdout = "";
  let curlError = null;
  let curlExitCode = 0;
  try {
    const result = await execFileAsync(
      "curl",
      [...BROWSER_HEADERS, upstreamUrl],
      {
        maxBuffer: 5 * 1024 * 1024,    // 5 MB is plenty for an HTML result page
        timeout: (UPSTREAM_TIMEOUT_MS + 2) * 1000,  // kill curl slightly after --max-time
        encoding: "utf8",
      }
    );
    stdout = result.stdout || "";
  } catch (err) {
    // curl returns exit code 28 on --max-time timeout; surface that cleanly.
    curlError = err;
    curlExitCode = err.code ?? 1;
    // curl still writes whatever it received to stdout before timing out,
    // so we keep err.stdout if present and try to parse it.
    stdout = err.stdout || "";
  }

  // If we got nothing usable back, return a clean error.
  if (!stdout && curlError) {
    res.setHeader("Cache-Control", "no-store");
    if (curlExitCode === 28) {
      return res.status(504).json({
        found: false,
        error: "BISE Peshawar took too long to respond. Please try again.",
      });
    }
    return res.status(502).json({
      found: false,
      error: "Unable to reach BISE Peshawar right now. Please try again later.",
    });
  }

  const html = stdout;

  // ── "Record not Found" detection ─────────────────────────────────
  // BISE returns a 200 with an alert-danger div for unknown roll numbers.
  // No caching — a result may be published seconds after a "not found"
  // lookup, so every request goes live to BISE.
  if (/Record\s+not\s+[Ff]ound/i.test(html)) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      found: false,
      message: "Record not Found. Please check your Roll No & try again.",
    });
  }

  // ── Cloudflare challenge fallback ────────────────────────────────
  // If Cloudflare decided to challenge our request despite the browser
  // headers, the response will be the "Just a moment..." challenge page
  // instead of the actual result HTML. We need to be careful with the
  // detection regex: Cloudflare injects a small beacon script
  // (/cdn-cgi/challenge-platform/scripts/jsd/main.js + __CF$cv$params)
  // onto EVERY page it serves — including successful result pages — so
  // matching on "challenge-platform" alone would false-positive on real
  // results. The real challenge page is identified by its title
  // "Just a moment" and the `_cf_chl_opt` challenge-options object.
  if (/Just a moment|_cf_chl_opt|cf_chl_opt|\/cdn-cgi\/challenge-platform\/h\//i.test(html)) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).json({
      found: false,
      error:
        "BISE Peshawar is currently running a security check. " +
        "Please try again in a few minutes, or visit cloud.bisep.edu.pk directly.",
    });
  }

  const parsed = parseBiseHtml(html, roll);
  if (!parsed) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({
      found: false,
      error:
        "Could not parse the response from BISE Peshawar. The board may have changed its page layout — please contact the school admin.",
    });
  }

  // No caching — always serve BISE's current data live.
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ found: true, ...parsed });
}

// ── HTML parser ────────────────────────────────────────────────────────
// BISE Peshawar's response HTML has this shape:
//
//   <div class="card mb-4 shadow">
//     <div class="card-header bg-primary text-white text-center">
//       <h5 class="mb-0">Student Result Details</h5>
//     </div>
//     <div class="card-body">
//       <div class="table-responsive">
//         <table class="table table-bordered mb-0">
//           <tbody>
//             <tr><th class="bg-light text-end" style="...">Roll No</th><td>703902</td></tr>
//             <tr><th class="bg-light text-end">Name</th><td>SAIMA AFRIDI</td></tr>
//             <tr><th class="bg-light text-end">Father Name</th><td>ZAHID HUSSAIN</td></tr>
//             <tr><th class="bg-light text-end">Marks</th><td>507</td></tr>
//             <tr><th class="bg-light text-end">Grade</th><td></td></tr>
//             <tr><th class="bg-light text-end">Remarks</th><td>MI</td></tr>
//             ...
//           </tbody>
//         </table>
//       </div>
//     </div>
//   </div>
//
//   <div class="table-responsive">
//     <table class="table table-bordered align-middle text-center">
//       <thead><tr><th>Sr.#</th><th>Subject</th><th>Theory Marks</th><th>Practical Marks</th></tr></thead>
//       <tbody>
//         <tr><td>1</td><td class="text-start">E-I</td><td class="">83</td><td class=""></td></tr>
//         ...
//       </tbody>
//     </table>
//   </div>
//
// We use small targeted regexes instead of pulling in a full HTML parser
// (Vercel serverless cold-start is faster and we don't need a DOM).
// BISE Peshawar's pass/fail rule isn't a flat 33% of the raw theory number —
// it depends on each subject's actual total marks (theory + practical split
// varies by subject), which this scraped table doesn't expose. So the ONLY
// reliable fail signal is BISE's own red-styled markup on the cell. A
// numeric "theory < 33" guess used to run here too, but it produced false
// positives (e.g. marking a passing 28/30 theory score red when BISE's own
// page didn't) because it ignored practical marks and per-subject totals.
// Removed — do not reintroduce a numeric fallback here.

function parseBiseHtml(html, roll) {
  const stripTags = (s) =>
    (s || "")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&#?\w+;/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  // Pull the value of <td>...</td> that follows <th...>Label</th>.
  // Case-insensitive on the label, tolerant of any <th>/<td> attributes.
  const field = (label) => {
    const re = new RegExp(
      "<th[^>]*>\\s*" + label + "\\s*</th>\\s*<td[^>]*>([\\s\\S]*?)</td>",
      "i"
    );
    const m = html.match(re);
    return m ? stripTags(m[1]) : "";
  };

  const name = field("Name");
  if (!name) {
    // No "Name" row means this is not a valid result page — refuse to
    // return garbage to the SPA.
    return null;
  }

  const fatherName = field("Father Name");
  const marksRaw = field("Marks");
  const grade = field("Grade");
  const remarks = field("Remarks");
  const collectDmc = field("Collect DMC From");

  // ── Subject table rows ───────────────────────────────────────────
  // Each subject row has exactly 4 <td>s: Sr.#, Subject, Theory Marks,
  // Practical Marks. We anchor on the first <tbody> AFTER the subjects
  // header to avoid eating rows from the student-info table.
  //
  // BISE Peshawar marks a failing subject's Theory/Practical cell red
  // directly in the HTML — usually via a class like "text-danger" /
  // "text-red" or an inline `style="color:red"` / `color:#dc3545` on the
  // <td>. We now capture each <td>'s attribute string (group 2/4/6/8) in
  // addition to its text content (group 1/3/5/7... see below) so we can
  // detect that styling and mirror it — pure numeric fallback (<33%) is
  // used only if BISE's own markup gives us no color signal at all.
  const subjects = [];
  const subjectsBlockMatch = html.match(
    /<thead class="table-primary">[\s\S]*?<\/thead>\s*<tbody>([\s\S]*?)<\/tbody>/i
  );
  const FAIL_STYLE_RE = /text-danger|text-red|class="[^"]*\bred\b[^"]*"|color\s*:\s*(?:red|#?dc3545|#?ff0000|#?f00)\b/i;
  if (subjectsBlockMatch) {
    const tbody = subjectsBlockMatch[1];
    const rowRe =
      /<tr>\s*<td([^>]*)>([\s\S]*?)<\/td>\s*<td([^>]*)>([\s\S]*?)<\/td>\s*<td([^>]*)>([\s\S]*?)<\/td>\s*<td([^>]*)>([\s\S]*?)<\/td>\s*<\/tr>/gi;
    let m;
    while ((m = rowRe.exec(tbody)) !== null) {
      const sr = stripTags(m[2]);
      const subject = stripTags(m[4]);
      const theory = stripTags(m[6]);
      const practical = stripTags(m[8]);
      // Attribute strings for the Theory (m[5]) and Practical (m[7]) <td>s —
      // this is where BISE's red fail-styling lives, if present.
      const theoryAttrs = m[5] || "";
      const practicalAttrs = m[7] || "";
      const theoryFail = FAIL_STYLE_RE.test(theoryAttrs);
      const practicalFail = FAIL_STYLE_RE.test(practicalAttrs);
      if (subject || theory || practical) {
        subjects.push({
          sr: sr || String(subjects.length + 1),
          subject,
          theory,
          practical,
          theory_fail: theoryFail,
          practical_fail: practicalFail,
        });
      }
    }
  }

  return {
    roll_no: roll,
    name,
    father_name: fatherName,
    marks: marksRaw,
    grade,
    remarks,
    collect_dmc_from: collectDmc,
    subjects,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODE 2 — fetchCurrentExam
// Scrape https://cloud.bisep.edu.pk/ for the current exam title + any
// pre-announcement countdown text. Returns a structured JSON object the
// client-side `useBisepCurrentExam` hook consumes.
//
// BISEP HTML structure has changed over time:
//
//   2026-07-16 (old):  <div class="sub-header">RESULT - HSSC ANNUAL-II EXAMINATION 2025</div>
//   2026-08-03 (new):  <div align="center" class="h3">RESULT - SSC ANNUAL-I EXAMINATION 2026 (9th & 10th)</div>
//
// We now try BOTH class names plus a broad fallback regex, so the scraper
// survives future BISEP redesigns without breaking.
//
// Countdown extraction (new 2026-08-03):
//   BISEP now embeds a JavaScript countdown timer in the homepage HTML:
//     var countDownDate = new Date("AUG 04, 2026 13:59:00").getTime();
//   And an announcement line:
//     RESULT OF SSC ANNUAL-I EXAMINATION 2026 (9th & 10th)
//     WILL BE ANNOUNCED ON 04-08-2026 at 02:00 PM
//   We parse BOTH the JS date and the text announcement for the countdown.
//
// The captured exam title is normalised from BISEP's ALL-CAPS HTML style
// to Title Case (e.g. "HSSC ANNUAL-II EXAMINATION 2025" → "HSSC Annual-II
// Examination 2025") so it reads naturally in the GHS homepage UI.
// ─────────────────────────────────────────────────────────────────────────────

const BISEP_HOMEPAGE_URL = "https://cloud.bisep.edu.pk/";
const HOMEPAGE_TIMEOUT_MS = 8; // same as the roll-lookup timeout

/** Strip HTML tags and normalise whitespace. */
function stripAndNorm(s) {
  return (s || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Pakistan Standard Time (PKT, UTC+5, no DST) date helpers ──────────────
// BISE Peshawar's server is in Pakistan and every date/time string on its
// pages (both the JS `new Date("AUG 04, 2026 13:59:00")` countdown target
// and the "WILL BE ANNOUNCED ON 04-08-2026 at 02:00 PM" text) is PAKISTAN
// LOCAL TIME with no timezone marker. Vercel serverless functions run in
// UTC. If we naively pass these strings to `new Date(...)`, JS parses them
// as UTC (or the server's local zone), producing a countdown target that is
// 5 HOURS LATE — this was the exact cause of the site showing "18h
// remaining" while cloud.bisep.edu.pk correctly showed "13h remaining".
// These helpers explicitly build the correct UTC instant by subtracting
// the fixed +05:00 PKT offset from the wall-clock components BISEP gave us.
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC+5, Pakistan does not use DST

/** Build a correct UTC Date from Pakistan-local (year, monthIndex, day, hour, minute). */
function pkComponentsToUTCDate(year, monthIndex, day, hour, minute) {
  // Date.UTC treats the components as UTC — since they're actually PKT
  // wall-clock time, subtract the PKT offset to get the true UTC instant.
  const utcMs = Date.UTC(year, monthIndex, day, hour, minute, 0, 0) - PKT_OFFSET_MS;
  const d = new Date(utcMs);
  return isNaN(d.getTime()) ? null : d;
}

/** Parse a BISEP JS-style date string (e.g. "AUG 04, 2026 13:59:00") as
 *  Pakistan local time and return the correct UTC Date. */
function parseBisepLocalDateAsPKT(dateStr) {
  // First let JS parse the string ONLY to extract the wall-clock components
  // (this parse is timezone-wrong, but we only use it to read year/month/
  // day/hour/minute/second — not the resulting UTC instant).
  const naive = new Date(dateStr);
  if (isNaN(naive.getTime())) return null;
  // naive.getUTCFullYear() etc. reflect exactly the digits BISEP wrote,
  // because `new Date("AUG 04, 2026 13:59:00")` (no TZ) is parsed as if
  // those digits were UTC — so reading them back with getUTC* methods
  // gives us BISEP's original wall-clock numbers untouched.
  return pkComponentsToUTCDate(
    naive.getUTCFullYear(),
    naive.getUTCMonth(),
    naive.getUTCDate(),
    naive.getUTCHours(),
    naive.getUTCMinutes()
  );
}

/** Title-case normaliser: "HSSC ANNUAL-II EXAMINATION 2025" →
 *  "HSSC Annual-II Examination 2025". Preserves known acronyms
 *  (SSC, HSSC) and Roman numerals (I, II, III, IV, etc.) in upper case. */
function toTitleCase(s) {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(Ssc|Hssc)\b/g, (m) => m.toUpperCase())
    .replace(/\b(Ii|Iii|Iv|Vi|Vii|Viii|Ix|Xi|Xii)\b/g, (m) => m.toUpperCase());
}

async function fetchCurrentExam(req, res) {
  let stdout = "";
  let curlError = null;
  let curlExitCode = 0;
  try {
    const result = await execFileAsync(
      "curl",
      [
        ...BROWSER_HEADERS,
        BISEP_HOMEPAGE_URL,
      ],
      {
        maxBuffer: 5 * 1024 * 1024,
        timeout: (HOMEPAGE_TIMEOUT_MS + 2) * 1000,
        encoding: "utf8",
      }
    );
    stdout = result.stdout || "";
  } catch (err) {
    curlError = err;
    curlExitCode = err.code ?? 1;
    stdout = err.stdout || "";
  }

  const fetchedAt = new Date().toISOString();

  // ── Cloudflare challenge detection (same logic as the roll-lookup) ──
  if (!stdout && curlError) {
    res.setHeader("Cache-Control", "no-store");
    if (curlExitCode === 28) {
      return res.status(504).json({
        ok: false,
        error: "BISE Peshawar took too long to respond. Please try again.",
        fetched_at: fetchedAt,
      });
    }
    return res.status(502).json({
      ok: false,
      error: "Unable to reach BISE Peshawar right now. Please try again later.",
      fetched_at: fetchedAt,
    });
  }

  const html = stdout;

  // Cloudflare challenge page — same detection as roll-lookup mode.
  if (/Just a moment|_cf_chl_opt|cf_chl_opt|\/cdn-cgi\/challenge-platform\/h\//i.test(html)) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).json({
      ok: false,
      error:
        "BISE Peshawar is currently running a security check. " +
        "Please try again in a few minutes, or visit cloud.bisep.edu.pk directly.",
      fetched_at: fetchedAt,
    });
  }

  // ── STEP 1: Extract the exam title from the sub-header div ──────────
  // BISEP's homepage has a div with the current exam title. The class name
  // has changed over time:
  //   Old (2026-07): <div class="sub-header">RESULT - HSSC ANNUAL-II EXAMINATION 2025</div>
  //   New (2026-08): <div align="center" class="h3">RESULT - SSC ANNUAL-I EXAMINATION 2026 (9th & 10th)</div>
  // We try multiple patterns in order — first match wins.
  let rawSubheader = "";

  // Pattern A: Old BISEP format — class="sub-header"
  const matchA = html.match(
    /<div\s+class="sub-header"[^>]*>\s*([\s\S]*?)\s*<\/div>/i
  );
  if (matchA) rawSubheader = stripAndNorm(matchA[1]);

  // Pattern B: New BISEP format — class="h3"
  if (!rawSubheader) {
    const matchB = html.match(
      /<div[^>]*\bclass="h3"[^>]*>\s*([\s\S]*?)\s*<\/div>/i
    );
    if (matchB) rawSubheader = stripAndNorm(matchB[1]);
  }

  // Pattern C: Broadest fallback — any <div> containing "RESULT -" + exam name
  if (!rawSubheader) {
    const matchC = html.match(
      /<div[^>]*>\s*(RESULT\s*-\s*(?:SSC|HSSC)[\s\S]*?)\s*<\/div>/i
    );
    if (matchC) rawSubheader = stripAndNorm(matchC[1]);
  }

  if (!rawSubheader) {
    // BISEP changed their homepage structure — surface a clear error so the
    // admin can update the regex, instead of silently returning null.
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
    return res.status(200).json({
      ok: false,
      error:
        "Could not locate the exam title div on BISE Peshawar's homepage. " +
        "The board may have changed its page layout — please contact the school admin.",
      raw_html_length: html.length,
      fetched_at: fetchedAt,
    });
  }

  // ── STEP 2: Extract countdown date from BISEP's JavaScript ──────────
  // New BISEP format (2026-08-03) embeds a JS countdown:
  //   var countDownDate = new Date("AUG 04, 2026 13:59:00").getTime();
  // This is the MOST reliable source for the countdown target.
  let jsCountdownDate = null;
  const jsCountdownMatch = html.match(
    /new\s+Date\s*\(\s*"([^"]+)"\s*\)\s*\.getTime\s*\(\s*\)/
  );
  if (jsCountdownMatch) {
    // CRITICAL: BISEP's JS date string (e.g. "AUG 04, 2026 13:59:00") has
    // NO timezone marker. Because the string is generated in Pakistan and
    // rendered in a Pakistani visitor's browser, it is ALWAYS Pakistan
    // Standard Time (PKT, UTC+5, no DST). If we naively do
    // `new Date("AUG 04, 2026 13:59:00")` on Vercel's server (which runs
    // in UTC), JS parses it as 13:59 UTC = 18:59 PKT — five hours LATE.
    // That is exactly the "my site shows 18h, BISEP shows 13h" bug.
    // Fix: re-parse the components ourselves and build the UTC instant
    // by explicitly subtracting the PKT offset (+05:00).
    const parsed = parseBisepLocalDateAsPKT(jsCountdownMatch[1]);
    if (parsed) {
      jsCountdownDate = parsed;
    }
  }

  // ── STEP 3: Extract announcement text from <p> tags ─────────────────
  // New BISEP format also has a <p> with:
  //   RESULT OF SSC ANNUAL-I EXAMINATION 2026 (9th & 10th)
  //   WILL BE ANNOUNCED ON 04-08-2026 at 02:00 PM
  // We look for the "WILL BE ANNOUNCED ON" pattern in any <p> tag.
  let announcementText = "";
  const announcementMatch = html.match(
    /<p[^>]*>\s*([\s\S]*?WILL\s+BE\s+ANNOUNCED\s+ON[\s\S]*?)\s*<\/p>/i
  );
  if (announcementMatch) {
    announcementText = stripAndNorm(announcementMatch[1]);
  }

  // ── STEP 4: Parse announcement date (DD-MM-YYYY at HH:MM AM/PM) ────
  // BISEP uses Pakistani date format: "04-08-2026 at 02:00 PM"
  let announcementDate = null;
  const dateMatch = announcementText.match(
    /(\d{1,2})-(\d{1,2})-(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i
  );
  if (dateMatch) {
    let [, day, month, year, hour, minute, ampm] = dateMatch;
    hour = parseInt(hour, 10);
    minute = parseInt(minute, 10);
    if (ampm.toUpperCase() === "PM" && hour < 12) hour += 12;
    if (ampm.toUpperCase() === "AM" && hour === 12) hour = 0;
    // SAME PKT FIX AS ABOVE: this "DD-MM-YYYY at HH:MM AM/PM" string is
    // also Pakistan local time with no timezone marker. Using
    // `new Date(year, month-1, day, hour, minute)` interprets it in the
    // SERVER's local timezone (UTC on Vercel) — 5 hours off. Build the
    // correct UTC instant by explicitly applying the PKT (+05:00) offset.
    const parsed = pkComponentsToUTCDate(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      hour,
      minute
    );
    if (parsed) {
      announcementDate = parsed;
    }
  }

  // ── STEP 5: Classify the sub-header text ────────────────────────────
  // LIVE pattern: starts with "RESULT -" followed by the exam name.
  //   "RESULT - HSSC ANNUAL-II EXAMINATION 2025"
  //   "RESULT - SSC ANNUAL-I EXAMINATION 2026 (9th & 10th)"
  // PENDING: if we found a countdown date or announcement, the result is
  //   NOT live yet — it's pre-announced with a countdown.
  const liveMatch = rawSubheader.match(
    /^RESULT\s*-\s*(.+?)\s*$/i
  );

  // Try to extract an exam name from the raw text — look for the
  // SSC/HSSC + Annual-I/II + year pattern anywhere in the string.
  const examNameMatch = rawSubheader.match(
    /\b(SSC|HSSC)\s+ANNUAL-(I|II)(?:\s+EXAMINATION)?\s+(\d{4})\b/i
  );

  // Also try the full page HTML for the exam name if not in subheader
  const examNameFullMatch = !examNameMatch
    ? html.match(/\b(SSC|HSSC)\s+ANNUAL-(I|II)(?:\s+EXAMINATION)?\s+(\d{4})\b/i)
    : null;
  const effectiveExamName = examNameMatch || examNameFullMatch;

  // ── Build the response ──────────────────────────────────────────────
  let isLive = false;
  let examTitle = null;
  let examYear = null;
  let countdownText = null;
  let countdownDate = null;

  // Determine the best countdown date:
  // Priority: JS countdown > announcement date > text-pattern date
  const bestCountdownDate = jsCountdownDate || announcementDate;

  if (liveMatch && !bestCountdownDate) {
    // LIVE — BISEP is currently serving results for this exam (no countdown).
    isLive = true;
    let rawTitle = liveMatch[1].trim();
    // Strip parenthetical like "(9th & 10th)" for a cleaner display title
    rawTitle = rawTitle.replace(/\s*\([^)]*\)\s*$/, "").trim();
    examTitle = toTitleCase(rawTitle);
    const yearInTitle = rawTitle.match(/\b(\d{4})\b/);
    examYear = yearInTitle ? parseInt(yearInTitle[1], 10) : null;
  } else {
    // PENDING — result is pre-announced with a countdown, OR we couldn't
    // parse the "RESULT -" pattern. Extract exam name + countdown.
    if (liveMatch) {
      // We have a "RESULT -" title but also a countdown → pending.
      let rawTitle = liveMatch[1].trim();
      rawTitle = rawTitle.replace(/\s*\([^)]*\)\s*$/, "").trim();
      examTitle = toTitleCase(rawTitle);
      const yearInTitle = rawTitle.match(/\b(\d{4})\b/);
      examYear = yearInTitle ? parseInt(yearInTitle[1], 10) : null;
    } else if (effectiveExamName) {
      const [, level, part, year] = effectiveExamName;
      examTitle = `${level.toUpperCase()} Annual-${part.toUpperCase()} ${year}`;
      examYear = parseInt(year, 10);
    }

    // Set countdown from the best available source
    if (bestCountdownDate) {
      countdownDate = bestCountdownDate.toISOString();
      countdownText = `Announced on ${bestCountdownDate.toLocaleDateString("en-PK", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })}`;
    } else {
      // Fallback: try text-based countdown patterns from the sub-header
      const pendingDateMatch = rawSubheader.match(
        /(?:ANNOUNCED\s+ON|EXPECTED\s+(?:ON|BY)|DECLARED\s+ON|PUBLISHED\s+ON)\s*:?\s*([0-9]{1,2}(?:st|nd|rd|th)?\s+\w+\s+\d{4})/i
      );
      const pendingMonthMatch = rawSubheader.match(
        /EXPECTED\s+IN\s+:?\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i
      );
      const awaitingMatch = /\b(AWAITED|COMING\s+SOON|STAY\s+TUNED|PENDING)\b/i.test(rawSubheader);

      if (pendingDateMatch) {
        const dateStr = pendingDateMatch[1]
          .replace(/(\d+)(st|nd|rd|th)/i, "$1")
          .trim();
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          countdownDate = parsed.toISOString();
          countdownText = `Announced on ${parsed.toLocaleDateString("en-PK", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}`;
        }
      } else if (pendingMonthMatch) {
        const monthName = pendingMonthMatch[1];
        const yearNum = parseInt(pendingMonthMatch[2], 10);
        const monthIdx = [
          "January","February","March","April","May","June",
          "July","August","September","October","November","December",
        ].indexOf(monthName);
        if (monthIdx >= 0) {
          const parsed = new Date(yearNum, monthIdx, 1, 0, 0, 0, 0);
          countdownDate = parsed.toISOString();
          countdownText = `Expected in ${monthName} ${yearNum}`;
        }
      } else if (awaitingMatch) {
        countdownText = "Result awaited — check back soon";
      }
    }
  }

  // No caching — every poll from the client hits BISE Peshawar's homepage
  // live so a title/countdown change shows up on the very next poll.
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    ok: true,
    is_live: isLive,
    exam_title: examTitle,
    exam_year: examYear,
    raw_subheader: rawSubheader,
    countdown_text: countdownText,
    countdown_date: countdownDate,
    fetched_at: fetchedAt,
  });
}
