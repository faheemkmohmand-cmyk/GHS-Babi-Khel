import { useState } from "react";
import { motion } from "framer-motion";
import {
  MapPin, Phone, Mail, MessageCircle, Facebook,
  Send, CheckCircle2, Loader2, Clock, AlertTriangle, Shield,
} from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import PageBanner from "@/components/shared/PageBanner";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/* ── Contact Form with Security Enhancements ── */
interface FormState {
  name: string;
  email: string;
  subject: string;
  message: string;
}

interface ValidationErrors {
  name?: string;
  email?: string;
  message?: string;
}

const INIT: FormState = { name: "", email: "", subject: "", message: "" };

// SECURITY FIX: Input sanitization to prevent XSS
const sanitizeInput = (str: string): string => {
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") // Remove script tags
    .replace(/javascript:/gi, "") // Remove javascript protocol
    .replace(/on\w+\s*=/gi, "") // Remove event handlers
    .trim();
};

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Name validation - allow letters, spaces, hyphens, apostrophes
const NAME_REGEX = /^[a-zA-Z\s\-'\u0600-\u06FF]{2,100}$/;

const Contact = () => {
  const { data: settings } = useSchoolSettings();

  const displayEmail  = settings?.email  || "ghsbabikhel@gmail.com";
  const displayPhone  = settings?.phone?.trim().length > 5 ? settings.phone : null;
  const displayAddress = settings?.address || "Babi Khel, District Mohmand, KPK, Pakistan";

  const [form, setForm]       = useState<FormState>(INIT);
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState("");
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [submitCount, setSubmitCount] = useState(0);

  // SECURITY FIX: Rate limiting (client-side tracking)
  const MAX_SUBMIT_ATTEMPTS = 5;
  const RATE_LIMIT_WINDOW = 60000; // 1 minute

  const set = (key: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [key]: e.target.value }));
      // Clear field-specific error when user starts typing
      if (validationErrors[key as keyof ValidationErrors]) {
        setValidationErrors(prev => ({ ...prev, [key]: undefined }));
      }
    };

  // SECURITY FIX: Comprehensive form validation
  const validateForm = (): boolean => {
    const errors: ValidationErrors = {};
    
    // Name validation
    if (!form.name.trim()) {
      errors.name = "Name is required";
    } else if (!NAME_REGEX.test(form.name.trim())) {
      errors.name = "Please enter a valid name (letters only)";
    }

    // Email validation
    if (!form.email.trim()) {
      errors.email = "Email is required";
    } else if (!EMAIL_REGEX.test(form.email.trim())) {
      errors.email = "Please enter a valid email address";
    }

    // Message validation
    if (!form.message.trim()) {
      errors.message = "Message is required";
    } else if (form.message.trim().length < 10) {
      errors.message = "Message must be at least 10 characters";
    } else if (form.message.trim().length > 2000) {
      errors.message = "Message must be less than 2000 characters";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // SECURITY FIX: Check rate limiting
  const checkRateLimit = (): boolean => {
    const now = Date.now();
    const attempts = JSON.parse(localStorage.getItem('contact_submit_attempts') || '[]');
    const recentAttempts = attempts.filter((time: number) => now - time < RATE_LIMIT_WINDOW);
    
    if (recentAttempts.length >= MAX_SUBMIT_ATTEMPTS) {
      setError(`Too many attempts. Please try again in ${Math.ceil((RATE_LIMIT_WINDOW - (now - recentAttempts[0])) / 1000)} seconds.`);
      return false;
    }
    
    return true;
  };

  // SECURITY FIX: Record submission attempt
  const recordSubmissionAttempt = () => {
    const attempts = JSON.parse(localStorage.getItem('contact_submit_attempts') || '[]');
    attempts.push(Date.now());
    localStorage.setItem('contact_submit_attempts', JSON.stringify(attempts));
  };

  const handleSubmit = async () => {
    setError("");
    setSubmitCount(prev => prev + 1);

    // SECURITY FIX: Validate form first
    if (!validateForm()) {
      setError("Please fix the errors below before submitting.");
      return;
    }

    // SECURITY FIX: Check rate limiting
    if (!checkRateLimit()) {
      return;
    }

    // SECURITY FIX: Sanitize all inputs
    const sanitizedForm = {
      name: sanitizeInput(form.name),
      email: sanitizeInput(form.email),
      subject: sanitizeInput(form.subject),
      message: sanitizeInput(form.message)
    };

    setSending(true);

    try {
      // Let admin know someone messaged — fire-and-forget, never blocks sending.
      const { error: rpcError } = await supabase.rpc("notify_admin_contact", {
        p_name: sanitizedForm.name,
        p_email: sanitizedForm.email,
        p_subject: sanitizedForm.subject || null,
      });

      if (rpcError) {
        console.warn("[Contact] notify_admin_contact failed:", rpcError.message);
        // Don't block user for notification failure
      }

      // Build mailto link so the message arrives at the school's inbox
      const body = `Name: ${sanitizedForm.name}\nEmail: ${sanitizedForm.email}\n\n${sanitizedForm.message}`;
      const mailto = `mailto:${displayEmail}?subject=${encodeURIComponent(
        sanitizedForm.subject || "Contact from website"
      )}&body=${encodeURIComponent(body)}`;

      // Small delay for UX feel, then open mail client
      setTimeout(() => {
        window.open(mailto, "_blank");
        setSending(false);
        setSent(true);
        setForm(INIT);
        setValidationErrors({});
        
        // SECURITY FIX: Record successful attempt
        recordSubmissionAttempt();
      }, 800);
      
    } catch (err) {
      console.error("[Contact] Error:", err);
      setError("An unexpected error occurred. Please try again.");
      setSending(false);
    }
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

            {/* ── Contact Form with Security ── */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="lg:col-span-3 bg-card rounded-2xl shadow-card p-7"
            >
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-heading font-bold text-foreground">Send a Message</h2>
                <Shield className="w-5 h-5 text-green-600" title="Secure form with validation" />
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                Fill out the form below and we'll get back to you as soon as possible.
                All fields are validated for your security.
              </p>

              {/* Security notice */}
              <div className="mb-6 p-3 rounded-lg bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20">
                <div className="flex items-start gap-2">
                  <Shield className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-green-800 dark:text-green-400">
                    This form is protected with input validation, XSS protection, and rate limiting.
                  </p>
                </div>
              </div>

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
                    {/* Name Field - With Validation */}
                    <div className="space-y-1.5">
                      <Label htmlFor="contact-name">
                        Your Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="contact-name"
                        placeholder="Ahmad Khan"
                        value={form.name}
                        onChange={set("name")}
                        required
                        minLength={2}
                        maxLength={100}
                        autoComplete="name"
                        className={validationErrors.name ? 'border-destructive' : ''}
                        aria-invalid={!!validationErrors.name}
                        aria-describedby={validationErrors.name ? "name-error" : undefined}
                      />
                      {validationErrors.name && (
                        <p id="name-error" className="text-xs text-destructive flex items-center gap-1 mt-1">
                          <AlertTriangle className="w-3 h-3" />{validationErrors.name}
                        </p>
                      )}
                    </div>

                    {/* Email Field - With Validation */}
                    <div className="space-y-1.5">
                      <Label htmlFor="contact-email">
                        Email Address <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="contact-email"
                        type="email"
                        placeholder="you@example.com"
                        value={form.email}
                        onChange={set("email")}
                        required
                        maxLength={254}
                        autoComplete="email"
                        className={validationErrors.email ? 'border-destructive' : ''}
                        aria-invalid={!!validationErrors.email}
                        aria-describedby={validationErrors.email ? "email-error" : undefined}
                      />
                      {validationErrors.email && (
                        <p id="email-error" className="text-xs text-destructive flex items-center gap-1 mt-1">
                          <AlertTriangle className="w-3 h-3" />{validationErrors.email}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Subject Field - Optional but Sanitized */}
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-subject">Subject</Label>
                    <Input
                      id="contact-subject"
                      placeholder="e.g. Admission inquiry, Fee information…"
                      value={form.subject}
                      onChange={set("subject")}
                      maxLength={200}
                      autoComplete="off"
                    />
                  </div>

                  {/* Message Field - With Validation */}
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-message">
                      Message <span className="text-destructive">*</span>
                    </Label>
                    <textarea
                      id="contact-message"
                      rows={5}
                      placeholder="Write your message here… (minimum 10 characters)"
                      value={form.message}
                      onChange={set("message")}
                      required
                      minLength={10}
                      maxLength={2000}
                      className={`w-full rounded-xl border bg-background px-4 py-3 text-sm shadow-sm focus:ring-2 focus:ring-ring outline-none resize-none ${
                        validationErrors.message ? 'border-destructive' : 'border-input'
                      }`}
                      aria-invalid={!!validationErrors.message}
                      aria-describedby={validationErrors.message ? "message-error" : undefined}
                    />
                    {validationErrors.message && (
                      <p id="message-error" className="text-xs text-destructive flex items-center gap-1 mt-1">
                        <AlertTriangle className="w-3 h-3" />{validationErrors.message}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {form.message.length}/2000 characters
                    </p>
                  </div>

                  {/* General Error Message */}
                  {error && (
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
                      <p className="text-sm text-destructive flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />{error}
                      </p>
                    </div>
                  )}

                  <Button 
                    onClick={handleSubmit} 
                    disabled={sending} 
                    className="w-full sm:w-auto"
                    type="button"
                  >
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
