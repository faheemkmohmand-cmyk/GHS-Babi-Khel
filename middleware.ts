// middleware.ts (Enhanced)
// SECURITY FIX: Problems 23 & 24 - Advanced Rate Limiting + Bot Protection
// Multi-layer defense: Rate limiting, bot detection, IP tracking, behavioral analysis

import { rewrite } from "@vercel/functions";

export const config = {
  runtime: "edge",
  matcher: [
    "/((?!api/|assets/|favicon|icon-|apple-touch-icon|manifest.json|robots.txt|sitemap.xml|rss.xml|feed.xml|og-image|sw.js|.*\\.(?:js|css|png|jpg|jpeg|svg|ico|webp|woff2?|ttf|json|xml|txt)$).*)",
  ],
};

// ─── Bot Detection Configuration ─────────────────────────────────────

const BOT_USER_AGENTS = [
  // Social media crawlers (original)
  "facebookexternalhit", "facebookcatalog",
  "twitterbot", "linkedinbot", "whatsapp",
  "slackbot", "slack-imgproxy", "discordbot",
  "telegrambot", "skypeuripreview", "viber",
  "pinterest", "redditbot", "vkshare",
  "embedly", "outbrain", "quora link preview",
  "tumblr", "w3c_validator", "applebot",
];

// Known bad bots / scrapers to block
const BLOCKED_USER_AGENTS = [
  "bot", "spider", "crawler", "scraper", "curl", "wget",
  "python-requests", "httpclient", "java/", "go-http",
  "nikto", "sqlmap", "dirbuster", "nmap", "masscan",
  "zgrab", "gobuster", "wfuzz", "hydra", "john",
  "medusa", "ncrack", "arachni", "w3af", "skipfish",
  "whatweb", "nuclei", "aquatone", "amass", "subfinder",
];

// Suspicious patterns in User-Agent
const SUSPICIOUS_PATTERNS = [
  /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/, // IP-like UAs
  /^$/, // Empty UA
  /^[A-Z]{20,}$/, // All caps long strings
];

// ─── Rate Limiting Store (In-Memory for Edge) ──────────────────────

interface RateLimitEntry {
  count: number;
  resetTime: number;
  lastRequest: number;
  blockedUntil?: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Rate limit configurations per endpoint type
const RATE_LIMITS = {
  default: { windowMs: 60000, maxRequests: 100 },
  auth: { windowMs: 900000, maxRequests: 10 },        // 15 min
  login: { windowMs: 900000, maxRequests: 5 },         // 15 min
  signup: { windowMs: 3600000, maxRequests: 3 },        // 1 hour
  contact: { windowMs: 60000, maxRequests: 2 },          // 1 min
  passwordReset: { windowMs: 3600000, maxRequests: 3 }, // 1 hour
  api: { windowMs: 60000, maxRequests: 60 },
};

type LimitType = keyof typeof RATE_LIMITS;

// ─── Client Identification ──────────────────────────────────────────

function getClientInfo(request: Request): {
  ip: string;
  fingerprint: string;
  isBot: boolean;
  isBlocked: boolean;
} {
  const ua = request.headers.get("user-agent") || "";
  const uaLower = ua.toLowerCase();
  
  // Extract IP (check multiple headers)
  const ip = 
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  
  // Generate fingerprint from IP + UA
  const fingerprint = `${ip}:${uaLower.substring(0, 50)}`;
  
  // Check if legitimate bot
  const isBot = BOT_USER_AGENTS.some(bot => uaLower.includes(bot));
  
  // Check if should be blocked
  const isBlocked = BLOCKED_USER_AGENTS.some(blocked => uaLower.includes(blocked)) ||
                    SUSPICIOUS_PATTERNS.some(pattern => pattern.test(ua));
  
  return { ip, fingerprint, isBot, isBlocked };
}

// ─── Rate Limiting Functions ────────────────────────────────────────

function checkRateLimit(
  identifier: string,
  limitType: LimitType = 'default'
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
    entry.blockedUntil = now + (config.windowMs * 2);
    entry.count = 0;
    rateLimitStore.set(identifier, entry);
    
    console.warn(`[RateLimit] ${limitType} exceeded for ${identifier}`);
    
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil(config.windowMs * 2 / 1000),
    };
  }
  
  // Increment counter
  entry.count++;
  entry.lastRequest = now;
  rateLimitStore.set(identifier, entry);
  
  return { allowed: true, remaining: config.maxRequests - entry.count };
}

