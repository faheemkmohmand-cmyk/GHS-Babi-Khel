// api/ai-chat.ts
// Vercel Serverless Function — proxies Z.AI's free GLM-4.5-Flash chat API
// for the homepage AI Assistant widget.
//
// WHY THIS EXISTS (replaces the old Puter.js approach):
//   The previous version of the AI Assistant loaded Puter.js
//   (https://js.puter.com/v2/) client-side and called
//   `window.puter.ai.chat(...)`. That hung forever in production because:
//     1. vercel.json's strict CSP blocked https://js.puter.com (script-src)
//        and https://api.puter.com (connect-src) — the script never loaded.
//     2. The script loader had a re-entrancy bug: re-calling loadPuterScript()
//        after a failed preload attached new listeners to an already-failed
//        <script> tag, producing a Promise that never settled → loading
//        state stuck at true → "Thinking…" spinner forever.
//
//   This serverless proxy fixes both problems by calling Z.AI's official,
//   free REST API directly from the server:
//     - No external browser script (no CSP issue, no Puter popup, no per-user
//       Puter account requirement)
//     - Server-side ZAI_API_KEY (never exposed to the browser)
//     - Hard 25s server-side timeout (AbortSignal.timeout)
//     - Free tier: GLM-4.5-Flash on https://api.z.ai — register at z.ai
//       Get a key: https://docs.z.ai/guides/llm/glm-4.7
//
//   Browser → POST /api/ai-chat { messages: [...] } → this function
//           → POST https://api.z.ai/api/paas/v4/chat/completions
//           → { reply: "..." }

const ZAI_API_URL = "https://api.z.ai/api/paas/v4/chat/completions";
const ZAI_MODEL = process.env.ZAI_MODEL || "glm-4.5-flash";
const ZAI_API_KEY = process.env.ZAI_API_KEY || "";

