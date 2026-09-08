// EmbedFrame.tsx — shared iframe wrapper for embedded Facebook / YouTube media.
//
// The PARENT owns sizing: pass className="absolute inset-0 w-full h-full"
// inside an aspect-ratio container (grid card, lightbox stage, admin preview).
//
// interactive=false → hover-through live thumbnail preview (pointer-events
// disabled so the card's own click opens the lightbox — no accidental
// navigation, nothing opens in a new tab).
// interactive=true  → full player (lightbox / admin preview), still 100%
// inline inside our page.
//
// FACEBOOK SHARE LINKS: a pasted /share/… link is a redirect shortcut that
// Facebook's own embed plugin cannot display (it shows "Video Unavailable").
// Before rendering the iframe we resolve such links to their canonical
// permalink via /api/resolve-fb (cached per session, graceful fallback to
// the original URL). This fixes the admin preview, the public gallery AND
// every album row that was saved with a share link — no re-saving needed.

import { memo, useEffect, useState } from "react";
import { getEmbedInfo, EMBED_IFRAME_ALLOW, resolveMediaUrl } from "@/lib/embedMedia";

interface EmbedFrameProps {
  url: string;
  interactive?: boolean;
  title?: string;
  className?: string;
}

const EmbedFrame = ({
  url,
  interactive = false,
  title = "Embedded video",
  className,
}: EmbedFrameProps) => {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setSrc(null);
    resolveMediaUrl(url)
      .then((resolved) => {
        if (alive) setSrc(resolved || url);
      })
      .catch(() => {
        if (alive) setSrc(url);
      });
    return () => {
      alive = false;
    };
  }, [url]);

  if (src === null) {
    // Resolving (only for share links — instant for direct URLs, which
    // resolve synchronously to themselves in the same tick).
    return (
      <div
        className={className}
        style={{ border: 0, pointerEvents: "none" }}
        aria-label="Loading embed"
      >
        <div className="absolute inset-0 animate-pulse bg-black/80" />
      </div>
    );
  }

  const info = getEmbedInfo(src) || getEmbedInfo(url);
  if (!info) return null;
  return (
    <iframe
      src={info.embedUrl}
      title={title}
      loading="lazy"
      allow={EMBED_IFRAME_ALLOW}
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      className={className}
      style={{ border: 0, pointerEvents: interactive ? "auto" : "none" }}
    />
  );
};

export default memo(EmbedFrame);
