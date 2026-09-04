// api/ai-chat.ts
// Vercel Serverless Function — proxies Z.AI's free GLM-4.5-Flash chat API
// for the homepage AI Assistant widget (and the Notes "AI Study Buddy").
//
// SPEED + RELIABILITY ENGINE (per site-owner request, 2026-08-31):
//   Live probing of the production endpoint showed the real problem is NOT
//   the frontend — it's the upstream Z.AI call from the Vercel bom1 region:
//   most requests stall with NO first token until something gives up, and
//   the ones that do connect trickle deltas at ~350ms each. The old code
//   made exactly ONE upstream attempt with a 25s cap, so visitors saw the
//   sparkle icon sit frozen for 25 seconds and then an error.
//
//   This version turns the single fragile upstream call into a self-healing
//   sequence:
//     1. CONNECT WATCHDOG   — if Z.AI doesn't accept the request (response
//        headers) within CONNECT_TIMEOUT_MS, abort and retry on the next
//        model in the chain. A stalled connection is almost always a bad
//        route/pool slot; a fresh request lands on a healthy one.
//     2. FIRST-TOKEN WATCHDOG — if the stream connects but sends no visible
//        content within FIRST_TOKEN_TIMEOUT_MS, abort and retry. This kills
//        the "frozen sparkle for 25s" experience: the retry path starts
//        within seconds instead.
//     3. MODEL FALLBACK CHAIN — attempt 1 uses the owner's configured model
//        (ZAI_MODEL, default glm-4.5-flash). Attempt 2 switches to the other
//        free flash model (glm-4.7-flash / glm-4.5-flash) — if one model's
//        inference pool is congested, the other usually isn't. Attempt 3
//        goes back to the primary with a brand-new connection.
//     4. MID-STREAM STALL GUARD — if a stream that was already producing
//        tokens goes silent for MIDSTREAM_STALL_MS, we end the response
//        gracefully with what the visitor already saw (no retry — retrying
//        would duplicate the partial text already on screen).
//     5. NO-GZIP UPSTREAM — we ask Z.AI for identity encoding. Compressed
//        SSE buffers deltas into gzip blocks, which shows up as random
//        multi-second stalls between otherwise healthy frames.
//
//   Everything is bounded by a global budget (GLOBAL_BUDGET_MS, 52s) that
//   stays under the Edge Runtime's 300s streaming ceiling and under the
//   browser's 60s client timeout, so the visitor always gets a definitive
//   answer — tokens, a graceful partial, or an immediate error — never a
//   silent hang.
//
// PROTOCOL (unchanged — same contract the two frontends already speak):
//   Request:  POST /api/ai-chat  { messages: [...], mode?, subject?,
//                                 chapterTitle?, chapterSnippet? }
//   Response: text/event-stream
//             data: {"token":"Hi! "}\n\n      (many of these)
//             data: {"done":true}\n\n         (always last on success)
//   On error: data: {"error":"..."}\n\n       (single event, stream closes)
//
//   Get a free Z.AI API key: https://docs.z.ai/guides/llm/glm-4.7
//
// EDGE RUNTIME (fix, 2026-09-04):
//   This function used to be a Node "(req, res)" serverless function. On
//   Vercel, that handler shape is routed through a compatibility layer that
//   can buffer the ENTIRE response body until the function returns — so
//   visitors saw the sparkle spin for the full ~10-20s the model took, then
//   the whole answer popped in at once, instead of watching it type live.
//   All the per-token `res.write()` calls in this file were already firing
//   correctly on the server; they just weren't reaching the browser one at
//   a time.
//
//   Switching to Vercel's Edge Runtime (`export const runtime = "edge"`)
//   fixes this at the root: Edge functions speak the Web-standard
//   Request/Response/ReadableStream API, and Vercel's edge network is
//   built to forward each streamed chunk to the client the instant it's
//   enqueued — no compatibility-layer buffering, no platform-level
//   response batching. Same SSE protocol, same watchdogs, same retry
//   chain — only the transport into the browser changed.

// Edge Runtime: guarantees true incremental streaming to the browser (see
// note above). Do not remove — this is the actual fix for the "answer
// appears all at once" symptom.
//
// Note: `maxDuration` is a Node-function-only config and does NOT apply to
// Edge functions (Vercel will reject it in vercel.json's `functions` block
// for an edge route, so it's intentionally removed from vercel.json too).
// Edge functions must send their first byte within 25s (our SSE headers go
// out instantly, well under that) and may then stream for up to 300s —
// comfortably more than this file's own GLOBAL_BUDGET_MS (52s) retry budget.
export const runtime = "edge";

