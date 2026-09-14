<div align="center">

# 🎓 GHS Babi Khel — Official School Website

**Government High School Babi Khel** · District Mohmand, Khyber Pakhtunkhwa, Pakistan

[![React 18](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite 5](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Vercel](https://img.shields.io/badge/Vercel-Hosting-000000?logo=vercel&logoColor=white)](https://vercel.com)

**🌐 Live site: [ghsbabikhel.indevs.in](https://ghsbabikhel.indevs.in)**

A modern, offline-capable, SEO-hardened school platform — public website, student & admin dashboards,
AI study tools, a full exam-management suite, admissions, fees and an online notes platform —
built on a 100% free-tier-friendly stack.

</div>

---

## 🏫 About the School

| | |
|---|---|
| **School** | Government High School Babi Khel |
| **EMIS Code** | 60673 |
| **Established** | 2018 |
| **Classes** | 6 – 10 |
| **Board** | BISE Peshawar |
| **Location** | Babi Khel, Tehsil Halimzai, District Mohmand, KPK, Pakistan |
| **Contact** | ghsbabikhel@gmail.com · +92 346 9898295 |

The website is designed, developed and maintained **in-house by a student** (Muhammad Faheem, Class 10)
as a school/community project — see [Credits](#-credits).

---

## 📑 Table of Contents

- [Feature Tour](#-feature-tour)
  - [Public Website](#-public-website)
  - [Notes Platform & Interactive Labs](#-notes-platform--interactive-labs-student-learning-hub)
  - [Student Dashboard](#-student-dashboard)
  - [Admin Dashboard](#️-admin-dashboard-40-modules)
  - [Exam & Test Suite](#-exam--test-suite)
  - [Admissions & Fees](#-admissions--fees)
  - [AI Features](#-ai-features)
- [Architecture](#️-architecture)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Database Schema](#️-database-schema)
- [Serverless API Reference](#-serverless-api-reference)
- [Security](#️-security)
- [SEO & AI Discoverability](#-seo--ai-discoverability)
- [Performance & Offline Support](#-performance--offline-support)
- [Testing](#-testing)
- [Deployment (Vercel)](#-deployment-vercel)
- [Available Scripts](#-available-scripts)
- [Credits](#-credits)
- [License](#-license)

---

## ✨ Feature Tour

### 🌐 Public Website

| Page | Highlights |
|---|---|
| **Home** (`/`) | Animated hero & stats, live notices, news ticker, honor roll, achievements, **Word of the Day**, daily quote, AI assistant button |
| **About** (`/about`) | School history, particle-manifesto visual |
| **Notices** (`/notices`) | Notices + detail pages, text-to-speech playback |
| **News** (`/news`) | Editorial news cards + detail pages |
| **Results** (`/results`) | School-published results first; **automatic BISE Peshawar board-result fallback** (live exam title scraped via proxy and refreshed hourly) |
| **Merit List** (`/merit-list`) | "Constellation of Toppers" visualisation |
| **Result Card** (`/result-card`) | Student result-card portal with **PDF + Excel export** and shareable cards |
| **Calendar** (`/calendar`) | School events calendar with **one-click ICS subscription** (`/calendar.ics`) and exam countdowns |
| **Teachers** (`/teachers`) | Staff directory |
| **Gallery** (`/gallery`) | Photo albums + Facebook/YouTube video embeds (share-link auto-resolving) |
| **Library** (`/library`) | Downloadable study material, videos, archive.org embeds |
| **Online Classes** (`/online-classes`) | Live classes via embedded **Jitsi Meet** rooms |
| **Roll No Slip** (`/roll-no-slip`) | Exam roll-number slips with **QR verification** and countdowns |
| **Admission** (`/admission`) | Online application form, live **application tracker**, interview slot booking, admit card, fee challan |
| **Duty** (`/duty`) | Public duty board |
| **FAQ** (`/faq`), **Contact** (`/contact`), **Search** (`/search`) | Site-wide search, interactive school map |

Plus a playful **404 page** (flying kite) and an offline fallback page.

### 📚 Notes Platform & Interactive Labs (Student Learning Hub)

A full online-studying platform at `/notes`, covering **9 subjects** (Math, Physics, Chemistry, Biology,
English, Urdu, Islamiat, Pakistan Studies, Computer):

- **Rich chapters** — TipTap editor content, KaTeX math, tables, images, embeds
- **AI Study Buddy** — ask questions about any chapter, answered by GLM (streaming)
- **Audio notes** — text-to-speech playback of chapter content
- **Quizzes, flashcards & revision** — wrong-answer tracking, revision reminders, progress + reading-time tracking
- **Highlights & annotations** — personal margin notes with community upvotes
- **Gamification** — XP, streaks and a public **leaderboard**
- **Concept maps** — markmap-powered mind-map rendering of chapter outlines
- **Lantern Mode ("Hujra" reading experience)** — a kerosene-lantern night theme inspired by the
  Pashtun *hujra* tradition, applied across notes/news/notices for focused reading

**Interactive Labs** (lazy-loaded so the main bundle stays light):

> Graphing Calculator · Step-by-Step Solver · PhET Simulations (proxied) · 3D Molecule Viewer ·
> Interactive Periodic Table · Code Playground · Punnett Square · Number Line Lab ·
> Statistics Playground · Concept Maps

### 👤 Student Dashboard

Signed-in students get a 16-tab dashboard at `/dashboard`:

`Overview · Profile · Results · Result Card · Timetable · Notices · News · Gallery · Library ·
Videos · Fees · Roll Numbers · Exam Seating · Exam Scan · Credentials Hub` and more — with
profile photo upload, notification bell and connection-aware UX.

### 🛠️ Admin Dashboard (40+ modules)

The admin suite at `/admin` (role-gated) covers the entire school operation:

- **School settings** — name, logo, banner, stats, EMIS info
- **People** — students (CSV bulk import), student records, student credentials, student ID cards
  (QR), teachers, user management, pending-account approvals/rejections
- **Academics** — results (per class/exam/year, CSV import, **scheduled publishing**), DMCs,
  grading schemes, merit lists, honor roll, houses
- **Attendance** — daily attendance (calendar view, half-day support), attendance analytics with
  **PDF analytics reports**, thresholds
- **Timetables** — visual grid editor, color-coded subjects, per-class overrides
- **Exams** — exam console, schedules, date sheets, **seating planner** (rooms + assignments),
  exam roll numbers, exam attendance (QR scanning), monitor pass, teacher scan console
- **Content** — notices, news, announcements, events, gallery, videos, library, achievements,
  online classes, duty board, daily quotes
- **Fees** — fee structures, vouchers, payments, custom fee modal
- **Admissions** — application review, documents, status timeline, interview slots
- **Online tests** — MCQ test builder with timed attempts
- **Analytics** — site analytics (visits, page tracking) + attendance analytics

### 🧪 Exam & Test Suite

- **MCQ online tests** with per-question timers — when the timer hits zero, a global controller
  fires a red-flash overlay + air-raid siren **no matter which page the student is on**
- **Exam seating planner** — rooms, assignments and printable seating plans (`v_student_seating` view)
- **Exam roll-number slips** with QR codes and countdowns, **exam attendance via QR scan**
  (html5-qrcode), date sheets with `.ics` export, monitor pass management
- **BISE Peshawar integration** — when no in-house result is published, the results page falls
  back to live board-result lookup through a curl-based proxy that bypasses Cloudflare's
  managed challenge; the current board exam title is scraped hourly and mirrored automatically

### 💰 Admissions & Fees

- **Online admission** with document upload, a live application-status tracker, interview-slot
  booking, auto-generated admit cards and fee challans
- **Fee module** — structures per class, voucher generation, payment recording, custom fees

### 🤖 AI Features

- Floating **homepage AI assistant** + **Notes AI Study Buddy**, both powered by **Z.AI GLM**
  free flash models (`glm-4.5-flash`, fallback `glm-4.7-flash`)
- Requests are proxied through the `/api/ai-chat` serverless function over **SSE streaming** —
  the API key **never reaches the browser**
- Automatic model fallback between the two free pools, thinking-mode disabled for fast
  first tokens, and strict watchdogs so the client can never hang

---
## 🏗️ Architecture

```text
                        ┌──────────────────────────────────────────────┐
                        │                  BROWSERS                    │
                        │  humans → React SPA · bots → special paths   │
                        └───────────────┬──────────────────────────────┘
                                        │
                        ┌───────────────▼──────────────────────────────┐
                        │      Edge Middleware (middleware.ts)         │
                        │ • blocks attack-tool user agents (403)       │
                        │ • rate limiting tiers (see Security)         │
                        │ • social crawlers → /api/og (link previews)  │
                        │ • AI/search crawlers → /api/render           │
                        │   (live HTML, 4 s timeout → static fallback) │
                        └──────┬───────────────────────┬───────────────┘
                               │                       │
             ┌─────────────────▼─────┐   ┌─────────────▼──────────────────┐
             │  React SPA (Vite)     │   │  10 Serverless Functions       │
             │ • 25+ lazy routes     │   │  ai-chat · render · seo · og   │
             │ • React Query cache   │   │  bisep-proxy · phet · calendar │
             │ • IndexedDB offline   │   │  word-of-day · resolve-fb      │
             │ • Service Worker      │   │  auto-publish-results          │
             └─────────┬─────────────┘   └─────────────┬──────────────────┘
                       │                               │
             ┌─────────▼──────────┐        ┌───────────▼──────────────┐
             │  Supabase          │        │  External services       │
             │ • Postgres (60+)   │        │  Z.AI GLM · Cloudinary   │
             │ • Auth (RLS)       │        │  BISE Peshawar · PhET    │
             │ • Storage          │        │  Plausible · Wordnik     │
             └────────────────────┘        └──────────────────────────┘
```

**Key design decisions**

1. **One SPA + 10 serverless functions.** Vercel's *Hobby plan caps deployments at 12 serverless
   functions*, so related endpoints are deliberately consolidated (e.g. `/api/seo` serves robots,
   sitemap, llms.txt and RSS via a `?kind=` parameter; `/api/render` serves both live crawler HTML
   and the AI JSON feed). Keep this limit in mind before adding files to `api/`.
2. **Crawlers get live HTML, humans get the SPA.** The Edge middleware detects search/AI crawlers
   and proxies them to `/api/render`, which builds a complete semantic HTML page from the **live
   database** (fresh content between deploys). If the renderer is slow or down, the request
   falls back to the build-time prerendered page — crawling must never break.
3. **Social previews** (WhatsApp, Facebook, X, Discord, Telegram…) are 302-redirected to `/api/og`,
   which returns fully-formed OG/Twitter/canonical/JSON-LD HTML. In-app browsers of real humans
   are *never* redirected.
4. **Prerender runs inside the Vite build itself.** Vercel's Vite preset executes `vite build`
   directly and never calls `npm run build`, so the prerender pipeline is hooked into Vite's
   `closeBundle` phase (see `vite.config.ts`) — it Chromium-renders every public route into
   `dist/` and patches `sw.js` with the new asset manifest on every deploy.
5. **Supabase is the single backend** — Postgres (60+ tables), Auth (RLS-protected), Storage.
   A second, auth-disabled "public" Supabase client (`src/lib/supabase.ts`) keeps public forms
   working even when a stale browser session would otherwise hang them.
6. **Media lives on Cloudinary** (unsigned upload preset, client-side compression, folder
   organisation) — keeping Supabase storage light and images globally CDN-cached.

## 🧱 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, TypeScript 5, Vite 5 (SWC), React Router 6 |
| **Styling** | Tailwind CSS 3.4, shadcn/ui (Radix primitives), tailwindcss-animate, custom themes |
| **Motion & 3D** | Framer Motion (LazyMotion), Three.js, canvas-confetti |
| **Data layer** | TanStack React Query 5 (15-min stale time, IndexedDB persistence), Supabase JS 2 |
| **Forms & validation** | React Hook Form + Zod |
| **Rich content** | TipTap editor suite, KaTeX, markmap (concept maps) |
| **Documents** | jsPDF + autotable (PDF), ExcelJS + SheetJS (Excel), qrcode / html5-qrcode |
| **Maps & media** | Leaflet + react-leaflet, YouTube / Facebook / Jitsi embeds, archive.org |
| **Charts** | Recharts |
| **AI** | Z.AI GLM-4.5-Flash / 4.7-Flash via serverless SSE proxy |
| **Analytics** | Plausible (privacy-friendly) + self-hosted site analytics (`site_visits`) |
| **Backend** | Supabase (Postgres, Auth, Storage) |
| **Edge/Serverless** | Vercel Functions (Node), Vercel Edge Middleware |
| **Testing** | Vitest + Testing Library (+ Playwright available) |

## 📁 Project Structure

```text
GHS-Babi-Khel-main/
├── api/                        # Vercel serverless functions (10 — Hobby limit is 12!)
│   ├── ai-chat.ts              # Z.AI GLM proxy — SSE streaming, model fallback
│   ├── auto-publish-results.js # Scheduled publish: flips is_published when publish_at passes
│   ├── bisep-proxy.js          # BISE Peshawar results (curl → Cloudflare bypass) + live title
│   ├── calendar.js             # /calendar.ics — iCalendar feed of school events
│   ├── og.js                   # OG/Twitter/JSON-LD HTML for social crawlers
│   ├── phet.js                 # Combined PhET simulation + asset proxy
│   ├── render.js               # Live DB-rendered HTML for crawlers + AI JSON feed
│   ├── resolve-fb.js           # Facebook share-link → canonical permalink resolver
│   ├── seo.js                  # robots.txt · sitemap.xml · llms.txt · RSS (?kind=)
│   └── word-of-day.js          # Homepage Word of the Day
├── middleware.ts               # Edge middleware: security, rate limits, crawler routing
├── public/
│   ├── sw.js                   # Custom service worker (asset precache + image cache)
│   └── offline.html · manifest.json · icons …
├── scripts/
│   ├── prerender.mjs           # CLI entry for the prerender pipeline
│   ├── prerender-lib.mjs       # Prerender pipeline (Chromium render + SW patch)
│   └── seo-page-content.mjs
├── src/
│   ├── components/
│   │   ├── interactive/        # Interactive Labs (graphs, 3D molecules, PhET …)
│   │   ├── notes/              # AI assistant, audio player, annotations, gamification
│   │   ├── ReportCard/         # PDF/Excel report-card generation
│   │   ├── admissions/         # Tracker, interview booking, admit card, challan
│   │   ├── seo/                # Helmet SEO, JSON-LD schema, route injector
│   │   ├── layout/ · shared/ · ui/ (shadcn)
│   ├── contexts/AuthContext.tsx
│   ├── hooks/                  # 40 hooks (one per domain: results, fees, notes …)
│   ├── lib/                    # supabase clients, cloudinary, csrf, rate limiter …
│   ├── pages/                  # Public pages
│   │   ├── admin/              # Admin dashboard (40+ tab modules)
│   │   ├── dashboard/          # Student dashboard (16 tabs)
│   │   └── notes/ · auth/
│   ├── App.tsx                 # Routes + crash-proof lazy loading + offline bootstrap
│   └── index.css               # Themes (Emerald Prestige light/dark, Lantern "Hujra" mode)
├── vite.config.ts              # Build config + prerender closeBundle hook + chunking
├── vercel.json                 # Rewrites, security headers (CSP/HSTS), caching, region
└── env.example
```

## 🚀 Getting Started

**Prerequisites:** Node 18+ (Vite 5 requirement) and npm.

```bash
# 1 — Clone
git clone <your-repo-url> ghs-babi-khel && cd ghs-babi-khel

# 2 — Install dependencies
npm install

# 3 — Configure environment
cp env.example .env        # then fill in the values (see next section)

# 4 — Start the dev server (http://localhost:8080)
npm run dev

# 5 — Production build (includes the prerender pipeline)
npm run build

# 6 — Preview the production build locally
npm run preview
```

> The dev server binds to port **8080** (`vite.config.ts`). If your Supabase/Cloudinary env vars
> are missing, the app still boots with placeholder clients so the UI can be developed —
> data features simply won't work.

## 🔐 Environment Variables

Copy `env.example` → `.env` for local dev; add the same variables in
**Vercel → Project Settings → Environment Variables** for production. **Redeploy after changing them.**

### Client-side (`VITE_` prefix — bundled into the browser, never put secrets here)

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Supabase anonymous/public key (RLS protects data) |
| `VITE_CLOUDINARY_CLOUD_NAME` | For uploads | Cloudinary cloud name (dashboard home) |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | For uploads | Cloudinary **unsigned** upload preset |
| `VITE_PLAUSIBLE_DOMAIN` | Optional | Domain registered at plausible.io — leave **empty to disable analytics** |
| `VITE_PLAUSIBLE_SRC` | Optional | Custom script URL for **self-hosted** Plausible |
| `VITE_BISEP_EXAM_TITLE` | Optional | Fallback board-exam title, used only if the live BISEP scraper fails |

### Server-side (no `VITE_` prefix — stays on the server, **never** expose to the browser)

| Variable | Required | Description |
|---|---|---|
| `ZAI_API_KEY` | For AI features | Z.AI API key (free flash models) — powers `/api/ai-chat` |
| `ZAI_MODEL` | Optional | Override model. Default `glm-4.5-flash`; `glm-4.7-flash` also free |
| `ZAI_API_URL` | Optional | API URL override — **ignored unless it starts with `https://api.z.ai/`** |
| `WORDNIK_API_KEY` | Optional | Upgrades Word of the Day to Wordnik-curated words (works without it) |

### Build-time flags (optional)

| Flag | Effect |
|---|---|
| `GHS_SKIP_PRERENDER=1` | Skips the prerender hook inside `vite build` |
| `PRERENDER=false` | CLI prerender: skip Chromium rendering |
| `SEO_FALLBACK=false` | CLI prerender: skip static fallback content injection |

## 🗄️ Database Schema

The project uses **60+ Supabase (Postgres) tables**, grouped by domain:

| Group | Tables |
|---|---|
| **Core** | `school_settings` (single row), `profiles` (roles + approval status), `students`, `teachers`, `rooms`, `notifications`, `notification_dismissals`, `site_visits` |
| **Content** | `notices`, `news`, `gallery_albums`, `gallery_photos`, `videos`, `library_files`, `achievements`, `daily_quotes`, `school_events`, `online_classes`, `duty_board` |
| **Academics** | `results`, `grading_schemes`, `merit_lists`, `honor_roll`, `houses`, `house_members`, `timetables`, `timetable_settings`, `timetable_overrides` |
| **Attendance** | `attendance`, `attendance_daily_stats`, `attendance_thresholds` |
| **Exams** | `exam_schedule`, `exam_roll_numbers`, `exam_roll_sessions`, `exam_attendance`, `exam_seating_plans`, `exam_seating_rooms`, `exam_seating_assignments`, `v_student_seating` (view), `tests`, `test_questions`, `test_attempts` |
| **Fees** | `fee_structures`, `fee_vouchers`, `fee_payments` |
| **Admissions** | `admissions`, `admission_documents`, `admission_settings`, `admission_status_timeline`, `interview_slots`, `interview_bookings` |
| **Notes platform** | `note_subjects`, `note_chapters`, `notes`, `note_quizzes`, `note_quiz_results`, `note_questions`, `note_flashcards`, `note_wrong_answers`, `note_progress`, `note_highlights`, `note_annotations`, `annotation_upvotes`, `chapter_reading_times`, `chapter_connections`, `student_gamification`, `revision_reminders` |
| **Generated assets** | `generated_id_cards` |

**Row Level Security (RLS)** must be enabled on all tables. Public visitors only ever use the
anon key against tables where RLS explicitly allows it (notices, news, settings, published
results, …); everything admin-side is gated by the `profiles.role` check (`admin`) plus RLS.

**Storage/media:** image and video uploads go to **Cloudinary** (unsigned preset, client-side
compression, per-feature folders). No public Supabase buckets are required for a fresh deploy.

## 🔌 Serverless API Reference

| Endpoint | Purpose |
|---|---|
| `POST /api/ai-chat` | AI assistant proxy (Z.AI GLM) — **SSE stream**, protocol: `{"token": "…"}` frames → `{"done": true}` |
| `GET /api/render?path=/…` | Live database-rendered HTML page for AI/search crawlers |
| `GET /api/render?feed=ai` | Complete **AI JSON feed** (also reachable at `/ai-data.json`, `/ai.json`, `/api/ai-data`) |
| `/robots.txt` · `/sitemap.xml` · `/llms.txt` · `/rss.xml` · `/feed.xml` | All served by `/api/seo?kind=…` rewrites |
| `GET /api/og?path=/…` | Open-Graph/Twitter-card HTML for social crawlers (middleware 302s them here) |
| `GET /api/bisep-proxy` | BISE Peshawar result lookup (`mode=current` returns the live current-exam title) |
| `GET /calendar.ics` | iCalendar subscription feed of published school events |
| `/api/phet-proxy` · `/api/phet-asset` | PhET simulation + asset proxying (same-origin, CSP-safe) |
| `GET /api/word-of-day` | Word of the Day (curated list → Free Dictionary → optional Wordnik) |
| `POST /api/resolve-fb` | Facebook share-link → canonical permalink (for embeds) |
| `GET /api/auto-publish-results` | Result auto-publisher — flips `is_published` once `publish_at` passes (safe to call repeatedly; wire it to a Vercel Cron if desired) |

## 🛡️ Security

- **Strict headers via `vercel.json`** — Content-Security-Policy (allow-listing only the third-party
  origins actually used), HSTS preload, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy` (camera/mic only for Jitsi), COOP/CORP, and server
  fingerprint stripping (`Server`, `X-Powered-By` removed).
- **Rate limiting (Edge middleware)** — sliding-window per IP+UA fingerprint with progressive blocking:

  | Tier | Limit | Applies to |
  |---|---|---|
  | default | 100 / min | All page routes |
  | api | 60 / min | `/api/*` |
  | scrapeProxy | 15 / min | `/api/bisep-proxy`, `/api/og` |
  | login | 5 / 15 min | Sign-in API calls |
  | auth | 10 / 15 min | Auth pages |
  | signup | 3 / hour | Sign-up API calls |
  | passwordReset | 3 / hour | Password reset |
  | contact | 2 / min | Contact submissions |

  Exceeding a limit applies a **2× window block**, then returns `429` with `Retry-After`.
- **Attack-tool blocking** — known scanner UAs (sqlmap, nikto, nmap, …) get `403`. Bare words like
  "bot" are *deliberately never* blocked so Googlebot/AI crawlers can't be caught by accident.
- **Client hardening** — CSRF token helper, CAPTCHA component, encrypted secure-storage hook,
  client-side rate limiter, safe image/embed components, and per-route error boundaries.
- **Crawler integrity** — private areas (`/admin`, `/dashboard`, `/teacher`, `/auth`, `/search`)
  are never proxied to the live renderer and are robots-disallowed.

## 🔍 SEO & AI Discoverability

This project treats search engines **and AI assistants** as first-class users:

- **Build-time prerendering** — Chromium renders every public route into static HTML at build,
  so the first HTML byte is always fully readable, even for non-JS fetchers.
- **Dynamic rendering** — recognised AI/search crawlers additionally get *live* database-rendered
  HTML from `/api/render` (fresh content between deploys, with a 4-second fail-safe timeout).
- **Static JSON-LD `@graph`** in `index.html` (EducationalOrganization, WebSite, Person…) plus the
  same graph injected client-side by `SiteSchema.tsx`.
- **Machine-readable feeds** — `/llms.txt` (llmstxt.org guide), `/api/ai-data` AI JSON feed,
  `/rss.xml` news+notices feed, `/sitemap.xml` with live `lastmod` dates, `/robots.txt`.
- **Per-route meta** — React Helmet + `RouteSEOInjector` mirror the route table in `api/og.js`
  so link previews always match the real page.

## ⚡ Performance & Offline Support

- **Code-splitting** — every route is lazy-loaded; vendor libraries are grouped into stable
  manual chunks (react, supabase, query, motion, charts, three, xlsx…). jspdf is intentionally
  *not* chunk-named so it only downloads when a PDF feature is actually opened.
- **Crash-proof route loading** (`App.tsx`) — a failed chunk fetch (offline / flaky network /
  post-deploy stale hash) never crashes the app: the loader keeps the import pending, probes the
  chunk URL, recovers it under a cache-busting specifier, and renders the page **in place** —
  with at most 3 guarded reloads per minute for genuinely stale chunks.
- **Offline-first data** — homepage-critical queries (notices, news, teachers, achievements,
  settings, events, results) persist to **IndexedDB** and restore on cold start; the custom
  **service worker** precaches the app shell + every hashed asset from `asset-manifest.json`
  and passively caches Cloudinary images (without ever `respondWith()`-ing image requests —
  a past bug this design makes impossible). `/offline.html` is the last-resort fallback.
- **Background prefetch** — route chunks are prefetched when the browser is idle (and on
  hover/touch intent), prioritised and skipped on Data-Saver/2G connections.
- **Query tuning** — 15-min stale time, no refetch-on-focus/reconnect, placeholder-previous-data,
  gentle retry backoff: no "flash of refresh" while editing.
- **Android GPU fixes** — looping animations, blur and stacking-context pitfalls are explicitly
  tamed in `index.css` for low-end devices.

## 🧪 Testing

```bash
npm run test         # Vitest — run once
npm run test:watch   # Vitest — watch mode
npm run lint         # ESLint (flat config, react-hooks + react-refresh rules)
```

- **Vitest** is configured (`vitest.config.ts` + `vitest.standalone.config.mts`) with
  Testing Library + jest-dom; e.g. `api/ai-chat.test.mts` covers the AI proxy protocol.
- **Playwright** (`@playwright/test`) is installed for end-to-end coverage — new e2e specs can
  be added and wired into CI as the project grows.

## ☁️ Deployment (Vercel)

1. Push the repo to GitHub.
2. **Import the repo in Vercel** — the Vite framework preset is detected automatically.
3. Add the environment variables from the table above (Project Settings → Environment Variables),
   then **redeploy** so they take effect.
4. `vercel.json` handles everything else:
   - SPA rewrites for all routes (+ clean rewrites like `/sitemap.xml` → `/api/seo?kind=sitemap`)
   - Global security headers, immutable caching for `/assets/*`, `must-revalidate` for HTML
   - Serverless region **`bom1`** (Mumbai — closest to Pakistan for latency)
5. Deploy. The prerender pipeline runs automatically inside `vite build` (via the `closeBundle`
   hook) — no extra build step is needed, and it can never be silently skipped by CI.

> ⚠️ **Mind the 12-function limit** on Vercel's Hobby plan. The project currently ships **10**
> serverless functions — you have 2 slots left before you must consolidate or upgrade.

### First Admin Setup

1. Deploy the site → **Sign Up** with your email.
2. New accounts start as **pending** until an admin approves them — for the *first* admin:
   open **Supabase Dashboard → Table Editor → `profiles`**, find your row, set
   `role` → `admin` (and `status` → approved).
3. Sign out and back in → the **Dashboard/Admin** entry points unlock.
4. Subsequent sign-ups appear in **Admin → Pending Requests** for approval/rejection.

### Scheduled result publishing

Admin results support a `publish_at` scheduled release. The client countdown handles the common
case, and `/api/auto-publish-results` provides a server-side safety net. To make it fully
hands-off, add a Vercel Cron entry in `vercel.json` pointing at that endpoint (e.g. hourly):

```json
"crons": [{ "path": "/api/auto-publish-results", "schedule": "0 * * * *" }]
```

## 📜 Available Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on port **8080** (HMR overlay disabled) |
| `npm run build` | Production build **+ prerender pipeline** (`vite build && node scripts/prerender.mjs`; the second run is a no-op thanks to a `dist/.ghs-prerender-done` marker) |
| `npm run build:dev` | Development-mode build (sourcemaps on) |
| `npm run prerender` | Run the prerender pipeline manually against an existing `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | ESLint across the repo |
| `npm run test` / `test:watch` | Vitest single run / watch mode |

## 🙌 Credits

- **Developer** — Muhammad Faheem, Class 10 student at GHS Babi Khel, who independently designed
  and built the entire platform as a school/community project (profile also at `/humans.txt`).
- **Principal** — Mr. Imdad Ullah, Government High School Babi Khel (EMIS 60673).
- **Thanks** — Supabase, Vercel, Z.AI, Cloudinary and Plausible free tiers make this project
  possible at zero infrastructure cost.

## 📄 License

© **GHS Babi Khel** — Government High School Babi Khel, District Mohmand, KPK, Pakistan.
All rights reserved.
