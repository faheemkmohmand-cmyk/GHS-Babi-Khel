import { Megaphone } from "lucide-react";
import { Link } from "react-router-dom";
import { useNotices } from "@/hooks/useNotices";
import { useAdmissionSettings } from "@/hooks/useAdmission";

const NewsTicker = () => {
  const { data: notices = [] } = useNotices(20);
  const { data: admSettings }  = useAdmissionSettings();

  // Build base items: prepend admission banner if open
  const admissionItem = admSettings?.is_open
    ? [{
        id: "admission-open",
        title: admSettings.banner_message
          ?? `Admissions Open for Session ${admSettings.session_year} — Apply Online Today${admSettings.last_date ? ` | Last Date: ${new Date(admSettings.last_date).toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" })}` : ""}`,
      }]
    : [];

  const baseItems = [
    ...admissionItem,
    ...(notices.length > 0
      ? notices
      : [
          { id: "1", title: "Welcome to GHS Babi Khel — Excellence in Education" },
          { id: "2", title: "BISE Peshawar Annual Exams Results Published" },
          { id: "3", title: "Science Lab Inauguration Ceremony — District Mohmand" },
        ]),
  ];

  // Triple-duplicate so the seamless loop never shows a gap
  const items = [...baseItems, ...baseItems, ...baseItems];

  // Calculate scroll duration based on item count so speed stays consistent
  // ~120px per item at ~80px/s ≈ good reading pace
  const durationSecs = Math.max(8, baseItems.length * 4);

  return (
    <div className="bg-gold text-black py-1 overflow-hidden border-y border-black">
      <div className="container mx-auto px-4 flex items-center gap-3">
        {/* Label — black pill, thin black border, matches new yellow bar */}
        <div
          className="flex items-center gap-1.5 shrink-0 bg-black px-4 py-1 text-xs font-semibold uppercase tracking-wider border border-black text-white"
          style={{ clipPath: "polygon(10px 0, 100% 0, 100% 100%, calc(100% - 10px) 100%, 0 100%, 0 10px)" }}
        >
          <Megaphone className="w-3 h-3 animate-pulse" />
          Announcements
        </div>

        {/* Scrolling text */}
        <div className="flex-1 overflow-hidden relative">
          {/* Fade edges */}
          <div className="absolute left-0 top-0 h-full w-8 bg-gradient-to-r from-gold to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-gold to-transparent z-10 pointer-events-none" />

          <div
            className="flex gap-12 whitespace-nowrap"
            style={{ animation: `ticker-scroll ${durationSecs}s linear infinite` }}
          >
            {items.map((item, idx) => {
              const to =
                item.id === "admission-open"
                  ? "/admission"
                  : /^[0-9a-fA-F-]{6,}$/.test(String(item.id))
                  ? `/notices/${item.id}`
                  : "/notices";
              return (
                <Link
                  key={`${item.id}-${idx}`}
                  to={to}
                  className="text-sm font-medium inline-flex items-center gap-2 hover:text-black/70 underline-offset-2 hover:underline cursor-pointer transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-black/60 inline-block shrink-0" />
                  {item.title}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes ticker-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
      `}</style>
    </div>
  );
};

export default NewsTicker;
