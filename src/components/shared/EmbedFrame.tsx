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

import { memo } from "react";
import { getEmbedInfo, EMBED_IFRAME_ALLOW } from "@/lib/embedMedia";

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
  const info = getEmbedInfo(url);
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
