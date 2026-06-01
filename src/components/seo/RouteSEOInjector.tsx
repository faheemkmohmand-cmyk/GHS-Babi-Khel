import { useLocation, matchPath } from "react-router-dom";
import SEO from "./SEO";
import { SITE_URL } from "./SEO";

interface RouteSEO {
  pattern: string;
  title: string;
  description: string;
  keywords?: string;
  type?: "website" | "article" | "profile";
  noIndex?: boolean;
  hasUrdu?: boolean;
  breadcrumbs?: (params: Record<string, string | undefined>) => { name: string; path: string }[];
  jsonLd?: (params: Record<string, string | undefined>, path: string) => Record<string, any> | Record<string, any>[];
}

const baseBreadcrumb = { name: "Home", path: "/" };

// ─── Reusable schemas ────────────────────────────────────────────────────────

/** FAQPage schema for the Admission page — boosts rich results in Google */
const admissionFAQSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Which classes can apply for admission at GHS Babi Khel?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Fresh admissions are available for Class 6, 7, 8 (middle school) and Class 9. Migration cases are accepted for Class 9 and Class 10 through the BISEP migration process.",
      },
    },
    {
      "@type": "Question",
      name: "What documents are required for admission?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Required documents include: B-Form (NADRA) — mandatory, passport size photo — mandatory, previous result card or marksheet, school leaving certificate (for migration), father's CNIC copy, and migration certificate if applicable.",
      },
    },
    {
      "@type": "Question",
      name: "How can I track my admission application?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "You can track your admission application online by visiting the Admission page and entering your CNIC or application reference number in the Track Application section.",
      },
    },
    {
      "@type": "Question",
      name: "What is the migration process for Class 10?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The Class 10 migration process involves 8 steps: submit online application, write migration letter to current school principal, get principal signature, both principals sign, current school applies migration on BISEP portal, our school approves on BISEP, BISEP generates bank challan, submit fee at bank — migration confirmed.",
      },
    },
    {
      "@type": "Question",
      name: "Is there an online application form available?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes, GHS Babi Khel provides an online admission application form available at https://ghsbabikhel.indevs.in/admission. You can apply directly from your phone or computer.",
      },
    },
    {
      "@type": "Question",
      name: "What is the school address and how can I contact GHS Babi Khel?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "GHS Babi Khel is located in Babi Khel, District Mohmand, Khyber Pakhtunkhwa, Pakistan. You can email at ghsbabkhel@edu.pk or visit the school directly.",
      },
    },
  ],
};

/** Course schema used for online-classes page */
const onlineClassesCourseSchema = {
  "@context": "https://schema.org",
  "@type": "Course",
  name: "GHS Babi Khel Online Classes",
  description:
    "Live and recorded online classes for all subjects — Mathematics, Physics, Chemistry, Biology, English, Urdu, Islamiyat, Pakistan Studies and Computer Science.",
  provider: {
    "@type": "HighSchool",
    "@id": `${SITE_URL}#organization`,
    name: "Government High School Babi Khel",
  },
  url: `${SITE_URL}/online-classes`,
  inLanguage: ["ur", "en"],
  educationalLevel: "Secondary",
  isAccessibleForFree: true,
  hasCourseInstance: {
    "@type": "CourseInstance",
    courseMode: "online",
    inLanguage: "ur",
    courseWorkload: "PT1H",
  },
};

/** Course schema for the Notes section */
const notesCourseSchema = {
  "@context": "https://schema.org",
  "@type": "Course",
  name: "GHS Babi Khel Study Notes",
  description:
    "Subject-wise and chapter-wise study notes for all classes — Mathematics, Physics, Chemistry, Biology, English, Urdu, Islamiyat, Pakistan Studies and Computer Science.",
  provider: {
    "@type": "HighSchool",
    "@id": `${SITE_URL}#organization`,
    name: "Government High School Babi Khel",
  },
  url: `${SITE_URL}/notes`,
  educationalLevel: "Secondary",
  isAccessibleForFree: true,
};

/** Library schema */
const librarySchema = {
  "@context": "https://schema.org",
  "@type": "Library",
  name: "GHS Babi Khel Digital Library",
  description:
    "Digital library of Government High School Babi Khel — textbooks, past papers, notes and educational resources for all classes.",
  url: `${SITE_URL}/library`,
  containedInPlace: {
    "@type": "HighSchool",
    "@id": `${SITE_URL}#organization`,
  },
};

