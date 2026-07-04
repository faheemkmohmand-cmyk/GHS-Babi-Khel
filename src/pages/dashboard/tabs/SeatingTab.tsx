/**
 * SeatingTab.tsx
 * Student dashboard tab — looks up the logged-in student's seat across all
 * published seating plans. Shows room, seat label, row/col, invigilator,
 * and a printable "My Seat Slip" with the QR token for the desk.
 */
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMySeating, encodeSeatingQRData, type MySeat } from "@/hooks/useExamSeating";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LayoutGrid, MapPin, Loader2, Download, User, Building2, Grid3x3 } from "lucide-react";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import QRCode from "qrcode";

const colorFor = (cls: string) => {
  const m: Record<string, { bg: string; text: string }> = {
    "6":  { bg: "bg-blue-100 dark:bg-blue-900/40",       text: "text-blue-700 dark:text-blue-300" },
    "7":  { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300" },
    "8":  { bg: "bg-amber-100 dark:bg-amber-900/40",     text: "text-amber-700 dark:text-amber-300" },
    "9":  { bg: "bg-rose-100 dark:bg-rose-900/40",       text: "text-rose-700 dark:text-rose-300" },
    "10": { bg: "bg-violet-100 dark:bg-violet-900/40",   text: "text-violet-700 dark:text-violet-300" },
  };
  return m[cls] ?? { bg: "bg-slate-100 dark:bg-slate-900/40", text: "text-slate-700 dark:text-slate-300" };
};

const SeatingTab = () => {
  const { profile } = useAuth();
  const studentId = profile?.id;
  const studentClass = profile?.class;
  const classRollNo = profile?.roll_number;
  const { data: seats = [], isLoading } = useMySeating(studentId, studentClass, classRollNo);
  const [downloading, setDownloading] = useState<string | null>(null);

  const downloadSlip = async (s: MySeat) => {
    setDownloading(s.seat_label);
    try {
      const qrData = encodeSeatingQRData({
        planId: s.plan_id, roomId: s.room_id, seatLabel: s.seat_label,
        studentId: studentId ?? s.exam_roll_no, examRollNo: s.exam_roll_no,
      });
      const qrDataURL = await QRCode.toDataURL(qrData, { width: 400, margin: 1, errorCorrectionLevel: "M" });

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a6" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      // Border
      doc.setDrawColor(120); doc.setLineWidth(0.5);
      doc.rect(3, 3, pageW - 6, pageH - 6, "S");

      // Header
      doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(40);
      doc.text("GHS Babi Khel", pageW / 2, 10, { align: "center" });
      doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(100);
      doc.text("EXAM SEATING SLIP", pageW / 2, 15, { align: "center" });

      // QR
      const qrSize = 30;
      const qrX = (pageW - qrSize) / 2;
      doc.addImage(qrDataURL, "PNG", qrX, 20, qrSize, qrSize);
      doc.setFontSize(5.5); doc.setTextColor(120); doc.setFont("helvetica", "normal");
      doc.text("Scan this QR at the exam hall", pageW / 2, 20 + qrSize + 4, { align: "center" });

      // Hero: seat label
      doc.setFillColor(245, 245, 245);
      doc.roundedRect(8, 20 + qrSize + 7, pageW - 16, 14, 1.5, 1.5, "F");
      doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.setTextColor(120);
      doc.text("YOUR SEAT", pageW / 2, 20 + qrSize + 11, { align: "center" });
      doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(40);
      doc.text(s.seat_label, pageW / 2, 20 + qrSize + 18, { align: "center" });

      // Details
      let y = 20 + qrSize + 26;
      const drawDetail = (label: string, value: string) => {
        doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(120);
        doc.text(label, 8, y);
        doc.setFont("helvetica", "bold"); doc.setTextColor(40);
        doc.text(value, 8 + 22, y);
        y += 5;
      };
      drawDetail("Student:", profile?.full_name ?? "—");
      drawDetail("Exam Roll:", s.exam_roll_no);
      drawDetail("Room:", s.room_name);
      drawDetail("Row · Seat:", `Row ${s.row_idx + 1} · Col ${s.col_idx + 1}`);
      if (s.invigilator) drawDetail("Invigilator:", s.invigilator);
      if (s.paper_subject) drawDetail("Paper:", s.paper_subject);
      if (s.exam_date) drawDetail("Date:", new Date(s.exam_date).toLocaleDateString());

      // Footer
      doc.setDrawColor(120); doc.setLineWidth(0.3);
      doc.line(3, pageH - 8, pageW - 3, pageH - 8);
      doc.setFontSize(5); doc.setTextColor(140); doc.setFont("helvetica", "bold");
      doc.text("GHS BABI KHEL · EXAM SEATING", pageW / 2, pageH - 5, { align: "center" });

      doc.save(`SeatingSlip-${s.seat_label.replace(/[^\w-]/g, "_")}.pdf`);
      toast.success("Seating slip downloaded");
    } catch (e: any) {
      toast.error("Failed: " + (e?.message ?? ""));
    }
    setDownloading(null);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
          <LayoutGrid className="w-6 h-6 text-primary" /> My Exam Seating
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">Find your room and seat for upcoming exams</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
      ) : seats.length === 0 ? (
        <div className="bg-card rounded-2xl p-10 text-center border border-border">
          <MapPin className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="font-semibold text-foreground">No Seating Assigned Yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Your school hasn't published a seating plan, or you aren't included in one. Check back closer to your exam date.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {seats.map(s => {
            const cc = colorFor(s.exam_roll_no.length > 0 ? s.exam_roll_no.replace(/[^0-9]/g, "").slice(-1) : "");
            // Use the plan's class as shown in the assignment view via the student's class.
            // (We don't have it directly on MySeat; fall back to a neutral color.)
            return (
              <Card key={s.plan_id + s.seat_label} className="overflow-hidden">
                <CardContent className="p-4 flex items-center gap-4 flex-wrap">
                  <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Grid3x3 className="w-7 h-7 text-primary" />
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-bold font-mono">{s.seat_label}</h3>
                      <Badge variant="secondary">{s.room_name}</Badge>
                      {s.invigilator && <Badge variant="outline">Invigilator: {s.invigilator}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {s.plan_title}
                      {s.paper_subject ? ` · ${s.paper_subject}` : ""}
                      {s.exam_date ? ` · ${new Date(s.exam_date).toLocaleDateString()}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Exam Roll No: <span className="font-mono font-semibold text-foreground">{s.exam_roll_no}</span>
                    </p>
                  </div>
                  <Button onClick={() => downloadSlip(s)} disabled={downloading === s.seat_label} variant="outline">
                    {downloading === s.seat_label ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Slip
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SeatingTab;
