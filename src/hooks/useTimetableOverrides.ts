// src/hooks/useTimetableOverrides.ts
// ─────────────────────────────────────────────────────────────────────────────
// TODAY-ONLY SUBSTITUTE-TEACHER ASSIGNMENTS
// ─────────────────────────────────────────────────────────────────────────────
// When a teacher is absent, the admin opens the Timetables page and clicks
// "Substitute" → picks the absent teacher → the system auto-assigns a
// substitute for every period that teacher was supposed to teach today.
//
// Those temporary assignments live in the `timetable_overrides` table (see
// migration 014). They do NOT modify the permanent `timetables` table —
// tomorrow the regular timetable is back in effect automatically.
//
// ── How the substitute is chosen ────────────────────────────────────────────
// For each (class, day, period, subject) the absent teacher was supposed to
// teach today:
//   1. Find all teachers whose `subject` matches the entry's subject.
//   2. Exclude the absent teacher.
//   3. Exclude teachers who are ALREADY teaching in any class at the same
//      day + period — both in the regular timetable AND in today's already-
//      assigned overrides (so we don't double-book a substitute).
//   4. Pick the first remaining teacher (sorted by display_order for stable
//      results). Reason = "subject-match".
//   5. If no subject-match is free, fall back to ANY free teacher (any
//      subject). Reason = "free-period".
//   6. If NO teacher is free at that period (everyone is teaching), leave
//      that period unsdubstituted and report it as "uncovered".
//
// The auto-assignment is done CLIENT-SIDE here (in the hook) because it
// needs to join `teachers` + `timetables` + `timetable_overrides` and apply
// the free-period logic — easier to do in JS than in a SQL function.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";
import type { Teacher } from "@/hooks/useTeachers";
import type { TimetableEntry } from "@/hooks/useTimetable";

// ── Types ────────────────────────────────────────────────────────────────────

