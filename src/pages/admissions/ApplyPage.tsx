import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import PageLayout from "@/components/layout/PageLayout";
import PageBanner from "@/components/shared/PageBanner";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft, ArrowRight, Check, Upload, AlertCircle, Loader2,
  FileText, Download, CheckCircle2, Copy, Sparkles
} from "lucide-react";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import jsPDF from "jspdf";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";

type AdmissionType = "fresh" | "migration";

interface FormData {
  // Step 1
  full_name: string;
  father_name: string;
  date_of_birth: string;
  b_form_no: string;
  contact_number: string;
  whatsapp_number: string;
  home_address: string;
  gender: "male" | "female" | "other" | "";
  // Step 2
  applying_class: string;
  admission_type: AdmissionType;
  previous_school: string;
  previous_class: string;
  previous_marks: string;
  year_of_passing: string;
}

interface DocsState {
  b_form: File | null;
  result_card: File | null;
  slc: File | null;
  father_cnic: File | null;
  photo: File | null;
  migration_cert: File | null;
  signed_letter: File | null;
}

const initialDocs: DocsState = {
  b_form: null, result_card: null, slc: null, father_cnic: null,
  photo: null, migration_cert: null, signed_letter: null,
};

const STEP_LABELS = ["Student Info", "Academic Info", "Documents"];

