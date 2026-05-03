import { useState } from "react";
import PageLayout from "@/components/layout/PageLayout";
import PageBanner from "@/components/shared/PageBanner";
import { supabase } from "@/lib/supabase";
import {
  Search, Loader2, AlertCircle, CheckCircle2, Clock, XCircle, FileText
} from "lucide-react";
import toast from "react-hot-toast";
import { format, parseISO } from "date-fns";
import { MIGRATION_STEPS, STATUS_META, AdmissionStatus, AdmissionType } from "@/hooks/useAdmissions";

interface TrackResult {
  reference_no: string;
  full_name: string;
  applying_class: string;
  admission_type: AdmissionType;
  status: AdmissionStatus;
  migration_step: number | null;
  admin_note: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

const TrackPage = () => {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TrackResult[] | null>(null);

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const query = q.trim();
    if (!query) { toast.error("Enter your B-Form or Reference Number"); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("track_admission", { p_query: query });
      if (error) throw error;
      setResults((data ?? []) as TrackResult[]);
      if (!data || data.length === 0) toast("No application found", { icon: "🔍" });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Lookup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageLayout>
      <PageBanner title="Track Application" subtitle="Enter your Reference Number or B-Form to view status." />

      <section className="container mx-auto px-4 py-8 max-w-3xl">
        <form onSubmit={search} className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="OHS-2026-0001 or 12345-1234567-1"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button type="submit" disabled={loading}
            className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold px-5 py-3 rounded-xl disabled:opacity-60">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? "Searching…" : "Track"}
          </button>
        </form>

        {results === null && (
          <div className="mt-8 text-center text-muted-foreground text-sm">
            <FileText className="w-10 h-10 mx-auto opacity-30 mb-2" />
            Enter your reference number or B-Form to begin.
          </div>
        )}

        {results && results.length === 0 && (
          <div className="mt-8 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900 text-orange-900 dark:text-orange-100 rounded-xl p-4 text-sm flex items-start gap-2">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <strong>No application found.</strong> Please check the number and try again. If you just submitted, allow a few seconds.
            </div>
          </div>
        )}

        <div className="mt-6 space-y-6">
          {results?.map((r) => {
            const meta = STATUS_META[r.status];
            const isMigration = r.admission_type === "migration";
            return (
              <div key={r.reference_no} className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Reference</p>
                    <p className="text-xl font-extrabold text-primary">{r.reference_no}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${meta.cls}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
                  <div><p className="text-[10px] uppercase text-muted-foreground font-semibold">Applicant</p><p className="font-semibold text-foreground truncate">{r.full_name}</p></div>
                  <div><p className="text-[10px] uppercase text-muted-foreground font-semibold">Class</p><p className="font-semibold text-foreground">{r.applying_class}</p></div>
                  <div><p className="text-[10px] uppercase text-muted-foreground font-semibold">Type</p><p className="font-semibold text-foreground capitalize">{r.admission_type}</p></div>
                  <div><p className="text-[10px] uppercase text-muted-foreground font-semibold">Updated</p><p className="font-semibold text-foreground">{(() => { try { return format(parseISO(r.updated_at), "d MMM yyyy"); } catch { return "—"; } })()}</p></div>
                </div>

                {r.admin_note && (
                  <div className="mt-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-100 rounded-lg p-3 text-sm">
                    <strong>Note from admin:</strong> {r.admin_note}
                  </div>
                )}
                {r.rejection_reason && (
                  <div className="mt-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-900 dark:text-red-100 rounded-lg p-3 text-sm">
                    <strong>Reason:</strong> {r.rejection_reason}
                  </div>
                )}

                {isMigration && (
                  <div className="mt-5">
                    <p className="text-sm font-bold text-foreground mb-3">Migration Progress</p>
                    <ol className="space-y-2">
                      {MIGRATION_STEPS.map((s) => {
                        const cur = r.migration_step ?? 0;
                        const done = s.n < cur || (s.n === cur && r.status === "approved");
                        const inProg = s.n === cur && r.status !== "approved";
                        return (
                          <li key={s.n} className="flex items-center gap-3">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                              done ? "bg-green-500 text-white" : inProg ? "bg-primary text-primary-foreground animate-pulse" : "bg-secondary text-muted-foreground"
                            }`}>
                              {done ? <CheckCircle2 className="w-4 h-4" /> : inProg ? <Clock className="w-3.5 h-3.5" /> : s.n}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm ${done ? "text-foreground font-semibold line-through opacity-60" : inProg ? "text-foreground font-bold" : "text-muted-foreground"}`}>{s.label}</p>
                            </div>
                            {inProg && <span className="text-[10px] font-bold text-primary uppercase tracking-wider">In Progress</span>}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </PageLayout>
  );
};

export default TrackPage;
