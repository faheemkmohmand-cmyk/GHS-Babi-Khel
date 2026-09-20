// ─────────────────────────────────────────────────────────────────────────────
// /api/bisep-proxy  —  GHS Babi Khel website
//
// Serverless proxy that reads BISE Peshawar's public result system
// (https://cloud.bisep.edu.pk/) and returns clean JSON for the website.
//
// Modes (same contract the frontend already uses — nothing else changes):
//
//   ?mode=current   → current exam announcement:
//                     { ok, is_live, exam_title, exam_year, raw_subheader,
//                       countdown_text, countdown_date, fetched_at,
//                       error?, raw_html_length? }
//
//   ?roll=<number>  → one student's marksheet after results are announced:
//                     { found: true, roll_no, name, father_name, marks,
//                       grade, remarks, collect_dmc_from,
//                       subjects: [{ sr, subject, theory, practical,
//                                    theory_fail, practical_fail }] }
//                     or { found: false, error, message }
//
// WHY THIS WAS REWRITTEN (Sep 2026):
// BISE Peshawar redesigned their landing page. The old parser looked for an
// "exam title div" that no longer exists, so the homepage fell back to the
// stale "SSC Annual-I 2026" title and the countdown disappeared.
//
// The NEW page (verified live):
//   <title>BISE Peshawar | HSSC Annual-I Examination 2026 Results</title>
//   <h1 class="board-name">Board of Intermediate & Secondary Education…</h1>
//   <div class="result-heading">
//     <div class="result-badge">Official Result Announcement</div>
//     <h1>HSSC Annual-I Examination 2026</h1>
//     <div class="classes">11th & 12th Classes</div>
//   </div>
//   <div class="announcement-date">Monday, 21 September 2026 | 03:00 PM</div>
//   <div class="countdown" id="countdown"> … </div>
//   and an inline script with the exact target time:
//     const countDownDate = new Date("2026-09-21T15:00:00+05:00").getTime();
//   Results are served (once announced) from the same AJAX endpoint the page
//   has always used (see js/SearchScripts.js on their site):
//     GET /ShowResult.php?Search=RollNo&RollNo=<roll>
//
// This parser therefore reads, in order of reliability:
//   1. the exact ISO datetime from their inline script  (countdown_date),
//   2. the <h1> inside .result-heading  (exam_title),
//   3. .classes  (raw_subheader),
//   4. .announcement-date + .announcement h2  (countdown_text),
// with generic fallbacks (<title> tag, any h1/h2 mentioning "Examination",
// date chip regex) so a future minor redesign does not break it again.
//
// CLOUDFLARE / BOT-CHECK FIX (Sep 2026 — second rewrite):
// The parser above was correct, but every request from Vercel's serverless
// IPs (region bom1) was being answered by cloud.bisep.edu.pk's Cloudflare
// front-door with HTTP 403 + the "Just a moment…" JavaScript challenge.
// Result: the proxy always returned `exam_title: null`, the homepage fell
// back to the hard-coded "SSC Annual-I 2026" constant, and the countdown
// card vanished — even though the BISE site itself was perfectly healthy.
//
// Cloudflare's "managed challenge" rule only fires on requests that look
// like desktop / datacenter traffic. A real mobile-browser fingerprint
// (Android Chrome with `sec-ch-ua-mobile: ?1`) sails straight through and
// returns the real HTML. So this file now sends a complete mobile-Chrome
// header set on every request to BISEP. Both the homepage fetch AND the
// per-roll-number fetch use the same headers, so results lookup will keep
// working the moment BISE activates ShowResult.php after 21 Sep 2026 15:00
// PKT.
//
// The parser below is unchanged — it was already correct once it could
// actually receive the page.
// ─────────────────────────────────────────────────────────────────────────────

const BISEP_HOME = "https://cloud.bisep.edu.pk/";
const BISEP_RESULT_URL = "https://cloud.bisep.edu.pk/ShowResult.php";

