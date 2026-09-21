import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from "framer-motion";
import { cn } from "@/lib/utils";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HOLO CARD — "Holographic 3D Tilt" result card 🪄
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Wraps any result card and turns it into a physical, premium metal card:
//   • 3D tilt — rotateX / rotateY follow the cursor (mouse) or the finger
//     (touch drag), smoothed by springs so it feels weighted, not jittery.
//   • Holographic foil sheen — a rainbow gradient layer and a warm specular
//     highlight that both SLIDE with the pointer (like foil catching light).
//   • Gold glint — a bright light that travels along the card's top gold
//     hairline toward the pointer, so the gold accents "catch the light".
//
// SMOOTHNESS CONTRACT (why it never heats up a low-end phone):
//   • EVERY visual update is transform / opacity only — no layout, no filters,
//     no animated box-shadows, no blend-mode repaints of the page.
//   • Pointer events are rAF-throttled: one getBoundingClientRect + at most
//     four MotionValue writes per frame. MotionValues bypass React entirely,
//     so a tilt costs ZERO React re-renders.
//   • `touch-action: pan-y` keeps vertical scrolling native; only horizontal
//     finger drags tilt the card, and scroll always wins via pointercancel.
//   • Reduced-motion users get a plain static card (all layers removed).
//   • On coarse (touch) pointers the max tilt is clamped lower so it reads as
//     premium, never seasick.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

interface HoloCardProps {
  children: ReactNode;
  /** Outer wrapper classes — layout sizing only (e.g. "w-full"). */
  className?: string;
  /** The tilting surface — carry the card's look here (bg, border, radius, shadow, overflow-hidden). */
  surfaceClassName?: string;
  /** Max tilt in degrees on a mouse. Touch pointers are clamped lower automatically. */
  maxTilt?: number;
  /** Moving light glint along the top hairline (gold catching the light). */
  glint?: boolean;
  /** Hard off-switch — renders plain divs with the exact same DOM shape (used under the scratch foil). */
  disabled?: boolean;
}

