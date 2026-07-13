/**
 * Hall3DView.tsx
 * Full-screen 3D Hall overlay for the Exam Seating Plan Editor.
 *
 * Renders the uploaded Hall_3D.html scene inside an <iframe> and controls it
 * via postMessage. All React Query data fetching (plan + live attendance)
 * happens on the parent side; the iframe is purely a renderer.
 *
 * Features (all 6 required):
 *  1. Live Seat Highlight Search — type roll no → camera flies, chair glows,
 *     student info panel opens.
 *  2. Invigilator Mode — pick a room+invigilator → floor bands on duty rows,
 *     walking path from staff chair, staff ring highlight.
 *  3. Attendance Heat Map — green=present, red=absent, yellow=not-scanned.
 *     Updates live from useLiveAttendance (same source as the Live Console).
 *  4. Auto Camera Flythrough — 7-step cinematic camera tour.
 *  5. Seat Desk Sticker Visualization — click any chair → student data,
 *     roll number, class, QR code appear in the info panel.
 *  6. Student Seat Finder — enter roll no → "Find & Flash" button does a
 *     pulsing glow + camera fly (more dramatic than the subtle highlight).
 *
 * The 3D scene's geometry, lighting, materials, and render loop are NEVER
 * touched — all interaction is via postMessage commands that the extension
 * script in Hall_3D.html handles.
 */
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  useSeatingPlan,
  useLiveAttendance,
  getEffectiveExamDate,
  encodeSeatingQRData,
  type SeatingPlanFull,
} from "@/hooks/useExamSeating";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  X, Search, MapPin, Users, Clock, Activity, Eye, Plane, RefreshCw,
  Grid3x3, Building2, User, Hash, ScanLine, Play, ChevronDown, Layers,
  Navigation, Camera,
} from "lucide-react";
import toast from "react-hot-toast";
import QRCode from "qrcode";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChairAssignment {
  chairIdx: number;
  studentId: string;
  studentName: string;
  examRollNo: string;
  class: string;
  classRollNo: string;
  roomName: string;
  roomId: string;
  rowIdx: number;
  colIdx: number;
  seatLabel: string;
}

type Mode = "overview" | "heatmap" | "invigilator";

interface Props {
  planId: string;
  onClose: () => void;
}

// 3D Hall has 120 chairs (10 rows × 12 cols in 3 sections of 4)
const TOTAL_3D_CHAIRS = 120;

// Class colors (match admin tab + 3D extension script)
const CLASS_BG: Record<string, string> = {
  "6": "bg-blue-500", "7": "bg-emerald-500", "8": "bg-amber-500",
  "9": "bg-rose-500", "10": "bg-violet-500",
};

// Invigilator duty colors (match extension script palette)
const DUTY_COLORS = [0x3b82f6, 0x10b981, 0xf59e0b, 0xef4444, 0x8b5cf6, 0x06b6d4];
const DUTY_COLOR_CSS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

// ─── Helper: format duration for countdown ──────────────────────────────────

