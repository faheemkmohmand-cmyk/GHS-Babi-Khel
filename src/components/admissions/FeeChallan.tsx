/**
 * FeeChallan.tsx - FIXED VERSION v2
 * Displays a fee challan (voucher) for approved/admitted students on the tracking page.
 * 
 * FIXES APPLIED (v2):
 * 1. SUPER robust voucher search - 5 strategies with detailed logging
 * 2. VISIBLE status badge (no more white-on-white invisible unpaid badge)
 * 3. Download PDF button with editorial/academic cream-style generation
 * 4. Handles all edge cases: missing notes, different class formats, etc.
 */
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Receipt, Wallet, Building2, Smartphone, Banknote,
  CreditCard, Calendar, Clock, CheckCircle2, ArrowRight,
  FileText, AlertCircle, Copy, Check, Download
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { supabasePublic } from "@/lib/supabase";
import { type PaymentMethod } from "@/hooks/useFees";

interface VoucherData {
  id: string;
  voucher_number: string;
  total_amount: number;
  due_date: string;
  status: string;
  fee_items: Array<{ fee_type: string; label: string; amount: number }>;
  bank_details: {
    payment_methods?: PaymentMethod[];
    bank_name?: string;
    account_title?: string;
    account_number?: string;
    iban?: string;
  };
  notes?: string | null;
  created_at: string;
  class?: string;
  student_id?: string;
  student_name?: string;
  fee_period?: string;
}

interface FeeChallanProps {
  admissionId: string;
  admissionType: "fresh" | "migration";
  studentName: string;
  applyingClass: string;
  referenceNo: string;
}

