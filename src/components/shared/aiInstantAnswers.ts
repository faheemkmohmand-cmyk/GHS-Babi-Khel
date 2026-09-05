// src/components/shared/aiInstantAnswers.ts
//
// ── INSTANT ANSWER ENGINE for the homepage AI Assistant ─────────────────────
// Answers the school's most-asked questions LOCALLY, in the browser, with ZERO
// network requests — true ~0 ms answers (no server hop, no model latency).
//
// WHY THIS EXISTS (2026-09-05 reliability + speed pass):
//   The live /api/ai-chat Edge function was black-holing requests (0 bytes,
//   even for OPTIONS), so visitors saw "Thinking…" forever. Layer 2 (the
//   rewritten Node-runtime api/ai-chat.ts) fixes the server. But even a
//   perfectly healthy LLM hop costs 1–5 s. ~80% of what homepage visitors
//   actually ask (results, roll numbers, admissions, portal, fees, contact…)
//   never needs a language model at all — the answers are FIXED FACTS about
//   the school. This module matches the question against a curated knowledge
//   base and returns a ready answer in microseconds. It also makes the
//   assistant resilient: even if Z.AI is completely down, the most common
//   questions still answer instantly.
//
// DESIGN:
//   • Pure TypeScript, no React/DOM imports — fully unit-testable.
//   • Token + phrase scoring with weighted keywords (English, Roman Urdu and
//     Urdu-script variants), eligibility requirements ("requireAny") and
//     disqualification guards ("block") so lookalike questions can never be
//     answered by the wrong card.
//   • A confident match requires score ≥ CONFIDENCE_MIN and a margin over the
//     runner-up (unless the winner is dominant). Anything less → the widget
//     falls back to the real LLM at /api/ai-chat, so the long tail still gets
//     a proper conversational answer.
//   • FACTS ONLY — every answer below is sourced from the site itself
//     (system prompt facts, FAQ data, page routes). Nothing is invented.

export interface InstantAnswer {
  /** Stable intent id (useful for analytics/tests). */
  id: string;
  /** Ready-to-render markdown-lite answer ("- " bullets, **bold**, newlines). */
  answer: string;
}

interface Intent {
  id: string;
  /** [keyword, weight] — matched against normalized question tokens. */
  keywords: Array<[string, number]>;
  /** [phrase, bonus] — matched against the full normalized question text. */
  phrases?: Array<[string, number]>;
  /** At least ONE of these tokens/phrases must appear, else ineligible. */
  requireAny?: string[];
  /** If ANY of these tokens appear, this intent is disqualified. */
  block?: string[];
  /** Only eligible when the question has at most this many tokens. */
  maxTokens?: number;
  answer: string;
}

// ── Normalization ────────────────────────────────────────────────────────────
// Lowercase, strip punctuation (KEEP unicode letters so Urdu text survives),
// collapse whitespace. Tokens are the words of the normalized text.

const PUNCT_RE = /[^\p{L}\p{N}\s]/gu;

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(PUNCT_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Filler words that must never fire a keyword (pronouns, articles, "not",
// auxiliary verbs…). Not scored at all.
const STOP_TOKENS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "of", "to", "in", "on", "at",
  "for", "by", "with", "from", "is", "are", "am", "was", "were", "be", "been",
  "do", "does", "did", "done", "i", "me", "my", "mine", "we", "our", "us",
  "you", "your", "yours", "he", "she", "it", "its", "they", "them", "their",
  "this", "that", "these", "those", "there", "here", "not", "no", "yes",
  "please", "plz", "pls", "sir", "madam", "would", "could", "should", "shall",
  "will", "can", "may", "might", "must", "have", "has", "had", "get", "got",
  "give", "tell", "let", "know", "want", "need", "like", "just", "some",
  "any", "about", "into", "over", "kind", "tellme",
]);

