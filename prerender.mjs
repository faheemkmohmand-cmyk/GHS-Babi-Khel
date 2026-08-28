#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// scripts/prerender.mjs — Build-time static prerendering (Problem 3 fix)
//
// WHY THIS EXISTS
// ───────────────
// The site is a client-rendered React SPA. Before this script, every crawler
// that doesn't execute JavaScript (GPTBot/ChatGPT, ClaudeBot, PerplexityBot,
// Google-Extended/Gemini, facebookexternalhit, older Bingbot…) received an
// EMPTY HTML shell (~3.4 KB with just a <div id="root">). That's why AI chat
// bots "didn't know" the school's pages even though Google had indexed them,
// and why search engines ranked the site poorly — there was no content in
// the raw HTML to rank.
//
// WHAT THIS DOES
// ──────────────
// After `vite build` produces dist/, this script:
//   1. Starts a tiny local static server serving dist/ (with SPA fallback).
//   2. Launches headless Chromium (Playwright — already a devDependency).
//   3. Opens every PUBLIC page route, waits for the React app to fully
//      render (data fetched from Supabase included), then saves the finished
//      HTML to dist/<route>/index.html.
//   4. Also prerenders the latest 20 notice detail pages and 20 news detail
//      pages by reading their IDs from the Supabase REST API.
//
// Vercel serves static files BEFORE rewrites, so a request for /notices now
// receives the prerendered HTML with full content + meta tags + JSON-LD,
// while real users still get the full interactive React app (it re-renders
// on top of the prerendered DOM with fresh data).
//
// Routes NOT prerendered (auth/dashboard/admin) keep the normal SPA shell —
// they are behind authentication anyway and are disallowed in robots.txt.
//
// SAFETY
// ──────
// This script NEVER fails the build. If Chromium can't launch (e.g. system
// libs missing), it logs a warning and exits 0 — the site still deploys as
// a normal SPA, exactly like before. Set PRERENDER=false to skip entirely.
// ─────────────────────────────────────────────────────────────────────────────

import { createServer } from "node:http";
import { readFile, writeFile, mkdir, stat, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, "..", "dist");
const PORT = Number(process.env.PRERENDER_PORT || 4173);
const BASE = `http://127.0.0.1:${PORT}`;
const SETTLE_MS = Number(process.env.PRERENDER_SETTLE_MS || 1800);
const DETAIL_LIMIT = Number(process.env.PRERENDER_DETAIL_LIMIT || 20);
const PAGE_TIMEOUT_MS = 45000;

// ── Public routes to prerender (mirrors App.tsx public routes + sitemap) ──
const STATIC_ROUTES = [
  "/",
  "/about",
  "/contact",
  "/admission",
  "/notices",
  "/news",
  "/results",
  "/result-card",
  "/calendar",
  "/teachers",
  "/gallery",
  "/library",
  "/online-classes",
  "/duty",
  "/notes",
  "/notes/math",
  "/notes/physics",
  "/notes/chemistry",
  "/notes/biology",
  "/notes/english",
  "/notes/urdu",
  "/notes/islamiat",
  "/notes/pakistan-studies",
  "/notes/computer",
];

// ── MIME types for the static server ──────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".map": "application/json",
};

// ── Static server with SPA fallback ───────────────────────────────────────
function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", BASE);
      let pathname = decodeURIComponent(url.pathname);

      // /api/* doesn't exist locally — return 404 so the app's fetch error
      // handling kicks in (same as an API outage, which the app handles).
      if (pathname.startsWith("/api/")) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Not found (prerender local server)" }));
        return;
      }

      // Strip trailing slash (except root)
      if (pathname.length > 1 && pathname.endsWith("/")) {
        pathname = pathname.slice(0, -1);
      }

      // Resolve to a file in dist/, with SPA fallback to index.html
      let abs = path.join(DIST, path.posix.normalize(pathname || "/"));
      // Path-traversal guard
      if (!abs.startsWith(DIST)) abs = path.join(DIST, "index.html");

      let filePath = null;
      try {
        const st = await stat(abs);
        if (st.isFile()) filePath = abs;
        else if (st.isDirectory()) {
          const idx = path.join(abs, "index.html");
          if (existsSync(idx)) filePath = idx;
        }
      } catch {
        /* not found — fall through */
      }
      if (!filePath) filePath = path.join(DIST, "index.html");

      const ext = path.extname(filePath).toLowerCase();
      const body = await readFile(filePath);
      res.statusCode = 200;
      res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
      res.setHeader("Cache-Control", "no-store");
      res.end(body);
    } catch {
      res.statusCode = 500;
      res.end("prerender server error");
    }
  });

  return new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => resolve(server)));
}