function formatDuration(ms: number): string {
  if (ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Hall3DView({ planId, onClose }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [mode, setMode] = useState<Mode>("overview");
  const [searchRoll, setSearchRoll] = useState("");
  const [selectedInvigilator, setSelectedInvigilator] = useState<{ roomIdx: number; invIdx: number } | null>(null);
  const [clickedAssignment, setClickedAssignment] = useState<ChairAssignment | null>(null);
  const [flythroughActive, setFlythroughActive] = useState(false);
  const [flythroughStep, setFlythroughStep] = useState({ step: 0, total: 0, label: "", loop: 1 });
  const [qrUrl, setQrUrl] = useState("");
  // Panel is HIDDEN by default — user taps the toggle button (top-left) to show it.
  const [panelOpen, setPanelOpen] = useState(false);

  // ── Data: plan + live attendance ───────────────────────────────────────────
  const { data: plan, isLoading: planLoading } = useSeatingPlan(planId);
  const examDate = plan ? getEffectiveExamDate(plan) : null;
  const { data: attendance = [] } = useLiveAttendance(examDate, plan?.session_id, plan?.paper_subject);

  // ── Build chair assignments (sequential fill across rooms) ─────────────────
  const assignmentsWithChairs = useMemo<ChairAssignment[]>(() => {
    if (!plan) return [];
    const result: ChairAssignment[] = [];
    let chairIdx = 0;
    for (const room of plan.rooms) {
      // Sort assignments by (row_idx, col_idx) so the 3D layout roughly
      // preserves the 2D grid order (row-major → 3D row-major).
      const sorted = [...room.assignments].sort((a, b) =>
        a.row_idx !== b.row_idx ? a.row_idx - b.row_idx : a.col_idx - b.col_idx
      );
      for (const a of sorted) {
        if (chairIdx >= TOTAL_3D_CHAIRS) break;
        result.push({
          chairIdx,
          studentId: a.student_id,
          studentName: a.student_name,
          examRollNo: a.exam_roll_no,
          class: a.class,
          classRollNo: a.class_roll_no,
          roomName: room.name,
          roomId: room.id,
          rowIdx: a.row_idx,
          colIdx: a.col_idx,
          seatLabel: a.seat_label,
        });
        chairIdx++;
      }
    }
    return result;
  }, [plan]);

  // ── Attendance status map (most-recent row per student) ────────────────────
  const attendanceStatusMap = useMemo(() => {
    const latestByStudent = new Map<string, typeof attendance[number]>();
    for (const row of attendance) {
      const prev = latestByStudent.get(row.student_id);
      const rowTs = row.scanned_at || row.created_at || "";
      const prevTs = prev ? (prev.scanned_at || prev.created_at || "") : "";
      if (!prev || rowTs > prevTs) {
        latestByStudent.set(row.student_id, row);
      }
    }
    const statusMap = new Map<string, string>();
    for (const [sid, row] of latestByStudent) {
      statusMap.set(sid, row.status);
    }
    return statusMap;
  }, [attendance]);

  // ── Tally ──────────────────────────────────────────────────────────────────
  const tally = useMemo(() => {
    let present = 0, absent = 0, leave = 0, notMarked = 0;
    for (const a of assignmentsWithChairs) {
      const status = attendanceStatusMap.get(a.studentId);
      if (status === "present") present++;
      else if (status === "absent") absent++;
      else if (status === "leave") leave++;
      else notMarked++;
    }
    return { present, absent, leave, notMarked, total: assignmentsWithChairs.length };
  }, [assignmentsWithChairs, attendanceStatusMap]);

  // ── Per-room tally (for the 3D screen's "PER-ROOM BREAKDOWN" panel) ────────
  const perRoomTally = useMemo(() => {
    if (!plan) return [];
    return plan.rooms.map(room => {
      let present = 0;
      const total = room.assignments.length;
      for (const a of room.assignments) {
        if (attendanceStatusMap.get(a.student_id) === "present") present++;
      }
      return { name: room.name, present, total };
    });
  }, [plan, attendanceStatusMap]);

  // ── Exam staff (for the 3D screen's "EXAM STAFF" section) ──────────────────
  const examStaff = useMemo(() => {
    if (!plan) return { superintendent: null as string | null, deputySuperintendent: null as string | null, invigilators: [] as string[] };
    const superintendent = (plan as any).superintendent ?? null;
    const deputySuperintendent = (plan as any).deputy_superintendent ?? null;
    const names = new Set<string>();
    for (const room of plan.rooms) {
      const invigs = (room as any).invigilators ?? (room.invigilator ? [room.invigilator] : []);
      for (const name of invigs) {
        if (name && String(name).trim()) names.add(String(name).trim());
      }
    }
    return { superintendent, deputySuperintendent, invigilators: Array.from(names) };
  }, [plan]);

  // ── QR sticker generation for chair backrests (Feature 4) ──────────────────
  // Generates a small QR data URL for each assigned chair. These are sent to
  // the iframe via SET_STICKERS, and the iframe draws them onto canvas textures
  // placed on the back of each chair's backrest.
  const [stickerQrs, setStickerQrs] = useState<Record<number, string>>({});
  useEffect(() => {
    if (!plan || assignmentsWithChairs.length === 0) { setStickerQrs({}); return; }
    let cancelled = false;
    (async () => {
      const qrs: Record<number, string> = {};
      // Generate in batches of 15 to avoid blocking the main thread
      const batchSize = 15;
      for (let i = 0; i < assignmentsWithChairs.length; i += batchSize) {
        if (cancelled) return;
        const batch = assignmentsWithChairs.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(async (a) => {
          try {
            const qrData = encodeSeatingQRData({
              planId: plan.id,
              roomId: a.roomId,
              seatLabel: a.seatLabel,
              studentId: a.studentId,
              examRollNo: a.examRollNo,
            });
            const url = await QRCode.toDataURL(qrData, { width: 96, margin: 0, errorCorrectionLevel: "L" });
            return [a.chairIdx, url] as [number, string];
          } catch {
            return [a.chairIdx, ""] as [number, string];
          }
        }));
        for (const [idx, url] of results) {
          qrs[idx] = url;
        }
        if (cancelled) return;
        setStickerQrs({ ...qrs });
      }
    })();
    return () => { cancelled = true; };
  }, [plan, assignmentsWithChairs]);

  // Send stickers to iframe when QRs are ready
  useEffect(() => {
    if (!iframeReady || Object.keys(stickerQrs).length === 0) return;
    const stickers = assignmentsWithChairs
      .filter(a => stickerQrs[a.chairIdx])
      .map(a => ({
        chairIdx: a.chairIdx,
        qrDataUrl: stickerQrs[a.chairIdx],
        studentName: a.studentName,
        examRollNo: a.examRollNo,
        class: a.class,
        seatLabel: a.seatLabel,
        roomName: a.roomName,
      }));
    if (stickers.length > 0) {
      sendMessage({ type: "SET_STICKERS", stickers });
    }
  }, [iframeReady, stickerQrs, assignmentsWithChairs, sendMessage]);

  // ── Paper time + countdown ─────────────────────────────────────────────────
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const paperPhase = useMemo(() => {
    if (!plan?.paper_start_at || !plan?.paper_end_at) return "no_times" as const;
    const start = new Date(plan.paper_start_at).getTime();
    const end = new Date(plan.paper_end_at).getTime();
    if (now < start) return "before" as const;
    if (now > end) return "ended" as const;
    return "in_progress" as const;
  }, [plan, now]);

  const countdownText = useMemo(() => {
    if (!plan?.paper_start_at || !plan?.paper_end_at) return null;
    const start = new Date(plan.paper_start_at).getTime();
    const end = new Date(plan.paper_end_at).getTime();
    if (paperPhase === "before") return `Paper starts in ${formatDuration(start - now)}`;
    if (paperPhase === "in_progress") return `Paper ends in ${formatDuration(end - now)}`;
    return `Paper ended ${formatDuration(now - end)} ago`;
  }, [plan, now, paperPhase]);

  // ── Send message to iframe ─────────────────────────────────────────────────
  const sendMessage = useCallback((msg: any) => {
    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  }, []);

  // ── Send SETUP when iframe is ready + plan is loaded ───────────────────────
  useEffect(() => {
    if (!iframeReady || !plan || assignmentsWithChairs.length === 0) return;
    sendMessage({
      type: "SETUP",
      plan: {
        id: plan.id,
        title: plan.title,
        paperSubject: plan.paper_subject,
        examDate: plan.exam_date,
        paperStartAt: plan.paper_start_at,
        paperEndAt: plan.paper_end_at,
        classes: plan.classes,
        status: plan.status,
      },
      assignments: assignmentsWithChairs,
    });
  }, [iframeReady, plan, assignmentsWithChairs, sendMessage]);

  // ── Heatmap mode: send status updates whenever attendance or mode changes ─
  useEffect(() => {
    if (!iframeReady) return;
    if (mode === "heatmap") {
      const statuses: Record<string, string> = {};
      for (const a of assignmentsWithChairs) {
        statuses[a.studentId] = attendanceStatusMap.get(a.studentId) || "unmarked";
      }
      sendMessage({ type: "HEATMAP", statuses });
    } else {
      sendMessage({ type: "HEATMAP_OFF" });
    }
  }, [mode, iframeReady, assignmentsWithChairs, attendanceStatusMap, sendMessage]);

  // ── Live Console screen: send UPDATE_SCREEN whenever tally/countdown/plan ─
  // changes. The iframe redraws the 3D screen texture with this data, so the
  // big screen behind the stage shows exactly what the Live Console shows.
  useEffect(() => {
    if (!iframeReady || !plan) return;
    const screenData = {
      planTitle: plan.title,
      paperSubject: plan.paper_subject,
      examDate: plan.exam_date
        ? new Date(plan.exam_date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
        : null,
      paperPhase,
      countdownText,
      tally,
      rooms: perRoomTally,
      superintendent: examStaff.superintendent,
      deputySuperintendent: examStaff.deputySuperintendent,
      invigilators: examStaff.invigilators,
    };
    sendMessage({ type: "UPDATE_SCREEN", data: screenData });
  }, [iframeReady, plan, paperPhase, countdownText, tally, perRoomTally, examStaff, sendMessage]);

  // ── Invigilator mode: send duty area chairs + staff chair index ────────────
  useEffect(() => {
    if (!iframeReady || !plan) return;
    if (mode === "invigilator" && selectedInvigilator) {
      const room = plan.rooms[selectedInvigilator.roomIdx];
      if (!room) return;
      const duties = (room as any).invigilator_duties ?? [];
      const duty = duties[selectedInvigilator.invIdx];
      if (!duty) return;

      // Find 3D chair indices for this room's rows in the duty range.
      // We walk the same sequential-fill logic to map (room, rowIdx) → chairIdx.
      const chairIndices: number[] = [];
      let idx = 0;
      for (let ri = 0; ri < plan.rooms.length; ri++) {
        const r = plan.rooms[ri];
        const sorted = [...r.assignments].sort((a, b) =>
          a.row_idx !== b.row_idx ? a.row_idx - b.row_idx : a.col_idx - b.col_idx
        );
        for (const a of sorted) {
          if (ri === selectedInvigilator.roomIdx) {
            // duty.row_start / row_end are 1-indexed; rowIdx is 0-indexed
            if (a.row_idx >= duty.row_start - 1 && a.row_idx <= duty.row_end - 1) {
              chairIndices.push(idx);
            }
          }
          idx++;
          if (idx >= TOTAL_3D_CHAIRS) break;
        }
        if (idx >= TOTAL_3D_CHAIRS) break;
      }

      // Map (roomIdx, invIdx) to a staff chair index (0-5) in the 3D hall.
      const staffIdx = (selectedInvigilator.roomIdx * 3 + selectedInvigilator.invIdx) % 6;

      sendMessage({
        type: "INVIGILATOR_MODE",
        chairIndices,
        staffChairIdx: staffIdx,
        color: DUTY_COLORS[staffIdx],
      });
    } else {
      sendMessage({ type: "INVIGILATOR_MODE", chairIndices: null });
    }
  }, [mode, selectedInvigilator, iframeReady, plan, sendMessage]);

  // ── Listen for messages from iframe ────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg || !msg.type) return;
      switch (msg.type) {
        case "INIT":
          setIframeReady(true);
          break;
        case "READY":
          // SETUP processed by iframe
          break;
        case "STICKERS_READY":
          // Desk stickers placed on chair backrests
          break;
        case "CHAIR_CLICKED":
          if (msg.assignment) {
            setClickedAssignment(msg.assignment);
          }
          break;
        case "HIGHLIGHT_RESULT":
          if (msg.found && msg.assignment) {
            setClickedAssignment(msg.assignment);
          } else {
            toast.error(`Roll number ${searchRoll} not found in this plan`);
          }
          break;
        case "FLASH_RESULT":
          if (msg.found && msg.assignment) {
            setClickedAssignment(msg.assignment);
          } else {
            toast.error(`Roll number ${searchRoll} not found in this plan`);
          }
          break;
        case "FLYTHROUGH_STARTED":
          setFlythroughActive(true);
          break;
        case "FLYTHROUGH_STOPPED":
          setFlythroughActive(false);
          break;
        case "FLYTHROUGH_STEP":
          setFlythroughStep({ step: msg.step, total: msg.total, label: msg.label, loop: msg.loop || 1 });
          break;
        case "FLYTHROUGH_LOOP":
          // Loop completed and restarted — no toast, just silent continuation
          break;
        case "FLYTHROUGH_DONE":
          // Legacy — no longer sent (flythrough loops forever now)
          setFlythroughActive(false);
          break;
        case "ERROR":
          console.error("[Hall3DView] iframe error:", msg.message);
          break;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [searchRoll]);

  // ── QR code for clicked assignment (desk sticker preview) ──────────────────
  useEffect(() => {
    if (!clickedAssignment || !plan) { setQrUrl(""); return; }
    const qrData = encodeSeatingQRData({
      planId: plan.id,
      roomId: clickedAssignment.roomId,
      seatLabel: clickedAssignment.seatLabel,
      studentId: clickedAssignment.studentId,
      examRollNo: clickedAssignment.examRollNo,
    });
    QRCode.toDataURL(qrData, { width: 200, margin: 1, errorCorrectionLevel: "M" })
      .then(setQrUrl)
      .catch(() => setQrUrl(""));
  }, [clickedAssignment, plan]);

  // ── Action handlers ────────────────────────────────────────────────────────
  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!searchRoll.trim()) { toast.error("Enter a roll number first"); return; }
    sendMessage({ type: "HIGHLIGHT_ROLL", rollNo: searchRoll.trim() });
  };

  const handleFlash = () => {
    if (!searchRoll.trim()) { toast.error("Enter a roll number first"); return; }
    sendMessage({ type: "FLASH_SEAT", rollNo: searchRoll.trim() });
  };

  const handleFlythrough = () => {
    if (flythroughActive) {
      // Stop the cinematic flythrough
      sendMessage({ type: "FLYTHROUGH_STOP" });
    } else {
      // Start the cinematic flythrough (loops forever until stopped)
      setFlythroughStep({ step: 0, total: 0, label: "Starting…", loop: 1 });
      sendMessage({ type: "FLYTHROUGH_START" });
    }
  };

  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    if (newMode !== "invigilator") setSelectedInvigilator(null);
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (planLoading || !plan) {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Skeleton className="h-12 w-12 rounded-full mx-auto" />
          <p className="text-sm text-muted-foreground">Loading seating plan…</p>
          <Button variant="outline" size="sm" onClick={onClose}>
            <X className="w-4 h-4" /> Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black overflow-hidden">
      {/* ── 3D Hall iframe ── */}
      <iframe
        ref={iframeRef}
        src={`/Hall_3D.html?embedded=1`}
        className="absolute inset-0 w-full h-full border-0"
        title="3D Exam Hall"
        allow="fullscreen; accelerometer; gyroscope"
      />

      {/* ── Top bar (gradient overlay) ── */}
      <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
        <div className="bg-gradient-to-b from-black/80 to-transparent p-3 sm:p-4">
          <div className="flex items-center justify-between gap-3">
            {/* Left: back + title */}
            <div className="flex items-center gap-2 min-w-0 pointer-events-auto">
              <Button
                variant="secondary"
                size="sm"
                onClick={onClose}
                className="bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-md shrink-0"
              >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">Close</span>
              </Button>
              <div className="min-w-0">
                <h2 className="text-white font-bold text-sm sm:text-base truncate flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 shrink-0" />
                  {plan.title}
                </h2>
                <div className="flex items-center gap-2 text-[10px] sm:text-xs text-white/70 flex-wrap">
                  {plan.paper_subject && <span className="flex items-center gap-0.5"><Grid3x3 className="w-3 h-3" /> {plan.paper_subject}</span>}
                  {plan.exam_date && <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" /> {new Date(plan.exam_date).toLocaleDateString()}</span>}
                  <span className="flex items-center gap-0.5"><Users className="w-3 h-3" /> {assignmentsWithChairs.length} seated</span>
                </div>
              </div>
            </div>

            {/* Right: status + countdown */}
            <div className="flex items-center gap-2 pointer-events-auto">
              {countdownText && (
                <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold backdrop-blur-md border ${
                  paperPhase === "in_progress"
                    ? "bg-emerald-500/20 text-emerald-200 border-emerald-400/30"
                    : paperPhase === "before"
                    ? "bg-blue-500/20 text-blue-200 border-blue-400/30"
                    : "bg-zinc-500/20 text-zinc-200 border-zinc-400/30"
                }`}>
                  <Activity className="w-3 h-3" />
                  {countdownText}
                </div>
              )}
              <Badge variant="secondary" className={`backdrop-blur-md ${
                plan.status === "published"
                  ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/30"
                  : plan.status === "generated"
                  ? "bg-amber-500/20 text-amber-200 border border-amber-400/30"
                  : "bg-zinc-500/20 text-zinc-200 border border-zinc-400/30"
              }`}>
                {plan.status}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* ── Left control panel ──
          Conditionally rendered: when panelOpen is false, the panel does NOT
          exist in the DOM at all (not just translated off-screen). This
          guarantees it's never visible on any browser until the user taps
          the toggle button. */}
      {panelOpen && (
        <div className="absolute top-20 sm:top-24 left-2 sm:left-4 z-10 animate-in fade-in slide-in-from-left-4 duration-200">
        <div className="bg-black/70 backdrop-blur-md border border-white/10 rounded-2xl p-3 sm:p-4 w-[280px] sm:w-[300px] max-h-[calc(100vh-8rem)] overflow-y-auto space-y-3 text-white">
          {/* ── Mode toggle ── */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50 mb-1.5">Mode</p>
            <div className="grid grid-cols-3 gap-1">
              <ModeButton active={mode === "overview"} onClick={() => handleModeChange("overview")} icon={<Eye className="w-3.5 h-3.5" />} label="Overview" />
              <ModeButton active={mode === "heatmap"} onClick={() => handleModeChange("heatmap")} icon={<Activity className="w-3.5 h-3.5" />} label="Heatmap" />
              <ModeButton active={mode === "invigilator"} onClick={() => handleModeChange("invigilator")} icon={<User className="w-3.5 h-3.5" />} label="Invigilator" />
            </div>
          </div>

          {/* ── Search (Feature 1 + 6) ── */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50 mb-1.5">Find Student</p>
            <form onSubmit={handleSearch} className="space-y-1.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
                <Input
                  value={searchRoll}
                  onChange={e => setSearchRoll(e.target.value)}
                  placeholder="e.g. 434728"
                  className="pl-8 h-8 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/30"
                />
              </div>
              <div className="flex gap-1.5">
                <Button type="submit" size="sm" variant="secondary" className="flex-1 h-8 text-xs bg-white/10 hover:bg-white/20 text-white border-white/10">
                  <MapPin className="w-3 h-3" /> Highlight
                </Button>
                <Button type="button" size="sm" onClick={handleFlash} variant="secondary" className="flex-1 h-8 text-xs bg-orange-500/30 hover:bg-orange-500/50 text-orange-100 border-orange-400/30">
                  <Navigation className="w-3 h-3" /> Flash
                </Button>
              </div>
            </form>
          </div>

          {/* ── Heatmap tally (Feature 3) ── */}
          {mode === "heatmap" && (
            <div className="rounded-xl bg-white/5 border border-white/10 p-2.5 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Live Attendance</p>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <TallyItem label="Present" value={tally.present} color="bg-emerald-500" />
                <TallyItem label="Absent" value={tally.absent} color="bg-rose-500" />
                <TallyItem label="Leave" value={tally.leave} color="bg-amber-500" />
                <TallyItem label="Not Marked" value={tally.notMarked} color="bg-yellow-500" />
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-white/10 text-xs">
                <span className="text-white/50">Total Seated</span>
                <span className="font-bold text-white">{tally.total}</span>
              </div>
              {!examDate && (
                <p className="text-[10px] text-amber-300/80 pt-1">⚠ No exam date set — heatmap shows "not scanned" for all.</p>
              )}
              {examDate && attendance.length === 0 && (
                <p className="text-[10px] text-white/40 pt-1">No attendance records yet for today.</p>
              )}
            </div>
          )}

          {/* ── Invigilator picker (Feature 2) ── */}
          {mode === "invigilator" && (
            <div className="rounded-xl bg-white/5 border border-white/10 p-2.5 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Select Invigilator</p>
              {plan.rooms.length === 0 ? (
                <p className="text-xs text-white/40">No rooms in this plan.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {plan.rooms.map((room, ri) => {
                    const invigs = (room as any).invigilators ?? (room.invigilator ? [room.invigilator] : []);
                    const duties = (room as any).invigilator_duties ?? [];
                    if (invigs.length === 0) return null;
                    return (
                      <div key={room.id} className="space-y-1">
                        <p className="text-[10px] font-semibold text-white/60">{room.name}</p>
                        {invigs.map((name: string, ii: number) => {
                          const duty = duties[ii] ?? { row_start: 1, row_end: room.rows };
                          const isActive = selectedInvigilator?.roomIdx === ri && selectedInvigilator?.invIdx === ii;
                          const staffIdx = (ri * 3 + ii) % 6;
                          return (
                            <button
                              key={ii}
                              onClick={() => setSelectedInvigilator(isActive ? null : { roomIdx: ri, invIdx: ii })}
                              className={`w-full text-left px-2 py-1.5 rounded-lg text-xs border transition-all flex items-center gap-2 ${
                                isActive
                                  ? "bg-white/15 border-white/30 text-white"
                                  : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                              }`}
                            >
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: DUTY_COLOR_CSS[staffIdx] }} />
                              <span className="flex-1 truncate font-medium">{name || `Invigilator ${ii + 1}`}</span>
                              <span className="text-[9px] text-white/40 shrink-0">R{duty.row_start}–{duty.row_end}</span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
              {selectedInvigilator && (
                <p className="text-[10px] text-white/40">Camera flies to the duty area. Dashed line = walking path from staff chair.</p>
              )}
            </div>
          )}

          {/* ── Auto camera flythrough (Feature 4) — loops forever until stopped ── */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50 mb-1.5">Camera</p>
            <div className="grid grid-cols-2 gap-1.5">
              <Button size="sm" variant="secondary" onClick={handleFlythrough}
                className={`h-8 text-xs border ${
                  flythroughActive
                    ? "bg-rose-500/40 hover:bg-rose-500/60 text-rose-100 border-rose-400/40"
                    : "bg-violet-500/30 hover:bg-violet-500/50 text-violet-100 border-violet-400/30"
                }`}>
                {flythroughActive ? <><X className="w-3 h-3" /> Stop Flyover</> : <><Plane className="w-3 h-3" /> Start Flyover</>}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => sendMessage({ type: "CAMERA_TOP" })}
                className="h-8 text-xs bg-white/10 hover:bg-white/20 text-white border-white/10">
                <Camera className="w-3 h-3" /> Top
              </Button>
              <Button size="sm" variant="secondary" onClick={() => sendMessage({ type: "CAMERA_FRONT" })}
                className="h-8 text-xs bg-white/10 hover:bg-white/20 text-white border-white/10">
                <Building2 className="w-3 h-3" /> Stage
              </Button>
              <Button size="sm" variant="secondary" onClick={() => sendMessage({ type: "CAMERA_RESET" })}
                className="h-8 text-xs bg-white/10 hover:bg-white/20 text-white border-white/10">
                <RefreshCw className="w-3 h-3" /> Reset
              </Button>
            </div>
            {flythroughActive ? (
              <p className="text-[10px] text-violet-300/80 mt-1.5">🎬 Cinematic flyover running — taps the 3D view to stop.</p>
            ) : (
              <p className="text-[10px] text-white/40 mt-1.5">Cinematic flyover tours the hall automatically. Auto-starts on open.</p>
            )}
          </div>

          {/* ── Class legend (overview mode) ── */}
          {mode === "overview" && (
            <div className="rounded-xl bg-white/5 border border-white/10 p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50 mb-1.5">Class Colors</p>
              <div className="space-y-1">
                {plan.classes.map(c => {
                  const count = assignmentsWithChairs.filter(a => a.class === c).length;
                  return (
                    <div key={c} className="flex items-center gap-2 text-xs">
                      <span className={`w-3 h-3 rounded ${CLASS_BG[c] ?? "bg-slate-500"}`} />
                      <span className="text-white/70 flex-1">Class {c}</span>
                      <span className="text-white/40 font-mono">{count}</span>
                    </div>
                  );
                })}
                <div className="flex items-center gap-2 text-xs pt-1 border-t border-white/10">
                  <span className="w-3 h-3 rounded bg-zinc-500" />
                  <span className="text-white/70 flex-1">Empty</span>
                  <span className="text-white/40 font-mono">{TOTAL_3D_CHAIRS - assignmentsWithChairs.length}</span>
                </div>
              </div>
            </div>
          )}
        </div>
        </div>
      )}

      {/* ── Single persistent panel toggle button ──
          Always visible (top-left, below the top bar). Taps toggle the control
          panel open/closed. On mobile the panel slides in from the left. */}
      <button
        onClick={() => setPanelOpen(o => !o)}
        className={`absolute top-20 sm:top-24 left-2 z-20 bg-black/70 backdrop-blur-md border border-white/10 rounded-xl p-2 text-white hover:bg-black/80 transition-colors ${
          panelOpen ? "bg-violet-500/40 border-violet-400/40" : ""
        }`}
        title={panelOpen ? "Hide controls" : "Show controls"}
      >
        {panelOpen ? <ChevronDown className="w-4 h-4 rotate-90" /> : <Layers className="w-4 h-4" />}
      </button>

      {/* ── Student info panel (Feature 5: Seat Desk Sticker Visualization) ──
          MOBILE: compact bottom bar — doesn't cover the chair (center of 3D view).
            • Positioned at bottom-16 (above the flyover stop button)
            • Full width but compact height (~120px)
            • Small QR (w-14 h-14) + key info in a tight horizontal layout
          DESKTOP: top-right card — full details with side-by-side QR. */}
      {clickedAssignment && (
        <div className="absolute bottom-16 sm:bottom-auto sm:top-24 left-2 right-2 sm:left-auto sm:right-4 z-10 w-[calc(100vw-1rem)] sm:w-[340px]">
          <div className="bg-black/85 backdrop-blur-md border border-white/10 rounded-2xl p-2.5 sm:p-4 text-white">
            {/* Header row */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="min-w-0 flex items-center gap-2">
                <p className="text-sm font-bold font-mono truncate">{clickedAssignment.seatLabel}</p>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${CLASS_BG[clickedAssignment.class] ?? "bg-slate-500"} text-white`}>
                  Cl {clickedAssignment.class}
                </span>
              </div>
              <button
                onClick={() => setClickedAssignment(null)}
                className="text-white/50 hover:text-white shrink-0 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* QR + key details — horizontal compact on mobile, side-by-side on desktop */}
            <div className="flex gap-2.5">
              {qrUrl && (
                <div className="shrink-0">
                  <div className="w-14 h-14 sm:w-24 sm:h-24 rounded-lg border border-white/20 p-1 bg-white">
                    <img src={qrUrl} alt="Desk QR" className="w-full h-full" />
                  </div>
                  <p className="text-[8px] sm:text-[9px] text-white/40 text-center mt-0.5 hidden sm:flex items-center justify-center gap-0.5">
                    <ScanLine className="w-2.5 h-2.5" /> Desk Sticker QR
                  </p>
                </div>
              )}
              <div className="flex-1 min-w-0 space-y-1 sm:space-y-2 text-xs">
                {/* Mobile: compact single-line rows */}
                <div className="sm:hidden space-y-0.5">
                  <p className="font-semibold text-sm text-white truncate">{clickedAssignment.studentName}</p>
                  <p className="text-white/70 text-[11px]">
                    <span className="font-mono font-bold text-white">{clickedAssignment.examRollNo}</span>
                    <span className="mx-1.5 text-white/30">·</span>
                    {clickedAssignment.roomName}
                    <span className="mx-1.5 text-white/30">·</span>
                    R{clickedAssignment.rowIdx + 1}C{clickedAssignment.colIdx + 1}
                  </p>
                  {mode === "heatmap" && (
                    <p className={`text-[11px] font-semibold ${
                      attendanceStatusMap.get(clickedAssignment.studentId) === "present" ? "text-emerald-300" :
                      attendanceStatusMap.get(clickedAssignment.studentId) === "absent" ? "text-rose-300" :
                      attendanceStatusMap.get(clickedAssignment.studentId) === "leave" ? "text-amber-300" :
                      "text-yellow-300"
                    }`}>
                      {(() => {
                        const s = attendanceStatusMap.get(clickedAssignment.studentId);
                        if (s === "present") return "✓ Present";
                        if (s === "absent") return "✗ Absent";
                        if (s === "leave") return "◷ Leave";
                        return "? Not Scanned";
                      })()}
                    </p>
                  )}
                </div>

                {/* Desktop: full detail rows */}
                <div className="hidden sm:block space-y-2">
                  <InfoRow icon={<User className="w-3 h-3" />} label="Student" value={clickedAssignment.studentName} />
                  <InfoRow icon={<Hash className="w-3 h-3" />} label="Exam Roll" value={clickedAssignment.examRollNo} mono />
                  <InfoRow icon={<Hash className="w-3 h-3" />} label="Class Roll" value={clickedAssignment.classRollNo} mono />
                  <InfoRow icon={<Building2 className="w-3 h-3" />} label="Room" value={clickedAssignment.roomName} />
                  <InfoRow icon={<Grid3x3 className="w-3 h-3" />} label="Position" value={`Row ${clickedAssignment.rowIdx + 1} · Col ${clickedAssignment.colIdx + 1}`} />
                  {mode === "heatmap" && (
                    <div className="pt-1.5 border-t border-white/10">
                      <InfoRow
                        icon={<Activity className="w-3 h-3" />}
                        label="Attendance"
                        value={(() => {
                          const s = attendanceStatusMap.get(clickedAssignment.studentId);
                          if (s === "present") return "✓ Present";
                          if (s === "absent") return "✗ Absent";
                          if (s === "leave") return "◷ Leave";
                          return "? Not Scanned";
                        })()}
                        valueColor={
                          attendanceStatusMap.get(clickedAssignment.studentId) === "present" ? "text-emerald-300" :
                          attendanceStatusMap.get(clickedAssignment.studentId) === "absent" ? "text-rose-300" :
                          attendanceStatusMap.get(clickedAssignment.studentId) === "leave" ? "text-amber-300" :
                          "text-yellow-300"
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Flythrough stop button (minimal, no progress bar) ──
          When the drone is flying, a small "Stop Flyover" button appears in
          the bottom-right corner. No loading bar, no step counter — just a
          single tap to stop the drone and regain manual control. */}
      {flythroughActive && (
        <button
          onClick={() => sendMessage({ type: "FLYTHROUGH_STOP" })}
          className="absolute bottom-4 right-4 z-10 bg-rose-500/30 hover:bg-rose-500/50 backdrop-blur-md border border-rose-400/30 rounded-xl px-3 py-2 text-rose-100 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          title="Stop drone flyover"
        >
          <Plane className="w-3.5 h-3.5 animate-pulse" />
          Stop Flyover
        </button>
      )}

      {/* ── Mobile bottom hint ── */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-5 sm:hidden pointer-events-none">
        {!flythroughActive && (
          <p className="text-[10px] text-white/40 bg-black/50 backdrop-blur-sm px-3 py-1 rounded-full">
            Tap a chair for student info · Drag to rotate · Pinch to zoom
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 py-2 rounded-lg text-[10px] font-semibold transition-all border ${
        active
          ? "bg-white/15 border-white/30 text-white"
          : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function TallyItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
      <span className="text-white/60 flex-1">{label}</span>
      <span className="font-bold text-white">{value}</span>
    </div>
  );
}

function InfoRow({ icon, label, value, mono, valueColor }: { icon: React.ReactNode; label: string; value: string; mono?: boolean; valueColor?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-white/40 shrink-0">{icon}</span>
      <span className="text-white/40 w-20 sm:w-16 shrink-0">{label}</span>
      <span className={`font-medium flex-1 min-w-0 break-words ${mono ? "font-mono" : ""} ${valueColor ?? "text-white"}`}>{value}</span>
    </div>
  );
}
