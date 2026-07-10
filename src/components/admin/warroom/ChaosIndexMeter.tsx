// src/components/admin/warroom/ChaosIndexMeter.tsx
// ─────────────────────────────────────────────────────────────────────────────
// A circular gauge (SVG arc) showing the War Room's CHAOS INDEX — a single
// 0..100 score combining not-marked, absent, and adjacency-conflict ratios.
//
// Colour bands:
//   0–20   green   (calm)
//   21–50  amber   (some action)
//   51–75  orange  (serious)
//   76–100 red     (chaos — intervene)
//
// Mobile-friendly: scales with its container (uses viewBox + preserveAspectRatio).
// Pulses (CSS animation) when score ≥ 76.
// ─────────────────────────────────────────────────────────────────────────────

import { motion } from "framer-motion";
import { chaosIndexBand } from "@/hooks/useExamWarRoom";

interface Props {
  score: number; // 0..100
  size?: number; // px — defaults to 120
}

const BAND_META: Record<
  ReturnType<typeof chaosIndexBand>,
  { color: string; bg: string; label: string; pulse: boolean }
> = {
  low:      { color: "#10b981", bg: "rgba(16,185,129,0.12)",  label: "Calm",      pulse: false },
  medium:   { color: "#f59e0b", bg: "rgba(245,158,11,0.14)",  label: "Watch",     pulse: false },
  high:     { color: "#f97316", bg: "rgba(249,115,22,0.18)",  label: "Alert",     pulse: false },
  critical: { color: "#ef4444", bg: "rgba(239,68,68,0.20)",   label: "Chaos",     pulse: true  },
};

export default function ChaosIndexMeter({ score, size = 120 }: Props) {
  const band = chaosIndexBand(score);
  const meta = BAND_META[band];

  // Arc geometry — half-circle gauge from -120° to +120° (240° sweep).
  const radius = 50;
  const cx = 60;
  const cy = 60;
  const startAngle = 150; // degrees
  const sweep = 240;
  const endAngle = startAngle + sweep;
  const valueAngle = startAngle + (sweep * Math.max(0, Math.min(100, score))) / 100;

  const polarToCartesian = (angleDeg: number) => {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  };

  const startPt = polarToCartesian(startAngle);
  const endPt = polarToCartesian(endAngle);
  const valuePt = polarToCartesian(valueAngle);

  const trackPath = `M ${startPt.x} ${startPt.y} A ${radius} ${radius} 0 1 1 ${endPt.x} ${endPt.y}`;
  const valuePath = `M ${startPt.x} ${startPt.y} A ${radius} ${radius} 0 ${sweep > 180 ? 1 : 0} 1 ${valuePt.x} ${valuePt.y}`;

  return (
    <div
      className={`relative inline-flex flex-col items-center justify-center rounded-2xl border p-2 transition-colors ${
        meta.pulse ? "animate-pulse" : ""
      }`}
      style={{
        width: size,
        height: size,
        borderColor: meta.color,
        backgroundColor: meta.bg,
      }}
    >
      <svg
        viewBox="0 0 120 120"
        width={size - 16}
        height={size - 16}
        preserveAspectRatio="xMidYMid meet"
        aria-label={`Chaos index ${score} out of 100`}
        role="img"
      >
        {/* Track */}
        <path
          d={trackPath}
          fill="none"
          stroke="currentColor"
          strokeWidth={8}
          strokeLinecap="round"
          className="text-muted-foreground/25"
        />
        {/* Value */}
        <motion.path
          d={valuePath}
          fill="none"
          stroke={meta.color}
          strokeWidth={8}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
        {/* Score text */}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          className="fill-foreground"
          style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
        >
          {Math.round(score)}
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          fill={meta.color}
          style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.6 }}
        >
          {meta.label.toUpperCase()}
        </text>
      </svg>
      <div className="mt-1 text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
        Chaos Index
      </div>
    </div>
  );
}
