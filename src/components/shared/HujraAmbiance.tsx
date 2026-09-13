import { useLocation } from "react-router-dom";

/**
 * Lantern Mode — The Hujra Reading Experience (ambience layer).
 *
 * Mounted ONCE in App.tsx. It renders nothing unless the visitor is on a
 * reading page (Notes, News, Notices — list + detail routes). Even on those
 * routes the layers are CSS-gated to `html.theme-lantern`, so the component
 * is completely inert in Bright/Dark themes.
 *
 * What the visitor sees in Lantern Mode on those pages:
 *   • a warm kerosene wash rising from the top of the room,
 *   • a lantern glow breathing in the corner (two desynced prime-duration
 *     flicker layers + a small flame wick — never looks looped),
 *   • hujra vignette — the edges of the room fall into warm darkness.
 *
 * Purely decorative: fixed, pointer-events-none, aria-hidden, opacity-only
 * animations (Android-Chrome GPU-safe). No buttons, no chrome — Lantern
 * Mode is chosen from the existing theme switcher like any other theme.
 */

const HUJRA_ROUTE = /^\/(notes|news|notices)(\/|$)/;

const HujraAmbiance = () => {
  const location = useLocation();

  // Reading pages only: /notes, /notes/:subject, /notes/:subject/:chapter,
  // /news, /news/:id, /notices, /notices/:id
  if (!HUJRA_ROUTE.test(location.pathname)) return null;

  return (
    <div className="hujra-ambient" aria-hidden="true">
      <div className="hujra-wash" />
      <div className="hujra-glow hujra-glow-b" />
      <div className="hujra-glow hujra-glow-a" />
      <div className="hujra-wick" />
      <div className="hujra-vignette" />
    </div>
  );
};

export default HujraAmbiance;