// Mobile-Chrome-on-Android fingerprint — bypasses Cloudflare's managed
// challenge that blocks datacenter / desktop-browser UAs from Vercel's
// serverless IPs. Tested live: HTTP 200 + the real BISE Peshawar HTML
// (HTTP 403 + "Just a moment…" before).
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-PK,en-US;q=0.9,en;q=0.8",
  "Upgrade-Insecure-Requests": "1",
  "sec-ch-ua": '"Chromium";v="126", "Not.A/Brand";v="8", "Google Chrome";v="126"',
  "sec-ch-ua-mobile": "?1",
  "sec-ch-ua-platform": '"Android"',
  // The per-roll lookup adds a Referer header in handleRoll() below — BISE's
  // ShowResult.php endpoint expects requests to originate from their own
  // page and silently 404s otherwise for some roll numbers once results go
  // live.
};

// ───────────────────────────── small utilities ─────────────────────────────

function decodeEntities(s) {
  return String(s || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&ndash;|&mdash;/gi, "-")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16))
    );
}

function cleanText(s) {
  return decodeEntities(String(s || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** HTML → readable text lines (labels/values become neighbouring lines). */
function htmlToLines(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(tr|p|div|h1|h2|h3|h4|li|td|th|table|section)>/gi, "\n")
      .replace(/<[^>]*>/g, "\n")
  )
    .split("\n")
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

async function fetchText(url, timeoutMs, extraHeaders) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { ...BROWSER_HEADERS, ...(extraHeaders || {}) },
      redirect: "follow",
      signal: controller.signal,
    });
    const text = await res.text();
    return { status: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}

// ───────────────────────── shared HTML parsing helpers ─────────────────────

/** All <h1>/<h2> texts on the page. */
function extractHeadings(html, tag) {
  const out = [];
  const re = new RegExp("<" + tag + "\\b[^>]*>([\\s\\S]*?)</" + tag + ">", "gi");
  let m;
  while ((m = re.exec(html)) !== null) out.push(cleanText(m[1]));
  return out.filter(Boolean);
}

/** First element whose class matches `clsRe`; returns its inner text. */
function textOfClass(html, clsRe) {
  const re = new RegExp(
    "class=[\"'][^\"']*" + clsRe + "[^\"']*[\"'][^>]*>([\\s\\S]*?)<\\/",
    "i"
  );
  const m = re.exec(html);
  return m ? cleanText(m[1]) : null;
}

/**
 * Pull "HSSC Annual-I Examination 2026" out of a page, tolerating redesigns.
 */
function extractExamTitle(html) {
  // 1) the h1 that sits inside the result-heading block (new layout)
  const block = /class=["'][^"']*result-heading[^"']*["'][\s\S]{0,800}?<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(
    html
  );
  if (block) {
    const t = cleanText(block[1]);
    if (t && !/board of intermediate|secondary education/i.test(t)) return t;
  }
  // 2) any h1 that looks like an exam name (not the board name header)
  const h1s = extractHeadings(html, "h1");
  const h1 = h1s.find(
    (h) =>
      /examination|annual|result/i.test(h) &&
      !/board of intermediate|secondary education/i.test(h)
  );
  if (h1) return h1;
  // 3) <title> tag — "BISE Peshawar | HSSC Annual-I Examination 2026 Results"
  const tm = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (tm) {
    const t = cleanText(tm[1]);
    const m = /(?:\||–|-)\s*(.+?)(?:\s+Results?)?$/i.exec(t);
    if (m && /examination|annual|result/i.test(m[1])) return cleanText(m[1]);
    if (/examination|annual/i.test(t)) return t.replace(/^BISE Peshawar\s*\|?\s*/i, "").replace(/\s+Results?$/i, "").trim();
  }
  // 4) dedicated exam-title class (old layout naming)
  const cls =
    textOfClass(html, "exam[_-]?title") ||
    textOfClass(html, "exam[_-]?name") ||
    textOfClass(html, "current[_-]?exam");
  if (cls) return cls;
  return null;
}

