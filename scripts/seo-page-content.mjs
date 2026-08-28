// ─────────────────────────────────────────────────────────────────────────────
// scripts/seo-page-content.mjs — Build-time crawler-readable page content
//
// PURPOSE
// ───────
// Every public page of the site is a client-rendered React component. When the
// Chromium prerender step cannot run (browser unavailable on a CI builder, or
// a route fails to render), AI/search crawlers would otherwise receive the
// bare 3.3 KB SPA shell — which contains ~60 characters of readable text and
// is exactly the "discoverable but unreadable" problem reported with ChatGPT
// and friends.
//
// This module is the guaranteed floor: for EVERY public route it carries real,
// accurate, crawler-readable HTML (headings, paragraphs, lists, internal
// links) plus per-route <title>/meta description/JSON-LD. The prerender
// pipeline injects this content into the built shell and writes it to
// dist/<route>/index.html whenever (and only whenever) the Chromium render did
// not produce a full page for that route.
//
// FACTS: all school facts below mirror api/llms.js (phone, email, principal,
// EMIS code, BISE Peshawar affiliation, classes 6–10 …) so crawlers never read
// conflicting information. When something about the school changes, update it
// in api/llms.js AND here.
//
// The React app replaces this static block the moment it mounts, so human
// visitors always see the live interactive site.
// ─────────────────────────────────────────────────────────────────────────────

export const SITE_URL = "https://ghsbabikhel.indevs.in";
export const SITE_NAME = "GHS Babi Khel";
export const SITE_LONG_NAME = "Government High School Babi Khel, District Mohmand";

const SCHOOL_FACTS = [
  "Full name: Government High School Babi Khel (GHS Babi Khel)",
  "Location: Babi Khel, District Mohmand, Khyber Pakhtunkhwa (KPK), Pakistan",
  "Established: 2018",
  "EMIS code: 60673",
  "Principal: Mr. Imdad Ullah",
  "Classes offered: 6, 7, 8, 9 and 10 (matriculation)",
  "Board affiliation: BISE Peshawar — classes 9 and 10 sit board examinations",
  "Phone: +92 346 9898295",
  "Email: ghsbabikhel@gmail.com",
];

// Main public navigation — appended to every fallback page as internal links
// so crawlers can discover every section from any single page.
export const NAV_LINKS = [
  ["Home", "/"],
  ["About", "/about"],
  ["Contact", "/contact"],
  ["Admission", "/admission"],
  ["Notices", "/notices"],
  ["News", "/news"],
  ["Results", "/results"],
  ["Result Card", "/result-card"],
  ["Calendar", "/calendar"],
  ["Teachers", "/teachers"],
  ["Notes", "/notes"],
  ["Library", "/library"],
  ["Gallery", "/gallery"],
  ["Online Classes", "/online-classes"],
  ["Duty Roster", "/duty"],
];

const SUBJECTS = [
  ["math", "Mathematics", "arithmetic, algebra, geometry and trigonometry with worked examples, chapter quizzes and flashcards"],
  ["physics", "Physics", "motion, forces, work and energy, waves, electricity and magnetism, with diagrams, solved numericals and quizzes"],
  ["chemistry", "Chemistry", "atomic structure, periodic table, chemical bonding, acids and bases, with solved exercises and quizzes"],
  ["biology", "Biology", "cell biology, human body systems, plants, environment and heredity, with labelled diagrams and quizzes"],
  ["english", "English", "grammar, comprehension, essays, letters and tenses with practice exercises"],
  ["urdu", "Urdu", "grammar (قواعد), essays (مضمون), letters (خط) and comprehension practice"],
  ["islamiat", "Islamiat", "Quranic studies, Ahadees, Islamic history and important questions for exam preparation"],
  ["pakistan-studies", "Pakistan Studies", "history of Pakistan, geography, constitution and economy with exam-focused notes"],
  ["computer", "Computer Science", "computer basics, MS Office, programming logic and internet concepts with practice MCQs"],
];

