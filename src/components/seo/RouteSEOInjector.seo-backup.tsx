import { useLocation, useParams, matchPath } from "react-router-dom";
import SEO from "./SEO";
import { SITE_URL } from "./SEO";

interface RouteSEO {
  pattern: string;
  title: string;
  description: string;
  keywords?: string;
  type?: "website" | "article" | "profile";
  noIndex?: boolean;
  breadcrumbs?: (params: Record<string, string | undefined>) => { name: string; path: string }[];
  jsonLd?: (params: Record<string, string | undefined>, path: string) => Record<string, any> | Record<string, any>[];
}

const baseBreadcrumb = { name: "Home", path: "/" };

const ROUTES: RouteSEO[] = [
  {
    pattern: "/",
    title: "GHS Babi Khel — Government High School, District Mohmand KPK",
    description:
      "Government High School Babi Khel, District Mohmand, KPK Pakistan. Quality education, notices, news, results, online classes, library and admissions.",
    keywords:
      "GHS Babi Khel, Government High School Babi Khel, Mohmand school, KPK school, school admission, school notices, school results, online classes Pakistan",
  },
  {
    pattern: "/about",
    title: "About Our School — History, Mission & Vision",
    description:
      "Learn about Government High School Babi Khel — our history since 2018, mission, vision, faculty and commitment to quality education in District Mohmand.",
    keywords: "about GHS Babi Khel, school history, school mission, school vision, Mohmand education",
    breadcrumbs: () => [baseBreadcrumb, { name: "About", path: "/about" }],
  },
  {
    pattern: "/teachers",
    title: "Our Teachers & Faculty — Qualified Educators",
    description:
      "Meet the qualified teachers and faculty of GHS Babi Khel — dedicated educators shaping the future of students in District Mohmand, KPK.",
    keywords: "GHS Babi Khel teachers, faculty, qualified educators, school staff KPK",
    breadcrumbs: () => [baseBreadcrumb, { name: "Teachers", path: "/teachers" }],
  },
  {
    pattern: "/notices",
    title: "School Notices & Announcements — Latest Updates",
    description:
      "Browse the latest school notices, urgent announcements, academic updates and event information from Government High School Babi Khel.",
    keywords: "school notices, announcements, urgent notices, academic updates, GHS Babi Khel notices",
    breadcrumbs: () => [baseBreadcrumb, { name: "Notices", path: "/notices" }],
  },
  {
    pattern: "/news",
    title: "School News & Stories — Updates from GHS Babi Khel",
    description:
      "Read the latest news, stories and achievements from Government High School Babi Khel — events, sports, academics and student success.",
    keywords: "school news, GHS Babi Khel news, school events, school stories, student achievements",
    breadcrumbs: () => [baseBreadcrumb, { name: "News", path: "/news" }],
  },
  {
    pattern: "/results",
    title: "Exam Results — Annual & Term Results",
    description:
      "View annual and term examination results for all classes at GHS Babi Khel. Check student performance, position and grade reports.",
    keywords: "school results, exam results, annual results, term results, GHS Babi Khel results",
    breadcrumbs: () => [baseBreadcrumb, { name: "Results", path: "/results" }],
  },
  {
    pattern: "/result-card",
    title: "Result Card — Student Performance Report",
    description:
      "Download or view your detailed student result card from GHS Babi Khel with subject-wise marks, grade and overall performance.",
    keywords: "result card, student report, marks sheet, GHS Babi Khel result",
    breadcrumbs: () => [baseBreadcrumb, { name: "Result Card", path: "/result-card" }],
  },
  {
    pattern: "/gallery",
    title: "Photo Gallery — School Events & Activities",
    description:
      "Explore the photo and video gallery of Government High School Babi Khel — events, sports, academic activities and celebrations.",
    keywords: "school gallery, photos, videos, school events, GHS Babi Khel gallery",
    breadcrumbs: () => [baseBreadcrumb, { name: "Gallery", path: "/gallery" }],
  },
  {
    pattern: "/library",
    title: "Digital Library — Books, Notes & Resources",
    description:
      "Access the digital library of GHS Babi Khel — books, study notes, past papers and educational resources for all classes.",
    keywords: "school library, digital library, study notes, past papers, books, GHS Babi Khel library",
    breadcrumbs: () => [baseBreadcrumb, { name: "Library", path: "/library" }],
  },
  {
    pattern: "/weather",
    title: "Local Weather — District Mohmand Forecast",
    description:
      "Live weather forecast for Babi Khel and District Mohmand, KPK — temperature, conditions and outlook for the school community.",
    keywords: "Mohmand weather, Babi Khel weather, KPK weather forecast",
    breadcrumbs: () => [baseBreadcrumb, { name: "Weather", path: "/weather" }],
  },
  {
    pattern: "/online-classes",
    title: "Online Classes — Live Lectures & Recorded Sessions",
    description:
      "Join live online classes and access recorded lectures from GHS Babi Khel — flexible learning anytime, anywhere.",
    keywords: "online classes, live lectures, e-learning, online school Pakistan, GHS Babi Khel online",
    breadcrumbs: () => [baseBreadcrumb, { name: "Online Classes", path: "/online-classes" }],
  },
  {
    pattern: "/admission",
    title: "Admissions Open — Apply to GHS Babi Khel",
    description:
      "Apply for admission at Government High School Babi Khel — eligibility, fee structure, required documents and online application form.",
    keywords: "school admission, admissions open, apply online, GHS Babi Khel admission, school enrollment",
    breadcrumbs: () => [baseBreadcrumb, { name: "Admissions", path: "/admission" }],
  },
  {
    pattern: "/notes",
    title: "Study Notes — Subject-wise Notes & Resources",
    description:
      "Access subject-wise study notes, summaries and chapter resources for all classes at GHS Babi Khel — interactive learning made easy.",
    keywords: "study notes, subject notes, chapter notes, school notes Pakistan",
    breadcrumbs: () => [baseBreadcrumb, { name: "Notes", path: "/notes" }],
  },
  {
    pattern: "/notes/:subject",
    title: "Subject Notes — Chapters & Lessons",
    description:
      "Browse chapter-wise notes and lessons for the selected subject. Comprehensive study material curated for GHS Babi Khel students.",
    keywords: "subject notes, chapters, lessons, study material",
    breadcrumbs: (p) => [
      baseBreadcrumb,
      { name: "Notes", path: "/notes" },
      { name: p.subject || "Subject", path: `/notes/${p.subject}` },
    ],
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
  },
  {
    pattern: "/auth/signin",
    title: "Sign In — Student, Teacher & Admin Login",
    description:
      "Sign in to your GHS Babi Khel account to access your dashboard, results, notes, online classes and personalised features.",
    noIndex: true,
  },
  {
    pattern: "/auth/signup",
    title: "Create Account — Join GHS Babi Khel Online",
    description:
      "Create your GHS Babi Khel account to access notices, results, study notes and online classes after admin approval.",
    noIndex: true,
  },
  {
    pattern: "/auth/forgot-password",
    title: "Forgot Password — Recover Your Account",
    description: "Recover access to your GHS Babi Khel account by resetting your password securely.",
    noIndex: true,
  },
  {
    pattern: "/auth/reset-password",
    title: "Reset Password — Set a New Password",
    description: "Set a new password for your GHS Babi Khel account and regain secure access.",
    noIndex: true,
  },
  {
    pattern: "/dashboard",
    title: "Student Dashboard — Your Personal Hub",
    description: "Your personalised student dashboard at GHS Babi Khel — results, notes, classes and notifications.",
    noIndex: true,
  },
  {
    pattern: "/teacher",
    title: "Teacher Dashboard — Manage Classes & Students",
    description: "Teacher dashboard for managing classes, attendance, homework and student progress at GHS Babi Khel.",
    noIndex: true,
  },
  {
    pattern: "/admin",
    title: "Admin Dashboard — School Management Console",
    description: "Administrative console for managing GHS Babi Khel — users, content, attendance, exams and analytics.",
    noIndex: true,
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

  const breadcrumbs = matched.breadcrumbs ? matched.breadcrumbs(matchedParams) : undefined;
  const extraJsonLd = matched.jsonLd ? matched.jsonLd(matchedParams, path) : undefined;

  const webPage = {
    "@context": "https://schema.org",
    "@type": matched.type === "article" ? "Article" : "WebPage",
    name: matched.title,
    description: matched.description,
    url: `${SITE_URL}${path === "/" ? "" : path}`,
    isPartOf: { "@id": `${SITE_URL}#website` },
    ...(matched.type === "article"
      ? {
          headline: matched.title,
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
      title={matched.title}
      description={matched.description}
      keywords={matched.keywords}
      path={path}
      type={matched.type || "website"}
      noIndex={matched.noIndex}
      breadcrumbs={breadcrumbs}
      jsonLd={jsonLd}
    />
  );
};

export default RouteSEOInjector;
