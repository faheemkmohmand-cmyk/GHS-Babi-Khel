import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Search, GraduationCap, FileCheck, Sparkles } from "lucide-react";
import { useAdmissionSettings } from "@/hooks/useAdmission";
import { format, parseISO } from "date-fns";

const AdmissionHero = () => {
  const { data } = useAdmissionSettings();
  const isOpen = !!data?.is_open;
  const session = data?.session_year || String(new Date().getFullYear() + 1);

  let lastDateTxt = "";
  try { if (data?.last_date) lastDateTxt = format(parseISO(data.last_date), "d MMMM yyyy"); } catch {}

  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.7 }}
      className="section-y cv-auto relative overflow-hidden"
    >
      <div className="container mx-auto px-4">
        <div className="relative gradient-hero rounded-3xl p-6 sm:p-10 md:p-16 overflow-hidden">
          {/* Decorative blobs */}
          <div className="absolute -top-24 -right-24 w-72 h-72 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-white/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative grid lg:grid-cols-5 gap-8 items-center">
            {/* Left content */}
            <div className="lg:col-span-3 text-primary-foreground">
              <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md border border-white/25 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider mb-5">
                <span className={`w-2 h-2 rounded-full ${isOpen ? "bg-green-400 animate-pulse" : "bg-white/60"}`} />
                {isOpen ? "Admissions Open" : "Admissions Currently Closed"}
              </div>

              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-extrabold leading-[1.1]">
                Apply for Admission
                <span className="block text-2xl sm:text-3xl lg:text-4xl mt-2 bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
                  Session {session}
                </span>
              </h2>

              <p className="mt-5 text-base sm:text-lg text-primary-foreground/85 max-w-xl leading-relaxed">
                We accept applications for <strong className="text-white">Class 6 to Class 10</strong> — including fresh admissions and migration cases (BISE Peshawar). Apply online in minutes and track your application anytime.
              </p>

              {lastDateTxt && (
                <p className="mt-3 text-sm font-semibold text-white bg-white/15 backdrop-blur-sm border border-white/25 rounded-lg px-3 py-1.5 inline-flex items-center gap-2">
                  <Sparkles className="w-4 h-4" /> Last date to apply: {lastDateTxt}
                </p>
              )}

              <div className="mt-7 flex flex-col sm:flex-row gap-3 sm:gap-4">
                <Link to="/admissions/apply" className="w-full sm:w-auto">
                  <motion.button
                    whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-primary font-bold px-7 py-3.5 rounded-xl shadow-2xl"
                  >
                    Apply Now <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </Link>
                <Link to="/admissions/track" className="w-full sm:w-auto">
                  <motion.button
                    whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white/10 backdrop-blur-md border border-white/30 text-white font-semibold px-7 py-3.5 rounded-xl hover:bg-white/20 transition-colors"
                  >
                    <Search className="w-4 h-4" /> Track My Application
                  </motion.button>
                </Link>
                <Link to="/admissions" className="w-full sm:w-auto">
                  <motion.button
                    whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-white/80 hover:text-white font-medium px-4 py-3.5"
                  >
                    Learn more
                  </motion.button>
                </Link>
              </div>
            </div>

            {/* Right info cards */}
            <div className="lg:col-span-2 grid grid-cols-2 gap-3 sm:gap-4">
              {[
                { icon: GraduationCap, label: "Classes", value: "6 – 10" },
                { icon: FileCheck,    label: "Process",  value: "Online" },
                { icon: Sparkles,     label: "Session",  value: session },
                { icon: Search,       label: "Track",    value: "Anytime" },
              ].map((c, i) => (
                <motion.div
                  key={c.label}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.15 + i * 0.08 }}
                  className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-4 sm:p-5 text-primary-foreground"
                >
                  <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center mb-2.5">
                    <c.icon className="w-5 h-5" />
                  </div>
                  <p className="text-[10px] uppercase tracking-wider font-semibold opacity-75">{c.label}</p>
                  <p className="text-lg sm:text-xl font-bold mt-0.5">{c.value}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
};

export default AdmissionHero;