// ── Per-route content ────────────────────────────────────────────────────────
// blocks: h2 = section heading, p = paragraph, ul = bullet list,
//         links = [label, href] rendered as a list (e.g. latest notices).
const PAGES = {
  "/": {
    title: "GHS Babi Khel — Government High School, District Mohmand KPK",
    description:
      "Official website of Government High School (GHS) Babi Khel, District Mohmand, KPK, Pakistan. Online admission applications, exam results by roll number, notices, news, free study notes, past papers, academic calendar, teacher directory and photo gallery for classes 6 to 10.",
    h1: "Government High School Babi Khel — District Mohmand, KPK",
    blocks: [
      {
        p: [
          "Government High School (GHS) Babi Khel is a government high school in Babi Khel, District Mohmand, Khyber Pakhtunkhwa, Pakistan, established in 2018 (EMIS code 60673). The school offers classes 6 to 10 and is affiliated with BISE Peshawar, the Board of Intermediate and Secondary Education Peshawar, whose examinations our class 9 and 10 students sit every year. Mr. Imdad Ullah is the principal of the school.",
          "This official website is the school's digital front door. Students and parents can apply for admission online, search exam results by roll number, read official notices and school news, download free study notes and past papers, check the academic calendar, browse the teacher directory and view photos of school events. The site also works as a Progressive Web App (PWA), so it can be installed on a phone and used offline.",
        ],
      },
      {
        h2: "What you can do on this website",
        ul: [
          "Apply online for admission to classes 6–10 and track your application status by reference number, B-Form number or contact number",
          "Search school exam results by roll number (1st/2nd semester for classes 6–8; Annual-I/Annual-II for classes 9–10)",
          "Search BISE Peshawar board results (SSC 9th/10th) live from the official board portal",
          "Read official notices — holidays, exam schedules, fee deadlines and parent-teacher meetings",
          "Read school news — events, achievements, sports and competitions",
          "Download free study notes for classes 6–10 in nine subjects",
          "Check the academic calendar, teacher duty roster and staff directory",
        ],
      },
      { h2: "Latest notices", links: { source: "notices", empty: "Open the Notices page for the latest official notices." } },
      { h2: "Latest news", links: { source: "news", empty: "Open the News page for the latest school news." } },
    ],
  },

  "/about": {
    title: "About Us — GHS Babi Khel, District Mohmand",
    description:
      "About Government High School Babi Khel, District Mohmand, KPK: established 2018, EMIS code 60673, principal Mr. Imdad Ullah, classes 6–10, affiliated with BISE Peshawar. Our mission, vision and values.",
    h1: "About GHS Babi Khel",
    blocks: [
      {
        p: [
          "Government High School Babi Khel is a public high school serving Babi Khel and the surrounding villages of District Mohmand, Khyber Pakhtunkhwa, Pakistan. The school was established in 2018 under the Elementary & Secondary Education Department of Khyber Pakhtunkhwa and is registered with EMIS code 60673. It educates students from class 6 through class 10, preparing them for the Secondary School Certificate examinations conducted by BISE Peshawar.",
          "The school serves a rural tribal district, and its mission is to give every child of the area access to qualified teachers, a proper science education and modern learning tools — free of cost, as provided by the Government of Khyber Pakhtunkhwa. Students receive free textbooks under the provincial free textbook scheme, and the school building houses science facilities, a library corner and a playground for sports and assemblies.",
        ],
      },
      {
        h2: "Mission",
        p: [
          "Our mission is to provide quality, accessible and free education to the children of Babi Khel and nearby areas of District Mohmand; to build strong foundations in mathematics, science, languages and computer literacy; and to prepare students to pass their board examinations with confidence and continue on to colleges and universities across Pakistan.",
        ],
      },
      {
        h2: "Vision",
        p: [
          "Our vision is an educated Mohmand: a generation of students from this region who can compete with students anywhere in Pakistan, who respect knowledge and teachers, and who return to serve their community as doctors, engineers, teachers, officers and skilled professionals.",
        ],
      },
      {
        h2: "School facts",
        ul: SCHOOL_FACTS,
      },
    ],
  },

  "/contact": {
    title: "Contact Us — GHS Babi Khel, District Mohmand",
    description:
      "Contact Government High School Babi Khel: phone +92 346 9898295, email ghsbabikhel@gmail.com, Babi Khel, District Mohmand, Khyber Pakhtunkhwa, Pakistan. Contact form, WhatsApp and location map.",
    h1: "Contact GHS Babi Khel",
    blocks: [
      {
        p: [
          "Parents, guardians and students are welcome to contact the school for admission queries, result verification, notices or any other matter. During working days the school office is open in the morning shift; a contact form and WhatsApp option are also available on this page for written queries, and an embedded map shows the school location in Babi Khel, District Mohmand.",
        ],
      },
      {
        h2: "Contact details",
        ul: [
          "School: Government High School Babi Khel",
          "Address: Babi Khel, District Mohmand, Khyber Pakhtunkhwa, Pakistan",
          "Phone: +92 346 9898295",
          "Email: ghsbabikhel@gmail.com",
          "Principal: Mr. Imdad Ullah",
          "Facebook page: https://www.facebook.com/share/1EERTSk1W7/",
        ],
      },
      {
        p: [
          "For admission questions, please first check the Admission page — it explains eligibility, required documents and the online application process, and lets you track an already-submitted application. For exam dates and holidays, see the Notices page and the academic Calendar, which are updated by the school administration throughout the year.",
        ],
      },
    ],
  },

  "/admission": {
    title: "Admission — GHS Babi Khel (Classes 6–10)",
    description:
      "Online admission application for Government High School Babi Khel, District Mohmand — classes 6 to 10. Required documents, application process and online application status tracker.",
    h1: "Admissions at GHS Babi Khel",
    blocks: [
      {
        p: [
          "Admissions at Government High School Babi Khel are open every academic session for classes 6 to 10. Admission is free of charge, as in all government schools of Khyber Pakhtunkhwa. Parents can apply online through the application form on this page — the form issues a reference number that can be used to track the application status on the same website, without visiting the school twice.",
        ],
      },
      {
        h2: "Who can apply",
        ul: [
          "Boys and girls seeking admission to classes 6, 7, 8, 9 or 10",
          "Students migrating from other schools within District Mohmand or from other districts (school leaving certificate required)",
          "Class 9 and 10 students who will appear in BISE Peshawar board examinations as regular candidates",
        ],
      },
      {
        h2: "Required documents",
        ul: [
          "Student B-Form (NADRA)",
          "Passport-size photographs of the student",
          "Previous school result card",
          "School leaving certificate (for migration cases)",
          "Father's CNIC copy (for migration cases)",
        ],
      },
      {
        h2: "How to apply",
        ul: [
          "Fill the online admission form on this page and submit it",
          "Save the reference number shown after submission",
          "Track your application any time by reference number, B-Form number or contact number",
          "Visit the school on the given date to complete verification and enrolment",
        ],
      },
    ],
  },

  "/notices": {
    title: "Notices — GHS Babi Khel, District Mohmand",
    description:
      "Official notices of Government High School Babi Khel — holidays, exam schedules and date sheets, fee deadlines, parent-teacher meetings and urgent announcements for students and parents.",
    h1: "Official Notices",
    blocks: [
      {
        p: [
          "This page lists the official notices of Government High School Babi Khel, District Mohmand. The school administration publishes exam schedules and date sheets, holiday announcements, fee deadlines, parent-teacher meeting dates and other urgent information here. Each notice shows its publication date and category, and urgent notices are highlighted at the top. Open any notice to read the full details.",
        ],
      },
      { h2: "Recent notices", links: { source: "notices", empty: "All current notices are listed on this page." } },
    ],
  },

  "/news": {
    title: "News — GHS Babi Khel, District Mohmand",
    description:
      "News from Government High School Babi Khel — school events, student achievements, sports days, science fairs, competitions and announcements from District Mohmand, KPK.",
    h1: "School News",
    blocks: [
      {
        p: [
          "Read the latest news from Government High School Babi Khel. We publish reports about school events, student achievements in exams and competitions, sports days, science fairs, guest lectures, cultural days and everything that happens around our campus in District Mohmand. Each article shows its publication date and can be opened for the full story with photos.",
        ],
      },
      { h2: "Recent news", links: { source: "news", empty: "All current news articles are listed on this page." } },
    ],
  },

  "/results": {
    title: "Results — Search by Roll Number | GHS Babi Khel",
    description:
      "Search exam results of GHS Babi Khel by roll number — school results for classes 6–10 (1st/2nd semester and Annual exams) plus live BISE Peshawar board results (SSC 9th/10th). Detailed result cards with subject-wise marks.",
    h1: "Exam Results",
    blocks: [
      {
        p: [
          "On this page students of Government High School Babi Khel can search their examination results by roll number. School internal results are available for classes 6 to 8 (1st and 2nd semester exams) and for classes 9 and 10 (Annual-I and Annual-II exams) once the school administration publishes them. The same page can also search BISE Peshawar board results for SSC (9th and 10th class) students — these are fetched live from the official board portal, cloud.bisep.edu.pk.",
        ],
      },
      {
        h2: "How to check your result",
        ul: [
          "Select your exam (class and examination name) on the Results page",
          "Enter your roll number exactly as printed on your admit card",
          "Open the result to see total marks, percentage, grade and subject-wise marks",
          "Use the Result Card page for a printable card with position and grades",
        ],
      },
      {
        h2: "Grading scale",
        ul: [
          "A+ : 90% and above",
          "A : 80–89%",
          "B : 60–79%",
          "C : 45–59%",
          "D : 33–44%",
          "Fail: below 33%",
        ],
      },
    ],
  },

  "/result-card": {
    title: "Result Card — GHS Babi Khel",
    description:
      "Detailed result cards for GHS Babi Khel students — subject-wise marks, grades, percentage, pass/fail status and class position, searchable by roll number and printable as PDF.",
    h1: "Result Card",
    blocks: [
      {
        p: [
          "The Result Card page shows a complete, detailed result card for any published exam of Government High School Babi Khel. Enter the exam, class and roll number to see the student's name, photo, roll number, class and exam year, together with total and obtained marks, percentage, grade, pass or fail status, class position and a subject-wise marks breakdown. The card can be printed or saved as PDF for admission and record purposes.",
        ],
      },
    ],
  },

  "/calendar": {
    title: "Academic Calendar — GHS Babi Khel",
    description:
      "Academic calendar of GHS Babi Khel — exam dates, holidays, school events and important dates for classes 6–10. Subscribe on your phone with the ICS calendar feed.",
    h1: "Academic Calendar",
    blocks: [
      {
        p: [
          "The academic calendar lists the important dates of Government High School Babi Khel: examination dates and schedules, holidays, school events, parent-teacher meetings and activity days. The calendar is maintained by the school administration and updated during the year. Students and parents can subscribe to the calendar on any phone using the ICS feed (calendar.ics), so school events appear directly in their phone's calendar app.",
        ],
      },
    ],
  },

  "/teachers": {
    title: "Teachers — Staff Directory | GHS Babi Khel",
    description:
      "Teaching staff of Government High School Babi Khel, District Mohmand — subject teachers for classes 6–10 with qualifications, and the principal Mr. Imdad Ullah.",
    h1: "Our Teachers",
    blocks: [
      {
        p: [
          "Government High School Babi Khel is staffed by qualified subject teachers appointed through the Khyber Pakhtunkhwa Elementary & Secondary Education Department. The staff directory on this page lists the teaching staff with their subjects and qualifications, led by the principal, Mr. Imdad Ullah. Teachers cover Mathematics, Physics, Chemistry, Biology, English, Urdu, Islamiat, Pakistan Studies and Computer Science for classes 6 to 10.",
        ],
      },
    ],
  },

  "/gallery": {
    title: "Photo Gallery — GHS Babi Khel",
    description:
      "Photo gallery of Government High School Babi Khel — sports day, science fair, annual function, national days, trips and everyday school life in District Mohmand, KPK.",
    h1: "Photo Gallery",
    blocks: [
      {
        p: [
          "Browse photos from Government High School Babi Khel: sports days and tournaments, science fairs and exhibitions, annual prize distributions, national days such as 14 August and Pakistan Day, tree plantation drives, and everyday teaching and learning in our classrooms. Photos are added by the school administration as events take place during the academic year.",
        ],
      },
    ],
  },

  "/library": {
    title: "Library — Downloads & Past Papers | GHS Babi Khel",
    description:
      "Digital library of GHS Babi Khel — free downloadable study materials, books, notes and past papers for classes 6–10, organised by subject and class.",
    h1: "School Library",
    blocks: [
      {
        p: [
          "The digital library page hosts the study resources of Government High School Babi Khel: downloadable books, chapter notes, past papers and helping materials for classes 6 to 10, organised by subject. Students preparing for school exams and BISE Peshawar board examinations can download the materials free of cost and read them offline after installing the site as an app.",
        ],
      },
    ],
  },

  "/online-classes": {
    title: "Online Classes — GHS Babi Khel",
    description:
      "Online class sessions and video lessons of GHS Babi Khel for classes 6–10 — recorded lectures and live sessions arranged by subject teachers.",
    h1: "Online Classes",
    blocks: [
      {
        p: [
          "When regular classes are not possible, the teachers of Government High School Babi Khel share recorded video lessons and arrange live online sessions for their classes. This page lists the available online classes and video lessons by subject and class, so students can keep studying from home and catch up on any lessons they missed.",
        ],
      },
    ],
  },

  "/duty": {
    title: "Duty Roster — GHS Babi Khel",
    description:
      "Teacher duty roster of Government High School Babi Khel — daily assembly, break and dismissal duties plus examination duties for the current week.",
    h1: "Duty Roster",
    blocks: [
      {
        p: [
          "The duty roster shows which teachers of Government High School Babi Khel are assigned to daily responsibilities — assembly supervision, break-time duty and dismissal duty — as well as examination duties during exam weeks. The roster is updated by the school administration and can be checked by staff, students and parents on this page at any time.",
        ],
      },
    ],
  },

  "/notes": {
    title: "Notes — Free Study Notes for Classes 6–10 | GHS Babi Khel",
    description:
      "Free study notes for classes 6–10 of GHS Babi Khel in nine subjects — Math, Physics, Chemistry, Biology, English, Urdu, Islamiat, Pakistan Studies and Computer — with chapter notes, quizzes and flashcards.",
    h1: "Study Notes",
    blocks: [
      {
        p: [
          "The Notes section provides free chapter-wise study notes for every subject taught at Government High School Babi Khel, from class 6 to class 10. Each subject is organised by class and chapter and includes explanations, solved examples, diagrams, practice quizzes and flashcards. Teachers at the school write and maintain the notes, and students can also read them offline after installing the website as an app.",
        ],
      },
      {
        h2: "Available subjects",
        ul: SUBJECTS.map(([, label, what]) => `${label} — ${what}`),
      },
    ],
  },
};

