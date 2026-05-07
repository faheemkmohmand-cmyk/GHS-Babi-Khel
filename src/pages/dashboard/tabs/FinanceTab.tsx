import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import {
  getMyCharges, getMyPayments, getStudentLedger, submitWalletPayment,
  getAllStudentLedgers,
} from "@/lib/financeService";
import type { StudentCharge, Payment } from "@/lib/financeService";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign, CreditCard, Clock, CheckCircle, XCircle,
  Smartphone, Banknote, FileText, Upload, AlertTriangle,
  ChevronDown, ChevronUp, ArrowUpRight, ArrowDownLeft, Receipt,
  Users, Search,
} from "lucide-react";
import { format } from "date-fns";

// ─── Utilities ────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `Rs. ${Number(n).toLocaleString("en-PK", { minimumFractionDigits: 0 })}`;

const statusColor = (s: string) =>
  s === "paid" || s === "completed"
    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
    : s === "partial"
    ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
    : s === "rejected"
    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";

const statusIcon = (s: string) =>
  s === "paid" || s === "completed" ? (
    <CheckCircle className="w-4 h-4 text-green-500" />
  ) : s === "rejected" ? (
    <XCircle className="w-4 h-4 text-red-500" />
  ) : (
    <Clock className="w-4 h-4 text-yellow-500" />
  );

// ─── My Fees Tab ──────────────────────────────────────────────────────────────

