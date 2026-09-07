// embedMedia.ts — universal link-embed engine for the Gallery.
//
// The admin pastes a Facebook post / video / reel / watch / share link (or a
// YouTube link) into Admin Gallery → this module detects WHAT it is and builds
// the official embed URL so the site renders it natively, with its real
// thumbnail, inside our own pages (no new tabs, no external navigation).
//
// Embedded media is stored in gallery_photos as an ordinary row:
//   photo_url  = the ORIGINAL pasted link (facebook.com/… / youtu.be/…)
//   media_type = "video"
// so NO database migration is needed and every consumer (public gallery,
// admin grid, student dashboard) detects the provider from the URL itself.

export type EmbedProvider = "facebook" | "youtube";
export type EmbedKind = "video" | "post";

export interface EmbedInfo {
  provider: EmbedProvider;
  kind: EmbedKind;
  /** Human label shown in the admin panel, e.g. "Facebook Reel". */
  label: string;
  /** Short grid-badge text: VIDEO / REEL / POST. */
  badge: string;
  /** Ready-to-use iframe src (official FB plugin / privacy-enhanced YT). */
  embedUrl: string;
  /** width ÷ height of the natural player, for aspect-ratio containers. */
  aspect: number;
  originalUrl: string;
}

/** allow= attribute required by FB/YouTube iframe players (inline playback). */
export const EMBED_IFRAME_ALLOW =
  "autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share";

const FB_HOST = /^(?:[a-z0-9-]+\.)*facebook\.com$/i;
const FB_SHORT_HOST = /^(?:fb\.watch|fb\.me|fb\.gg)$/i;

/**
 * Trim, add https:// when missing and normalise mobile hosts
 * (m./web./mbasic./touch. facebook → www.; m./music. youtube → www.)
 * so the same pasted link always produces the same stored URL.
 */
export function normalizeMediaUrl(raw: string): string {
  let url = (raw || "").trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) url = "https://" + url.replace(/^\/+/, "");
  try {
    const u = new URL(url);
    if (FB_HOST.test(u.hostname)) u.hostname = "www.facebook.com";
    if (/^(?:m|music)\.youtube\.com$/i.test(u.hostname))
      u.hostname = "www.youtube.com";
    return u.toString();
  } catch {
    return url;
  }
}

/* ─────────────────────────── YouTube ─────────────────────────── */

function parseYouTube(
  u: URL
): { id: string; short: boolean; live: boolean } | null {
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const isYt =
    host === "youtu.be" ||
    host === "youtube.com" ||
    host === "youtube-nocookie.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com";
  if (!isYt) return null;

  if (host === "youtu.be") {
    const id = u.pathname.split("/").filter(Boolean)[0] || "";
    return /^[\w-]{6,}$/.test(id) ? { id, short: false, live: false } : null;
  }
  if (u.pathname === "/watch" || u.pathname === "/watch/") {
    const id = u.searchParams.get("v") || "";
    return /^[\w-]{6,}$/.test(id)
      ? { id, short: false, live: false }
      : null;
  }
  const m = u.pathname.match(/\/(shorts|embed|v|live)\/([\w-]{6,})/);
  if (m) return { id: m[2], short: m[1] === "shorts", live: m[1] === "live" };
  return null;
}

/* ─────────────────────────── Facebook ─────────────────────────── */

function buildFbEmbed(
  originalUrl: string,
  kind: EmbedKind,
  label: string,
  badge: string
): EmbedInfo {
  const enc = encodeURIComponent(originalUrl);
  const embedUrl =
    kind === "video"
      ? `https://www.facebook.com/plugins/video.php?href=${enc}&show_text=false&width=560`
      : `https://www.facebook.com/plugins/post.php?href=${enc}&show_text=false&width=500&adaptive=true`;
  return {
    provider: "facebook",
    kind,
    label,
    badge,
    embedUrl,
    aspect: kind === "video" ? 16 / 9 : 4 / 5,
    originalUrl,
  };
}

function parseFacebook(u: URL, originalUrl: string): EmbedInfo | null {
  const host = u.hostname.toLowerCase().replace(/^www\./, "");

  // fb.watch / fb.me short links
  if (!FB_HOST.test(u.hostname)) {
    if (FB_SHORT_HOST.test(u.hostname)) {
      // fb.watch → video share; fb.me → post/page share
      return host === "fb.watch"
        ? buildFbEmbed(originalUrl, "video", "Facebook Video", "VIDEO")
        : buildFbEmbed(originalUrl, "post", "Facebook Post", "POST");
    }
    return null;
  }

  const p = u.pathname;
  const hasVidParam = p === "/watch" || p.startsWith("/watch/");

  // VIDEO family (play with the official video plugin, 16:9)
  if (
    /\/reels?\//.test(p) ||
    /\/share\/r\//.test(p) ||
    /\/videos?\//.test(p) ||
    /\/share\/v\//.test(p) ||
    hasVidParam ||
    /\/live\//.test(p) ||
    /\/video\.php/.test(p)
  ) {
    const isReel = /\/reels?\//.test(p) || /\/share\/r\//.test(p);
    return buildFbEmbed(
      originalUrl,
      "video",
      isReel ? "Facebook Reel" : "Facebook Video",
      isReel ? "REEL" : "VIDEO"
    );
  }

  // POST family (play with the official post plugin, 4:5 card)
  if (
    /\/posts?\//.test(p) ||
    /\/permalink\.php/.test(p) ||
    /\/story\.php/.test(p) ||
    /\/photo(\.php)?($|\/)/.test(p) ||
    u.searchParams.has("fbid") ||
    /\/share\/p\//.test(p) ||
    /\/groups\//.test(p) ||
    /\/share\//.test(p) || // generic share codes, e.g. /share/1EERTSk1W7/
    /\/(events|notes|questions)\//.test(p)
  ) {
    return buildFbEmbed(originalUrl, "post", "Facebook Post", "POST");
  }

  // Any other facebook.com URL — best effort as a post embed (the admin
  // sees a live preview before saving, so nothing is ever a guess).
  return buildFbEmbed(originalUrl, "post", "Facebook Post", "POST");
}

/* ─────────────────────────── Public API ─────────────────────────── */

/**
 * Detect a Facebook / YouTube link and return everything needed to embed it.
 * Returns null for any other URL (direct Cloudinary files stay images/videos).
 */
export function getEmbedInfo(rawUrl: string): EmbedInfo | null {
  const url = normalizeMediaUrl(rawUrl);
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }

  const yt = parseYouTube(u);
  if (yt) {
    const label = yt.short
      ? "YouTube Short"
      : yt.live
        ? "YouTube Live"
        : "YouTube Video";
    return {
      provider: "youtube",
      kind: "video",
      label,
      badge: "VIDEO",
      embedUrl: `https://www.youtube-nocookie.com/embed/${yt.id}?rel=0&modestbranding=1&playsinline=1`,
      aspect: yt.short ? 9 / 16 : 16 / 9,
      originalUrl: url,
    };
  }

  return parseFacebook(u, url);
}

export const isEmbedUrl = (url: string): boolean => !!getEmbedInfo(url);

/** Real static thumbnail for YouTube embeds (grid cards, no iframe needed). */
export function youTubeThumbnail(url: string): string | null {
  const info = getEmbedInfo(url);
  if (!info || info.provider !== "youtube") return null;
  const m = info.embedUrl.match(/\/embed\/([\w-]+)/);
  return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : null;
}
