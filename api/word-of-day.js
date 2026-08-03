// api/word-of-day.js
// Vercel Serverless Function — returns the English Word of the Day
// (word + phonetic + definition + example) for the homepage.
//
// Why this exists:
//   The homepage previously called api.datamuse.com + api.dictionaryapi.dev
//   directly from the browser. That broke on the deployed site because
//   (a) those domains are NOT whitelisted in the project's CSP
//       `connect-src` (so the browser silently blocked the requests), and
//   (b) they are reachable only intermittently from the school's region.
//   A server-side proxy that has none of those constraints and that caches
//   the answer for the whole day removes both failure modes.
//
//   100% online, NO offline / local fallback, NO guesswork — the endpoint
//   either returns a real definition or a structured error.
//
// Data sources (tried in order; first one that yields a valid entry wins):
//   1. Wordnik "word of the day"  — https://api.wordnik.com/v4/words.json/wordOfTheDay
//        (highest quality, hand-curated by Wordnik editors; free, keyless
//         for the public endpoint, returns word + definitions + examples
//         + partOfSpeech in one round-trip)
//   2. Free Dictionary API       — https://api.dictionaryapi.dev/api/v2/entries/en/<word>
//        (free, keyless, CORS-open)
//   3. Datamuse (word picker) + Free Dictionary (definition lookup)
//        (free, keyless, CORS-open — fallback if the curated WOD has no
//         example for today)
//
// Caching:
//   In-memory cache keyed by YYYY-MM-DD (server's local date in PKT, to
//   match the school's timezone). The chosen word + its full entry is cached
//   for the rest of the day so every visitor gets the same word and we
//   don't hammer the upstream APIs.
//
// Response shape (matches the DictEntry type the React component already
// expects, so the frontend change is minimal):
//   {
//     ok: true,
//     word: "serendipity",
//     phonetics: [{ text: "/ˌsɛ.ɹən.ˈdɪ.pɪ.ti/", audio: "https://..." }],
//     meanings: [
//       {
//         partOfSpeech: "noun",
//         definitions: [
//           { definition: "...", example: "..." , synonyms: [] }
//         ]
//       }
//     ],
//     source: "wordnik" | "dictionaryapi.dev" | "datamuse+dictionary",
//     date: "2026-08-03"
//   }
//
// On failure:
//   HTTP 502 with { ok: false, error: "...", detail: "..." } so the
//   frontend can render its existing "Could not load today's word" UI.

const WORDNIK_URL = "https://api.wordnik.com/v4/words.json/wordOfTheDay";
const DICT_URL = (w) =>
  `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`;
const DATAMUSE_URL =
  "https://api.datamuse.com/words?sp=???????&max=200&md=f";

const FETCH_TIMEOUT_MS = 8000;

// Pakistan Standard Time helper (UTC+5). The school is in Mohmand, KPK.
// We key the daily cache on the PKT date so "today" matches what visitors
// see on the homepage regardless of where the serverless function runs.
function todayKeyPKT() {
  const now = new Date();
  // toLocaleString with timeZone returns a string we can re-parse
  const pktString = now.toLocaleString("en-US", { timeZone: "Asia/Karachi" });
  const d = new Date(pktString);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Seeded PRNG so the candidate word is stable for a given day, but changes
// at midnight.
function seededRandom(key) {
  let seed = 0;
  for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) | 0;
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Per-day in-memory cache. Survives warm invocations on the same instance.
// Key = "YYYY-MM-DD".
const dayCache = new Map(); // dateKey -> { ok, payload, expiresAt }

const DAY_MS = 24 * 60 * 60 * 1000;

function getCachedForToday() {
  const dateKey = todayKeyPKT();
  const entry = dayCache.get(dateKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    dayCache.delete(dateKey);
    return null;
  }
  return entry.payload;
}

function setCachedForToday(payload) {
  const dateKey = todayKeyPKT();
  // Expire just after midnight PKT so the next visitor gets a fresh word.
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 5, 0, 0); // 00:05 PKT — small buffer past midnight
  dayCache.set(dateKey, { payload, expiresAt: tomorrow.getTime() });
}

