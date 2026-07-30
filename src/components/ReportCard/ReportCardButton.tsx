// src/components/ReportCard/ReportCardButton.tsx
// The small white rectangle button with thin blue border that appears
// below the "Check your examination results by roll number" text on the
// homepage. Clicking it opens the password-gated ReportCardModal.
//
// Per spec:
//   • Small rectangle
//   • White background (rest state)
//   • Thin blue border
//   • Label: "Report Card"
//   • On click → opens modal (which itself handles the password gate)
//   • Active/pressed state → flips to a green fill (white text) so the
//     tap feedback reads clearly against the dark green hero banner.

import { useState } from "react";
import { FileText } from "lucide-react";
import ReportCardModal from "./ReportCardModal";

export default function ReportCardButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 bg-white text-blue-600 border border-blue-500 border-solid rounded-md px-3 py-1.5 text-xs font-semibold hover:bg-blue-50 hover:border-blue-600 active:bg-green-600 active:text-white active:border-green-700 focus:bg-green-600 focus:text-white focus:border-green-700 transition-colors shadow-sm"
        style={{ borderWidth: "1px" }}
      >
        <FileText className="w-3.5 h-3.5" />
        Report Card
      </button>
      <ReportCardModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
