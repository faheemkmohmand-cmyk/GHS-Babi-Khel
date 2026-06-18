// middleware.ts
// Vercel Routing Middleware — runs before the SPA shell is served.
//
// PROBLEM: index.html is an empty shell; all <meta>/OG/Twitter tags are
// injected by React Helmet AFTER JavaScript runs. Social scrapers
// (WhatsApp, Facebook, LinkedIn, X/Twitter, Slack, Discord, iMessage)
// do NOT execute JavaScript — they read the raw HTML once and stop. So
// every shared link previews with no image/description, just a bare URL.
//
// FIX: detect known bot/crawler User-Agents and, for those requests only,
// rewrite to /api/og (a serverless function that returns fully-formed
// static HTML with the correct title/description/OG/Twitter tags for the
// requested path). Regular browsers are completely untouched and still
// get the normal SPA — this only affects non-JS-executing scrapers.
//
// Google/Bing are NOT included below on purpose: their crawlers DO render
// JavaScript, so organic search already works fine via React Helmet, and
// routing them through /api/og as well would be redundant.

import { rewrite } from "@vercel/functions";

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

export default function middleware(request: Request) {
  const ua = (request.headers.get("user-agent") || "").toLowerCase();
  const isBot = BOT_USER_AGENTS.some((bot) => ua.includes(bot));

  if (!isBot) {
    // Regular users / Googlebot / Bingbot → untouched, normal SPA.
    return;
  }

  const url = new URL(request.url);
  const ogUrl = new URL("/api/og", url.origin);
  ogUrl.searchParams.set("path", url.pathname);

  // Internal rewrite — the crawler still sees the original URL in its
  // address bar / og:url tag, but the response body comes from /api/og.
  return rewrite(ogUrl);
}