const HoloCard = memo(function HoloCard({
  children,
  className,
  surfaceClassName,
  maxTilt = 10,
  glint = true,
  disabled = false,
}: HoloCardProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef(0);
  const evRef = useRef<{ x: number; y: number } | null>(null);

  const [reduced, setReduced] = useState(false);
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    setReduced(prefersReducedMotion());
    setCoarse(window.matchMedia?.("(pointer: coarse)").matches ?? false);
  }, []);

  // ── Motion values (pointer state) — never trigger a React render ──
  const nx = useMotionValue(0.5); // normalized 0..1 across the card
  const ny = useMotionValue(0.42);
  const gx = useMotionValue(0); // px inside the card (specular sheen)
  const gy = useMotionValue(0);
  // holo foil intensity — grows as the card tilts away from center
  const holoO = useMotionValue(0.16);

  const snx = useSpring(nx, { stiffness: 160, damping: 20, mass: 0.55 });
  const sny = useSpring(ny, { stiffness: 160, damping: 20, mass: 0.55 });
  const sgx = useSpring(gx, { stiffness: 120, damping: 18, mass: 0.6 });
  const sgy = useSpring(gy, { stiffness: 120, damping: 18, mass: 0.6 });

  const tilt = coarse ? Math.min(maxTilt, 7) : maxTilt;
  const rotateX = useTransform(sny, [0, 1], [tilt, -tilt]);
  const rotateY = useTransform(snx, [0, 1], [-tilt, tilt]);

  // Rainbow foil sweep — % of the oversized foil layer's own size
  const holoX = useTransform(snx, [0, 1], ["16%", "-16%"]);
  const holoY = useTransform(sny, [0, 1], ["14%", "-14%"]);
  // Gold hairline glint — % of the glint's own width (34% of card), sweeps the full hairline
  const glintX = useTransform(snx, [0, 1], ["-45%", "390%"]);

  // Center the sheen near the top-center on mount so the card always wears a
  // gentle premium lighting even before the first interaction.
  useLayoutEffect(() => {
    if (disabled || reduced) return;
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    gx.set(r.width * 0.5);
    gy.set(r.height * 0.3);
  }, [disabled, reduced, gx, gy]);

  const apply = useCallback(() => {
    rafRef.current = 0;
    const ev = evRef.current;
    const el = rootRef.current;
    if (!ev || !el) return;
    const r = el.getBoundingClientRect();
    const cx = clamp01((ev.x - r.left) / r.width);
    const cy = clamp01((ev.y - r.top) / r.height);
    nx.set(cx);
    ny.set(cy);
    gx.set(ev.x - r.left);
    gy.set(ev.y - r.top);
    const mag = Math.min(1, Math.hypot(cx - 0.5, cy - 0.5) * 2.1);
    holoO.set(0.14 + mag * 0.24);
  }, [nx, ny, gx, gy, holoO]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || reduced) return;
      evRef.current = { x: e.clientX, y: e.clientY };
      if (!rafRef.current) rafRef.current = requestAnimationFrame(apply);
    },
    [disabled, reduced, apply]
  );

  const reset = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    evRef.current = null;
    const el = rootRef.current;
    const r = el?.getBoundingClientRect();
    nx.set(0.5);
    ny.set(0.42);
    gx.set((r?.width ?? 0) * 0.5);
    gy.set((r?.height ?? 0) * 0.3);
    holoO.set(0.16);
  }, [nx, ny, gx, gy, holoO]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Off state: identical DOM shape, zero motion, zero listeners ──
  if (disabled || reduced) {
    return (
      <div className={cn("relative", className)}>
        <div className={cn("relative", surfaceClassName)}>{children}</div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={cn("relative [perspective:1100px]", className)}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      onPointerCancel={reset}
      style={{ touchAction: "pan-y" }}
    >
      <motion.div
        className={cn("relative", surfaceClassName)}
        style={{
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
          willChange: "transform",
        }}
      >
        {children}

        {/* ── Holographic layers — clipped to the card, transform-only ── */}
        <div
          className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
          style={{ borderRadius: "inherit" }}
          aria-hidden
        >
          {/* Rainbow foil — slides with the pointer, intensifies with tilt */}
          <motion.div
            className="absolute -left-[40%] -top-[45%] h-[190%] w-[180%]"
            style={{
              x: holoX,
              y: holoY,
              opacity: holoO,
              background:
                "linear-gradient(115deg, rgba(255,0,132,0.42) 0%, rgba(255,150,0,0.36) 16%, rgba(255,220,0,0.3) 30%, rgba(0,225,150,0.36) 46%, rgba(0,130,255,0.4) 62%, rgba(160,60,255,0.38) 78%, rgba(0,229,255,0.4) 100%)",
              mixBlendMode: "overlay",
              willChange: "transform, opacity",
            }}
          />
          {/* Warm gold glow — makes gold accents catch the light under the pointer */}
          <motion.div
            className="absolute left-0 top-0 h-[260px] w-[260px] rounded-full"
            style={{
              x: sgx,
              y: sgy,
              marginLeft: -130,
              marginTop: -130,
              background:
                "radial-gradient(circle, rgba(255,196,88,0.55) 0%, rgba(255,170,40,0.22) 40%, rgba(255,170,40,0) 68%)",
              mixBlendMode: "soft-light",
              opacity: 0.9,
              willChange: "transform",
            }}
          />
          {/* Specular sheen — the foil highlight itself */}
          <motion.div
            className="absolute left-0 top-0 h-[300px] w-[300px] rounded-full"
            style={{
              x: sgx,
              y: sgy,
              marginLeft: -150,
              marginTop: -150,
              background:
                "radial-gradient(circle, rgba(255,244,214,0.42) 0%, rgba(255,244,214,0.14) 36%, rgba(255,244,214,0) 62%)",
              mixBlendMode: "screen",
              opacity: 0.8,
              willChange: "transform",
            }}
          />
          {/* Gold hairline glint — a light that rides the top edge */}
          {glint && (
            <motion.div
              className="absolute left-0 top-0 h-[3px] w-[34%]"
              style={{
                x: glintX,
                background:
                  "linear-gradient(90deg, rgba(255,240,200,0) 0%, rgba(255,240,200,0.85) 42%, rgba(255,255,255,0.98) 50%, rgba(255,240,200,0.85) 58%, rgba(255,240,200,0) 100%)",
                boxShadow: "0 0 14px rgba(250,185,71,0.75)",
                willChange: "transform",
              }}
            />
          )}
        </div>
      </motion.div>
    </div>
  );
});

/** Utility type so parents can pass MotionValue-derived styles if they ever need to. */
export type { MotionValue };
export default HoloCard;
