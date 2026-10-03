// src/components/ReportCard/ReportCardButton.tsx
// The small button on the /results green hero banner. It is anchored to the
// banner's BOTTOM EDGE by PageBanner (absolute bottom-0, centred) — its
// bottom edge touches the banner's bottom edge line exactly, with no gap
// and no overlap with the subtitle text. Clicking it opens the
// password-gated ReportCardModal.
//
// Per spec:
//   • Small rectangle
//   • Same dark green as the hero banner (uses the same `gradient-hero`
//     background + `bg-primary` family) so it visually blends with the
//     banner instead of looking like a separate white pill.
//   • No border (borderless so it disappears into the banner)
//   • Rounded TOP corners only — the bottom edge sits flush on the banner's
//     edge line, so square bottom corners make it merge seamlessly into the
//     edge (rounded bottom corners would leak white slivers of the page
//     background through the corner radius).
//   • No drop shadow — a shadow would smear onto the white page below the
//     banner edge it is flush with.
//   • White text + white icon
//   • Label: "Report Card"
//   • On click → opens modal (which itself handles the password gate)
//   • Active/pressed state → shifts to `bg-primary-dark` so the tap
//     feedback reads against the banner.

import { useState } from "react";
import { FileText, ChevronRight } from "lucide-react";
import ReportCardModal from "./ReportCardModal";

// Premium floating pill: sits half-over the hero's bottom edge (PageBanner
// "premium" variant), glass-gold border, soft shadow, gold icon tile.
export default function ReportCardButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="sheen group relative inline-flex items-center gap-2.5 rounded-full bg-primary-dark text-white pl-1.5 pr-3.5 py-1.5 text-sm font-semibold border border-gold/60 shadow-[0_12px_30px_-8px_rgba(0,0,0,0.55),0_0_0_4px_hsl(var(--background))] hover:border-gold active:scale-[0.97] transition-all duration-200"
      >
        <span className="w-8 h-8 rounded-full bg-gradient-to-br from-gold to-gold-strong text-white flex items-center justify-center shadow-inner">
          <FileText className="w-4 h-4" />
        </span>
        Report Card
        <ChevronRight className="w-4 h-4 text-gold transition-transform group-hover:translate-x-0.5" />
      </button>
      <ReportCardModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