// Subject sub-pages (/notes/<subject>) generated from the subject blurbs.
for (const [slug, label, what] of SUBJECTS) {
  PAGES[`/notes/${slug}`] = {
    title: `${label} Notes (Classes 6–10) — GHS Babi Khel`,
    description: `Free ${label} notes for classes 6–10 of GHS Babi Khel, District Mohmand — chapter-wise explanations, solved examples, practice quizzes and flashcards covering ${what}.`,
    h1: `${label} Notes — Classes 6 to 10`,
    blocks: [
      {
        p: [
          `These are the ${label} notes of Government High School Babi Khel for classes 6 to 10. The notes cover ${what}. Every chapter page includes the full notes, practice questions and interactive quizzes written by the school's ${label} teachers, and all content is free to read and download.`,
          "Choose your class and chapter on the page to open the notes. Students can read the notes online or install the website as an app to use them offline.",
        ],
      },
      { h2: "Other subjects", links: { nav: true } },
    ],
  };
}

// ── HTML builders ────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildContentHtml(route) {
  const page = PAGES[route];
  const parts = [];

  for (const block of page.blocks) {
    if (block.h2) parts.push(`<h2>${escapeHtml(block.h2)}</h2>`);
    if (block.p) for (const para of block.p) parts.push(`<p>${escapeHtml(para)}</p>`);
    if (block.ul)
      parts.push(
        `<ul>${block.ul.map((li) => `<li>${escapeHtml(li)}</li>`).join("")}</ul>`
      );
    if (block.links) {
      // Dynamic lists (latest notices/news) are filled by the prerender lib
      // at build time; here we only render the container marker.
      const src = block.links.source;
      parts.push(`<ul data-ghs-list="${src}"></ul>`);
      parts.push(`<p data-ghs-empty="${src}">${escapeHtml(block.links.empty || "")}</p>`);
      if (block.links.nav) {
        parts.push(
          `<ul>${NAV_LINKS.filter(([label, href]) => href !== route)
            .map(([label, href]) => `<li><a href="${href}">${escapeHtml(label)}</a></li>`)
            .join("")}</ul>`
        );
      }
    }
  }

  // Every fallback page ends with the full public navigation.
  parts.push(`<h2>Website sections</h2>`);
  parts.push(
    `<ul>${NAV_LINKS.filter(([label, href]) => href !== route)
      .map(([label, href]) => `<li><a href="${href}">${escapeHtml(label)}</a></li>`)
      .join("")}</ul>`
  );
  parts.push(
    `<p>Contact: Government High School Babi Khel, District Mohmand, KPK, Pakistan · Phone +92 346 9898295 · Email ghsbabikhel@gmail.com</p>`
  );

  return parts.join("\n      ");
}

