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

const SYSTEM_CONTEXT = `You are the AI Assistant for Government High School Babi Khel's official website (ghsbabikhel.indevs.in), located in Babi Khel, District Mohmand, KPK, Pakistan. Classes offered: 6 to 10.

Help visitors with: checking results (Results page, roll number lookup, BISE Peshawar fallback), admissions (Admission page), signing in to the student portal, notices, timetable, fee info, gallery, and general navigation of the website (Home, About, Results, Admission, Gallery, Notices, Portal Sign In).

Keep answers short, friendly, and specific to this school and website. If you don't know something (e.g. a student's personal record or live data), tell the user to check the Results page, sign in to their portal, or contact the school office — never invent facts, marks, or dates. If asked something unrelated to the school/website, politely redirect: explain you're the GHS Babi Khel website assistant and can help with school/website questions instead.`;

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
    temperature: 0.4,
    max_tokens: 600,
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
