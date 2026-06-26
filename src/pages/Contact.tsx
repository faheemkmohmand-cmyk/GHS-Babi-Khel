import { useState } from "react";
import { motion } from "framer-motion";
import {
  MapPin, Phone, Mail, MessageCircle, Facebook,
  Send, CheckCircle2, Loader2, Clock,
} from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import PageBanner from "@/components/shared/PageBanner";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/* ── Simple static contact form (opens mailto, also pings admin notification) ── */
interface FormState {
  name: string;
  email: string;
  subject: string;
  message: string;
}

const INIT: FormState = { name: "", email: "", subject: "", message: "" };

const Contact = () => {
  const { data: settings } = useSchoolSettings();

  const displayEmail  = settings?.email  || "ghsbabikhel@edu.pk";
  const displayPhone  = settings?.phone?.trim().length > 5 ? settings.phone : null;
  const displayAddress = settings?.address || "Babi Khel, District Mohmand, KPK, Pakistan";

  const [form, setForm]       = useState<FormState>(INIT);
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState("");

  const set = (key: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = () => {
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setError("Please fill in your name, email, and message.");
      return;
    }
    setError("");
    setSending(true);

    // Let admin know someone messaged — fire-and-forget, never blocks sending.
    supabase
      .rpc("notify_admin_contact", {
        p_name: form.name.trim(),
        p_email: form.email.trim(),
        p_subject: form.subject.trim() || null,
      })
      .then(({ error: rpcError }) => {
        if (rpcError) console.warn("[Contact] notify_admin_contact failed:", rpcError.message);
      });

    // Build mailto link so the message arrives at the school's inbox
    const body = `Name: ${form.name}\nEmail: ${form.email}\n\n${form.message}`;
    const mailto = `mailto:${displayEmail}?subject=${encodeURIComponent(
      form.subject || "Contact from website"
    )}&body=${encodeURIComponent(body)}`;

    // Small delay for UX feel, then open mail client
    setTimeout(() => {
      window.open(mailto, "_blank");
      setSending(false);
      setSent(true);
      setForm(INIT);
    }, 800);
  };

  const contactCards = [
    {
      icon: MapPin,
      label: "Address",
      value: displayAddress,
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayAddress)}`,
      linkLabel: "View on map",
    },
    ...(displayPhone
      ? [{
          icon: Phone,
          label: "Phone",
          value: displayPhone,
          href: `tel:${displayPhone.replace(/\s/g, "")}`,
          linkLabel: "Call now",
        }]
      : []),
    {
      icon: Mail,
      label: "Email",
      value: displayEmail,
      href: `mailto:${displayEmail}`,
      linkLabel: "Send email",
    },
    {
      icon: Clock,
      label: "Office Hours",
      value: "Monday – Saturday, 8:00 AM – 2:00 PM",
      href: null,
      linkLabel: null,
    },
  ];

  return (
    <PageLayout>
      <PageBanner
        title="Contact Us"
        subtitle="We'd love to hear from you — reach out any time"
      />

      <section className="py-16">
        <div className="container mx-auto px-4 max-w-5xl">

          {/* Contact cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-14">
            {contactCards.map(({ icon: Icon, label, value, href, linkLabel }) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="bg-card rounded-2xl p-5 shadow-card flex flex-col gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
                    {label}
                  </p>
                  <p className="text-sm text-foreground leading-snug">{value}</p>
                  {href && linkLabel && (
                    <a
                      href={href}
                      target={href.startsWith("http") ? "_blank" : undefined}
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline mt-1 inline-block"
                    >
                      {linkLabel} →
                    </a>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Two-column: form + social */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">

            {/* ── Contact Form ── */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="lg:col-span-3 bg-card rounded-2xl shadow-card p-7"
            >
              <h2 className="text-xl font-heading font-bold text-foreground mb-1">
                Send a Message
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Fill out the form below and we'll get back to you as soon as possible.
              </p>

              {sent ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                  <CheckCircle2 className="w-12 h-12 text-green-500" />
                  <p className="font-semibold text-foreground">Message ready to send!</p>
                  <p className="text-sm text-muted-foreground">
                    Your mail client opened with the message pre-filled. If nothing opened,{" "}
                    <a href={`mailto:${displayEmail}`} className="text-primary hover:underline">
                      email us directly
                    </a>.
                  </p>
                  <Button variant="outline" onClick={() => setSent(false)} className="mt-2">
                    Send another
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="contact-name">Your Name *</Label>
                      <Input
                        id="contact-name"
                        placeholder="Ahmad Khan"
                        value={form.name}
                        onChange={set("name")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="contact-email">Email Address *</Label>
                      <Input
                        id="contact-email"
                        type="email"
                        placeholder="you@example.com"
                        value={form.email}
                        onChange={set("email")}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="contact-subject">Subject</Label>
                    <Input
                      id="contact-subject"
                      placeholder="e.g. Admission inquiry, Fee information…"
                      value={form.subject}
                      onChange={set("subject")}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="contact-message">Message *</Label>
                    <textarea
                      id="contact-message"
                      rows={5}
                      placeholder="Write your message here…"
                      value={form.message}
                      onChange={set("message")}
                      className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm shadow-sm focus:ring-2 focus:ring-ring outline-none resize-none"
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-destructive">{error}</p>
                  )}

                  <Button onClick={handleSubmit} disabled={sending} className="w-full sm:w-auto">
                    {sending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Preparing…</>
                    ) : (
                      <><Send className="w-4 h-4 mr-2" /> Send Message</>
                    )}
                  </Button>
                </div>
              )}
            </motion.div>

            {/* ── Social / Quick Contact ── */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="lg:col-span-2 space-y-5"
            >
              <div className="bg-card rounded-2xl shadow-card p-6">
                <h2 className="text-base font-heading font-bold text-foreground mb-4">
                  Connect With Us
                </h2>
                <div className="space-y-3">
                  <a
                    href="https://wa.me/923469898295"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 w-full rounded-xl bg-[#25D366]/10 hover:bg-[#25D366]/20 px-4 py-3 transition-colors"
                  >
                    <span className="w-9 h-9 rounded-lg bg-[#25D366] flex items-center justify-center shrink-0">
                      <MessageCircle className="w-4 h-4 text-white fill-white" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">WhatsApp</p>
                      <p className="text-xs text-muted-foreground">Quick reply, usually within hours</p>
                    </div>
                  </a>

                  <a
                    href="https://www.facebook.com/share/1EERTSk1W7/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 w-full rounded-xl bg-[#1877F2]/10 hover:bg-[#1877F2]/20 px-4 py-3 transition-colors"
                  >
                    <span className="w-9 h-9 rounded-lg bg-[#1877F2] flex items-center justify-center shrink-0">
                      <Facebook className="w-4 h-4 text-white" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">Facebook</p>
                      <p className="text-xs text-muted-foreground">Follow for news &amp; updates</p>
                    </div>
                  </a>

                  {displayPhone && (
                    <a
                      href={`tel:${displayPhone.replace(/\s/g, "")}`}
                      className="flex items-center gap-3 w-full rounded-xl bg-primary/10 hover:bg-primary/20 px-4 py-3 transition-colors"
                    >
                      <span className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shrink-0">
                        <Phone className="w-4 h-4 text-primary-foreground" />
                      </span>
                      <div>
                        <p className="text-sm font-medium text-foreground">Call Us</p>
                        <p className="text-xs text-muted-foreground">{displayPhone}</p>
                      </div>
                    </a>
                  )}
                </div>
              </div>

              <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  For admission enquiries, please visit the{" "}
                  <a href="/admission" className="text-primary font-medium hover:underline">
                    Admission page
                  </a>
                  . For results, visit the{" "}
                  <a href="/results" className="text-primary font-medium hover:underline">
                    Results page
                  </a>.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </PageLayout>
  );
};

export default Contact;
                        