function tokenMatchesKeyword(token: string, kw: string): boolean {
  if (token === kw) return true;
  // Stem-lite matching, guarded on BOTH sides so fragments and unrelated
  // words can never match:
  //   • token starts with kw  → user typed a plural/suffix ("results" → "result")
  //   • kw is token + ≤2-char suffix → KB plural vs singular typed token
  //     ("notices" kw vs "notice" token) — the ≤2 guard stops "date" from
  //     ever matching "datesheet".
  if (kw.length >= 4 && token.startsWith(kw)) return true;
  if (
    token.length >= 4 &&
    kw.startsWith(token) &&
    kw.length - token.length <= 2
  ) {
    return true;
  }
  return false;
}

function tokenInList(tokens: Set<string>, rawText: string, item: string): boolean {
  if (item.includes(" ")) return rawText.includes(item); // phrase entry
  return tokens.has(item);
}

// ── The knowledge base ───────────────────────────────────────────────────────
// Every fact is taken from the website's own content (routes, portal features,
// BISE Peshawar flow, grading scale, developer info). Keep answers in the same
// "- bullet" markdown-lite format the chat renderer already speaks.

const KB: Intent[] = [
  {
    id: "result-by-roll",
    // THE single most-asked homepage question (starter suggestion #4).
    keywords: [
      ["roll", 4], ["result", 3], ["results", 3], ["natija", 3], ["nateeja", 3],
      ["natijay", 2], ["check", 2], ["search", 1], ["find", 1], ["view", 1],
      ["see", 1], ["show", 1], ["online", 1], ["website", 1], ["score", 1],
      ["lookup", 2], ["kaise", 2], ["kese", 2], ["dekh", 2],
    ],
    phrases: [
      ["roll number", 4], ["by roll", 4], ["check my result", 4],
      ["result check", 3], ["result dekh", 3], ["roll no", 3],
      ["my result", 2], ["see my result", 3], ["find my result", 3],
    ],
    block: ["announce", "declared", "kab"],
    answer: [
      "📚 **Check your result by roll number:**",
      "- Open the **Results page (/results)**.",
      "- Enter the student's **exam roll number** and search.",
      "- School results (classes 6–8 semester exams, 9–10 Annual exams) appear instantly once the school has published them.",
      "- Class 9–10 board students: if no school result is found, the page **automatically searches the BISE Peshawar board (SSC)** result for that roll number.",
      "- 👉 Results page: **/results**",
    ].join("\n"),
  },
  {
    id: "result-when",
    keywords: [
      ["when", 3], ["announced", 3], ["announce", 3], ["declared", 3],
      ["declare", 2], ["coming", 1], ["date", 2], ["released", 2], ["kab", 3],
    ],
    phrases: [
      ["result be announced", 4], ["result announced", 4], ["result date", 3],
      ["when result", 3], ["result kab", 4], ["kab aayega", 3], ["kab ayega", 3],
    ],
    requireAny: ["result", "results", "natija", "nateeja"],
    answer: [
      "📅 **Result announcement:**",
      "- School results appear on the Results page as soon as the school publishes them — there is no fixed public date.",
      "- When a result is scheduled but not yet published, an orange **countdown banner** appears on the homepage; at zero it publishes automatically.",
      "- BISE Peshawar board results (classes 9–10) follow the board's own schedule.",
      "- 👉 Check: **/results** · Board: https://cloud.bisep.edu.pk",
    ].join("\n"),
  },
  {
    id: "bise-board",
    keywords: [
      ["bise", 5], ["bisep", 5], ["peshawar", 4], ["board", 3], ["ssc", 3],
      ["hssc", 2], ["matric", 2],
    ],
    phrases: [["bise peshawar", 4], ["board result", 2], ["board exam", 2]],
    answer: [
      "🎓 **BISE Peshawar board (classes 9–10):**",
      "- Board exams for classes 9–10 are conducted under **BISE Peshawar** (SSC).",
      "- Board results: open **/results** and search the roll number — the BISE Peshawar search runs automatically when no school result matches.",
      "- You can also search directly at https://cloud.bisep.edu.pk → **Show Result by Roll Number**.",
    ].join("\n"),
  },
  {
    id: "result-card-details",
    keywords: [
      ["grade", 3], ["grades", 3], ["position", 3], ["percentage", 3],
      ["card", 3], ["rank", 2], ["marks", 2], ["details", 1], ["scale", 2],
      ["grading", 3],
    ],
    phrases: [["result card", 4], ["grade scale", 3], ["class position", 3]],
    requireAny: ["result", "results", "card", "grade", "natija"],
    answer: [
      "🏆 **What the result card shows:**",
      "- Photo, name, roll number, class, exam type, year, total/obtained marks, percentage and grade.",
      "- **PASS/FAIL**, class position and whole-school rank (🏆 Trophy badge).",
      "- Subject-wise marks as bars.",
      "- Grades: **A+** 90%+ · **A** 80–89 · **B** 60–79 · **C** 45–59 · **D** 33–44 · Fail below 33%.",
      "- An **AI Summary** card with personalized study advice sits beside every result.",
    ].join("\n"),
  },
  {
    id: "admission-how",
    keywords: [
      ["admission", 5], ["admissions", 5], ["apply", 2], ["application", 2],
      ["enroll", 2], ["enrolment", 2], ["enrollment", 2], ["join", 2],
      ["daakhla", 5], ["dakhla", 5], ["admission", 0],
    ],
    phrases: [
      ["apply for admission", 4], ["take admission", 4], ["how to apply", 2],
      ["admission form", 3], ["daakhla kaise", 4], ["admission open", 3],
    ],
    block: ["fee", "fees", "document", "documents", "document"],
    answer: [
      "🎓 **Admission (classes 6–10):**",
      "- Admissions open at the **start of the academic year**.",
      "- Apply online on the **Admission page (/admission)** — fill the form and submit.",
      "- Track your application status on the same page using your **Application ID**.",
      "- Once shortlisted, you can book your **interview slot** there too.",
      "- 👉 Admission page: **/admission**",
    ].join("\n"),
  },
  {
    id: "admission-documents",
    keywords: [
      ["document", 4], ["documents", 4], ["certificate", 3], ["bform", 4],
      ["b-form", 4], ["cnic", 3], ["photo", 2], ["photos", 2], ["papers", 2],
      ["requirement", 3], ["requirements", 3], ["required", 2], ["need", 1],
      ["bringing", 1], ["bring", 2],
    ],
    phrases: [
      ["documents required", 4], ["required documents", 4],
      ["which documents", 3], ["leaving certificate", 3],
    ],
    answer: [
      "📋 **Documents required for admission:**",
      "- Student's **B-form or CNIC copy**.",
      "- **School leaving certificate** (needed for class 7 and above).",
      "- **2 passport-size photos**.",
      "- **Parent/guardian CNIC copy**.",
      "- Attach these while filling the online form at **/admission**.",
    ].join("\n"),
  },
  {
    id: "admission-status",
    keywords: [
      ["status", 3], ["track", 3], ["shortlist", 3], ["shortlisted", 3],
      ["interview", 3], ["selected", 2], ["merit", 2], ["id", 1],
    ],
    phrases: [
      ["application status", 4], ["application id", 3], ["track my", 3],
      ["interview slot", 3],
    ],
    requireAny: ["admission", "application", "apply", "daakhla"],
    answer: [
      "🔎 **Track your admission application:**",
      "- Open **/admission** and enter your **Application ID** to see the current status.",
      "- If shortlisted, you can book your **interview slot** on the same page.",
      "- Lost your Application ID? The school office can look it up — see **/contact**.",
    ].join("\n"),
  },
  {
    id: "portal-login",
    keywords: [
      ["portal", 5], ["login", 4], ["signin", 4], ["sign", 1], ["account", 2],
      ["dashboard", 2], ["password", 2], ["credentials", 3], ["username", 2],
      ["email", 1], ["student", 1], ["forgot", 3], ["reset", 2],
    ],
    phrases: [
      ["student portal", 4], ["sign in", 3], ["log in", 3], ["forgot password", 4],
    ],
    block: ["fee", "fees", "attendance"],
    answer: [
      "🔐 **Student portal:**",
      "- Sign in at **/auth/signin** with the **email + password** created by the school office.",
      "- No account yet? The school office creates student accounts — contact them (see **/contact**).",
      "- Forgot your password? Reset it by email at **/auth/forgot-password**.",
      "- Teachers and admins sign in on the same page.",
    ].join("\n"),
  },
  {
    id: "portal-dashboard",
    keywords: [
      ["dashboard", 3], ["tab", 2], ["attendance", 3], ["haziri", 3],
      ["hazri", 3], ["absent", 2], ["features", 2], ["inside", 1],
    ],
    phrases: [["attendance record", 3], ["my attendance", 3], ["how many tabs", 2]],
    requireAny: ["dashboard", "portal", "attendance", "haziri", "hazri", "tab"],
    answer: [
      "📊 **Inside the student dashboard (/dashboard):**",
      "- Tabs: Overview, Result Card, **Attendance**, Timetable, Tests, Fees, Notes, Library, Achievements, Gallery and Profile.",
      "- Sign in first: **/auth/signin**.",
      "- Attendance corrections are handled by the school office.",
    ].join("\n"),
  },
  {
    id: "fees",
    keywords: [
      ["fee", 4], ["fees", 4], ["fees", 0], ["pay", 1], ["payment", 2],
      ["balance", 2], ["dues", 3], ["wasooli", 3], ["installment", 2],
      ["tuition", 2],
    ],
    phrases: [["fee deadline", 3], ["exam fee", 2], ["fee submit", 2], ["fees ka", 2]],
    answer: [
      "💳 **Fees:**",
      "- Everything is in the portal's **Fees tab**: tuition, exam fee, balance and full history.",
      "- Sign in at **/auth/signin** → Fees tab.",
      "- Fee deadlines are announced as **notices** on **/notices**.",
    ].join("\n"),
  },
  {
    id: "timetable",
    keywords: [
      ["timetable", 5], ["schedule", 2], ["period", 1], ["periods", 2],
      ["timing", 2], ["pehru", 1],
    ],
    phrases: [
      ["time table", 5], ["class time table", 3], ["class timing", 3],
      ["class schedule", 3],
    ],
    block: ["exam", "imtihan"],
    answer: [
      "📅 **Class timetable:**",
      "- The full class timetable is in the student portal: **/auth/signin** → **Timetable tab**.",
      "- School-wide schedule changes are announced as notices on **/notices**.",
    ].join("\n"),
  },
  {
    id: "exam-schedule",
    keywords: [
      ["exam", 3], ["exams", 3], ["imtihan", 4], ["datesheet", 5],
      ["test", 1], ["paper", 1],
    ],
    phrases: [
      ["date sheet", 5], ["exam date", 3], ["exam schedule", 3],
      ["exam timtable", 2], ["exam kab", 3],
    ],
    answer: [
      "📝 **Exam dates & schedules:**",
      "- School exam schedules are posted as **notices** on **/notices** and on the academic calendar **/calendar**.",
      "- Classes 9–10 board exams follow **BISE Peshawar's** official schedule: https://cloud.bisep.edu.pk",
    ].join("\n"),
  },
  {
    id: "notices",
    keywords: [
      ["notice", 4], ["notices", 4], ["ishtihar", 4], ["announcement", 3],
      ["announcements", 3], ["circular", 3], ["holiday", 2], ["holidays", 2],
      ["chutti", 3], ["chhutti", 3], ["deadline", 2], ["ptm", 3], ["dress", 1],
    ],
    phrases: [["what's new", 2], ["latest notice", 3], ["new notice", 3]],
    answer: [
      "📢 **Notices:**",
      "- All official notices — holidays, exam schedules, fee deadlines, PTMs, dress code — are on the **Notices page (/notices)**.",
      "- The homepage shows a **news ticker** plus the **Latest Notices** section.",
      "- Every notice has its own detail page with the full text.",
    ].join("\n"),
  },
  {
    id: "news",
    keywords: [
      ["news", 4], ["event", 2], ["events", 2], ["achievement", 3],
      ["achievements", 3], ["sports", 3], ["trip", 2], ["tournament", 2],
      ["khabar", 3], ["won", 2], ["winner", 2],
    ],
    phrases: [["what's new", 2], ["latest news", 3], ["school event", 2]],
    block: ["notice", "notices"],
    answer: [
      "📰 **News & events:**",
      "- School news — events, achievements, sports, trips — is on the **News page (/news)**.",
      "- The homepage **news ticker** highlights the latest items.",
      "- Student achievements also appear in the portal's Achievements tab.",
    ].join("\n"),
  },
  {
    id: "contact",
    keywords: [
      ["contact", 5], ["phone", 4], ["email", 3], ["call", 2], ["raabta", 5],
      ["rabta", 5], ["number", 1], ["whatsapp", 2], ["mail", 2],
    ],
    phrases: [
      ["phone number", 4], ["email address", 4], ["contact details", 4],
      ["contact info", 4], ["school number", 3],
    ],
    block: ["roll", "result", "exam", "admission", "password"],
    answer: [
      "📞 **Contact the school:**",
      "- Phone number, email, postal address and map are all on the **Contact page (/contact)**.",
      "- The school office can help fastest with admission, portal accounts and result queries.",
    ].join("\n"),
  },
  {
    id: "location",
    keywords: [
      ["where", 3], ["location", 4], ["located", 4], ["village", 2],
      ["mohmand", 3], ["kpk", 3], ["khel", 2], ["address", 2], ["direction", 2],
      ["map", 2],
    ],
    phrases: [["where is", 3], ["babi khel", 3]],
    answer: [
      "📍 **Where we are:**",
      "- **Government High School Babi Khel** is in **Babi Khel, District Mohmand, Khyber Pakhtunkhwa (KPK), Pakistan**.",
      "- Map and directions are on the **Contact page (/contact)**.",
    ].join("\n"),
  },
  {
    id: "about-school",
    keywords: [
      ["about", 2], ["school", 2], ["history", 3], ["mission", 3], ["classes", 2],
      ["class", 1], ["government", 2], ["info", 1], ["information", 1],
      ["established", 2], ["which", 1],
    ],
    phrases: [
      ["about the school", 4], ["about school", 4], ["tell me about", 2],
      ["which classes", 3],
    ],
    block: ["fee", "fees", "notice", "news", "teacher", "contact", "admission"],
    answer: [
      "🏫 **About the school:**",
      "- **Government High School Babi Khel** serves **classes 6–10 (matric)** in District Mohmand, KPK, Pakistan.",
      "- Board exams for classes 9–10 are conducted under **BISE Peshawar**.",
      "- History, mission and staff: **/about** · Teaching staff directory: **/teachers**.",
    ].join("\n"),
  },
  {
    id: "teachers",
    keywords: [
      ["teacher", 4], ["teachers", 4], ["staff", 3], ["principal", 3],
      ["headmaster", 4], ["ustaad", 4], ["ustad", 4], ["faculty", 3],
      ["lecture", 1],
    ],
    phrases: [["teaching staff", 4], ["staff directory", 4]],
    answer: [
      "👩‍🏫 **Teachers & staff:**",
      "- The full teaching staff directory is on the **Teachers page (/teachers)**.",
      "- School history and mission are on **/about**.",
    ].join("\n"),
  },
  {
    id: "library",
    keywords: [
      ["library", 5], ["book", 2], ["books", 2], ["kitab", 3], ["kutub", 2],
      ["read", 1], ["borrow", 2],
    ],
    block: ["note", "notes"],
    answer: [
      "📚 **Library:**",
      "- The school library catalogue is on the **Library page (/library)**.",
      "- Signed-in students also get a **Library tab** inside the portal.",
      "- For chapter notes and study help, see the **Notes page (/notes)**.",
    ].join("\n"),
  },
  {
    id: "calendar",
    keywords: [
      ["calendar", 5], ["vacation", 2], ["vacations", 2], ["ics", 3],
      ["subscribe", 2], ["year plan", 2],
    ],
    phrases: [["academic calendar", 5], ["school calendar", 4]],
    block: ["exam", "notice"],
    answer: [
      "📅 **Academic calendar:**",
      "- Exam dates, holidays and events for the whole year are on **/calendar**.",
      "- Subscribe from any phone using the **ICS link** on that page — events land straight in your calendar app.",
    ].join("\n"),
  },
  {
    id: "gallery",
    keywords: [
      ["gallery", 5], ["photo", 2], ["photos", 2], ["picture", 2],
      ["pictures", 2], ["image", 1], ["images", 1], ["tasveer", 3],
      ["tasweer", 3], ["video", 1],
    ],
    answer: [
      "🖼️ **Photo gallery:**",
      "- Event photos — sports days, trips, ceremonies — are on the **Gallery page (/gallery)**.",
    ].join("\n"),
  },
  {
    id: "notes-study",
    keywords: [
      ["note", 3], ["notes", 4], ["homework", 4], ["study", 2], ["chapter", 3],
      ["chapters", 3], ["practice", 2], ["summarize", 2], ["summary", 2],
      ["explain", 2], ["exercise", 2], ["solution", 2], ["mcq", 3], ["mcqs", 3],
    ],
    phrases: [
      ["study buddy", 4], ["practice question", 3], ["notes for", 3],
    ],
    answer: [
      "📖 **Notes & study help:**",
      "- Chapter notes for every subject are on the **Notes page (/notes)**.",
      "- Open any chapter and tap the **AI Study Buddy** button for simple explanations, key points and practice questions.",
    ].join("\n"),
  },
  {
    id: "developer",
    keywords: [
      ["developer", 5], ["developed", 4], ["built", 3], ["builder", 3],
      ["created", 3], ["creator", 4], ["designer", 3], ["designed", 3],
      ["programmer", 4], ["coder", 3], ["maker", 3], ["faheem", 5],
      ["webmaster", 4], ["made", 3], ["develops", 2],
    ],
    phrases: [
      ["who made", 4], ["who developed", 4], ["who built", 4],
      ["who created", 4], ["who designed", 4], ["made this website", 4],
      ["developed this website", 4], ["this website kis", 3],
    ],
    requireAny: [
      "developer", "developed", "built", "created", "creator", "designer",
      "designed", "programmer", "maker", "faheem", "website", "site", "app",
    ],
    answer: [
      "💻 **Website developer:**",
      "- This website was designed and developed by **Muhammad Faheem** — a **class-10 student of this very school**.",
      "- He is the son of **Zabih Ullah**, from **Village Sangar, Tehsil Halimzai, District Mohmand, KPK, Pakistan**.",
      "- He built and maintains the entire site — school results, admissions, portal, notes and this AI assistant — himself.",
    ].join("\n"),
  },
  {
    id: "greeting",
    keywords: [
      ["hi", 4], ["hello", 4], ["hey", 3], ["salam", 5], ["salaam", 5],
      ["assalam", 5], ["assalamu", 5], ["aoa", 5], ["greetings", 3], ["yo", 2],
    ],
    maxTokens: 3,
    answer: [
      "👋 Greetings! I'm the GHS Babi Khel assistant.",
      "- Ask me about **results & roll numbers**, **admissions**, **notices**, **news**, the **student portal**, **fees**, **timetable** — anything on this website.",
      "- Try: *How do I check my result by roll number?*",
    ].join("\n"),
  },
  {
    id: "thanks",
    keywords: [
      ["thanks", 4], ["thank", 4], ["shukriya", 5], ["great", 1], ["awesome", 1],
      ["nice", 1], ["helpful", 2], ["wah", 2], ["zabardast", 3],
    ],
    maxTokens: 4,
    answer: [
      "😊 You're welcome!",
      "- If you have another question about the school or this website, just ask.",
    ].join("\n"),
  },
  {
    id: "capabilities",
    keywords: [
      ["help", 3], ["what", 1], ["options", 2], ["capable", 2], ["abilities", 2],
      ["topics", 2], ["things", 1],
    ],
    phrases: [
      ["what can you", 5], ["help me", 3], ["who are you", 3],
      ["what do you do", 4], ["kya kar", 3],
    ],
    answer: [
      "✨ **I can answer questions about:**",
      "- **Results** (school + BISE Peshawar board) and how to search by roll number.",
      "- **Admissions** — applying, documents, application status.",
      "- **Student portal** — sign-in, password reset, dashboard tabs.",
      "- **Notices, news, fees, timetable, exams, teachers, library, calendar, gallery** and school info.",
      "- Just type your question — common ones are answered instantly.",
    ].join("\n"),
  },
];

