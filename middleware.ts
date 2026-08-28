// middleware.ts (Fixed — Problem 1: Googlebot was being 403-blocked)
//
// ═══════════════════════════════════════════════════════════════════════════
// WHAT WAS BROKEN (and is fixed here):
//
// 1. GOOGLEBOT 403 — The old BLOCKED_USER_AGENTS list contained the bare
//    words "bot", "spider", "crawler", "scraper". Every real Googlebot
//    User-Agent contains "+http://www.google.com/bot.html" — and the
//    standalone word "bot" in that URL matched the old \b<word>\b regex.
//    Result: Google itself was blocked with 403 for weeks/months, which is
//    why indexed pages never refreshed, new pages never appeared, and
//    Search Console "Request Indexing" seemed to do nothing.
//    FIX: those bare words are removed. Only specific attack-tool names
//    remain (sqlmap, nikto, nmap, …), none of which appear in any
//    legitimate search-engine or AI crawler UA.
//
// 2. WHATSAPP REAL USERS REDIRECTED — The old bot check used
//    ua.includes("whatsapp"), which also matches ordinary visitors browsing
//    from inside the WhatsApp app (their UA ends with "(WhatsApp)"), so real
//    people were 302-redirected to /api/og instead of the website.
//    FIX: social-crawler detection now uses precise patterns. The WhatsApp
//    *crawler* UA starts with "WhatsApp/", while real in-app browsers start
//    with "Mozilla/5.0 …" and only carry "(WhatsApp)" at the end.
//
// 3. FACEBOOK PREVIEW INFINITE LOOP — The old code redirected social
//    crawlers to /api/og, but /api/og is ALSO matched by this middleware's
//    matcher, so the crawler was redirected to /api/og again and again
//    (302 → 302 → 302 …). Facebook gave up → broken link previews.
//    FIX: the social-crawler redirect only applies to page routes, never to
//    /api/* paths.
//
// 4. DEAD CODE — The old "Regular User Request" block built a Response with
//    security headers and then returned undefined, so that Response (and its
//    headers) was thrown away. Real headers come from vercel.json. Removed.
//
// Also: Applebot and W3C_Validator are no longer redirected to /api/og —
// Applebot is a search crawler (needs real HTML) and the W3C validator
// needs the real page to validate.
//
// 5. AI / SEARCH CRAWLERS GET LIVE-RENDERED HTML (dynamic rendering) ────────
//    The site ships build-time prerendered pages, but their content freezes
//    at the last deploy — while the admin changes admission status, notices,
//    news, results and events in the dashboard daily. So when a recognised
//    AI/search crawler (GPTBot, ClaudeBot, PerplexityBot, Googlebot, Bingbot,
//    …) requests a public page, the middleware proxies the request to
//    /api/render?path=… which returns a complete semantic HTML page built
//    from the LIVE database — fresh content within the 2-minute CDN cache
//    window, not the next deploy. Humans are unaffected: they still get the
//    real React app with the identical design. Private areas (admin,
//    dashboard, teacher, auth) are never proxied, and the crawler still
//    passes the same rate limiter as everyone else.
// ═══════════════════════════════════════════════════════════════════════════

export const config = {
  runtime: "edge",
  matcher: [
    // Page routes — everything except static assets and most /api/ routes.
    "/((?!api/|assets/|favicon|icon-|apple-touch-icon|manifest.json|robots.txt|sitemap.xml|rss.xml|feed.xml|og-image|sw.js|.*\\.(?:js|css|png|jpg|jpeg|svg|ico|webp|woff2?|ttf|json|xml|txt)$).*)",
    // Outbound-scraping endpoints get the tighter 'scrapeProxy' rate limit.
    "/api/bisep-proxy",
    "/api/og",
  ],
};

// ─── Blocked User-Agents (attack tools only) ──────────────────────────────
// ⚠️ NEVER add bare words like "bot", "spider", "crawler", "scraper" here.
// Googlebot's UA is:  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
// and the standalone word "bot" inside that URL WILL match \bbot\b and block
// Google. Same trap exists for Bingbot, ClaudeBot, GPTBot, etc.
// Every entry below is a dedicated attack/scrape tool that no legitimate
// search engine or AI crawler ever uses.
const BLOCKED_USER_AGENTS = [
  // Dedicated hacking/scanning tools
  "sqlmap", "nikto", "dirbuster", "nmap", "masscan",
  "zgrab", "gobuster", "wfuzz", "hydra", "medusa", "ncrack",
  "arachni", "w3af", "skipfish", "whatweb", "nuclei",
  "aquatone", "amass", "subfinder",
  // Generic script clients (never used by real browsers or search crawlers)
  "curl", "wget", "python-requests", "httpclient", "go-http",
];

