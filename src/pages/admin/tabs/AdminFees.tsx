import { useState, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  DollarSign, Plus, Pencil, Trash2, Loader2, Search, Download,
  FileText, CheckCircle, XCircle, Clock, AlertTriangle,
  BarChart3, TrendingUp, Users, CreditCard, Receipt,
  ChevronLeft, ChevronRight, ArrowUpDown, Eye,
  Wallet, Banknote, Building2, Smartphone, Printer,
  CalendarDays, CircleDollarSign, UserX, CheckCheck,
  UserCircle,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend, PieChart, Pie,
} from "recharts";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

import {
  useAllFeeStructures,
  useFeeStructures,
  useMutateFeeStructure,
  useFeeVouchers,
  useGenerateVouchers,
  useUpdateVoucher,
  useDeleteVoucher,
  useRecordPayment,
  useFeePayments,
  useFeeDashboard,
  useFeeDefaulters,
  useFeeCollectionReport,
  useClassCollectionSummary,
  useStudentsByClass,
  type FeeStructure,
  type FeeVoucher,
  type FeePayment,
  type FeeItem,
  type PaymentMethod,
} from "@/hooks/useFees";
import CustomFeeModal from "@/components/admin/fees/CustomFeeModal";

const CLASSES = ["6", "7", "8", "9", "10"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const FEE_TYPES = [
  { value: "tuition", label: "Tuition Fee" },
  { value: "lab", label: "Lab Fee" },
  { value: "library", label: "Library Fee" },
  { value: "transport", label: "Transport Fee" },
  { value: "exam", label: "Exam Fee" },
  { value: "admission", label: "Admission Fee" },
  { value: "migration", label: "Migration Fee" },
  { value: "bise", label: "BISE Registration" },
  { value: "other", label: "Other Fee" },
];
const FREQUENCIES = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
  { value: "one_time", label: "One Time" },
];
const PAYMENT_METHODS = [
  { value: "cash", label: "Cash", icon: Banknote, color: "text-green-600" },
  { value: "bank", label: "Bank Transfer", icon: Building2, color: "text-blue-600" },
  { value: "online", label: "Online / JazzCash / Easypaisa", icon: Smartphone, color: "text-purple-600" },
  { value: "cheque", label: "Cheque", icon: CreditCard, color: "text-orange-600" },
];
const CLASS_COLORS: Record<string, string> = {
  "6": "#6366f1", "7": "#10b981", "8": "#1e3a8a", "9": "#ef4444", "10": "#8b5cf6",
};

// ═══════════════════════════════════════════════════════════════
// Voucher PDF Generation - ACADEMIC/EDITORIAL STYLE (Fixed 2026-08-21)
// ═══════════════════════════════════════════════════════════════
// Changed from blue colorful to minimal academic style:
// - Black/gray color scheme instead of blue
// - Clean lines and borders
// - Professional typography
// - Minimal use of color (only for status badges)

function generateVoucherPDF(voucher: FeeVoucher, studentName: string, rollNumber: string) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  // Background - clean white
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, w, h, "F");

  // Top border line (subtle, instead of colored header band)
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.8);
  doc.line(15, 10, w - 15, 10);

  // School name - clean black text
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Government High School Babi Khel", w / 2, 18, { align: "center" });
  
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("District Mohmand, Khyber Pakhtunkhwa", w / 2, 24, { align: "center" });
  
  // Document title with subtle underline
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(40, 40, 40);
  doc.text("FEE VOUCHER", w / 2, 31, { align: "center" });
  
  // Subtle divider line under title
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(w / 2 - 35, 34, w / 2 + 35, 34);

  // Voucher info section - clean box with light gray border
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.5);
  doc.roundedRect(15, 39, w - 30, 24, 1.5, 1.5, "D");

  const leftInfo = [
    ["Voucher No.", voucher.voucher_number],
    ["Student Name", studentName],
    ["Roll Number", rollNumber],
    ["Class", `Class ${voucher.class}`],
  ];
  const rightInfo = [
    ["Period", `${MONTHS[voucher.month - 1]} ${voucher.year}`],
    ["Due Date", format(new Date(voucher.due_date), "dd MMM yyyy")],
    ["Status", voucher.status.toUpperCase()],
    ["Type", voucher.fee_period === "one_off" ? "One-time" : voucher.fee_period === "monthly" ? "Monthly" : "Quarterly"],
  ];

  leftInfo.forEach((row, i) => {
    const y = 45 + i * 5;
    doc.setTextColor(120, 120, 120);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text(row[0] + ":", 19, y);
    doc.setTextColor(25, 25, 25);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.text(row[1], 50, y);
  });

  rightInfo.forEach((row, i) => {
    const y = 45 + i * 5;
    doc.setTextColor(120, 120, 120);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text(row[0] + ":", w / 2 + 12, y);
    doc.setTextColor(25, 25, 25);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.text(row[1], w / 2 + 42, y);
  });

  // Section header for fee breakdown
  const sectionY = 67;
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(15, sectionY, w - 15, sectionY);
  
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(50, 50, 50);
  doc.text("Fee Breakdown", 15, sectionY + 5);

  // Fee breakdown table - academic style with minimal colors
  const tableBody = (voucher.fee_items as FeeItem[]).map((item, i) => [
    String(i + 1),
    item.label,
    item.is_optional ? "Optional" : "Required",
    `Rs. ${Number(item.amount).toLocaleString("en-PK")}`,
  ]);

  if (voucher.late_fee > 0) {
    tableBody.push(["", "Late Fee (Penalty)", "", `Rs. ${Number(voucher.late_fee).toLocaleString("en-PK")}`]);
  }

  autoTable(doc, {
    startY: sectionY + 8,
    head: [["S.No.", "Description", "Type", "Amount (Rs.)"]],
    body: tableBody,
    headStyles: { 
      fillColor: [245, 245, 245], 
      textColor: [30, 30, 30], 
      fontStyle: "bold", 
      fontSize: 8.5,
      font: "helvetica"
    },
    bodyStyles: { 
      fontSize: 9, 
      textColor: [40, 40, 40],
      font: "helvetica"
    },
    columnStyles: {
      0: { cellWidth: 15, halign: "center" },
      1: { cellWidth: 75 },
      2: { cellWidth: 35, halign: "center" },
      3: { cellWidth: 40, halign: "right", fontStyle: "bold" },
    },
    alternateRowStyles: { fillColor: [250, 250, 250] }, // Very subtle alternating rows
    margin: { left: 15, right: 15 },
    styles: {
      lineColor: [220, 220, 220],
      lineWidth: 0.2,
    },
    headLineColor: [150, 150, 150],
    headLineWidth: 0.4,
  });

  // Total section - clean black bar instead of blue
  const finalY = (doc as any).lastAutoTable?.finalY || 125;
  
  // Add spacing before total
  const totalY = finalY + 5;
  
  // Total box with black background (academic style)
  doc.setFillColor(30, 30, 30); // Black instead of blue
  doc.roundedRect(15, totalY, w - 30, 12, 1, 1, "F");
  
  doc.setTextColor(255, 255, 255); // White text on black
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL AMOUNT DUE", 19, totalY + 7.5);
  doc.text(`Rs. ${Number(voucher.total_amount + voucher.late_fee).toLocaleString("en-PK")}`, w - 19, totalY + 7.5, { align: "right" });

  // Payment details section (if available)
  let currentY = totalY + 18;

  // Check for payment methods in bank_details
  const paymentMethods = voucher.bank_details?.payment_methods;
  
  if (paymentMethods && paymentMethods.length > 0 && paymentMethods.some(pm => pm.type !== 'cash')) {
    // Payment methods header
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.line(15, currentY, w - 15, currentY);
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(50, 50, 50);
    doc.text("Payment Methods", 15, currentY + 5);
    
    currentY += 11;
    
    paymentMethods.filter(pm => pm.type !== 'cash').forEach((pm) => {
      if (currentY > h - 30) return; // Prevent overflow
      
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(40, 40, 40);
      
      let methodLabel = "";
      switch (pm.type) {
        case "bank":
          methodLabel = `Bank Transfer${pm.bank_name ? ` - ${pm.bank_name}` : ""}`;
          break;
        case "easypaisa":
          methodLabel = `EasyPaisa${pm.account_name ? ` - ${pm.account_name}` : ""}`;
          break;
        case "jazzcash":
          methodLabel = `JazzCash${pm.account_name ? ` - ${pm.account_name}` : ""}`;
          break;
        default:
          methodLabel = pm.label || pm.type;
      }
      
      doc.text(`• ${methodLabel}`, 17, currentY);
      currentY += 5;
      
      // Add details based on type
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);
      
      if (pm.type === "bank") {
        if (pm.account_title) { doc.text(`   Account: ${pm.account_title}`, 17, currentY); currentY += 4; }
        if (pm.account_number) { doc.text(`   No: ${pm.account_number}`, 17, currentY); currentY += 4; }
        if (pm.iban) { doc.text(`   IBAN: ${pm.iban}`, 17, currentY); currentY += 4; }
      } else if (pm.type === "easypaisa" || pm.type === "jazzcash") {
        if (pm.account_name) { doc.text(`   Name: ${pm.account_name}`, 17, currentY); currentY += 4; }
        if (pm.phone) { doc.text(`   Phone: ${pm.phone}`, 17, currentY); currentY += 4; }
      } else if (pm.instructions) {
        doc.text(`   ${pm.instructions}`, 17, currentY); currentY += 4;
      }
      
      currentY += 2;
    });
    
    currentY += 3;
  }

  // Traditional bank details (backward compatibility)
  if (voucher.bank_details?.bank_name && !paymentMethods?.length) {
    if (currentY < h - 35) {
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.3);
      doc.line(15, currentY, w - 15, currentY);
      
      doc.setTextColor(50, 50, 50);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Bank Details", 15, currentY + 5);
      
      doc.setTextColor(60, 60, 60);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      const bankLines = [
        voucher.bank_details.bank_name ? `Bank: ${voucher.bank_details.bank_name}` : "",
        voucher.bank_details.account_title ? `Account Title: ${voucher.bank_details.account_title}` : "",
        voucher.bank_details.account_number ? `Account Number: ${voucher.bank_details.account_number}` : "",
        voucher.bank_details.iban ? `IBAN: ${voucher.bank_details.iban}` : "",
      ].filter(Boolean);
      bankLines.forEach((line, i) => {
        doc.text(line, 17, currentY + 12 + i * 4);
      });
    }
  }

  // Footer - clean and minimal
  const footerY = h - 12;
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.5);
  doc.line(15, footerY, w - 15, footerY);
  
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.text("GHS BABI KHEL — OFFICIAL DOCUMENT", w / 2, footerY + 5, { align: "center" });
  doc.text(`Generated on ${format(new Date(), "dd MMM yyyy 'at' HH:mm")}  |  ${voucher.voucher_number}`, w / 2, footerY + 10, { align: "center" });

  doc.save(`Voucher-${voucher.voucher_number}.pdf`);
}