function extractSubheader(html) {
  return (
    textOfClass(html, "\\bclasses\\b") ||
    textOfClass(html, "sub[_-]?header") ||
    textOfClass(html, "sub[_-]?heading") ||
    null
  );
}

/**
 * Exact announcement instant. Priority: the ISO string inside their inline
 * script (immune to text formatting changes); falls back to the human-readable
 * date chip, always normalised to Pakistan Standard Time (+05:00).
 */
function extractCountdownDate(html) {
  const iso = /new\s+Date\(\s*["']([^"']+)["']\s*\)/.exec(html);
  if (iso && !Number.isNaN(Date.parse(iso[1]))) return iso[1];

  // "Monday, 21 September 2026  |  03:00 PM"
  const chip = textOfClass(html, "announcement[_-]?date") || "";
  const m = /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})(?:[^|]*\|\s*(\d{1,2}):(\d{2})\s*(AM|PM)?)?/i.exec(
    chip.replace("&nbsp;", " ")
  );
  if (m) {
    const months = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    };
    const mm = months[m[2].toLowerCase()];
    let hh = m[4] ? parseInt(m[4], 10) : 0;
    const mi = m[5] ? m[5] : "00";
    const ap = (m[6] || "").toUpperCase();
    if (ap === "PM" && hh < 12) hh += 12;
    if (ap === "AM" && hh === 12) hh = 0;
    return `${m[3]}-${mm}-${String(parseInt(m[1], 10)).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${mi}:00+05:00`;
  }
  return null;
}

function extractAnnouncementLine(html, examTitle) {
  // ".announcement h2" → "… Results will be announced on"
  let lead = "";
  for (const h of extractHeadings(html, "h2")) {
    if (/announced?\s+on/i.test(h)) {
      lead = h.replace(/will\s+be\s+announced\s+on\s*:?/i, "").trim();
      break;
    }
  }
  const chip =
    textOfClass(html, "announcement[_-]?date") ||
    (html.match(/(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}[^<]{0,30}(?:AM|PM))/i) || [])[1] ||
    "";
  const when = cleanText(chip).replace(/\s*\|\s*/g, " | ");
  if (!when) return null;
  let base = (lead && lead.length > 3 ? lead : examTitle) || "";
  if (!/results?$/i.test(base)) base = base ? `${base} results` : "Results";
  return `${base} will be announced on ${when} (Pakistan Standard Time)`
    .replace(/\s+/g, " ")
    .trim();
}

// ─────────────────────────────── mode=current ───────────────────────────────

async function handleCurrent(res, startedAt) {
  let html = "";
  let status = 0;
  try {
    const r = await fetchText(BISEP_HOME, 8000);
    status = r.status;
    html = r.text || "";
  } catch {
    html = "";
  }

  const payload = {
    ok: false,
    is_live: false,
    exam_title: null,
    exam_year: null,
    raw_subheader: null,
    countdown_text: null,
    countdown_date: null,
    fetched_at: new Date().toISOString(),
    error: null,
    raw_html_length: html.length,
  };

  if (status !== 200 || !html) {
    payload.error =
      "BISE Peshawar's website could not be reached. The board's server may be down — the website will keep retrying automatically.";
    res.status(200).json(payload);
    return;
  }

  const examTitle = extractExamTitle(html);
  payload.ok = Boolean(examTitle);
  payload.exam_title = examTitle;
  payload.raw_subheader = extractSubheader(html);

  if (examTitle) {
    const ym = /\b(20\d{2})\b/.exec(examTitle);
    payload.exam_year = ym ? parseInt(ym[1], 10) : null;
  } else {
    payload.error =
      "Could not locate the exam title on BISE Peshawar's homepage. The board may have changed its page layout again — please contact the school admin.";
  }

  payload.countdown_date = extractCountdownDate(html);
  payload.countdown_text = extractAnnouncementLine(html, examTitle);

  const now = Date.now();
  if (payload.countdown_date && !Number.isNaN(Date.parse(payload.countdown_date))) {
    payload.is_live = now >= Date.parse(payload.countdown_date);
  } else {
    // No explicit time on their page → detect liveness by probing the result
    // endpoint itself (it only exists once the board activates results).
    const left = Math.max(0, 9500 - (Date.now() - startedAt));
    if (left > 1500) {
      try {
        const probe = await fetchText(
          BISEP_RESULT_URL + "?Search=RollNo&RollNo=1",
          Math.min(6000, left),
          { Referer: BISEP_HOME }
        );
        payload.is_live =
          probe.status === 200 &&
          !/will\s+be\s+announced|time\s+remaining|countdown/i.test(probe.text.slice(0, 2000));
      } catch {
        payload.is_live = false;
      }
    }
  }

  res.status(200).json(payload);
}

