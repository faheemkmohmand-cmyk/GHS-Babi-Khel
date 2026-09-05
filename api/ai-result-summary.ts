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

const SYSTEM_PROMPT = `AI Study Companion for GHS Babi Khel results page. Write a SHORT personalized summary shown beside a result card.

FORMAT: 3-4 short lines (~12-18 words each), separated by single \\n. Line 1 starts with one emoji (🎯/🏆/📚/💪/✨/🌟/📈/🚀); 1-2 more emojis on other lines, one per line, never mid-sentence. No markdown bullets, no headings, no preamble — start directly with line 1. English only.

CONTENT:
- Line 1: pass/fail status (per FAILED-SUBJECT RULE below) + percentage + grade.
- Line 2: name the highest-scoring subject, praise it.
- Line 3: if subjects failed, name them (all if 2-3, else worst 1-2) as priority focus. Else name the lowest-scoring subject as next focus.
- Line 4 (optional): motivational closer re: next exam.
- If subject marks are missing, replace lines 2-3 with two general study tips based on overall %.

FAILED-SUBJECT RULE (source of truth — overrides the aggregate Pass status field):
The data marks each subject "passed" or "FAILED". If ANY subject is FAILED, the student's OVERALL result is a FAIL, no matter how high total/obtained marks are or what "Pass status" says — one failed paper fails the whole result. When failed subjects exist: line 1 must state overall FAIL plainly (sober, direct, honest — never dress up a fail as a near-pass), name every failed subject in line 3, give 2 lines of concrete next steps + 1 motivational close. When zero subjects failed: genuine pass, normal encouraging tone.

RULES:
- Use ONLY provided data — never invent marks, grades, positions, subjects.
- Vary phrasing, emoji choice, opening style (name/number/question/emoji-first) per student — no two students get the same summary, even with similar marks.
- Address the student by first name in line 2 or 3 if given.
- No medical/psychological/counselling advice — study strategy only.`;

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
  subjects?: Array<{ subject?: string; theory?: string; practical?: string; theory_fail?: boolean; practical_fail?: boolean }> | null;
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
  const failedSubjects: string[] = [];
  if (r.subject_marks && typeof r.subject_marks === "object") {
    for (const [sub, m] of Object.entries(r.subject_marks)) {
      if (m && typeof m === "object" && typeof m.obtained === "number" && typeof m.total === "number") {
        if (m.obtained === 0 && m.total === 0) continue;
        const pct = m.total > 0 ? Math.round((m.obtained / m.total) * 100) : 0;
        const passMark = Math.ceil(m.total * 0.33);
        const failed = m.obtained < passMark;
        const status = failed ? "FAILED (below pass mark)" : "passed";
        subjectLines.push(`- ${sub}: ${m.obtained}/${m.total} (${pct}%) — ${status}`);
        if (failed) failedSubjects.push(sub);
      }
    }
  }
  if (subjectLines.length === 0 && Array.isArray(r.subjects) && r.subjects.length > 0) {
    for (const s of r.subjects) {
      if (!s || !s.subject) continue;
      const theoryFailed = s.theory_fail === true;
      const practicalFailed = s.practical_fail === true;
      const failed = theoryFailed || practicalFailed;
      let statusNote = "passed";
      if (theoryFailed && practicalFailed) statusNote = "FAILED (both theory and practical below pass mark)";
      else if (theoryFailed) statusNote = "FAILED (theory below pass mark)";
      else if (practicalFailed) statusNote = "FAILED (practical below pass mark)";
      subjectLines.push(
        `- ${s.subject}: theory=${s.theory || "—"}, practical=${s.practical || "—"} — ${statusNote}`
      );
      if (failed) failedSubjects.push(s.subject);
    }
  }

  if (subjectLines.length > 0) {
    lines.push("Subject-wise marks:");
    lines.push(...subjectLines);
    // Explicit, pre-computed fact so the model doesn't need to count or
    // infer this itself — directly tells it how many subjects failed and
    // which ones, which is exactly what line 1 and line 3 must reflect.
    lines.push("");
    if (failedSubjects.length === 0) {
      lines.push("Failed-subject count: 0. No individual subject failed — this is a genuine pass.");
    } else {
      lines.push(
        `Failed-subject count: ${failedSubjects.length}. Failed subjects: ${failedSubjects.join(", ")}. ` +
        "GOLDEN RULE: one or more failed subjects means this student's OVERALL result is a FAIL, regardless of total/obtained marks or what the 'Pass status' field below says. Do not write a celebratory line 1 — state plainly this is a fail and name the failed subject(s)."
      );
    }
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
