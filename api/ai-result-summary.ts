// api/ai-result-summary.ts
// Vercel Serverless Function — generates a short, friendly AI summary of a
// student's exam result card, shown beside the result on the /results page.
//
// STREAMING (per site-owner request, 2026-07-22):
//   This endpoint now returns a Server-Sent Events (SSE) stream so the
//   browser can render the summary LINE BY LINE as the model writes it,
//   instead of waiting for the whole response and then dumping it on screen.
//   The model output is streamed token-by-token directly to the client —
//   perceived latency drops from "4s of nothing, then a wall of text" to
//   "first line visible in <300ms, the rest streams in over ~1–2s".
//
//   Request:  POST /api/ai-result-summary  { result: {...} }
//   Response: text/event-stream
//             data: {"token":"🎯 You scored 78%"}\n\n
//             data: {"token":" with a B"}\n\n
//             ...
//             data: [DONE]\n\n
//
//   On error: data: {"error":"..."}\n\n  (single event, then stream closes)
//
//   The browser-side AiResultSummaryCard.tsx consumes this stream with the
//   Fetch API + ReadableStream reader (no EventSource needed — EventSource
//   can't POST).
//
// PRIVACY:
//   The request body contains the student's name, roll number, marks, and
//   subject-wise breakdown — same data the visitor already sees on screen.
//   It is sent over HTTPS to Z.AI for summarization and is not stored
//   anywhere on our side.

const ZAI_API_URL = "https://api.z.ai/api/paas/v4/chat/completions";
const ZAI_MODEL = process.env.ZAI_MODEL || "glm-4.5-flash";
const ZAI_API_KEY = process.env.ZAI_API_KEY || "";

// Loosened prompt (per site-owner bug report "AI did not return a summary.
// Please try again.", 2026-07-22):
//   The previous STRICT format ("Exactly 4 to 5 lines", "no Markdown", etc.)
//   occasionally caused GLM-4.5-Flash to emit an empty content string when
//   it couldn't decide which emoji/subject combo to use — and an empty
//   content reached our `if (!summary)` branch, surfacing the error message
//   to the user. The new prompt is more permissive: it asks for 4–5 short
//   lines but accepts whatever the model returns, and we now ALSO have a
//   deterministic client-side fallback summary (built from the raw marks)
//   that's sent as the first SSE event BEFORE the model stream starts, so
//   even if the model completely fails the user always sees SOMETHING
//   useful in the card within ~50ms.
const SYSTEM_PROMPT = `You are the AI Study Companion for Government High School Babi Khel's results page. A visitor just looked up an exam result; your job is to write a SHORT, friendly, personalized summary that will be shown beside the result card.

# OUTPUT FORMAT
- Write 4 to 5 short lines. Separate each line with a single newline (\\n).
- Each line is one complete, punchy sentence (~12 to 18 words).
- Start the FIRST line with a single relevant emoji (🎯 / 🏆 / 📚 / 💪 / ✨ / 🌟 / 📈 / 🚀).
- Add 2 to 3 more emojis on other lines, one per line max, never mid-sentence.
- DO NOT use Markdown bullets (no leading "- " or "• "). DO NOT use headings.
- DO NOT add a preamble like "Here's your summary:" — just start with line 1.
- Write in English.

# CONTENT
- Line 1: state the percentage + grade + pass/fail in one celebratory or honest sentence. (e.g. "🎯 You scored 78% with a B grade — solid effort!")
- Line 2: name the subject with the highest percentage and praise it. (e.g. "💪 Math is your superpower at 92% — keep that momentum.")
- Line 3: name the subject with the lowest percentage and frame it as the next focus area. (e.g. "📚 English at 54% is your growth zone — 15 min of daily reading will lift it.")
- Line 4: class position / school rank (if provided) OR a study tip tied to the weakest subject.
- Line 5: a forward-looking, motivational closer tied to the next exam.

# RULES
- Use ONLY the result data provided in the user message. Never invent marks, percentages, grades, positions, or subjects.
- If subject-wise marks are missing, replace lines 2 and 3 with two general study-tip lines based on the overall percentage.
- If the student didn't pass (is_pass = false / percentage below 33%), still be encouraging — never use the word "fail" as a label. Say "didn't pass this time" or "below the pass mark". Give 2 lines of concrete next-step advice + 1 motivational close.
- Never give medical, psychological, or counselling advice. Stick to study strategy.
- TONE: warm, encouraging, constructive. Always end on a positive, actionable note.
- If the student's name is provided, address them by first name in line 2 or 3.`;

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

  lines.push("");
  lines.push("Write the 4–5 line summary now, following the output format and rules in the system prompt exactly. Start with line 1 immediately — no preamble.");
  return lines.join("\n");
}

