/**
 * ClassCard.tsx
 * Premium animated class card used across Student, Teacher & Admin dashboards.
 */
import { useState, useEffect } from "react";
import { 
  Video, Clock, Users, BookOpen, ExternalLink, ChevronDown,
  ChevronUp, FileText, BookMarked, CheckCircle, XCircle, Wifi
} from "lucide-react";
import {
  OnlineClass, SUBJECT_ICONS, SUBJECT_COLORS,
  getClassStatus, getCountdown
} from "@/hooks/useOnlineClasses";

interface ClassCardProps {
  cls: OnlineClass;
  role?: "student" | "teacher" | "admin";
  onEdit?: (cls: OnlineClass) => void;
  onDelete?: (id: string) => void;
  onJoinLive?: (cls: OnlineClass) => void;   // if provided, overrides default meet_link behavior
  index?: number;
}

export default function ClassCard({ cls, role = "student", onEdit, onDelete, onJoinLive, index = 0 }: ClassCardProps) {
  const [countdown, setCountdown]   = useState("");
  const [expanded,  setExpanded]    = useState(false);
  const [deleting,  setDeleting]    = useState(false);

  const status = getClassStatus(cls);

  // Live countdown
  useEffect(() => {
    if (status !== "upcoming") return;
    const tick = () => setCountdown(getCountdown(cls));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [cls, status]);

  const icon    = SUBJECT_ICONS[cls.subject]  || "📚";
  const gradient = SUBJECT_COLORS[cls.subject] || "from-primary to-primary/70";

  const statusConfig = {
    live:      { label: "LIVE",      bg: "bg-red-500",     text: "text-white",   ring: "ring-red-400/50",    border: "border-red-500/30"  },
    upcoming:  { label: "Upcoming",  bg: "bg-blue-500",   text: "text-white",   ring: "",                   border: "border-blue-400/20"},
    completed: { label: "Completed", bg: "bg-emerald-500", text: "text-white",   ring: "",                   border: "border-emerald-400/20"},
    cancelled: { label: "Cancelled", bg: "bg-slate-400",   text: "text-white",   ring: "",                   border: "border-slate-400/20" },
  }[status];

  const formatTime = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
  };

  const formatDate = (d: string) => {
    const date = new Date(d + "T00:00:00");
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1);
    if (date.getTime() === today.getTime())    return "Today";
    if (date.getTime() === tomorrow.getTime()) return "Tomorrow";
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    await onDelete(cls.id);
    setDeleting(false);
  };

  return (
    <div
      className={`
        rounded-2xl border bg-card
        shadow-[0_2px_12px_-2px_hsl(var(--primary)/0.08)]
        hover:shadow-[0_4px_16px_-2px_hsl(var(--primary)/0.14)]
        transition-shadow duration-300 group
        ${status === "live" ? "ring-2 ring-red-400/40 border-red-500/30" : `border-border ${statusConfig.border}`}
      `}
    >
      {/* Subject colour strip — solid color, no gradient to avoid Android GPU glitch */}
      <div className="rounded-t-2xl h-1 bg-primary opacity-60" />

      <div className="p-4 pt-5">
        {/* ── Header row ── */}
        <div className="flex items-start gap-3">
          {/* Subject icon */}
          <div className="shrink-0 w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center text-xl">
            {icon}
          </div>

          {/* Title / meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-heading font-bold text-foreground text-sm leading-snug break-words">
                {cls.title}
              </h3>
              {/* Status badge */}
              <span className={`
                inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider
                ${statusConfig.bg} ${statusConfig.text}
                
              `}>
                {status === "live" && <span className="w-1.5 h-1.5 rounded-full bg-white inline-block" />}
                {statusConfig.label}
              </span>
            </div>

            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <BookOpen className="w-3 h-3" />
                {cls.subject}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {cls.class_name}
              </span>
              <span className="flex items-center gap-1">
                <Video className="w-3 h-3" />
                {cls.teacher_name}
              </span>
            </div>
          </div>
        </div>

        {/* ── Time row ── */}
        <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1 font-medium text-foreground/80">
            <Clock className="w-3.5 h-3.5 text-primary" />
            {formatDate(cls.scheduled_date)} · {formatTime(cls.start_time)}
          </span>
          <span className="bg-secondary px-2 py-0.5 rounded-full">
            {cls.duration_minutes} min
          </span>
        </div>

        {/* ── Countdown ── */}
        {status === "upcoming" && countdown && (
          <div className="mt-2.5 flex items-center gap-1.5">
            <div className="flex-1 h-1 rounded-full bg-secondary overflow-hidden">
              <div className="h-full w-1/3 bg-primary rounded-full opacity-70" />
            </div>
            <span className="text-[11px] font-mono font-bold text-primary whitespace-nowrap">
              ⏱ {countdown}
            </span>
          </div>
        )}

        {/* ── Notes / Homework (after class) ── */}
        {(cls.notes || cls.homework) && status === "completed" && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="mt-3 flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? "Hide" : "Show"} class notes & homework
          </button>
        )}

        {expanded && (
          <div className="mt-3 space-y-2">
            {cls.notes && (
              <div className="bg-secondary/60 rounded-xl p-3">
                <p className="text-[11px] font-bold text-primary uppercase tracking-wider mb-1 flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Class Notes
                </p>
                <p className="text-xs text-foreground/80 leading-relaxed">{cls.notes}</p>
              </div>
            )}
            {cls.homework && (
              <div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl p-3 border border-blue-200/50 dark:border-blue-800/30">
                <p className="text-[11px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <BookMarked className="w-3 h-3" /> Homework
                </p>
                <p className="text-xs text-foreground/80 leading-relaxed">{cls.homework}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Action buttons ── */}
        <div className="flex items-center gap-2 mt-4 flex-wrap min-w-0">
          {/* Join button */}
          {(status === "live" || status === "upcoming") && cls.meet_link && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                // If parent provides onJoinLive (e.g. to open in-page Jitsi), use it.
                if (onJoinLive) { onJoinLive(cls); return; }
                // Default behavior: open meet_link in new tab.
                const link = cls.meet_link.trim().startsWith("http")
                  ? cls.meet_link.trim()
                  : "https://" + cls.meet_link.trim();
                window.open(link, "_blank", "noopener,noreferrer");
              }}
              className={`
                flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer
                ${status === "live"
                  ? "bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30"
                  : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-md"
                }
              `}
            >
              {status === "live"
                ? <><Wifi className="w-3.5 h-3.5" /> Join Live</>
                : <><Video className="w-3.5 h-3.5" /> Join Class</>
              }
              <ExternalLink className="w-3 h-3 opacity-70" />
            </button>
          )}

          {status === "completed" && cls.recording_link && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const link = cls.recording_link!.trim().startsWith("http")
                  ? cls.recording_link!.trim()
                  : "https://" + cls.recording_link!.trim();
                window.open(link, "_blank", "noopener,noreferrer");
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-secondary hover:bg-secondary/80 text-foreground transition-all cursor-pointer"
            >
              <Video className="w-3.5 h-3.5" /> Recording
            </button>
          )}

          {status === "completed" && (
            <span className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-700/30">
              <CheckCircle className="w-3.5 h-3.5" /> Class Ended
            </span>
          )}

          {/* Teacher / Admin controls */}
          {(role === "teacher" || role === "admin") && (
            <div className="ml-auto flex items-center gap-1.5">
              {onEdit && (
                <button
                  onClick={() => onEdit(cls)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
                >
                  Edit
                </button>
              )}
              {onDelete && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 transition-colors border border-red-200/50 dark:border-red-700/30"
                >
                  {deleting ? "…" : "Delete"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
        }
                
