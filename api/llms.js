// api/llms.js
// Vercel Serverless Function — generates /llms.txt dynamically.
//
// WHAT IS llms.txt?
// ─────────────────
// An emerging standard (llmstxt.org) for helping AI systems (ChatGPT,
// Claude, Gemini, Perplexity…) quickly understand what a website is about
// and which pages matter. AI crawlers fetch /llms.txt like they fetch
// robots.txt, and use its summary + page list to ground their answers
// about the school. Combined with the prerendered HTML (real content in
// every page), this is what makes AI chatbots "know" your school's current
// details instead of months-old guesses.
//
// WHY DYNAMIC (not a static file)?
// ─────────────────────────────────
// Phone, email and principal name are pulled LIVE from the school_settings
// table — the same values the admin edits in the dashboard. When contact
// info changes, llms.txt updates on the next AI crawl. A static file would
// go stale (exactly the problem that plagued Google's contact snippet).
//
// If the Supabase fetch fails, current real values are used as fallback —
// the endpoint ALWAYS returns valid content, never a 500.
//
// ACCESS: /llms.txt  (vercel.json rewrites /llms.txt → /api/llms)
// ⚠️ Do NOT create a static public/llms.txt — Vercel serves static files
// before rewrites, and the static copy would silently shadow this one
// (same trap as the old public/robots.txt).

import { createClient } from "@supabase/supabase-js";

const SITE_URL = "https://ghsbabikhel.indevs.in";
const FACEBOOK_URL = "https://www.facebook.com/share/1EERTSk1W7/";

// Current real values — used only when the live DB fetch fails.
const FALLBACK = {
  school_name: "GHS Babi Khel",
  phone: "+92 346 9898295",
  email: "ghsbabikhel@gmail.com",
  principal: "Mr. Imdad Ullah",
  established: "2018",
  emis: "60673",
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

// Fetch live school settings (with hard fallback). school_settings is a
// public table, so the anon key works — no auth needed.
async function getSettings() {
  const sb = getSupabase();
  if (!sb) return FALLBACK;
  try {
    const { data, error } = await sb
      .from("school_settings")
      .select("school_name, phone, email, principal_name, established_year, emis_code")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return FALLBACK;
    return {
      school_name: data.school_name || FALLBACK.school_name,
      phone: data.phone || FALLBACK.phone,
      email: data.email || FALLBACK.email,
      principal: data.principal_name || FALLBACK.principal,
      established: String(data.established_year || FALLBACK.established),
      emis: String(data.emis_code || FALLBACK.emis),
    };
  } catch {
    return FALLBACK;
  }
}

function buildLlmsTxt(s) {
  return `# ${s.school_name} — Government High School, District Mohmand

> Official website of Government High School (GHS) Babi Khel, District Mohmand, Khyber Pakhtunkhwa (KPK), Pakistan — a government school offering classes 6 to 10 (matriculation), affiliated with BISE Peshawar for board exams. The site provides online admission applications, exam results searchable by roll number, official notices, school news, free study notes, past papers, an academic calendar, teacher directory and a photo gallery.

## School facts

- Full name: Government High School Babi Khel (also: ${s.school_name})
- Location: Babi Khel, District Mohmand, Khyber Pakhtunkhwa, Pakistan
- Established: ${s.established}
- EMIS code: ${s.emis}
- Principal: ${s.principal}
- Classes offered: 6, 7, 8, 9 and 10
- Board affiliation: BISE Peshawar (Board of Intermediate and Secondary Education, Peshawar) — classes 9 and 10 sit board examinations
- Phone: ${s.phone}
- Email: ${s.email}
- Website: ${SITE_URL}
- Facebook: ${FACEBOOK_URL}

## Key pages

- [Home](${SITE_URL}/): School overview with latest notices, news, result toppers and announcements
- [Admissions](${SITE_URL}/admission): Online admission application form for classes 6–10, plus an application status tracker (search by reference number, B-Form number or contact number)
- [Results](${SITE_URL}/results): Search school exam results by roll number; also searches BISE Peshawar board results (SSC 9th/10th) live from the official board portal
- [Result Card](${SITE_URL}/result-card): Detailed result cards with subject-wise marks, grades and class positions
- [Notices](${SITE_URL}/notices): Official school notices — holidays, exam schedules, fee deadlines, parent-teacher meetings
- [News](${SITE_URL}/news): School news articles — events, achievements, sports, announcements
- [Calendar](${SITE_URL}/calendar): Academic calendar with exam dates, holidays and school events; subscribable on phones
- [Teachers](${SITE_URL}/teachers): Teaching staff directory with subjects and qualifications
- [Notes](${SITE_URL}/notes): Free study notes organised by subject (Math, Physics, Chemistry, Biology, English, Urdu, Islamiat, Pakistan Studies, Computer) with quizzes and flashcards
- [Library](${SITE_URL}/library): Downloadable study materials, books and past papers
- [Gallery](${SITE_URL}/gallery): Photos of school events — sports day, science fair, annual function, trips
- [Contact](${SITE_URL}/contact): Contact details, embedded map, WhatsApp and contact form
- [About](${SITE_URL}/about): School history, mission, vision and staff overview
- [Online Classes](${SITE_URL}/online-classes): Online class sessions and video lessons
- [Duty Roster](${SITE_URL}/duty): Teacher duty roster and examination duties

## Results

- School internal results: 1st and 2nd semester for classes 6–8; Annual-I and Annual-II for classes 9–10 — searchable on the Results page by exam roll number once published
- BISE Peshawar results (SSC-I / SSC-II): searchable through the same Results page, fetched live from the official board portal (cloud.bisep.edu.pk)
- Result cards show: name, photo, roll number, class, exam, year, total/obtained marks, percentage, grade, PASS/FAIL status, class position and subject-wise marks
- Grade scale: A+ (90% and above), A (80–89%), B (60–79%), C (45–59%), D (33–44%), Fail (below 33%)

## Admissions

- Admissions open every academic session for classes 6 to 10
- Apply online on the Admissions page; the form issues a reference number for tracking
- Required documents: student B-Form (NADRA), passport-size photos, previous result card, school leaving certificate and father's CNIC copy (for migration cases)
- Application status can be tracked online by reference number, B-Form number or contact number

## Optional

- [RSS feed](${SITE_URL}/rss.xml): Latest news and notices as they are published
- [Sitemap](${SITE_URL}/sitemap.xml): XML sitemap of all public pages
- [Academic calendar (ICS)](${SITE_URL}/calendar.ics): Subscribe to school events on any phone calendar
`;
}

export default async function handler(req, res) {
  const settings = await getSettings();

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  // Cache at the CDN for 1 hour; serve stale up to 24h while revalidating.
  // AI crawlers fetch llms.txt occasionally — this keeps it cheap and fresh.
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).send(buildLlmsTxt(settings));
}