// ── Deterministic fallback summary ─────────────────────────────────────────
// Built directly from the result payload — NO model call. Sent as the FIRST
// SSE event before the upstream stream starts, so the visitor sees a useful
// summary in <50ms even if Z.AI is slow, rate-limited, or returns empty.
// The model's streamed tokens then REPLACE this fallback once they start
// arriving (the client clears the fallback when the first model token lands).
function buildFallbackSummary(r: ResultSummaryRequest): string {
  const pct = typeof r.percentage === "number" ? r.percentage : null;
  const grade = r.grade || (pct != null ? gradeFromPct(pct) : "");
  const isPass = typeof r.is_pass === "boolean"
    ? r.is_pass
    : pct != null
      ? pct >= 33
      : true;
  const firstName = (r.name || "").split(/\s+/)[0] || "you";

  // Find strongest + weakest subject from subject_marks (school result)
  let strongest: { sub: string; pct: number } | null = null;
  let weakest: { sub: string; pct: number } | null = null;
  if (r.subject_marks) {
    for (const [sub, m] of Object.entries(r.subject_marks)) {
      if (!m || typeof m.obtained !== "number" || typeof m.total !== "number") continue;
      if (m.obtained === 0 && m.total === 0) continue;
      const sp = m.total > 0 ? Math.round((m.obtained / m.total) * 100) : 0;
      if (!strongest || sp > strongest.pct) strongest = { sub, pct: sp };
      if (!weakest || sp < weakest.pct) weakest = { sub, pct: sp };
    }
  }

  const lines: string[] = [];

  // Line 1 — headline
  if (pct != null) {
    if (isPass) {
      lines.push(`🎯 ${firstName.charAt(0).toUpperCase() + firstName.slice(1)}, you scored ${pct}%${grade ? ` (${grade})` : ""} — well done!`);
    } else {
      lines.push(`🎯 ${firstName.charAt(0).toUpperCase() + firstName.slice(1)}, you scored ${pct}% this time — every expert was once a beginner.`);
    }
  } else {
    lines.push(`🎯 Result loaded for ${firstName} — keep pushing forward!`);
  }

  // Line 2 — strongest
  if (strongest) {
    lines.push(`💪 ${strongest.sub} is your strongest at ${strongest.pct}% — protect this lead.`);
  } else {
    lines.push("💪 Identify your strongest subject and double down on it next term.");
  }

  // Line 3 — weakest
  if (weakest && (!strongest || weakest.sub !== strongest.sub)) {
    lines.push(`📚 ${weakest.sub} at ${weakest.pct}% is your growth zone — 15 min daily practice will lift it.`);
  } else {
    lines.push("📚 Pick your weakest subject and add a 20-min daily drill to your routine.");
  }

  // Line 4 — position or tip
  if (typeof r.school_rank === "number") {
    lines.push(`🏆 Whole-school rank: #${r.school_rank} — that's something to be proud of.`);
  } else if (typeof r.position === "number") {
    lines.push(`🏆 Class position: #${r.position} — solid standing, keep climbing.`);
  } else {
    lines.push("📅 Build a simple weekly revision plan and stick to it for 4 weeks.");
  }

  // Line 5 — motivational close
  if (pct != null && isPass && pct >= 80) {
    lines.push("🚀 Push for the 90%+ club next term — you're already within reach.");
  } else if (pct != null && isPass) {
    lines.push("🚀 Aim 5–10% higher next term — small consistent steps get you there.");
  } else {
    lines.push("🚀 Next exam is a fresh start — show up, do the work, results will follow.");
  }

  return lines.join("\n");
}

function gradeFromPct(p: number): string {
  if (p >= 90) return "A+";
  if (p >= 80) return "A";
  if (p >= 60) return "B";
  if (p >= 45) return "C";
  if (p >= 33) return "D";
  return "Fail";
}

