/**
 * BulkAbsenceFeeModal.tsx
 * Auto-calculates absence fee for ALL students in a class based on
 * their absence count × admin-set rate per absence.
 *
 * Flow:
 *   1. Admin picks class + month + year + rate per absence
 *   2. System fetches absence counts from attendance table
 *   3. Admin reviews the auto-calculated amounts, can override any
 *   4. Submit creates one fee_voucher per student with absences > 0
 */
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Loader2, Users, Calendar, Calculator, AlertCircle, Save, UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useClassAbsenceCounts, useBulkAbsenceFee, type BulkAbsenceFeeEntry,
} from "@/hooks/useFees";
import toast from "react-hot-toast";

const CLASS_OPTIONS = ["6", "7", "8", "9", "10"];
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1, label: ["January","February","March","April","May","June","July","August","September","October","November","December"][i],
}));

interface Props {
  open: boolean;
  onClose: () => void;
  defaultClass?: string;
  defaultMonth?: number;
  defaultYear?: number;
}

export default function BulkAbsenceFeeModal({
  open, onClose,
  defaultClass = "6",
  defaultMonth = new Date().getMonth() + 1,
  defaultYear = new Date().getFullYear(),
}: Props) {
  const [className, setClassName] = useState(defaultClass);
  const [month, setMonth] = useState(defaultMonth);
  const [year, setYear] = useState(defaultYear);
  const [rate, setRate] = useState("50");
  const [feeLabel, setFeeLabel] = useState(`Absence Fee - ${MONTH_OPTIONS[defaultMonth - 1].label} ${defaultYear}`);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [notes, setNotes] = useState("");
  // Editable amounts per student (keyed by student_id)
  const [amountOverrides, setAmountOverrides] = useState<Record<string, string>>({});

  const { data: absenceCounts = [], isLoading } = useClassAbsenceCounts(className, month, year);
  const bulkFee = useBulkAbsenceFee();

  // Reset label when month/year changes
  useEffect(() => {
    setFeeLabel(`Absence Fee - ${MONTH_OPTIONS[month - 1].label} ${year}`);
  }, [month, year]);

  // Compute entries with overrides
  const entries: BulkAbsenceFeeEntry[] = useMemo(() => {
    return absenceCounts.map(a => {
      const override = amountOverrides[a.student_id];
      const amount = override !== undefined
        ? Number(override) || 0
        : a.absence_count * Number(rate || 0);
      return {
        studentId: a.student_id,
        studentName: a.student_name,
        rollNumber: a.roll_number,
        absenceCount: a.absence_count,
        amount,
      };
    });
  }, [absenceCounts, rate, amountOverrides]);

  const totalAmount = entries.reduce((s, e) => s + e.amount, 0);
  const studentsToCharge = entries.filter(e => e.absenceCount > 0 && e.amount > 0).length;
  const canSubmit = studentsToCharge > 0 && !isLoading && !bulkFee.isPending;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      const result = await bulkFee.mutateAsync({
        className,
        month,
        year,
        ratePerAbsence: Number(rate),
        feeLabel,
        dueDate,
        entries,
        notes: notes.trim() || undefined,
      });
      toast.success(`Created ${result?.length || 0} absence fee vouchers for Class ${className}`);
      setAmountOverrides({});
      setNotes("");
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Failed to create absence fees");
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, y: 10 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 10 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="sticky top-0 z-10 bg-card border-b border-border p-4 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" /> Bulk Absence Fee
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Auto-charge every student based on their absences this month
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Filters row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <Label className="text-[10px] font-semibold mb-1 block">Class</Label>
                <Select value={className} onValueChange={(v) => { setClassName(v); setAmountOverrides({}); }}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CLASS_OPTIONS.map(c => <SelectItem key={c} value={c}>Class {c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] font-semibold mb-1 block">Month</Label>
                <Select value={String(month)} onValueChange={(v) => { setMonth(Number(v)); setAmountOverrides({}); }}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTH_OPTIONS.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] font-semibold mb-1 block">Year</Label>
                <Input
                  type="number"
                  value={year}
                  onChange={(e) => { setYear(Number(e.target.value)); setAmountOverrides({}); }}
                  className="h-9 text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px] font-semibold mb-1 block">Rate/Absence (Rs.)</Label>
                <Input
                  type="number"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* Fee label + due date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Label className="text-xs font-semibold mb-1 block">Fee Label</Label>
                <Input
                  value={feeLabel}
                  onChange={(e) => setFeeLabel(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold mb-1 block">Due Date</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {/* Summary banner */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground">Students with absences</p>
                  <p className="font-bold text-foreground text-base">{studentsToCharge}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total to charge</p>
                  <p className="font-bold text-primary text-base">Rs. {totalAmount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Rate</p>
                  <p className="font-bold text-foreground text-base">Rs. {rate}/day</p>
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground">
                Override any amount below before submitting.
              </div>
            </div>

            {/* Students table */}
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="bg-secondary/50 px-3 py-2 grid grid-cols-12 gap-2 text-[10px] font-bold uppercase text-muted-foreground">
                <div className="col-span-5">Student</div>
                <div className="col-span-2 text-center">Absences</div>
                <div className="col-span-2 text-center">× Rate</div>
                <div className="col-span-3 text-right">Amount (Rs.)</div>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {isLoading ? (
                  <div className="p-6 text-center">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-primary mb-1" />
                    <p className="text-xs text-muted-foreground">Counting absences…</p>
                  </div>
                ) : absenceCounts.length === 0 ? (
                  <div className="p-6 text-center">
                    <UserX className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-foreground">No absences recorded</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      No students in Class {className} were marked absent in {MONTH_OPTIONS[month - 1].label} {year}.
                    </p>
                  </div>
                ) : (
                  absenceCounts.map((a) => {
                    const override = amountOverrides[a.student_id];
                    const amount = override !== undefined
                      ? Number(override) || 0
                      : a.absence_count * Number(rate || 0);
                    return (
                      <div key={a.student_id} className="px-3 py-2 grid grid-cols-12 gap-2 items-center border-b border-border last:border-0 text-xs">
                        <div className="col-span-5 flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                            {a.student_name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{a.student_name}</p>
                            <p className="text-[9px] text-muted-foreground">#{a.roll_number}</p>
                          </div>
                        </div>
                        <div className="col-span-2 text-center font-bold">{a.absence_count}</div>
                        <div className="col-span-2 text-center text-muted-foreground">× {rate}</div>
                        <div className="col-span-3">
                          <Input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmountOverrides(prev => ({ ...prev, [a.student_id]: e.target.value }))}
                            className="h-8 text-xs text-right"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label className="text-xs font-semibold mb-1 block">Notes (optional, applied to all vouchers)</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Late arrival counts as half absence"
                className="h-9 text-sm"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2 sticky bottom-0 bg-card pb-1">
              <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex-1 gap-1.5"
              >
                {bulkFee.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Create {studentsToCharge} Voucher{studentsToCharge !== 1 ? "s" : ""}
              </Button>
            </div>

            {bulkFee.isError && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-2.5 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{(bulkFee.error as Error)?.message || "Failed to create vouchers"}</span>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
