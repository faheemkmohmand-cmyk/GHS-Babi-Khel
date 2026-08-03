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
//   1. Curated vocabulary list + Free Dictionary API
//        (60+ hand-picked educational words that rotate daily via seeded
//         PRNG; looked up via api.dictionaryapi.dev which is free, keyless,
//         and CORS-open — this is the RELIABLE primary source)
//   2. Wordnik "word of the day" (ONLY if WORDNIK_API_KEY env var is set)
//        — https://api.wordnik.com/v4/words.json/wordOfTheDay
//        (Wordnik now requires an API key; without one it returns HTTP 401.
//         If the key is provided, Wordnik is tried before the curated list.)
//   3. Datamuse (word picker) + Free Dictionary (definition lookup)
//        (free, keyless, CORS-open — last-resort fallback)
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
//     source: "curated+dictionary" | "wordnik" | "datamuse+dictionary",
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

// ── Curated vocabulary list ─────────────────────────────────────────
// 60+ hand-picked educational words suitable for a school homepage.
// These rotate deterministically by date so every day shows a different
// word. All are common enough that the Free Dictionary API will have them.
const CURATED_WORDS = [
  "serendipity", "ephemeral", "eloquent", "resilience", "paradigm",
  "ubiquitous", "meticulous", "benevolent", "candid", "diligent",
  "empathy", "fortitude", "gratitude", "harmony", "integrity",
  "jubilant", "kinship", "luminous", "magnanimous", "noble",
  "optimism", "perseverance", "quintessential", "righteous", "sagacious",
  "tenacious", "unalloyed", "vivacious", "whimsical", "xenial",
  "yearning", "zealous", "ambiguous", "benevolence", "catalyst",
  "dexterity", "enigmatic", "fervent", "gregarious", "hypothesis",
  "impeccable", "juxtapose", "keystone", "labyrinth", "metamorphosis",
  "nuance", "omniscient", "panacea", "quizzical", "renaissance",
  "solitude", "tangible", "unequivocal", "versatile", "wisdom",
  "astute", "pragmatic", "conundrum", "melancholy", "nonchalant",
  "oxymoron", "paradox", "phenomenon", "quintessence", "retrospect",
  "scrutinize", "transcend", "auspicious", "bravado", "conundrum",
  "deliberate", "exemplary", "fluctuate", "guise", "hypothesize",
  "illuminate", "jargon", "kismet", "levity", "mirth",
  "nostalgia", "orator", "paramount", "quaint", "reciprocal",
  "substantiate", "theorem", "unprecedented", "venerate", "wanderlust",
  "zenith", "abundance", "acumen", "altruism", "ambition",
  "appraise", "articulate", "assiduous", "audacious", "augment",
];

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

// Pick the word of the day from the curated list using a deterministic
// rotation keyed by date. Same date → same word, every day changes.
function pickCuratedWord(dateKey) {
  const rand = seededRandom(dateKey + "-curated");
  const idx = Math.floor(rand() * CURATED_WORDS.length);
  return CURATED_WORDS[idx];
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
async function fetchJSON(url, label, extraHeaders) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", ...extraHeaders },
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

// ── Source 1: Curated vocabulary + Free Dictionary API ────────────────
// Picks today's word from CURATED_WORDS (deterministic rotation), then
// looks it up via the Free Dictionary API for the full definition +
// phonetics + example. This is the most reliable source — no API key
// needed, no rate-limit issues, always available.
async function fetchFromCurated(dateKey) {
  const word = pickCuratedWord(dateKey);
  const entry = await fetchFromDictionary(word);
  return { ...entry, source: "curated+dictionary" };
}

// ── Source 2: Wordnik Word of the Day (REQUIRES API KEY) ─────────────
// Wordnik now requires an API key. If WORDNIK_API_KEY is not set in the
// environment, this source is skipped entirely (no 401 errors).
// To get a key: https://developer.wordnik.com/ — free tier available.
async function fetchFromWordnik(dateKey) {
  const apiKey = process.env.WORDNIK_API_KEY || "";
  if (!apiKey) {
    throw new Error("Wordnik skipped (no WORDNIK_API_KEY env var)");
  }

  const url = `${WORDNIK_URL}?date=${encodeURIComponent(dateKey)}&api_key=${encodeURIComponent(apiKey)}`;
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

// ── Free Dictionary API (for a known word) ─────────────────────────
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

  // Try candidates SEQUENTIALLY (max 6 attempts) to avoid timeout
  // cascades in serverless environments. The old Promise.all with 12
  // parallel requests could cause all 12 to time out simultaneously
  // under the 10s Vercel function limit.
  const candidates = arr.slice(0, 6);
  for (const w of candidates) {
    try {
      const entry = await fetchFromDictionary(w);
      // Prefer entries that have an example sentence
      if (entry) return { ...entry, source: "datamuse+dictionary" };
    } catch {
      // Try the next candidate
    }
  }
  throw new Error("No Datamuse candidate resolved");
}

// ── Main pipeline ────────────────────────────────────────────────────
async function fetchWordOfDay() {
  const dateKey = todayKeyPKT();
  const hasWordnikKey = !!(process.env.WORDNIK_API_KEY || "");

  // Build the source pipeline based on what's available.
  // If WORDNIK_API_KEY is set → Wordnik first, then curated, then Datamuse.
  // If no Wordnik key    → Curated first (reliable!), then Datamuse.
  const sources = [];

  if (hasWordnikKey) {
    sources.push(() => fetchFromWordnik(dateKey));
  }

  sources.push(() => fetchFromCurated(dateKey));
  sources.push(() => fetchFromDatamuse(dateKey));

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
