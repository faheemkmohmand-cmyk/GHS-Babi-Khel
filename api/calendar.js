// api/calendar.js
// Vercel Serverless Function — generates an iCalendar (.ics) feed of all
// published school events. Students/parents subscribe ONCE in Google Calendar
// or iPhone Calendar → all future exams/holidays/PTMs/sports/fees auto-sync.
// One-way (read-only) sync. Zero maintenance.
//
// Access at:
//   /api/calendar        (raw .ics with Content-Type: text/calendar)
//   /calendar.ics        (rewritten to /api/calendar in vercel.json — friendlier URL for calendar apps)
//
// Calendar apps refresh subscribed feeds every ~6 hours by default.

import { createClient } from "@supabase/supabase-js";

const SITE_URL  = "https://ghsbabikhel.indevs.in";
const SITE_NAME = "GHS Babi Khel";
const CAL_NAME  = "GHS Babi Khel — School Calendar";
const CAL_DESC  = "Exams, holidays, PTMs, sports days, results & fee due dates — Government High School Babi Khel, District Mohmand, KPK.";

// ── iCalendar helpers ─────────────────────────────────────────────────────────
function escapeICS(str = "") {
  // Per RFC 5545: escape backslash, semicolon, comma, and convert newlines.
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/;/g,  "\\;")
    .replace(/,/g,  "\\,")
    .replace(/\r?\n/g, "\\n");
}

function toICSDate(dateStr) {
  // Accepts "yyyy-MM-dd" or ISO timestamp. Returns ICS date-time in UTC.
  // For all-day events we use YYYYMMDD format (no time, no Z).
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`; // all-day format
}

function foldLine(line) {
  // RFC 5545: lines longer than 75 octets must be folded with CRLF + space.
  if (line.length <= 75) return line;
  const chunks = [];
  let i = 0;
  while (i < line.length) {
    chunks.push((i === 0 ? "" : " ") + line.slice(i, i + 73));
    i += 73;
  }
  return chunks.join("\r\n");
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const supabaseUrl  = process.env.VITE_SUPABASE_URL  || process.env.SUPABASE_URL;
  const supabaseKey  = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  let events = [];

  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      // Pull all published events. Schools have hundreds max — safe to return all.
      const { data, error } = await supabase
        .from("school_events")
        .select("id, title, description, event_type, start_date, end_date, is_published, created_at, updated_at")
        .eq("is_published", true)
        .order("start_date", { ascending: true })
        .limit(500);

      if (error) throw error;
      events = data || [];
    } catch (err) {
      console.error("Calendar feed DB error:", err.message);
      // Continue with empty events rather than 500 — feed still works, just empty.
    }
  }

  // ── Build ICS body ──────────────────────────────────────────────────────────
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GHS Babi Khel//School Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeICS(CAL_NAME)}`,
    `X-WR-CALDESC:${escapeICS(CAL_DESC)}`,
    "X-WR-TIMEZONE:Asia/Karachi",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",   // tell calendar apps to refresh every 6h
    "X-PUBLISHED-TTL:PT6H",
  ];

  for (const e of events) {
    const startICS = toICSDate(e.start_date);
    if (!startICS) continue;

    // End date: if not provided or same as start, use start+1 day (all-day events
    // in ICS are exclusive on the end — so a 1-day event is start..start+1).
    let endICS;
    if (e.end_date && e.end_date !== e.start_date) {
      endICS = toICSDate(e.end_date);
      // For multi-day all-day events, end is exclusive — add 1 day.
      const endD = new Date(e.end_date);
      endD.setUTCDate(endD.getUTCDate() + 1);
      const y = endD.getUTCFullYear();
      const m = String(endD.getUTCMonth() + 1).padStart(2, "0");
      const d = String(endD.getUTCDate()).padStart(2, "0");
      endICS = `${y}${m}${d}`;
    } else {
      // Single-day event — end = start + 1 day.
      const endD = new Date(e.start_date);
      endD.setUTCDate(endD.getUTCDate() + 1);
      const y = endD.getUTCFullYear();
      const m = String(endD.getUTCMonth() + 1).padStart(2, "0");
      const d = String(endD.getUTCDate()).padStart(2, "0");
      endICS = `${y}${m}${d}`;
    }

    const typeLabel = e.event_type ? e.event_type.toUpperCase() : "EVENT";
    const summary = `[${typeLabel}] ${e.title}`;
    const description = e.description
      ? `${e.description}\n\n— GHS Babi Khel\n${SITE_URL}/calendar`
      : `— GHS Babi Khel\n${SITE_URL}/calendar`;

    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@ghsbabikhel.indevs.in`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${startICS}`,
      `DTEND;VALUE=DATE:${endICS}`,
      `SUMMARY:${escapeICS(summary)}`,
      `DESCRIPTION:${escapeICS(description)}`,
      `CATEGORIES:${escapeICS(typeLabel)}`,
      `URL:${SITE_URL}/calendar`,
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");

  const body = lines.map(foldLine).join("\r\n");

  // Headers — 1h browser cache, 6h CDN cache.
  res.setHeader("Content-Type",        "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `inline; filename="ghs-babi-khel.ics"`);
  res.setHeader("Cache-Control",       "public, max-age=3600, s-maxage=21600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).send(body);
}