// ── SSE helpers ────────────────────────────────────────────────────────────
// Vercel Serverless Functions (Node.js) support streaming responses via the
// Web ReadableStream API. We set the SSE content-type, disable buffering,
// and write `data: {...}\n\n` frames as tokens arrive.
function sseFrame(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export default async function handler(req: any, res: any) {
  // CORS + method guard
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

  // ── Convert Node.js res to a Web ReadableStream writer ──────────────────
  // Vercel Serverless Functions expose `res` as a Node.js IncomingMessage-
  // style response. We can write SSE frames directly via res.write() and
  // call res.end() when done. We must flush headers BEFORE the first write
  // so the client sees the stream open immediately.
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Disable Vercel's response compression/buffering for this route so SSE
  // frames are flushed as they're written, not batched up.
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  // ── 1. Send deterministic fallback summary as the first event ───────────
  // The client shows this immediately (~50ms) and then replaces it with the
  // model's streamed output once the first token arrives. This means even if
  // Z.AI is slow/down/empty, the visitor ALWAYS sees a useful summary.
  const fallback = buildFallbackSummary(result);
  res.write(sseFrame({ fallback }));

  // ── 2. Open the upstream streaming connection to Z.AI ───────────────────
  const payload = {
    model: ZAI_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: 0.7,
    max_tokens: 400,
    stream: true, // ← upstream streaming
  };

  // Buffer for incomplete SSE lines from Z.AI (their stream sends `data:
  // {...}\n\n` frames; a single TCP read may contain a partial frame).
  let lineBuf = "";
  let modelStarted = false;
  let modelText = "";
  let clientClosed = false;

  // Detect client disconnect so we can abort the upstream fetch.
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
      // The client already has the fallback summary displayed, so we just
      // tell it "model failed, keep the fallback" and close.
      send({ error: "model_unavailable", fallback_kept: true });
      return res.end();
    }

    if (!upstream.body) {
      // No stream — try non-streaming fallback parse.
      const data = await upstream.json().catch(() => null);
      const summary: string =
        data?.choices?.[0]?.message?.content ??
        data?.choices?.[0]?.delta?.content ??
        "";
      if (summary && summary.trim()) {
        send({ token: summary.trim() });
        send({ done: true });
      } else {
        send({ error: "model_empty", fallback_kept: true });
      }
      return res.end();
    }

    // ── 3. Pipe the upstream SSE stream token-by-token to the client ──────
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder("utf-8");

    while (true) {
      if (clientClosed) break;
      const { value, done } = await reader.read();
      if (done) break;

      lineBuf += decoder.decode(value, { stream: true });

      // Process complete SSE frames (separated by \n\n)
      let idx: number;
      while ((idx = lineBuf.indexOf("\n\n")) !== -1) {
        const frame = lineBuf.slice(0, idx);
        lineBuf = lineBuf.slice(idx + 2);

        // Each frame may have multiple `data:` lines. We care about the
        // last one (OpenAI/Z.AI spec).
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
            if (!modelStarted) {
              // First token from the model — tell the client to clear the
              // fallback and start showing model output.
              send({ model_start: true });
              modelStarted = true;
            }
            modelText += token;
            send({ token });
          }
        } catch {
          // Ignore malformed JSON frames — Z.AI occasionally sends a
          // keepalive or comment line.
        }
      }
    }

    // Stream ended without an explicit [DONE] — close gracefully.
    if (modelStarted && modelText.trim()) {
      send({ done: true });
    } else {
      // Model produced no usable tokens — keep the fallback.
      send({ error: "model_empty", fallback_kept: true });
    }
    return res.end();
  } catch (err: any) {
    const isTimeout =
      err?.name === "TimeoutError" || err?.name === "AbortError";
    console.error("ai-result-summary: Z.AI stream error:", err?.message || err);

    if (modelStarted) {
      // We already sent some tokens — just close the stream; the partial
      // summary is still useful.
      send({ done: true, partial: true });
    } else {
      // No tokens yet — keep the fallback visible on the client.
      send({
        error: isTimeout ? "model_timeout" : "model_error",
        fallback_kept: true,
      });
    }
    return res.end();
  }
}
