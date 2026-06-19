import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CircleDollarSign, FileText, CheckCircle, XCircle, Clock,
  AlertTriangle, Download, Wallet, CalendarDays, Receipt,
  TrendingUp, CreditCard, Eye, ChevronDown, ChevronUp,
} from "lucide-react";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import toast from "react-hot-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  useStudentVouchers,
  useMyFeeStructures,
  useFeeVouchersRealtime,
  useMyStudentRecord,
  type FeeVoucher,
  type FeeItem,
} from "@/hooks/useFees";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode; desc: string }> = {
  unpaid: {
    label: "Unpaid", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    icon: <XCircle className="w-4 h-4" />, desc: "Payment is pending",
  },
  partial: {
    label: "Partial", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    icon: <Clock className="w-4 h-4" />, desc: "Partially paid",
  },
  paid: {
    label: "Paid", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    icon: <CheckCircle className="w-4 h-4" />, desc: "Fully paid",
  },
  overdue: {
    label: "Overdue", color: "bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-300",
    icon: <AlertTriangle className="w-4 h-4" />, desc: "Past due date — please pay immediately",
  },
  waived: {
    label: "Waived", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    icon: <CheckCircle className="w-4 h-4" />, desc: "Fee waived by admin",
  },
};

function generateStudentVoucherPDF(voucher: FeeVoucher, studentName: string, rollNumber: string, className: string) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  // Background
  doc.setFillColor(250, 252, 255);
  doc.rect(0, 0, w, h, "F");

  // Header
  doc.setFillColor(220, 234, 250);
  doc.rect(0, 0, w, 32, "F");
  doc.setFillColor(180, 210, 245);
  doc.rect(0, 32, w, 0.8, "F");

  doc.setTextColor(20, 50, 100);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Government High School Babi Khel", w / 2, 13, { align: "center" });
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 110, 160);
  doc.text("District Mohmand, KPK  |  Est. 2018", w / 2, 19, { align: "center" });
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 80, 160);
  doc.text("FEE VOUCHER", w / 2, 27, { align: "center" });

  // Info
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(200, 215, 235);
  doc.setLineWidth(0.3);
  doc.roundedRect(12, 37, w - 24, 22, 2, 2, "FD");

  const info = [
    [`Voucher: ${voucher.voucher_number}`, `Month: ${MONTHS[voucher.month - 1]} ${voucher.year}`],
    [`Student: ${studentName}`, `Roll No: ${rollNumber}`],
    [`Class: ${className}`, `Due Date: ${format(new Date(voucher.due_date), "dd MMM yyyy")}`],
    [`Status: ${voucher.status.toUpperCase()}`, `Period: ${voucher.fee_period === "monthly" ? "Monthly" : "Quarterly"}`],
  ];
  info.forEach((pair, i) => {
    const y = 43 + i * 4.5;
    doc.setTextColor(20, 50, 100);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(pair[0], 16, y);
    doc.text(pair[1], w / 2 + 8, y);
  });

  // Fee table
  const tableBody = (voucher.fee_items as FeeItem[]).map((item, i) => [
    String(i + 1), item.label, item.is_optional ? "Optional" : "Mandatory", `Rs. ${Number(item.amount).toLocaleString()}`,
  ]);
  if (voucher.late_fee > 0) {
    tableBody.push(["", "Late Fee", "Penalty", `Rs. ${Number(voucher.late_fee).toLocaleString()}`]);
  }

  autoTable(doc, {
    startY: 64,
    head: [["#", "Fee Description", "Type", "Amount"]],
    body: tableBody,
    headStyles: { fillColor: [30, 80, 160], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: [30, 40, 60] },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: 70 },
      2: { cellWidth: 40, halign: "center" },
      3: { cellWidth: 40, halign: "right", fontStyle: "bold" },
    },
    alternateRowStyles: { fillColor: [240, 247, 255] },
    margin: { left: 12, right: 12 },
  });

  // Total
  const finalY = (doc as any).lastAutoTable?.finalY || 120;
  doc.setFillColor(30, 80, 160);
  doc.rect(12, finalY + 2, w - 24, 12, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL AMOUNT", 16, finalY + 9.5);
  doc.text(`Rs. ${Number(voucher.total_amount + voucher.late_fee).toLocaleString()}`, w - 16, finalY + 9.5, { align: "right" });

  // Bank details
  if (voucher.bank_details?.bank_name) {
    const bankY = finalY + 22;
    doc.setDrawColor(200, 215, 235);
    doc.setLineWidth(0.3);
    doc.roundedRect(12, bankY, w - 24, 24, 2, 2, "FD");
    doc.setTextColor(30, 80, 160);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("PAY TO BANK:", 16, bankY + 7);
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    let by = bankY + 12;
    if (voucher.bank_details.bank_name) { doc.text(`Bank: ${voucher.bank_details.bank_name}`, 16, by); by += 4; }
    if (voucher.bank_details.account_title) { doc.text(`Title: ${voucher.bank_details.account_title}`, 16, by); by += 4; }
    if (voucher.bank_details.account_number) { doc.text(`A/C: ${voucher.bank_details.account_number}`, 16, by); }
  }

  // Footer
  doc.setFillColor(220, 234, 250);
  doc.rect(0, h - 14, w, 14, "F");
  doc.setDrawColor(180, 210, 245);
  doc.line(0, h - 14, w, h - 14);
  doc.setTextColor(30, 80, 160);
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.text("GHS BABI KHEL — OFFICIAL FEE VOUCHER", w / 2, h - 6, { align: "center" });
  doc.setTextColor(100, 130, 170);
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, 12, h - 6);
  doc.text(`${voucher.voucher_number}`, w - 12, h - 6, { align: "right" });

  doc.save(`Voucher-${voucher.voucher_number}.pdf`);
}