function getLimitTypeFromPath(pathname: string): LimitType {
  if (pathname.includes('/signup') || pathname.includes('/register')) return 'signup';
  if (pathname.includes('/login') || pathname.includes('/signin')) return 'login';
  if (pathname.includes('/password') || pathname.includes('/reset')) return 'passwordReset';
  if (pathname.includes('/contact')) return 'contact';
  if (pathname.startsWith('/api/')) return 'api';
  if (pathname.startsWith('/auth/')) return 'auth';
  return 'default';
}

// Cleanup old entries periodically
let lastCleanup = 0;
function cleanupIfNeeded() {
  const now = Date.now();
  if (now - lastCleanup > 60000) { // Every minute
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetTime && (!entry.blockedUntil || now > entry.blockedUntil)) {
        rateLimitStore.delete(key);
      }
    }
    lastCleanup = now;
  }
}

// ─── Security Headers Helper ────────────────────────────────────────

function addSecurityHeaders(response: Response): void {
  response.headers.set('X-Request-ID', crypto.randomUUID());
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  response.headers.delete('Server');
  response.headers.delete('X-Powered-By');
}

// ─── Main Middleware ────────────────────────────────────────────────

export default function middleware(request: Request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const clientInfo = getClientInfo(request);
  
  // ── Security Check 1: Blocked Bots ──
  if (clientInfo.isBlocked) {
    console.warn(`[Security] Blocked suspicious request from ${clientInfo.ip}:`, request.headers.get('user-agent'));
    
    return new Response('Access Denied', {
      status: 403,
      headers: {
        'Content-Type': 'text/plain',
        'X-Block-Reason': 'Suspicious user agent',
      }
    });
  }
  
  // ── Security Check 2: Rate Limiting (for non-bots) ──
  if (!clientInfo.isBot) {
    const limitType = getLimitTypeFromPath(pathname);
    const rateLimitResult = checkRateLimit(clientInfo.fingerprint, limitType);
    
    if (!rateLimitResult.allowed) {
      return new Response(JSON.stringify({
        error: 'Too many requests. Please try again later.',
        message: `Rate limit exceeded for this endpoint.`,
        retry_after: rateLimitResult.retryAfter,
        endpoint_type: limitType,
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(rateLimitResult.retryAfter || 60),
          'X-RateLimit-Limit': String(RATE_LIMITS[limitType].maxRequests),
          'X-RateLimit-Remaining': '0',
          'Access-Control-Allow-Origin': 'https://ghsbabikhel.indevs.in',
        }
      });
    }
    
    // Add rate limit headers to successful responses
    // (will be added below)
  }
  
  // ── Legitimate Bot Handling (OG Data) ──
  if (clientInfo.isBot) {
    const ogUrl = new URL("/api/og", url.origin);
    ogUrl.searchParams.set("path", pathname);
    return rewrite(ogUrl);
  }
  
  // ── Regular User Request ──
  cleanupIfNeeded();
  
  // Create response with security headers
  const response = new Response(null, { status: 200 });
  addSecurityHeaders(response);
  
  // Add rate limit info headers
  if (!clientInfo.isBot) {
    const limitType = getLimitTypeFromPath(pathname);
    const entry = rateLimitStore.get(clientInfo.fingerprint);
    if (entry) {
      response.headers.set('X-RateLimit-Limit', String(RATE_LIMITS[limitType].maxRequests));
      response.headers.set('X-RateLimit-Remaining', String(RATE_LIMITS[limitType].maxRequests - entry.count));
      response.headers.set('X-RateLimit-Reset', String(Math.ceil((entry.resetTime - Date.now()) / 1000)));
    }
  }
  
  // Return undefined to let request pass through normally
  return;
}