export function getPageMeta(route) {
  return PAGES[route] || null;
}

export function buildJsonLd(route) {
  const page = PAGES[route];
  if (!page) return "";
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "EducationalOrganization",
        name: SITE_LONG_NAME,
        alternateName: SITE_NAME,
        url: SITE_URL,
        telephone: "+92 346 9898295",
        email: "ghsbabikhel@gmail.com",
        foundingDate: "2018",
        address: {
          "@type": "PostalAddress",
          addressLocality: "Babi Khel",
          addressRegion: "Khyber Pakhtunkhwa",
          addressCountry: "PK",
        },
      },
      {
        "@type": "WebPage",
        name: page.title,
        description: page.description,
        url: `${SITE_URL}${route === "/" ? "/" : route}`,
        isPartOf: { "@type": "WebSite", name: SITE_LONG_NAME, url: SITE_URL },
      },
    ],
  };
  return JSON.stringify(graph).replace(/</g, "\\u003c");
}

/**
 * Build the complete fallback HTML for one route by taking the BUILT shell
 * (dist/index.html, which already references the hashed CSS + JS bundles)
 * and injecting per-route SEO tags plus the visible static content block
 * inside #root. The React app replaces the block when it mounts.
 */
export function buildFallbackHtml(shellHtml, route, listFiller) {
  const page = PAGES[route];
  if (!page || !shellHtml) return null;

  const canonical = `${SITE_URL}${route === "/" ? "/" : route}`;
  const contentHtml = buildContentHtml(route);

  // Fill dynamic lists (latest notices/news) if the build could reach the DB.
  let html = contentHtml;
  if (listFiller) html = listFiller(html);

  const seoHead = `
    <title>${escapeHtml(page.title)}</title>
    <meta name="description" content="${escapeHtml(page.description)}" />
    <link rel="canonical" href="${canonical}" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:title" content="${escapeHtml(page.title)}" />
    <meta property="og:description" content="${escapeHtml(page.description)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${SITE_URL}/og-image.jpg" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(page.title)}" />
    <meta name="twitter:description" content="${escapeHtml(page.description)}" />
    <script type="application/ld+json">${buildJsonLd(route)}</script>`;

  const staticBlock = `
      <div class="ghs-seo-static" style="max-width:860px;margin:0 auto;padding:32px 20px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#0f172a;background:#ffffff;line-height:1.75">
        <h1 style="font-size:1.7em;line-height:1.25;margin:0 0 18px">${escapeHtml(page.h1)}</h1>
      ${html}
      </div>
      <!-- Static crawler-readable content injected at build time. The React app
           replaces this block with the live interactive page on mount. -->`;

  let out = shellHtml;
  // Replace the shell <title> (the only <title> in the shell).
  out = out.replace(/<title>[\s\S]*?<\/title>/, seoHead);
  // Inject the static content inside #root.
  out = out.replace(
    /<div id="root"><\/div>/,
    `<div id="root">${staticBlock}</div>`
  );
  if (!out.includes("ghs-seo-static")) return null; // injection failed
  return out;
}
