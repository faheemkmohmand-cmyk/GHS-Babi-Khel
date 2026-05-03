import { Link } from "react-router-dom";
import {
  ArrowRight, FileText, Download, GraduationCap, BookOpen,
  ClipboardCheck, FileSignature, AlertCircle, Search, CheckCircle2
} from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import PageBanner from "@/components/shared/PageBanner";
import { useAdmissionSettings, MIGRATION_STEPS } from "@/hooks/useAdmissions";
import { format, parseISO } from "date-fns";
import { motion } from "framer-motion";

const Resource = ({ title, desc, icon: Icon, action }: { title: string; desc: string; icon: any; action: React.ReactNode }) => (
  <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
    <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
      <Icon className="w-5 h-5" />
    </div>
    <div className="flex-1">
      <h3 className="font-heading font-bold text-foreground text-base">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{desc}</p>
    </div>
    {action}
  </div>
);

const TYPES = [
  {
    title: "Class 6 – 8 Admission",
    badge: "Fresh",
    desc: "Standard new-student admission for middle school. Submit basic documents and B-Form.",
    icon: BookOpen,
    type: "fresh",
    cls: "6",
  },
  {
    title: "Class 9 Admission",
    badge: "Fresh + Board",
    desc: "Includes BISE Peshawar board registration. The school files board registration on your behalf.",
    icon: GraduationCap,
    type: "fresh",
    cls: "9",
  },
  {
    title: "Class 10 Migration",
    badge: "Migration",
    desc: "Transferring from another school to ours for matric. Multi-step BISEP migration process — guided.",
    icon: FileSignature,
    type: "migration",
    cls: "10",
  },
  {
    title: "Class 9 Migration",
    badge: "Migration",
    desc: "Mid-board transfer from another school for Class 9. School handles BISEP transfer paperwork.",
    icon: ClipboardCheck,
    type: "migration",
    cls: "9",
  },
];

const AdmissionsIndex = () => {
  const { data } = useAdmissionSettings();
  let lastTxt = "";
  try { if (data?.last_date) lastTxt = format(parseISO(data.last_date), "d MMMM yyyy"); } catch {}

  return (
    <PageLayout>
      <PageBanner
        title="Admissions"
        subtitle={`Apply online for Session ${data?.session_year || ""} — Class 6 to 10`}
      />

      <section className="container mx-auto px-4 py-8 md:py-12">
        {/* Status banner */}
        <div className={`rounded-2xl border p-4 sm:p-5 mb-8 flex items-start gap-3 ${
          data?.is_open
            ? "bg-green-50 border-green-200 text-green-900 dark:bg-green-950/40 dark:border-green-900 dark:text-green-100"
            : "bg-orange-50 border-orange-200 text-orange-900 dark:bg-orange-950/40 dark:border-orange-900 dark:text-orange-100"
        }`}>
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="flex-1 text-sm">
            {data?.is_open ? (
              <>
                <strong>Admissions are currently OPEN</strong> for Session {data.session_year}.
                {lastTxt && <> Apply before <strong>{lastTxt}</strong>.</>}
              </>
            ) : (
              <><strong>Admissions are currently closed.</strong> Please check back later or contact the school office.</>
            )}
          </div>
          {data?.is_open && (
            <Link to="/admissions/apply" className="hidden sm:inline-flex items-center gap-1 text-sm font-bold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90">
              Apply <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>

        {/* Quick CTAs (mobile-friendly) */}
        <div className="grid grid-cols-2 gap-3 mb-10 sm:hidden">
          <Link to="/admissions/apply" className="bg-primary text-primary-foreground rounded-xl py-3 text-center font-bold text-sm">Apply Now</Link>
          <Link to="/admissions/track" className="bg-card border border-border text-foreground rounded-xl py-3 text-center font-bold text-sm">Track</Link>
        </div>

        {/* Admission types */}
        <h2 className="text-2xl sm:text-3xl font-heading font-bold text-foreground">Admission Types</h2>
        <p className="text-muted-foreground text-sm mt-1 mb-6">Choose the option that fits your situation.</p>

        <div className="grid sm:grid-cols-2 gap-4">
          {TYPES.map((t, i) => (
            <motion.div key={t.title}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ delay: i * 0.05 }}
              className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <t.icon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-heading font-bold text-foreground">{t.title}</h3>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary">{t.badge}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{t.desc}</p>
                  {t.cls === "9" && t.type === "fresh" && (
                    <div className="mt-3 text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg p-2">
                      <strong>Note:</strong> Board registration with BISE Peshawar will be filed by the school after admission.
                    </div>
                  )}
                  <Link
                    to={`/admissions/apply?class=${t.cls}&type=${t.type}`}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline mt-3"
                  >
                    Start application <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Migration steps overview */}
        <h2 className="text-2xl sm:text-3xl font-heading font-bold text-foreground mt-12">Class 10 Migration — Step by Step</h2>
        <p className="text-muted-foreground text-sm mt-1 mb-6">A real BISEP migration involves multiple steps. Track each one in your application.</p>

        <ol className="space-y-3">
          {MIGRATION_STEPS.map((s) => (
            <li key={s.n} className="flex items-start gap-3 bg-card border border-border rounded-xl p-3 sm:p-4">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center shrink-0">{s.n}</div>
              <div className="flex-1 text-sm font-medium text-foreground pt-1">{s.label}</div>
              <CheckCircle2 className="w-4 h-4 text-muted-foreground/40 mt-1.5 shrink-0" />
            </li>
          ))}
        </ol>

        {/* Resources */}
        <h2 className="text-2xl sm:text-3xl font-heading font-bold text-foreground mt-12">Downloadable Resources</h2>
        <p className="text-muted-foreground text-sm mt-1 mb-6">Forms and reference documents.</p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Resource title="Admission Prospectus" desc="School profile, programs, and policies." icon={FileText}
            action={<button disabled className="text-xs font-semibold text-muted-foreground bg-secondary rounded-lg px-3 py-2 cursor-not-allowed">Coming Soon</button>} />
          <Resource title="Fee Structure" desc="Tuition and admission fee details." icon={FileText}
            action={<button disabled className="text-xs font-semibold text-muted-foreground bg-secondary rounded-lg px-3 py-2 cursor-not-allowed">Coming Soon</button>} />
          <Resource title="Migration Letter" desc="Auto-generated template for Class 10 migration request." icon={FileSignature}
            action={
              <Link to="/admissions/apply?class=10&type=migration" className="text-xs font-semibold text-primary-foreground bg-primary rounded-lg px-3 py-2 inline-flex items-center gap-1.5 justify-center">
                <Download className="w-3.5 h-3.5" /> Generate
              </Link>
            } />
          <Resource title="Rules & Regulations" desc="Admission policies and conduct." icon={FileText}
            action={<button disabled className="text-xs font-semibold text-muted-foreground bg-secondary rounded-lg px-3 py-2 cursor-not-allowed">Coming Soon</button>} />
        </div>

        {/* Track CTA */}
        <div className="mt-12 bg-card border border-border rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Search className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-heading font-bold text-foreground">Already applied?</h3>
            <p className="text-sm text-muted-foreground">Track your application status using your B-Form or Reference Number.</p>
          </div>
          <Link to="/admissions/track" className="w-full sm:w-auto inline-flex justify-center items-center gap-2 bg-primary text-primary-foreground font-bold px-5 py-3 rounded-xl">
            Track Application <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </PageLayout>
  );
};

export default AdmissionsIndex;