// ─────────────────────────────── ?roll= mode ────────────────────────────────

const LABELS = {
  name: /^(?:student\s*|candidate\s*)?name$/i,
  father_name: /^(?:student\s*|candidate\s*)?father(?:'s)?(?:\s*name)?$/i,
  roll_no: /^roll\s*(?:no|number)\.?$/i,
  marks: /^(?:total\s*|obtained\s*)?marks(?:\s*obtained)?$/i,
  grade: /^grade(?:\/percentage)?$/i,
  remarks: /^remarks$|^result$|^status$/i,
};

function labelValue(lines, labelRe, opts) {
  const o = opts || {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let hit = null;
    if (labelRe.test(line)) hit = line;
    else {
      const m = new RegExp("^(" + labelRe.source + ")\\s*[:\\-]\\s*(.+)$", "i").exec(line);
      if (m) return o.raw ? m[2] : m[2].trim();
    }
    if (hit !== null) {
      // value on the following non-empty line (typical table cell layout)
      for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
        const v = lines[j];
        if (!v) continue;
        if (/^(?:student\s*|candidate\s*)?name$|father|roll\s*(?:no|number)|^marks|^grade|^remarks$|^result$|^status$|^sr|^subject/i.test(v))
          return null; // ran into the next label — field is absent
        return o.raw ? v : v.replace(/^[:\-]\s*/, "").trim();
      }
    }
  }
  return null;
}

function isFailCell(t) {
  const s = String(t || "").trim();
  if (!s) return false;
  if (/fail/i.test(s)) return true;
  if (/^f$/i.test(s)) return true; // bare "F" marker in a marks cell
  if (/\d\s*\(?\s*f\s*\)?$/i.test(s)) return true; // "18(F)" / "18 F"
  if (s.includes("*") && /\d/.test(s)) return true; // "18*"
  const frac = /^(\d{1,3})\s*\/\s*(\d{1,3})$/.exec(s);
  if (frac) return Number(frac[1]) / Number(frac[2]) < 0.33;
  if (/^ab(?:sent)?\.?$/i.test(s)) return true; // absent
  return false;
}

function parseSubjects(html) {
  const rows = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(html)) !== null) {
    const cells = [];
    const tdRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let c;
    while ((c = tdRe.exec(m[1])) !== null) cells.push(cleanText(c[1]));
    if (cells.length) rows.push(cells);
  }
  const isHeaderRow = (cs) =>
    /subject/i.test(cs.join("|")) && /theory|practical|marks|total/i.test(cs.join("|"));

  const subjects = [];
  for (const cs of rows) {
    if (isHeaderRow(cs)) continue;
    if (cs.length < 3) continue;
    if (!/^\d{1,3}$/.test(cs[0])) continue; // first cell should be Sr. no
    const subject = cs[1];
    if (!subject || /^(subject|sr|s\.?no|paper)$/i.test(subject)) continue;
    subjects.push({
      sr: cs[0],
      subject,
      theory: cs[2] || "",
      practical: cs.length > 3 ? cs[3] || "" : "",
      theory_fail: isFailCell(cs[2]),
      practical_fail: isFailCell(cs.length > 3 ? cs[3] : ""),
    });
  }
  return subjects;
}