// ── Fetch latest notice/news IDs from Supabase REST (public anon key) ─────
async function fetchIds(table, limit) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn(`Prerender: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — skipping ${table} detail pages.`);
    return [];
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(
      `${url}/rest/v1/${table}?select=id&is_published=eq.true&order=created_at.desc&limit=${limit}`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: controller.signal,
      }
    );
    clearTimeout(timer);
    if (!res.ok) return [];
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows.map((r) => r.id).filter(Boolean);
  } catch {
    return [];
  }
}

// ── Chromium launcher with auto-install fallback ──────────────────────────
async function launchBrowser() {
  let chromium;
  try {
    ({ chromium } = await import("@playwright/test"));
  } catch {
    ({ chromium } = await import("playwright-core"));
  }

  const args = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"];
  try {
    return await chromium.launch({ args });
  } catch (launchErr) {
    console.warn("Prerender: Chromium not installed — downloading (one-time)…");
    const install = spawnSync("npx playwright install chromium", {
      shell: true,
      stdio: "inherit",
      timeout: 300000,
    });
    if (install.status !== 0) throw launchErr;
    return await chromium.launch({ args });
  }
}

// ── Render one route to a static HTML file ────────────────────────────────
async function renderPage(context, route, outPath, originalPreloads) {
  const page = await context.newPage();
  try {
    // networkidle = wait until no network requests for 500ms — the React
    // app + Supabase data fetches have finished. If something keeps a
    // connection open, fall back to 'load' + fixed settle time.
    try {
      await page.goto(BASE + route, { waitUntil: "networkidle", timeout: PAGE_TIMEOUT_MS });
    } catch {
      try {
        await page.goto(BASE + route, { waitUntil: "load", timeout: 30000 });
      } catch {
        /* page may still be usable — try to continue */
      }
    }

    // Wait for real app content (footer renders on every public page once
    // React Query data has loaded). Never fatal if it times out.
    await page.waitForSelector("footer", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(SETTLE_MS);

    // ── Strip runtime-added modulepreload/preload links ─────────────────────
    // While the page runs, Vite's dynamic-import machinery + the app's idle
    // route-prefetcher (prefetchOfflineRoutes in App.tsx) insert <link
    // rel="modulepreload"> tags for EVERY lazily-loaded route chunk (50+,
    // including exceljs ~938 KB). If we saved those, every visitor of a
    // prerendered page would be told to high-priority-download the whole
    // app up front — catastrophic on 3G. We keep ONLY the modulepreload
    // links that vite's original index.html shipped (the entry's true
    // critical path) and delete everything added at runtime.
    await page.evaluate((keepSet) => {
      const keep = new Set(keepSet);
      document.querySelectorAll('link[rel="modulepreload"], link[rel="prefetch"]').forEach((link) => {
        const href = (link.getAttribute("href") || "").split("?")[0];
        if (!keep.has(href)) link.remove();
      });
      // Vite also injects <link rel="preload"> for dynamic chunks sometimes
      document.querySelectorAll('link[rel="preload"][as="script"]').forEach((link) => {
        const href = (link.getAttribute("href") || "").split("?")[0];
        if (href.startsWith("/assets/") || href.includes("/assets/")) {
          if (!keep.has(href)) link.remove();
        }
      });
    }, originalPreloads);

    const html = await page.content();
    if (!html || html.length < 1000) throw new Error("rendered HTML too small — skipping");

    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, html, "utf8");
    return html.length;
  } finally {
    await page.close().catch(() => {});
  }
}

