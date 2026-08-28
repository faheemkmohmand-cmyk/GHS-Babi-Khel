import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Search, HelpCircle, Phone, Mail, ArrowRight, CircleCheck,
  CircleAlert, GraduationCap, BookOpen, ExternalLink,
} from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import PageBanner from "@/components/shared/PageBanner";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { useAdmissionSettings } from "@/hooks/useAdmission";
// ✅ SINGLE SOURCE OF TRUTH: the exact same dataset the AI endpoints
// (/api/ai-data, /api/render) and the crawler pages serve. Whatever is in
// api/_faq.mjs appears here, in the machine-readable feed and in the
// FAQPage schema — they can never drift apart.
import { FAQ_ITEMS, FAQ_CATEGORIES } from "../../api/_faq.mjs";

const CategoryIcon = () => <HelpCircle className="w-5 h-5 text-primary" />;

const FAQ = () => {
  const [query, setQuery] = useState("");
  const { data: settings } = useSchoolSettings();
  const { data: admissionSettings } = useAdmissionSettings();

  const admissionOpen = admissionSettings?.is_open;

  // Filter across the whole dataset (question + answer + category).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQ_ITEMS;
    return FAQ_ITEMS.filter((item) =>
      `${item.question} ${item.answer} ${item.category}`.toLowerCase().includes(q)
    );
  }, [query]);

  const grouped = useMemo(() => {
    return FAQ_CATEGORIES.map((category) => ({
      category,
      items: filtered.filter((item) => item.category === category),
    })).filter((group) => group.items.length > 0);
  }, [filtered]);

  return (
    <PageLayout>
      <PageBanner
        title="Frequently Asked Questions"
        subtitle="Everything about admissions, results, notes and our school — clear answers in one place"
      />

      {/* ── Live admission status strip (updates automatically from the
             school dashboard — same source the AI tools read) ── */}
      {admissionSettings && (
        <div className="container mx-auto px-4 -mt-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className={`max-w-3xl mx-auto rounded-2xl shadow-card border px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 ${
              admissionOpen
                ? "bg-emerald-50 border-emerald-200"
                : "bg-amber-50 border-amber-200"
            }`}
          >
            <div className="flex items-center gap-3 flex-1">
              {admissionOpen ? (
                <CircleCheck className="w-6 h-6 text-emerald-600 shrink-0" />
              ) : (
                <CircleAlert className="w-6 h-6 text-amber-600 shrink-0" />
              )}
              <div>
                <p className="font-semibold text-foreground leading-snug">
                  {admissionOpen
                    ? `Admissions are open${admissionSettings.session_year ? ` — Session ${admissionSettings.session_year}` : ""}`
                    : "The online admission form is paused right now"}
                </p>
                <p className="text-sm text-muted-foreground leading-snug">
                  {admissionOpen
                    ? "Apply online for classes 6–10 — free of charge, reference number issued instantly."
                    : "You can still download the printable form from the Admission page and submit it at the school office."}
                </p>
              </div>
            </div>
            <Link
              to="/admission"
              className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              {admissionOpen ? "Apply Now" : "Admission Page"}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        </div>
      )}

      {/* ── Search ── */}
      <section className="py-10">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search questions — e.g. documents, roll number, migration…"
              aria-label="Search frequently asked questions"
              className="w-full rounded-2xl border border-border bg-card pl-12 pr-4 py-3.5 text-sm shadow-card outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
            />
          </div>
          {query.trim() && (
            <p className="text-center text-sm text-muted-foreground mt-3">
              {grouped.reduce((n, g) => n + g.items.length, 0)} of {FAQ_ITEMS.length}{" "}
              questions match “{query.trim()}”
            </p>
          )}
        </div>
      </section>

      {/* ── Q&A sections ── */}
      <section className="pb-16">
        <div className="container mx-auto px-4">
          {grouped.length === 0 ? (
            <div className="max-w-xl mx-auto text-center py-12">
              <HelpCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-foreground font-semibold mb-1">No matching question</p>
              <p className="text-sm text-muted-foreground mb-5">
                Try a different word — or just call us, we're happy to help.
              </p>
              <Link
                to="/contact"
                className="inline-flex items-center gap-1.5 text-primary font-semibold hover:underline"
              >
                Go to Contact <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-10">
              {grouped.map(({ category, items }, groupIndex) => (
                <motion.div
                  key={category}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.35, delay: groupIndex * 0.03 }}
                >
                  <div className="flex items-center gap-2.5 mb-4">
                    <CategoryIcon />
                    <h2 className="text-xl md:text-2xl font-heading font-bold text-foreground">
                      {category}
                    </h2>
                    <span className="text-xs font-semibold text-muted-foreground bg-muted rounded-full px-2.5 py-1">
                      {items.length}
                    </span>
                  </div>
                  <Accordion type="single" collapsible className="space-y-3">
                    {items.map((item) => (
                      <AccordionItem
                        key={item.id}
                        value={item.id}
                        className="bg-card rounded-2xl border border-border shadow-card px-5 last:border-b"
                      >
                        <AccordionTrigger className="text-left font-semibold text-sm md:text-base hover:no-underline py-4">
                          {item.question}
                        </AccordionTrigger>
                        <AccordionContent className="text-sm md:text-[15px] leading-relaxed text-muted-foreground pb-5">
                          {item.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Still need help? ── */}
      <section className="pb-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto grid sm:grid-cols-3 gap-4">
            <Link
              to="/contact"
              className="group bg-card rounded-2xl border border-border shadow-card p-5 hover:shadow-elevated transition-shadow"
            >
              <Phone className="w-6 h-6 text-primary mb-3" />
              <p className="font-semibold text-foreground text-sm mb-1">Call or message us</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {settings?.phone || "+92 346 9898295"} · contact form & WhatsApp on the Contact page
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-primary text-xs font-semibold group-hover:gap-2 transition-all">
                Contact <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
            <Link
              to="/admission"
              className="group bg-card rounded-2xl border border-border shadow-card p-5 hover:shadow-elevated transition-shadow"
            >
              <GraduationCap className="w-6 h-6 text-primary mb-3" />
              <p className="font-semibold text-foreground text-sm mb-1">Admissions</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Online form, documents, tracking — classes 6 to 10, free of cost
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-primary text-xs font-semibold group-hover:gap-2 transition-all">
                Apply / Track <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
            <Link
              to="/notes"
              className="group bg-card rounded-2xl border border-border shadow-card p-5 hover:shadow-elevated transition-shadow"
            >
              <BookOpen className="w-6 h-6 text-primary mb-3" />
              <p className="font-semibold text-foreground text-sm mb-1">Study material</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Free notes in 9 subjects, past papers and downloadable library files
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-primary text-xs font-semibold group-hover:gap-2 transition-all">
                Open Notes <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-8 flex items-center justify-center gap-1.5 flex-wrap">
            <ExternalLink className="w-3.5 h-3.5" />
            AI assistants: the complete, always-fresh FAQ is also available as JSON at
            <a href="/api/ai-data" className="text-primary font-semibold hover:underline">
              /api/ai-data
            </a>
          </p>
        </div>
      </section>
    </PageLayout>
  );
};

export default FAQ;