// ═══════════════════════════════════════════════════════════════
// Custom Tooltip for Charts
// ═══════════════════════════════════════════════════════════════

const CustomTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl p-2.5 shadow-lg text-xs">
      <p className="font-bold text-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }}>
          {p.name}: <strong>Rs. {Number(p.value).toLocaleString()}</strong>
        </p>
      ))}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// Status Badge Component
// ═══════════════════════════════════════════════════════════════

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  unpaid: { label: "Unpaid", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: <XCircle className="w-3 h-3" /> },
  partial: { label: "Partial", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", icon: <Clock className="w-3 h-3" /> },
  paid: { label: "Paid", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: <CheckCircle className="w-3 h-3" /> },
  overdue: { label: "Overdue", color: "bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-300", icon: <AlertTriangle className="w-3 h-3" /> },
  waived: { label: "Waived", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: <CheckCheck className="w-3 h-3" /> },
};

const StatusBadge = ({ status }: { status: string }) => {
  const cfg = statusConfig[status] || statusConfig.unpaid;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
};

// ═══════════════════════════════════════════════════════════════
// Main AdminFees Component
// ═══════════════════════════════════════════════════════════════

const AdminFees = () => {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"structures" | "vouchers" | "payments" | "dashboard" | "reports">("dashboard");

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <CircleDollarSign className="w-6 h-6 text-primary" /> Fee Management
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Manage fee structures, vouchers, payments & reports</p>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="overflow-x-auto -mx-1 px-1">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="w-full sm:w-auto flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="dashboard" className="gap-1.5 text-xs flex-1 sm:flex-none">
              <BarChart3 className="w-3.5 h-3.5" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="structures" className="gap-1.5 text-xs flex-1 sm:flex-none">
              <Receipt className="w-3.5 h-3.5" /> Structures
            </TabsTrigger>
            <TabsTrigger value="vouchers" className="gap-1.5 text-xs flex-1 sm:flex-none">
              <FileText className="w-3.5 h-3.5" /> Vouchers
            </TabsTrigger>
            <TabsTrigger value="payments" className="gap-1.5 text-xs flex-1 sm:flex-none">
              <Wallet className="w-3.5 h-3.5" /> Payments
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-1.5 text-xs flex-1 sm:flex-none">
              <TrendingUp className="w-3.5 h-3.5" /> Reports
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {activeTab === "dashboard" && <DashboardTab />}
      {activeTab === "structures" && <StructuresTab />}
      {activeTab === "vouchers" && <VouchersTab />}
      {activeTab === "payments" && <PaymentsTab />}
      {activeTab === "reports" && <ReportsTab />}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// Dashboard Tab
// ═══════════════════════════════════════════════════════════════

function DashboardTab() {
  const { data: dash, isLoading } = useFeeDashboard();
  const { data: defaulters = [] } = useFeeDefaulters();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  if (!dash) {
    return (
      <div className="bg-card rounded-2xl border border-border p-10 text-center">
        <CircleDollarSign className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm font-semibold text-foreground">No fee data yet</p>
        <p className="text-xs text-muted-foreground mt-1">Set up fee structures and generate vouchers to see the dashboard.</p>
      </div>
    );
  }

  const statCards = [
    { icon: <CircleDollarSign className="w-5 h-5" />, label: "Total Billed", value: `Rs. ${dash.totalBilled.toLocaleString()}`, color: "#6366f1", bg: "bg-indigo-50 dark:bg-indigo-900/20" },
    { icon: <CheckCircle className="w-5 h-5" />, label: "Collected", value: `Rs. ${dash.totalCollected.toLocaleString()}`, color: "#10b981", bg: "bg-green-50 dark:bg-green-900/20" },
    { icon: <AlertTriangle className="w-5 h-5" />, label: "Outstanding", value: `Rs. ${dash.totalOutstanding.toLocaleString()}`, color: "#ef4444", bg: "bg-red-50 dark:bg-red-900/20" },
    { icon: <TrendingUp className="w-5 h-5" />, label: "Collection Rate", value: `${dash.collectionRate}%`, color: dash.collectionRate >= 80 ? "#10b981" : dash.collectionRate >= 50 ? "#f59e0b" : "#ef4444", bg: "bg-blue-50 dark:bg-blue-900/20" },
    { icon: <FileText className="w-5 h-5" />, label: "Total Vouchers", value: dash.totalVouchers, color: "#6366f1", bg: "bg-violet-50 dark:bg-violet-900/20" },
    { icon: <CheckCircle className="w-5 h-5" />, label: "Paid", value: dash.paidVouchers, color: "#10b981", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
    { icon: <Clock className="w-5 h-5" />, label: "Unpaid", value: dash.unpaidVouchers, color: "#f59e0b", bg: "bg-yellow-50 dark:bg-yellow-900/20" },
    { icon: <AlertTriangle className="w-5 h-5" />, label: "Overdue", value: dash.overdueVouchers, color: "#ef4444", bg: "bg-red-50 dark:bg-red-900/20" },
  ];

  // Aging chart data
  const agingData = [
    { name: "Current", value: dash.aging.current, fill: "#10b981" },
    { name: "1-30 Days", value: dash.aging.days30, fill: "#f59e0b" },
    { name: "31-60 Days", value: dash.aging.days60, fill: "#f97316" },
    { name: "61-90 Days", value: dash.aging.days90, fill: "#ef4444" },
    { name: "90+ Days", value: dash.aging.over90, fill: "#991b1b" },
  ].filter((d) => d.value > 0);

  // Class breakdown chart
  const classChartData = Object.entries(dash.classBreakdown).map(([cls, d]) => ({
    class: `Class ${cls}`,
    collected: d.collected,
    outstanding: d.outstanding,
  }));

  return (
    <div className="space-y-5">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map((s) => (
          <div key={s.label} className={`${s.bg} border border-border rounded-xl p-3.5`}>
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide opacity-70" style={{ color: s.color }}>
              {s.icon} {s.label}
            </div>
            <div className="mt-1.5 text-xl font-black text-foreground">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Collection Progress */}
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
        <h3 className="font-bold text-sm text-foreground mb-2 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" /> Overall Collection Progress
        </h3>
        <div className="flex items-center gap-3">
          <Progress value={dash.collectionRate} className="flex-1 h-3" />
          <span className="text-sm font-bold text-primary">{dash.collectionRate}%</span>
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
          <span>Rs. {dash.totalCollected.toLocaleString()} collected</span>
          <span>Rs. {dash.totalBilled.toLocaleString()} billed</span>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Aging Analysis */}
        {agingData.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" /> Aging Analysis
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={agingData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, value }) => `${name}: Rs.${value.toLocaleString()}`}
                  labelLine={true}
                >
                  {agingData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip formatter={(v: number) => `Rs. ${v.toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Class-wise Breakdown */}
        {classChartData.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" /> Class-wise Collection
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={classChartData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="class" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="collected" name="Collected" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="outstanding" name="Outstanding" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Top Defaulters */}
      {defaulters.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="bg-destructive/10 text-destructive px-4 py-3 flex items-center gap-2">
            <UserX className="w-4 h-4" />
            <span className="font-bold text-sm">Top Defaulters — {defaulters.length} student(s) with outstanding fees</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Student</TableHead>
                  <TableHead className="text-xs text-center">Outstanding</TableHead>
                  <TableHead className="text-xs text-center hidden sm:table-cell">Overdue</TableHead>
                  <TableHead className="text-xs text-center hidden md:table-cell">Last Payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {defaulters.slice(0, 10).map((d) => (
                  <TableRow key={d.student_id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {d.photo_url ? (
                          <img src={d.photo_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">{d.full_name?.charAt(0) || "?"}</div>
                        )}
                        <div>
                          <p className="text-sm font-medium">{d.full_name}</p>
                          <p className="text-[10px] text-muted-foreground">Class {d.class} | #{d.roll_number}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm font-bold text-destructive">Rs. {d.outstanding.toLocaleString()}</span>
                    </TableCell>
                    <TableCell className="text-center hidden sm:table-cell">
                      {d.overdue_count > 0 && <Badge variant="destructive" className="text-[10px]">{d.overdue_count} voucher(s)</Badge>}
                    </TableCell>
                    <TableCell className="text-center hidden md:table-cell text-xs text-muted-foreground">
                      {d.last_payment_date ? format(new Date(d.last_payment_date), "dd MMM yyyy") : "Never"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Fee Structures Tab
// ═══════════════════════════════════════════════════════════════

function StructuresTab() {
  const [cls, setCls] = useState("6");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FeeStructure | null>(null);
  const [form, setForm] = useState({
    class: "6", fee_type: "tuition", label: "Tuition Fee", amount: 0,
    is_optional: false, is_recurring: true, frequency: "monthly" as string,
    payment_methods: [] as PaymentMethod[],
  });
  const [saving, setSaving] = useState(false);

  const { data: structures = [], isLoading } = useFeeStructures(cls);
  const { upsert, remove } = useMutateFeeStructure();

  // Payment method type options
  const PAYMENT_METHOD_TYPES = [
    { value: "bank", label: "Bank Transfer", icon: Building2 },
    { value: "easypaisa", label: "EasyPaisa", icon: Smartphone },
    { value: "jazzcash", label: "JazzCash", icon: Smartphone },
    { value: "cash", label: "Cash (Office)", icon: Banknote },
    { value: "other", label: "Other", icon: CreditCard },
  ];

  const openAdd = () => {
    setEditing(null);
    setForm({ 
      class: cls, fee_type: "tuition", label: "Tuition Fee", amount: 0, 
      is_optional: false, is_recurring: true, frequency: "monthly",
      payment_methods: [],
    });
    setModalOpen(true);
  };

  const openEdit = (s: FeeStructure) => {
    setEditing(s);
    // Defensive: ensure payment_methods is always an array even if DB returns null/undefined
    let paymentMethods: PaymentMethod[] = [];
    try {
      // Handle case where payment_methods might be null, undefined, or not an array
      if (Array.isArray(s.payment_methods)) {
        paymentMethods = s.payment_methods;
      } else if (s.payment_methods && typeof s.payment_methods === 'object') {
        // Sometimes JSONB comes as object instead of array
        paymentMethods = [s.payment_methods as any];
      }
    } catch (e) {
      console.warn('Failed to parse payment_methods:', e);
      paymentMethods = [];
    }
    
    setForm({
      class: s.class, fee_type: s.fee_type, label: s.label, amount: Number(s.amount),
      is_optional: s.is_optional, is_recurring: s.is_recurring, frequency: s.frequency,
      payment_methods: paymentMethods,
    });
    setModalOpen(true);
  };

  // Add a new empty payment method (with defensive error handling)
  const addPaymentMethod = () => {
    try {
      setForm(p => ({
        ...p,
        payment_methods: [...p.payment_methods, { type: "bank" as const }],
      }));
    } catch (err) {
      console.error('Error adding payment method:', err);
      toast.error("Failed to add payment method. Please try again.");
    }
  };

  // Remove a payment method by index
  const removePaymentMethod = (index: number) => {
    try {
      setForm(p => ({
        ...p,
        payment_methods: p.payment_methods.filter((_, i) => i !== index),
      }));
    } catch (err) {
      console.error('Error removing payment method:', err);
    }
  };

  // Update a specific payment method field (with validation)
  const updatePaymentMethod = (index: number, field: string, value: any) => {
    try {
      setForm(p => ({
        ...p,
        payment_methods: p.payment_methods.map((pm, i) =>
          i === index ? { ...pm, [field]: value } : pm
        ),
      }));
    } catch (err) {
      console.error('Error updating payment method:', err);
      toast.error("Failed to update payment method.");
    }
  };

  const handleSave = async () => {
    if (!form.label || !form.fee_type) { toast.error("Label and fee type required"); return; }
    setSaving(true);
    try {
      // Build the base payload (without payment_methods first)
      const basePayload: any = {
        ...(editing ? { id: editing.id } : {}),
        class: form.class,
        fee_type: form.fee_type,
        label: form.label,
        amount: form.amount,
        is_optional: form.is_optional,
        is_recurring: form.is_recurring,
        frequency: form.frequency,
        is_active: true,
      };
      
      // Try saving WITH payment methods first
      if (form.payment_methods && form.payment_methods.length > 0) {
        // Validate payment methods - remove any empty/invalid ones
        const validMethods = form.payment_methods.filter(pm => 
          pm && pm.type && ['bank', 'easypaisa', 'jazzcash', 'cash', 'other'].includes(pm.type)
        );
        
        if (validMethods.length > 0) {
          try {
            const payloadWithMethods = {
              ...basePayload,
              payment_methods: validMethods,
            };
            await upsert.mutateAsync(payloadWithMethods);
            toast.success(editing ? "Fee structure updated successfully" : "Fee structure added successfully");
            setModalOpen(false);
            return; // Success - exit early
          } catch (methodErr: any) {
            console.warn('Save with payment_methods failed, retrying without:', methodErr?.message);
            
            // If payment_methods column doesn't exist or other DB issue, save without it
            if (methodErr?.message?.includes('payment_methods') || 
                methodErr?.message?.include('column') ||
                methodErr?.code === '42703') {
              toast.warning("Payment methods could not be saved. Basic fee info saved instead.");
            }
            // Continue to save without payment_methods
          }
        }
      }
      
      // Save WITHOUT payment methods (fallback)
      await upsert.mutateAsync(basePayload);
      toast.success(editing ? "Fee structure updated successfully" : "Fee structure added successfully");
      setModalOpen(false);
      
    } catch (err: any) {
      console.error('Fee structure save error:', err);
      
      // Provide specific error messages for common issues
      const errorMsg = err?.message || "Unknown error";
      
      if (errorMsg.includes('duplicate key') || errorMsg.includes('unique')) {
        toast.error(`A fee of type "${form.fee_type}" already exists for Class ${form.class}. Please edit it or use a different type.`);
      } else if (errorMsg.includes('payment_methods')) {
        toast.error("Could not save payment methods. The basic fee info was saved. You may need to run a database migration for full payment method support.");
      } else if (errorMsg.includes('RLS') || errorMsg.includes('permission') || errorMsg.includes('42P')) {
        toast.error("Permission denied. You may not have admin access to modify fee structures.");
      } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
        toast.error("Network error. Please check your connection and try again.");
      } else {
        toast.error(`Failed to save: ${errorMsg}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s: FeeStructure) => {
    try {
      await remove.mutateAsync(s.id);
      toast.success("Deactivated");
    } catch (err: any) {
      toast.error(err?.message || "Delete failed");
    }
  };

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  // Auto-fill label from fee type
  const handleFeeTypeChange = (ft: string) => {
    const found = FEE_TYPES.find((t) => t.value === ft);
    setForm((p) => ({ ...p, fee_type: ft, label: found?.label || ft }));
  };

  return (
    <div className="space-y-4">
      {/* Class selector + add button */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {CLASSES.map((c) => (
            <button key={c} onClick={() => setCls(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${cls === c ? "bg-primary text-white" : "bg-secondary text-muted-foreground"}`}>
              Class {c}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <Button size="sm" className="gap-1.5" onClick={openAdd}><Plus className="w-3.5 h-3.5" /> Add Fee</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : structures.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-10 text-center">
          <Receipt className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm font-semibold text-foreground">No fee structures for Class {cls}</p>
          <p className="text-xs text-muted-foreground mt-1">Click "Add Fee" to create one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {structures.map((s) => (
            <Card key={s.id} className="border-border">
              <CardContent className="p-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                    {s.fee_type.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{s.label}</p>
                      <Badge variant="outline" className="text-[10px]">{s.frequency}</Badge>
                      {s.is_optional && <Badge className="text-[10px] bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Optional</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.fee_type} | {s.is_recurring ? "Recurring" : "One-time"}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-black text-foreground">Rs. {Number(s.amount).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(s)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Fee Structure" : "Add Fee Structure"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Class</Label>
                <Select value={form.class} onValueChange={(v) => set("class", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CLASSES.map((c) => <SelectItem key={c} value={c}>Class {c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fee Type</Label>
                <Select value={form.fee_type} onValueChange={handleFeeTypeChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FEE_TYPES.map((ft) => <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Display Label</Label>
              <Input value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="e.g. Tuition Fee" />
            </div>
            <div>
              <Label>Amount (Rs.)</Label>
              <Input type="number" value={form.amount} onChange={(e) => set("amount", Number(e.target.value))} min={0} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Frequency</Label>
                <Select value={form.frequency} onValueChange={(v) => { set("frequency", v); set("is_recurring", v !== "one_time"); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FREQUENCIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex flex-col justify-end gap-2">
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_optional} onCheckedChange={(v) => set("is_optional", v)} />
                  <Label className="text-xs">Optional</Label>
                </div>
              </div>
            </div>

            {/* Payment Methods Section (Optional) */}
            <div className="border border-border rounded-xl p-3 space-y-3 bg-muted/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-primary" />
                  <Label className="text-sm font-semibold">Payment Methods <span className="text-muted-foreground font-normal">(Optional)</span></Label>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addPaymentMethod} className="gap-1 h-7 text-xs">
                  <Plus className="w-3 h-3" /> Add Method
                </Button>
              </div>
              
              {form.payment_methods.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No payment methods added. Students will be instructed to pay at the school office.
                </p>
              ) : (
                <div className="space-y-3">
                  {form.payment_methods.map((pm, idx) => (
                    <div key={idx} className="bg-card border border-border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Select 
                          value={pm.type} 
                          onValueChange={(v) => updatePaymentMethod(idx, "type", v)}
                          className="w-36"
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PAYMENT_METHOD_TYPES.map(pt => (
                              <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <button 
                          onClick={() => removePaymentMethod(idx)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Bank-specific fields */}
                      {pm.type === "bank" && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <Input 
                            placeholder="Bank Name (e.g. HBL)" 
                            value={pm.bank_name || ""} 
                            onChange={(e) => updatePaymentMethod(idx, "bank_name", e.target.value)}
                            className="h-8 text-xs"
                          />
                          <Input 
                            placeholder="Account Title" 
                            value={pm.account_title || ""} 
                            onChange={(e) => updatePaymentMethod(idx, "account_title", e.target.value)}
                            className="h-8 text-xs"
                          />
                          <Input 
                            placeholder="Account Number" 
                            value={pm.account_number || ""} 
                            onChange={(e) => updatePaymentMethod(idx, "account_number", e.target.value)}
                            className="h-8 text-xs"
                          />
                          <Input 
                            placeholder="IBAN (optional)" 
                            value={pm.iban || ""} 
                            onChange={(e) => updatePaymentMethod(idx, "iban", e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                      )}

                      {/* EasyPaisa/JazzCash fields */}
                      {(pm.type === "easypaisa" || pm.type === "jazzcash") && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <Input 
                            placeholder="Account Name" 
                            value={pm.account_name || ""} 
                            onChange={(e) => updatePaymentMethod(idx, "account_name", e.target.value)}
                            className="h-8 text-xs"
                          />
                          <Input 
                            placeholder="Phone Number (e.g. 0300-1234567)" 
                            value={pm.phone || ""} 
                            onChange={(e) => updatePaymentMethod(idx, "phone", e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                      )}

                      {/* Other/Custom fields */}
                      {pm.type === "other" && (
                        <div className="space-y-2">
                          <Input 
                            placeholder="Payment method name (e.g. SadaPay)" 
                            value={pm.label || ""} 
                            onChange={(e) => updatePaymentMethod(idx, "label", e.target.value)}
                            className="h-8 text-xs"
                          />
                          <Textarea 
                            placeholder="Instructions for student..." 
                            value={pm.instructions || ""} 
                            onChange={(e) => updatePaymentMethod(idx, "instructions", e.target.value)}
                            className="min-h-[50px] text-xs"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} {editing ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Vouchers Tab
// ═══════════════════════════════════════════════════════════════

function VouchersTab() {
  const [cls, setCls] = useState("6");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [genDialogOpen, setGenDialogOpen] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<FeeVoucher | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  // NEW: custom + bulk absence fee modals
  const [customFeeOpen, setCustomFeeOpen] = useState(false);

  // Generate form
  const [genForm, setGenForm] = useState({
    feePeriod: "monthly" as "monthly" | "quarterly",
    dueDate: "",
    lateFee: 0,
    bankName: "", accountTitle: "", accountNumber: "", iban: "",
    optionalFees: [] as string[],
  });

  // Payment form
  const [payForm, setPayForm] = useState({
    amount: 0,
    method: "cash" as "cash" | "bank" | "online" | "cheque",
    receiptNumber: "",
    paymentDate: format(new Date(), "yyyy-MM-dd"),
    notes: "",
  });
  const [paying, setPaying] = useState(false);

  const { data: vouchers = [], isLoading } = useFeeVouchers({
    classLevel: cls,
    month,
    year,
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const { data: structures = [] } = useFeeStructures(cls);
  const { data: students = [] } = useStudentsByClass(cls);
  const generateMutation = useGenerateVouchers();
  const recordPayment = useRecordPayment();
  const deleteVoucher = useDeleteVoucher();

  const filteredVouchers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vouchers.filter((v) => {
      if (q) {
        const name = v.students?.full_name?.toLowerCase() || "";
        const roll = v.students?.roll_number?.toLowerCase() || "";
        const vn = v.voucher_number.toLowerCase();
        if (!name.includes(q) && !roll.includes(q) && !vn.includes(q)) return false;
      }
      return true;
    });
  }, [vouchers, search]);

  // Summary
  const summary = useMemo(() => {
    const total = filteredVouchers.length;
    const totalAmount = filteredVouchers.reduce((s, v) => s + Number(v.total_amount) + Number(v.late_fee), 0);
    const paid = filteredVouchers.reduce((s, v) => s + Number(v.paid_amount), 0);
    const outstanding = totalAmount - paid;
    const overdue = filteredVouchers.filter((v) => v.status === "overdue").length;
    return { total, totalAmount, paid, outstanding, overdue };
  }, [filteredVouchers]);

  const openGenerate = () => {
    // Set default due date to end of selected month
    const due = new Date(year, month, 20);
    setGenForm((p) => ({ ...p, dueDate: format(due, "yyyy-MM-dd"), optionalFees: [] }));
    setGenDialogOpen(true);
  };

  const handleGenerate = async () => {
    if (!genForm.dueDate) { toast.error("Due date required"); return; }
    try {
      const result = await generateMutation.mutateAsync({
        classLevel: cls,
        month,
        year,
        feePeriod: genForm.feePeriod,
        dueDate: genForm.dueDate,
        lateFee: genForm.lateFee,
        bankDetails: {
          bank_name: genForm.bankName || undefined,
          account_title: genForm.accountTitle || undefined,
          account_number: genForm.accountNumber || undefined,
          iban: genForm.iban || undefined,
        },
        optionalFees: genForm.optionalFees,
      });
      toast.success(`Generated ${result?.length || 0} vouchers for Class ${cls}`);
      setGenDialogOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Generation failed");
    }
  };

  const openPayment = (v: FeeVoucher) => {
    setSelectedVoucher(v);
    const remaining = Number(v.total_amount) + Number(v.late_fee) - Number(v.paid_amount);
    setPayForm({
      amount: remaining,
      method: "cash",
      receiptNumber: "",
      paymentDate: format(new Date(), "yyyy-MM-dd"),
      notes: "",
    });
    setPayDialogOpen(true);
  };

  const handlePayment = async () => {
    if (!selectedVoucher || payForm.amount <= 0) { toast.error("Enter a valid amount"); return; }
    setPaying(true);
    try {
      await recordPayment.mutateAsync({
        voucherId: selectedVoucher.id,
        studentId: selectedVoucher.student_id,
        amount: payForm.amount,
        paymentMethod: payForm.method,
        receiptNumber: payForm.receiptNumber || undefined,
        paymentDate: payForm.paymentDate,
        notes: payForm.notes || undefined,
      });
      toast.success("Payment recorded");
      setPayDialogOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Payment failed");
    }
    setPaying(false);
  };

  const handleDownloadVoucher = (v: FeeVoucher) => {
    generateVoucherPDF(v, v.students?.full_name || "", v.students?.roll_number || "");
  };

  const handleDeleteVoucher = async (v: FeeVoucher) => {
    if (!confirm(`Delete voucher ${v.voucher_number} for ${v.students?.full_name || "this student"}? This cannot be undone.`)) return;
    try {
      await deleteVoucher.mutateAsync(v.id);
      toast.success("Voucher deleted");
    } catch (err: any) {
      toast.error(err?.message || "Delete failed");
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {CLASSES.map((c) => (
            <button key={c} onClick={() => setCls(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${cls === c ? "bg-primary text-white" : "bg-secondary text-muted-foreground"}`}>
              Class {c}
            </button>
          ))}
        </div>
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m.slice(0, 3)}</SelectItem>)}</SelectContent>
        </Select>
        <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-20 text-sm" min={2000} max={2099} />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="waived">Waived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Search + Generate */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[10rem]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, roll, voucher #…" className="pl-8 h-9" />
        </div>
        <Button size="sm" className="gap-1.5" onClick={openGenerate}>
          <Plus className="w-3.5 h-3.5" /> Generate Vouchers
        </Button>
        {/* Add custom fee to a single student (covers absence fees too) */}
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCustomFeeOpen(true)} title="Add a one-off fee to a single student (absence, fine, etc.)">
          <UserCircle className="w-3.5 h-3.5" /> Custom Fee
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <MiniStat label="Total Vouchers" value={summary.total} icon={<FileText className="w-3.5 h-3.5" />} tone="primary" />
        <MiniStat label="Total Amount" value={`Rs.${summary.totalAmount.toLocaleString()}`} icon={<CircleDollarSign className="w-3.5 h-3.5" />} tone="muted" />
        <MiniStat label="Collected" value={`Rs.${summary.paid.toLocaleString()}`} icon={<CheckCircle className="w-3.5 h-3.5" />} tone="success" />
        <MiniStat label="Outstanding" value={`Rs.${summary.outstanding.toLocaleString()}`} icon={<AlertTriangle className="w-3.5 h-3.5" />} tone="destructive" />
        <MiniStat label="Overdue" value={summary.overdue} icon={<Clock className="w-3.5 h-3.5" />} tone="destructive" />
      </div>

      {/* Voucher List */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : filteredVouchers.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-10 text-center">
          <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm font-semibold text-foreground">No vouchers found</p>
          <p className="text-xs text-muted-foreground mt-1">Generate vouchers for this class and period.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredVouchers.map((v) => {
            const remaining = Number(v.total_amount) + Number(v.late_fee) - Number(v.paid_amount);
            return (
              <Card key={v.id} className="border-border">
                <CardContent className="p-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Student avatar */}
                      {v.students?.photo_url ? (
                        <img src={v.students.photo_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0">
                          {v.students?.full_name?.charAt(0) || "?"}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm truncate">{v.students?.full_name}</p>
                          <StatusBadge status={v.status} />
                          <span className="text-[10px] text-muted-foreground font-mono">{v.voucher_number}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          <span>#{v.students?.roll_number}</span>
                          <span>Class {v.class}</span>
                          <span>{MONTHS[v.month - 1]} {v.year}</span>
                          <span>Due: {format(new Date(v.due_date), "dd MMM")}</span>
                        </div>
                        {v.status !== "paid" && v.status !== "waived" && remaining > 0 && (
                          <div className="mt-1.5">
                            <Progress value={(Number(v.paid_amount) / (Number(v.total_amount) + Number(v.late_fee))) * 100} className="h-1.5" />
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Rs. {Number(v.paid_amount).toLocaleString()} / Rs. {(Number(v.total_amount) + Number(v.late_fee)).toLocaleString()}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      <div className="text-right shrink-0">
                        <p className="text-lg font-black text-foreground">Rs. {Number(v.total_amount).toLocaleString()}</p>
                        {v.late_fee > 0 && <p className="text-[10px] text-destructive">+Rs.{Number(v.late_fee).toLocaleString()} late</p>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setSelectedVoucher(v); setViewDialogOpen(true); }} title="View Details">
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDeleteVoucher(v)} title="Delete Voucher">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Generate Vouchers Dialog */}
      <Dialog open={genDialogOpen} onOpenChange={setGenDialogOpen}>
        <DialogContent className="max-w-md w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" /> Generate Vouchers — Class {cls}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">
              This will create fee vouchers for <strong>{students.length} active student(s)</strong> in Class {cls} for {MONTHS[month - 1]} {year}.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fee Period</Label>
                <Select value={genForm.feePeriod} onValueChange={(v) => setGenForm((p) => ({ ...p, feePeriod: v as "monthly" | "quarterly" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Due Date *</Label>
                <Input type="date" value={genForm.dueDate} onChange={(e) => setGenForm((p) => ({ ...p, dueDate: e.target.value }))} />
              </div>
            </div>

            <div>
              <Label>Late Fee (Rs.)</Label>
              <Input type="number" value={genForm.lateFee} onChange={(e) => setGenForm((p) => ({ ...p, lateFee: Number(e.target.value) }))} min={0} />
            </div>

            {/* Bank Details */}
            <div className="space-y-2 border border-border rounded-xl p-3">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Bank Details (optional)</p>
              <Input placeholder="Bank Name" value={genForm.bankName} onChange={(e) => setGenForm((p) => ({ ...p, bankName: e.target.value }))} />
              <Input placeholder="Account Title" value={genForm.accountTitle} onChange={(e) => setGenForm((p) => ({ ...p, accountTitle: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Account Number" value={genForm.accountNumber} onChange={(e) => setGenForm((p) => ({ ...p, accountNumber: e.target.value }))} />
                <Input placeholder="IBAN" value={genForm.iban} onChange={(e) => setGenForm((p) => ({ ...p, iban: e.target.value }))} />
              </div>
            </div>

            {/* Fee items preview */}
            {structures.length > 0 && (
              <div className="border border-border rounded-xl p-3">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Fee Items</p>
                <div className="space-y-1.5">
                  {structures
                    .filter((s) => {
                      if (s.frequency === "one_time") return false;
                      if (genForm.feePeriod === "monthly" && s.frequency === "monthly") return true;
                      if (genForm.feePeriod === "quarterly") return true;
                      return false;
                    })
                    .map((s) => (
                      <div key={s.id} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          {s.is_optional && (
                            <input
                              type="checkbox"
                              checked={genForm.optionalFees.includes(s.fee_type)}
                              onChange={(e) => {
                                setGenForm((p) => ({
                                  ...p,
                                  optionalFees: e.target.checked
                                    ? [...p.optionalFees, s.fee_type]
                                    : p.optionalFees.filter((f) => f !== s.fee_type),
                                }));
                              }}
                              className="rounded"
                            />
                          )}
                          <span className={s.is_optional ? "text-muted-foreground" : "text-foreground"}>
                            {s.label} {s.is_optional && "(optional)"}
                          </span>
                        </div>
                        <span className="font-semibold">Rs. {Number(s.amount).toLocaleString()}</span>
                      </div>
                    ))}
                  <div className="border-t border-border pt-1.5 flex items-center justify-between text-sm font-bold">
                    <span>Total per student</span>
                    <span>Rs. {structures
                      .filter((s) => {
                        if (s.frequency === "one_time") return false;
                        if (genForm.feePeriod === "monthly" && s.frequency === "monthly") return true;
                        if (genForm.feePeriod === "quarterly") return true;
                        return false;
                      })
                      .reduce((sum, s) => sum + (s.is_optional && !genForm.optionalFees.includes(s.fee_type) ? 0 : Number(s.amount)), 0)
                      .toLocaleString()
                    }</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setGenDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleGenerate} disabled={generateMutation.isPending} className="gap-1.5">
              {generateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Generate for {students.length} Student(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="max-w-md w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-green-600" /> Record Payment
            </DialogTitle>
          </DialogHeader>
          {selectedVoucher && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-xl p-3">
                <p className="font-semibold text-sm">{selectedVoucher.students?.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  #{selectedVoucher.students?.roll_number} | {selectedVoucher.voucher_number} | Rs. {Number(selectedVoucher.total_amount).toLocaleString()}
                </p>
                {selectedVoucher.paid_amount > 0 && (
                  <p className="text-xs text-green-600 mt-1">
                    Already paid: Rs. {Number(selectedVoucher.paid_amount).toLocaleString()}
                  </p>
                )}
                {selectedVoucher.late_fee > 0 && (
                  <p className="text-xs text-destructive mt-0.5">
                    Late fee: Rs. {Number(selectedVoucher.late_fee).toLocaleString()}
                  </p>
                )}
              </div>

              <div>
                <Label>Amount (Rs.) *</Label>
                <Input type="number" value={payForm.amount} onChange={(e) => setPayForm((p) => ({ ...p, amount: Number(e.target.value) }))} min={0} />
              </div>

              <div>
                <Label>Payment Method</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {PAYMENT_METHODS.map((pm) => (
                    <button
                      key={pm.value}
                      onClick={() => setPayForm((p) => ({ ...p, method: pm.value as any }))}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition-all ${
                        payForm.method === pm.value ? "border-primary bg-primary/10 text-primary ring-1 ring-primary" : "border-border hover:border-primary/40"
                      }`}
                    >
                      <pm.icon className={`w-4 h-4 ${pm.color}`} />
                      {pm.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Receipt Number</Label>
                  <Input value={payForm.receiptNumber} onChange={(e) => setPayForm((p) => ({ ...p, receiptNumber: e.target.value }))} placeholder="Auto-generated if empty" />
                </div>
                <div>
                  <Label>Payment Date</Label>
                  <Input type="date" value={payForm.paymentDate} onChange={(e) => setPayForm((p) => ({ ...p, paymentDate: e.target.value }))} />
                </div>
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea value={payForm.notes} onChange={(e) => setPayForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Optional notes…" rows={2} />
              </div>
            </div>
          )}
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>Cancel</Button>
            <Button onClick={handlePayment} disabled={paying} className="gap-1.5 bg-green-600 hover:bg-green-700 text-white">
              {paying && <Loader2 className="w-4 h-4 animate-spin" />} Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Voucher Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-md w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Voucher Details</DialogTitle>
          </DialogHeader>
          {selectedVoucher && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono text-muted-foreground">{selectedVoucher.voucher_number}</span>
                <StatusBadge status={selectedVoucher.status} />
              </div>
              <div className="bg-muted/50 rounded-xl p-3">
                <p className="font-semibold">{selectedVoucher.students?.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  Roll #{selectedVoucher.students?.roll_number} | Class {selectedVoucher.class}
                </p>
                {selectedVoucher.students?.father_name && (
                  <p className="text-xs text-muted-foreground">Father: {selectedVoucher.students.father_name}</p>
                )}
                {selectedVoucher.students?.contact_number && (
                  <p className="text-xs text-muted-foreground">Contact: {selectedVoucher.students.contact_number}</p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Fee Breakdown</p>
                {(selectedVoucher.fee_items as FeeItem[]).map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span>{item.label}</span>
                    <span className="font-semibold">Rs. {Number(item.amount).toLocaleString()}</span>
                  </div>
                ))}
                {selectedVoucher.late_fee > 0 && (
                  <div className="flex justify-between text-sm text-destructive">
                    <span>Late Fee</span>
                    <span className="font-semibold">Rs. {Number(selectedVoucher.late_fee).toLocaleString()}</span>
                  </div>
                )}
                <div className="border-t border-border pt-1.5 flex justify-between font-bold">
                  <span>Total</span>
                  <span>Rs. {(Number(selectedVoucher.total_amount) + Number(selectedVoucher.late_fee)).toLocaleString()}</span>
                </div>
                {selectedVoucher.paid_amount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Paid</span>
                    <span className="font-semibold">Rs. {Number(selectedVoucher.paid_amount).toLocaleString()}</span>
                  </div>
                )}
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>Period: {MONTHS[selectedVoucher.month - 1]} {selectedVoucher.year} ({selectedVoucher.fee_period})</p>
                <p>Due Date: {format(new Date(selectedVoucher.due_date), "dd MMMM yyyy")}</p>
                {selectedVoucher.notes && <p>Notes: {selectedVoucher.notes}</p>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1.5 flex-1" onClick={() => handleDownloadVoucher(selectedVoucher)}>
                  <Download className="w-3.5 h-3.5" /> Download PDF
                </Button>
                {selectedVoucher.status !== "paid" && selectedVoucher.status !== "waived" && (
                  <Button size="sm" className="gap-1.5 flex-1 bg-green-600 hover:bg-green-700" onClick={() => { setViewDialogOpen(false); openPayment(selectedVoucher); }}>
                    <Wallet className="w-3.5 h-3.5" /> Record Payment
                  </Button>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => { setViewDialogOpen(false); handleDeleteVoucher(selectedVoucher); }}
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Voucher
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Custom Fee Modal — add one-off fee to a single student */}
      <CustomFeeModal
        open={customFeeOpen}
        onClose={() => setCustomFeeOpen(false)}
        defaultClass={cls}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Payments Tab
// ═══════════════════════════════════════════════════════════════

function PaymentsTab() {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [search, setSearch] = useState("");

  const { data: payments = [], isLoading, error } = useFeePayments({ month, year });

  const filtered = useMemo(() => {
    if (!Array.isArray(payments)) return [];
    const q = search.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter((p) => {
      const name = p.students?.full_name?.toLowerCase() || "";
      const roll = p.students?.roll_number?.toLowerCase() || "";
      const receipt = p.receipt_number?.toLowerCase() || "";
      return name.includes(q) || roll.includes(q) || receipt.includes(q);
    });
  }, [payments, search]);

  const totalCollected = filtered.reduce((s, p) => s + Number(p.amount) || 0, 0);

  // Safe date formatter — never throws, even on null/undefined/invalid dates
  const safeFormatDate = (dateStr: string | null | undefined): string => {
    try {
      if (!dateStr) return "—";
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "—";
      return format(d, "dd MMM yyyy");
    } catch {
      return "—";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-20 text-sm" min={2000} max={2099} />
        <div className="relative flex-1 min-w-[10rem]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search payments…" className="pl-8 h-9" />
        </div>
        <Badge variant="secondary" className="gap-1 text-xs">
          <CircleDollarSign className="w-3 h-3" /> Total: Rs. {totalCollected.toLocaleString()}
        </Badge>
      </div>

      {/* Error state — show clear error message instead of crashing */}
      {error ? (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-foreground">Couldn't load payments</p>
          <p className="text-xs text-muted-foreground mt-1">
            {error?.message || "There was a problem fetching payment records. Try refreshing."}
          </p>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-10 text-center">
          <Wallet className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm font-semibold">No payments recorded for this period</p>
          <p className="text-xs text-muted-foreground mt-1">
            Payments you record from the Vouchers tab will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <Card key={p.id} className="border-border">
              <CardContent className="p-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center shrink-0">
                    {(() => {
                      const Icon = PAYMENT_METHODS.find((m) => m.value === p.payment_method)?.icon || Wallet;
                      return <Icon className="w-5 h-5 text-green-600" />;
                    })()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{p.students?.full_name || "Unknown student"}</p>
                      <Badge variant="outline" className="text-[10px]">{p.payment_method || "—"}</Badge>
                      {p.receipt_number && <span className="text-[10px] text-muted-foreground font-mono">{p.receipt_number}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      #{p.students?.roll_number || "—"} | Class {p.students?.class || "—"} | {safeFormatDate(p.payment_date)}
                    </p>
                    {p.notes && <p className="text-[10px] text-muted-foreground italic mt-0.5">{p.notes}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-black text-green-600">Rs. {Number(p.amount || 0).toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">{p.fee_vouchers?.voucher_number || "—"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Reports Tab
// ═══════════════════════════════════════════════════════════════

function ReportsTab() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [reportType, setReportType] = useState<"collection" | "class" | "defaulters">("collection");

  const { data: collectionReport = [], isLoading: loadingCollection } = useFeeCollectionReport(year);
  const { data: classSummary = [], isLoading: loadingClass } = useClassCollectionSummary(year);
  const { data: defaulters = [], isLoading: loadingDefaulters } = useFeeDefaulters();

  const handleExportDefaulterList = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Fee Defaulters List", 14, 16);
    doc.setFontSize(9);
    doc.text(`Generated: ${format(new Date(), "dd MMMM yyyy")}`, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [["#", "Student Name", "Roll No", "Class", "Outstanding (Rs.)", "Overdue Vouchers", "Last Payment"]],
      body: defaulters.map((d, i) => [
        i + 1, d.full_name, d.roll_number, `Class ${d.class}`,
        d.outstanding.toLocaleString(), d.overdue_count,
        d.last_payment_date ? format(new Date(d.last_payment_date), "dd MMM yyyy") : "Never",
      ]),
      headStyles: { fillColor: [220, 38, 38] },
      styles: { fontSize: 8 },
    });
    doc.save(`Defaulters-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    toast.success("PDF downloaded");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={reportType} onValueChange={(v) => setReportType(v as any)} className="max-w-full">
          <TabsList className="w-full sm:w-auto overflow-x-auto flex-nowrap justify-start">
            <TabsTrigger value="collection" className="gap-1.5 text-xs shrink-0"><BarChart3 className="w-3.5 h-3.5" /> Monthly Collection</TabsTrigger>
            <TabsTrigger value="class" className="gap-1.5 text-xs shrink-0"><Users className="w-3.5 h-3.5" /> Class-wise</TabsTrigger>
            <TabsTrigger value="defaulters" className="gap-1.5 text-xs shrink-0"><UserX className="w-3.5 h-3.5" /> Defaulters</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="ml-auto flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Year:</Label>
          <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-20 text-sm" min={2000} max={2099} />
        </div>
      </div>

      {/* Collection Report */}
      {reportType === "collection" && (
        <>
          {loadingCollection ? <Skeleton className="h-64 rounded-xl" /> : collectionReport.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-10 text-center">
              <BarChart3 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm font-semibold">No collection data for {year}</p>
            </div>
          ) : (
            <>
              <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" /> Monthly Collection — {year}
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={collectionReport.filter((r) => r.total_vouchers > 0)} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={(v: number) => MONTHS[v - 1]?.slice(0, 3) || v} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="collected" name="Collected" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="outstanding" name="Outstanding" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                <div className="bg-primary text-white px-4 py-3 font-bold text-sm">
                  Collection Summary — {year}
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Month</TableHead>
                        <TableHead className="text-xs text-center">Vouchers</TableHead>
                        <TableHead className="text-xs text-right">Billed</TableHead>
                        <TableHead className="text-xs text-right">Collected</TableHead>
                        <TableHead className="text-xs text-right">Outstanding</TableHead>
                        <TableHead className="text-xs text-center">Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {collectionReport.filter((r) => r.total_vouchers > 0).map((r) => (
                        <TableRow key={r.month}>
                          <TableCell className="font-medium text-sm">{MONTHS[r.month - 1]}</TableCell>
                          <TableCell className="text-center text-sm">{r.total_vouchers}</TableCell>
                          <TableCell className="text-right text-sm">Rs. {r.total_amount.toLocaleString()}</TableCell>
                          <TableCell className="text-right text-sm text-green-600 font-semibold">Rs. {r.collected.toLocaleString()}</TableCell>
                          <TableCell className="text-right text-sm text-destructive font-semibold">Rs. {r.outstanding.toLocaleString()}</TableCell>
                          <TableCell className="text-center">
                            <Badge className={
                              r.collection_rate >= 80 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : r.collection_rate >= 50 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            }>
                              {r.collection_rate}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Class-wise Summary */}
      {reportType === "class" && (
        <>
          {loadingClass ? <Skeleton className="h-64 rounded-xl" /> : classSummary.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-10 text-center">
              <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm font-semibold">No class-wise data for {year}</p>
            </div>
          ) : (
            <>
              <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" /> Class-wise Collection — {year}
                </h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={classSummary} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="class" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="total_collected" name="Collected" radius={[4, 4, 0, 0]}>
                      {classSummary.map((c, i) => <Cell key={i} fill={CLASS_COLORS[c.class] || "#6366f1"} />)}
                    </Bar>
                    <Bar dataKey="total_outstanding" name="Outstanding" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {classSummary.map((c) => (
                  <Card key={c.class} className="border-border">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-bold text-sm">Class {c.class}</p>
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CLASS_COLORS[c.class] }} />
                      </div>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between"><span className="text-muted-foreground">Students</span><span className="font-semibold">{c.total_students}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Billed</span><span className="font-semibold">Rs. {c.total_billed.toLocaleString()}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Collected</span><span className="font-semibold text-green-600">Rs. {c.total_collected.toLocaleString()}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Outstanding</span><span className="font-semibold text-destructive">Rs. {c.total_outstanding.toLocaleString()}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Defaulters</span><span className="font-semibold">{c.defaulters_count}</span></div>
                      </div>
                      <div className="mt-2">
                        <Progress value={c.collection_rate} className="h-2" />
                        <p className="text-[10px] text-muted-foreground mt-0.5">{c.collection_rate}% collected</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Defaulters List */}
      {reportType === "defaulters" && (
        <>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportDefaulterList}>
              <Download className="w-3.5 h-3.5" /> Export PDF
            </Button>
          </div>
          {loadingDefaulters ? <Skeleton className="h-64 rounded-xl" /> : defaulters.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-10 text-center">
              <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-green-600">No defaulters!</p>
              <p className="text-xs text-muted-foreground mt-1">All fees are paid or no vouchers exist.</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
              <div className="bg-destructive/10 text-destructive px-4 py-3 font-bold text-sm">
                Defaulters List — {defaulters.length} student(s) with outstanding fees
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">#</TableHead>
                      <TableHead className="text-xs">Student</TableHead>
                      <TableHead className="text-xs text-center">Outstanding</TableHead>
                      <TableHead className="text-xs text-center hidden sm:table-cell">Overdue</TableHead>
                      <TableHead className="text-xs text-center hidden md:table-cell">Last Payment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {defaulters.map((d, i) => (
                      <TableRow key={d.student_id}>
                        <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {d.photo_url ? (
                              <img src={d.photo_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">{d.full_name?.charAt(0)}</div>
                            )}
                            <div>
                              <p className="text-sm font-medium">{d.full_name}</p>
                              <p className="text-[10px] text-muted-foreground">Class {d.class} | #{d.roll_number}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-sm font-bold text-destructive">Rs. {d.outstanding.toLocaleString()}</TableCell>
                        <TableCell className="text-center hidden sm:table-cell">
                          {d.overdue_count > 0 && <Badge variant="destructive" className="text-[10px]">{d.overdue_count}</Badge>}
                        </TableCell>
                        <TableCell className="text-center hidden md:table-cell text-xs text-muted-foreground">
                          {d.last_payment_date ? format(new Date(d.last_payment_date), "dd MMM yyyy") : "Never"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tiny MiniStat Component
// ═══════════════════════════════════════════════════════════════

const toneStyles: Record<string, string> = {
  primary: "border-primary/30 bg-primary/5 text-primary",
  success: "border-green-500/30 bg-green-50 dark:bg-green-900/20 text-green-600",
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
  muted: "border-border bg-muted text-muted-foreground",
};

const MiniStat = ({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone: string }) => (
  <div className={`rounded-lg border p-3 ${toneStyles[tone] || toneStyles.muted}`}>
    <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide opacity-80">{icon}{label}</div>
    <div className="mt-1 text-lg font-bold text-foreground">{value}</div>
  </div>
);

export default AdminFees;
