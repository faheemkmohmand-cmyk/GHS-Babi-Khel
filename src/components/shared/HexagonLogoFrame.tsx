/**
 * HexagonLogoFrame — wraps the existing school logo (image or fallback icon)
 * in a stylish gold-bordered hexagon, inspired by a reference design.
 *
 * Purely decorative/additive: it does not replace or change what logo is
 * shown, it just frames whatever is passed as children (the real uploaded
 * school photo, or the GraduationCap fallback icon) inside a hexagon shape
 * with a subtle gold outline + soft glow, matching the "little bright golden
 * logo Hexagon" look.
 */
export function HexagonLogoFrame({
  size = 40,
  children,
}: {
  size?: number;
  children: React.ReactNode;
}) {
  // Hexagon clip-path (flat-top hexagon, matches reference proportions).
  const clipPath = "polygon(50% 0%, 95% 25%, 95% 75%, 50% 100%, 5% 75%, 5% 25%)";

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      {/* Gold outline hexagon, sits slightly larger than the content hexagon
          to create a thin gold border effect. */}
      <div
        className="absolute inset-0 bg-gold"
        style={{ clipPath }}
      />
      {/* Content hexagon (the actual logo image/icon), inset by ~1.5px to
          reveal the gold border underneath. */}
      <div
        className="absolute overflow-hidden bg-primary flex items-center justify-center"
        style={{
          inset: Math.max(1.5, size * 0.035),
          clipPath,
        }}
      >
        {children}
      </div>
      {/* Soft gold glow behind the hexagon for a subtle "bright" effect. */}
      <div
        className="absolute -inset-1 -z-10 rounded-full bg-gold/25 blur-md"
        aria-hidden
      />
    </div>
  );
}

export default HexagonLogoFrame;