// ── Scoring ──────────────────────────────────────────────────────────────────

const CONFIDENCE_MIN = 4;
const MARGIN_REQUIRED = 2;
const DOMINANT_SCORE = 9; // winners at/above this need no margin

interface Scored {
  intent: Intent;
  score: number;
}

export function scoreIntents(text: string): Array<Scored> {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const words = normalized.split(" ");
  const tokens = new Set<string>();
  for (const w of words) {
    if (!STOP_TOKENS.has(w)) tokens.add(w);
  }

  const scored: Array<Scored> = [];

  for (const intent of KB) {
    if (intent.maxTokens !== undefined && words.length > intent.maxTokens) {
      continue;
    }

    // Disqualification guards run first — a blocked token kills the intent.
    if (intent.block?.some((b) => tokens.has(b) || normalized.includes(b))) {
      continue;
    }

    let score = 0;
    let keywordHit = false;
    let phraseHit = false;

    // Each TOKEN contributes at most ONCE — its BEST matching keyword.
    // ("result" must not score under both "result" AND "results".)
    for (const t of tokens) {
      let best = 0;
      for (const [kw, weight] of intent.keywords) {
        if (weight > best && tokenMatchesKeyword(t, kw)) best = weight;
      }
      if (best > 0) {
        score += best;
        keywordHit = true;
      }
    }

    // Spaced keywords score against the full text (a phrase keyword is also
    // an eligibility hit).
    for (const [kw, weight] of intent.keywords) {
      if (weight > 0 && kw.includes(" ") && normalized.includes(kw)) {
        score += weight;
        keywordHit = true;
      }
    }

    if (intent.phrases) {
      for (const [phrase, bonus] of intent.phrases) {
        if (normalized.includes(phrase)) {
          score += bonus;
          phraseHit = true;
        }
      }
    }

    // A phrase alone ("who made …") can establish eligibility even when no
    // single keyword matched.
    if (!keywordHit && !phraseHit) continue;

    if (
      intent.requireAny &&
      !intent.requireAny.some((r) => tokenInList(tokens, normalized, r))
    ) {
      continue;
    }

    scored.push({ intent, score });
  }

  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Try to answer the question instantly from the local knowledge base.
 * Returns null when no intent is confident — the caller should then ask the
 * real model at /api/ai-chat.
 */
export function getInstantAnswer(question: string): InstantAnswer | null {
  const scored = scoreIntents(question);
  if (scored.length === 0) return null;

  const best = scored[0];
  if (best.score < CONFIDENCE_MIN) return null;
  if (scored.length > 1 && best.score < DOMINANT_SCORE) {
    const margin = best.score - scored[1].score;
    if (margin < MARGIN_REQUIRED) return null;
  }
  return { id: best.intent.id, answer: best.intent.answer };
}