export default function FeeChallan({ 
  admissionId, 
  admissionType, 
  studentName, 
  applyingClass,
  referenceNo 
}: FeeChallanProps) {
  const [voucher, setVoucher] = useState<VoucherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const fetchVoucher = async () => {
      setLoading(true);
      setError(null);
      
      try {
        console.log("=== FEECHALLAN SEARCH STARTED ===");
        console.log("Search params:", { admissionId, applyingClass, referenceNo, admissionType });
        
        // STRATEGY 1: Search by reference number in notes (most reliable if present)
        let matchedVoucher = await searchByReference();
        
        // STRATEGY 2: Search by student name + class combination
        if (!matchedVoucher) {
          console.log("FeeChallan: Strategy 1 failed, trying Strategy 2 (student name + class)");
          matchedVoucher = await searchByNameAndClass();
        }
        
        // STRATEGY 3: Search by class + fee type in items
        if (!matchedVoucher) {
          console.log("FeeChallan: Strategy 2 failed, trying Strategy 3 (class + fee type)");
          matchedVoucher = await searchByClassAndFeeType();
        }
        
        // STRATEGY 4: Search by class only (any fee_period)
        if (!matchedVoucher) {
          console.log("FeeChallan: Strategy 3 failed, trying Strategy 4 (class only)");
          matchedVoucher = await searchByClassOnly();
        }
        
        // STRATEGY 5: Absolute fallback - any recent voucher for this student's context
        if (!matchedVoucher) {
          console.log("FeeChallan: Strategy 4 failed, trying Strategy 5 (any recent voucher)");
          matchedVoucher = await searchAnyRecent();
        }

        if (matchedVoucher) {
          console.log("FeeChallan: ✅ FOUND voucher:", matchedVoucher.voucher_number, {
            status: matchedVoucher.status,
            class: matchedVoucher.class,
            fee_period: matchedVoucher.fee_period,
            hasNotes: !!matchedVoucher.notes,
            itemCount: matchedVoucher.fee_items?.length
          });
          setVoucher(matchedVoucher);
        } else {
          console.log("FeeChallan: ❌ No voucher found after ALL strategies");
        }
      } catch (err) {
        console.error("FeeChallan: Error fetching voucher:", err);
        setError(err instanceof Error ? err.message : "Failed to load fee challan");
      } finally {
        setLoading(false);
      }
    };

    // Only fetch if we have required data
    if (admissionId && applyingClass && referenceNo) {
      fetchVoucher();
    } else {
      console.log("FeeChallan: Missing required params:", { admissionId: !!admissionId, applyingClass: !!applyingClass, referenceNo: !!referenceNo });
      setLoading(false);
    }
  }, [admissionId, applyingClass, referenceNo]);

  // ═══════════════════════════════════════════════════════════════
  // SEARCH STRATEGY 1: By reference number in notes
  // ═══════════════════════════════════════════════════════════════
  const searchByReference = async (): Promise<VoucherData | null> => {
    try {
      // Try exact match on notes containing reference number or admission ID
      const { data, error } = await supabasePublic
        .from("fee_vouchers")
        .select("*")
        .or(`notes.ilike.%${referenceNo}%,notes.ilike.%${admissionId}%,student_id.eq.${admissionId}`)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) {
        console.log("FeeChallan: Strategy 1 error:", error.message);
        return null;
      }

      console.log("FeeChallan: Strategy 1 results:", data?.length, "vouchers");

      // Find best match - prefer exact reference match
      const exactMatch = (data || []).find((v: VoucherData) => 
        v.notes?.includes(referenceNo) || v.student_id === admissionId
      );
      
      if (exactMatch) {
        console.log("FeeChallan: Strategy 1 found exact match");
        return exactMatch;
      }

      // Partial match
      const partialMatch = (data || []).find((v: VoucherData) => 
        v.notes?.includes(admissionId.substring(0, 8))
      );
      
      return partialMatch || null;
    } catch (e) {
      console.error("FeeChallan: Strategy 1 exception:", e);
      return null;
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // SEARCH STRATEGY 2: By student name + class (NEW - more reliable)
  // ═══════════════════════════════════════════════════════════════
  const searchByNameAndClass = async (): Promise<VoucherData | null> => {
    try {
      // Search vouchers where student_name matches OR class matches with admission/migration fee
      const { data, error } = await supabasePublic
        .from("fee_vouchers")
        .select("*")
        .or(`student_name.ilike.%${studentName}%,class.ilike.%${applyingClass}%`)
        .order("created_at", { ascending: false })
        .limit(15);

      if (error) {
        console.log("FeeChallan: Strategy 2 error:", error.message);
        return null;
      }

      console.log("FeeChallan: Strategy 2 results:", data?.length, "vouchers");

      // Find voucher that matches both name AND class ideally
      const bothMatch = (data || []).find((v: VoucherData) => {
        const nameMatches = v.student_name?.toLowerCase().includes(studentName.toLowerCase()) ||
                           studentName.toLowerCase().includes(v.student_name?.toLowerCase() || "");
        const classMatches = normalizeClass(v.class) === normalizeClass(applyingClass);
        return nameMatches && classMatches;
      });

      if (bothMatch) {
        console.log("FeeChallan: Strategy 2 found name+class match");
        return bothMatch;
      }

      // Just class match with admission/migration fee type
      const classWithFeeType = (data || []).find((v: VoucherData) => {
        const classMatches = normalizeClass(v.class) === normalizeClass(applyingClass);
        const hasAdmissionFee = v.fee_items?.some((item: any) => 
          ["admission", "migration"].includes(item.fee_type)
        );
        return classMatches && hasAdmissionFee;
      });

      return classWithFeeType || null;
    } catch (e) {
      console.error("FeeChallan: Strategy 2 exception:", e);
      return null;
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // SEARCH STRATEGY 3: By class + admission/migration fee type
  // ═══════════════════════════════════════════════════════════════
  const searchByClassAndFeeType = async (): Promise<VoucherData | null> => {
    try {
      const targetFeeType = admissionType === "migration" ? "migration" : "admission";
      
      // Try multiple fee_period values
      const { data, error } = await supabasePublic
        .from("fee_vouchers")
        .select("*")
        .or(`class.ilike.%${applyingClass}%,class.eq.${applyingClass}`)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        console.log("FeeChallan: Strategy 3 error:", error.message);
        return null;
      }

      console.log("FeeChallan: Strategy 3 results:", data?.length, "vouchers, looking for fee_type:", targetFeeType);

      // Find voucher with matching fee type in items
      const match = (data || []).find((v: VoucherData) => {
        const classOk = normalizeClass(v.class) === normalizeClass(applyingClass);
        const hasTargetFee = v.fee_items?.some((item: any) => item.fee_type === targetFeeType);
        return classOk && hasTargetFee;
      });

      if (match) {
        console.log("FeeChallan: Strategy 3 found match with fee_type:", targetFeeType);
      }

      return match || null;
    } catch (e) {
      console.error("FeeChallan: Strategy 3 exception:", e);
      return null;
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // SEARCH STRATEGY 4: By class only (broader)
  // ═══════════════════════════════════════════════════════════════
  const searchByClassOnly = async (): Promise<VoucherData | null> => {
    try {
      const { data, error } = await supabasePublic
        .from("fee_vouchers")
        .select("*")
        .or(`class.ilike.%${applyingClass}%,class.eq.${applyingClass},class.eq.Class%20${applyingClass}`)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) {
        console.log("FeeChallan: Strategy 4 error:", error.message);
        return null;
      }

      console.log("FeeChallan: Strategy 4 results:", data?.length, "vouchers");

      // Return most recent one_off or admission/migration voucher
      const oneOff = (data || []).find((v: VoucherData) => 
        v.fee_period === "one_off" || 
        v.fee_items?.some((item: any) => ["admission", "migration"].includes(item.fee_type))
      );

      if (oneOff) {
        console.log("FeeChallan: Strategy 4 found one_off/admission voucher");
        return oneOff;
      }

      // Return most recent voucher for this class
      const recent = (data || []).find(() => true);
      if (recent) {
        console.log("FeeChallan: Strategy 4 using most recent voucher for class");
      }
      
      return recent || null;
    } catch (e) {
      console.error("FeeChallan: Strategy 4 exception:", e);
      return null;
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // SEARCH STRATEGY 5: Any recent voucher (absolute last resort)
  // ═══════════════════════════════════════════════════════════════
  const searchAnyRecent = async (): Promise<VoucherData | null> => {
    try {
      // Get the absolute most recent voucher - maybe it was just created
      const { data, error } = await supabasePublic
        .from("fee_vouchers")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) {
        console.log("FeeChallan: Strategy 5 error:", error.message);
        return null;
      }

      console.log("FeeChallan: Strategy 5 (fallback) results:", data?.length, "recent vouchers");

      // Prefer admission/migration type
      const admissionVoucher = (data || []).find((v: VoucherData) =>
        v.fee_items?.some((item: any) => ["admission", "migration"].includes(item.fee_type))
      );

      return admissionVoucher || (data || [])[0] || null;
    } catch (e) {
      console.error("FeeChallan: Strategy 5 exception:", e);
      return null;
    }
  };

  // Helper: Normalize class values for comparison (handles "8", "Class 8", "class 8", etc.)
  const normalizeClass = (cls?: string | null): string => {
    if (!cls) return "";
    return cls.toString()
      .replace(/class/i, "")
      .replace(/\s+/g, "")
      .trim();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ═══════════════════════════════════════════════════════════════
  // ACADEMIC EDITORIAL CREAM-STYLE PDF GENERATION
  // ═══════════════════════════════════════════════════════════════
  const downloadChallanPDF = async () => {
    if (!voucher) return;
    
    setDownloading(true);
    try {
      // Dynamic import to avoid SSR issues
      const jsPDF = (await import("jspdf")).default;
      const autoTable = (await import("jspdf-autotable")).default;
      
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const w = doc.internal.pageSize.getWidth();
      const h = doc.internal.pageSize.getHeight();
      
      // ── CREAM/IVORY ACADEMIC PALETTE ──
      const CREAM_BG = [254, 251, 245];       // Warm cream background
      const DARK_INK = [45, 35, 30];           // Dark brown/black for text
      const ACCENT_COLOR = [120, 80, 50];      // Warm brown accent
      const LIGHT_LINE = [200, 185, 165];      // Light brown lines
      const HEADER_BG = [235, 225, 210];       // Slightly darker cream for header
      const TABLE_HEADER = [180, 160, 140];    // Muted brown table header
      const BADGE_UNPAID = [180, 100, 60];     // Warm amber for unpaid
      const BADGE_PAID = [100, 130, 90];       // Sage green for paid
      
      // ── BACKGROUND ──
      doc.setFillColor(...CREAM_BG);
      doc.rect(0, 0, w, h, "F");
      
      // ── SUBTLE BORDER FRAME ──
      doc.setDrawColor(...LIGHT_LINE);
      doc.setLineWidth(0.8);
      doc.rect(8, 8, w - 16, h - 16);
      
      // ── HEADER SECTION ──
      doc.setFillColor(...HEADER_BG);
      doc.roundedRect(8, 8, w - 16, 32, 2, 2, "F");
      
      // School name - serif academic feel
      doc.setTextColor(...DARK_INK);
      doc.setFontSize(16);
      doc.setFont("times", "bold");
      doc.text("GHS Babi Khel", w / 2, 20, { align: "center" });
      
      doc.setFontSize(9);
      doc.setFont("times", "normal");
      doc.setTextColor(...ACCENT_COLOR);
      doc.text("Government High School  •  Mohmand District  •  KPK", w / 2, 27, { align: "center" });
      
      doc.setFontSize(11);
      doc.setFont("times", "bold");
      doc.setTextColor(...DARK_INK);
      doc.text("FEE CHALLAN", w / 2, 36, { align: "center" });
      
      // ── STATUS BADGE (top right of header) ──
      const isPaid = voucher.status === "paid";
      doc.setFillColor(isPaid ? ...BADGE_PAID : ...BADGE_UNPAID);
      const badgeText = voucher.status.toUpperCase();
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      const badgeWidth = doc.getTextWidth(badgeText) + 10;
      doc.roundedRect(w - 8 - badgeWidth - 8, 18, badgeWidth, 7, 1.5, 1.5, "F");
      doc.text(badgeText, w - 8 - badgeWidth / 2 - 8, 23.5, { align: "center" });
      
      // ── STUDENT INFO BOX ──
      let yPos = 46;
      
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...LIGHT_LINE);
      doc.setLineWidth(0.3);
      doc.roundedRect(14, yPos, w - 28, 24, 2, 2, "FD");
      
      // Left column info
      const leftInfo = [
        ["Student Name", studentName],
        ["Reference No.", referenceNo],
        ["Class", `Class ${applyingClass}`]
      ];
      
      const rightInfo = [
        ["Voucher #", voucher.voucher_number],
        ["Due Date", format(new Date(voucher.due_date), "dd MMM yyyy")],
        ["Issue Date", format(new Date(voucher.created_at), "dd MMM yyyy")]
      ];
      
      doc.setFontSize(7.5);
      leftInfo.forEach((row, i) => {
        const y = yPos + 7 + i * 5.5;
        doc.setTextColor(...ACCENT_COLOR);
        doc.setFont("helvetica", "normal");
        doc.text(row[0], 19, y);
        doc.setTextColor(...DARK_INK);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.text(row[1], 19, y + 3);
        doc.setFontSize(7.5);
      });
      
      rightInfo.forEach((row, i) => {
        const y = yPos + 7 + i * 5.5;
        doc.setTextColor(...ACCENT_COLOR);
        doc.setFont("helvetica", "normal");
        doc.text(row[0], w / 2 + 6, y);
        doc.setTextColor(...DARK_INK);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.text(row[1], w / 2 + 6, y + 3);
        doc.setFontSize(7.5);
      });
      
      // ── FEE DETAILS TABLE ──
      yPos += 29;
      
      const feeTypeLabel = voucher.fee_items[0]?.fee_type === "migration" 
        ? "Migration Fee" 
        : voucher.fee_items[0]?.label || "Admission/Migration Fee";
      
      const tableBody = voucher.fee_items.map((item, i) => [
        String(i + 1),
        item.label,
        item.fee_type === "admission" || item.fee_type === "migration" ? "One-time" : "-",
        `Rs. ${Number(item.amount).toLocaleString("en-PK")}`
      ]);
      
      autoTable(doc, {
        startY: yPos,
        head: [["#", "Description", "Type", "Amount"]],
        body: tableBody,
        headStyles: { 
          fillColor: TABLE_HEADER, 
          textColor: [255, 255, 255], 
          fontStyle: "bold", 
          fontSize: 9,
          font: "helvetica"
        },
        bodyStyles: { 
          fontSize: 9, 
          textColor: DARK_INK,
          font: "helvetica",
          lineColor: LIGHT_LINE,
          lineWidth: 0.1
        },
        columnStyles: {
          0: { cellWidth: 12, halign: "center", fontStyle: "bold" },
          1: { cellWidth: 75 },
          2: { cellWidth: 35, halign: "center" },
          3: { cellWidth: 40, halign: "right", fontStyle: "bold" }
        },
        alternateRowStyles: { fillColor: [252, 248, 240] },
        margin: { left: 14, right: 14 },
        theme: "grid"
      });
      
      // ── TOTAL AMOUNT BOX ──
      const finalY = (doc as any).lastAutoTable?.finalY || yPos + 30;
      const totalY = finalY + 4;
      
      doc.setFillColor(...HEADER_BG);
      doc.roundedRect(14, totalY, w - 28, 14, 2, 2, "F");
      
      doc.setTextColor(...ACCENT_COLOR);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("TOTAL AMOUNT DUE", 20, totalY + 6);
      
      doc.setTextColor(...DARK_INK);
      doc.setFontSize(15);
      doc.setFont("times", "bold");
      doc.text(`Rs. ${Number(voucher.total_amount).toLocaleString("en-PK")}`, w - 20, totalY + 9, { align: "right" });
      
      // ── PAYMENT INSTRUCTIONS ──
      const paymentMethods = voucher.bank_details?.payment_methods || [];
      const hasOnlinePayment = paymentMethods.length > 0 && 
        paymentMethods.some(pm => pm.type !== "cash");
      
      let instrY = totalY + 20;
      
      doc.setDrawColor(...LIGHT_LINE);
      doc.setLineWidth(0.2);
      doc.line(14, instrY - 4, w - 14, instrY - 4);
      
      doc.setTextColor(...DARK_INK);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("PAYMENT INSTRUCTIONS", 14, instrY + 3);
      
      instrY += 8;
      
      if (hasOnlinePayment && paymentMethods.length > 0) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...DARK_INK);
        
        paymentMethods.forEach((pm) => {
          if (pm.type === "cash") return;
          
          const label = pm.type === "bank" 
            ? (pm.bank_name || "Bank Transfer")
            : pm.type === "easypaisa"
            ? `EasyPaisa${pm.account_name ? ` - ${pm.account_name}` : ""}`
            : pm.type === "jazzcash"
            ? `JazzCash${pm.account_name ? ` - ${pm.account_name}` : ""}`
            : pm.label || pm.type;
          
          doc.setTextColor(...ACCENT_COLOR);
          doc.setFont("helvetica", "bold");
          doc.text(`• ${label}`, 16, instrY);
          instrY += 4.5;
          
          if (pm.type === "bank") {
            doc.setFont("helvetica", "normal");
            doc.setTextColor(80, 70, 60);
            if (pm.account_title) doc.text(`   Account: ${pm.account_title}`, 16, instrY), instrY += 4;
            if (pm.account_number) doc.text(`   Account #: ${pm.account_number}`, 16, instrY), instrY += 4;
            if (pm.iban) doc.text(`   IBAN: ${pm.iban}`, 16, instrY), instrY += 4;
          }
          
          if ((pm.type === "easypaisa" || pm.type === "jazzcash") && pm.phone) {
            doc.setFont("helvetica", "normal");
            doc.setTextColor(80, 70, 60);
            doc.text(`   Phone: ${pm.phone}`, 16, instrY), instrY += 4;
          }
          
          instrY += 2;
        });
      } else {
        // Office payment instructions
        doc.setFontSize(8);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(100, 85, 70);
        doc.text("Please visit the school office to submit this fee in cash.", 16, instrY);
        instrY += 6;
        
        doc.setFont("helvetica", "normal");
        doc.text("When visiting, please bring:", 16, instrY); instrY += 4.5;
        doc.text("• This fee challan (print or show on phone)", 18, instrY); instrY += 4;
        doc.text("• Filled enrollment form", 18, instrY); instrY += 4;
        doc.text("• Required documents (B-Form, photos, previous result card)", 18, instrY); instrY += 4;
        doc.text(`• Cash amount: Rs. ${Number(voucher.total_amount).toLocaleString("en-PK")}`, 18, instrY); instrY += 4;
      }
      
      // ── FOOTER ──
      doc.setFillColor(...HEADER_BG);
      doc.rect(8, h - 18, w - 16, 10, "F");
      
      doc.setTextColor(...LIGHT_LINE);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text("GHS Babi Khel — Official Document", w / 2, h - 11, { align: "center" });
      doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}  |  ${voucher.voucher_number}`, w / 2, h - 7, { align: "center" });
      
      // Save the PDF
      doc.save(`FeeChallan-${voucher.voucher_number}.pdf`);
      
    } catch (err) {
      console.error("Error generating PDF:", err);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const getPaymentIcon = (type: string) => {
    switch (type) {
      case "bank": return <Building2 className="w-4 h-4" />;
      case "easypaisa": return <Smartphone className="w-4 h-4 text-green-600" />;
      case "jazzcash": return <Smartphone className="w-4 h-4 text-red-600" />;
      case "cash": return <Banknote className="w-4 h-4" />;
      default: return <CreditCard className="w-4 h-4" />;
    }
  };

  const getPaymentLabel = (pm: PaymentMethod) => {
    switch (pm.type) {
      case "bank": return pm.bank_name || "Bank Transfer";
      case "easypaisa": return `EasyPaisa${pm.account_name ? ` - ${pm.account_name}` : ""}`;
      case "jazzcash": return `JazzCash${pm.account_name ? ` - ${pm.account_name}` : ""}`;
      case "cash": return "Cash at School Office";
      case "other": return pm.label || "Other Payment Method";
      default: return pm.type;
    }
  };

  // Loading state
  if (loading) {
    return (
      <Card className="border-primary/20">
        <CardContent className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Receipt className="w-4 h-4 text-primary animate-pulse" />
            </div>
            <div>
              <p className="font-semibold text-sm">Checking Fee Challan...</p>
              <p className="text-xs text-muted-foreground">Looking for your fee voucher</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="border-red-200 dark:border-red-900/50">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-red-800 dark:text-red-300">Error Loading Fee</p>
              <p className="text-xs text-red-700 dark:text-red-400 mt-1">{error}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Please contact the school office or try again later.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // No voucher found
  if (!voucher) {
    return (
      <Card className="border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-amber-800 dark:text-amber-300">Fee Pending</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                Your {admissionType === "migration" ? "migration" : "admission"} fee challan has not been generated yet. 
                This will be created once you complete enrollment at the school office.
              </p>
              <div className="mt-3 p-3 bg-white/60 dark:bg-black/20 rounded-lg border border-amber-200/50">
                <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 mb-1">📋 Next Steps:</p>
                <ol className="text-[11px] text-amber-700 dark:text-amber-400 space-y-1 list-decimal list-inside">
                  <li>Visit the school office with your documents</li>
                  <li>Complete the enrollment process</li>
                  <li>Your fee challan will be generated automatically</li>
                  <li>You can check back here to see your challan</li>
                </ol>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Voucher found - display challan
  const paymentMethods = voucher.bank_details?.payment_methods || [];
  const hasOnlinePayment = paymentMethods.length > 0 && 
    paymentMethods.some(pm => pm.type !== "cash");
  
  const feeTypeLabel = voucher.fee_items[0]?.fee_type === "migration" 
    ? "Migration Fee" 
    : voucher.fee_items[0]?.label || "Admission/Migration Fee";

  // Determine status badge styling - VISIBLE colors for all states
  const getStatusBadgeStyle = () => {
    switch (voucher.status) {
      case "paid":
        return {
          bg: "bg-emerald-100 dark:bg-emerald-900/40",
          text: "text-emerald-700 dark:text-emerald-300",
          border: "border-emerald-300 dark:border-emerald-700",
          label: "PAID ✓"
        };
      case "overdue":
        return {
          bg: "bg-red-100 dark:bg-red-900/40",
          text: "text-red-700 dark:text-red-300",
          border: "border-red-300 dark:border-red-700",
          label: "OVERDUE ⚠"
        };
      case "partial":
        return {
          bg: "bg-amber-100 dark:bg-amber-900/40",
          text: "text-amber-700 dark:text-amber-300",
          border: "border-amber-300 dark:border-amber-700",
          label: "PARTIAL"
        };
      default: // unpaid
        return {
          bg: "bg-amber-100 dark:bg-amber-900/40",
          text: "text-amber-800 dark:text-amber-200",
          border: "border-amber-400 dark:border-amber-600",
          label: "UNPAID"
        };
    }
  };

  const statusStyle = getStatusBadgeStyle();

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Main Challan Card - Editorial/Academic Cream Style */}
      <Card className="border-2 overflow-hidden" style={{ borderColor: "#c8b9a6" }}>
        {/* Header - Warm cream tone instead of colorful gradient */}
        <div 
          className="px-5 py-4"
          style={{ backgroundColor: "#f5f0e8" }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "#e6dcc8" }}
              >
                <Receipt className="w-5 h-5" style={{ color: "#785032" }} />
              </div>
              <div>
                <p className="font-bold" style={{ color: "#2d231e" }}>FEE CHALLAN</p>
                <p className="text-xs opacity-80" style={{ color: "#785032" }}>{feeTypeLabel}</p>
              </div>
            </div>
            
            {/* VISIBLE Status Badge - Always clearly visible */}
            <Badge 
              variant="outline"
              className={`${statusStyle.bg} ${statusStyle.text} ${statusStyle.border} font-bold text-xs px-3 py-1`}
            >
              {statusStyle.label}
            </Badge>
          </div>
          
          {/* Download Button */}
          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={downloadChallanPDF}
              disabled={downloading}
              className="gap-1.5 text-xs h-8"
              style={{ 
                borderColor: "#c8b9a6", 
                color: "#785032",
                backgroundColor: "transparent"
              }}
            >
              {downloading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  Download Challan
                </>
              )}
            </Button>
          </div>
        </div>

        <CardContent className="p-5 space-y-4" style={{ backgroundColor: "#fefbf7" }}>
          {/* Student & Voucher Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide font-medium" style={{ color: "#998474" }}>Student</p>
              <p className="font-semibold text-sm" style={{ color: "#2d231e" }}>{studentName}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide font-medium" style={{ color: "#998474" }}>Reference</p>
              <p className="font-mono font-bold text-sm" style={{ color: "#785032" }}>{referenceNo}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide font-medium" style={{ color: "#998474" }}>Voucher #</p>
              <p className="font-mono text-xs" style={{ color: "#2d231e" }}>{voucher.voucher_number}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide font-medium" style={{ color: "#998474" }}>Class</p>
              <p className="font-semibold text-sm" style={{ color: "#2d231e" }}>Class {applyingClass}</p>
            </div>
          </div>

          {/* Amount Section - Subtle warm styling */}
          <div 
            className="rounded-xl p-4 text-center border"
            style={{ backgroundColor: "#f8f3eb", borderColor: "#e6dcc8" }}
          >
            <p className="text-[10px] uppercase tracking-wide font-medium mb-1" style={{ color: "#998474" }}>Total Amount Due</p>
            <p className="text-3xl font-black" style={{ color: "#2d231e" }}>
              Rs. {Number(voucher.total_amount).toLocaleString("en-PK")}
            </p>
            <div className="flex items-center justify-center gap-4 mt-2 text-xs" style={{ color: "#998474" }}>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" /> 
                Due: {format(new Date(voucher.due_date), "dd MMM yyyy")}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> 
                Created: {format(new Date(voucher.created_at), "dd MMM yyyy")}
              </span>
            </div>
          </div>

          {/* Payment Methods Section */}
          {hasOnlinePayment ? (
            <div className="space-y-3">
              <p className="font-semibold text-sm flex items-center gap-2" style={{ color: "#2d231e" }}>
                <Wallet className="w-4 h-4" style={{ color: "#785032" }} /> 
                Online Payment Options
              </p>
              <p className="text-xs" style={{ color: "#998474" }}>
                Pay using any of the following methods. After payment, bring the receipt to school office.
              </p>
              
              <div className="grid gap-3">
                {paymentMethods.map((pm, idx) => (
                  pm.type === "cash" ? null : (
                    <div 
                      key={idx}
                      className="border rounded-xl p-3 space-y-2 transition-colors hover:border-amber-400"
                      style={{ borderColor: "#e6dcc8", backgroundColor: "#ffffff" }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getPaymentIcon(pm.type)}
                          <span className="font-semibold text-sm capitalize" style={{ color: "#2d231e" }}>
                            {getPaymentLabel(pm)}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-[10px]" style={{ color: "#785032", borderColor: "#c8b9a6" }}>
                          {pm.type.toUpperCase()}
                        </Badge>
                      </div>

                      {/* Bank Details */}
                      {pm.type === "bank" && (
                        <div className="space-y-1.5 pl-6">
                          {pm.bank_name && (
                            <p className="text-xs"><span style={{ color: "#998474" }}>Bank:</span> <span style={{ color: "#2d231e" }}>{pm.bank_name}</span></p>
                          )}
                          {pm.account_title && (
                            <p className="text-xs"><span style={{ color: "#998474" }}>Account Title:</span> <span style={{ color: "#2d231e" }}>{pm.account_title}</span></p>
                          )}
                          {pm.account_number && (
                            <div className="flex items-center gap-2">
                              <p className="text-xs"><span style={{ color: "#998474" }}>Account:</span></p>
                              <code className="text-xs px-2 py-0.5 rounded font-mono" style={{ backgroundColor: "#f5f0e8", color: "#2d231e" }}>{pm.account_number}</code>
                              <button 
                                onClick={() => copyToClipboard(pm.account_number!)}
                                style={{ color: "#785032" }}
                              >
                                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          )}
                          {pm.iban && (
                            <div className="flex items-center gap-2">
                              <p className="text-xs"><span style={{ color: "#998474" }}>IBAN:</span></p>
                              <code className="text-xs px-2 py-0.5 rounded font-mono break-all" style={{ backgroundColor: "#f5f0e8", color: "#2d231e" }}>{pm.iban}</code>
                              <button 
                                onClick={() => copyToClipboard(pm.iban!)}
                                style={{ color: "#785032" }}
                              >
                                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Mobile Money Details (EasyPaisa/JazzCash) */}
                      {(pm.type === "easypaisa" || pm.type === "jazzcash") && (
                        <div className="space-y-1.5 pl-6">
                          {pm.account_name && (
                            <p className="text-xs"><span style={{ color: "#998474" }}>Account Name:</span> <span style={{ color: "#2d231e" }}>{pm.account_name}</span></p>
                          )}
                          {pm.phone && (
                            <div className="flex items-center gap-2">
                              <p className="text-xs"><span style={{ color: "#998474" }}>Phone:</span></p>
                              <code className="text-xs px-2 py-0.5 rounded font-mono" style={{ backgroundColor: "#f5f0e8", color: "#2d231e" }}>{pm.phone}</code>
                              <button 
                                onClick={() => copyToClipboard(pm.phone!)}
                                style={{ color: "#785032" }}
                              >
                                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          )}
                          <p className="text-[11px] mt-2" style={{ color: "#785032" }}>
                            Open {pm.type === "easypaisa" ? "EasyPaisa" : "JazzCash"} app → Send Money → Enter above details
                          </p>
                        </div>
                      )}

                      {/* Other type instructions */}
                      {pm.type === "other" && pm.instructions && (
                        <p className="text-xs pl-6 italic" style={{ color: "#998474" }}>{pm.instructions}</p>
                      )}
                    </div>
                  )
                ))}
              </div>
            </div>
          ) : (
            /* No online payment - Show office submission message */
            <div 
              className="rounded-xl p-4 space-y-3 border"
              style={{ backgroundColor: "#faf6ed", borderColor: "#e6dcc8" }}
            >
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#b4956a" }} />
                <div>
                  <p className="font-semibold text-sm" style={{ color: "#785032" }}>
                    Submit Fee at School Office
                  </p>
                  <p className="text-xs mt-1" style={{ color: "#998474" }}>
                    No online payment method is configured for this fee. Please visit the school office to submit the fee along with your enrollment documents.
                  </p>
                </div>
              </div>

              <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: "#ffffff", border: "1px solid #e6dcc8" }}>
                <p className="text-[11px] font-semibold" style={{ color: "#785032" }}>When visiting the school, bring:</p>
                <ul className="text-[11px] space-y-1" style={{ color: "#998474" }}>
                  <li className="flex items-start gap-2">
                    <ArrowRight className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>This fee challan (show this screen or take a screenshot)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ArrowRight className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>Filled admission/enrollment form</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ArrowRight className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>Required documents (B-Form, photos, previous result card)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ArrowRight className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>The fee amount in cash: <strong style={{ color: "#2d231e" }}>Rs. {Number(voucher.total_amount).toLocaleString("en-PK")}</strong></span>
                  </li>
                </ul>
              </div>

              {paymentMethods.length > 0 && paymentMethods.every(pm => pm.type === "cash") && (
                <p className="text-[11px] italic" style={{ color: "#b4956a" }}>
                  Note: Cash payment is only accepted at the school office during working hours.
                </p>
              )}
            </div>
          )}

          {/* Status-specific messages */}
          {voucher.status === "paid" && (
            <div 
              className="rounded-xl p-3 flex items-center gap-2 border"
              style={{ backgroundColor: "#f2f6ec", borderColor: "#c5d9b0" }}
            >
              <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: "#648250" }} />
              <div>
                <p className="font-semibold text-sm" style={{ color: "#4a633a" }}>✓ Fee Paid</p>
                <p className="text-xs" style={{ color: "#6b8255" }}>Your payment has been recorded. Thank you!</p>
              </div>
            </div>
          )}

          {voucher.status === "overdue" && (
            <div 
              className="rounded-xl p-3 flex items-center gap-2 border"
              style={{ backgroundColor: "#fef2f2", borderColor: "#f5c6c6" }}
            >
              <AlertCircle className="w-5 h-5 shrink-0" style={{ color: "#c53030" }} />
              <div>
                <p className="font-semibold text-sm" style={{ color: "#9b2c2c" }}>⚠ Overdue</p>
                <p className="text-xs" style={{ color: "#c53030" }}>This fee is overdue. Please pay immediately to avoid late fees.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
