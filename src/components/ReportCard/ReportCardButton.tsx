// src/components/ReportCard/ReportCardButton.tsx
// The small green rectangle button that appears below the "Check your
// examination results by roll number" text on the homepage. Clicking it
// opens the password-gated ReportCardModal.
//
// Per spec:
//   • Small rectangle
//   • Green fill (matches the hero banner palette, not white)
//   • White border + white text + white icon
//   • Label: "Report Card"
//   • On click → opens modal (which itself handles the password gate)
//   • Active/pressed state → darkens slightly so the tap feedback reads
//     against the dark green hero banner.

import { useState } from "react";
import { FileText } from "lucide-react";
import ReportCardModal from "./ReportCardModal";

export default function ReportCardButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 bg-green-600 text-white border border-white border-solid rounded-md px-3 py-1.5 text-xs font-semibold hover:bg-green-700 hover:border-white active:bg-green-800 active:border-white focus:bg-green-700 focus:border-white transition-colors shadow-sm"
        style={{ borderWidth: "1px" }}
      >
        <FileText className="w-3.5 h-3.5" />
        Report Card
      </button>
      <ReportCardModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
