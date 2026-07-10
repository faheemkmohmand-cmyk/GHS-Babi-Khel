// src/components/admin/warroom/HallMap2D5.tsx
// ─────────────────────────────────────────────────────────────────────────────
// The 2.5D interactive hall map for the War Room.
//
// Each room is rendered as a "block" with CSS `perspective` + `rotateX` so
// the admin sees the hall at a slight 3D angle (like looking down from the
// invigilator's podium). Each seat is a desk-card with:
//   - a class-coloured avatar circle (initials + class indicator)
//   - a status border (green=present, red=absent, blue=leave, gray=not-marked)
//   - a red "risk halo" if the student has a high historical absentee rate
//   - a heat-map background colour (when showHeatMap=true)
//
// DRAG & DROP — built on native Pointer Events so it works on:
//   - desktop mice (click + drag)
//   - touch screens (touch + drag — long-press not required)
//   - tablets with stylus
// On drop, the pointer's elementFromPoint is used to find the target seat;
// if it's an assigned seat, the parent swaps the two students; if empty,
// the student is moved; if blocked, the drag is cancelled.
//
// MOBILE: the 2.5D perspective can make touch targeting tricky on small
// screens, so on mobile we default to flat-2D mode (auto-detected via
// useIsMobile). The admin can also toggle manually with the "3D / 2D" button.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import type { WarRoomSeat } from "@/hooks/useExamWarRoom";
import type { SeatingRoom } from "@/hooks/useExamSeating";

// Distinct, accessible colors per class — mirrors the palette in AdminExamSeating.
const CLASS_COLORS: Record<string, { dot: string; ring: string; label: string }> = {
  "6":  { dot: "bg-blue-500",     ring: "ring-blue-400",     label: "text-blue-700 dark:text-blue-300" },
  "7":  { dot: "bg-emerald-500",  ring: "ring-emerald-400",  label: "text-emerald-700 dark:text-emerald-300" },
  "8":  { dot: "bg-amber-500",    ring: "ring-amber-400",    label: "text-amber-700 dark:text-amber-300" },
  "9":  { dot: "bg-rose-500",     ring: "ring-rose-400",     label: "text-rose-700 dark:text-rose-300" },
  "10": { dot: "bg-violet-500",   ring: "ring-violet-400",   label: "text-violet-700 dark:text-violet-300" },
};
const classColor = (cls: string | null) =>
  cls && CLASS_COLORS[cls]
    ? CLASS_COLORS[cls]
    : { dot: "bg-slate-400", ring: "ring-slate-400", label: "text-slate-700 dark:text-slate-300" };

// Status → border + glow colour
const STATUS_BORDER: Record<WarRoomSeat["status"], string> = {
  present:    "border-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.4)]",
  absent:     "border-red-500      shadow-[0_0_0_2px_rgba(239,68,68,0.45)]",
  leave:      "border-blue-500     shadow-[0_0_0_2px_rgba(59,130,246,0.4)]",
  not_marked: "border-slate-300 dark:border-slate-600",
};

// Heat-map colour (rgba) for a given risk 0..1
const heatColor = (risk: number): string => {
  if (risk >= 0.75) return "rgba(239,68,68,0.55)";   // red
  if (risk >= 0.5)  return "rgba(249,115,22,0.45)";  // orange
  if (risk >= 0.25) return "rgba(245,158,11,0.35)";  // amber
  if (risk > 0.05)  return "rgba(132,204,22,0.25)";  // lime
  return "rgba(34,197,94,0.10)";                      // green-ish (calm)
};

