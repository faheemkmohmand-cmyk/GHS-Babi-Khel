// api/rss.js
// Vercel Serverless Function — generates an RSS 2.0 feed for news & notices.
// This enables content distribution via RSS readers and improves discoverability.
// Access at: /api/rss

import { createClient } from "@supabase/supabase-js";

const SITE_URL = "https://ghsbabikhel.indevs.in";
const SITE_NAME = "GHS Babi Khel";
const SITE_DESC = "Government High School Babi Khel, District Mohmand, KPK Pakistan — latest news, notices and announcements.";

function escapeXml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export default async function handler(req, res) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  let newsItems = [];
  let noticeItems = [];

  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);

      const [newsRes, noticesRes] = await Promise.all([
        supabase.from("news").select("id, title, content, image_url, created_at").order("created_at", { ascending: false }).limit(20),
        supabase.from("notices").select("id, title, content, category, is_urgent, created_at").order("created_at", { ascending: false }).limit(20),
      ]);

      newsItems = (newsRes.data || []).map((n) => ({
        title: n.title,
        link: `${SITE_URL}/news/${n.id}`,
        description: escapeXml((n.content || "").slice(0, 300)),
        pubDate: new Date(n.created_at).toUTCString(),
        category: "News",
        image: n.image_url || "",
      }));

      noticeItems = (noticesRes.data || []).map((n) => ({
        title: `${n.is_urgent ? "[URGENT] " : ""}${n.title}`,
        link: `${SITE_URL}/notices/${n.id}`,
        description: escapeXml((n.content || "").slice(0, 300)),
        pubDate: new Date(n.created_at).toUTCString(),
        category: n.category || "Notice",
        image: "",
      }));
    } catch (err) {
      console.error("RSS feed DB error:", err.message);
    }
  }

  // Merge and sort by date (newest first)
  const allItems = [...newsItems, ...noticeItems]
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, 30);

  const itemsXml = allItems
    .map(
      (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${item.link}</link>
      <description>${item.description}</description>
      <category>${escapeXml(item.category)}</category>
      <pubDate>${item.pubDate}</pubDate>
      <guid isPermaLink="true">${item.link}</guid>
    </item>`
    )
    .join("\n");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_NAME)}</title>
    <link>${SITE_URL}</link>
    <description>${escapeXml(SITE_DESC)}</description>
    <language>en-PK</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/api/rss" rel="self" type="application/rss+xml" />
 ${itemsXml}
  </channel>
</rss>`;

  res.setHeader("Content-Type", "application/rss+xml");
  res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=3600");
  return res.status(200).send(rss);
}