// Suspicious patterns in User-Agent
const SUSPICIOUS_PATTERNS = [
  /^$/, // Empty UA
  /^[A-Z]{20,}$/, // All caps long strings
];

// ─── Social preview crawlers (link-preview only) ──────────────────────────
// These are redirected to /api/og which serves tailored OG meta tags.
// Patterns are deliberately precise so that:
//   • WhatsApp CRAWLER ("WhatsApp/2.19.81 A" — starts with "WhatsApp/") is
//     detected, but
//   • WhatsApp IN-APP BROWSERS ("Mozilla/5.0 … (WhatsApp)") are NOT.
//   • Facebook's crawler is detected, but Facebook's in-app browser
//     ("… [FB_IAB/FB4A;FBAV/…]") is NOT.
// Search engine bots (Googlebot, Bingbot) and AI crawlers (GPTBot,
// ClaudeBot, PerplexityBot, Google-Extended, Applebot) are intentionally NOT
// in this list — they must receive the real (prerendered) HTML.
const SOCIAL_CRAWLER_PATTERNS: RegExp[] = [
  /\bfacebookexternalhit\//i,
  /\bfacebookcatalog\b/i,
  /\btwitterbot\//i,
  /\blinkedinbot\//i,
  /^WhatsApp\//i, // crawler only — real in-app browsers start with "Mozilla/"
  /\bslackbot\b/i,
  /\bslack-imgproxy\b/i,
  /\bdiscordbot\//i,
  /\btelegrambot\b/i,
  /\bskypeuripreview\b/i,
  /\bviber\//i,
  /\bpinterest(bot)?\//i,
  /\bredditbot\b/i,
  /\bvkshare\b/i,
  /\bembedly\b/i,
  /\boutbrain\b/i,
  /\bquora link preview\b/i,
  /\btumblr\//i,
];

// ─── AI & search-engine crawlers → live-rendered HTML ────────────────────
// These user-agents receive complete, freshly rendered HTML from /api/render
// (see api/render.js) instead of the build-time snapshot. Patterns are
// anchored to the crawler tokens so ordinary browsers can never match.
// Googlebot here ALSO covers Gemini (grounding) and Copilot/Bingbot covers
// Bing-powered answers; the dedicated AI-training crawlers (GPTBot,
// ClaudeBot, Google-Extended, Applebot-Extended, CCBot, meta-externalagent)
// are listed explicitly as well.
const AI_SEARCH_CRAWLER_PATTERNS: RegExp[] = [
  /\bGPTBot\b/i,
  /\bOAI-SearchBot\b/i,
  /\bChatGPT-User\b/i,
  /\bClaudeBot\b/i,
  /\bClaude-Web\b/i,
  /\bClaude-User\b/i,
  /\bClaude-SearchBot\b/i,
  /\bPerplexityBot\b/i,
  /\bPerplexity-User\b/i,
  /\bGoogle-Extended\b/i,
  /\bGooglebot\b/i,
  /\bGoogle-InspectionTool\b/i,
  /\bBingbot\b/i,
  /\bApplebot\b/i,
  /\bApplebot-Extended\b/i,
  /\bDuckDuckBot\b/i,
  /\bYandexBot\b/i,
  /\bCCBot\b/i,
  /\bBytespider\b/i,
  /\bmeta-externalagent\b/i,
  /\bAmazonbot\b/i,
  /\bDiffbot\b/i,
  /\bYouBot\b/i,
  /\bMistralAI-User\b/i,
  /\bPetalBot\b/i,
];

function isSearchOrAICrawler(ua: string): boolean {
  return AI_SEARCH_CRAWLER_PATTERNS.some((re) => re.test(ua));
}

// Paths that must NEVER be proxied to the live renderer:
//   • private/authenticated areas (they are robots-disallowed and
//     authentication-protected — bots get the real protected behaviour),
//   • the client-side search utility (no standalone content),
//   • anything under /api/ (excluded by the matcher anyway — defence in depth).
const LIVE_RENDER_EXCLUDE_PREFIXES = [
  "/admin",
  "/dashboard",
  "/teacher",
  "/auth",
  "/search",
  "/api/",
];

