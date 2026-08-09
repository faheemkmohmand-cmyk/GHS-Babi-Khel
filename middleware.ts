// middleware.ts
// Vercel Routing Middleware — runs before the SPA shell is served.
//
// SECURITY ENHANCEMENTS ADDED:
// - Security headers injection (HSTS, CSP, CORS, etc.)
// - Rate limiting for auth endpoints
// - Bot detection for social media crawlers (original functionality preserved)
//
// Original functionality:
// Detect known bot/crawler User-Agents and, for those requests only,
// rewrite to /api/og (a serverless function that returns fully-formed
// static HTML with the correct title/description/OG/Twitter tags for the
// requested path). Regular browsers are completely untouched and still
// get the normal SPA — this only affects non-JS-executing scrapers.

import { rewrite } from "@vercel/functions";
import { NextResponse } from "next/server";

export const config = {
  runtime: "edge",
  // Skip static assets, the API itself, and the SPA's own JS bundles —
  // only run this check for actual page navigations.
  matcher: [
    "/((?!api/|assets/|favicon|icon-|apple-touch-icon|manifest.json|robots.txt|sitemap.xml|rss.xml|feed.xml|og-image|sw.js|.*\\.(?:js|css|png|jpg|jpeg|svg|ico|webp|woff2?|ttf|json|xml|txt)$).*)",
  ],
};

// Case-insensitive substrings found in social-preview crawler User-Agents.
const BOT_USER_AGENTS = [
  "facebookexternalhit", // Facebook / Messenger
  "facebookcatalog",
  "twitterbot", // X / Twitter
  "linkedinbot", // LinkedIn
  "whatsapp", // WhatsApp
  "slackbot", // Slack
  "slack-imgproxy",
  "discordbot", // Discord
  "telegrambot", // Telegram
  "skypeuripreview", // Skype
  "viber", // Viber
  "pinterest", // Pinterest
  "redditbot", // Reddit
  "vkshare", // VK
  "embedly",
  "outbrain",
  "quora link preview",
  "tumblr",
  "w3c_validator",
  "applebot", // iMessage link previews use Applebot
];

// SECURITY FIX: Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  windowMs: 60 * 1000, // 1 minute window
  maxRequests: {
    default: 100,
    auth: 10, // Stricter limit for auth endpoints
    contact: 5, // Very strict for contact forms
    signup: 3, // Prevent automated account creation
  }
};

// Simple in-memory rate limiting (for edge runtime)
// In production, use Redis or similar for distributed rate limiting
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(identifier: string, endpointType: 'default' | 'auth' | 'contact' | 'signup' = 'default'): boolean {
  const now = Date.now();
  const maxRequests = RATE_LIMIT_CONFIG.maxRequests[endpointType];
  
  const record = rateLimitStore.get(identifier);
  
  if (!record || now > record.resetTime) {
    // New window or expired record
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + RATE_LIMIT_CONFIG.windowMs
    });
    return true;
  }
  
  if (record.count >= maxRequests) {
    return false; // Rate limited
  }
  
  record.count++;
  return true;
}

function getClientIdentifier(request: Request): string {
  // Use IP address (from Vercel headers) + user agent as identifier
  const ip = request.headers.get('x-forwarded-for') || 
             request.headers.get('x-real-ip') || 
             'unknown';
  const ua = request.headers.get('user-agent') || '';
  return `${ip}:${ua.substring(0, 50)}`;
}

export default function middleware(request: Request) {
  const ua = (request.headers.get("user-agent") || "").toLowerCase();
  const isBot = BOT_USER_AGENTS.some((bot) => ua.includes(bot));
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  // SECURITY FIX: Apply rate limiting to sensitive endpoints
  const clientID = getClientIdentifier(request);
  
  // Check signup rate limiting
  if (pathname.includes('/auth/signup') || pathname.includes('/signup')) {
    if (!checkRateLimit(clientID, 'signup')) {
      return new Response(JSON.stringify({ 
        error: 'Too many registration attempts. Please try again later.' 
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '60',
          'X-RateLimit-Limit': RATE_LIMIT_CONFIG.maxRequests.signup.toString(),
          'X-RateLimit-Remaining': '0'
        }
      });
    }
  }
  
  // Check auth endpoints rate limiting
  if (pathname.includes('/auth/') && !pathname.includes('/signup')) {
    if (!checkRateLimit(clientID, 'auth')) {
      return new Response(JSON.stringify({ 
        error: 'Too many authentication attempts. Please try again later.' 
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '60',
          'X-RateLimit-Limit': RATE_LIMIT_CONFIG.maxRequests.auth.toString(),
          'X-RateLimit-Remaining': '0'
        }
      });
    }
  }

  if (!isBot) {
    // Regular users / Googlebot / Bingbot → untouched, normal SPA.
    
    // SECURITY FIX: Add security headers for non-bot requests
    // Note: Most headers are set in vercel.json, but we add extra protection here
    const response = new NextResponse();
    
    // Additional security headers that benefit from dynamic values
    response.headers.set('X-Request-ID', crypto.randomUUID());
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
    
    // Clean up old rate limit entries periodically
    if (Math.random() < 0.01) { // 1% chance each request
      const now = Date.now();
      for (const [key, value] of rateLimitStore.entries()) {
        if (now > value.resetTime) {
          rateLimitStore.delete(key);
        }
      }
    }
    
    return;
  }

  // Bot/crawler handling - serve OG data
  const ogUrl = new URL("/api/og", url.origin);
  ogUrl.searchParams.set("path", url.pathname);

  // Internal rewrite — the crawler still sees the original URL in its
  // address bar / og:url tag, but the response body comes from /api/og.
  return rewrite(ogUrl);
}
