import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GraduationCap, Upload, CheckCircle2, Search,
  ChevronRight, ChevronLeft, Loader2, AlertCircle, ArrowRight,
  User, BookOpen, School, Download, Shield, RefreshCw, XCircle,
  FileText, FileDown, CalendarClock, Info,
} from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  useAdmissionSettings, useTrackAdmission,
  submitAdmission, uploadAdmissionDocument,
} from "@/hooks/useAdmission";
import { AdmissionType } from "@/hooks/useAdmission";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { supabasePublic } from "@/lib/supabase";
import toast from "react-hot-toast";
import ApplicantPortal from "@/components/admissions/ApplicantPortal";

type View = "home" | "apply" | "track" | "portal" | "success";

// Each uploaded file tracks its own state
type FileStatus = "idle" | "uploading" | "done" | "error";
interface FileEntry {
  file: File;
  status: FileStatus;
  url: string | null;   // Cloudinary URL once uploaded
  error: string | null;
}

const MIGRATION_STEPS = [
  "Student submits online application",
  "Write migration letter to current school principal",
  "Current principal signs the letter",
  "Bring signed letter to our school — principal signs it",
  "Current school applies migration on BISEP portal",
  "Our school approves the migration on BISEP",
  "BISEP generates bank challan — submit fee at bank",
  "Migration confirmed ✅",
];

const statusConfig: Record<string, { label: string; color: string }> = {
  pending:           { label: "Pending",           color: "bg-blue-100 text-blue-800" },
  under_review:      { label: "Under Review",      color: "bg-purple-100 text-purple-800" },
  approved:          { label: "Approved ✅",        color: "bg-green-100 text-green-800" },
  rejected:          { label: "Rejected",           color: "bg-red-100 text-red-800" },
  documents_missing: { label: "Documents Missing", color: "bg-orange-100 text-orange-800" },
};

// ── Downloadable documents configuration ────────────────────────────────────
// Each item has a key, title, description, icon, and the content for the
// auto-generated PDF (when admin hasn't uploaded a file to library_files).
const DOWNLOAD_ITEMS = [
  {
    key: "prospectus",
    title: "Admission Prospectus",
    icon: "📖",
    desc: "Complete guide to admissions, programs & requirements",
    pdfTitle: "Admission Prospectus",
    pdfSections: [
      {
        heading: "Welcome",
        body: `Welcome to our school's Admission Portal. We are committed to providing quality education and nurturing the future leaders of Pakistan. This prospectus contains all the information you need to apply for admission.`,
      },
      {
        heading: "Available Programs",
        body: `• Class 6–8: Fresh admission for middle school\n• Class 9: Fresh admission including BISE board registration\n• Class 9 Migration: Transfer from another school\n• Class 10 Migration: Full migration process via BISE Peshawar`,
      },
      {
        heading: "Eligibility Criteria",
        body: `• For Class 6–8: Student must have completed the previous class\n• For Class 9: Must have passed Class 8 with valid result card\n• For Migration: Must have valid School Leaving Certificate (SLC) from previous school\n• For Class 10 Migration: Must follow the 8-step BISEP migration process`,
      },
      {
        heading: "Required Documents",
        body: `• B-Form (NADRA) — Mandatory\n• Passport Size Photo — Mandatory\n• Previous Result Card / Marksheet\n• School Leaving Certificate (for migration)\n• Father's CNIC Copy\n• Migration Certificate (for migration cases)\n• Signed Letter from both principals (Class 10 migration)`,
      },
      {
        heading: "Admission Process",
        body: `1. Fill the online application form on our website\n2. Upload all required documents\n3. Receive a reference number for tracking\n4. Admin will review your documents\n5. Track your application status using B-Form or reference number\n6. You will be contacted on your provided contact number`,
      },
      {
        heading: "Important Notes",
        body: `• Keep your reference number safe after submission\n• Ensure all documents are clear and legible\n• Admission is subject to availability of seats\n• The school reserves the right to reject incomplete applications\n• All information provided must be accurate`,
      },
    ],
  },
  {
    key: "fee_structure",
    title: "Fee Structure",
    icon: "💰",
    desc: "Tuition fees, additional charges & payment details",
    pdfTitle: "Fee Structure",
    pdfSections: [
      {
        heading: "Fee Policy",
        body: `Government High Schools in KPK operate under the free education policy. There are no tuition fees for regular students. However, some nominal charges may apply for specific services and BISE registration.`,
      },
      {
        heading: "BISE Registration Fee (Class 9 & 10)",
        body: `• Class 9 Registration: As per BISE Peshawar notification\n• Class 10 Registration: As per BISE Peshawar notification\n• Migration Fee: As per BISE Peshawar challan\nNote: BISE fees are paid directly to the board via bank challan.`,
      },
      {
        heading: "Other Charges (if applicable)",
        body: `• Examination Fee: As per BISE schedule\n• Sports Fee: Nominal annual charge\n• Lab Fee: For science practicals (Class 9 & 10)\n• Transport Fee: Optional (if availing school transport)`,
      },
      {
        heading: "Payment Method",
        body: `• BISE fees: Submit via bank challan at designated banks\n• School fees (if any): Pay at school office during working hours\n• Fee concessions available for deserving students on case-by-case basis`,
      },
    ],
  },
  {
    key: "migration_template",
    title: "Migration Letter Template",
    icon: "📝",
    desc: "Pre-formatted template for migration application letters",
    pdfTitle: "Migration Letter Template",
    pdfSections: [
      {
        heading: "Instructions",
        body: `Use this template to write your migration letter. Fill in the blanks with your details, print it, and get it signed by both principals. This letter is required for Class 9 and Class 10 migration.`,
      },
      {
        heading: "Migration Letter",
        body: `From: ___________________\nFather/Guardian of: ___________________\nClass: ___________________\nB-Form No: ___________________\n\nTo,\nThe Principal,\n[Current School Name],\n[Current School Address]\n\nSubject: Request for Migration Certificate\n\nRespected Sir/Madam,\n\nWith due respect, I request you to kindly issue a migration certificate for my son/daughter ___________________ (B-Form No: ____________) who is currently studying in Class _____ at your school. He/She has been granted admission at [New School Name] and requires the migration certificate to complete the transfer process.\n\nI shall be grateful for your cooperation.\n\nDate: _______________\n\nSignature of Parent/Guardian: _______________\n\n--- Approved by Current Principal ---\nSignature & Stamp: _______________\nDate: _______________\n\n--- Approved by Receiving Principal ---\nSignature & Stamp: _______________\nDate: _______________`,
      },
    ],
  },
  {
    key: "rules",
    title: "Admission Rules",
    icon: "📋",
    desc: "Official admission policies, eligibility & procedures",
    pdfTitle: "Admission Rules & Regulations",
    pdfSections: [
      {
        heading: "General Rules",
        body: `1. Admission is open to all eligible students regardless of gender, religion, or ethnicity.\n2. Applications must be submitted online through the school portal.\n3. Incomplete applications will not be considered.\n4. All information provided must be accurate. False information will result in rejection.\n5. The school reserves the right to accept or reject any application.`,
      },
      {
        heading: "Age Requirement",
        body: `• Class 6: Minimum age 10 years\n• Class 7: Minimum age 11 years\n• Class 8: Minimum age 12 years\n• Class 9: Minimum age 13 years\n• Class 10: Minimum age 14 years\n(Age is calculated as of March 31 of the admission year)`,
      },
      {
        heading: "Migration Rules",
        body: `1. Migration is only allowed for Class 9 and Class 10 students.\n2. A valid School Leaving Certificate (SLC) from the previous school is mandatory.\n3. Migration must be processed through BISE Peshawar portal.\n4. Both the sending and receiving principals must sign the migration letter.\n5. Class 10 migration follows the full 8-step BISEP process.\n6. Bank challan must be submitted after BISEP approval.`,
      },
      {
        heading: "Document Requirements",
        body: `• B-Form (NADRA) is mandatory for all applicants.\n• Passport size photograph must be recent (within 6 months).\n• Result card from previous class must be from a recognized board/school.\n• Father's CNIC copy must be valid and legible.\n• Migration cases require SLC and migration certificate from previous school.`,
      },
      {
        heading: "Cancellation Policy",
        body: `• Admission can be cancelled if documents are found to be forged.\n• Admission can be cancelled if the student fails to attend classes within 15 days of confirmation.\n• Migration will be cancelled if BISEP procedures are not followed correctly.\n• Fee refunds (if applicable) follow the school's refund policy.`,
      },
    ],
  },
] as const;

