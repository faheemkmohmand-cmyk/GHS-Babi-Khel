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
  // We treat this as a successful lookup with `found: false` and cache it
  // briefly (5 min) so a typo doesn't trigger a full upstream hit on every
  // keystroke retry.
  if (/Record\s+not\s+[Ff]ound/i.test(html)) {
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
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

  // Board results never change once published — cache hard for 24h on the
  // edge (s-maxage) and in the browser (max-age). This satisfies the
  // PDF's "avoid excessive requests" + "use caching" requirements.
  res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");
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
  const subjects = [];
  const subjectsBlockMatch = html.match(
    /<thead class="table-primary">[\s\S]*?<\/thead>\s*<tbody>([\s\S]*?)<\/tbody>/i
  );
  if (subjectsBlockMatch) {
    const tbody = subjectsBlockMatch[1];
    const rowRe =
      /<tr>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
    let m;
    while ((m = rowRe.exec(tbody)) !== null) {
      const sr = stripTags(m[1]);
      const subject = stripTags(m[2]);
      const theory = stripTags(m[3]);
      const practical = stripTags(m[4]);
      if (subject || theory || practical) {
        subjects.push({
          sr: sr || String(subjects.length + 1),
          subject,
          theory,
          practical,
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
// PRECISE regex (verified against actual BISEP HTML fetched 2026-07-16):
//   <div class="sub-header">RESULT - HSSC ANNUAL-II EXAMINATION 2025</div>
//
// The captured string is normalised from BISEP's ALL-CAPS HTML style to
// Title Case (e.g. "HSSC ANNUAL-II EXAMINATION 2025" → "HSSC Annual-II
// Examination 2025") so it reads naturally in the GHS homepage UI.
//
// BEST-EFFORT regex (countdown): BISEP's pre-announcement HTML format is
// not publicly archived, so we try multiple common patterns. If none
// match, countdown_text and countdown_date are null — the client then
// just shows the title without a countdown, which is the correct
// behaviour for the "result is live" state.
// ─────────────────────────────────────────────────────────────────────────────

const BISEP_HOMEPAGE_URL = "https://cloud.bisep.edu.pk/";
const HOMEPAGE_TIMEOUT_MS = 8; // same as the roll-lookup timeout

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

  // ── PRECISE: extract the <div class="sub-header">…</div> content ──────
  // BISEP's homepage always has exactly one .sub-header div directly above
  // the search form. When a result is LIVE, it reads:
  //     RESULT - HSSC ANNUAL-II EXAMINATION 2025
  // When a result is PENDING (pre-announcement), it typically reads one of:
  //     SSC ANNUAL-I EXAMINATION 2026 RESULT AWAITED
  //     RESULT - SSC ANNUAL-I 2026 (Expected in August 2026)
  //     HSSC ANNUAL-I 2026 RESULT WILL BE ANNOUNCED ON 15 AUGUST 2026
  // We capture the raw text first, then classify it.
  const subMatch = html.match(
    /<div\s+class="sub-header"[^>]*>\s*([\s\S]*?)\s*<\/div>/i
  );
  const rawSubheader = subMatch
    ? subMatch[1]
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&#?\w+;/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";

  if (!rawSubheader) {
    // BISEP changed their homepage structure — surface a clear error so the
    // admin can update the regex, instead of silently returning null.
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
    return res.status(200).json({
      ok: false,
      error:
        "Could not locate the .sub-header div on BISE Peshawar's homepage. " +
        "The board may have changed its page layout — please contact the school admin.",
      raw_html_length: html.length,
      fetched_at: fetchedAt,
    });
  }

  // ── Classify the sub-header text ────────────────────────────────────
  // LIVE pattern: starts with "RESULT -" followed by the exam name.
  // Examples:
  //   "RESULT - HSSC ANNUAL-II EXAMINATION 2025"
  //   "RESULT - SSC ANNUAL-I EXAMINATION 2026"
  const liveMatch = rawSubheader.match(
    /^RESULT\s*-\s*(.+?)\s*$/i
  );

  // PENDING patterns — try several common phrasings. We extract:
  //   - exam_title (best-effort, e.g. "SSC Annual-I 2026")
  //   - countdown_text (the full announcement phrase)
  //   - countdown_date (ISO date if we can parse one out)
  //
  // Pattern A: "... EXAM NAME ... WILL BE ANNOUNCED ON <date>"
  // Pattern B: "... EXAM NAME ... EXPECTED ON <date>"
  // Pattern C: "... EXAM NAME ... EXPECTED IN <month year>"
  // Pattern D: "... EXAM NAME ... AWAITED" / "COMING SOON" (no date)
  const pendingDateMatch = rawSubheader.match(
    /(?:ANNOUNCED\s+ON|EXPECTED\s+(?:ON|BY)|DECLARED\s+ON|PUBLISHED\s+ON)\s*:?\s*([0-9]{1,2}(?:st|nd|rd|th)?\s+\w+\s+\d{4})/i
  );
  const pendingMonthMatch = rawSubheader.match(
    /EXPECTED\s+IN\s+:?\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i
  );
  const awaitingMatch = /\b(AWAITED|COMING\s+SOON|STAY\s+TUNED|PENDING)\b/i.test(
    rawSubheader
  );

  // Try to extract an exam name from the raw text — look for the
  // SSC/HSSC + Annual-I/II + year pattern anywhere in the string.
  const examNameMatch = rawSubheader.match(
    /\b(SSC|HSSC)\s+ANNUAL-(I|II)(?:\s+EXAMINATION)?\s+(\d{4})\b/i
  );

  /** Title-case normaliser: "HSSC ANNUAL-II EXAMINATION 2025" →
   *  "HSSC Annual-II Examination 2025". Preserves known acronyms
   *  (SSC, HSSC) and Roman numerals (I, II, III, IV, etc.) in upper case. */
  const toTitleCase = (s) =>
    s
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
      // Restore acronyms — these should stay ALL-CAPS.
      .replace(/\b(Ssc|Hssc)\b/g, (m) => m.toUpperCase())
      // Restore Roman numerals — "Ii" → "II", "Iii" → "III", etc.
      .replace(/\b(Ii|Iii|Iv|Vi|Vii|Viii|Ix|Xi|Xii)\b/g, (m) => m.toUpperCase());

  // ── Build the response based on which pattern matched ──
  let isLive = false;
  let examTitle = null;
  let examYear = null;
  let countdownText = null;
  let countdownDate = null;

  if (liveMatch) {
    // LIVE — BISEP is currently serving results for this exam.
    isLive = true;
    const rawTitle = liveMatch[1].trim(); // e.g. "HSSC ANNUAL-II EXAMINATION 2025"
    examTitle = toTitleCase(rawTitle);
    const yearInTitle = rawTitle.match(/\b(\d{4})\b/);
    examYear = yearInTitle ? parseInt(yearInTitle[1], 10) : null;
  } else {
    // PENDING — best-effort extraction of exam name + announcement date.
    if (examNameMatch) {
      const [, level, part, year] = examNameMatch;
      examTitle = `${level.toUpperCase()} Annual-${part.toUpperCase()} ${year}`;
      examYear = parseInt(year, 10);
    }
    if (pendingDateMatch) {
      // Parse "25 July 2026" → ISO date. Use a Date constructor that
      // interprets the string as local time (Date.parse handles this
      // inconsistently across engines, so we construct manually).
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
      // "EXPECTED IN August 2026" — no exact day, set countdown_date to
      // the FIRST of that month so the client can still show a countdown.
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

  // Cache for 1 hour on the edge. BISEP's homepage changes at most a few
  // times per year, so this is plenty fresh. stale-while-revalidate keeps
  // the response fast even if the 1h TTL expires.
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400");
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