const Field = ({ label, required, children, error }: { label: string; required?: boolean; children: React.ReactNode; error?: string }) => (
  <label className="block">
    <span className="text-sm font-semibold text-foreground">
      {label}{required && <span className="text-red-600 ml-0.5">*</span>}
    </span>
    <div className="mt-1.5">{children}</div>
    {error && <span className="text-xs text-red-600 mt-1 inline-flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</span>}
  </label>
);

const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition";

const FileSlot = ({ label, required, file, onPick, hint }: {
  label: string; required?: boolean; file: File | null;
  onPick: (f: File | null) => void; hint?: string;
}) => {
  const id = "f-" + label.replace(/\s+/g, "-").toLowerCase();
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-3 sm:p-4 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${file ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-primary/10 text-primary"}`}>
        {file ? <CheckCircle2 className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground">{label}</span>
          {required && <span className="text-[10px] font-bold text-red-600">REQUIRED</span>}
        </div>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <input
            id={id} type="file"
            accept="image/*,application/pdf"
            onChange={(e) => onPick(e.target.files?.[0] || null)}
            className="sr-only"
          />
          <label htmlFor={id} className="cursor-pointer text-xs font-semibold bg-primary text-primary-foreground rounded-lg px-3 py-1.5 hover:opacity-90 transition">
            {file ? "Replace" : "Choose file"}
          </label>
          {file && (
            <>
              <span className="text-xs text-muted-foreground truncate max-w-[160px]">{file.name}</span>
              <button type="button" onClick={() => onPick(null)} className="text-xs text-red-600 font-semibold">Remove</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const ApplyPage = () => {
  const [params] = useSearchParams();
  const { data: settings } = useSchoolSettings();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ ref: string; b_form: string } | null>(null);

  const [form, setForm] = useState<FormData>({
    full_name: "", father_name: "", date_of_birth: "", b_form_no: "",
    contact_number: "", whatsapp_number: "", home_address: "", gender: "",
    applying_class: params.get("class") || "", admission_type: (params.get("type") as AdmissionType) || "fresh",
    previous_school: "", previous_class: "", previous_marks: "", year_of_passing: "",
  });
  const [docs, setDocs] = useState<DocsState>(initialDocs);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isMigration = form.admission_type === "migration";
  const isClass10Migration = isMigration && form.applying_class === "10";

  const set = <K extends keyof FormData>(k: K, v: FormData[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  // ── Validation ──
  const validateStep = (s: number): boolean => {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!form.full_name.trim()) e.full_name = "Required";
      if (!form.father_name.trim()) e.father_name = "Required";
      if (!form.date_of_birth) e.date_of_birth = "Required";
      if (!/^\d{5}-\d{7}-\d$/.test(form.b_form_no)) e.b_form_no = "Format: XXXXX-XXXXXXX-X";
      if (!/^03\d{2}-?\d{7}$/.test(form.contact_number.replace(/\s/g, ""))) e.contact_number = "Enter valid PK mobile (03XX-XXXXXXX)";
      if (!form.home_address.trim() || form.home_address.length < 5) e.home_address = "Please enter full address";
      if (!form.gender) e.gender = "Required";
    } else if (s === 1) {
      if (!form.applying_class) e.applying_class = "Required";
      if (!form.admission_type) e.admission_type = "Required";
      if (isMigration) {
        if (!form.previous_school.trim()) e.previous_school = "Required for migration";
        if (!form.previous_class.trim()) e.previous_class = "Required";
      }
    } else if (s === 2) {
      if (!docs.b_form) e.b_form = "Required";
      if (!docs.father_cnic) e.father_cnic = "Required";
      if (!docs.photo) e.photo = "Required";
      if (isMigration && !docs.migration_cert) e.migration_cert = "Required for migration";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => { if (validateStep(step)) setStep((s) => Math.min(s + 1, 2)); };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  // ── Submit ──
  const submit = async () => {
    if (!validateStep(2)) return;
    setSubmitting(true);
    const t = toast.loading("Submitting application…");
    try {
      const { data: ins, error } = await supabase
        .from("admissions")
        .insert({
          full_name: form.full_name.trim(),
          father_name: form.father_name.trim(),
          date_of_birth: form.date_of_birth || null,
          b_form_no: form.b_form_no.trim(),
          contact_number: form.contact_number.trim(),
          whatsapp_number: form.whatsapp_number.trim() || null,
          home_address: form.home_address.trim(),
          gender: form.gender,
          applying_class: form.applying_class,
          admission_type: form.admission_type,
          previous_school: form.previous_school.trim() || null,
          previous_class: form.previous_class.trim() || null,
          previous_marks: form.previous_marks.trim() || null,
          year_of_passing: form.year_of_passing.trim() || null,
          status: "pending",
          migration_step: isMigration ? 1 : null,
        })
        .select("id, reference_no, b_form_no")
        .single();

      if (error) throw error;
      const admissionId = (ins as any).id;

      // Upload documents
      const docEntries = Object.entries(docs).filter(([, f]) => !!f) as [string, File][];
      for (const [docType, file] of docEntries) {
        const ext = file.name.split(".").pop() || "bin";
        const path = `${admissionId}/${docType}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("admissions")
          .upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (upErr) throw upErr;
        await supabase.from("admission_documents").insert({
          admission_id: admissionId,
          doc_type: docType,
          file_path: path,
          file_name: file.name,
        });
      }

      toast.success("Application submitted!", { id: t });
      setConfirmation({ ref: (ins as any).reference_no, b_form: (ins as any).b_form_no });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Submission failed. Please try again.", { id: t });
    } finally {
      setSubmitting(false);
    }
  };

  // Migration letter PDF (also used as inline help on step 2)
  const downloadMigrationLetter = () => {
    const doc = new jsPDF();
    const school = settings?.school_name || "GHS Babi Khel";
    const today = new Date().toLocaleDateString("en-GB");
    doc.setFontSize(12);
    let y = 20;
    doc.text(today, 170, y); y += 18;
    doc.text("To,", 20, y); y += 7;
    doc.text("The Principal,", 20, y); y += 7;
    doc.text(`${form.previous_school || "[Current School Name]"}`, 20, y); y += 14;
    doc.setFont(undefined, "bold");
    doc.text(`Subject: Request for School Leaving Certificate / Migration`, 20, y);
    doc.setFont(undefined, "normal"); y += 14;
    const body = [
      `Respected Sir/Madam,`,
      ``,
      `I, ${form.full_name || "[Student Name]"} S/D/o ${form.father_name || "[Father Name]"},`,
      `B-Form No. ${form.b_form_no || "[B-Form]"}, am a student of Class ${form.previous_class || "[Class]"}`,
      `at your esteemed institution. I respectfully request migration to ${school}`,
      `for Class ${form.applying_class || "[New Class]"} for the academic session.`,
      ``,
      `Kindly issue the School Leaving Certificate and process the migration on the BISEP`,
      `online portal at your earliest convenience.`,
      ``,
      `I shall remain grateful for your kind cooperation.`,
      ``,
      `Yours sincerely,`,
      ``,
      `${form.full_name || "[Student Name]"}`,
      `Contact: ${form.contact_number || "[Contact]"}`,
    ];
    body.forEach((line) => { doc.text(line, 20, y); y += 7; });
    doc.save(`migration-letter-${(form.full_name || "student").replace(/\s+/g, "_")}.pdf`);
  };

  const downloadConfirmation = () => {
    if (!confirmation) return;
    const doc = new jsPDF();
    const school = settings?.school_name || "GHS Babi Khel";
    doc.setFontSize(16); doc.setFont(undefined, "bold");
    doc.text(school, 105, 20, { align: "center" });
    doc.setFontSize(11); doc.setFont(undefined, "normal");
    doc.text("Admission Application — Confirmation Slip", 105, 28, { align: "center" });
    doc.line(20, 32, 190, 32);

    let y = 42;
    const row = (k: string, v: string) => { doc.setFont(undefined, "bold"); doc.text(`${k}:`, 22, y); doc.setFont(undefined, "normal"); doc.text(v, 75, y); y += 8; };
    row("Reference No.", confirmation.ref);
    row("Applicant", form.full_name);
    row("Father", form.father_name);
    row("B-Form", form.b_form_no);
    row("Class", form.applying_class);
    row("Type", form.admission_type === "migration" ? "Migration" : "Fresh");
    row("Contact", form.contact_number);
    row("Submitted", new Date().toLocaleString("en-GB"));

    y += 6;
    doc.setFont(undefined, "bold"); doc.text("Status: Pending Review", 22, y); y += 10;
    doc.setFont(undefined, "normal");
    doc.setFontSize(10);
    const notes = [
      "Next steps:",
      "1. Keep this Reference Number safe.",
      "2. Track your application at: /admissions/track",
      "3. The admissions office will contact you for next steps.",
    ];
    notes.forEach((n) => { doc.text(n, 22, y); y += 6; });
    doc.save(`admission-${confirmation.ref}.pdf`);
  };

  // ── CONFIRMATION SCREEN ──
  if (confirmation) {
    return (
      <PageLayout>
        <PageBanner title="Application Submitted" subtitle="Save your reference number for future tracking." />
        <section className="container mx-auto px-4 py-10 max-w-2xl">
          <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-sm text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/15 text-green-600 dark:text-green-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <h2 className="text-2xl font-heading font-bold text-foreground mt-4">Submitted Successfully!</h2>
            <p className="text-sm text-muted-foreground mt-1">Your application is now pending review.</p>

            <div className="mt-6 bg-secondary rounded-xl p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Reference Number</p>
              <div className="flex items-center gap-2 justify-center mt-1">
                <p className="text-2xl font-extrabold tracking-wider text-primary">{confirmation.ref}</p>
                <button
                  onClick={() => { navigator.clipboard.writeText(confirmation.ref); toast.success("Copied!"); }}
                  className="p-1.5 rounded-md hover:bg-background"
                  aria-label="Copy reference"
                >
                  <Copy className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            <div className="mt-6 grid sm:grid-cols-2 gap-3">
              <button onClick={downloadConfirmation} className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold rounded-xl py-3">
                <Download className="w-4 h-4" /> Download Slip
              </button>
              <Link to="/admissions/track" className="w-full inline-flex items-center justify-center gap-2 bg-card border border-border text-foreground font-bold rounded-xl py-3">
                Track Application
              </Link>
            </div>

            <ul className="text-left text-sm text-muted-foreground mt-6 space-y-2 bg-muted/40 rounded-xl p-4">
              <li><strong className="text-foreground">1.</strong> Keep your reference number safe.</li>
              <li><strong className="text-foreground">2.</strong> The school office will contact you on your given number.</li>
              <li><strong className="text-foreground">3.</strong> {isMigration ? "Follow the migration steps shown on your tracking page." : "Wait for review confirmation, usually within 3–5 working days."}</li>
            </ul>
          </div>
        </section>
      </PageLayout>
    );
  }

  // ── FORM ──
  return (
    <PageLayout>
      <PageBanner title="Apply for Admission" subtitle={`Step ${step + 1} of 3 — ${STEP_LABELS[step]}`} />

      <section className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Progress */}
        <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 mb-6">
          <div className="flex items-center justify-between">
            {STEP_LABELS.map((lbl, i) => (
              <div key={lbl} className="flex-1 flex items-center">
                <div className={`flex flex-col items-center flex-1 ${i <= step ? "text-primary" : "text-muted-foreground"}`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm border-2 ${
                    i < step ? "bg-primary text-primary-foreground border-primary"
                    : i === step ? "bg-primary/10 text-primary border-primary"
                    : "bg-background border-border"
                  }`}>
                    {i < step ? <Check className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className="text-[10px] sm:text-xs font-semibold mt-1.5 text-center">{lbl}</span>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div className={`h-0.5 flex-1 mx-1 ${i < step ? "bg-primary" : "bg-border"}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
            className="bg-card border border-border rounded-2xl p-5 sm:p-6 shadow-sm space-y-4"
          >
            {step === 0 && (
              <>
                <h3 className="font-heading font-bold text-lg text-foreground">Student Information</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Full Name" required error={errors.full_name}>
                    <input className={inputCls} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Ahmed Ali Khan" />
                  </Field>
                  <Field label="Father's Name" required error={errors.father_name}>
                    <input className={inputCls} value={form.father_name} onChange={(e) => set("father_name", e.target.value)} placeholder="Muhammad Ali Khan" />
                  </Field>
                  <Field label="Date of Birth" required error={errors.date_of_birth}>
                    <input type="date" className={inputCls} value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} max={new Date().toISOString().split("T")[0]} />
                  </Field>
                  <Field label="B-Form Number (NADRA)" required error={errors.b_form_no}>
                    <input className={inputCls} value={form.b_form_no} onChange={(e) => set("b_form_no", e.target.value)} placeholder="XXXXX-XXXXXXX-X" />
                  </Field>
                  <Field label="Contact Number" required error={errors.contact_number}>
                    <input className={inputCls} value={form.contact_number} onChange={(e) => set("contact_number", e.target.value)} placeholder="03XX-XXXXXXX" />
                  </Field>
                  <Field label="WhatsApp Number">
                    <input className={inputCls} value={form.whatsapp_number} onChange={(e) => set("whatsapp_number", e.target.value)} placeholder="03XX-XXXXXXX (preferred)" />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Home Address" required error={errors.home_address}>
                      <textarea rows={2} className={inputCls} value={form.home_address} onChange={(e) => set("home_address", e.target.value)} placeholder="Village, UC, Tehsil, District" />
                    </Field>
                  </div>
                  <Field label="Gender" required error={errors.gender}>
                    <select className={inputCls} value={form.gender} onChange={(e) => set("gender", e.target.value as any)}>
                      <option value="">Select…</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </Field>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <h3 className="font-heading font-bold text-lg text-foreground">Academic Information</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Applying for Class" required error={errors.applying_class}>
                    <select className={inputCls} value={form.applying_class} onChange={(e) => set("applying_class", e.target.value)}>
                      <option value="">Select class…</option>
                      {["6","7","8","9","10"].map((c) => <option key={c} value={c}>Class {c}</option>)}
                    </select>
                  </Field>
                  <Field label="Admission Type" required error={errors.admission_type}>
                    <select className={inputCls} value={form.admission_type} onChange={(e) => set("admission_type", e.target.value as AdmissionType)}>
                      <option value="fresh">Fresh Admission</option>
                      <option value="migration">Migration</option>
                    </select>
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Previous School Name" required={isMigration} error={errors.previous_school}>
                      <input className={inputCls} value={form.previous_school} onChange={(e) => set("previous_school", e.target.value)} placeholder="GMS Example Khel" />
                    </Field>
                  </div>
                  <Field label="Previous Class" required={isMigration} error={errors.previous_class}>
                    <input className={inputCls} value={form.previous_class} onChange={(e) => set("previous_class", e.target.value)} placeholder="e.g. 8" />
                  </Field>
                  <Field label="Previous Marks / Grade">
                    <input className={inputCls} value={form.previous_marks} onChange={(e) => set("previous_marks", e.target.value)} placeholder="e.g. 480/550 or A" />
                  </Field>
                  <Field label="Year of Passing">
                    <input className={inputCls} value={form.year_of_passing} onChange={(e) => set("year_of_passing", e.target.value)} placeholder="e.g. 2025" />
                  </Field>
                </div>

                {form.applying_class === "9" && form.admission_type === "fresh" && (
                  <div className="text-sm text-blue-800 dark:text-blue-200 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg p-3 mt-2 flex gap-2">
                    <Sparkles className="w-4 h-4 mt-0.5 shrink-0" />
                    <span><strong>Note:</strong> Board registration with BISE Peshawar will be filed by the school for Class 9 students.</span>
                  </div>
                )}

                {isClass10Migration && (
                  <div className="text-sm text-orange-900 dark:text-orange-100 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900 rounded-lg p-3 mt-2">
                    <strong>Class 10 Migration:</strong> This is a multi-step BISEP process. After submitting, you’ll need to write a letter to your current school principal — you can download an auto-filled template on the next step.
                  </div>
                )}
              </>
            )}

            {step === 2 && (
              <>
                <h3 className="font-heading font-bold text-lg text-foreground">Document Upload</h3>
                <p className="text-sm text-muted-foreground">Upload clear scans or photos. Accepted: JPG, PNG, PDF.</p>

                <div className="grid sm:grid-cols-2 gap-3 mt-2">
                  <FileSlot label="B-Form Scan" required hint="NADRA child registration" file={docs.b_form} onPick={(f) => setDocs((d) => ({ ...d, b_form: f }))} />
                  <FileSlot label="Father's CNIC" required file={docs.father_cnic} onPick={(f) => setDocs((d) => ({ ...d, father_cnic: f }))} />
                  <FileSlot label="Passport-size Photo" required file={docs.photo} onPick={(f) => setDocs((d) => ({ ...d, photo: f }))} />
                  <FileSlot label="Previous Result Card" hint="Recommended" file={docs.result_card} onPick={(f) => setDocs((d) => ({ ...d, result_card: f }))} />
                  <FileSlot label="School Leaving Certificate (SLC)" hint="If available" file={docs.slc} onPick={(f) => setDocs((d) => ({ ...d, slc: f }))} />

                  {isMigration && (
                    <FileSlot label="Migration Certificate" required hint="From previous school" file={docs.migration_cert} onPick={(f) => setDocs((d) => ({ ...d, migration_cert: f }))} />
                  )}
                  {isClass10Migration && (
                    <FileSlot label="Signed Letter Scan" hint="Letter signed by previous principal (can upload later)" file={docs.signed_letter} onPick={(f) => setDocs((d) => ({ ...d, signed_letter: f }))} />
                  )}
                </div>

                {errors.b_form && <p className="text-xs text-red-600">{errors.b_form}</p>}
                {errors.father_cnic && <p className="text-xs text-red-600">{errors.father_cnic}</p>}
                {errors.photo && <p className="text-xs text-red-600">{errors.photo}</p>}
                {errors.migration_cert && <p className="text-xs text-red-600">{errors.migration_cert}</p>}

                {isClass10Migration && (
                  <div className="mt-4 bg-secondary rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <FileText className="w-6 h-6 text-primary shrink-0" />
                    <div className="flex-1 text-sm">
                      <p className="font-semibold text-foreground">Migration request letter template</p>
                      <p className="text-muted-foreground text-xs">Auto-filled with your details. Print, get signed, then upload above.</p>
                    </div>
                    <button type="button" onClick={downloadMigrationLetter} className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-bold bg-primary text-primary-foreground rounded-lg px-3 py-2">
                      <Download className="w-3.5 h-3.5" /> Download
                    </button>
                  </div>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Nav buttons */}
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={back}
            disabled={step === 0 || submitting}
            className="inline-flex items-center gap-1.5 bg-card border border-border text-foreground font-semibold px-4 py-3 rounded-xl disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex-1" />
          {step < 2 ? (
            <button onClick={next} className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground font-bold px-5 py-3 rounded-xl">
              Next <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={submit} disabled={submitting} className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground font-bold px-6 py-3 rounded-xl disabled:opacity-60">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {submitting ? "Submitting…" : "Submit Application"}
            </button>
          )}
        </div>
      </section>
    </PageLayout>
  );
};

export default ApplyPage;
