import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  GraduationCap, MapPin, Phone, Mail,
  Facebook, MessageCircle,
} from "lucide-react";
import { useSchoolSettings, safeMediaUrl } from "@/hooks/useSchoolSettings";

const footerLinks = {
  quickLinks: [
    { to: "/about",   label: "About Us" },
    { to: "/teachers",label: "Our Teachers" },
    { to: "/notices", label: "Notices" },
    { to: "/news",    label: "Latest News" },
    { to: "/faq",     label: "FAQs" },
  ],
  resources: [
    { to: "/results",       label: "Results" },
    { to: "/library",       label: "Digital Library" },
    { to: "/notes",         label: "Study Notes" },
    { to: "/gallery",       label: "Photo Gallery" },
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
    // FIXED: footer was oversized (py-16, 5 columns, duplicated social icons
    // in two places). Tightened padding, dropped the redundant Classes column
    // and the second social row in the bottom bar, kept everything essential.
    <footer className="bg-primary text-white border-t border-white/10">
      <div className="container mx-auto px-4 py-8 md:py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-6 md:gap-8">

          {/* ── Brand column ── */}
          <div className="col-span-2 md:col-span-2">
            <div className="flex items-center gap-2.5 mb-3">
              {settings?.logo_url && !logoFailed ? (
                <img
                  src={safeMediaUrl(settings.logo_url)!}
                  alt={`${settings?.school_name || "GHS Babi Khel"} logo`}
                  className="w-9 h-9 rounded-lg object-cover"
                  onError={() => setLogoFailed(true)}
                />
              ) : (
                <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center">
                  <GraduationCap className="w-5 h-5" />
                </div>
              )}
              <div>
                <span className="font-heading font-bold text-base block">
                  {settings?.school_name || "GHS Babi Khel"}
                </span>
                <span className="text-xs text-white/70">
                  {settings?.tagline || "Excellence in Education"}
                </span>
              </div>
            </div>

            <p className="text-sm text-white/70 leading-relaxed max-w-xs mb-4">
              {settings?.description ||
                "Government High School Babi Khel is committed to providing quality education and nurturing the future leaders of Pakistan."}
            </p>

            {/* Contact info */}
            <div className="space-y-2 text-sm">
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
            <div className="flex items-center gap-3 mt-4">
              <a
                href="https://www.facebook.com/share/1EERTSk1W7/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Follow GHS Babi Khel on Facebook"
                className="w-8 h-8 rounded-lg bg-[#1877F2] flex items-center justify-center hover:opacity-90 hover:scale-105 transition-all duration-200 shadow-sm"
              >
                <Facebook className="w-4 h-4 text-white" />
              </a>
              <a
                href="https://wa.me/923469898295"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Contact GHS Babi Khel on WhatsApp"
                className="w-8 h-8 rounded-lg bg-[#25D366] flex items-center justify-center hover:opacity-90 hover:scale-105 transition-all duration-200 shadow-sm"
              >
                <MessageCircle className="w-4 h-4 text-white fill-white" />
              </a>
            </div>
          </div>

          {/* ── Quick Links ── */}
          <div>
            <h4 className="font-heading font-semibold text-sm uppercase tracking-wider mb-3 text-white/90">
              Quick Links
            </h4>
            <ul className="space-y-2">
              {footerLinks.quickLinks.map((link) => (
                <li key={link.to + link.label}>
                  <Link
                    to={link.to}
                    className="text-sm text-white/70 hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Resources ── */}
          <div>
            <h4 className="font-heading font-semibold text-sm uppercase tracking-wider mb-3 text-white/90">
              Resources
            </h4>
            <ul className="space-y-2">
              {footerLinks.resources.map((link, i) => (
                <li key={i}>
                  <Link
                    to={link.to}
                    className="text-sm text-white/70 hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── Bottom bar ── */}
        <div className="border-t border-white/10 mt-6 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-white/50">
          <p>
            &copy; {new Date().getFullYear()}{" "}
            {settings?.school_name || "GHS Babi Khel"}. All rights reserved.
          </p>
          <p>EMIS: {settings?.emis_code || "60673"}</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
