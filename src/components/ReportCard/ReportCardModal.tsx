// src/components/ReportCard/ReportCardModal.tsx
// Full-screen modal containing the Report Card bulk-result feature.
//
// Flow:
//   1. Password gate (password: zahir000) — kept in sessionStorage so the
//      user doesn't re-enter it on every open during a single session.
//   2. Exam selection: class (9th/10th) + exam type (Annual-I/II) + year
//   3. Roll number input area — paste/type roll numbers, persisted to
//      localStorage so they survive page reloads until explicitly deleted.
//   4. Search button — bulk-fetches all rolls via /api/bisep-proxy with
//      bounded concurrency + progress bar.
//   5. Results summary + two download buttons: PDF (totals) and Excel
//      (every paper's marks).
//
// Mobile-friendly: full-screen on small viewports, scrollable, touch-
// friendly button sizes, responsive grids.

import { useEffect, useMemo, useState } from "react";
import {
  X, Lock, Search, FileText, FileSpreadsheet, Trash2, Plus,
  Loader2, AlertCircle, CheckCircle2, XCircle, Download, ArrowLeft,
} from "lucide-react";
import type { ExamSelection, NormalizedResult, RollEntry } from "./types";
import { bulkFetchResults } from "./bulkFetch";
import { computeStats } from "./normalize";
import { generateResultPDF } from "./generatePDF";
import { generateResultExcel } from "./generateExcel";

const PASSWORD = "zahir000";
const SESSION_KEY = "rc_auth_ok";
const LS_ROLLS_KEY = "rc_roll_entries";
const LS_SELECTION_KEY = "rc_exam_selection";