// ═══════════════════════════════════════════════════════════════
// Main FeeTab Component
// ═══════════════════════════════════════════════════════════════

const FeeTab = () => {
  const { profile } = useAuth();
  const studentClass = profile?.class;
  const [subTab, setSubTab] = useState<"vouchers" | "structure">("vouchers");
  const [expandedVoucher, setExpandedVoucher] = useState<string | null>(null);

  // Real-time subscription: invalidates queries when admin adds/deletes vouchers or fees
  useFeeVouchersRealtime();

  // NEW: get_all_vouchers() returns EVERY fee voucher in the system — visible
  // to any authenticated user. No student-linking required.
  const { data: voucherData, isLoading } = useStudentVouchers(studentClass, profile?.id);
  const allVouchers = voucherData?.vouchers ?? [];

  // Also keep useMyStudentRecord for PDF name fallback (not required for filtering)
  const { data: myStudentRecord } = useMyStudentRecord(profile?.id);

  // NEW: get_all_fee_structures() returns EVERY active fee structure across ALL classes.
  const { data: structureData } = useMyFeeStructures();
  const allStructures = structureData?.structures ?? [];

  // Summary — based on ALL vouchers in the system (every student)
  const summary = useMemo(() => {
    const totalBilled = allVouchers.reduce((s, v) => s + Number(v.total_amount) + Number(v.late_fee), 0);
    const totalPaid = allVouchers.reduce((s, v) => s + Number(v.paid_amount), 0);
    const outstanding = totalBilled - totalPaid;
    const overdueCount = allVouchers.filter((v) => v.status === "overdue").length;
    const unpaidCount = allVouchers.filter((v) => v.status === "unpaid" || v.status === "partial").length;
    return { totalBilled, totalPaid, outstanding, overdueCount, unpaidCount };
  }, [allVouchers]);

  const handleDownload = (v: FeeVoucher) => {
    generateStudentVoucherPDF(
      v,
      v.students?.full_name || profile?.full_name || myStudentRecord?.full_name || "Student",
      v.students?.roll_number || profile?.roll_number || myStudentRecord?.roll_number || "",
      v.class || ""
    );
    toast.success("Voucher PDF downloaded");
  };

  // Profile not loaded yet
  if (!profile) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
          <CircleDollarSign className="w-5 h-5 text-primary" /> Fee Status
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">View your fee vouchers, payment status & fee structure</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-border rounded-xl p-3.5">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
            <Receipt className="w-3.5 h-3.5" /> Total Billed
          </div>
          <div className="mt-1.5 text-xl font-black text-foreground">Rs. {summary.totalBilled.toLocaleString()}</div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 border border-border rounded-xl p-3.5">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-green-600 dark:text-green-400">
            <CheckCircle className="w-3.5 h-3.5" /> Paid
          </div>
          <div className="mt-1.5 text-xl font-black text-green-600">Rs. {summary.totalPaid.toLocaleString()}</div>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 border border-border rounded-xl p-3.5">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-red-600 dark:text-red-400">
            <AlertTriangle className="w-3.5 h-3.5" /> Outstanding
          </div>
          <div className="mt-1.5 text-xl font-black text-red-600">Rs. {summary.outstanding.toLocaleString()}</div>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-border rounded-xl p-3.5">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-yellow-600 dark:text-yellow-400">
            <Clock className="w-3.5 h-3.5" /> Unpaid / Overdue
          </div>
          <div className="mt-1.5 text-xl font-black text-foreground">
            {summary.unpaidCount} / {summary.overdueCount}
          </div>
        </div>
      </div>

      {/* Collection Progress */}
      {summary.totalBilled > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <h3 className="font-bold text-sm text-foreground mb-2 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" /> Payment Progress
          </h3>
          <div className="flex items-center gap-3">
            <Progress
              value={summary.totalBilled > 0 ? (summary.totalPaid / summary.totalBilled) * 100 : 0}
              className="flex-1 h-3"
            />
            <span className="text-sm font-bold text-primary">
              {summary.totalBilled > 0 ? Math.round((summary.totalPaid / summary.totalBilled) * 100) : 0}%
            </span>
          </div>
        </div>
      )}

      {/* Sub-tabs */}
      <Tabs value={subTab} onValueChange={(v) => setSubTab(v as any)}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="vouchers" className="gap-1.5 flex-1 sm:flex-none">
            <FileText className="w-3.5 h-3.5" /> Vouchers
          </TabsTrigger>
          <TabsTrigger value="structure" className="gap-1.5 flex-1 sm:flex-none">
            <Receipt className="w-3.5 h-3.5" /> Fee Structure
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Vouchers Tab */}
      {subTab === "vouchers" && (
        <>
          {isLoading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
          ) : allVouchers.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-10 text-center">
              <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm font-semibold text-foreground">No fee vouchers yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Fee vouchers will appear here when generated by admin.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* ALL vouchers — grouped by class */}
              <div className="mb-2">
                <p className="text-xs font-bold text-primary uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" /> All Fee Vouchers ({allVouchers.length})
                </p>
                {allVouchers.map((v) => {
                    const cfg = statusConfig[v.status] || statusConfig.unpaid;
                    const remaining = Number(v.total_amount) + Number(v.late_fee) - Number(v.paid_amount);
                    const isExpanded = expandedVoucher === v.id;
                    const isPastDue = new Date(v.due_date) < new Date() && v.status !== "paid" && v.status !== "waived";

                    return (
                      <Card key={v.id} className={`border-border overflow-hidden mb-2 ${isPastDue ? "border-red-300 dark:border-red-800" : "ring-2 ring-primary/20"}`}>
                        {isPastDue && (
                          <div className="bg-red-500 text-white text-center text-[10px] font-bold uppercase tracking-widest py-1">
                            <AlertTriangle className="w-3 h-3 inline mr-1" /> OVERDUE — Pay Immediately
                          </div>
                        )}

                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 ${
                              v.status === "paid" ? "bg-green-100 dark:bg-green-900/30 text-green-600"
                              : v.status === "overdue" ? "bg-red-100 dark:bg-red-900/30 text-red-600"
                              : "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600"
                            }`}>
                              <span className="text-lg font-black leading-none">{v.month}</span>
                              <span className="text-[9px] font-semibold">{v.year}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold text-sm">{MONTHS[v.month - 1]} {v.year}</p>
                                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.color}`}>
                                  {cfg.icon} {cfg.label}
                                </span>
                                <span className="text-[10px] text-muted-foreground font-mono">{v.voucher_number}</span>
                              </div>
                              {/* Student name + class — prominent since we now show ALL vouchers */}
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-foreground bg-primary/10 px-2 py-0.5 rounded-md">
                                  {v.students?.photo_url ? (
                                    <img src={v.students.photo_url} alt="" className="w-3.5 h-3.5 rounded-full object-cover" />
                                  ) : (
                                    <span className="w-3.5 h-3.5 rounded-full bg-primary/30 flex items-center justify-center text-[8px] font-black">
                                      {v.students?.full_name?.charAt(0) || "?"}
                                    </span>
                                  )}
                                  {v.students?.full_name || "Unknown"}
                                </span>
                                <span className="text-[10px] text-muted-foreground">Class {v.class}</span>
                                {v.students?.roll_number && (
                                  <span className="text-[10px] text-muted-foreground">#{v.students.roll_number}</span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Due: {format(new Date(v.due_date), "dd MMMM yyyy")}
                                {v.fee_period === "quarterly" && " (Quarterly)"}
                              </p>
                              {v.status !== "paid" && v.status !== "waived" && remaining > 0 && (
                                <div className="mt-2">
                                  <Progress value={(Number(v.paid_amount) / (Number(v.total_amount) + Number(v.late_fee))) * 100} className="h-2" />
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    Rs. {Number(v.paid_amount).toLocaleString()} / Rs. {(Number(v.total_amount) + Number(v.late_fee)).toLocaleString()}
                                  </p>
                                </div>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-lg font-black text-foreground">Rs. {Number(v.total_amount).toLocaleString()}</p>
                              {v.late_fee > 0 && (
                                <p className="text-[10px] text-destructive font-semibold">+Rs. {Number(v.late_fee).toLocaleString()} late fee</p>
                              )}
                              {remaining > 0 && v.status !== "paid" && v.status !== "waived" && (
                                <p className="text-[11px] text-destructive font-bold mt-0.5">Due: Rs. {remaining.toLocaleString()}</p>
                              )}
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-border/60">
                            <Button variant="outline" size="sm" className="gap-1.5 text-xs flex-1" onClick={() => setExpandedVoucher(isExpanded ? null : v.id)}>
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              {isExpanded ? "Hide Details" : "View Details"}
                            </Button>
                            <Button variant="outline" size="sm" className="gap-1.5 text-xs flex-1" onClick={() => handleDownload(v)}>
                              <Download className="w-3.5 h-3.5" /> Download PDF
                            </Button>
                          </div>

                          {/* Expanded details */}
                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-border/60 space-y-3">
                              <div>
                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Fee Breakdown</p>
                                <div className="space-y-1">
                                  {(v.fee_items as FeeItem[]).map((item, i) => (
                                    <div key={i} className="flex justify-between text-sm">
                                      <span className="text-foreground">{item.label}
                                        {item.is_optional && <span className="text-muted-foreground ml-1">(optional)</span>}
                                      </span>
                                      <span className="font-semibold">Rs. {Number(item.amount).toLocaleString()}</span>
                                    </div>
                                  ))}
                                  {v.late_fee > 0 && (
                                    <div className="flex justify-between text-sm text-destructive">
                                      <span>Late Fee</span>
                                      <span className="font-semibold">Rs. {Number(v.late_fee).toLocaleString()}</span>
                                    </div>
                                  )}
                                  <div className="border-t border-border pt-1.5 flex justify-between font-bold">
                                    <span>Total</span>
                                    <span>Rs. {(Number(v.total_amount) + Number(v.late_fee)).toLocaleString()}</span>
                                  </div>
                                  {Number(v.paid_amount) > 0 && (
                                    <div className="flex justify-between text-sm text-green-600">
                                      <span>Paid</span>
                                      <span className="font-semibold">Rs. {Number(v.paid_amount).toLocaleString()}</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {v.bank_details?.bank_name && (
                                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
                                  <p className="text-xs font-bold text-blue-700 dark:text-blue-400 mb-1.5">Payment Bank Details</p>
                                  <div className="space-y-0.5 text-xs text-foreground">
                                    {v.bank_details.bank_name && <p>Bank: {v.bank_details.bank_name}</p>}
                                    {v.bank_details.account_title && <p>Account Title: {v.bank_details.account_title}</p>}
                                    {v.bank_details.account_number && <p>Account No: {v.bank_details.account_number}</p>}
                                    {v.bank_details.iban && <p>IBAN: {v.bank_details.iban}</p>}
                                  </div>
                                </div>
                              )}

                              {v.notes && (
                                <div className="text-xs text-muted-foreground italic bg-muted/50 rounded-lg p-2">
                                  Note: {v.notes}
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
            </div>
          )}
        </>
      )}

      {/* Fee Structure Tab — shows ALL classes */}
      {subTab === "structure" && (
        <>
          {allStructures.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-10 text-center">
              <Receipt className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm font-semibold text-foreground">No fee structure published</p>
              <p className="text-xs text-muted-foreground mt-1">Admin will set up fee structures for each class.</p>
            </div>
          ) : (
            // Group structures by class and render one card per class
            Object.entries(
              allStructures.reduce((acc, s) => {
                if (!acc[s.class]) acc[s.class] = [];
                acc[s.class].push(s);
                return acc;
              }, {} as Record<string, typeof allStructures>)
            )
              .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
              .map(([className, classStructures]) => (
                <Card key={className} className="border-border">
                  <CardContent className="p-0">
                    <div className="bg-primary text-white px-4 py-3 flex items-center justify-between">
                      <span className="font-bold text-sm flex items-center gap-2">
                        <Receipt className="w-4 h-4" /> Fee Structure — Class {className}
                      </span>
                      <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">{classStructures.length} fees</span>
                    </div>
                    <div className="p-4 space-y-2">
                      {classStructures.map((s) => (
                        <div key={s.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                              {s.fee_type.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{s.label}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {s.frequency === "monthly" ? "Monthly" : s.frequency === "quarterly" ? "Quarterly" : s.frequency === "annual" ? "Annual" : "One-time"}
                                {s.is_optional && " • Optional"}
                              </p>
                            </div>
                          </div>
                          <p className="font-bold text-sm">Rs. {Number(s.amount).toLocaleString()}</p>
                        </div>
                      ))}
                      <div className="border-t border-border pt-2 flex justify-between font-bold">
                        <span>Monthly Total</span>
                        <span className="text-primary">
                          Rs. {classStructures
                            .filter((s) => s.frequency === "monthly" || s.frequency === "quarterly")
                            .reduce((sum, s) => sum + (s.frequency === "quarterly" ? Math.round(Number(s.amount) / 3) : Number(s.amount)), 0)
                            .toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
          )}
        </>
      )}
    </div>
  );
};

export default FeeTab;