// Initials helper — "Muhammad Ali" → "MA"
const initials = (name: string | null): string => {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

interface DragState {
  fromKey: string;       // `${roomId}:${row}:${col}`
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  seat: WarRoomSeat;     // seat being dragged
}

interface Props {
  seats: WarRoomSeat[];
  rooms: SeatingRoom[];
  showHeatMap: boolean;
  onSwap: (a: WarRoomSeat, b: WarRoomSeat) => void;
  /** Called when a seat is tapped (no drag) — opens student detail. */
  onSelectSeat?: (seat: WarRoomSeat) => void;
  isSwapPending?: boolean;
}

export default function HallMap2D5({
  seats,
  rooms,
  showHeatMap,
  onSwap,
  onSelectSeat,
  isSwapPending = false,
}: Props) {
  const isMobile = useIsMobile();
  const [flatMode, setFlatMode] = useState<boolean>(false);

  // Auto-enable flat mode on mobile (pointer-event DnD is more reliable
  // without the perspective transform on small touch surfaces).
  useEffect(() => {
    setFlatMode(isMobile);
  }, [isMobile]);

  const dragRef = useRef<DragState | null>(null);
  const [dragGhost, setDragGhost] = useState<{ x: number; y: number; seat: WarRoomSeat } | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  // Index seats by room for rendering
  const roomsWithSeats = rooms.map(room => ({
    room,
    seatGrid: seats.filter(s => s.roomId === room.id),
  }));

  // ── Drag handlers (Pointer Events) ─────────────────────────────────────
  const onAvatarPointerDown = (e: React.PointerEvent, seat: WarRoomSeat) => {
    if (isSwapPending) return;
    if (!seat.studentId) return; // can't drag an empty seat
    // Only react to primary button on mouse
    if (e.pointerType === "mouse" && e.button !== 0) return;

    e.preventDefault();
    const key = `${seat.roomId}:${seat.row}:${seat.col}`;
    dragRef.current = {
      fromKey: key,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      seat,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onAvatarPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    d.currentX = e.clientX;
    d.currentY = e.clientY;
    setDragGhost({ x: e.clientX, y: e.clientY, seat: d.seat });

    // Highlight drop target
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const target = el?.closest("[data-seat-key]") as HTMLElement | null;
    setHoverKey(target?.dataset.seatKey ?? null);
  };

  const finishDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const target = el?.closest("[data-seat-key]") as HTMLElement | null;
    const targetKey = target?.dataset.seatKey ?? null;

    dragRef.current = null;
    setDragGhost(null);
    setHoverKey(null);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }

    if (!targetKey || targetKey === d.fromKey) {
      // No drop target OR same seat → treat as tap (no drag movement)
      const dx = Math.abs(e.clientX - d.startX);
      const dy = Math.abs(e.clientY - d.startY);
      if (dx < 5 && dy < 5 && onSelectSeat) {
        onSelectSeat(d.seat);
      }
      return;
    }

    // Find target seat
    const targetSeat = seats.find(s => `${s.roomId}:${s.row}:${s.col}` === targetKey);
    if (!targetSeat || targetSeat.isBlocked) {
      // Invalid drop — silently reject
      return;
    }
    onSwap(d.seat, targetSeat);
  };

  // Keyboard escape cancels drag
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dragRef.current) {
        dragRef.current = null;
        setDragGhost(null);
        setHoverKey(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const avatarRadius = useCallback((seat: WarRoomSeat) => {
    if (seat.studentRiskBand === "high") return "ring-2 ring-red-500 ring-offset-1";
    if (seat.studentRiskBand === "medium") return "ring-2 ring-amber-400 ring-offset-1";
    return "";
  }, []);

  return (
    <div className="relative">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={() => setFlatMode(f => !f)}
          className="text-[11px] px-2 py-1 rounded-md bg-secondary/60 hover:bg-secondary text-muted-foreground font-medium transition-colors"
          aria-pressed={flatMode}
        >
          {flatMode ? "Switch to 2.5D" : "Switch to 2D"}
        </button>
        <span className="text-[10px] text-muted-foreground hidden sm:inline">
          Drag a student avatar onto another seat to swap. Tap to inspect.
        </span>
      </div>

      {/* Hall rendering — one block per room */}
      <div className="space-y-6">
        {roomsWithSeats.map(({ room, seatGrid }) => {
          // Build a 2D matrix for this room: rows × cols
          const matrix: (WarRoomSeat | null)[][] = [];
          for (let r = 0; r < room.rows; r++) {
            matrix[r] = [];
            for (let c = 0; c < room.cols; c++) {
              matrix[r][c] = seatGrid.find(s => s.row === r && s.col === c) ?? null;
            }
          }

          return (
            <div key={room.id} className="rounded-2xl border bg-card/40 p-3 sm:p-4">
              {/* Room header */}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold tracking-tight">{room.name}</h3>
                  <Badge2>{room.rows}×{room.cols}</Badge2>
                  {room.invigilators && room.invigilators.length > 0 && (
                    <span className="text-[10px] text-muted-foreground hidden sm:inline">
                      Invig: {room.invigilators.join(", ")}
                    </span>
                  )}
                </div>
                {/* "Front of hall" label — row 0 is front */}
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground/70 font-semibold">
                  ⬇ Front of Hall (Row 1) ⬇
                </span>
              </div>

              {/* 2.5D container */}
              <div
                className="overflow-x-auto pb-2"
                style={{
                  perspective: flatMode ? "none" : "1100px",
                }}
              >
                <div
                  className="inline-block origin-top transition-transform duration-300"
                  style={{
                    transform: flatMode ? "none" : "rotateX(22deg)",
                    transformStyle: "preserve-3d",
                  }}
                >
                  <div
                    className="inline-grid gap-1 sm:gap-1.5"
                    style={{
                      gridTemplateColumns: `repeat(${room.cols}, minmax(34px, 1fr))`,
                    }}
                  >
                    {Array.from({ length: room.rows * room.cols }).map((_, idx) => {
                      const r = Math.floor(idx / room.cols);
                      const c = idx % room.cols;
                      const seat = matrix[r][c];
                      if (!seat) return null;
                      return (
                        <SeatCell
                          key={`${room.id}:${r}:${c}`}
                          seat={seat}
                          showHeatMap={showHeatMap}
                          flatMode={flatMode}
                          isHover={hoverKey === `${room.id}:${r}:${c}`}
                          isDragSource={dragRef.current?.fromKey === `${room.id}:${r}:${c}`}
                          avatarRadius={avatarRadius(seat)}
                          onPointerDown={e => onAvatarPointerDown(e, seat)}
                          onPointerMove={onAvatarPointerMove}
                          onPointerUp={finishDrag}
                          onPointerCancel={finishDrag}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating drag ghost — follows the pointer */}
      <AnimatePresence>
        {dragGhost && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 0.95, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-1/2"
            style={{ left: dragGhost.x, top: dragGhost.y }}
          >
            <AvatarDisk seat={dragGhost.seat} size={44} dragging />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-muted-foreground">
        <span className="font-semibold uppercase tracking-wide">Legend:</span>
        <LegendDot color="bg-emerald-500" label="Present" />
        <LegendDot color="bg-red-500"      label="Absent" />
        <LegendDot color="bg-blue-500"     label="Leave" />
        <LegendDot color="bg-slate-400"    label="Not Marked" />
        <LegendDot color="bg-foreground/20" label="Blocked / Empty" />
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full ring-2 ring-red-500" />
          = high-risk student (frequent absentee)
        </span>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SeatCell({
  seat,
  showHeatMap,
  flatMode,
  isHover,
  isDragSource,
  avatarRadius,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  seat: WarRoomSeat;
  showHeatMap: boolean;
  flatMode: boolean;
  isHover: boolean;
  isDragSource: boolean;
  avatarRadius: string;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
}) {
  const cc = classColor(seat.studentClass);

  if (seat.isBlocked) {
    return (
      <div
        data-seat-key={`${seat.roomId}:${seat.row}:${seat.col}`}
        className="rounded-md border border-dashed border-foreground/15 bg-foreground/5 flex items-center justify-center text-foreground/30 text-[10px]"
        style={{ minHeight: flatMode ? 34 : 44, minWidth: 34 }}
        title="Blocked"
      >
        ✕
      </div>
    );
  }

  // Heat-map background intensity
  const heatStyle = showHeatMap && seat.studentId
    ? { backgroundColor: heatColor(seat.risk) }
    : undefined;

  return (
    <div
      data-seat-key={`${seat.roomId}:${seat.row}:${seat.col}`}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className={`relative rounded-md border transition-all ${
        seat.studentId
          ? STATUS_BORDER[seat.status]
          : "border-foreground/10 bg-foreground/5"
      } ${
        isHover && seat.studentId ? "ring-2 ring-blue-400 scale-105" : ""
      } ${isDragSource ? "opacity-40" : ""}`}
      style={{
        minHeight: flatMode ? 42 : 54,
        minWidth: 34,
        ...heatStyle,
        cursor: seat.studentId ? "grab" : "default",
        touchAction: "none", // critical for pointer-event dragging on touch
      }}
    >
      {/* Seat label (top-left) */}
      <div className="absolute top-0 left-0.5 text-[7px] sm:text-[8px] text-foreground/40 font-mono leading-none pointer-events-none">
        R{seat.row + 1}·S{seat.col + 1}
      </div>

      {seat.studentId ? (
        <div
          onPointerDown={onPointerDown}
          className="absolute inset-0 flex flex-col items-center justify-center px-0.5 pt-1.5 pb-0.5 select-none"
          style={{ touchAction: "none" }}
        >
          <AvatarDisk seat={seat} size={flatMode ? 22 : 28} dragging={false} extraClass={avatarRadius} />
          <div className={`text-[7px] sm:text-[8px] font-semibold leading-tight mt-0.5 truncate max-w-full ${cc.label}`}>
            {seat.studentName?.split(" ")[0] ?? "?"}
          </div>
          <div className="text-[6px] sm:text-[7px] text-muted-foreground font-mono leading-none truncate max-w-full">
            {seat.examRollNo ?? seat.classRollNo ?? ""}
          </div>
          {/* Conflict flag */}
          {seat.hasAdjacencyConflict && (
            <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 ring-1 ring-card" title="Same-class neighbour" />
          )}
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-[8px] text-muted-foreground/30 font-mono">
          —
        </div>
      )}
    </div>
  );
}

function AvatarDisk({
  seat,
  size,
  dragging,
  extraClass = "",
}: {
  seat: WarRoomSeat;
  size: number;
  dragging: boolean;
  extraClass?: string;
}) {
  const cc = classColor(seat.studentClass);
  return (
    <div
      className={`relative rounded-full ${cc.dot} ${cc.ring} ring-2 flex items-center justify-center text-white font-bold ${extraClass} ${
        dragging ? "shadow-2xl scale-105" : ""
      }`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials(seat.studentName)}
      {/* Status pip */}
      {seat.status !== "not_marked" && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-1 ring-card ${
            seat.status === "present" ? "bg-emerald-300" : seat.status === "absent" ? "bg-red-300" : "bg-blue-300"
          }`}
        />
      )}
    </div>
  );
}

function Badge2({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-secondary text-muted-foreground">
      {children}
    </span>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}
