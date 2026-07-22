// api/ai-result-summary.ts
// Vercel Serverless Function — generates a short, friendly AI summary of a
// student's exam result card, shown beside the result on the /results page.
//
// WHY THIS EXISTS:
//   The site owner (2026-07-22) asked for a "beautiful box" beside the
//   result card that auto-summarizes the result in 4–5 lines with emojis,
//   e.g. "You scored 78% — strong in Math, weak in English. Focus on…".
//   Rather than building that summary with brittle client-side heuristics,
//   we send the result payload to Z.AI's GLM-4.5-Flash (same model already
//   used by /api/ai-chat) and let it produce a personalized, encouraging,
//   study-tip-style summary.
//
//   The summary is purely advisory — it never makes claims about the
//   student's official record beyond what was sent in the request, and it
//   never invents new marks/grades.
//
//   Browser → POST /api/ai-result-summary { result: {...} }
//           → POST https://api.z.ai/api/paas/v4/chat/completions
//           → { summary: "..." }
//
// PRIVACY:
//   The request body contains the student's name, roll number, marks, and
//   subject-wise breakdown — same data the visitor already sees on screen.
//   It is sent over HTTPS to Z.AI for summarization and is not stored
//   anywhere on our side. The system prompt instructs the model to never
//   invent additional personal data.

const ZAI_API_URL = "https://api.z.ai/api/paas/v4/chat/completions";
const ZAI_MODEL = process.env.ZAI_MODEL || "glm-4.5-flash";
const ZAI_API_KEY = process.env.ZAI_API_KEY || "";

const SYSTEM_PROMPT = `You are the AI Study Companion for Government High School Babi Khel's results page. A visitor just looked up an exam result; your job is to write a SHORT, friendly, personalized summary of that result that will be shown in a "AI Summary" card beside the result.

# OUTPUT FORMAT (STRICT)
- Exactly 4 to 5 short lines, separated by single newlines (\\n). No headings, no Markdown bullets, no leading dashes.
- Each line is one complete, punchy sentence (max ~16 words).
- Start the FIRST line with a single relevant emoji (🎯 / 🏆 / 📚 / 💪 / ✨ / 🌟 / 📈) — your choice based on the score.
- Use 2 to 3 additional emojis sparingly across the remaining lines (one per line max, never mid-sentence).
- The TONE is encouraging and constructive, never harsh — even for a fail or low score. Always end on a positive, actionable note.
- Write in English. If the student's name is provided, address them by first name in line 2 or 3 (e.g. "Ali, your Math is solid — keep that momentum going.").

# CONTENT (what each line should cover)
1. Line 1 — the headline: state the percentage + grade + pass/fail in one celebratory or honest sentence. (e.g. "🎯 You scored 78% with a B grade — solid effort!")
2. Line 2 — strongest subject: name the subject with the highest percentage and praise it. (e.g. "💪 Math is your superpower at 92% — keep that momentum.")
3. Line 3 — weakest subject: name the subject with the lowest percentage and frame it as the next focus area, not a failure. (e.g. "📚 English at 54% is your growth zone — 15 min of daily reading will lift it.")
4. Line 4 — class position / school rank (if provided) OR a general study tip tied to their weakest subject. (e.g. "🏆 You're ranked #4 in class — top 10%, well done!"  OR  "📅 Add a 20-min English vocab drill to your evening routine.")
5. Line 5 (optional but preferred) — a forward-looking, motivational closer tied to the next exam. (e.g. "🚀 Aim for 85%+ next term — you've got the foundation, now push consistency.")

# RULES
- Use ONLY the result data provided in the user message. Never invent marks, percentages, grades, positions, or subjects that weren't given.
- If subject-wise marks are missing, skip lines 2 and 3 and instead write two general study-tip lines based on the overall percentage.
- If the student FAILED (is_pass = false / percentage below 33%), still be encouraging: "🎯 You scored 28% this time — every expert was once a beginner. Let's regroup and rebuild." Then 2 lines of concrete next-step advice + 1 motivational close. Don't use the word "fail" as a label; say "didn't pass this time" or "below the pass mark".
- Never give medical, psychological, or counselling advice. Stick to study strategy.
- Do not include any preamble like "Here's your summary:" — just the 4–5 lines.
- Each line MUST start with content (the emoji comes first, then immediately the text — no leading spaces).`;

interface SubjectMark {
  obtained: number;
  total: number;
}

// The shape of the result payload the browser sends. We accept both the
// school's own result shape (RCResult) and the BISEP search shape — they
// share the common fields we need (name, percentage/total/obtained, grade,
// is_pass, subjects).
interface ResultSummaryRequest {
  name?: string | null;
  roll_no?: string | null;
  class?: string | null;
  exam_type?: string | null;
  year?: number | null;
  total_marks?: number | null;
  obtained_marks?: number | null;
  percentage?: number | null;
  grade?: string | null;
  is_pass?: boolean | null;
  position?: number | null;
  school_rank?: number | null;
  total_students?: number | null;
  // Subject-wise marks — for the school's own results this is a Record<string,{obtained,total}>;
  // for BISEP results it's an array of {subject, theory, practical}.
  subject_marks?: Record<string, SubjectMark> | null;
  subjects?: Array<{ subject?: string; theory?: string; practical?: string }> | null;
  // Source indicator so the model can phrase the summary correctly
  // ("BISE Peshawar" vs "school exam").
  source?: "school" | "bisep" | null;
}