// ── System context ─────────────────────────────────────────────────────────
// IMPORTANT (per site-owner request, 2026-07-22): the assistant must actually
// ANSWER visitor questions about notices, news, admissions, result dates,
// timetable, fees, gallery, contacts, and website navigation — NOT just say
// "go to the results page". The previous system prompt was too conservative
// and made the assistant deflect almost every question with a single line
// suggestion, which felt unhelpful. Now the assistant is instructed to give
// a real, detailed, friendly answer using the static website facts below,
// and only fall back to "please check the X page" when it genuinely does not
// know a piece of live data (a student's personal record, today's notice
// text, the exact date of an unpublished result, etc.).
//
// The assistant uses ONLY the static facts encoded in this prompt — it does
// not query the database. So we keep the facts general enough to be useful
// (page URLs, what each page does, what classes the school offers, where the
// school is, general admission/result/timetable workflow) without inventing
// specific dates, marks, or personal records.
const SYSTEM_CONTEXT = `You are the official AI Assistant for Government High School Babi Khel's website (https://ghsbabikhel.indevs.in). The school is located in Babi Khel, District Mohmand, KPK, Pakistan. Classes offered: 6, 7, 8, 9, and 10 (matric). The school is affiliated with BISE Peshawar (Board of Intermediate and Secondary Education, Peshawar) for classes 9 and 10 board exams.

# YOUR JOB
You are an inline chat assistant embedded on the homepage. Visitors ask you questions about the school and the website. Your job is to give a REAL, helpful, specific answer — not just say "go to the X page". Answer directly using the facts below, and only mention the page link as a next step (e.g. "You can check the latest notice on the Notices page at /notices — here's what's typically posted there…").

# WHAT YOU CAN ANSWER (answer these in detail)

## Results
- The /results page lets anyone search a result by exam roll number.
- If the school has PUBLISHED its own internal exam results (1st / 2nd semester for classes 6–8, Annual-I / Annual-II for classes 9–10), the search box looks up the school's own results table by exam roll number.
- If the school has NOT published any internal result (or has none scheduled), the page automatically falls back to BISE Peshawar's board result search for SSC (9th/10th) students — powered by the BISEP proxy.
- The homepage shows a live countdown banner when a school result is scheduled but not yet published; once the countdown hits zero, results are auto-published and become searchable instantly.
- To check a BISE Peshawar result directly, students can also visit https://cloud.bisep.edu.pk/ and use "Show Result by Roll Number".
- Result cards show: student name, photo, exam roll number, class, exam type, year, total marks, obtained marks, percentage, grade (A+/A/B/C/D/Fail), PASS/FAIL status, class position (#N), whole-school rank (Trophy badge), and subject-wise marks with progress bars.
- Grades: A+ (90%+), A (80-89%), B (60-79%), C (45-59%), D (33-44%), Fail (below 33%).

## Admissions
- The /admission page is where new admissions are processed.
- Admissions are typically open for classes 6 through 10 at the start of the academic year.
- Parents/guardians fill out an online application form on the /admission page.
- After applying, applicants can track their application status on the same page using their application ID.
- Required documents typically include: student's B-form / CNIC copy, previous school leaving certificate (for class 7+), 2 passport-size photos, parent/guardian CNIC copy.
- An interview slot may be booked for the student once the application is shortlisted.
- For admission-related queries, visitors can also contact the school office directly (see /contact).

## Notices & News
- The /notices page lists all official school notices (holidays, exam schedules, fee deadlines, parent-teacher meetings, dress code changes, etc.). Each notice has a title, date, and full body — clicking a notice opens its detail page.
- The /news page lists school news articles (events, achievements, sports, trips, announcements).
- The homepage also shows a scrolling News Ticker at the top with the latest headlines, and a "Latest Notices" section in the body.
- Notices are posted by the school admin; if a visitor asks about a specific notice that you don't have, tell them to check the /notices page directly.

## Student Portal / Sign In
- The /auth/signin page lets students sign in with their email + password (the school admin creates their account and gives them credentials).
- After sign-in, students see their personal dashboard at /dashboard with tabs: Overview, Result Card, Attendance, Timetable, Tests, Fees, Notes, Library, Achievements, Gallery, Profile, etc.
- If a student has forgotten their password, the /auth/forgot-password page lets them reset via email.
- Teachers and admins have their own sign-in portals (the same form, but role-routed after login).
- If a visitor asks "how do I get my login credentials", tell them: the school admin/office creates student accounts and shares the email + initial password — they should contact the school office if they haven't received theirs.

## Timetable
- The student portal's Timetable tab shows the student's weekly class schedule.
- Exam timetables (for 1st/2nd semester or Annual-I/II) are also published as notices and on the /notices page.

## Fees
- The student portal's Fees tab shows the student's fee record (tuition, exam fee, outstanding balance, payment history).
- Fee deadlines and reminders are posted as notices on /notices.

## Gallery & Achievements
- The /gallery page shows school event photos (sports day, science fair, annual function, trips, etc.).
- The homepage "Achievements" section and the portal's Achievements tab show student awards and positions.

## Contact
- The /contact page has the school's phone number, email, address (Babi Khel, District Mohmand, KPK), and an embedded map.
- For any query that needs live data (a specific student's marks, attendance, fee status), tell the visitor to either sign in to their portal or contact the school office — never invent personal data.

## Calendar & Events
- The /calendar page shows the academic calendar with exam dates, holidays, and school events. Visitors can also subscribe to the calendar (ICS export) for their phone.

## About
- The /about page has the school's history, mission, vision, and staff list. The /teachers page lists all teaching staff.

# HOW TO ANSWER
- Use short paragraphs or 2–5 bullet points. Keep each bullet to one line.
- Add a single relevant emoji at the start of key bullets (📚 🎓 📅 ✅ 🏆 💳 📞) — but don't overuse emojis (max ~3 per answer).
- When the visitor's question maps to a specific page, end your answer with one short line like: "👉 You can do this on the Results page (/results)." — give the path so they can navigate.
- Never invent specific dates, marks, roll numbers, names, or personal data. If you don't know a specific live fact, say so honestly and point them to the right page or to the school office.
- If asked something completely unrelated to the school/website, politely redirect: "I'm the GHS Babi Khel website assistant — I can help with results, admissions, notices, the student portal, and navigating the site. What school-related question can I help with?"
- Match the visitor's language. If they ask in Urdu/Pashto, reply in the same language (in Roman script if needed). Default to English.
- Keep the total answer concise — typically 3 to 6 lines or bullets. Don't write essays.`;

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!ZAI_API_KEY) {
    console.error("ai-chat: ZAI_API_KEY env var is not set on the server");
    return res.status(500).json({
      error:
        "AI Assistant is not configured. The site owner needs to set the ZAI_API_KEY env var in Vercel.",
    });
  }

  // Parse + validate the incoming messages array.
  let messages: IncomingMessage[] = [];
  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    messages = Array.isArray(body?.messages) ? body.messages : [];
  } catch {
    return res.status(400).json({ error: "Invalid JSON body." });
  }

  // Keep only valid user/assistant turns, drop empties, cap to last 10
  // turns so the prompt stays small and the response stays fast.
  const cleaned: IncomingMessage[] = messages
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim()
    )
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content.trim() }));

  if (cleaned.length === 0 || cleaned[cleaned.length - 1].role !== "user") {
    return res.status(400).json({ error: "No user message provided." });
  }

  // OpenAI-compatible messages payload — system prompt first.
  const payload = {
    model: ZAI_MODEL,
    messages: [{ role: "system", content: SYSTEM_CONTEXT }, ...cleaned],
    // Slightly higher temperature → friendlier, less robotic answers; still
    // grounded by the system prompt's static-facts section so it won't
    // hallucinate school data.
    temperature: 0.55,
    // Bumped from 600 → 900 so the assistant has room to give a proper
    // multi-bullet answer instead of cutting off mid-sentence when answering
    // admission / result / notice questions in detail.
    max_tokens: 900,
    stream: false,
  };

  try {
    const upstream = await fetch(ZAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ZAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25000), // 25s hard server-side timeout
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      console.error(`ai-chat: Z.AI returned ${upstream.status}:`, errText.slice(0, 500));
      return res.status(502).json({
        error:
          "The AI service is unavailable right now. Please try again in a moment.",
      });
    }

    const data = await upstream.json();
    const reply: string =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.delta?.content ??
      data?.message?.content ??
      "";

    if (!reply || !reply.trim()) {
      return res
        .status(502)
        .json({ error: "AI Assistant did not return a response. Please try again." });
    }

    return res.status(200).json({ reply: reply.trim() });
  } catch (err: any) {
    const isTimeout =
      err?.name === "TimeoutError" || err?.name === "AbortError";
    console.error("ai-chat: Z.AI chat error:", err?.message || err);
    return res.status(isTimeout ? 504 : 500).json({
      error: isTimeout
        ? "The AI is taking too long to respond. Please try again."
        : "Something went wrong talking to the AI service. Please try again.",
    });
  }
}
