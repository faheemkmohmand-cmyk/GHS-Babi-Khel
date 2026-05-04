import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X, Megaphone, ArrowRight } from "lucide-react";
import { useAdmissionSettings } from "@/hooks/useAdmission";
import { format, parseISO } from "date-fns";

const KEY = "admissions-banner-dismissed-at";

const AdmissionTopBanner = () => {
  const { data } = useAdmissionSettings();
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (!data?.is_open) { setHidden(true); return; }
    // Dismissal lasts only the current browser session for that "version"
    const stamp = `${data.session_year}-${data.last_date ?? ""}`;
    const dismissed = sessionStorage.getItem(KEY);
    setHidden(dismissed === stamp);
  }, [data]);

  if (!data?.is_open || hidden) return null;

  const dismiss = () => {
    const stamp = `${data.session_year}-${data.last_date ?? ""}`;
    sessionStorage.setItem(KEY, stamp);
    setHidden(true);
  };

  let lastTxt = "";
  try { if (data.last_date) lastTxt = ` · Last Date: ${format(parseISO(data.last_date), "d MMM yyyy")}`; } catch {}

  return (
    <div className="relative bg-primary text-primary-foreground">
      <div className="container mx-auto px-4 py-2 flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 bg-white/15 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0">
          <Megaphone className="w-3 h-3 animate-pulse" /> Admissions Open
        </span>
        <p className="flex-1 text-xs sm:text-sm font-medium truncate">
          {data.banner_message || `Applications open for Session ${data.session_year}`}
          <span className="hidden sm:inline opacity-80">{lastTxt}</span>
        </p>
        <Link
          to="/admissions/apply"
          className="hidden sm:inline-flex items-center gap-1 bg-white text-primary text-xs font-bold px-3 py-1 rounded-full hover:bg-white/90 transition-colors"
        >
          Apply Now <ArrowRight className="w-3 h-3" />
        </Link>
        <button
          onClick={dismiss}
          aria-label="Dismiss admissions banner"
          className="p-1 rounded-md hover:bg-white/15 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default AdmissionTopBanner;
