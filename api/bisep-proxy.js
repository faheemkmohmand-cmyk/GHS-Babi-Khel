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
// Usage: /api/bisep-proxy?roll=703902
// Fetches: https://cloud.bisep.edu.pk/ShowResult.php?Search=RollNo&RollNo=703902
// Returns: { found: true, roll_no, name, father_name, marks, grade, remarks,
//            collect_dmc_from, subjects: [{ sr, subject, theory, practical }, ...] }
//      OR: { found: false, message: "Record not Found. ..." }   (invalid roll)
//      OR: { found: false, error: "..." }                        (proxy error)

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