const ROUTES: RouteSEO[] = [
  {
    pattern: "/",
    title: "GHS Babi Khel — Government High School, District Mohmand KPK",
    description:
      "Government High School Babi Khel, District Mohmand, KPK Pakistan. Quality education, notices, news, results, online classes, library and admissions.",
    keywords:
      "GHS Babi Khel, Government High School Babi Khel, Mohmand school, KPK school, school admission, school notices, school results, online classes Pakistan",
    hasUrdu: true,
  },
  {
    pattern: "/about",
    title: "About GHS Babi Khel — History, Mission & Vision | District Mohmand KPK",
    description:
      "Learn about Government High School Babi Khel — our history since 2018, mission, vision, faculty and commitment to quality education in District Mohmand.",
    keywords: "about GHS Babi Khel, school history, school mission, school vision, Mohmand education",
    breadcrumbs: () => [baseBreadcrumb, { name: "About", path: "/about" }],
    jsonLd: () => ({
      "@context": "https://schema.org",
      "@type": "AboutPage",
      name: "About GHS Babi Khel",
      url: `${SITE_URL}/about`,
      about: { "@id": `${SITE_URL}#organization` },
    }),
  },
  {
    pattern: "/teachers",
    title: "Teachers & Faculty — GHS Babi Khel | District Mohmand KPK",
    description:
      "Meet the qualified teachers and faculty of GHS Babi Khel — dedicated educators shaping the future of students in District Mohmand, KPK.",
    keywords: "GHS Babi Khel teachers, faculty, qualified educators, school staff KPK",
    breadcrumbs: () => [baseBreadcrumb, { name: "Teachers", path: "/teachers" }],
  },
  {
    pattern: "/notices",
    title: "School Notices & Announcements — GHS Babi Khel",
    description:
      "Browse the latest school notices, urgent announcements, academic updates and event information from Government High School Babi Khel.",
    keywords: "school notices, announcements, urgent notices, academic updates, GHS Babi Khel notices",
    breadcrumbs: () => [baseBreadcrumb, { name: "Notices", path: "/notices" }],
  },
  {
    pattern: "/news",
    title: "News & Updates — GHS Babi Khel | District Mohmand",
    description:
      "Read the latest news, stories and achievements from Government High School Babi Khel — events, sports, academics and student success.",
    keywords: "school news, GHS Babi Khel news, school events, school stories, student achievements",
    breadcrumbs: () => [baseBreadcrumb, { name: "News", path: "/news" }],
  },
  {
    pattern: "/results",
    title: "Exam Results — GHS Babi Khel | Annual & Term Results",
    description:
      "View annual and term examination results for all classes at GHS Babi Khel. Check student performance, position and grade reports.",
    keywords: "school results, exam results, annual results, term results, GHS Babi Khel results",
    breadcrumbs: () => [baseBreadcrumb, { name: "Results", path: "/results" }],
    jsonLd: () => ({
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: "GHS Babi Khel Exam Results",
      description: "Annual and term examination results for all classes at Government High School Babi Khel.",
      url: `${SITE_URL}/results`,
      creator: { "@id": `${SITE_URL}#organization` },
    }),
  },
  {
    pattern: "/result-card",
    title: "Result Card — GHS Babi Khel Student Performance Report",
    description:
      "Download or view your detailed student result card from GHS Babi Khel with subject-wise marks, grade and overall performance.",
    keywords: "result card, student report, marks sheet, GHS Babi Khel result",
    breadcrumbs: () => [baseBreadcrumb, { name: "Result Card", path: "/result-card" }],
  },
  {
    pattern: "/gallery",
    title: "Photo Gallery — GHS Babi Khel School Events & Activities",
    description:
      "Explore the photo and video gallery of Government High School Babi Khel — events, sports, academic activities and celebrations.",
    keywords: "school gallery, photos, videos, school events, GHS Babi Khel gallery",
    breadcrumbs: () => [baseBreadcrumb, { name: "Gallery", path: "/gallery" }],
    jsonLd: () => ({
      "@context": "https://schema.org",
      "@type": "ImageGallery",
      name: "GHS Babi Khel Photo Gallery",
      url: `${SITE_URL}/gallery`,
      creator: { "@id": `${SITE_URL}#organization` },
    }),
  },
  {
    pattern: "/library",
    title: "Digital Library — GHS Babi Khel | Books, Notes & Past Papers",
    description:
      "Access the digital library of GHS Babi Khel — books, study notes, past papers and educational resources for all classes.",
    keywords: "school library, digital library, study notes, past papers, books, GHS Babi Khel library",
    breadcrumbs: () => [baseBreadcrumb, { name: "Library", path: "/library" }],
    jsonLd: () => librarySchema,
  },
  {
    pattern: "/weather",
    title: "Weather — District Mohmand KPK | GHS Babi Khel",
    description:
      "Live weather forecast for Babi Khel and District Mohmand, KPK — temperature, conditions and outlook for the school community.",
    keywords: "Mohmand weather, Babi Khel weather, KPK weather forecast",
    breadcrumbs: () => [baseBreadcrumb, { name: "Weather", path: "/weather" }],
  },
  {
    pattern: "/online-classes",
    title: "Online Classes — GHS Babi Khel | Live & Recorded Lectures",
    description:
      "Join live online classes and access recorded lectures from GHS Babi Khel — flexible learning anytime, anywhere.",
    keywords: "online classes, live lectures, e-learning, online school Pakistan, GHS Babi Khel online",
    breadcrumbs: () => [baseBreadcrumb, { name: "Online Classes", path: "/online-classes" }],
    // ✅ Course schema — helps Google show this as an educational resource
    jsonLd: () => onlineClassesCourseSchema,
  },
  {
    pattern: "/admission",
    title: "Admissions Open — GHS Babi Khel | Apply Online District Mohmand",
    description:
      "Apply for admission at Government High School Babi Khel — eligibility, fee structure, required documents and online application form.",
    keywords: "school admission, admissions open, apply online, GHS Babi Khel admission, school enrollment",
    breadcrumbs: () => [baseBreadcrumb, { name: "Admissions", path: "/admission" }],
    // ✅ FAQPage schema — boosts rich results showing Q&A directly in Google SERP
    jsonLd: () => admissionFAQSchema,
  },
  {
    pattern: "/notes",
    title: "Study Notes — GHS Babi Khel | Subject-wise Notes & Resources",
    description:
      "Access subject-wise study notes, summaries and chapter resources for all classes at GHS Babi Khel — interactive learning made easy.",
    keywords: "study notes, subject notes, chapter notes, school notes Pakistan, GHS Babi Khel notes",
    breadcrumbs: () => [baseBreadcrumb, { name: "Notes", path: "/notes" }],
    // ✅ Course schema for the notes hub
    jsonLd: () => notesCourseSchema,
  },
  {
    pattern: "/notes/:subject",
    title: "Subject Notes — GHS Babi Khel | Chapter-wise Study Material",
    description:
      "Browse chapter-wise notes and lessons for the selected subject. Comprehensive study material curated for GHS Babi Khel students.",
    keywords: "subject notes, chapters, lessons, study material",
    breadcrumbs: (p) => [
      baseBreadcrumb,
      { name: "Notes", path: "/notes" },
      { name: p.subject || "Subject", path: `/notes/${p.subject}` },
    ],
    // ✅ Course schema per subject
    jsonLd: (p) => ({
      "@context": "https://schema.org",
      "@type": "Course",
      name: `${(p.subject || "Subject").charAt(0).toUpperCase() + (p.subject || "subject").slice(1)} Notes — GHS Babi Khel`,
      description: `Chapter-wise study notes for ${p.subject || "the subject"} — comprehensive learning material for GHS Babi Khel students.`,
      provider: {
        "@type": "HighSchool",
        "@id": `${SITE_URL}#organization`,
        name: "Government High School Babi Khel",
      },
      url: `${SITE_URL}/notes/${p.subject}`,
      educationalLevel: "Secondary",
      isAccessibleForFree: true,
    }),
  },
  {
    pattern: "/notes/:subject/:chapter",
    title: "Chapter Notes — Detailed Study Material",
    description:
      "Read detailed chapter notes, examples and revision content. Interactive study resources for GHS Babi Khel students.",
    keywords: "chapter notes, detailed notes, study material, revision",
    type: "article",
    breadcrumbs: (p) => [
      baseBreadcrumb,
      { name: "Notes", path: "/notes" },
      { name: p.subject || "Subject", path: `/notes/${p.subject}` },
      { name: p.chapter || "Chapter", path: `/notes/${p.subject}/${p.chapter}` },
    ],
    // ✅ Article schema for chapter pages
    jsonLd: (p) => ({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: `${p.chapter || "Chapter"} Notes — ${p.subject || "Subject"} | GHS Babi Khel`,
      description: `Detailed notes for ${p.chapter || "chapter"} in ${p.subject || "subject"} — GHS Babi Khel study material.`,
      url: `${SITE_URL}/notes/${p.subject}/${p.chapter}`,
      author: { "@id": `${SITE_URL}#organization` },
      publisher: { "@id": `${SITE_URL}#organization` },
      educationalLevel: "Secondary",
      inLanguage: "ur",
    }),
  },
  // ── Private / noindex pages ──
  { pattern: "/auth/signin",         title: "Sign In — Student, Teacher & Admin Login",    description: "Sign in to your GHS Babi Khel account.",            noIndex: true },
  { pattern: "/auth/signup",         title: "Create Account — Join GHS Babi Khel Online", description: "Create your GHS Babi Khel account.",                 noIndex: true },
  { pattern: "/auth/forgot-password",title: "Forgot Password — Recover Your Account",     description: "Recover access to your GHS Babi Khel account.",     noIndex: true },
  { pattern: "/auth/reset-password", title: "Reset Password — Set a New Password",        description: "Set a new password for your GHS Babi Khel account.", noIndex: true },
  { pattern: "/dashboard",           title: "Student Dashboard — Your Personal Hub",       description: "Your personalised student dashboard at GHS Babi Khel.", noIndex: true },
  { pattern: "/teacher",             title: "Teacher Dashboard — Manage Classes",          description: "Teacher dashboard at GHS Babi Khel.",               noIndex: true },
  { pattern: "/admin",               title: "Admin Dashboard — School Management",         description: "Administrative console for GHS Babi Khel.",          noIndex: true },
  {
    pattern: "/search",
    title: "Search — GHS Babi Khel",
    description: "Search across notices, news, teachers and notes at Government High School Babi Khel.",
    breadcrumbs: () => [baseBreadcrumb, { name: "Search", path: "/search" }],
  },
  {
    pattern: "/news/:id",
    title: "News Article — GHS Babi Khel",
    description: "Read the latest news from Government High School Babi Khel.",
    type: "article",
    breadcrumbs: () => [baseBreadcrumb, { name: "News", path: "/news" }],
  },
  {
    pattern: "/notices/:id",
    title: "School Notice — GHS Babi Khel",
    description: "Read the full school notice from Government High School Babi Khel.",
    type: "article",
    breadcrumbs: () => [baseBreadcrumb, { name: "Notices", path: "/notices" }],
  },
];

