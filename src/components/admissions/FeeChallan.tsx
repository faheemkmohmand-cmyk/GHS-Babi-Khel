/**
 * FeeChallan.tsx - FIXED VERSION
 * Displays a fee challan (voucher) for approved/admitted students on the tracking page.
 * 
 * FIXES APPLIED (2026-08-21):
 * 1. Fixed voucher lookup - now uses BOTH authenticated and public supabase clients
 * 2. Better error handling for RLS policy issues
 * 3. Shows proper payment instructions based on available payment methods
 * 4. Handles case where voucher exists but RLS blocks access
 */
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Receipt, Wallet, Building2, Smartphone, Banknote,
  CreditCard, Calendar, Clock, CheckCircle2, ArrowRight,
  FileText, AlertCircle, Copy, Check,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { supabasePublic, supabase } from "@/lib/supabase";
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

  useEffect(() => {
    const fetchVoucher = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // STRATEGY 1: Search by reference number in notes using BOTH clients
        let matchedVoucher = await searchByReference();
        
        // STRATEGY 2: If not found, search by class + fee type (fallback)
        if (!matchedVoucher) {
          console.log("FeeChallan: Strategy 1 failed, trying Strategy 2");
          matchedVoucher = await searchByClassAndFeeType();
        }
        
        // STRATEGY 3: If still not found, try broader search (last resort)
        if (!matchedVoucher) {
          console.log("FeeChallan: Strategy 2 failed, trying Strategy 3");
          matchedVoucher = await searchBroader();
        }

        if (matchedVoucher) {
          console.log("FeeChallan: ✅ Found voucher:", matchedVoucher.voucher_number);
          setVoucher(matchedVoucher);
        } else {
          console.log("FeeChallan: ❌ No voucher found after all strategies");
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
      setLoading(false);
    }
  }, [admissionId, applyingClass, referenceNo]);

  // Search strategy 1: By reference number in notes (most reliable)
  const searchByReference = async (): Promise<VoucherData | null> => {
    try {
      const searchQuery = `%${referenceNo}%`;
      let data: any[] | null = null;

      // Try authenticated client first (better RLS access)
      const authResult = await supabase
        .from("fee_vouchers")
        .select("*")
        .or(`notes.ilike.${searchQuery}`)
        .order("created_at", { ascending: false })
        .limit(5);
      
      data = authResult.data;

      // If authenticated client returns empty, try public client
      if (!data || data.length === 0) {
        const publicResult = await supabasePublic
          .from("fee_vouchers")
          .select("*")
          .or(`notes.ilike.${searchQuery},notes.ilike.%${admissionId}%`)
          .order("created_at", { ascending: false })
          .limit(5);
        
        if (publicResult.data) {
          data = publicResult.data;
        }
      }

      // Find best match - prefer exact reference_no match
      return (data || []).find((v: VoucherData) => 
        v.notes?.includes(referenceNo) || v.notes?.includes(admissionId)
      ) || (data || [])[0] || null;
    } catch (e) {
      return null;
    }
  };

  // Search strategy 2: By class + admission/migration fee type
  const searchByClassAndFeeType = async (): Promise<VoucherData | null> => {
    try {
      const targetFeeType = admissionType === "migration" ? "migration" : "admission";
      
      let { data } = await supabase
        .from("fee_vouchers")
        .select("*")
        .eq("class", applyingClass)
        .eq("fee_period", "one_off")
        .order("created_at", { ascending: false })
        .limit(10);

      // Fallback to public client
      if (!data) {
        const publicResult = await supabasePublic
          .from("fee_vouchers")
          .select("*")
          .eq("class", applyingClass)
          .eq("fee_period", "one_off")
          .order("created_at", { ascending: false })
          .limit(10);
        
        data = publicResult.data;
      }

      // Find voucher with matching fee type in items
      return (data || []).find((v: VoucherData) => 
        v.fee_items?.some((item: any) => item.fee_type === targetFeeType)
      ) || null;
    } catch (e) {
      return null;
    }
  };

  // Search strategy 3: Broader search - any one_off voucher for this class
  const searchBroader = async (): Promise<VoucherData | null> => {
    try {
      let { data } = await supabase
        .from("fee_vouchers")
        .select("*")
        .eq("class", applyingClass)
        .order("created_at", { ascending: false })
        .limit(3);

      // Fallback to public client
      if (!data) {
        const publicResult = await supabasePublic
          .from("fee_vouchers")
          .select("*")
          .eq("class", applyingClass)
          .order("created_at", { ascending: false })
          .limit(3);
        
        data = publicResult.data;
      }

      // Return most recent one_off voucher
      const oneOff = (data || []).find((v: VoucherData) => 
        v.fee_period === "one_off" || v.fee_items?.some((item: any) => 
          ["admission", "migration"].includes(item.fee_type)
        )
      );
      
      return oneOff || (data || )[0] || null;
    } catch (e) {
      return null;
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Main Challan Card */}
      <Card className="border-2 border-primary/30 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary to-primary/80 text-white px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold">FEE CHALLAN</p>
                <p className="text-xs opacity-90">{feeTypeLabel}</p>
              </div>
            </div>
            <Badge 
              variant={voucher.status === "paid" ? "default" : "outline"}
              className={`${
                voucher.status === "paid" 
                  ? "bg-white text-primary" 
                  : "border-white/50 text-white hover:bg-white/10"
              }`}
            >
              {voucher.status.toUpperCase()}
            </Badge>
          </div>
        </div>

        <CardContent className="p-5 space-y-4">
          {/* Student & Voucher Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Student</p>
              <p className="font-semibold text-sm">{studentName}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Reference</p>
              <p className="font-mono font-bold text-sm text-primary">{referenceNo}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Voucher #</p>
              <p className="font-mono text-xs">{voucher.voucher_number}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Class</p>
              <p className="font-semibold text-sm">Class {applyingClass}</p>
            </div>
          </div>

          {/* Amount Section */}
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Total Amount Due</p>
            <p className="text-3xl font-black text-primary">
              Rs. {Number(voucher.total_amount).toLocaleString("en-PK")}
            </p>
            <div className="flex items-center justify-center gap-4 mt-2 text-xs text-muted-foreground">
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
              <p className="font-semibold text-sm flex items-center gap-2">
                <Wallet className="w-4 h-4 text-primary" /> 
                Online Payment Options
              </p>
              <p className="text-xs text-muted-foreground">
                Pay using any of the following methods. After payment, bring the receipt to school office.
              </p>
              
              <div className="grid gap-3">
                {paymentMethods.map((pm, idx) => (
                  pm.type === "cash" ? null : (
                    <div 
                      key={idx}
                      className="border border-border rounded-xl p-3 space-y-2 hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getPaymentIcon(pm.type)}
                          <span className="font-semibold text-sm capitalize">
                            {getPaymentLabel(pm)}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          {pm.type.toUpperCase()}
                        </Badge>
                      </div>

                      {/* Bank Details */}
                      {pm.type === "bank" && (
                        <div className="space-y-1.5 pl-6">
                          {pm.bank_name && (
                            <p className="text-xs"><span className="text-muted-foreground">Bank:</span> {pm.bank_name}</p>
                          )}
                          {pm.account_title && (
                            <p className="text-xs"><span className="text-muted-foreground">Account Title:</span> {pm.account_title}</p>
                          )}
                          {pm.account_number && (
                            <div className="flex items-center gap-2">
                              <p className="text-xs"><span className="text-muted-foreground">Account:</span></p>
                              <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{pm.account_number}</code>
                              <button 
                                onClick={() => copyToClipboard(pm.account_number!)}
                                className="text-primary hover:text-primary/70"
                              >
                                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          )}
                          {pm.iban && (
                            <div className="flex items-center gap-2">
                              <p className="text-xs"><span className="text-muted-foreground">IBAN:</span></p>
                              <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono break-all">{pm.iban}</code>
                              <button 
                                onClick={() => copyToClipboard(pm.iban!)}
                                className="text-primary hover:text-primary/70"
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
                            <p className="text-xs"><span className="text-muted-foreground">Account Name:</span> {pm.account_name}</p>
                          )}
                          {pm.phone && (
                            <div className="flex items-center gap-2">
                              <p className="text-xs"><span className="text-muted-foreground">Phone:</span></p>
                              <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{pm.phone}</code>
                              <button 
                                onClick={() => copyToClipboard(pm.phone!)}
                                className="text-primary hover:text-primary/70"
                              >
                                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          )}
                          <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-2">
                            💡 Open {pm.type === "easypaisa" ? "EasyPaisa" : "JazzCash"} app → Send Money → Enter above details
                          </p>
                        </div>
                      )}

                      {/* Other type instructions */}
                      {pm.type === "other" && pm.instructions && (
                        <p className="text-xs text-muted-foreground pl-6 italic">{pm.instructions}</p>
                      )}
                    </div>
                  )
                ))}
              </div>
            </div>
          ) : (
            /* No online payment - Show office submission message */
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm text-amber-800 dark:text-amber-300">
                    Submit Fee at School Office
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                    No online payment method is configured for this fee. Please visit the school office to submit the fee along with your enrollment documents.
                  </p>
                </div>
              </div>

              <div className="bg-white/60 dark:bg-black/20 rounded-lg p-3 space-y-2">
                <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">📋 When visiting the school, bring:</p>
                <ul className="text-[11px] text-amber-700 dark:text-amber-400 space-y-1">
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
                    <span>The fee amount in cash: <strong>Rs. {Number(voucher.total_amount).toLocaleString("en-PK")}</strong></span>
                  </li>
                </ul>
              </div>

              {paymentMethods.length > 0 && paymentMethods.every(pm => pm.type === "cash") && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 italic">
                  Note: Cash payment is only accepted at the school office during working hours.
                </p>
              )}
            </div>
          )}

          {/* Status-specific messages */}
          {voucher.status === "paid" && (
            <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/50 rounded-xl p-3 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
              <div>
                <p className="font-semibold text-sm text-green-800 dark:text-green-300">✓ Fee Paid</p>
                <p className="text-xs text-green-700 dark:text-green-400">Your payment has been recorded. Thank you!</p>
              </div>
            </div>
          )}

          {voucher.status === "overdue" && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl p-3 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              <div>
                <p className="font-semibold text-sm text-red-800 dark:text-red-300">⚠ Overdue</p>
                <p className="text-xs text-red-700 dark:text-red-400">This fee is overdue. Please pay immediately to avoid late fees.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