function buildUserMessage(r: ResultSummaryRequest): string {
  const lines: string[] = [];
  lines.push(`Student name: ${r.name || "—"}`);
  if (r.roll_no) lines.push(`Roll number: ${r.roll_no}`);
  if (r.class) lines.push(`Class: ${r.class}`);
  if (r.exam_type) lines.push(`Exam type: ${r.exam_type}`);
  if (r.year) lines.push(`Year: ${r.year}`);
  if (typeof r.total_marks === "number") lines.push(`Total marks: ${r.total_marks}`);
  if (typeof r.obtained_marks === "number") lines.push(`Obtained marks: ${r.obtained_marks}`);
  if (typeof r.percentage === "number") lines.push(`Percentage: ${r.percentage}%`);
  if (r.grade) lines.push(`Grade: ${r.grade}`);
  if (typeof r.is_pass === "boolean") lines.push(`Pass status: ${r.is_pass ? "PASS" : "FAIL"}`);
  if (typeof r.position === "number") lines.push(`Class position: #${r.position}`);
  if (typeof r.total_students === "number") lines.push(`Total students in class: ${r.total_students}`);
  if (typeof r.school_rank === "number") lines.push(`Whole-school rank: #${r.school_rank}`);

  // Subject-wise marks — normalize both shapes into a single "Subject: X/Y (Z%)" list.
  const subjectLines: string[] = [];
  if (r.subject_marks && typeof r.subject_marks === "object") {
    for (const [sub, m] of Object.entries(r.subject_marks)) {
      if (m && typeof m === "object" && typeof m.obtained === "number" && typeof m.total === "number") {
        // Skip placeholder 0/0 rows (subjects not part of this result).
        if (m.obtained === 0 && m.total === 0) continue;
        const pct = m.total > 0 ? Math.round((m.obtained / m.total) * 100) : 0;
        subjectLines.push(`- ${sub}: ${m.obtained}/${m.total} (${pct}%)`);
      }
    }
  }
  if (subjectLines.length === 0 && Array.isArray(r.subjects) && r.subjects.length > 0) {
    for (const s of r.subjects) {
      if (!s || !s.subject) continue;
      subjectLines.push(
        `- ${s.subject}: theory=${s.theory || "—"}, practical=${s.practical || "—"}`
      );
    }
  }

  if (subjectLines.length > 0) {
    lines.push("Subject-wise marks:");
    lines.push(...subjectLines);
  } else {
    lines.push("Subject-wise marks: not available");
  }

  if (r.source) lines.push(`Result source: ${r.source === "bisep" ? "BISE Peshawar board exam" : "School internal exam"}`);

  lines.push("");
  lines.push("Write the 4–5 line summary now, following the output format and rules in the system prompt exactly.");
  return lines.join("\n");
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
    console.error("ai-result-summary: ZAI_API_KEY env var is not set on the server");
    return res.status(500).json({
      error:
        "AI Result Summary is not configured. The site owner needs to set the ZAI_API_KEY env var in Vercel.",
    });
  }

  // Parse the incoming result payload.
  let result: ResultSummaryRequest;
  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    if (!body || typeof body !== "object" || !body.result) {
      return res.status(400).json({ error: "Missing 'result' in request body." });
    }
    result = body.result as ResultSummaryRequest;
  } catch {
    return res.status(400).json({ error: "Invalid JSON body." });
  }

  const userMessage = buildUserMessage(result);

  const payload = {
    model: ZAI_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: 0.7, // a bit of warmth so the encouraging lines don't feel robotic
    max_tokens: 350,  // 4–5 short lines is ~120–180 tokens; 350 gives headroom
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
      console.error(
        `ai-result-summary: Z.AI returned ${upstream.status}:`,
        errText.slice(0, 500)
      );
      return res.status(502).json({
        error:
          "The AI summary service is unavailable right now. The result card is still shown above.",
      });
    }

    const data = await upstream.json();
    const summary: string =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.delta?.content ??
      data?.message?.content ??
      "";

    if (!summary || !summary.trim()) {
      return res
        .status(502)
        .json({ error: "AI did not return a summary. Please try again." });
    }

    // Normalize whitespace: collapse 3+ newlines to 2, trim trailing spaces
    // per line, and strip any leading "Here's your summary:" preamble the
    // model might add despite the system prompt's instruction not to.
    const cleaned = summary
      .replace(/\r/g, "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l, i, arr) => {
        // Drop leading preamble lines that aren't part of the summary
        if (i === 0 && /^(here'?s|sure|of course|below is|summary:)/i.test(l)) return false;
        // Collapse consecutive blank lines
        if (l === "" && (i === 0 || arr[i - 1] === "")) return false;
        return true;
      })
      .join("\n")
      .trim();

    return res.status(200).json({ summary: cleaned });
  } catch (err: any) {
    const isTimeout =
      err?.name === "TimeoutError" || err?.name === "AbortError";
    console.error("ai-result-summary: Z.AI error:", err?.message || err);
    return res.status(isTimeout ? 504 : 500).json({
      error: isTimeout
        ? "The AI is taking too long to summarize the result. Please try again."
        : "Something went wrong generating the AI summary. Please try again.",
    });
  }
}