// ── PWA offline: asset manifest + service-worker version stamp ────────────
// Runs on EVERY build (before the prerender skip check — the manifest and
// the SW stamp are required even when prerendering itself is disabled):
//
//   1. Writes dist/asset-manifest.json — the full list of hashed files in
//      dist/assets/. public/sw.js fetches this at install time and
//      precaches every file, which is what makes ALL pages work offline
//      (not just the routes the app's idle prefetcher happens to visit).
//
//   2. Rewrites the CACHE_VERSION inside dist/sw.js with a unique per-build
//      stamp. A byte-different sw.js forces every browser to reinstall the
//      worker on its next visit, which re-runs the full precache with the
//      NEW hashed files. Without this, a deploy would leave the old cache
//      in place and offline taps would 404 on chunks that no longer exist.
//
// Never fails the build — worst case the SW behaves exactly like before.
async function writeAssetManifestAndPatchSW() {
  try {
    const assetsDir = path.join(DIST, "assets");
    if (!existsSync(assetsDir)) {
      console.warn("PWA offline: dist/assets not found — skipping asset manifest.");
      return;
    }
    const entries = await readdir(assetsDir);
    const files = entries
      .filter((f) => /\.(js|mjs|css|woff2?|ttf|otf|png|jpe?g|webp|svg|avif|gif|ico|json|wasm)$/i.test(f))
      .map((f) => `/assets/${f}`)
      .sort();

    const manifest = {
      builtAt: new Date().toISOString(),
      count: files.length,
      files,
    };
    await writeFile(path.join(DIST, "asset-manifest.json"), JSON.stringify(manifest), "utf8");

    // Per-build stamp so every deploy ships a byte-different sw.js.
    const swPath = path.join(DIST, "sw.js");
    if (existsSync(swPath)) {
      const stamp = `ghs-${Date.now().toString(36)}`;
      let swSource = await readFile(swPath, "utf8");
      if (/const CACHE_VERSION = "[^"]*";/.test(swSource)) {
        swSource = swSource.replace(
          /const CACHE_VERSION = "[^"]*";/,
          `const CACHE_VERSION = "${stamp}";`
        );
        await writeFile(swPath, swSource, "utf8");
      }
    }

    console.log(
      `PWA offline: asset-manifest.json written (${files.length} assets), sw.js version stamped per-build.`
    );
  } catch (e) {
    console.warn(`PWA offline: skipped (${e.message}) — build continues, SW behaves like before.`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  // PWA offline support must happen on every build, even when the
  // prerender step itself is disabled.
  await writeAssetManifestAndPatchSW();

  if (process.env.PRERENDER === "false" || process.env.PRERENDER === "0") {
    console.log("Prerender: skipped (PRERENDER=false)");
    return;
  }
  if (!existsSync(DIST)) {
    console.warn("Prerender: dist/ not found — run `vite build` first. Skipping.");
    return;
  }

  const server = await startServer();
  let browser = null;
  try {
    browser = await launchBrowser();

    // ── Capture vite's ORIGINAL modulepreload set from the shell ──────────
    // These are the entry's true critical-path chunks. Every modulepreload
    // link NOT in this set was added at runtime (Vite dep-map + the app's
    // idle route prefetcher) and must be stripped from saved HTML.
    const shellHtml = await readFile(path.join(DIST, "index.html"), "utf8").catch(() => "");
    const originalPreloads = [
      ...shellHtml.matchAll(/<link[^>]+href="([^"]+)"[^>]*>/g),
    ]
      .map((m) => {
        const tag = m[0];
        const href = m[1];
        return /rel="(modulepreload|preload|stylesheet|prefetch)"/.test(tag) ? href : null;
      })
      .filter(Boolean);
    if (originalPreloads.length) {
      console.log(`Prerender: keeping ${originalPreloads.length} original preload links, stripping runtime-added ones.`);
    }

    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 GHSPrerender/1.0",
    });

    // Don't pollute analytics with local prerender hits
    await context.route("**/*", (route) => {
      const u = route.request().url();
      if (u.includes("plausible.io")) return route.abort();
      return route.continue();
    });

    // Build the full route list: static routes + latest detail pages
    const [noticeIds, newsIds] = await Promise.all([
      fetchIds("notices", DETAIL_LIMIT),
      fetchIds("news", DETAIL_LIMIT),
    ]);
    const routes = [
      ...STATIC_ROUTES,
      ...noticeIds.map((id) => `/notices/${id}`),
      ...newsIds.map((id) => `/news/${id}`),
    ];

    console.log(`\nPrerender: rendering ${routes.length} routes (${STATIC_ROUTES.length} static + ${noticeIds.length} notices + ${newsIds.length} news)…`);

    let ok = 0;
    let failed = 0;
    for (const route of routes) {
      const outPath =
        route === "/" ? path.join(DIST, "index.html") : path.join(DIST, route, "index.html");
      try {
        const size = await renderPage(context, route, outPath, originalPreloads);
        ok++;
        console.log(`  ✔ ${route}  (${(size / 1024).toFixed(1)} KB)`);
      } catch (e) {
        failed++;
        console.warn(`  ✘ ${route}: ${e.message}`);
      }
    }

    console.log(
      `Prerender complete: ${ok}/${routes.length} pages rendered${failed ? `, ${failed} failed (SPA fallback used)` : ""}.\n`
    );
  } catch (e) {
    // NEVER fail the build — deploy as a normal SPA instead.
    console.warn(`\nPrerender SKIPPED (${e.message}).`);
    console.warn("The site still deploys as a normal client-rendered SPA — nothing is broken.\n");
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }
}

main();