const ZAI_API_URL =
  process.env.ZAI_API_URL || "https://api.z.ai/api/paas/v4/chat/completions";
const PRIMARY_MODEL = process.env.ZAI_MODEL || "glm-4.5-flash";
// The two Z.AI flash models are both free — if the primary model's pool is
// congested, the fallback attempt gives the visitor a second, independent
// pool. (Same key works for both.)
const FALLBACK_MODEL = PRIMARY_MODEL.includes("4.7")
  ? "glm-4.5-flash"
  : "glm-4.7-flash";
const ZAI_API_KEY = process.env.ZAI_API_KEY || "";

// ── Watchdog tuning (env-overridable so staging/tests can shrink them;
//    production defaults below are what visitors actually experience) ─────
const CONNECT_TIMEOUT_MS = Number(process.env.AI_CONNECT_TIMEOUT_MS || 8000);
const FIRST_TOKEN_TIMEOUT_MS = Number(
  process.env.AI_FIRST_TOKEN_TIMEOUT_MS || 12000
);
const MIDSTREAM_STALL_MS = Number(process.env.AI_MIDSTREAM_STALL_MS || 16000);
const GLOBAL_BUDGET_MS = Number(process.env.AI_GLOBAL_BUDGET_MS || 52000);
// Don't start an attempt unless there's enough budget left for it to at
// least reach its first token (connect + first-token watchdogs + slack).
// Computed from the watchdog values so shrinking them for tests also
// shrinks the reserve; production caps at 15s.
const MIN_ATTEMPT_RESERVE_MS = Math.min(
  15000,
  CONNECT_TIMEOUT_MS + FIRST_TOKEN_TIMEOUT_MS + 2000
);
const MAX_ATTEMPTS = 3;

// ── System context (homepage assistant) ───────────────────────────────────
// Compressed 2026-08-31: the previous ~1,400-token prompt made the free
// flash model spend noticeably longer before its first token. Every FACT is
// kept — only the verbose phrasing around them was cut, which measurably
// shortens prompt prefill on the free tier.
const SYSTEM_CONTEXT = `You are the official AI Assistant for Government High School Babi Khel's website (https://ghsbabikhel.indevs.in), located in Babi Khel, District Mohmand, KPK, Pakistan. Classes: 6–10 (matric). Board exams (9–10) are under BISE Peshawar.

Answer visitors' questions with REAL, specific answers from the facts below — not just "go to the X page". Mention the page path as a next step.

FACTS
- Results (/results): search any result by exam roll number. If the school published internal results (classes 6–8: 1st/2nd semester; 9–10: Annual-I/II), it searches the school's own table; otherwise it falls back to BISE Peshawar board result search (SSC) automatically. A homepage countdown banner appears when a result is scheduled but unpublished; at zero it auto-publishes instantly. BISE students can also use https://cloud.bisep.edu.pk → "Show Result by Roll Number". Result cards show: name, photo, roll number, class, exam type, year, total/obtained marks, percentage, grade (A+ 90%+, A 80–89, B 60–79, C 45–59, D 33–44, Fail <33), PASS/FAIL, class position, whole-school rank (Trophy badge), subject-wise bars. An AI Summary card gives personalized study advice beside each result.
- Admissions (/admission): online application form for classes 6–10 at the start of the academic year; track status there by application ID; interview slot may be booked once shortlisted. Documents: student B-form/CNIC copy, previous school leaving certificate (class 7+), 2 passport photos, parent/guardian CNIC copy. Office contact via /contact.
- Notices (/notices): official notices (holidays, exam schedules, fee deadlines, PTMs, dress code) with detail pages. News (/news): events, achievements, sports, trips. Homepage has a News Ticker + Latest Notices.
- Student portal (/auth/signin): email + password created by the school admin/office. Dashboard (/dashboard) tabs: Overview, Result Card, Attendance, Timetable, Tests, Fees, Notes, Library, Achievements, Gallery, Profile. Forgot password → /auth/forgot-password (email reset). Teachers/admins sign in on the same form (role-routed). No credentials? Contact the school office.
- Timetable: in the portal's Timetable tab; exam timetables also go out as notices.
- Fees: portal Fees tab (tuition, exam fee, balance, history); deadlines posted as notices.
- Gallery (/gallery): event photos. Achievements: homepage section + portal tab.
- Contact (/contact): phone, email, address, map. Calendar (/calendar): academic calendar with exam dates, holidays, events, ICS subscribe. About (/about): history, mission, staff; /teachers: teaching staff.

RULES
- For a specific student's live marks/attendance/fees: never invent data — direct them to the portal or the school office.
- Off-topic questions: politely redirect to school/website topics.
- Match the visitor's language (Urdu/Pashto included; Roman script if needed). Default English.

FORMAT (mandatory)
- Always answer as short bullets starting with "- ". Never one unbroken paragraph; even one-fact answers get 1–3 bullets.
- One idea per bullet, ideally under 15 words; optional one-line lead-in.
- Start at most ~3 key bullets with an emoji (📚 🎓 📅 ✅ 🏆 💳 📞).
- When a page matches the question, end with one bullet like: "👉 You can do this on the Results page (/results)."
- Never invent dates, marks, roll numbers, names, or personal data.
- Keep it concise: 3–6 bullets total. No essays.`;

