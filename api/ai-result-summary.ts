// api/ai-result-summary.ts
// Vercel Serverless Function — generates a short, friendly AI summary of a
// student's exam result card, shown beside the result on the /results page.
//
// STREAMING + NO FALLBACK (per site-owner request, 2026-07-22):
//   This endpoint returns a Server-Sent Events (SSE) stream of word-by-word
//   chunks so the browser can render the summary LIVE, one word at a time,
//   as the model writes it. There is NO deterministic fallback summary
//   anymore — the visitor only sees AI-generated content. If the model is
//   slow, the visitor sees a loading state in the card until the first word
//   arrives (typically <500ms); if the model fails completely, an error
//   message is shown with a Retry button.
//
//   Request:  POST /api/ai-result-summary  { result: {...} }
//   Response: text/event-stream
//             data: {"token":"🎯 You "}\n\n
//             data: {"token":"scored "}\n\n
//             data: {"token":"78% "}\n\n
//             ...
//             data: [DONE]\n\n
//
//   On error: data: {"error":"..."}\n\n  (single event, then stream closes)
//
//   Each result gets a UNIQUE summary — the prompt injects the student's
//   actual marks + subjects + position, and we set temperature=0.85 with a
//   per-request random seed hint (the student's roll_no + year hash) so the
//   model picks different phrasings for different students even when their
//   marks are similar.
//
// PRIVACY:
//   The request body contains the student's name, roll number, marks, and
//   subject-wise breakdown — same data the visitor already sees on screen.
//   It is sent over HTTPS to Z.AI for summarization and is not stored
//   anywhere on our side.

const ZAI_API_URL = "https://api.z.ai/api/paas/v4/chat/completions";
const ZAI_MODEL = process.env.ZAI_MODEL || "glm-4.5-flash";
const ZAI_API_KEY = process.env.ZAI_API_KEY || "";

const SYSTEM_PROMPT = `You are the AI Study Companion for Government High School Babi Khel's results page. A visitor just looked up an exam result; your job is to write a SHORT, friendly, personalized summary that will be shown beside the result card.

# OUTPUT FORMAT
- Write 3 to 4 short lines. Separate each line with a single newline (\\n).
- Each line is one complete, punchy sentence (~12 to 18 words).
- Start the FIRST line with a single relevant emoji (🎯 / 🏆 / 📚 / 💪 / ✨ / 🌟 / 📈 / 🚀).
- Add 1 to 2 more emojis on other lines, one per line max, never mid-sentence.
- DO NOT use Markdown bullets (no leading "- " or "• "). DO NOT use headings.
- DO NOT add a preamble like "Here's your summary:" — just start with line 1.
- Write in English.

# CONTENT
- Line 1: state the percentage + grade + pass/fail in one celebratory or honest sentence.
- Line 2: name the subject with the highest percentage and praise it.
- Line 3: name the subject with the lowest percentage and frame it as the next focus area.
- Line 4 (optional): a forward-looking, motivational closer tied to the next exam.

# RULES — DIFFERENT SUMMARY PER STUDENT
- Use ONLY the result data provided in the user message. Never invent marks, percentages, grades, positions, or subjects.
- EVERY STUDENT MUST GET A DIFFERENT SUMMARY. Vary your phrasing, emoji choices, opening words, and study-tip angles between students — even students with similar marks should get noticeably different summaries.
- If subject-wise marks are missing, replace lines 2 and 3 with two general study-tip lines based on the overall percentage.
- If the student didn't pass (is_pass = false / percentage below 33%), still be encouraging — never use the word "fail" as a label. Say "didn't pass this time" or "below the pass mark". Give 2 lines of concrete next-step advice + 1 motivational close.
- Never give medical, psychological, or counselling advice. Stick to study strategy.
- TONE: warm, encouraging, constructive. Always end on a positive, actionable note.
- If the student's name is provided, address them by first name in line 2 or 3.
- Vary sentence structure across students: sometimes start with an emoji, sometimes with the student's name, sometimes with a number, sometimes with a question. Keep it fresh.`;

