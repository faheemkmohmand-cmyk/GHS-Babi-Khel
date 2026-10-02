/**
 * ClassFormModal.tsx
 * Premium modal for creating / editing an online class.
 * Used by both Teacher dashboard and Admin dashboards.
 *
 * MOBILE FIX: No framer-motion on the modal container — motion animations
 * on fixed elements cause layout recalculation every state update, which
 * makes the keyboard dismiss on every keystroke on Android/iOS.
 */
import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Video, Clock, Calendar, Users, BookOpen, Link2, FileText, BookMarked, Loader2 } from "lucide-react";
import { OnlineClass, NewClass, SUBJECTS, CLASS_NAMES } from "@/hooks/useOnlineClasses";

interface ClassFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: NewClass) => Promise<boolean>;
  initial?: OnlineClass | null;
  teacherName?: string;
  teacherId?: string;
  showTeacherField?: boolean;
}

const DURATIONS = [30, 45, 60, 75, 90, 120];

// ─── Field must be defined OUTSIDE ClassFormModal ─────────────────────────────
// CRITICAL: If Field is defined inside the component, it gets recreated on every
// state update (every keystroke). React sees it as a new component type and
// unmounts+remounts the children (inputs), which dismisses the mobile keyboard.
// Moving it outside means it's a stable reference and React reuses the DOM node.
const Field = ({ label, icon: Icon, error, children }: {
  label: string; icon: any; error?: string; children: React.ReactNode
}) => (
  <div className="space-y-1.5">
    <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80 uppercase tracking-wider">
      <Icon className="w-3.5 h-3.5 text-primary" />
      {label}
    </label>
    {children}
    {error && <p className="text-xs text-red-500">{error}</p>}
  </div>
);

const empty = (teacherName = "", teacherId = ""): NewClass => ({
  title: "",
  subject: "Mathematics",
  class_name: "Class 10",
  teacher_name: teacherName,
  teacher_id: teacherId || null,
  meet_link: "",
  scheduled_date: new Date().toISOString().slice(0, 10),
  start_time: "09:00",
  duration_minutes: 60,
  description: "",
  homework: "",
  notes: "",
  recording_link: "",
});

