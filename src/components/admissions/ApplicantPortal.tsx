/**
 * ApplicantPortal.tsx
 * Full applicant portal: phone OTP login → status timeline → interview slot
 * booking → admit card download. Self-contained; drop into Admission.tsx.
 *
 * Flow:
 *   1. Applicant enters phone number → request_admission_otp(phone)
 *   2. Receives 6-digit OTP (in production: SMS; in demo: shown in toast)
 *   3. Enters OTP → verify_admission_otp(phone, code) → returns admission + timeline
 *   4. Shows status timeline + interview slot booking + admit card download
 *   5. Logout clears session
 *
 * Auth state is persisted in sessionStorage so refresh doesn't lose login.
 */
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, Shield, ArrowRight, Loader2, CheckCircle2, AlertCircle,
  RefreshCw, LogOut, Calendar, FileText, ChevronRight,
} from "lucide-react";
import { supabasePublic as supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import toast from "react-hot-toast";
import ApplicationTracker from "./ApplicationTracker";
import InterviewSlotBooking from "./InterviewSlotBooking";
import AdmitCard from "./AdmitCard";

// ── Types ────────────────────────────────────────────────────────────────────
interface TimelineEntry {
  id: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  actor: string;
  created_at: string;
}

interface Admission {
  id: string;
  reference_no: string;
  full_name: string;
  father_name: string;
  contact_number: string;
  applying_class: string;
  admission_type: string;
  status: string;
  admin_note: string | null;
  created_at: string;
  date_of_birth: string | null;
  b_form_no: string;
  gender: string | null;
}

interface Session {
  admission: Admission;
  timeline: TimelineEntry[];
  phone: string;
}

const SESSION_KEY = "applicant_portal_session";
const STATUS_LABELS: Record<string, string> = {
  pending:              "Application Submitted",
  under_review:         "Under Review",
  documents_verified:   "Documents Verified",
  documents_missing:    "Documents Missing",
  interview_scheduled:  "Interview Scheduled",
  interview_completed:  "Interview Completed",
  waitlisted:           "Waitlisted",
  approved:             "Approved",
  admitted:             "Admitted",
  admit_card_issued:    "Admit Card Issued",
  rejected:             "Rejected",
};

export default function ApplicantPortal() {
  const [session, setSession] = useState<Session | null>(null);
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [nameHint, setNameHint] = useState<string | null>(null);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Restore session from sessionStorage on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) setSession(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  // Persist session
  useEffect(() => {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  }, [session]);

  const requestOtp = async () => {
    // Normalize the phone the same way the server does, so even if the
    // applicant typed "0301-1234567" we send "03011234567" to the RPC.
    const normalized = phone.replace(/[^0-9+]/g, "");
    if (normalized.length < 10) {
      toast.error("Please enter a valid phone number");
      return;
    }
    setLoading(true);
    setDemoCode(null);
    try {
      const { data, error } = await supabase.rpc("request_admission_otp", {
        p_contact_number: normalized,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to send OTP");

      // If RPC explicitly tells us no application matches, show a clear error
      // and stay on the phone screen.
      if (data?.phone_matches === false) {
        toast.error(data?.error || "No application found for this phone number. Please apply first.");
        return;
      }

      // Persist the normalized phone so verifyOtp uses the same form.
      setPhone(normalized);
      setNameHint(data?.name_hint || null);
      setDemoCode(data?.demo_code || null);
      setStep("otp");

      if (data?.demo_code) {
        toast(`Demo OTP: ${data.demo_code}`, { icon: "📱", duration: 8000 });
      } else {
        toast.success("OTP sent! Check your phone.");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) {
      toast.error("Enter the 6-digit code");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("verify_admission_otp", {
        p_contact_number: phone,
        p_otp_code: otp,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Verification failed");

      const newSession: Session = {
        admission: data.admission,
        timeline: data.timeline || [],
        phone,
      };
      setSession(newSession);
      setStep("phone");
      setOtp("");
      toast.success(`Welcome, ${data.admission.full_name}!`);
    } catch (e: any) {
      // Surface the most useful part of the error. Supabase RPC errors often
      // come back as `relation "public.x" does not exist` etc. — show the
      // message verbatim so the user / admin can act on it.
      const msg = e?.message || "Verification failed";
      toast.error(msg, { duration: 6000 });
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setSession(null);
    setPhone("");
    setOtp("");
    setStep("phone");
    setNameHint(null);
    toast.success("Signed out");
  };

  const refresh = useCallback(async () => {
    if (!session) return;

    // Guard: if the session is missing id or phone (can happen if the user
    // logged in with an older version of the code before the fix), force a
    // logout so they get a clean session on next login.
    if (!session.admission?.id || !session.phone) {
      toast.error("Session expired. Please sign in again.");
      setSession(null);
      setPhone("");
      setOtp("");
      setStep("phone");
      setNameHint(null);
      sessionStorage.removeItem(SESSION_KEY);
      return;
    }

    try {
      // Single RPC call that returns BOTH the admission record and its
      // timeline. The RPC also verifies the phone matches the admission
      // (security check on the server side).
      //
      // This replaces the old approach of calling track_admission (which
      // sometimes failed with "function not found without parameters" when
      // the PostgREST schema cache was stale or reference_no was undefined).
      const { data, error } = await supabase.rpc("get_applicant_admission", {
        p_admission_id: session.admission.id,
        p_phone:        session.phone,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to fetch update");

      setSession({
        ...session,
        admission: data.admission,
        timeline:  data.timeline || [],
      });
      toast.success("Updated");
    } catch (e: any) {
      toast.error("Refresh failed: " + (e?.message || "unknown error"));
    }
  }, [session]);

  // ── Logged-out state ───────────────────────────────────────────────────────
  if (!session) {
    return (
      <div className="max-w-md mx-auto">
        <div className="bg-card border border-border rounded-2xl shadow-lg p-6 space-y-4">
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Shield className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Applicant Portal</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Sign in with the phone number you used on your application to track your status, book an interview, and download your admit card.
            </p>
          </div>

          <AnimatePresence mode="wait">
            {step === "phone" ? (
              <motion.div
                key="phone"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-3"
              >
                <label className="text-xs font-semibold text-foreground">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && requestOtp()}
                    placeholder="03XX-XXXXXXX"
                    className="pl-10 text-sm h-11"
                  />
                </div>
                <Button onClick={requestOtp} disabled={loading} className="w-full h-11 gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  {loading ? "Sending…" : "Send OTP"}
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="otp"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-3"
              >
                <div className="bg-secondary/50 rounded-lg p-2.5 text-xs text-muted-foreground text-center">
                  Code sent to <span className="font-semibold text-foreground">{phone}</span>
                  {nameHint && <span> ({nameHint})</span>}
                </div>

                {/* Demo OTP banner — shown when SMS gateway is not yet wired up.
                    In production, remove this block once real SMS is sending codes. */}
                {demoCode && (
                  <div className="bg-blue-50 dark:bg-blue-950/30 border-2 border-blue-300 dark:border-blue-800 rounded-lg p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wide flex items-center gap-1">
                        📱 Demo Mode — Your OTP
                      </p>
                      <p className="text-2xl font-mono font-black text-blue-900 dark:text-blue-100 tracking-[0.3em] mt-0.5">
                        {demoCode}
                      </p>
                      <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5">
                        Tap the code to auto-fill • No real SMS sent yet
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOtp(demoCode)}
                      className="shrink-0 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                    >
                      Use Code
                    </button>
                  </div>
                )}

                <label className="text-xs font-semibold text-foreground">6-Digit Code</label>
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && verifyOtp()}
                  placeholder="••••••"
                  className="text-center text-2xl font-mono tracking-[0.5em] h-14"
                />
                <Button onClick={verifyOtp} disabled={loading} className="w-full h-11 gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {loading ? "Verifying…" : "Verify & Sign In"}
                </Button>
                <button
                  onClick={() => { setStep("phone"); setOtp(""); }}
                  className="w-full text-xs text-muted-foreground hover:text-foreground"
                >
                  ← Use a different phone number
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-2.5 text-[11px] text-amber-700 dark:text-amber-300">
            🔒 Your phone must match the number on your application. OTP expires in 10 minutes. Max 5 attempts.
          </div>
        </div>
      </div>
    );
  }

  // ── Logged-in state ────────────────────────────────────────────────────────
  const status = session.admission.status;
  const canBookInterview = ["documents_verified", "under_review", "interview_scheduled"].includes(status);
  const canDownloadAdmitCard = ["admitted", "admit_card_issued", "approved"].includes(status);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Header bar with applicant info + logout */}
      <div className="bg-gradient-to-br from-primary to-primary-dark rounded-2xl p-5 text-white shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-white/70 uppercase font-semibold tracking-wide">Applicant</p>
            <h2 className="text-lg font-bold truncate">{session.admission.full_name}</h2>
            <p className="text-xs text-white/80 mt-0.5">
              Ref: <span className="font-mono">{session.admission.reference_no}</span>
              {" · "}Class {session.admission.applying_class}
            </p>
          </div>
          <div className="flex gap-1 shrink-0">
            <button onClick={refresh} title="Refresh"
              className="w-9 h-9 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={logout} title="Sign out"
              className="w-9 h-9 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Current status pill */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[10px] uppercase font-bold text-white/60">Current Status</span>
          <span className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold">
            {STATUS_LABELS[status] || status}
          </span>
        </div>
      </div>

      {/* Status timeline */}
      <ApplicationTracker timeline={session.timeline} currentStatus={status} />

      {/* Interview slot booking */}
      {canBookInterview && (
        <InterviewSlotBooking
          admissionId={session.admission.id}
          currentBooking={session.timeline.find(t => t.to_status === "interview_scheduled")?.note || null}
          onBooked={refresh}
        />
      )}

      {/* Waitlisted notice */}
      {status === "waitlisted" && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-foreground text-sm">You're on the waitlist</p>
            <p className="text-xs text-muted-foreground mt-1">
              All interview slots for your class are currently full. We'll automatically promote you when a seat opens up — no action needed from you. You'll see the status change here and receive an SMS.
            </p>
          </div>
        </div>
      )}

      {/* Admit card */}
      {canDownloadAdmitCard && (
        <AdmitCard admission={session.admission} />
      )}

      {/* Rejected notice */}
      {status === "rejected" && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-foreground text-sm">Application not approved</p>
            <p className="text-xs text-muted-foreground mt-1">
              We're sorry, your application was not approved at this time. Please contact the school office for more information.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