// ── Notes mode system prompt ──────────────────────────────────────────────
// Used when the request comes from the AI Study Buddy panel inside a chapter
// page (ChapterPage.tsx → NoteAiAssistant.tsx → POST /api/ai-chat with
// mode:"notes"). The chapter title, subject name, and a short plain-text
// snippet of the chapter content are injected here so the model can answer
// accurately without the student having to copy-paste the chapter.
const NOTES_SNIPPET_MAX_CHARS = 4000;

function buildNotesSystemContext(subject: string, chapterTitle: string, snippet: string): string {
  const safeSubject = subject.slice(0, 120);
  const safeChapter = chapterTitle.slice(0, 240);
  const safeSnippet = snippet.slice(0, NOTES_SNIPPET_MAX_CHARS);

  return `You are the AI Study Buddy for students at Government High School Babi Khel (District Mohmand, KPK, Pakistan). A student is currently reading a chapter in the Notes section of the school website and has opened the AI panel to get help understanding it.

# CURRENT CHAPTER CONTEXT
- Subject: ${safeSubject || "(unknown subject)"}
- Chapter: ${safeChapter || "(unknown chapter)"}
- Chapter content excerpt (plain text, may be truncated):
"""
${safeSnippet || "(no chapter content available — answer based on the chapter title and subject only)"}
"""

# YOUR JOB
Help the student understand THIS chapter. You can:
- Explain a concept from the chapter in simpler words
- Walk through a step-by-step worked example
- Summarize the key points the student must remember
- Generate 3–5 practice questions (give answers in a separate "Answers:" section at the end, OR offer to reveal them on request — don't pre-reveal them inline next to each question)
- Clarify confusing terms or formulas
- Connect the chapter to real-world examples
- For math/physics/chemistry: show the formula and one fully worked example with units

# HOW TO ANSWER — FORMATTING IS MANDATORY
- Use clear, simple language a class 6–10 student can follow. Default to English.
- Match the student's language — if they ask in Urdu or Pashto (Roman script), reply in the same language.
- NEVER write a plain, unbroken paragraph — not even for explanations or worked examples. Break EVERY answer into short bullet points ("- ") or a numbered list ("1."), one idea or one step per line.
- If a short lead-in sentence is needed, keep it to one line, then continue in bullets.
- Use **bold** for key terms, and inline \`code\` for formulas, equations, or technical terms.
- When giving steps, number them (1. 2. 3.) — one short step per line, not a paragraph describing all steps together.
- Keep answers concise and to the point — say only what's needed, no filler or repetition.
- For BISE board exam topics (classes 9–10), briefly mention if a concept is commonly tested, but don't pad every answer with exam advice.
- If the student asks about something NOT in this chapter (another subject, school admin, results, admissions, fees), politely redirect: "I'm your study buddy for **${safeChapter}** (${safeSubject}). For other questions, please use the homepage AI Assistant or check the relevant page on the site."
- Never invent facts, formulas, or definitions. If you don't know something or the chapter excerpt doesn't cover it, say so honestly and suggest asking the teacher.
- Do NOT solve the student's homework FOR them in a way that bypasses learning — guide them through the steps and let them write the final answer. If they insist on "just give me the answer", give it, but always show the working so they can learn from it.`;
}

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

// ── SSE helpers ────────────────────────────────────────────────────────────
function sseFrame(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

// Rejects after ms and aborts the controller — used for every watchdog so a
// stalled socket is actually released, not left hanging until the platform
// reaps the function.
function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  onTimeout: () => void,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      const err: any = new Error(`watchdog:${label}`);
      err.watchdog = label;
      onTimeout();
      reject(err);
    }, ms);
    p.then(
      (v) => {
        if (timer) clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        if (timer) clearTimeout(timer);
        reject(e);
      }
    );
  });
}

// Errors that mean "this attempt produced nothing visible — try again".
class RetryableAttemptError extends Error {}