export default function ClassFormModal({
  open, onClose, onSubmit, initial, teacherName = "", teacherId = "", showTeacherField = false
}: ClassFormModalProps) {
  const [form, setForm]     = useState<NewClass>(empty(teacherName, teacherId));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof NewClass, string>>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll focused input into view AFTER keyboard opens (~350ms).
  // Prevents keyboard from collapsing on Android when modal scrolls.
  const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const el = e.currentTarget;
    setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 350);
  };

  useEffect(() => {
    if (open) {
      setForm(initial
        ? {
            title: initial.title,
            subject: initial.subject,
            class_name: initial.class_name,
            teacher_name: initial.teacher_name,
            teacher_id: initial.teacher_id,
            meet_link: initial.meet_link,
            scheduled_date: initial.scheduled_date,
            start_time: initial.start_time,
            duration_minutes: initial.duration_minutes,
            description: initial.description || "",
            homework: initial.homework || "",
            notes: initial.notes || "",
            recording_link: initial.recording_link || "",
          }
        : empty(teacherName, teacherId)
      );
      setErrors({});
      // Reset scroll to top when modal opens
      setTimeout(() => scrollRef.current?.scrollTo(0, 0), 50);
    }
  }, [open, initial, teacherName, teacherId]);

  // Use a single ref-based updater so both state slices update in one batch
  // preventing double re-render (and double focus-loss) per keystroke on mobile
  const set = (k: keyof NewClass, v: any) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => {
      if (!e[k]) return e; // skip update if no error to clear
      const next = { ...e };
      delete next[k];
      return next;
    });
  };

  const validate = () => {
    const e: Partial<Record<keyof NewClass, string>> = {};
    if (!form.title.trim())         e.title         = "Title is required";
    if (!form.meet_link.trim())     e.meet_link     = "Google Meet link is required";
    if (!form.teacher_name.trim())  e.teacher_name  = "Teacher name is required";
    if (!form.scheduled_date)       e.scheduled_date = "Date is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    const ok = await onSubmit(form);
    setSaving(false);
    if (ok) onClose();
  };

  const inputCls = (err?: string) =>
    `w-full px-3 py-2.5 rounded-xl bg-secondary/50 border text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/30 focus:border-primary ${err ? "border-red-400" : "border-border"}`;

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "flex-end",
      }}
    >
      {/* Backdrop — only animates opacity, never touches layout */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(2px)",
        }}
      />

      {/* Modal box — NO transforms, NO scale, NO y animation.
          Fixed to bottom on mobile, centered on desktop via CSS only.
          This is the ONLY correct way to prevent keyboard jump on mobile. */}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "600px",
          margin: "0 auto",
          background: "hsl(var(--card))",
          borderRadius: "20px 20px 0 0",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.18)",
          border: "1px solid hsl(var(--border))",
          display: "flex",
          flexDirection: "column",
          maxHeight: "92dvh",
          // On desktop show as centered dialog
        }}
        className="sm:rounded-2xl sm:my-4 sm:mx-4 sm:shadow-2xl"
      >
        {/* Header — does NOT scroll */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid hsl(var(--border))",
            flexShrink: 0,
          }}
        >
          <div>
            <h2 className="font-heading font-bold text-foreground text-lg">
              {initial ? "Edit Class" : "Create New Class"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {initial ? "Update class details below" : "Fill in the details to schedule a new online class"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable form body — this scrolls, not the window */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch" as any,
            overscrollBehavior: "contain",
          }}
        >
          <form onSubmit={handleSubmit} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>

            {/* Title */}
            <Field label="Class Title" icon={BookOpen} error={errors.title}>
              <input
                onFocus={handleFocus}                 className={inputCls(errors.title)}
                placeholder="e.g. Algebra & Equations — Chapter 3"
                value={form.title}
                onChange={e => set("title", e.target.value)}
                autoComplete="off"
              />
            </Field>

            {/* Subject + Class row */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Subject" icon={BookOpen}>
                <select onFocus={handleFocus} className={inputCls()} value={form.subject} onChange={e => set("subject", e.target.value)}>
                  {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Class" icon={Users}>
                <select onFocus={handleFocus} className={inputCls()} value={form.class_name} onChange={e => set("class_name", e.target.value)}>
                  {CLASS_NAMES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>

            {/* Teacher name (admin only) */}
            {showTeacherField && (
              <Field label="Teacher Name" icon={Users} error={errors.teacher_name}>
                <input
                onFocus={handleFocus}                   className={inputCls(errors.teacher_name)}
                  placeholder="e.g. Sir Ahmad"
                  value={form.teacher_name}
                  onChange={e => set("teacher_name", e.target.value)}
                  autoComplete="off"
                />
              </Field>
            )}

            {/* Meet Link */}
            <Field label="Google Meet Link" icon={Link2} error={errors.meet_link}>
              <input
                onFocus={handleFocus}                 className={inputCls(errors.meet_link)}
                placeholder="meet.google.com/xxx-xxxx-xxx or https://meet.google.com/..."
                value={form.meet_link}
                onChange={e => set("meet_link", e.target.value)}
                autoComplete="off"
                inputMode="url"
              />
            </Field>

            {/* Date + Time + Duration */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Field label="Date" icon={Calendar} error={errors.scheduled_date}>
                <input
                onFocus={handleFocus}                   type="date"
                  className={inputCls(errors.scheduled_date)}
                  value={form.scheduled_date}
                  onChange={e => set("scheduled_date", e.target.value)}
                />
              </Field>
              <Field label="Start Time" icon={Clock}>
                <input
                onFocus={handleFocus}                   type="time"
                  className={inputCls()}
                  value={form.start_time}
                  onChange={e => set("start_time", e.target.value)}
                />
              </Field>
              <Field label="Duration" icon={Clock}>
                <select onFocus={handleFocus} className={inputCls()} value={form.duration_minutes} onChange={e => set("duration_minutes", Number(e.target.value))}>
                  {DURATIONS.map(d => <option key={d} value={d}>{d} min</option>)}
                </select>
              </Field>
            </div>

            {/* Description */}
            <Field label="Description (optional)" icon={FileText}>
              <textarea
                onFocus={handleFocus}                 className={`${inputCls()} resize-none`}
                rows={2}
                placeholder="What will be covered in this class?"
                value={form.description || ""}
                onChange={e => set("description", e.target.value)}
              />
            </Field>

            {/* Notes & Homework (post-class) */}
            <div style={{ borderTop: "1px solid hsl(var(--border))", paddingTop: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Post-Class Content (fill after class)
              </p>
              <Field label="Class Notes" icon={FileText}>
                <textarea
                onFocus={handleFocus}                   className={`${inputCls()} resize-none`}
                  rows={2}
                  placeholder="Key points covered in the class…"
                  value={form.notes || ""}
                  onChange={e => set("notes", e.target.value)}
                />
              </Field>
              <Field label="Homework" icon={BookMarked}>
                <textarea
                onFocus={handleFocus}                   className={`${inputCls()} resize-none`}
                  rows={2}
                  placeholder="Homework assigned after class…"
                  value={form.homework || ""}
                  onChange={e => set("homework", e.target.value)}
                />
              </Field>
              <Field label="Recording Link (optional)" icon={Video}>
                <input
                onFocus={handleFocus}                   className={inputCls()}
                  placeholder="https://drive.google.com/…"
                  value={form.recording_link || ""}
                  onChange={e => set("recording_link", e.target.value)}
                  autoComplete="off"
                  inputMode="url"
                />
              </Field>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2 pb-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl bg-secondary hover:bg-secondary/80 text-sm font-semibold text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
              >
                {saving
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                  : initial ? "Update Class" : "Create Class 🚀"
                }
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}
