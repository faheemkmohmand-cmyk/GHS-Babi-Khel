// src/components/ReportCard/ReportCardButton.tsx
// The small button that appears below the "Check your examination
// results by roll number" text on the homepage. Clicking it opens the
// password-gated ReportCardModal.
//
// Per spec:
//   • Small rectangle
//   • Same dark green as the hero banner (uses the same `gradient-hero`
//     background + `bg-primary` family) so it visually blends with the
//     banner instead of looking like a separate white pill.
//   • No border (borderless so it disappears into the banner)
//   • White text + white icon
//   • Label: "Report Card"
//   • On click → opens modal (which itself handles the password gate)
//   • Active/pressed state → shifts to `bg-primary-dark` so the tap
//     feedback reads against the banner.

import { useState } from "react";
import { FileText } from "lucide-react";
import ReportCardModal from "./ReportCardModal";

export default function ReportCardButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 gradient-hero text-white rounded-md px-3 py-1.5 text-xs font-semibold hover:opacity-90 active:bg-primary-dark active:opacity-100 focus:bg-primary-dark focus:opacity-100 transition-colors shadow-sm"
        style={{ border: "none" }}
      >
        <FileText className="w-3.5 h-3.5" />
        Report Card
      </button>
      <ReportCardModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