function StepBar({ step }: { step: number }) {
  const steps = ["Student Info", "Academic Info", "Documents"];
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
            i + 1 === step ? "bg-primary text-white shadow-md" :
            i + 1 < step  ? "bg-green-500 text-white" :
            "bg-muted text-muted-foreground"
          }`}>
            {i + 1 < step ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span>{i + 1}</span>}
            <span className="hidden sm:inline">{s}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`h-0.5 w-6 rounded ${i + 1 < step ? "bg-green-400" : "bg-muted"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function TrackResult({ result }: { result: any }) {
  const cfg = statusConfig[result.status] ?? { label: result.status, color: "bg-gray-100 text-gray-800" };
  const isMigration = result.admission_type === "migration";
  const currentStep = result.migration_step ?? 0;
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <Card className="border-2 border-primary/20">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Reference Number</p>
              <p className="text-lg font-bold font-mono text-primary">{result.reference_no}</p>
            </div>
            <Badge className={`${cfg.color} text-xs font-bold px-3 py-1`}>{cfg.label}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs text-muted-foreground">Student Name</p><p className="font-semibold">{result.full_name}</p></div>
            <div><p className="text-xs text-muted-foreground">Class Applied</p><p className="font-semibold">Class {result.applying_class}</p></div>
            <div><p className="text-xs text-muted-foreground">Type</p><p className="font-semibold capitalize">{result.admission_type}</p></div>
            <div><p className="text-xs text-muted-foreground">Applied On</p><p className="font-semibold">{new Date(result.created_at).toLocaleDateString("en-PK")}</p></div>
          </div>
          {result.admin_note && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800">
              <p className="font-semibold mb-1">Message from Admin:</p>
              <p>{result.admin_note}</p>
            </div>
          )}
          {result.rejection_reason && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800">
              <p className="font-semibold mb-1">Rejection Reason:</p>
              <p>{result.rejection_reason}</p>
            </div>
          )}
        </CardContent>
      </Card>
      {isMigration && (
        <Card>
          <CardContent className="p-5">
            <p className="font-bold text-sm mb-4 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-primary" /> Migration Progress
            </p>
            <div className="space-y-2">
              {MIGRATION_STEPS.map((s, i) => {
                const done    = i + 1 < currentStep;
                const current = i + 1 === currentStep;
                return (
                  <div key={i} className={`flex items-start gap-3 p-2.5 rounded-lg text-sm transition-all ${
                    current ? "bg-primary/10 border border-primary/30" :
                    done    ? "opacity-60" : "opacity-40"
                  }`}>
                    <div className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5 ${
                      done    ? "bg-green-500 text-white" :
                      current ? "bg-primary text-white animate-pulse" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {done ? "✓" : i + 1}
                    </div>
                    <span className={current ? "font-semibold text-primary" : ""}>{s}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}

/* ══ MAIN PAGE ══════════════════════════════════════════════════════════════ */
const Admission = () => {
  const { data: settings } = useAdmissionSettings();
  const { data: school }   = useSchoolSettings();

  // ── SEO-FIRST ADMISSION STATUS ──────────────────────────────────────────────
  // Previously: if the admin toggled admissions "off" (or the last_date had
  // passed) the entire visible page flipped to a red "Admissions Currently
  // Closed" badge and the apply buttons disappeared. Because Googlebot fully
  // renders this SPA, that "closed" text became the snippet Google showed in
  // search results — pushing the school DOWN in rankings whenever someone
  // searched "GHS Babi Khel admission".
  //
  // Fix: the visible page ALWAYS presents "Admissions Open" as the headline
  // status (the page itself is the school's permanent admission landing
  // page — admissions info is always relevant). The actual `isEffectivelyOpen`
  // flag still gates live form submission: when admissions are technically
  // closed in the DB, the apply buttons route to a friendly "next session
  // opens on …" notice instead of blocking the page outright. This keeps the
  // SEO content rich and on-brand while preserving the admin's ability to
  // pause new submissions.
  const isEffectivelyOpen = (() => {
    if (!settings?.is_open) return false;
    if (!settings.last_date) return true;
    return new Date(settings.last_date) >= new Date(new Date().toDateString());
  })();

  // Always shown as "open" in the visible hero — Google indexes this text.
  // The session year falls back to the upcoming academic year if the admin
  // hasn't set one (or the previous session has closed).
  const displaySessionYear =
    settings?.session_year || String(new Date().getFullYear() + 1);

  // Friendly "next opening" date shown only when admissions are currently
  // paused — never as a "Closed" warning, just informational.
  const nextOpeningNote = (() => {
    if (isEffectivelyOpen) return null;
    if (settings?.open_date) {
      try {
        return `Next session opens ${new Date(settings.open_date).toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" })}.`;
      } catch { return null; }
    }
    return `Applications for Session ${displaySessionYear} open soon — prepare your documents now.`;
  })();
  const [view, setView]           = useState<View>("home");
  const [step, setStep]           = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [referenceNo, setReferenceNo] = useState("");
  const [trackQuery, setTrackQuery]   = useState("");
  const [doTrack, setDoTrack]         = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null); // key of item being downloaded

  // Temporary admission ID created before uploads begin
  const admissionIdRef = useRef<string | null>(null);

  const [form, setForm] = useState({
    full_name: "", father_name: "", date_of_birth: "", b_form_no: "",
    contact_number: "", whatsapp_number: "", home_address: "", gender: "",
    applying_class: "", admission_type: "fresh" as AdmissionType,
    previous_school: "", previous_class: "", previous_marks: "", year_of_passing: "",
  });

  // Files now hold full state per document
  const [fileEntries, setFileEntries] = useState<Record<string, FileEntry | null>>({
    b_form: null, result_card: null, slc: null,
    father_cnic: null, photo: null,
    migration_certificate: null, signed_letter: null,
  });

  const isMigration = form.admission_type === "migration";
  const isClass10   = form.applying_class === "10";

  // ── Math CAPTCHA — generated fresh each time step 3 is reached ──────────
  const [captchaQ, setCaptchaQ]       = useState<{ a: number; b: number }>({ a: 0, b: 0 });
  const [captchaInput, setCaptchaInput] = useState("");
  const [captchaError, setCaptchaError] = useState(false);

  const newCaptcha = useCallback(() => {
    setCaptchaQ({ a: Math.floor(Math.random() * 9) + 1, b: Math.floor(Math.random() * 9) + 1 });
    setCaptchaInput("");
    setCaptchaError(false);
  }, []);

  // Generate a fresh captcha whenever user reaches step 3
  useEffect(() => { if (step === 3) newCaptcha(); }, [step, newCaptcha]);
  const [libFiles, setLibFiles] = useState<Record<string, { url: string; id: string }>>({});

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabasePublic
          .from("library_files")
          .select("id, title, file_url")
          .ilike("category", "Admission");
        if (data?.length) {
          const map: Record<string, { url: string; id: string }> = {};
          for (const f of data) {
            const t = (f.title || "").toLowerCase();
            if (t.includes("prospectus")) map.prospectus = { url: f.file_url, id: f.id };
            else if (t.includes("fee")) map.fee_structure = { url: f.file_url, id: f.id };
            else if (t.includes("migration")) map.migration_template = { url: f.file_url, id: f.id };
            else if (t.includes("rule")) map.rules = { url: f.file_url, id: f.id };
          }
          setLibFiles(map);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  // ── Generate a professional PDF and trigger download ──────────────────────
  const generateAndDownload = useCallback(async (item: typeof DOWNLOAD_ITEMS[number]) => {
    setDownloading(item.key);
    try {
      // If admin has uploaded a file to library, download that instead
      const libFile = libFiles[item.key];
      if (libFile?.url) {
        // Try to download the file directly (for Cloudinary PDFs)
        try {
          const resp = await fetch(libFile.url);
          if (resp.ok) {
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${item.title}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success(`Downloaded ${item.title}`);
            // Increment download count
            try { await supabasePublic.rpc("increment_download_count", { file_id: libFile.id }); } catch {}
            return;
          }
        } catch { /* fallback to window.open */ }
        window.open(libFile.url, "_blank");
        toast.success(`Opening ${item.title}`);
        try { await supabasePublic.rpc("increment_download_count", { file_id: libFile.id }); } catch {}
        return;
      }

      // No admin-uploaded file — generate a professional PDF in the browser
      const schoolName = school?.school_name || "GHS Babi Khel";
      const tagline = school?.tagline || "Excellence in Education";
      const address = school?.address || "Babi Khel, District Mohmand, KPK, Pakistan";
      const date = new Date().toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" });

      // Build HTML content for the PDF
      const sectionsHtml = item.pdfSections.map(s => `
        <div style="margin-bottom:18px;">
          <h3 style="font-size:15px;font-weight:700;color:#1e3a5f;margin:0 0 8px 0;padding-bottom:4px;border-bottom:2px solid #e2e8f0;">${s.heading}</h3>
          <p style="font-size:12.5px;line-height:1.7;color:#334155;white-space:pre-wrap;margin:0;">${s.body}</p>
        </div>
      `).join("");

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${item.pdfTitle}</title>
        <style>
          @page { margin: 20mm 18mm; size: A4; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; line-height: 1.6; }
          .header { text-align: center; border-bottom: 3px solid #1e3a5f; padding-bottom: 14px; margin-bottom: 20px; }
          .school-name { font-size: 20px; font-weight: 800; color: #1e3a5f; letter-spacing: 0.5px; }
          .tagline { font-size: 11px; color: #64748b; margin-top: 2px; }
          .address { font-size: 10px; color: #94a3b8; margin-top: 2px; }
          .doc-title { font-size: 18px; font-weight: 700; color: #0f172a; text-align: center; margin: 6px 0 18px; padding: 8px; background: #f1f5f9; border-radius: 6px; }
          .footer { text-align: center; border-top: 2px solid #e2e8f0; padding-top: 10px; margin-top: 30px; font-size: 9px; color: #94a3b8; }
          .footer span { color: #64748b; }
        </style>
      </head><body>
        <div class="header">
          <div class="school-name">${schoolName}</div>
          <div class="tagline">${tagline}</div>
          <div class="address">${address}</div>
        </div>
        <div class="doc-title">${item.pdfTitle}</div>
        ${sectionsHtml}
        <div class="footer">
          <span>${schoolName}</span> &bull; Generated on ${date} &bull; ${window.location.origin}
        </div>
      </body></html>`;

      // Use print-to-PDF approach: open in a new window and trigger print
      const printWin = window.open("", "_blank");
      if (printWin) {
        printWin.document.write(html);
        printWin.document.close();
        // Wait for content to render, then trigger print
        printWin.onload = () => {
          setTimeout(() => {
            printWin.print();
          }, 300);
        };
        toast.success(`Generating ${item.title} — use Save as PDF in print dialog`);
      } else {
        // Popup blocked — create a downloadable HTML file instead
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${item.title}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(`Downloaded ${item.title}`);
      }
    } catch (err: any) {
      toast.error(`Failed to download: ${err?.message || "Please try again"}`);
    } finally {
      setDownloading(null);
    }
  }, [libFiles, school]);

  const trackEnabled = doTrack && trackQuery.length >= 5;
  const { data: trackResults, isFetching: trackLoading } = useTrackAdmission(
    trackEnabled ? trackQuery : ""
  );

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  // Called immediately when user picks a file — uploads right away
  const handleFilePick = async (docType: string, file: File) => {
    // Mark as uploading instantly
    setFileEntries(prev => ({
      ...prev,
      [docType]: { file, status: "uploading", url: null, error: null },
    }));

    // Upload DIRECTLY to Cloudinary — no Supabase call here.
    // Supabase record + document rows are created only when the user clicks Submit.
    // This prevents any hang caused by premature DB calls before the form is filled.
    try {
      // Use a stable temp session folder so all files for this session stay together.
      if (!admissionIdRef.current) {
        admissionIdRef.current = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      }
      const folder = `admissions/${admissionIdRef.current}`;

      const { uploadToCloudinary } = await import("@/lib/cloudinary");
      const url = await uploadToCloudinary(file, folder);

      setFileEntries(prev => ({
        ...prev,
        [docType]: { file, status: "done", url, error: null },
      }));
      toast.success(`${docType.replace(/_/g, " ")} uploaded ✓`);
    } catch (err: any) {
      setFileEntries(prev => ({
        ...prev,
        [docType]: { file, status: "error", url: null, error: err?.message ?? "Upload failed" },
      }));
      toast.error(`Failed to upload ${docType.replace(/_/g, " ")}. Tap to retry.`);
    }
  };

  const validateStep = (): boolean => {
    const fail = (msg: string) => { toast.error(msg); return false; };
    // Basic format guards
    const digitsOnly = (v: string) => v.replace(/\D/g, "");

    if (step === 1) {
      if (!form.full_name.trim() || form.full_name.trim().length < 3)
        return fail("Please enter student full name (min 3 letters)");
      if (!form.father_name.trim() || form.father_name.trim().length < 3)
        return fail("Please enter father name (min 3 letters)");
      if (!form.b_form_no.trim() || digitsOnly(form.b_form_no).length < 13)
        return fail("Please enter a valid 13-digit B-Form number");
      if (!form.contact_number.trim() || digitsOnly(form.contact_number).length < 10)
        return fail("Please enter a valid contact number");
      if (!form.gender) return fail("Please select gender");
      return true;
    }
    if (step === 2) {
      if (!form.applying_class)  return fail("Please select applying class");
      if (!form.admission_type)  return fail("Please select admission type");
      if (!form.previous_school.trim()) return fail("Please enter previous school name");
      if (!form.previous_class.trim())  return fail("Please enter previous class");
      if (!form.previous_marks.trim())  return fail("Please enter previous marks / grade");
      if (!form.year_of_passing.trim()) return fail("Please enter year of passing");
      return true;
    }
    if (step === 3) {
      if (!fileEntries.b_form || fileEntries.b_form.status !== "done")
        return fail("B-Form scan must be uploaded first");
      if (!fileEntries.photo || fileEntries.photo.status !== "done")
        return fail("Passport photo must be uploaded first");
      if (isMigration && (!fileEntries.migration_certificate || fileEntries.migration_certificate.status !== "done"))
        return fail("Migration certificate must be uploaded first");
      if (isMigration && isClass10 && (!fileEntries.signed_letter || fileEntries.signed_letter.status !== "done"))
        return fail("Signed letter must be uploaded first");
      const stillUploading = Object.values(fileEntries).some(e => e?.status === "uploading");
      if (stillUploading) return fail("Please wait — files are still uploading");
      return true;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;

    // ── Verify CAPTCHA before anything else ──────────────────────────────────
    if (parseInt(captchaInput, 10) !== captchaQ.a + captchaQ.b) {
      setCaptchaError(true);
      newCaptcha();
      toast.error("Incorrect answer. Please solve the math question.");
      return;
    }

    // ── Pause-gate (SEO-friendly) ───────────────────────────────────────────
    // The page always shows "Admissions Open" for SEO, but the admin can
    // still pause live submissions via admission_settings.is_open=false.
    // If paused, we surface a friendly toast and bail out — no DB write.
    if (!isEffectivelyOpen) {
      toast.error(
        nextOpeningNote || `Admissions for Session ${displaySessionYear} open soon. Please check back.`
      );
      return;
    }

    setSubmitting(true);

    // Helper: run any promise with a hard timeout so it never hangs forever
    function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${ms / 1000}s. Check your internet and try again.`)),
          ms
        );
        promise.then(
          (val) => { clearTimeout(timer); resolve(val); },
          (err) => { clearTimeout(timer); reject(err); }
        );
      });
    }

    try {
      // ── 1. INSERT admission + read back id and reference_no in one call ──
      const { data: inserted, error: insErr } = await withTimeout(
        Promise.resolve(
          supabasePublic.from("admissions").insert({
            full_name:       form.full_name.trim(),
            father_name:     form.father_name.trim(),
            date_of_birth:   form.date_of_birth || null,
            b_form_no:       form.b_form_no.trim(),
            contact_number:  form.contact_number.trim(),
            whatsapp_number: form.whatsapp_number.trim() || null,
            home_address:    form.home_address.trim() || null,
            gender:          form.gender || null,
            applying_class:  form.applying_class,
            admission_type:  form.admission_type,
            previous_school: form.previous_school.trim() || null,
            previous_class:  form.previous_class.trim() || null,
            previous_marks:  form.previous_marks.trim() || null,
            year_of_passing: form.year_of_passing.trim() || null,
          }).select("id, reference_no").single()
        ) as Promise<{ data: { id: string; reference_no: string } | null; error: any }>,
        15000,
        "Admission insert"
      );
      if (insErr) throw new Error(`Submission failed: ${insErr.message}`);
      const refNo = inserted?.reference_no ?? "";

      // ── 3. SAVE document links (save_admission_docs from admissions_patch.sql) ──
      const docsPayload = Object.entries(fileEntries)
        .filter(([, e]) => e?.status === "done" && e.url)
        .map(([docType, e]) => ({
          doc_type:  docType,
          file_path: e!.url!,
          file_name: e!.file.name,
        }));

      if (docsPayload.length > 0) {
        await withTimeout(
          Promise.resolve(
            supabasePublic.rpc("save_admission_docs", {
              p_b_form_no: form.b_form_no.trim(),
              p_docs:      JSON.stringify(docsPayload),
            })
          ) as Promise<any>,
          15000,
          "Document save"
        ).catch(() => {
          // Non-fatal — admission is saved, Cloudinary URLs are safe
        });
      }

      setReferenceNo(refNo);
      setView("success");
      toast.success("Application submitted successfully!");
    } catch (err: any) {
      toast.error(err?.message ?? "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

    const resetForm = () => {
    admissionIdRef.current = null;
    setStep(1);
    setForm({
      full_name: "", father_name: "", date_of_birth: "", b_form_no: "",
      contact_number: "", whatsapp_number: "", home_address: "", gender: "",
      applying_class: "", admission_type: "fresh",
      previous_school: "", previous_class: "", previous_marks: "", year_of_passing: "",
    });
    setFileEntries({
      b_form: null, result_card: null, slc: null,
      father_cnic: null, photo: null,
      migration_certificate: null, signed_letter: null,
    });
  };

  // File field — uploads immediately on selection
  const FileField = ({ id, label, required }: { id: string; label: string; required?: boolean }) => {
    const entry = fileEntries[id];
    const inputRef = useRef<HTMLInputElement>(null);

    const statusIcon = () => {
      if (!entry) return <Upload className="w-4 h-4 text-muted-foreground" />;
      if (entry.status === "uploading") return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      if (entry.status === "done")      return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      if (entry.status === "error")     return <XCircle className="w-4 h-4 text-red-500" />;
      return <Upload className="w-4 h-4 text-muted-foreground" />;
    };

    const borderColor = () => {
      if (!entry) return "border-muted-foreground/30 hover:border-primary/50";
      if (entry.status === "uploading") return "border-blue-400 bg-blue-50";
      if (entry.status === "done")      return "border-green-400 bg-green-50";
      if (entry.status === "error")     return "border-red-400 bg-red-50";
      return "border-muted-foreground/30";
    };

    const statusText = () => {
      if (!entry) return "Tap to upload";
      if (entry.status === "uploading") return "Uploading…";
      if (entry.status === "done")      return entry.file.name;
      if (entry.status === "error")     return "Failed — tap to retry";
      return entry.file.name;
    };

    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
        <div
          className={`border-2 border-dashed rounded-xl p-3 transition-colors cursor-pointer ${borderColor()}`}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleFilePick(id, file);
              e.target.value = ""; // reset so same file can be re-picked on retry
            }}
          />
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              entry?.status === "done"      ? "bg-green-100" :
              entry?.status === "uploading" ? "bg-blue-100"  :
              entry?.status === "error"     ? "bg-red-100"   : "bg-muted"
            }`}>
              {statusIcon()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{statusText()}</p>
              <p className="text-[10px] text-muted-foreground">
                {entry?.status === "uploading" ? "Please wait…" : "JPG, PNG or PDF"}
              </p>
            </div>
          </div>
        </div>
        {entry?.status === "error" && entry.error && (
          <p className="text-[10px] text-red-500 pl-1">{entry.error}</p>
        )}
      </div>
    );
  };

  return (
    <PageLayout>
      <div className="min-h-screen bg-gradient-to-br from-background via-primary/3 to-background pb-16">

        {/* ── HOME VIEW ── */}
        {view === "home" && (
          <div className="container mx-auto px-4 pt-8 max-w-2xl">
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
              className="text-center mb-10">
              <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4 shadow-lg">
                <GraduationCap className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
                Admission Portal
              </h1>
              {/* ── Always-On "Admissions Open" status badge ──
                  This badge is the primary on-page signal Google indexes for
                  "GHS Babi Khel admission". It is intentionally NEVER swapped
                  for a "closed" variant — when admissions are paused, we keep
                  the green badge and surface the next opening date as a
                  secondary informational note instead. */}
              <div className="inline-flex items-center gap-2 bg-green-100 text-green-800 text-sm font-bold px-4 py-1.5 rounded-full mb-3">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Admissions Open — Session {displaySessionYear}
              </div>
              {settings?.last_date && isEffectivelyOpen && (
                <p className="text-sm text-muted-foreground">
                  Last Date to Apply: <span className="font-semibold text-red-600">
                    {new Date(settings.last_date).toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" })}
                  </span>
                </p>
              )}
              {settings?.banner_message && isEffectivelyOpen && (
                <p className="text-sm text-muted-foreground mt-1">{settings.banner_message}</p>
              )}
              {/* Informational (NOT "closed") notice shown only when the live
                  form is currently paused. Keeps the page SEO-friendly. */}
              {nextOpeningNote && (
                <p className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5 text-primary" />
                  {nextOpeningNote}
                </p>
              )}
            </motion.div>

            {/* ── Apply category cards ──
                Always rendered (previously gated on isEffectivelyOpen).
                When admissions are paused in the DB, we still show the cards so
                prospective parents can read about each program — they just get
                a small "applications open <date>" hint on top. Clicking a card
                still opens the apply form; if the form is paused, the submit
                handler surfaces a friendly toast. This keeps the page rich for
                Google (the card titles "Class 6–8 Admission", "Class 9
                Admission", "Class 9 Migration", "Class 10 Migration" are all
                indexed as visible text) and useful for parents. */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.1 } }}
              className="space-y-3 mb-6">
              {!isEffectivelyOpen && nextOpeningNote && (
                <div className="flex items-start gap-2 text-xs text-primary bg-primary/5 border border-primary/20 rounded-xl p-2.5 mb-1">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{nextOpeningNote} You can preview the form below — submissions will be enabled on the opening date.</span>
                </div>
              )}
              {[
                { classes: "6, 7 & 8", title: "Class 6–8 Admission",  desc: "Fresh admission for middle school",     icon: BookOpen,  color: "from-blue-500 to-blue-700" },
                { classes: "9",        title: "Class 9 Admission",     desc: "Includes BISE board registration",      icon: School,    color: "from-primary to-primary-dark" },
                { classes: "9",        title: "Class 9 Migration",     desc: "Transferring from another school",      icon: RefreshCw, color: "from-purple-500 to-purple-700" },
                { classes: "10",       title: "Class 10 Migration",    desc: "Full migration process via BISEP",      icon: ArrowRight, color: "from-green-600 to-green-800" },
              ].map((cat, i) => (
                <motion.button key={i}
                  whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                  onClick={() => {
                    resetForm();
                    setForm(f => ({
                      ...f,
                      applying_class: cat.classes.includes(",") ? "" : cat.classes,
                      admission_type: cat.title.includes("Migration") ? "migration" : "fresh",
                    }));
                    setView("apply"); setStep(1);
                  }}
                  className="w-full flex items-center gap-4 p-4 bg-card border border-border rounded-2xl hover:border-primary/40 hover:shadow-md transition-all text-left">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${cat.color} flex items-center justify-center shrink-0`}>
                    <cat.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm">{cat.title}</p>
                    <p className="text-xs text-muted-foreground">{cat.desc}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </motion.button>
              ))}
            </motion.div>

            <Button variant="outline" onClick={() => setView("track")}
              className="w-full gap-2 rounded-2xl py-5 text-sm font-semibold">
              <Search className="w-4 h-4" /> Track My Application
            </Button>

            {/* Applicant Portal — phone OTP login + status timeline + interview booking + admit card */}
            <Button onClick={() => setView("portal")}
              className="w-full gap-2 rounded-2xl py-5 text-sm font-semibold mt-3 bg-gradient-to-r from-primary to-primary-dark">
              <Shield className="w-4 h-4" /> Applicant Portal
              <span className="ml-1 text-[10px] bg-white/25 px-1.5 py-0.5 rounded-full font-bold">NEW</span>
            </Button>

            <div className="mt-6 p-4 bg-card border border-border rounded-2xl">
              <p className="font-bold text-sm mb-3 flex items-center gap-2">
                <Download className="w-4 h-4 text-primary" /> Downloads
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                {DOWNLOAD_ITEMS.map((d) => {
                  const isDownloading = downloading === d.key;
                  const hasFile = !!libFiles[d.key];
                  return (
                    <button key={d.key}
                      onClick={() => !isDownloading && generateAndDownload(d)}
                      disabled={!!downloading}
                      className="text-left text-xs p-3 rounded-xl bg-muted hover:bg-primary/10 hover:text-primary font-medium transition-all group relative overflow-hidden disabled:opacity-60">
                      {/* Download progress overlay */}
                      {isDownloading && (
                        <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        </div>
                      )}
                      <div className="flex items-start gap-2">
                        <span className="text-base leading-none mt-0.5">{d.icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <span className="font-semibold truncate">{d.title}</span>
                            {hasFile ? (
                              <FileDown className="w-3 h-3 text-green-600 shrink-0" />
                            ) : (
                              <FileText className="w-3 h-3 text-blue-500 shrink-0" />
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight line-clamp-2">{d.desc}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 text-center">
                Tap to download • Admin-uploaded files are used when available
              </p>
            </div>

            {/* ── SEO content block ──────────────────────────────────────────
                Always rendered so Googlebot (which fully executes this SPA)
                sees rich, keyword-dense admission information regardless of
                the DB is_open flag. The text mirrors the prospectus PDF but
                is in the live HTML, which is what actually moves rankings.
                Visually styled as a quiet info card — doesn't compete with the
                apply CTA above. */}
            <section
              aria-label="Admission information"
              className="mt-8 p-5 bg-card border border-border rounded-2xl text-sm leading-relaxed text-muted-foreground space-y-3"
            >
              <h2 className="text-base font-bold text-foreground">
                Admission at Government High School Babi Khel
              </h2>
              <p>
                Government High School Babi Khel, located in Babi Khel, District
                Mohmand, Khyber Pakhtunkhwa, welcomes admissions for Class 6 to
                Class 10. Admissions are open every academic session for both
                fresh students and migration cases from other BISE-affiliated
                schools. The school follows the BISE Peshawar curriculum and
                provides free, quality education in line with the Government of
                KPK's education policy.
              </p>
              <div>
                <p className="font-semibold text-foreground mb-1">Programs offered:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Class 6, 7, 8 (Fresh):</strong> Middle school admission for new students.</li>
                  <li><strong>Class 9 (Fresh):</strong> Includes BISE Peshawar board registration for SSC Part-I.</li>
                  <li><strong>Class 9 (Migration):</strong> Transfer from another BISE-affiliated school mid-session.</li>
                  <li><strong>Class 10 (Migration):</strong> Full 8-step BISEP migration process — both principals sign, BISEP approves, challan paid, migration confirmed.</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-foreground mb-1">Required documents:</p>
                <p>
                  B-Form (NADRA) — mandatory; passport size photo — mandatory;
                  previous result card or marksheet; school leaving certificate
                  (for migration); father's CNIC copy; migration certificate
                  (migration cases); signed letter from both principals
                  (Class 10 migration).
                </p>
              </div>
              <div>
                <p className="font-semibold text-foreground mb-1">How to apply:</p>
                <p>
                  Fill the online admission application form above, upload all
                  required documents, and receive a reference number for
                  tracking. You can track your admission application status
                  online using your B-Form number or reference number. The
                  school contacts applicants on the provided WhatsApp /
                  contact number once documents are reviewed.
                </p>
              </div>
              <p className="text-xs">
                For queries, contact the school office during working hours or
                visit the Contact page for address, phone and email.
              </p>
            </section>
          </div>
        )}

        {/* ── APPLY VIEW ── */}
        {view === "apply" && (
          <div className="container mx-auto px-4 pt-6 max-w-lg">
            <button onClick={() => { setView("home"); resetForm(); }}
              className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6 hover:text-foreground">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>

            <StepBar step={step} />

            <AnimatePresence mode="wait">
              <motion.div key={step}
                initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }}>

                <Card className="border-border">
                  <CardContent className="p-5 space-y-4">

                    {/* Step 1 — Student Info */}
                    {step === 1 && (
                      <>
                        <h2 className="font-bold text-base flex items-center gap-2">
                          <User className="w-4 h-4 text-primary" /> Student Information
                        </h2>
                        <div className="space-y-3">
                          {[
                            { id: "full_name",       label: "Full Name",                  placeholder: "Student full name",  req: true },
                            { id: "father_name",     label: "Father Name",                placeholder: "Father full name",   req: true },
                            { id: "b_form_no",       label: "B-Form Number",              placeholder: "XXXXX-XXXXXXX-X",    req: true },
                            { id: "contact_number",  label: "Contact (WhatsApp)",         placeholder: "03XX-XXXXXXX",       req: true },
                            { id: "whatsapp_number", label: "WhatsApp (if different)",    placeholder: "03XX-XXXXXXX" },
                            { id: "home_address",    label: "Home Address",               placeholder: "Village / Mohalla" },
                          ].map(f => (
                            <div key={f.id}>
                              <Label className="text-xs font-semibold mb-1 block">
                                {f.label} {f.req && <span className="text-red-500">*</span>}
                              </Label>
                              <Input value={(form as any)[f.id]} onChange={set(f.id)}
                                placeholder={f.placeholder} className="text-sm h-10" />
                            </div>
                          ))}
                          <div>
                            <Label className="text-xs font-semibold mb-1 block">Date of Birth</Label>
                            <Input type="date" value={form.date_of_birth} onChange={set("date_of_birth")}
                              className="text-sm h-10" />
                          </div>
                          <div>
                            <Label className="text-xs font-semibold mb-1 block">
                              Gender <span className="text-red-500">*</span>
                            </Label>
                            <Select value={form.gender} onValueChange={v => setForm(f => ({ ...f, gender: v }))}>
                              <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Select gender" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="male">Male</SelectItem>
                                <SelectItem value="female">Female</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Step 2 — Academic Info */}
                    {step === 2 && (
                      <>
                        <h2 className="font-bold text-base flex items-center gap-2">
                          <BookOpen className="w-4 h-4 text-primary" /> Academic Information
                        </h2>
                        <div className="space-y-3">
                          <div>
                            <Label className="text-xs font-semibold mb-1 block">
                              Applying for Class <span className="text-red-500">*</span>
                            </Label>
                            <Select value={form.applying_class}
                              onValueChange={v => setForm(f => ({ ...f, applying_class: v }))}>
                              <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Select class" /></SelectTrigger>
                              <SelectContent>
                                {["6","7","8","9","10"].map(c => (
                                  <SelectItem key={c} value={c}>Class {c}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs font-semibold mb-1 block">
                              Admission Type <span className="text-red-500">*</span>
                            </Label>
                            <Select value={form.admission_type}
                              onValueChange={v => setForm(f => ({ ...f, admission_type: v as AdmissionType }))}>
                              <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="fresh">Fresh Admission</SelectItem>
                                <SelectItem value="migration">Migration / Transfer</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {form.applying_class === "9" && (
                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 flex gap-2">
                              <Shield className="w-4 h-4 shrink-0 mt-0.5" />
                              <span>Class 9 students will be registered with BISE Peshawar by the school after admission is confirmed.</span>
                            </div>
                          )}
                          {isMigration && isClass10 && (
                            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs text-primary flex gap-2">
                              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                              <span>Class 10 migration involves 8 steps including BISEP portal application. You can track each step after submission.</span>
                            </div>
                          )}
                          {[
                            { id: "previous_school", label: "Previous School Name",    placeholder: "School name",        req: true },
                            { id: "previous_class",  label: "Previous Class",          placeholder: "e.g. Class 8",       req: true },
                            { id: "previous_marks",  label: "Previous Marks / Grade",  placeholder: "e.g. 450/600 or A",  req: true },
                            { id: "year_of_passing", label: "Year of Passing",         placeholder: "e.g. 2024",          req: true },
                          ].map(f => (
                            <div key={f.id}>
                              <Label className="text-xs font-semibold mb-1 block">{f.label} {f.req && <span className="text-red-500">*</span>}</Label>
                              <Input value={(form as any)[f.id]} onChange={set(f.id)}
                                placeholder={f.placeholder} className="text-sm h-10" />
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Step 3 — Documents (upload immediately on pick) */}
                    {step === 3 && (
                      <>
                        <h2 className="font-bold text-base flex items-center gap-2">
                          <Upload className="w-4 h-4 text-primary" /> Upload Documents
                        </h2>
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 flex gap-2">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>Each file uploads immediately after you select it. Wait for ✓ green before submitting.</span>
                        </div>
                        <div className="space-y-3">
                          <FileField id="b_form"      label="B-Form (NADRA)"                        required />
                          <FileField id="photo"       label="Passport Size Photo"                   required />
                          <FileField id="result_card" label="Previous Result Card / Marksheet" />
                          <FileField id="slc"         label="School Leaving Certificate (SLC)" />
                          <FileField id="father_cnic" label="Father's CNIC Copy" />
                          {isMigration && (
                            <FileField id="migration_certificate" label="Migration Certificate" required />
                          )}
                          {isMigration && isClass10 && (
                            <FileField id="signed_letter" label="Signed Letter (both principals)" required />
                          )}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* ── CAPTCHA — shown on step 3 only ── */}
                {step === 3 && (
                  <div className={`border-2 rounded-xl p-4 mt-2 space-y-2 ${captchaError ? "border-red-400 bg-red-50" : "border-primary/30 bg-primary/5"}`}>
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Shield className="w-4 h-4 text-primary" />
                      Prove you are human
                    </div>
                    <p className="text-sm text-muted-foreground">
                      What is <span className="font-bold text-foreground">{captchaQ.a} + {captchaQ.b}</span>?
                    </p>
                    <div className="flex gap-2 items-center">
                      <Input
                        type="number"
                        inputMode="numeric"
                        value={captchaInput}
                        onChange={e => { setCaptchaInput(e.target.value); setCaptchaError(false); }}
                        placeholder="Your answer"
                        className={`h-10 w-32 text-center text-lg font-bold ${captchaError ? "border-red-400" : ""}`}
                      />
                      <button type="button" onClick={newCaptcha}
                        className="text-xs text-muted-foreground underline hover:text-primary">
                        New question
                      </button>
                    </div>
                    {captchaError && (
                      <p className="text-xs text-red-600 font-medium">Wrong answer — try again.</p>
                    )}
                  </div>
                )}

                {/* Navigation */}
                <div className="flex gap-3 mt-4">
                  {step > 1 && (
                    <Button variant="outline" onClick={() => setStep(s => s - 1)}
                      className="flex-1 gap-2 rounded-xl">
                      <ChevronLeft className="w-4 h-4" /> Previous
                    </Button>
                  )}
                  {step < 3 ? (
                    <Button onClick={() => { if (validateStep()) setStep(s => s + 1); }}
                      className="flex-1 gap-2 rounded-xl">
                      Next <ChevronRight className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button onClick={handleSubmit} disabled={submitting}
                      className="flex-1 gap-2 rounded-xl">
                      {submitting
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                        : "Submit Application"}
                    </Button>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        )}

        {/* ── SUCCESS VIEW ── */}
        {view === "success" && (
          <div className="container mx-auto px-4 pt-10 max-w-md text-center">
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-bold mb-2">Application Submitted!</h2>
              <p className="text-muted-foreground text-sm mb-6">
                Your application has been received. Keep your reference number safe.
              </p>
              <div className="bg-primary/10 border border-primary/30 rounded-2xl p-5 mb-6">
                <p className="text-xs text-muted-foreground mb-1">Your Reference Number</p>
                <p className="text-2xl font-bold font-mono text-primary">{referenceNo}</p>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4 text-left text-xs space-y-2 mb-6 text-muted-foreground">
                <p className="font-semibold text-foreground text-sm">Next Steps:</p>
                <p>1. Save your reference number</p>
                <p>2. Admin will review your documents</p>
                <p>3. Track status using your B-Form or reference number</p>
                <p>4. You will be contacted on your provided number</p>
              </div>
              <div className="flex flex-col gap-3">
                <Button onClick={() => { setView("track"); setTrackQuery(referenceNo); setDoTrack(true); }}
                  className="gap-2 rounded-xl">
                  <Search className="w-4 h-4" /> Track This Application
                </Button>
                <Button variant="outline"
                  onClick={() => { resetForm(); setView("home"); }}
                  className="gap-2 rounded-xl">
                  Submit Another Application
                </Button>
              </div>
            </motion.div>
          </div>
        )}

        {/* ── TRACK VIEW ── */}
        {view === "track" && (
          <div className="container mx-auto px-4 pt-6 max-w-lg">
            <button onClick={() => setView("home")}
              className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6 hover:text-foreground">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Search className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-xl font-bold">Track Application</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Enter your B-Form number or Reference Number
              </p>
            </div>
            <div className="flex gap-2 mb-6">
              <Input
                value={trackQuery}
                onChange={e => { setTrackQuery(e.target.value); setDoTrack(false); }}
                placeholder="B-Form No. or OHS-2026-XXXX"
                className="text-sm h-11"
                onKeyDown={e => e.key === "Enter" && setDoTrack(true)}
              />
              <Button onClick={() => setDoTrack(true)} disabled={trackQuery.length < 5}
                className="gap-1.5 rounded-xl px-4 h-11">
                {trackLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
            {trackLoading && (
              <div className="text-center py-10 text-muted-foreground text-sm">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                Searching…
              </div>
            )}
            {doTrack && !trackLoading && trackResults && trackResults.length === 0 && (
              <div className="text-center py-10">
                <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No application found for this query.</p>
                <p className="text-xs text-muted-foreground mt-1">Check your B-Form or reference number and try again.</p>
              </div>
            )}
            {trackResults && trackResults.length > 0 && (
              <div className="space-y-4">
                {trackResults.map((r: any, i: number) => (
                  <TrackResult key={i} result={r} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── APPLICANT PORTAL VIEW (phone OTP login + timeline + interview + admit card) ── */}
        {view === "portal" && (
          <div className="container mx-auto px-4 pt-6 pb-12">
            <button onClick={() => setView("home")}
              className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6 hover:text-foreground">
              <ChevronLeft className="w-4 h-4" /> Back to Admission Home
            </button>

            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-xl font-bold">Applicant Portal</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Sign in to see your status timeline, book an interview slot, and download your admit card — all in one place.
              </p>
            </div>

            <ApplicantPortal />
          </div>
        )}

      </div>
    </PageLayout>
  );
};

export default Admission;