const NOT_FOUND: RouteSEO = {
  pattern: "*",
  title: "Page Not Found (404)",
  description: "The page you are looking for could not be found. Return to GHS Babi Khel home page.",
  noIndex: true,
};

const RouteSEOInjector = () => {
  const location = useLocation();
  const path = location.pathname;

  let matched: RouteSEO | null = null;
  let matchedParams: Record<string, string | undefined> = {};
  for (const r of ROUTES) {
    const m = matchPath({ path: r.pattern, end: true }, path);
    if (m) {
      matched = r;
      matchedParams = m.params as Record<string, string | undefined>;
      break;
    }
  }
  if (!matched) matched = NOT_FOUND;

  // Dynamic title for /notes/:subject — capitalize subject param
  let titleOut = matched.title;
  if (matched.pattern === "/notes/:subject" && matchedParams.subject) {
    const subj = matchedParams.subject.charAt(0).toUpperCase() + matchedParams.subject.slice(1);
    titleOut = `${subj} Notes — GHS Babi Khel | Chapter-wise Study Material`;
  }

  const breadcrumbs = matched.breadcrumbs ? matched.breadcrumbs(matchedParams) : undefined;
  const extraJsonLd = matched.jsonLd ? matched.jsonLd(matchedParams, path) : undefined;

  const webPage = {
    "@context": "https://schema.org",
    "@type": matched.type === "article" ? "Article" : "WebPage",
    name: titleOut,
    description: matched.description,
    url: `${SITE_URL}${path === "/" ? "" : path}`,
    isPartOf: { "@id": `${SITE_URL}#website` },
    ...(matched.type === "article"
      ? {
          headline: titleOut,
          publisher: { "@id": `${SITE_URL}#organization` },
        }
      : {}),
  };

  const jsonLd: Record<string, any>[] = [webPage];
  if (extraJsonLd) {
    if (Array.isArray(extraJsonLd)) jsonLd.push(...extraJsonLd);
    else jsonLd.push(extraJsonLd);
  }

  return (
    <SEO
      title={titleOut}
      description={matched.description}
      keywords={matched.keywords}
      path={path}
      type={matched.type || "website"}
      noIndex={matched.noIndex}
      breadcrumbs={breadcrumbs}
      jsonLd={jsonLd}
      hasUrdu={matched.hasUrdu}
    />
  );
};

export default RouteSEOInjector;
                                         