function MyFeesTab({ onPayNow }: { onPayNow: (charges: StudentCharge[]) => void }) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "partial" | "paid">("all");

  const { data: charges = [], isLoading } = useQuery({
    queryKey: ["my-charges", user?.id],
    queryFn: () => getMyCharges(user!.id),
    enabled: !!user,
  });

  const { data: ledger } = useQuery({
    queryKey: ["my-ledger", user?.id],
    queryFn: () => getStudentLedger(user!.id),
    enabled: !!user,
  });

  const filtered = charges.filter((c) => filter === "all" || c.status === filter);
  const pendingCharges = charges.filter((c) => c.status !== "paid");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-primary" /> My Fees
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">Your fee charges and payment status</p>
      </div>

      {/* Ledger Summary */}
      {ledger && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-2xl p-3 text-center">
            <p className="text-sm font-black text-foreground">{fmt(ledger.total_charged)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Total Charged</p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-3 text-center">
            <p className="text-sm font-black text-green-600">{fmt(ledger.total_paid)}</p>
            <p className="text-[10px] text-green-600/70 mt-0.5">Paid</p>
          </div>
          <div className={`border rounded-2xl p-3 text-center ${ledger.balance > 0 ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" : "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"}`}>
            <p className={`text-sm font-black ${ledger.balance > 0 ? "text-red-600" : "text-green-600"}`}>
              {ledger.balance <= 0 ? "✓ Clear" : fmt(ledger.balance)}
            </p>
            <p className={`text-[10px] mt-0.5 ${ledger.balance > 0 ? "text-red-500/70" : "text-green-500/70"}`}>
              {ledger.balance > 0 ? "Balance Due" : "No Dues"}
            </p>
          </div>
        </div>
      )}

      {/* Pay Now Button */}
      {pendingCharges.length > 0 && (
        <button
          onClick={() => onPayNow(pendingCharges)}
          className="w-full py-3 rounded-2xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
        >
          <CreditCard className="w-4 h-4" />
          Pay Dues via Wallet ({fmt(pendingCharges.reduce((s, c) => s + c.amount - (c.amount_paid || 0), 0))})
        </button>
      )}

      {/* Filter */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
        {(["all", "pending", "partial", "paid"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize whitespace-nowrap shrink-0 transition-colors ${
              filter === f ? "bg-primary text-white" : "bg-secondary text-muted-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center">
          <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {filter === "all" ? "No charges assigned yet" : `No ${filter} charges`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => {
            const remaining = c.amount - (c.amount_paid || 0);
            const pct = c.amount > 0 ? Math.min(100, Math.round(((c.amount_paid || 0) / c.amount) * 100)) : 0;
            const exp = expanded === c.id;
            return (
              <div key={c.id} className="bg-card border border-border rounded-xl overflow-hidden">
                <div
                  className="p-4 cursor-pointer"
                  onClick={() => setExpanded(exp ? null : c.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      c.status === "paid" ? "bg-green-100" : c.status === "partial" ? "bg-yellow-100" : "bg-red-100"
                    }`}>
                      {c.status === "paid" ? (
                        <CheckCircle className="w-4.5 h-4.5 text-green-600" />
                      ) : c.status === "partial" ? (
                        <Clock className="w-4.5 h-4.5 text-yellow-600" />
                      ) : (
                        <AlertTriangle className="w-4.5 h-4.5 text-red-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">{c.title}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor(c.status)}`}>
                          {c.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {fmt(c.amount)}
                        {c.due_date && ` · Due ${format(new Date(c.due_date), "dd MMM yyyy")}`}
                      </p>
                      {/* Progress bar */}
                      {c.status !== "pending" && (
                        <div className="mt-2 bg-muted rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${c.status === "paid" ? "bg-green-500" : "bg-yellow-400"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {c.status !== "paid" && (
                        <>
                          <p className="text-sm font-bold text-red-600">{fmt(remaining)}</p>
                          <p className="text-[10px] text-muted-foreground">due</p>
                        </>
                      )}
                    </div>
                    {exp ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                  </div>
                </div>
                {exp && (
                  <div className="border-t border-border p-3 bg-secondary/30 space-y-1.5 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">Total Amount</span><span className="font-semibold">{fmt(c.amount)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Amount Paid</span><span className="font-semibold text-green-600">{fmt(c.amount_paid || 0)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Remaining</span><span className="font-semibold text-red-600">{fmt(remaining)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Category</span><span className="capitalize">{(c.fee_type as any)?.category || "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Assigned</span><span>{format(new Date(c.created_at), "dd MMM yyyy")}</span></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Pay Fee (Wallet Submission) ──────────────────────────────────────────────

function PayFeeTab({ preselectedCharges }: { preselectedCharges?: StudentCharge[] }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: charges = [] } = useQuery({
    queryKey: ["my-charges", user?.id],
    queryFn: () => getMyCharges(user!.id),
    enabled: !!user,
  });

  const pendingCharges = charges.filter((c) => c.status !== "paid");

  const [selCharges, setSelCharges] = useState<string[]>(
    preselectedCharges?.map((c) => c.id) ?? []
  );
  const [method, setMethod] = useState<"jazzcash" | "easypaisa">("jazzcash");
  const [refNum, setRefNum] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const total = pendingCharges
    .filter((c) => selCharges.includes(c.id))
    .reduce((s, c) => s + c.amount - (c.amount_paid || 0), 0);

  const toggleCharge = (id: string) =>
    setSelCharges((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submitMut = useMutation({
    mutationFn: async () => {
      let screenshotUrl: string | undefined;
      if (screenshot) {
        setUploading(true);
        const ext = screenshot.name.split(".").pop();
        const path = `payment-screenshots/${user!.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("uploads")
          .upload(path, screenshot, { upsert: true });
        setUploading(false);
        if (!upErr) {
          const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(path);
          screenshotUrl = urlData?.publicUrl;
        }
      }
      return submitWalletPayment({
        student_id: user!.id,
        charge_ids: selCharges,
        total_amount: total,
        payment_method: method,
        reference_number: refNum,
        screenshot_url: screenshotUrl,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-payments"] });
      setSubmitted(true);
      setSelCharges([]); setRefNum(""); setScreenshot(null);
      setTimeout(() => setSubmitted(false), 5000);
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-primary" /> Pay via Wallet
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">Submit JazzCash / EasyPaisa payment for admin verification</p>
      </div>

      {submitted && (
        <div className="bg-green-100 border border-green-300 rounded-2xl p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-green-800">Payment submitted!</p>
            <p className="text-xs text-green-700 mt-0.5">
              Your payment is pending admin verification. You'll see the status in Payment History.
            </p>
          </div>
        </div>
      )}

      {pendingCharges.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center">
          <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-foreground">All dues cleared!</p>
          <p className="text-xs text-muted-foreground mt-1">You have no pending charges.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Select Charges */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <p className="text-sm font-semibold text-foreground">Select Charges to Pay</p>
            {pendingCharges.map((c) => {
              const remaining = c.amount - (c.amount_paid || 0);
              const selected = selCharges.includes(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggleCharge(c.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                    selected ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30"
                  }`}
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${selected ? "bg-primary border-primary" : "border-muted-foreground"}`}>
                    {selected && (
                      <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold text-foreground">{c.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Due: <span className="text-red-600 font-semibold">{fmt(remaining)}</span>
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor(c.status)}`}>{c.status}</span>
                </button>
              );
            })}
          </div>

          {selCharges.length > 0 && (
            <>
              {/* Payment Method */}
              <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                <p className="text-sm font-semibold text-foreground">Payment Method</p>
                <div className="flex gap-2">
                  {(["jazzcash", "easypaisa"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMethod(m)}
                      className={`flex-1 py-3 rounded-xl border-2 font-bold text-sm capitalize flex flex-col items-center gap-1 transition-all ${
                        method === m ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"
                      }`}
                    >
                      <Smartphone className="w-5 h-5" />
                      {m === "jazzcash" ? "JazzCash" : "EasyPaisa"}
                    </button>
                  ))}
                </div>

                {/* Amount Preview */}
                <div className="bg-secondary rounded-xl p-3 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total to Pay</span>
                  <span className="text-lg font-black text-primary">{fmt(total)}</span>
                </div>

                {/* Reference Number */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">Transaction Reference Number *</label>
                  <input
                    value={refNum}
                    onChange={(e) => setRefNum(e.target.value)}
                    placeholder="e.g. TXN-12345678"
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary font-mono"
                  />
                </div>

                {/* Screenshot */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                    Payment Screenshot (optional but recommended)
                  </label>
                  <label className="flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                    <Upload className="w-6 h-6 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {screenshot ? screenshot.name : "Tap to upload screenshot"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setScreenshot(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  {screenshot && (
                    <img
                      src={URL.createObjectURL(screenshot)}
                      alt="preview"
                      className="mt-2 w-full max-h-36 object-contain rounded-xl border border-border"
                    />
                  )}
                </div>

                <button
                  onClick={() => submitMut.mutate()}
                  disabled={!refNum || total <= 0 || submitMut.isPending || uploading}
                  className="w-full py-3 rounded-xl font-bold text-sm bg-primary text-white hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                >
                  {uploading ? "Uploading…" : submitMut.isPending ? "Submitting…" : (
                    <><Smartphone className="w-4 h-4" /> Submit {method === "jazzcash" ? "JazzCash" : "EasyPaisa"} Payment</>
                  )}
                </button>
                <p className="text-[11px] text-muted-foreground text-center">
                  Admin will verify your payment. Receipt will be issued after approval.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Payment History ──────────────────────────────────────────────────────────

function PaymentHistoryTab() {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["my-payments", user?.id],
    queryFn: () => getMyPayments(user!.id),
    enabled: !!user,
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
          <Receipt className="w-5 h-5 text-primary" /> Payment History
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">All your payment submissions and receipts</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : payments.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center">
          <Receipt className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No payment history yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {payments.map((p) => {
            const receipt = (p as any).receipt;
            const items = (p.items ?? []) as any[];
            const exp = expanded === p.id;
            return (
              <div key={p.id} className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="p-4 cursor-pointer" onClick={() => setExpanded(exp ? null : p.id)}>
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      p.status === "completed" ? "bg-green-100" : p.status === "rejected" ? "bg-red-100" : "bg-yellow-100"
                    }`}>
                      {statusIcon(p.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor(p.status)}`}>
                          {p.status}
                        </span>
                        <span className="text-xs text-muted-foreground capitalize flex items-center gap-1">
                          {p.payment_method === "cash" ? <Banknote className="w-3 h-3" /> : <Smartphone className="w-3 h-3" />}
                          {p.payment_method}
                        </span>
                        {receipt && (
                          <span className="text-[10px] font-mono text-primary">#{receipt.receipt_number}</span>
                        )}
                      </div>
                      <p className="text-sm font-bold text-foreground mt-0.5">{fmt(p.total_amount)}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {format(new Date(p.paid_at), "dd MMM yyyy, hh:mm a")}
                      </p>
                    </div>
                    {exp ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                  </div>
                </div>

                {exp && (
                  <div className="border-t border-border p-4 bg-secondary/30 space-y-3">
                    {/* Items breakdown */}
                    {items.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-muted-foreground">Charges Paid:</p>
                        {items.map((item, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-foreground">{item.charge?.title || "Fee"}</span>
                            <span className="font-semibold">{fmt(item.amount_paid)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-sm font-bold pt-1 border-t border-border">
                          <span>Total</span>
                          <span className="text-primary">{fmt(p.total_amount)}</span>
                        </div>
                      </div>
                    )}

                    {p.reference_number && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Reference #</span>
                        <span className="font-mono font-semibold">{p.reference_number}</span>
                      </div>
                    )}

                    {p.status === "rejected" && p.rejection_reason && (
                      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-xl p-3">
                        <p className="text-xs font-semibold text-red-700 mb-0.5">Rejection Reason:</p>
                        <p className="text-xs text-red-600">{p.rejection_reason}</p>
                      </div>
                    )}

                    {p.status === "pending" && (
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 rounded-xl p-3 flex items-start gap-2">
                        <Clock className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-yellow-700">
                          Your payment is under review. Admin will verify and approve soon.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── All Students Overview ────────────────────────────────────────────────────

function AllStudentsTab() {
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState<string>("all");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["all-student-ledgers"],
    queryFn: getAllStudentLedgers,
    staleTime: 60_000,
  });

  const classes = Array.from(new Set(rows.map((r) => r.class).filter(Boolean))).sort();
  const q = search.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (classFilter !== "all" && r.class !== classFilter) return false;
    if (!q) return true;
    return (
      (r.full_name || "").toLowerCase().includes(q) ||
      (r.roll_number || "").toLowerCase().includes(q) ||
      (r.class || "").toLowerCase().includes(q)
    );
  });

  const totals = filtered.reduce(
    (acc, r) => {
      acc.charged += r.total_charged;
      acc.paid += r.total_paid;
      acc.balance += r.balance;
      return acc;
    },
    { charged: 0, paid: 0, balance: 0 }
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" /> All Students — Fees Overview
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Browse fee status across every class and student
        </p>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="bg-card border border-border rounded-2xl p-3 text-center">
          <p className="text-sm font-black text-foreground">{fmt(totals.charged)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Charged</p>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-3 text-center">
          <p className="text-sm font-black text-green-600">{fmt(totals.paid)}</p>
          <p className="text-[10px] text-green-600/70 mt-0.5">Paid</p>
        </div>
        <div className={`border rounded-2xl p-3 text-center ${totals.balance > 0 ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" : "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"}`}>
          <p className={`text-sm font-black ${totals.balance > 0 ? "text-red-600" : "text-green-600"}`}>
            {totals.balance <= 0 ? "✓ Clear" : fmt(totals.balance)}
          </p>
          <p className="text-[10px] mt-0.5 text-muted-foreground">Balance</p>
        </div>
      </div>

      {/* Search + class filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, roll no, class…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-secondary border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl bg-secondary border border-border text-sm font-medium outline-none"
        >
          <option value="all">All Classes</option>
          {classes.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center">
          <Users className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No students match your filters</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const cleared = r.balance <= 0;
            return (
              <div key={r.student_id} className="bg-card border border-border rounded-xl p-3 sm:p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm ${cleared ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                  {(r.full_name || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{r.full_name || "—"}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {r.class || "—"} · Roll {r.roll_number || "—"}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-[11px] flex-wrap">
                    <span className="text-muted-foreground">Charged <span className="font-semibold text-foreground">{fmt(r.total_charged)}</span></span>
                    <span className="text-muted-foreground">Paid <span className="font-semibold text-green-600">{fmt(r.total_paid)}</span></span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold ${cleared ? "text-green-600" : "text-red-600"}`}>
                    {cleared ? "✓ Clear" : fmt(r.balance)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{cleared ? "no dues" : "due"}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Student Finance Tab ─────────────────────────────────────────────────

const TABS = [
  { id: "fees", label: "My Fees", icon: FileText },
  { id: "all", label: "All Students", icon: Users },
  { id: "pay", label: "Pay Now", icon: CreditCard },
  { id: "history", label: "History", icon: Receipt },
] as const;

type TabId = typeof TABS[number]["id"];

export default function FinanceTab() {
  const [activeTab, setActiveTab] = useState<TabId>("fees");
  const [preselectedCharges, setPreselectedCharges] = useState<StudentCharge[]>([]);

  const handlePayNow = (charges: StudentCharge[]) => {
    setPreselectedCharges(charges);
    setActiveTab("pay");
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Sub-tabs */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
              activeTab === t.id ? "bg-primary text-white" : "bg-secondary text-muted-foreground"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "fees" && <MyFeesTab onPayNow={handlePayNow} />}
      {activeTab === "all" && <AllStudentsTab />}
      {activeTab === "pay" && <PayFeeTab preselectedCharges={preselectedCharges} />}
      {activeTab === "history" && <PaymentHistoryTab />}
    </div>
  );
}