interface SubjectMark {
  obtained: number;
  total: number;
}

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
  subject_marks?: Record<string, SubjectMark> | null;
  subjects?: Array<{ subject?: string; theory?: string; practical?: string }> | null;
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

  const subjectLines: string[] = [];
  if (r.subject_marks && typeof r.subject_marks === "object") {
    for (const [sub, m] of Object.entries(r.subject_marks)) {
      if (m && typeof m === "object" && typeof m.obtained === "number" && typeof m.total === "number") {
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

  // Per-student variation hint: tell the model explicitly to write a fresh,
  // unique summary for THIS student. The roll number + year combo gives the
  // model a different starting context each time, and the explicit
  // instruction reinforces that the output must not be a template.
  lines.push("");
  lines.push(`Unique summary ID: ${r.roll_no || "anon"}-${r.year || ""}-${r.class || ""}`);
  lines.push("Write a FRESH, UNIQUE 3–4 line summary for THIS specific student. Do NOT reuse phrasings from other students. Start with line 1 immediately — no preamble.");
  return lines.join("\n");
}

// ── SSE helpers ────────────────────────────────────────────────────────────
function sseFrame(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
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

  // ── Open SSE response ────────────────────────────────────────────────────
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let lineBuf = "";
  let clientClosed = false;
  req.on("close", () => {
    clientClosed = true;
  });

  const send = (obj: unknown) => {
    if (clientClosed) return;
    try {
      res.write(sseFrame(obj));
    } catch {
      clientClosed = true;
    }
  };

  // ── Build the upstream payload ───────────────────────────────────────────
  // Higher temperature (0.85) + per-student unique ID in the user message
  // gives meaningfully different summaries for different students even when
  // their marks are similar.
  const payload = {
    model: ZAI_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: 0.85,
    max_tokens: 400,
    stream: true,
    // Disable GLM-4.5-Flash's internal reasoning pass — without this the
    // model can spend most/all of the 25s timeout "thinking" silently
    // before emitting a single visible token, which is exactly what
    // produced the "Thinking… → hangs → empty summary" bug.
    thinking: { type: "disabled" },
  };

  try {
    const upstream = await fetch(ZAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ZAI_API_KEY}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25000),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      console.error(
        `ai-result-summary: Z.AI returned ${upstream.status}:`,
        errText.slice(0, 500)
      );
      send({ error: "The AI summary service is unavailable right now. Please try again." });
      return res.end();
    }

    if (!upstream.body) {
      // Fallback: non-streaming parse (some providers don't honor stream:true).
      const data = await upstream.json().catch(() => null);
      const summary: string =
        data?.choices?.[0]?.message?.content ??
        data?.choices?.[0]?.delta?.content ??
        "";
      if (summary && summary.trim()) {
        // Emit word-by-word even in the non-streaming fallback path so the
        // client experience stays consistent.
        for (const w of splitWords(summary.trim())) {
          send({ token: w });
        }
        send({ done: true });
      } else {
        send({ error: "AI did not return a summary. Please try again." });
      }
      return res.end();
    }

    // ── Pipe upstream SSE → client SSE, immediately, no buffering ──────────
    // Forward every raw delta the instant it arrives. The frontend
    // (AiResultSummaryCard.tsx) is responsible for the letter-by-letter
    // reveal animation, so the server's only job is low latency.
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder("utf-8");

    while (true) {
      if (clientClosed) break;
      const { value, done } = await reader.read();
      if (done) break;

      lineBuf += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = lineBuf.indexOf("\n\n")) !== -1) {
        const frame = lineBuf.slice(0, idx);
        lineBuf = lineBuf.slice(idx + 2);

        const dataLines = frame
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim());
        if (dataLines.length === 0) continue;

        const dataStr = dataLines[dataLines.length - 1];
        if (dataStr === "[DONE]") {
          send({ done: true });
          return res.end();
        }

        try {
          const parsed = JSON.parse(dataStr);
          const token: string =
            parsed?.choices?.[0]?.delta?.content ??
            parsed?.choices?.[0]?.message?.content ??
            "";

          if (token) {
            send({ token });
          }
        } catch {
          // Ignore malformed JSON frames
        }
      }
    }

    // Stream ended without explicit [DONE].
    send({ done: true });
    return res.end();
  } catch (err: any) {
    const isTimeout =
      err?.name === "TimeoutError" || err?.name === "AbortError";
    console.error("ai-result-summary: Z.AI stream error:", err?.message || err);
    send({
      error: isTimeout
        ? "The AI is taking too long to summarize the result. Please try again."
        : "Something went wrong generating the AI summary. Please try again.",
    });
    return res.end();
  }
}

// ── Word splitter (for the non-streaming fallback path) ────────────────────
// Splits a string into word-sized chunks, preserving the trailing whitespace
// attached to each word. Same boundary rules as flushWords() above.
function splitWords(s: string): string[] {
  const out: string[] = [];
  let rest = s;
  while (rest.length > 0) {
    const m = rest.match(/^(\S+?[\s.,!?;:。，、！？：；]+|\s+|\S+)/);
    if (!m) {
      out.push(rest);
      break;
    }
    const chunk = m[1];
    if (/[\s.,!?;:。，、！？：；]$/.test(chunk)) {
      out.push(chunk);
      rest = rest.slice(chunk.length);
    } else {
      // Bare word at end of string — push it.
      out.push(chunk);
      rest = rest.slice(chunk.length);
    }
  }
  return out;
}