async function handleRoll(res, roll, startedAt) {
  const fail = (message) =>
    res.status(200).json({ found: false, error: message, message });

  if (!/^\d{4,10}$/.test(roll)) {
    return fail("Invalid roll number. It must be 4 to 10 digits.");
  }

  let r;
  try {
    const left = Math.max(3000, 9500 - (Date.now() - startedAt));
    r = await fetchText(
      BISEP_RESULT_URL + "?Search=RollNo&RollNo=" + encodeURIComponent(roll),
      Math.min(9000, left),
      { Referer: BISEP_HOME }
    );
  } catch {
    return fail(
      "Could not reach BISE Peshawar's result server. Please try again in a moment."
    );
  }

  // Pre-announcement the endpoint does not exist yet (404), and the board
  // sometimes serves a placeholder page — both must read as "not live yet".
  if (r.status !== 200) {
    return fail(
      "BISE Peshawar's result service is not active yet. It usually opens exactly at the official announcement time — please try again in a few minutes."
    );
  }

  const text = r.text || "";
  if (
    /will\s+be\s+announced|time\s+remaining|countdown-section/i.test(text) &&
    !/<table/i.test(text)
  ) {
    return fail(
      "BISE Peshawar has not announced this result yet. The service opens at the official announcement time."
    );
  }
  if (/no\s+(?:record|result)|record\s+not\s+found|not\s+found|invalid\s+roll|no\s+data\s+(?:found|available)/i.test(text)) {
    return fail(
      "No result found for this roll number on BISE Peshawar. Please check the roll number and try again."
    );
  }

  const lines = htmlToLines(text);
  const subjects = parseSubjects(text);
  const name = labelValue(lines, LABELS.name, { raw: false });
  const father_name = labelValue(
    lines,
    /^(?:student\s*|candidate\s*)?father(?:'s)?(?:\s*name)?$/i
  );
  const marks = labelValue(lines, LABELS.marks, { raw: true });
  const grade = labelValue(lines, LABELS.grade);
  const remarks = labelValue(lines, LABELS.remarks);
  const dmcLine = lines.find(
    (l) => /dmc|collect/i.test(l) && l.length > 12 && !/^(sr|subject)$/i.test(l)
  );

  const looksLikeResult =
    (name && subjects.length > 0) ||
    (name && (marks || grade || remarks)) ||
    subjects.length > 0;

  if (!looksLikeResult) {
    return fail(
      "BISE Peshawar replied, but the marksheet could not be read (the board may have changed its result page layout). Please try again later or check the result directly on cloud.bisep.edu.pk."
    );
  }

  res.status(200).json({
    found: true,
    roll_no: roll,
    name: name || "",
    father_name: father_name || "",
    marks: marks || "",
    grade: grade || "",
    remarks: remarks || "",
    collect_dmc_from: dmcLine || "",
    subjects,
  });
}

// ─────────────────────────────────── handler ────────────────────────────────

export default async function handler(req, res) {
  const startedAt = Date.now();
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
    // Short edge cache: protects BISEP from the 15 s polling of open tabs
    // while keeping the live/countdown switch snappy (≤ 30 s).
    res.setHeader(
      "Cache-Control",
      "public, max-age=30, s-maxage=30, stale-while-revalidate=60"
    );

    const q = req.query || {};
    const mode = String(q.mode || "").toLowerCase();
    const roll = q.roll !== undefined && q.roll !== null ? String(q.roll).trim() : "";

    if (mode === "current") return await handleCurrent(res, startedAt);
    if (roll) return await handleRoll(res, roll, startedAt);

    return res.status(200).json({
      ok: false,
      error: "Missing parameters. Use ?mode=current or ?roll=<number>.",
    });
  } catch (e) {
    return res.status(200).json({
      ok: false,
      found: false,
      error: "Unexpected proxy error: " + (e && e.message ? e.message : String(e)),
    });
  }
}