type Stage = "password" | "form" | "fetching" | "results";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ReportCardModal({ open, onClose }: Props) {
  const [stage, setStage] = useState<Stage>("password");
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Exam selection — persisted across sessions
  const [selection, setSelection] = useState<ExamSelection>(() => {
    try {
      const saved = localStorage.getItem(LS_SELECTION_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return { className: "10th", examType: "Annual-I", year: String(new Date().getFullYear()) };
  });

  // Roll entries — persisted PER exam selection (class + exam type + year),
  // so switching from e.g. 9th → 10th no longer shows the previous class's
  // saved roll numbers. All entries live under one localStorage key as a
  // map of "className|examType|year" → RollEntry[].
  const [rollsBySelection, setRollsBySelection] = useState<Record<string, RollEntry[]>>(() => {
    try {
      const saved = localStorage.getItem(LS_ROLLS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Migrate the old flat-array format (single shared list, pre-fix)
        // into the new per-selection map under the default selection so
        // existing saved rolls aren't silently lost.
        if (Array.isArray(parsed)) {
          const migratedKey = `10th|Annual-I|${new Date().getFullYear()}`;
          return { [migratedKey]: parsed };
        }
        return parsed ?? {};
      }
    } catch {}
    return {};
  });

  // New roll input (textarea — user can paste many at once)
  const [rollInput, setRollInput] = useState("");

  // ── Key for the currently selected exam, and derived roll list ──
  const selectionKey = `${selection.className}|${selection.examType}|${selection.year}`;
  const rollEntries = rollsBySelection[selectionKey] ?? [];
  const setRollEntries = (
    updater: RollEntry[] | ((prev: RollEntry[]) => RollEntry[])
  ) => {
    setRollsBySelection((prevMap) => {
      const prevList = prevMap[selectionKey] ?? [];
      const nextList = typeof updater === "function" ? (updater as (p: RollEntry[]) => RollEntry[])(prevList) : updater;
      return { ...prevMap, [selectionKey]: nextList };
    });
  };

  // Fetching state
  const [progress, setProgress] = useState({ done: 0, total: 0, current: "" });
  const [results, setResults] = useState<NormalizedResult[] | null>(null);
  const [fetchError, setFetchError] = useState("");

  // Persist on change
  useEffect(() => {
    try {
      localStorage.setItem(LS_ROLLS_KEY, JSON.stringify(rollsBySelection));
    } catch {
      // localStorage unavailable (privacy mode / blocked storage) — ignore.
    }
  }, [rollsBySelection]);
  useEffect(() => {
    try {
      localStorage.setItem(LS_SELECTION_KEY, JSON.stringify(selection));
    } catch {
      // localStorage unavailable (privacy mode / blocked storage) — ignore.
    }
  }, [selection]);

  // Reset to password stage when modal re-opens, unless already authed this session
  useEffect(() => {
    if (open) {
      let authed = false;
      try {
        authed = sessionStorage.getItem(SESSION_KEY) === "1";
      } catch {
        // sessionStorage unavailable (privacy mode / blocked storage) — treat as not authed.
      }
      setStage(authed ? "form" : "password");
      setPasswordInput("");
      setPasswordError("");
      setFetchError("");
    }
  }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Lock body scroll while modal is open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  // ── Stats for results view ──
  // MUST be called before the `if (!open) return null;` early return below —
  // React requires every hook to run in the same order on every render.
  // Previously this useMemo sat AFTER the early return, so when `open` went
  // from false → true, React saw one more hook than the prior render and
  // threw "Rendered more hooks than during the previous render" (React
  // error #310), which the ErrorBoundary caught and showed as
  // "Something went wrong" the instant the button was clicked.
  const stats = useMemo(
    () => (results ? computeStats(results) : null),
    [results]
  );

  if (!open) return null;

  // ── Password submit ──
  const submitPassword = () => {
    if (passwordInput.trim() === PASSWORD) {
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        // sessionStorage unavailable (privacy mode / blocked storage) — ignore.
      }
      setStage("form");
      setPasswordError("");
    } else {
      setPasswordError("Incorrect password. Try again.");
    }
  };

  // ── Parse the textarea into clean roll strings ──
  const parseRollInput = (text: string): string[] => {
    return text
      .split(/[\s,\n\r\t;|]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d{4,10}$/.test(s));
  };

  // ── Add rolls from textarea ──
  const addRolls = () => {
    const parsed = parseRollInput(rollInput);
    if (parsed.length === 0) return;
    const existing = new Set(rollEntries.map((e) => e.roll));
    const fresh = parsed.filter((r) => !existing.has(r));
    if (fresh.length === 0) {
      setRollInput("");
      return;
    }
    const newEntries: RollEntry[] = fresh.map((roll, i) => ({
      roll,
      addedAt: Date.now() + i,
    }));
    setRollEntries((prev) => [...prev, ...newEntries]);
    setRollInput("");
  };

  // ── Remove a single roll ──
  const removeRoll = (roll: string) => {
    setRollEntries((prev) => prev.filter((e) => e.roll !== roll));
  };

  // ── Clear all rolls ──
  const clearAllRolls = () => {
    if (rollEntries.length === 0) return;
    if (confirm(`Delete all ${rollEntries.length} roll numbers? This cannot be undone.`)) {
      setRollEntries([]);
      setResults(null);
    }
  };

  // ── Start the bulk fetch ──
  const startSearch = async () => {
    if (rollEntries.length === 0) return;
    setStage("fetching");
    setFetchError("");
    setResults(null);
    setProgress({ done: 0, total: rollEntries.length, current: "" });
    try {
      const rolls = rollEntries.map((e) => e.roll);
      const res = await bulkFetchResults(rolls, (done, total, current) => {
        setProgress({ done, total, current });
      });
      setResults(res);
      setStage("results");
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to fetch results.");
      setStage("form");
    }
  };

  // ── Download handlers ──
  const downloadPDF = () => {
    if (!results) return;
    const stats = computeStats(results);
    generateResultPDF(results, stats, selection);
  };
  const downloadExcel = async () => {
    if (!results) return;
    const stats = computeStats(results);
    await generateResultExcel(results, stats, selection);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      style={{ height: "100dvh" }}
      onClick={onClose}
    >
      <div
        className="bg-card w-full max-w-4xl sm:h-auto sm:max-h-[92vh] sm:rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden"
        style={{ height: "100dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-3 sm:px-5 py-4 border-b border-border bg-primary text-primary-foreground sm:rounded-t-2xl shrink-0 z-10"
          style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Back button — small, top-left corner. Returns to the Results
                page by closing the modal. Provides an obvious escape hatch
                for users who opened the modal by mistake or want to abandon
                mid-flow without having to hunt for the close X. */}
            <button
              onClick={onClose}
              className="p-1.5 -ml-1 rounded-lg hover:bg-white/15 active:bg-white/25 transition-colors shrink-0"
              aria-label="Back to results"
              title="Back to results"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <FileText className="w-5 h-5 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-bold text-base sm:text-lg leading-tight truncate">
                Report Card
              </h2>
              <p className="text-[11px] sm:text-xs opacity-80 leading-tight">
                GHS Babi Khel · District Mohmand · BISE Peshawar
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/15 transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* ── Stage 1: Password ── */}
          {stage === "password" && (
            <div className="flex flex-col items-center justify-center py-10 sm:py-16 px-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
                <Lock className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2 text-center">
                Password Required
              </h3>
              <p className="text-sm text-muted-foreground mb-6 text-center max-w-sm">
                This feature is restricted. Enter the password to generate bulk result reports.
              </p>
              <div className="w-full max-w-xs space-y-3">
                <input
                  type="password"
                  value={passwordInput}
                  autoFocus
                  onChange={(e) => {
                    setPasswordInput(e.target.value);
                    setPasswordError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitPassword();
                  }}
                  placeholder="Enter password"
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground text-center text-lg tracking-wider focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
                {passwordError && (
                  <p className="text-sm text-destructive text-center flex items-center justify-center gap-1.5">
                    <AlertCircle className="w-4 h-4" />
                    {passwordError}
                  </p>
                )}
                <button
                  onClick={submitPassword}
                  className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-colors"
                >
                  Unlock
                </button>
              </div>
            </div>
          )}

          {/* ── Stage 2 & 3: Form + Fetching ── */}
          {(stage === "form" || stage === "fetching") && (
            <div className="space-y-5">
              {/* Exam selection */}
              <section>
                <h3 className="text-sm font-bold text-foreground mb-3 uppercase tracking-wide text-muted-foreground">
                  Exam Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Class */}
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                      Class
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["9th", "10th"] as const).map((c) => (
                        <button
                          key={c}
                          disabled={stage === "fetching"}
                          onClick={() => setSelection((s) => ({ ...s, className: c }))}
                          className={`px-3 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
                            selection.className === c
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background text-foreground border-border hover:border-primary/40"
                          } ${stage === "fetching" ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Exam Type */}
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                      Exam Type
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["Annual-I", "Annual-II"] as const).map((t) => (
                        <button
                          key={t}
                          disabled={stage === "fetching"}
                          onClick={() => setSelection((s) => ({ ...s, examType: t }))}
                          className={`px-3 py-2.5 rounded-lg text-xs font-semibold border transition-colors ${
                            selection.examType === t
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background text-foreground border-border hover:border-primary/40"
                          } ${stage === "fetching" ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Year */}
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                      Year
                    </label>
                    <input
                      type="number"
                      value={selection.year}
                      disabled={stage === "fetching"}
                      onChange={(e) =>
                        setSelection((s) => ({ ...s, year: e.target.value }))
                      }
                      placeholder="2026"
                      className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50"
                    />
                  </div>
                </div>
              </section>

              {/* Roll numbers */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-foreground uppercase tracking-wide text-muted-foreground">
                    Roll Numbers
                    {rollEntries.length > 0 && (
                      <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full normal-case tracking-normal">
                        {rollEntries.length} saved
                      </span>
                    )}
                  </h3>
                  {rollEntries.length > 0 && (
                    <button
                      onClick={clearAllRolls}
                      disabled={stage === "fetching"}
                      className="text-xs text-destructive hover:text-destructive/80 font-semibold flex items-center gap-1 disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete All
                    </button>
                  )}
                </div>

                {/* Add new rolls */}
                <div className="mb-3">
                  <textarea
                    value={rollInput}
                    disabled={stage === "fetching"}
                    onChange={(e) => setRollInput(e.target.value)}
                    placeholder={"Paste roll numbers here — separated by spaces, commas, or new lines.\ne.g.\n703900\n703902, 703988\n704001 704002"}
                    rows={3}
                    className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-y disabled:opacity-50"
                  />
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-muted-foreground">
                      Only 4–10 digit numbers are accepted.
                    </p>
                    <button
                      onClick={addRolls}
                      disabled={stage === "fetching" || !rollInput.trim()}
                      className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Rolls
                    </button>
                  </div>
                </div>

                {/* Saved roll list */}
                {rollEntries.length === 0 ? (
                  <div className="text-center py-8 bg-muted/40 rounded-lg border border-dashed border-border">
                    <p className="text-sm text-muted-foreground">
                      No roll numbers saved yet. Paste some above to get started.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-2 bg-muted/30 rounded-lg border border-border">
                    {rollEntries.map((entry) => (
                      <span
                        key={entry.roll}
                        className="inline-flex items-center gap-1 bg-background border border-border rounded-md pl-2 pr-1 py-1 text-xs font-mono"
                      >
                        {entry.roll}
                        <button
                          onClick={() => removeRoll(entry.roll)}
                          disabled={stage === "fetching"}
                          className="p-0.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
                          aria-label={`Remove ${entry.roll}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </section>

              {/* Fetching progress */}
              {stage === "fetching" && (
                <section className="bg-primary/5 border border-primary/15 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        Fetching results from BISE Peshawar…
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {progress.done} / {progress.total}
                        {progress.current && `  ·  current: ${progress.current}`}
                      </p>
                    </div>
                  </div>
                  <div className="h-2 bg-background rounded-full overflow-hidden border border-border">
                    <div
                      className="h-full bg-primary transition-all duration-200 ease-out"
                      style={{
                        width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </section>
              )}

              {/* Search button */}
              {stage === "form" && (
                <button
                  onClick={startSearch}
                  disabled={rollEntries.length === 0}
                  className="w-full px-4 py-3.5 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Search className="w-5 h-5" />
                  Search {rollEntries.length} Roll Number{rollEntries.length === 1 ? "" : "s"}
                </button>
              )}

              {fetchError && (
                <p className="text-sm text-destructive flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" />
                  {fetchError}
                </p>
              )}
            </div>
          )}

          {/* ── Stage 4: Results ── */}
          {stage === "results" && results && stats && (
            <div className="space-y-5">
              {/* Summary tiles */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-foreground uppercase tracking-wide text-muted-foreground">
                    Results Summary
                  </h3>
                  <button
                    onClick={() => setStage("form")}
                    className="text-xs text-primary hover:underline font-semibold"
                  >
                    ← Back to form
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <StatTile label="Total" value={stats.totalStudents} />
                  <StatTile label="Found" value={stats.foundCount} />
                  <StatTile label="Not Found" value={stats.notFoundCount} />
                  <StatTile label="Errors" value={stats.errorCount} />
                  <StatTile label="Passed" value={stats.passCount} color="text-emerald-600 dark:text-emerald-400" />
                  <StatTile label="Failed" value={stats.failCount} color="text-red-600 dark:text-red-400" />
                  <StatTile label="Pass %" value={`${stats.passPercentage}%`} />
                  <StatTile label="Average" value={stats.averageMarks} />
                </div>
                {stats.topScorerName && (
                  <div className="mt-3 p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-lg">
                    <p className="text-xs text-emerald-800 dark:text-emerald-300 font-semibold">
                      🏆 Top Scorer: {stats.topScorerName} (Roll {stats.topScorerRoll}) — {stats.highestMarks} marks
                    </p>
                  </div>
                )}
              </section>

              {/* Download buttons */}
              <section className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={downloadPDF}
                  className="flex-1 px-4 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                >
                  <FileText className="w-5 h-5" />
                  Download PDF
                </button>
                <button
                  onClick={downloadExcel}
                  className="flex-1 px-4 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                >
                  <FileSpreadsheet className="w-5 h-5" />
                  Download Excel
                </button>
              </section>

              {/* Results list (preview) */}
              <section>
                <h3 className="text-sm font-bold text-foreground mb-3 uppercase tracking-wide text-muted-foreground">
                  Student Results ({results.length})
                </h3>
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/50 text-xs font-bold text-muted-foreground uppercase tracking-wide">
                    <div className="col-span-2">Roll</div>
                    <div className="col-span-4">Name</div>
                    <div className="col-span-2 text-center">Total</div>
                    <div className="col-span-2 text-center">Grade</div>
                    <div className="col-span-2 text-center">Status</div>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-border">
                    {results.map((r) => (
                      <div
                        key={r.roll}
                        className="grid grid-cols-12 gap-2 px-3 py-2 text-sm hover:bg-muted/30"
                      >
                        <div className="col-span-2 font-mono text-xs">{r.roll}</div>
                        <div className="col-span-4 truncate">
                          {r.found ? (r.name || "—") : (
                            <span className="text-muted-foreground italic">{r.error || "Not found"}</span>
                          )}
                        </div>
                        <div className="col-span-2 text-center font-semibold">
                          {r.found && r.totalMarks > 0 ? r.totalMarks : "—"}
                        </div>
                        <div className="col-span-2 text-center">
                          {r.found ? (r.grade || (r.isFail ? "F" : "—")) : "—"}
                        </div>
                        <div className="col-span-2 text-center">
                          {!r.found ? (
                            <span className="text-muted-foreground">—</span>
                          ) : r.isFail ? (
                            <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 text-xs font-semibold">
                              <XCircle className="w-3.5 h-3.5" />
                              FAIL
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              PASS
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" />
                  PDF shows totals + summary. Excel shows every paper's marks.
                </p>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Small stat tile ──
function StatTile({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="bg-muted/40 border border-border rounded-lg p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
        {label}
      </p>
      <p className={`text-xl font-bold mt-0.5 ${color || "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}
