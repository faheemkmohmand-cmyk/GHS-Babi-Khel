import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GraduationCap, Upload, CheckCircle2, Search,
  ChevronRight, ChevronLeft, Loader2, AlertCircle, ArrowRight,
  User, BookOpen, School, Download, Shield, RefreshCw, XCircle,
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
import toast from "react-hot-toast";

type View = "home" | "apply" | "track" | "success";

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
  const [view, setView]           = useState<View>("home");
  const [step, setStep]           = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [referenceNo, setReferenceNo] = useState("");
  const [trackQuery, setTrackQuery]   = useState("");
  const [doTrack, setDoTrack]         = useState(false);

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

  const validateStep = () => {
    if (step === 1) {
      if (!form.full_name.trim())      return toast.error("Please enter student full name");
      if (!form.father_name.trim())    return toast.error("Please enter father name");
      if (!form.b_form_no.trim())      return toast.error("Please enter B-Form number");
      if (!form.contact_number.trim()) return toast.error("Please enter contact number");
      if (!form.gender)                return toast.error("Please select gender");
      return true;
    }
    if (step === 2) {
      if (!form.applying_class)  return toast.error("Please select class");
      if (!form.admission_type)  return toast.error("Please select admission type");
      return true;
    }
    if (step === 3) {
      if (!fileEntries.b_form || fileEntries.b_form.status !== "done")
        return toast.error("B-Form scan must be uploaded first");
      if (!fileEntries.photo || fileEntries.photo.status !== "done")
        return toast.error("Passport photo must be uploaded first");
      if (isMigration && (!fileEntries.migration_certificate || fileEntries.migration_certificate.status !== "done"))
        return toast.error("Migration certificate must be uploaded first");
      if (isMigration && isClass10 && (!fileEntries.signed_letter || fileEntries.signed_letter.status !== "done"))
        return toast.error("Signed letter must be uploaded first");
      // Check nothing still uploading
      const stillUploading = Object.values(fileEntries).some(e => e?.status === "uploading");
      if (stillUploading) return toast.error("Please wait — files are still uploading");
      return true;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;
    setSubmitting(true);

    try {
      const { supabase } = await import("@/lib/supabase");

      // DEBUG: each toast tells us exactly which step completes or hangs
      toast("Step 1: Inserting admission...", { duration: 60000 });
      const { error: insErr } = await supabase
        .from("admissions")
        .insert({
          reference_no:    "",
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
          year_of_passing: form.year_of_passage || null,
        });

      if (insErr) throw new Error(`STEP 1 FAILED: ${insErr.message}`);
      toast.success("Step 1 done ✓ — admission inserted");

      toast("Step 2: Getting reference number...", { duration: 60000 });
      const { data: trackRows, error: trackErr } = await supabase
        .rpc("track_admission", { p_query: form.b_form_no.trim() });

      if (trackErr) throw new Error(`STEP 2 FAILED: ${trackErr.message}`);
      const latest = (trackRows ?? [])[0];
      if (!latest) throw new Error("STEP 2: No row found — use B-Form to track.");
      toast.success("Step 2 done ✓ — got reference: " + latest.reference_no);

      const refNo = latest.reference_no;

      toast("Step 3: Saving documents...", { duration: 60000 });
      const docsPayload = Object.entries(fileEntries)
        .filter(([, e]) => e?.status === "done" && e.url)
        .map(([docType, e]) => ({
          doc_type:  docType,
          file_path: e!.url!,
          file_name: e!.file.name,
        }));

      if (docsPayload.length > 0) {
        const { error: docsErr } = await supabase.rpc("save_admission_docs", {
          p_b_form_no: form.b_form_no.trim(),
          p_docs:      JSON.stringify(docsPayload),
        });
        if (docsErr) toast.error("STEP 3 FAILED: " + docsErr.message);
        else toast.success("Step 3 done ✓ — documents saved");
      } else {
        toast("Step 3: No docs to save");
      }

      setReferenceNo(refNo);
      setView("success");
      toast.success("All done!");
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
              {settings?.is_open ? (
                <>
                  <div className="inline-flex items-center gap-2 bg-green-100 text-green-800 text-sm font-bold px-4 py-1.5 rounded-full mb-3">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    Admissions Open — Session {settings.session_year}
                  </div>
                  {settings.last_date && (
                    <p className="text-sm text-muted-foreground">
                      Last Date: <span className="font-semibold text-red-600">
                        {new Date(settings.last_date).toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" })}
                      </span>
                    </p>
                  )}
                  {settings.banner_message && (
                    <p className="text-sm text-muted-foreground mt-1">{settings.banner_message}</p>
                  )}
                </>
              ) : (
                <div className="inline-flex items-center gap-2 bg-red-100 text-red-700 text-sm font-bold px-4 py-1.5 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  Admissions Currently Closed
                </div>
              )}
            </motion.div>

            {settings?.is_open && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.1 } }}
                className="space-y-3 mb-6">
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
            )}

            <Button variant="outline" onClick={() => setView("track")}
              className="w-full gap-2 rounded-2xl py-5 text-sm font-semibold">
              <Search className="w-4 h-4" /> Track My Application
            </Button>

            <div className="mt-6 p-4 bg-card border border-border rounded-2xl">
              <p className="font-bold text-sm mb-3 flex items-center gap-2">
                <Download className="w-4 h-4 text-primary" /> Downloads
              </p>
              <div className="grid grid-cols-2 gap-2">
                {["Admission Prospectus", "Fee Structure", "Migration Letter Template", "Admission Rules"].map((d) => (
                  <button key={d}
                    className="text-left text-xs p-2.5 rounded-xl bg-muted hover:bg-primary/10 hover:text-primary font-medium transition-colors">
                    📄 {d}
                  </button>
                ))}
              </div>
            </div>
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
                            { id: "previous_school", label: "Previous School Name",    placeholder: "School name" },
                            { id: "previous_class",  label: "Previous Class",          placeholder: "e.g. Class 8" },
                            { id: "previous_marks",  label: "Previous Marks / Grade",  placeholder: "e.g. 450/600 or A" },
                            { id: "year_of_passing", label: "Year of Passing",         placeholder: "e.g. 2024" },
                          ].map(f => (
                            <div key={f.id}>
                              <Label className="text-xs font-semibold mb-1 block">{f.label}</Label>
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

      </div>
    </PageLayout>
  );
};

export default Admission;