export interface TimetableOverride {
  id: string;
  effective_date: string; // "YYYY-MM-DD"
  class: string;
  day: string;
  period_number: number;
  subject: string;
  original_teacher: string | null;
  substitute_teacher: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface SubstitutionResult {
  /** Overrides that were successfully created. */
  assigned: Array<{
    class: string;
    day: string;
    period_number: number;
    subject: string;
    original_teacher: string | null;
    substitute_teacher: string;
    reason: string;
  }>;
  /** Periods the absent teacher was supposed to teach but NO free teacher
   *  could be found to cover them. */
  uncovered: Array<{
    class: string;
    day: string;
    period_number: number;
    subject: string;
    reason: string;
  }>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns today's date as "YYYY-MM-DD" in the user's local timezone. */
function todayDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Returns the day name (e.g. "Monday") for today in the user's local
 *  timezone. This is what we match against the timetable's `day` column. */
function todayDayName(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long" });
}

// ── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Fetch all overrides for TODAY. Used by the student/teacher dashboard to
 * show substitute teachers in place of the regular timetable, and by the
 * admin Timetables page to show a "today's overrides" summary.
 */
export function useTodayTimetableOverrides() {
  const today = todayDateStr();
  return useQuery<TimetableOverride[]>({
    queryKey: ["timetable-overrides", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timetable_overrides")
        .select("*")
        .eq("effective_date", today)
        .order("class", { ascending: true })
        .order("period_number", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30 * 1000, // refresh every 30s — substitutes may be added mid-day
  });
}

/**
 * Auto-assign substitute teachers for an absent teacher, for TODAY only.
 *
 * Algorithm:
 *   1. Fetch ALL timetable entries for today's day name (across ALL classes).
 *   2. Filter to entries where the teacher == absentTeacher.
 *   3. For each entry, find a free substitute (subject match preferred).
 *   4. Upsert the result into timetable_overrides with today's date.
 *
 * Returns the SubstitutionResult so the UI can show a summary + generate
 * the PNG image for WhatsApp sharing.
 */
export function useAssignSubstitutes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      absentTeacher: string;
      teachers: Teacher[];
      allTimetableEntries: TimetableEntry[];
      /** Already-assigned overrides for today (so we don't double-book a
       *  substitute across multiple absent-teacher assignments). */
      existingOverrides?: TimetableOverride[];
    }): Promise<SubstitutionResult> => {
      const { absentTeacher, teachers, allTimetableEntries, existingOverrides = [] } = params;
      const today = todayDateStr();
      const todayName = todayDayName();

      // Normalize the absent teacher's name for case-insensitive comparison.
      const absentNorm = absentTeacher.trim().toLowerCase();

      // 1. Find every entry the absent teacher was supposed to teach today.
      //    "Today" = entries whose `day` column matches today's day name.
      const absentEntries = allTimetableEntries.filter((e) => {
        const t = (e.teacher || e.teacher_name || "").trim().toLowerCase();
        return t === absentNorm && e.day === todayName;
      });

      if (absentEntries.length === 0) {
        throw new Error(`${absentTeacher} has no classes scheduled for today (${todayName}).`);
      }

      // 2. Build a "busy" set: for each (day, period), which teachers are
      //    already teaching in ANY class? This includes:
      //      a. Regular timetable entries (from allTimetableEntries)
      //      b. Already-assigned overrides for today (existingOverrides)
      //    The absent teacher is NOT counted as busy (they're absent), so
      //    their name is removed from the busy set.
      const busyMap = new Map<string, Set<string>>(); // "day|period" → Set<teacherLower>
      const addBusy = (day: string, period: number, teacherName: string) => {
        const t = teacherName.trim().toLowerCase();
        if (!t || t === absentNorm) return; // skip absent teacher
        const key = `${day}|${period}`;
        if (!busyMap.has(key)) busyMap.set(key, new Set());
        busyMap.get(key)!.add(t);
      };
      // (a) regular timetable
      allTimetableEntries.forEach((e) => {
        if (e.day !== todayName) return;
        const t = e.teacher || e.teacher_name || "";
        if (t) addBusy(e.day, e.period_number, t);
      });
      // (b) existing overrides
      existingOverrides.forEach((o) => {
        if (o.effective_date !== today) return;
        addBusy(o.day, o.period_number, o.substitute_teacher);
      });

      const isFree = (teacherName: string, day: string, period: number): boolean => {
        const t = teacherName.trim().toLowerCase();
        if (t === absentNorm) return false;
        const key = `${day}|${period}`;
        const busy = busyMap.get(key);
        return !busy || !busy.has(t);
      };

      // 3. For each absent entry, pick a substitute.
      const assigned: SubstitutionResult["assigned"] = [];
      const uncovered: SubstitutionResult["uncovered"] = [];
      const overridesToUpsert: Array<{
        effective_date: string;
        class: string;
        day: string;
        period_number: number;
        subject: string;
        original_teacher: string | null;
        substitute_teacher: string;
        reason: string;
      }> = [];

      for (const entry of absentEntries) {
        const entrySubject = entry.subject?.trim() || "";
        const entrySubjectNorm = entrySubject.toLowerCase();

        // Candidate pool: all active teachers EXCEPT the absent one.
        const candidates = teachers.filter(
          (t) => t.full_name.trim().toLowerCase() !== absentNorm
        );

        // Strategy 1: subject match + free
        let pick: Teacher | undefined;
        let reason = "";
        const subjectMatches = candidates.filter((t) => {
          const tSub = (t.subject || "").trim().toLowerCase();
          return tSub && (tSub === entrySubjectNorm || tSub.includes(entrySubjectNorm) || entrySubjectNorm.includes(tSub));
        });
        // Sort by display_order for stable picking
        subjectMatches.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
        for (const t of subjectMatches) {
          if (isFree(t.full_name, entry.day, entry.period_number)) {
            pick = t;
            reason = "subject-match";
            break;
          }
        }

        // Strategy 2: any free teacher (fallback — no subject match)
        if (!pick) {
          const anyFree = candidates
            .filter((t) => isFree(t.full_name, entry.day, entry.period_number))
            .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
          if (anyFree.length > 0) {
            pick = anyFree[0];
            reason = "free-period";
          }
        }

        if (pick) {
          assigned.push({
            class: entry.class,
            day: entry.day,
            period_number: entry.period_number,
            subject: entry.subject,
            original_teacher: entry.teacher || entry.teacher_name || null,
            substitute_teacher: pick.full_name,
            reason,
          });
          overridesToUpsert.push({
            effective_date: today,
            class: entry.class,
            day: entry.day,
            period_number: entry.period_number,
            subject: entry.subject,
            original_teacher: entry.teacher || entry.teacher_name || null,
            substitute_teacher: pick.full_name,
            reason,
          });
          // Mark this substitute as busy at this period for subsequent entries
          // (so we don't assign the same substitute to two classes at once).
          addBusy(entry.day, entry.period_number, pick.full_name);
        } else {
          uncovered.push({
            class: entry.class,
            day: entry.day,
            period_number: entry.period_number,
            subject: entry.subject,
            reason: "No free teacher available",
          });
        }
      }

      // 4. Upsert all overrides into the database.
      if (overridesToUpsert.length > 0) {
        const { error } = await supabase
          .from("timetable_overrides")
          .upsert(overridesToUpsert, {
            onConflict: "effective_date,class,day,period_number",
          });
        if (error) throw error;
      }

      return { assigned, uncovered };
    },
    onSuccess: (result, vars) => {
      const today = todayDateStr();
      qc.invalidateQueries({ queryKey: ["timetable-overrides", today] });
      const msg =
        result.assigned.length === 0
          ? `No substitutes could be assigned for ${vars.absentTeacher}.`
          : `Assigned ${result.assigned.length} substitute class${result.assigned.length === 1 ? "" : "es"} for ${vars.absentTeacher} today.` +
            (result.uncovered.length ? ` ${result.uncovered.length} uncovered.` : "");
      toast.success(msg);
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to assign substitutes");
    },
  });
}

/**
 * Clear all of today's overrides. Useful if the admin made a mistake or
 * the absent teacher suddenly shows up.
 */
export function useClearTodayOverrides() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const today = todayDateStr();
      const { data, error } = await supabase
        .from("timetable_overrides")
        .delete()
        .eq("effective_date", today)
        .select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },
    onSuccess: (count) => {
      const today = todayDateStr();
      qc.invalidateQueries({ queryKey: ["timetable-overrides", today] });
      toast.success(count > 0 ? `Cleared ${count} substitute assignment${count === 1 ? "" : "s"} for today.` : "No overrides to clear.");
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to clear overrides");
    },
  });
}