// Lightweight fetch wrapper with timeout and helpful error messages.
async function fetchJSON(url, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`${label} returned HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`${label} timed out after ${FETCH_TIMEOUT_MS}ms`);
    }
    throw new Error(`${label} failed: ${err.message || err}`);
  } finally {
    clearTimeout(timer);
  }
}

// ── Source 1: Wordnik Word of the Day ────────────────────────────────
// Wordnik returns a curated word + definitions + examples. No API key
// required for the public wordOfTheDay endpoint (rate-limited but fine
// for one call per server instance per day).
async function fetchFromWordnik(dateKey) {
  const url = `${WORDNIK_URL}?date=${encodeURIComponent(dateKey)}`;
  const data = await fetchJSON(url, "Wordnik");

  const word = (data.word || data._word || "").toString().trim().toLowerCase();
  if (!word) throw new Error("Wordnik returned empty word");

  // Wordnik `definitions` is an array of { text, partOfSpeech, ... }
  // Wordnik `examples` is an array of { text, ... }
  const defs = Array.isArray(data.definitions) ? data.definitions : [];
  const examples = Array.isArray(data.examples) ? data.examples : [];

  if (defs.length === 0) {
    // No definitions — try the next source rather than returning garbage.
    throw new Error("Wordnik returned no definitions");
  }

  // Group by partOfSpeech, attach the first available example to the
  // first definition of the first part-of-speech so the UI's "Example"
  // field is reliably filled.
  const byPos = new Map();
  for (const d of defs) {
    const pos = (d.partOfSpeech || "general").toString();
    if (!byPos.has(pos)) byPos.set(pos, []);
    byPos.get(pos).push(d.text || "");
  }

  const firstExample = examples[0]?.text || "";

  const meanings = Array.from(byPos.entries()).map(([partOfSpeech, defsList]) => ({
    partOfSpeech,
    definitions: defsList
      .filter((t) => t)
      .map((text, i) => ({
        definition: text,
        example: i === 0 ? firstExample : "",
        synonyms: [],
      })),
  }));

  // If for some reason the curated entry has no example, force a fall-through
  // to the dictionary API so the UI's example slot is never empty.
  const hasExample = meanings.some((m) =>
    m.definitions.some((d) => d.example)
  );
  if (!hasExample) {
    const enriched = await enrichWithDictionary(word, meanings);
    if (enriched) return { word, meanings: enriched, phonetics: [], source: "wordnik+example" };
  }

  return { word, meanings, phonetics: [], source: "wordnik" };
}

// ── Source 2: Free Dictionary API (for a known word) ─────────────────
async function fetchFromDictionary(word) {
  const data = await fetchJSON(DICT_URL(word), "Dictionary");
  if (!Array.isArray(data) || !data[0]) {
    throw new Error("Dictionary returned no entry");
  }
  const entry = data[0];
  const w = (entry.word || word || "").toString().trim().toLowerCase();
  if (!w) throw new Error("Dictionary entry had no word");

  // Filter out meanings with no definitions
  const meanings = (entry.meanings || [])
    .filter((m) => Array.isArray(m.definitions) && m.definitions.length > 0)
    .map((m) => ({
      partOfSpeech: m.partOfSpeech || "general",
      definitions: m.definitions.map((d) => ({
        definition: d.definition || "",
        example: d.example || "",
        synonyms: Array.isArray(d.synonyms) ? d.synonyms : [],
      })),
    }));

  if (meanings.length === 0) {
    throw new Error("Dictionary entry had no usable meanings");
  }

  // Build the `phonetics` array the frontend expects (matches the
  // Free Dictionary API's native shape, so the React component is
  // unchanged).
  const phonetics = [];
  if (entry.phonetic) phonetics.push({ text: entry.phonetic, audio: "" });
  if (Array.isArray(entry.phonetics)) {
    for (const p of entry.phonetics) {
      if (p && (p.text || p.audio)) phonetics.push(p);
    }
  }

  return { word: w, phonetics, meanings, source: "dictionaryapi.dev" };
}

// ── Optional enrichment: pull a real example from Free Dictionary ────
// Used after Wordnik to add a proper example sentence if Wordnik didn't
// ship one.
async function enrichWithDictionary(word, baseMeanings) {
  try {
    const data = await fetchJSON(DICT_URL(word), "Dictionary");
    if (!Array.isArray(data) || !data[0]) return null;
    const dictMeanings = data[0].meanings || [];

    // For each base meaning, try to find a matching partOfSpeech in the
    // dictionary and graft on the first non-empty example.
    const enriched = baseMeanings.map((m, i) => {
      const match = dictMeanings.find(
        (dm) =>
          (dm.partOfSpeech || "").toLowerCase() ===
          (m.partOfSpeech || "").toLowerCase()
      );
      const firstExample = match?.definitions?.find((d) => d.example)?.example || "";
      const newDefs = m.definitions.map((d, j) => ({
        ...d,
        example: d.example || (j === 0 ? firstExample : ""),
      }));
      return { ...m, definitions: newDefs };
    });
    return enriched;
  } catch {
    return null;
  }
}

// ── Source 3: Datamuse word picker + Dictionary lookup ───────────────
async function fetchFromDatamuse(dateKey) {
  const raw = await fetchJSON(DATAMUSE_URL, "Datamuse");
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("Datamuse returned no words");
  }
  const words = raw
    .map((d) => d && d.word)
    .filter((w) => typeof w === "string" && /^[a-z]+$/.test(w));

  if (words.length === 0) throw new Error("Datamuse returned no valid words");

  // Deterministic shuffle keyed by today
  const arr = [...words];
  const rand = seededRandom(dateKey);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  // Try candidates in parallel (limit 12) until one has a definition
  const candidates = arr.slice(0, 12);
  const results = await Promise.all(
    candidates.map((w) =>
      fetchFromDictionary(w)
        .then((entry) => entry)
        .catch(() => null)
    )
  );
  const valid = results.filter(Boolean);
  if (valid.length === 0) throw new Error("No Datamuse candidate resolved");

  // Prefer one where the FIRST definition of the FIRST meaning has an
  // example sentence — that is the slot the homepage UI shows by default.
  const isRich = (v) => {
    const firstDef = v.meanings?.[0]?.definitions?.[0];
    return !!(firstDef && firstDef.example);
  };
  const rich = valid.find(isRich);
  const withAnyExample = valid.find((v) =>
    v.meanings.some((m) => m.definitions.some((d) => d.example))
  );
  const chosen = rich || withAnyExample || valid[0];
  return { ...chosen, source: "datamuse+dictionary" };
}

// ── Main pipeline ────────────────────────────────────────────────────
async function fetchWordOfDay() {
  const dateKey = todayKeyPKT();

  // Try each source in order; first success wins.
  const sources = [
    () => fetchFromWordnik(dateKey),
    async () => {
      // If Wordnik failed entirely, try the previous day's curated word
      // from the dictionary API as a cheap secondary candidate.
      const d = new Date(dateKey);
      d.setDate(d.getDate() - 1);
      const yesterday = d.toISOString().slice(0, 10);
      try {
        const data = await fetchJSON(`${WORDNIK_URL}?date=${yesterday}`, "Wordnik");
        const word = (data.word || "").toString().trim().toLowerCase();
        if (!word) throw new Error("no word");
        return await fetchFromDictionary(word);
      } catch {
        // Re-throw to let the next source handle it
        throw new Error("Wordnik fallback exhausted");
      }
    },
    () => fetchFromDatamuse(dateKey),
  ];

  const errors = [];
  for (const src of sources) {
    try {
      const result = await src();
      return { ok: true, ...result, date: dateKey };
    } catch (err) {
      errors.push(err.message || String(err));
      // continue to next source
    }
  }

  // All sources failed — surface a structured error.
  const err = new Error("All word-of-the-day sources failed");
  err.detail = errors;
  throw err;
}

// ── HTTP handler ─────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS — same-origin in production, but allow * for dev tools and for
  // direct testing. Safe because the response is a public word+definition.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // ── Sub-route: ?word=<anything> → ad-hoc definition lookup ─────────
  // Used by the homepage "double-click any word to see its definition"
  // popup. Server-side so it works through the project's CSP and from
  // any region. Cached per word for 24h since word definitions don't
  // change.
  const rawWord = (req.query && (req.query.word || req.query.w)) || "";
  if (typeof rawWord === "string" && rawWord.trim().length > 0) {
    return handleWordLookup(req, res, rawWord.trim());
  }

  // Edge cache: 1 hour, with stale-while-revalidate for the rest of the day
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=3600, stale-while-revalidate=82800"
  );

  // Cache hit?
  const cached = getCachedForToday();
  if (cached) {
    return res.status(200).json(cached);
  }

  try {
    const payload = await fetchWordOfDay();
    setCachedForToday(payload);
    return res.status(200).json(payload);
  } catch (err) {
    console.error("[word-of-day] all sources failed:", err.detail || err.message);
    return res.status(502).json({
      ok: false,
      error: "Could not load today's word. Please check your connection.",
      detail: err.detail || err.message || String(err),
    });
  }
}

// ── Sub-handler: arbitrary word definition lookup (for the popup) ───
const wordCache = new Map(); // word -> { payload, expiresAt }
const WORD_TTL_MS = 24 * 60 * 60 * 1000;

function getCachedWord(w) {
  const e = wordCache.get(w);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    wordCache.delete(w);
    return null;
  }
  return e.payload;
}
function setCachedWord(w, payload) {
  wordCache.set(w, { payload, expiresAt: Date.now() + WORD_TTL_MS });
}

async function handleWordLookup(req, res, word) {
  // Reject anything that isn't a simple alphabetic word (plus hyphen /
  // apostrophe for things like "well-known" / "it's"). Defends against
  // SSRF-via-query-string abuse and keeps the URL clean.
  const clean = word.replace(/[^a-zA-Z'\-]/g, "").slice(0, 40);
  if (!clean) {
    return res.status(400).json({ ok: false, error: "Invalid word" });
  }
  const key = clean.toLowerCase();

  // 24h server cache for repeated lookups of the same word
  const cached = getCachedWord(key);
  if (cached) {
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=604800"
    );
    return res.status(200).json(cached);
  }

  try {
    const entry = await fetchFromDictionary(key);
    const payload = { ok: true, ...entry };
    setCachedWord(key, payload);
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=604800"
    );
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(404).json({
      ok: false,
      error: `No definition found for "${key}".`,
      detail: err.message || String(err),
    });
  }
}