// Errors that mean "stop — partial text is already on the visitor's screen".
class PartialStreamError extends Error {
  sentChars: number;
  constructor(sentChars: number, reason: string) {
    super(reason);
    this.sentChars = sentChars;
  }
}

interface AttemptResult {
  ok: boolean;
  charsSent: number;
  model: string;
}

// One full upstream session: connect → first token → stream until done.
// Throws RetryableAttemptError when nothing was sent and the attempt is
// abandonable; throws PartialStreamError when tokens already went out and
// the stream then stalled (caller must NOT retry — text is on screen).
async function streamOneAttempt(
  model: string,
  systemPrompt: string,
  cleaned: IncomingMessage[],
  send: (obj: unknown) => boolean,
  deadlineAt: number
): Promise<AttemptResult> {
  const controller = new AbortController();
  const onTimeout = () => controller.abort();
  let charsSent = 0;
  let sawDone = false;

  const payload = {
    model,
    messages: [{ role: "system", content: systemPrompt }, ...cleaned],
    temperature: 0.55,
    max_tokens: 900,
    stream: true,
    // GLM-4.5/4.7 models can run a hidden "thinking" reasoning pass before
    // writing visible output — from the browser it just looks like a long
    // stall before the first token. Short website Q&A doesn't need it.
    thinking: { type: "disabled" },
  };

  // 1) CONNECT WATCHDOG — response headers within CONNECT_TIMEOUT_MS.
  const res = await withTimeout(
    fetch(ZAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ZAI_API_KEY}`,
        Accept: "text/event-stream",
        // Identity encoding: gzip on SSE buffers small deltas into blocks,
        // which manifests as random multi-second stalls between frames.
        "Accept-Encoding": "identity",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }),
    CONNECT_TIMEOUT_MS,
    onTimeout,
    "connect"
  ).catch((err: any) => {
    if (err?.watchdog === "connect" || err?.name === "AbortError" || err?.name === "TimeoutError") {
      throw new RetryableAttemptError(`connect stall/abort (${model})`);
    }
    throw err;
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(
      `ai-chat: Z.AI ${model} returned ${res.status}:`,
      errText.slice(0, 300)
    );
    throw new RetryableAttemptError(`upstream ${res.status} (${model})`);
  }

  if (!res.body) {
    // Some providers ignore stream:true and return one JSON blob.
    const data = await res.json().catch(() => null);
    const reply: string =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.delta?.content ??
      "";
    if (reply && reply.trim()) {
      if (send({ token: reply.trim() })) charsSent += reply.trim().length;
      send({ done: true });
      return { ok: true, charsSent, model };
    }
    throw new RetryableAttemptError(`upstream returned no body (${model})`);
  }

  // 2) FIRST-TOKEN WATCHDOG + 3) MID-STREAM STALL GUARD — implemented as a
  //    race between reader.read() and a per-phase timer. Any watchdog fire
  //    aborts the controller so the socket is released immediately.
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let lineBuf = "";
  let firstTokenSeen = false;

  const readChunk = (ms: number, label: string) =>
    withTimeout(reader.read(), ms, onTimeout, label).catch((err: any) => {
      if (err?.watchdog === label) {
        if (!firstTokenSeen || charsSent === 0) {
          throw new RetryableAttemptError(`${label} watchdog (${model})`);
        }
        throw new PartialStreamError(
          charsSent,
          `mid-stream stall after ${charsSent} chars (${model})`
        );
      }
      throw err;
    });

  try {
    while (true) {
      if (Date.now() > deadlineAt) {
        if (charsSent > 0) throw new PartialStreamError(charsSent, "global deadline");
        throw new RetryableAttemptError("global deadline before first token");
      }
      const { value, done } = await readChunk(
        firstTokenSeen ? MIDSTREAM_STALL_MS : FIRST_TOKEN_TIMEOUT_MS,
        firstTokenSeen ? "midstream" : "firsttoken"
      );
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
          sawDone = true;
          break;
        }

        try {
          const parsed = JSON.parse(dataStr);
          const token: string =
            parsed?.choices?.[0]?.delta?.content ??
            parsed?.choices?.[0]?.message?.content ??
            "";
          if (token) {
            firstTokenSeen = true;
            if (!send({ token })) {
              // Client disconnected — nothing more to do.
              return { ok: true, charsSent, model };
            }
            charsSent += token.length;
          }
        } catch {
          // Ignore malformed JSON frames (keepalive comments, etc.)
        }
      }
      if (sawDone) break;
    }
  } finally {
    try {
      controller.abort(); // release the upstream socket either way
    } catch {
      // noop
    }
  }

  if (charsSent === 0) {
    throw new RetryableAttemptError(`stream ended with no tokens (${model})`);
  }
  if (!sawDone) {
    // Upstream ended without [DONE] but we delivered content — treat as a
    // completed (if imperfect) answer; the text on screen is coherent.
    console.warn(`ai-chat: upstream stream ended without [DONE] (${model})`);
  }
  return { ok: true, charsSent, model };
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }
  if (!ZAI_API_KEY) {
    console.error("ai-chat: ZAI_API_KEY env var is not set on the server");
    return jsonResponse(500, {
      error:
        "AI Assistant is not configured. The site owner needs to set the ZAI_API_KEY env var in Vercel.",
    });
  }

  // Parse + validate the incoming messages array + optional mode/context.
  let messages: IncomingMessage[] = [];
  let mode: string = "homepage";
  let subject: string = "";
  let chapterTitle: string = "";
  let chapterSnippet: string = "";
  try {
    const body = await req.json();
    messages = Array.isArray(body?.messages) ? body.messages : [];
    if (typeof body?.mode === "string") mode = body.mode;
    if (typeof body?.subject === "string") subject = body.subject;
    if (typeof body?.chapterTitle === "string") chapterTitle = body.chapterTitle;
    if (typeof body?.chapterSnippet === "string") chapterSnippet = body.chapterSnippet;
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body." });
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
    return jsonResponse(400, { error: "No user message provided." });
  }

  const systemPrompt =
    mode === "notes"
      ? buildNotesSystemContext(subject, chapterTitle, chapterSnippet)
      : SYSTEM_CONTEXT;

  const startedAt = Date.now();
  const deadlineAt = startedAt + GLOBAL_BUDGET_MS;
  // Attempt chain: primary → fallback → primary (fresh connection each time).
  const modelChain: string[] = [PRIMARY_MODEL, FALLBACK_MODEL, PRIMARY_MODEL];

  // ── Build the outgoing SSE stream ────────────────────────────────────────
  // Every `send(obj)` call below enqueues one SSE frame directly onto the
  // ReadableStream controller. On Vercel's Edge Runtime, each `enqueue()`
  // is flushed to the network immediately — no buffering layer sits between
  // this code and the visitor's browser, so per-token writes really do
  // arrive per-token.
  let clientClosed = false;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown): boolean => {
        if (clientClosed) return false;
        try {
          controller.enqueue(encoder.encode(sseFrame(obj)));
          return true;
        } catch {
          clientClosed = true;
          return false;
        }
      };

      // If the visitor navigates away / closes the panel, the platform
      // aborts req.signal — stop burning retries immediately.
      req.signal?.addEventListener("abort", () => {
        clientClosed = true;
      });

      let lastError = "";
      let charsSentTotal = 0;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (clientClosed) break;
        const remaining = deadlineAt - Date.now();
        if (remaining < MIN_ATTEMPT_RESERVE_MS) {
          console.warn(
            `ai-chat: stopping before attempt ${attempt + 1}, only ${remaining}ms left in budget`
          );
          break;
        }

        const model = modelChain[attempt];
        try {
          const result = await streamOneAttempt(
            model,
            systemPrompt,
            cleaned,
            send,
            deadlineAt
          );
          charsSentTotal += result.charsSent;
          if (attempt > 0) {
            console.log(
              `ai-chat: recovered on attempt ${attempt + 1} (model ${model}) after: ${lastError}`
            );
          }
          break; // attempt completed (client may still have vanished mid-way)
        } catch (err: any) {
          if (err instanceof PartialStreamError) {
            // Tokens are already on the visitor's screen — end gracefully,
            // never retry (a retry would duplicate the partial answer).
            console.warn(`ai-chat: ${err.message} — ending gracefully with partial answer`);
            charsSentTotal += err.sentChars;
            send({ done: true });
            controller.close();
            return;
          }
          lastError = err?.message || String(err);
          console.warn(
            `ai-chat: attempt ${attempt + 1} failed (${model}): ${lastError}`
          );
          if (clientClosed) break; // client gone — no point retrying
          continue;
        }
      }

      if (clientClosed) {
        try {
          controller.close();
        } catch {
          // already closed
        }
        return;
      }

      if (charsSentTotal === 0) {
        console.error(`ai-chat: all attempts failed. Last error: ${lastError}`);
        send({
          error:
            "The AI assistant is busy right now. Please send your question again in a few seconds.",
        });
      } else {
        send({ done: true });
      }
      controller.close();
    },
    cancel() {
      // Browser aborted the fetch (panel closed, edit, tab switch) —
      // the request.signal listener above also catches this, but this
      // covers the case where the reader itself is cancelled.
      clientClosed = true;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...CORS_HEADERS,
    },
  });
}