function shouldLiveRender(pathname: string): boolean {
  return !LIVE_RENDER_EXCLUDE_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Proxy the crawler request to /api/render, which returns complete,
 * LIVE database-backed HTML for this path. Falls back to the normal static
 * pipeline if the renderer is unreachable — crawling never breaks.
 */
async function proxyToLiveRender(request: Request, pathname: string): Promise<Response> {
  const renderUrl = new URL("/api/render", request.url);
  renderUrl.searchParams.set("path", pathname);
  const resp = await fetch(renderUrl.toString(), {
    method: "GET",
    headers: {
      "User-Agent": "GHSRenderBot/1.0 (internal dynamic-render hop)",
      Accept: "text/html",
    },
    redirect: "follow",
  });
  const out = new Response(resp.body, resp);
  // Content varies by user-agent class (bots get rendered HTML, humans get
  // the SPA) — make that explicit for any intermediate cache.
  out.headers.set("Vary", "User-Agent");
  out.headers.set("X-GHS-Live-Render", "1");
  return out;
}

// ─── Rate Limiting Store (In-Memory for Edge) ─────────────────────────────

interface RateLimitEntry {
  count: number;
  resetTime: number;
  lastRequest: number;
  blockedUntil?: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const RATE_LIMITS = {
  default: { windowMs: 60000, maxRequests: 100 },
  auth: { windowMs: 900000, maxRequests: 10 },        // 15 min
  login: { windowMs: 900000, maxRequests: 5 },         // 15 min
  signup: { windowMs: 3600000, maxRequests: 3 },        // 1 hour
  contact: { windowMs: 60000, maxRequests: 2 },          // 1 min
  passwordReset: { windowMs: 3600000, maxRequests: 3 }, // 1 hour
  api: { windowMs: 60000, maxRequests: 60 },
  // Stricter tier for endpoints that shell out to curl and hit a
  // third-party server (BISE Peshawar) on every request.
  scrapeProxy: { windowMs: 60000, maxRequests: 15 },
};

type LimitType = keyof typeof RATE_LIMITS;

// ─── Client Identification ─────────────────────────────────────────────────

function getClientInfo(request: Request): {
  ip: string;
  fingerprint: string;
} {
  const ua = request.headers.get("user-agent") || "";
  const uaLower = ua.toLowerCase();

  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const fingerprint = `${ip}:${uaLower.substring(0, 50)}`;
  return { ip, fingerprint };
}

function isBlockedUA(ua: string): boolean {
  // Word-boundary match to avoid false positives inside unrelated words.
  return (
    BLOCKED_USER_AGENTS.some((blocked) =>
      new RegExp(`\\b${blocked.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(ua)
    ) || SUSPICIOUS_PATTERNS.some((pattern) => pattern.test(ua))
  );
}

function isSocialCrawler(ua: string): boolean {
  return SOCIAL_CRAWLER_PATTERNS.some((re) => re.test(ua));
}

// ─── Rate Limiting Functions ────────────────────────────────────────────────

function checkRateLimit(
  identifier: string,
  limitType: LimitType = "default"
): { allowed: boolean; remaining: number; retryAfter?: number } {
  const config = RATE_LIMITS[limitType];
  const now = Date.now();

  let entry = rateLimitStore.get(identifier);

  // New entry or expired window
  if (!entry || now > entry.resetTime) {
    entry = {
      count: 1,
      resetTime: now + config.windowMs,
      lastRequest: now,
    };
    rateLimitStore.set(identifier, entry);
    return { allowed: true, remaining: config.maxRequests - 1 };
  }

  // Currently blocked?
  if (entry.blockedUntil && now < entry.blockedUntil) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil((entry.blockedUntil - now) / 1000),
    };
  }

  // Block expired?
  if (entry.blockedUntil && now >= entry.blockedUntil) {
    entry.count = 0;
    entry.blockedUntil = undefined;
  }

  // Over limit?
  if (entry.count >= config.maxRequests) {
    // Apply block (double the window)
    entry.blockedUntil = now + config.windowMs * 2;
    entry.count = 0;
    rateLimitStore.set(identifier, entry);

    console.warn(`[RateLimit] ${limitType} exceeded for ${identifier}`);

    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil((config.windowMs * 2) / 1000),
    };
  }

  // Increment counter
  entry.count++;
  entry.lastRequest = now;
  rateLimitStore.set(identifier, entry);

  return { allowed: true, remaining: config.maxRequests - entry.count };
}

function getLimitTypeFromPath(pathname: string): LimitType {
  // ── API endpoints keep their strict tiers (brute-force protection) ──
  if (pathname.startsWith("/api/bisep-proxy") || pathname.startsWith("/api/og")) return "scrapeProxy";
  if (pathname.startsWith("/api/")) {
    if (pathname.includes("/signup") || pathname.includes("/register")) return "signup";
    if (pathname.includes("/login") || pathname.includes("/signin")) return "login";
    if (pathname.includes("/password") || pathname.includes("/reset")) return "passwordReset";
    if (pathname.includes("/contact")) return "contact";
    return "api";
  }
  // Auth pages (/auth/signin, /auth/signup, …) keep their own moderate tier.
  if (pathname.startsWith("/auth/")) return "auth";
  // ── All other paths are PAGE ROUTES (/, /about, /contact, /news, …) and use
  // the default tier. Previously this function matched page paths too — e.g.
  // the /contact PAGE was limited to 2 requests/min with a 2-minute hard
  // block, and /auth/signup to 3 requests/HOUR — so legitimate AI/search
  // crawlers and real users received 429s simply by navigating. Those strict
  // tiers exist to protect sensitive OPERATIONS, which are all API calls, so
  // they now apply only to /api/*. Nothing else about rate limiting changed.
  return "default";
}

// Cleanup old entries periodically
let lastCleanup = 0;
function cleanupIfNeeded() {
  const now = Date.now();
  if (now - lastCleanup > 60000) {
    // Every minute
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetTime && (!entry.blockedUntil || now > entry.blockedUntil)) {
        rateLimitStore.delete(key);
      }
    }
    lastCleanup = now;
  }
}

// ─── Main Middleware ────────────────────────────────────────────────────────

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const ua = request.headers.get("user-agent") || "";
  const { ip, fingerprint } = getClientInfo(request);

  // ── Security Check 1: Blocked attack-tool UAs ──
  // (Googlebot, Bingbot, GPTBot, ClaudeBot, PerplexityBot etc. NEVER match
  //  this list — they are legitimate crawlers and must be served the site.)
  if (isBlockedUA(ua)) {
    console.warn(`[Security] Blocked suspicious request from ${ip}:`, ua);
    return new Response("Access Denied", {
      status: 403,
      headers: {
        "Content-Type": "text/plain",
        "X-Block-Reason": "Suspicious user agent",
      },
    });
  }

  // ── Social preview crawlers → OG endpoint ──
  // ONLY for page routes. Never for /api/* paths (redirecting /api/og to
  // /api/og was an infinite-redirect loop that broke Facebook previews).
  if (!pathname.startsWith("/api/") && isSocialCrawler(ua)) {
    const ogUrl = new URL("/api/og", url.origin);
    ogUrl.searchParams.set("path", pathname);
    return new Response(null, {
      status: 302,
      headers: { Location: ogUrl.toString() },
    });
  }

  // ── Rate limiting for everyone else ──
  // Includes Googlebot, Bingbot, GPTBot, ClaudeBot, PerplexityBot and real
  // users. These must NEVER be hard-blocked — only throttled if a single
  // fingerprint becomes abusive.
  const limitType = getLimitTypeFromPath(pathname);
  const rateLimitResult = checkRateLimit(fingerprint, limitType);

  if (!rateLimitResult.allowed) {
    return new Response(
      JSON.stringify({
        error: "Too many requests. Please try again later.",
        message: `Rate limit exceeded for this endpoint.`,
        retry_after: rateLimitResult.retryAfter,
        endpoint_type: limitType,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rateLimitResult.retryAfter || 60),
          "X-RateLimit-Limit": String(RATE_LIMITS[limitType].maxRequests),
          "X-RateLimit-Remaining": "0",
          "Access-Control-Allow-Origin": "https://ghsbabikhel.indevs.in",
        },
      }
    );
  }

  cleanupIfNeeded();

  // ── AI & search crawlers → live-rendered HTML ──
  // Runs AFTER the rate limiter (an abusive crawler still gets 429 before we
  // spend a render invocation) and NEVER for private areas. If the renderer
  // fails, we fall through to the normal static pipeline — crawling must
  // never break because of the renderer.
  if (isSearchOrAICrawler(ua) && shouldLiveRender(pathname)) {
    try {
      return await proxyToLiveRender(request, pathname);
    } catch (err) {
      console.warn(
        `[Render] live render failed for ${pathname} — serving static page instead:`,
        err instanceof Error ? err.message : err
      );
      // fall through — static prerendered page is still fully crawlable
    }
  }

  // Pass through — the request continues to static files / rewrites / api
  // functions normally. Security headers (CSP, HSTS, X-Frame-Options, …)
  // are applied at the vercel.json level for every response.
  return;
}
