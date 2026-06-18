import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  GraduationCap, MapPin, Phone, Mail,
  ExternalLink, Facebook, MessageCircle,
} from "lucide-react";
import { useSchoolSettings, safeMediaUrl } from "@/hooks/useSchoolSettings";

const footerLinks = {
  quickLinks: [
    { to: "/about",   label: "About Us" },
    { to: "/teachers",label: "Our Teachers" },
    { to: "/notices", label: "Notices" },
    { to: "/news",    label: "Latest News" },
    { to: "/results", label: "Results" },
    { to: "/search",  label: "Search" },
  ],
  classes: [
    { to: "/results?class=6",  label: "Class 6" },
    { to: "/results?class=7",  label: "Class 7" },
    { to: "/results?class=8",  label: "Class 8" },
    { to: "/results?class=9",  label: "Class 9" },
    { to: "/results?class=10", label: "Class 10" },
  ],
  resources: [
    { to: "/library",       label: "Digital Library" },
    { to: "/gallery",       label: "Photo Gallery" },
    { to: "/results",       label: "Exam Results" },
    { to: "/result-card",   label: "Result Card" },
    { to: "/notes",         label: "Study Notes" },
    { to: "/online-classes",label: "Online Classes" },
  ],
};

const Footer = () => {
  const { data: settings } = useSchoolSettings();
  const [logoFailed, setLogoFailed] = useState(false);

  // Reset logo failed state when URL changes
  useEffect(() => { setLogoFailed(false); }, [settings?.logo_url]);

  const displayEmail = settings?.email || "ghsbabikhel@gmail.com";

  const displayPhone = settings?.phone && settings.phone.trim().length > 5
    ? settings.phone
    : null;

  return (
    <footer className="bg-primary text-white border-t border-white/10">
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-6">

          {/* ── Brand column ── */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5 mb-4">
              {settings?.logo_url && !logoFailed ? (
                <img
                  src={safeMediaUrl(settings.logo_url)!}
                  alt={`${settings?.school_name || "GHS Babi Khel"} logo`}
                  className="w-10 h-10 rounded-xl object-cover"
                  onError={() => setLogoFailed(true)}
                />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                  <GraduationCap className="w-6 h-6" />
                </div>
              )}
              <div>
                <span className="font-heading font-bold text-lg block">
                  {settings?.school_name || "GHS Babi Khel"}
                </span>
                <span className="text-sm text-white/70">
                  {settings?.tagline || "Excellence in Education"}
                </span>
              </div>
            </div>

            <p className="text-sm text-white/70 leading-relaxed max-w-xs mb-6">
              {settings?.description ||
                "Government High School Babi Khel is committed to providing quality education and nurturing the future leaders of Pakistan."}
            </p>

            {/* Contact info */}
            <div className="space-y-2.5 text-sm">
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-primary-light" />
                <span className="text-white/75">
                  {settings?.address || "Babi Khel, District Mohmand, KPK"}
                </span>
              </div>

              {displayPhone && (
                <div className="flex items-center gap-2.5">
                  <Phone className="w-4 h-4 shrink-0 text-primary-light" />
                  <a
                    href={`tel:${displayPhone.replace(/\s/g, "")}`}
                    className="text-white/75 hover:text-white transition-colors"
                  >
                    {displayPhone}
                  </a>
                </div>
              )}

              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 shrink-0 text-primary-light" />
                <a
                  href={`mailto:${displayEmail}`}
                  className="text-white/75 hover:text-white transition-colors"
                >
                  {displayEmail}
                </a>
              </div>
            </div>

            {/* Social media */}
            <div className="flex items-center gap-3 mt-5">
              <a
                href="https://www.facebook.com/share/1EERTSk1W7/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Follow GHS Babi Khel on Facebook"
                className="w-9 h-9 rounded-lg bg-[#1877F2] flex items-center justify-center hover:opacity-90 hover:scale-105 transition-all duration-200 shadow-sm"
              >
                <Facebook className="w-4 h-4 text-white" />
              </a>
              <a
                href="https://wa.me/923469898295"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Contact GHS Babi Khel on WhatsApp"
                className="w-9 h-9 rounded-lg bg-[#25D366] flex items-center justify-center hover:opacity-90 hover:scale-105 transition-all duration-200 shadow-sm"
              >
                <MessageCircle className="w-4 h-4 text-white fill-white" />
              </a>
              <span className="text-xs text-white/50 ml-1">Follow &amp; Contact Us</span>
            </div>
          </div>

          {/* ── Quick Links ── */}
          <div>
            <h4 className="font-heading font-semibold text-sm uppercase tracking-wider mb-4 text-white/90">
              Quick Links
            </h4>
            <ul className="space-y-2.5">
              {footerLinks.quickLinks.map((link) => (
                <li key={link.to + link.label}>
                  <Link
                    to={link.to}
                    className="text-sm text-white/70 hover:text-white transition-colors flex items-center gap-1 group"
                  >
                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Classes ── */}
          <div>
            <h4 className="font-heading font-semibold text-sm uppercase tracking-wider mb-4 text-white/90">
              Classes
            </h4>
            <ul className="space-y-2.5">
              {footerLinks.classes.map((c) => (
                <li key={c.to}>
                  <Link
                    to={c.to}
                    className="text-sm text-white/70 hover:text-white transition-colors flex items-center gap-1 group"
                  >
                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    {c.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Resources ── */}
          <div>
            <h4 className="font-heading font-semibold text-sm uppercase tracking-wider mb-4 text-white/90">
              Resources
            </h4>
            <ul className="space-y-2.5">
              {footerLinks.resources.map((link, i) => (
                <li key={i}>
                  <Link
                    to={link.to}
                    className="text-sm text-white/70 hover:text-white transition-colors flex items-center gap-1 group"
                  >
                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── Bottom bar ── */}
        <div className="border-t border-white/10 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-white/50">
            &copy; {new Date().getFullYear()}{" "}
            {settings?.school_name || "GHS Babi Khel"}. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <a
              href="https://www.facebook.com/share/1EERTSk1W7/"
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-white/50 hover:text-[#1877F2] transition-colors"
            >
              <Facebook className="w-3.5 h-3.5" /> Facebook
            </a>
            <a
              href="https://wa.me/923469898295"
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-white/50 hover:text-[#25D366] transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </a>
            <p className="text-sm text-white/40">
              EMIS: {settings?.emis_code || "60673"}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
