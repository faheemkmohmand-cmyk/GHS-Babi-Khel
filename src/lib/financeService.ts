import { supabase } from "@/lib/supabase";

// ─── Student ID Resolution ──────────────────────────────────────────────────
// CRITICAL FIX: The Admin Dashboard writes charges/payments using `students.id`
// (from the `students` table), but the User Dashboard was reading with
// `profiles.id` (auth UID). These are completely different UUIDs. This function
// resolves the correct `students.id` for a logged-in user by matching their
// profile fields (full_name, class, roll_number) against the students table.

export interface ResolvedStudent {
  id: string;              // students.id — the UUID used in student_charges/payments
  full_name: string;
  roll_number: string;
  class: string;
  father_name?: string | null;
}

export async function resolveStudentRecord(profile: {
  id: string;
  full_name: string | null;
  class: string | null;
  roll_number: string | null;
}): Promise<ResolvedStudent | null> {
  if (!profile.full_name) return null;

  // Strategy 1: Try matching by full_name + class + roll_number (most specific)
  if (profile.class && profile.roll_number) {
    const { data } = await supabase
      .from("students")
      .select("id, full_name, roll_number, class, father_name")
      .ilike("full_name", profile.full_name)
      .eq("class", profile.class)
      .eq("roll_number", profile.roll_number)
      .limit(1);
    if (data && data.length > 0) return data[0] as ResolvedStudent;
  }

  // Strategy 2: Try matching by full_name + class
  if (profile.class) {
    const { data } = await supabase
      .from("students")
      .select("id, full_name, roll_number, class, father_name")
      .ilike("full_name", profile.full_name)
      .eq("class", profile.class)
      .limit(1);
    if (data && data.length > 0) return data[0] as ResolvedStudent;
  }

  // Strategy 3: Try matching just by full_name (least specific, last resort)
  const { data } = await supabase
    .from("students")
    .select("id, full_name, roll_number, class, father_name")
    .ilike("full_name", profile.full_name)
    .limit(1);
  if (data && data.length > 0) return data[0] as ResolvedStudent;

  return null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeeType {
  id: string;
  school_id: string | null;
  name: string;
  category: "fee" | "fine" | "other";
  default_amount: number;
  is_recurring: boolean;
  created_at: string;
}

export interface StudentCharge {
  id: string;
  school_id: string | null;
  student_id: string;
  fee_type_id: string | null;
  title: string;
  amount: number;
  status: "pending" | "partial" | "paid";
  due_date: string | null;
  created_by: string | null;
  created_at: string;
  // joined
  fee_type?: Pick<FeeType, "name" | "category">;
  student?: { full_name: string; roll_number: string; class: string; father_name?: string };
  amount_paid?: number; // computed
}

export interface Payment {
  id: string;
  school_id: string | null;
  student_id: string;
  total_amount: number;
  payment_method: "cash" | "jazzcash" | "easypaisa";
  status: "pending" | "completed" | "rejected";
  reference_number: string | null;
  screenshot_url: string | null;
  paid_at: string;
  received_by: string | null;
  verified_by: string | null;
  rejection_reason: string | null;
  created_at: string;
  // joined
  student?: { full_name: string; roll_number: string; class: string };
  items?: PaymentItem[];
  receipt?: Receipt;
}

export interface PaymentItem {
  id: string;
  payment_id: string;
  charge_id: string;
  amount_paid: number;
  charge?: Pick<StudentCharge, "title" | "amount">;
}

export interface Receipt {
  id: string;
  payment_id: string;
  receipt_number: string;
  generated_at: string;
}

export interface LedgerEntry {
  student_id: string;
  total_charged: number;
  total_paid: number;
  balance: number;
}

// ─── Fee Types ────────────────────────────────────────────────────────────────

export async function getFeeTypes(): Promise<FeeType[]> {
  const { data, error } = await supabase
    .from("fee_types")
    .select("*")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function createFeeType(payload: Omit<FeeType, "id" | "created_at" | "school_id">): Promise<FeeType> {
  const { data, error } = await supabase
    .from("fee_types")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteFeeType(id: string): Promise<void> {
  const { error } = await supabase.from("fee_types").delete().eq("id", id);
  if (error) throw error;
}

// ─── Student Charges ─────────────────────────────────────────────────────────

export async function getChargesAdmin(filters: {
  student_id?: string;
  class?: string;
  status?: string;
} = {}): Promise<StudentCharge[]> {
  let q = supabase
    .from("student_charges")
    .select(`
      *,
      fee_type:fee_types(name, category),
      student:students(full_name, roll_number, class, father_name)
    `)
    .order("created_at", { ascending: false });

  if (filters.student_id) q = q.eq("student_id", filters.student_id);
  if (filters.status) q = q.eq("status", filters.status);

  const { data, error } = await q;
  if (error) throw error;

  // Attach amount_paid from payment_items
  const charges = (data ?? []) as StudentCharge[];

  if (charges.length === 0) return charges;
  const ids = charges.map((c) => c.id);
  const { data: items } = await supabase
    .from("payment_items")
    .select("charge_id, amount_paid")
    .in("charge_id", ids);

  const paidMap: Record<string, number> = {};
  (items ?? []).forEach((i: { charge_id: string; amount_paid: number }) => {
    paidMap[i.charge_id] = (paidMap[i.charge_id] || 0) + i.amount_paid;
  });
  return charges
    .map((c) => ({ ...c, amount_paid: paidMap[c.id] || 0 }))
    .filter((c) => !filters.class || (c.student as any)?.class === filters.class);
}

export async function getMyCharges(student_id: string): Promise<StudentCharge[]> {
  const { data, error } = await supabase
    .from("student_charges")
    .select(`*, fee_type:fee_types(name, category)`)
    .eq("student_id", student_id)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const charges = (data ?? []) as StudentCharge[];
  if (charges.length === 0) return charges;

  // Only count payment_items from COMPLETED payments
  const { data: completedPayments } = await supabase
    .from("payments")
    .select("id")
    .eq("student_id", student_id)
    .eq("status", "completed");

  const completedIds = (completedPayments ?? []).map((p: { id: string }) => p.id);

  const paidMap: Record<string, number> = {};
  if (completedIds.length > 0) {
    const ids = charges.map((c) => c.id);
    const { data: items } = await supabase
      .from("payment_items")
      .select("charge_id, amount_paid")
      .in("charge_id", ids)
      .in("payment_id", completedIds);

    (items ?? []).forEach((i: { charge_id: string; amount_paid: number }) => {
      paidMap[i.charge_id] = (paidMap[i.charge_id] || 0) + i.amount_paid;
    });
  }

  return charges.map((c) => ({ ...c, amount_paid: paidMap[c.id] || 0 }));
}

export async function createCharge(
  payload: Omit<StudentCharge, "id" | "created_at" | "school_id" | "status" | "fee_type" | "student" | "amount_paid">
): Promise<StudentCharge> {
  const { data, error } = await supabase
    .from("student_charges")
    .insert({ ...payload, status: "pending" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function bulkCreateCharges(
  student_ids: string[],
  payload: { fee_type_id?: string; title: string; amount: number; due_date?: string; created_by: string }
): Promise<void> {
  const rows = student_ids.map((sid) => ({
    student_id: sid,
    status: "pending",
    ...payload,
  }));
  const { error } = await supabase.from("student_charges").insert(rows);
  if (error) throw error;
}

export async function deleteCharge(id: string): Promise<void> {
  const { error } = await supabase.from("student_charges").delete().eq("id", id);
  if (error) throw error;
}

// ─── Cash Payment Flow ────────────────────────────────────────────────────────

export async function collectCashPayment(opts: {
  student_id: string;
  received_by: string;
  charge_allocations: { charge_id: string; amount: number }[];
}): Promise<{ payment: Payment; receipt: Receipt }> {
  const total = opts.charge_allocations.reduce((s, a) => s + a.amount, 0);
  if (total <= 0) throw new Error("Payment amount must be greater than zero");

  // 1. Insert payment
  const { data: payment, error: pe } = await supabase
    .from("payments")
    .insert({
      student_id: opts.student_id,
      total_amount: total,
      payment_method: "cash",
      status: "completed",
      received_by: opts.received_by,
      verified_by: opts.received_by,
      paid_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (pe) throw pe;

  // 2. Insert payment items
  const items = opts.charge_allocations.map((a) => ({
    payment_id: payment.id,
    charge_id: a.charge_id,
    amount_paid: a.amount,
  }));
  const { error: ie } = await supabase.from("payment_items").insert(items);
  if (ie) throw ie;

  // 3. Update charge statuses
  await updateChargeStatuses(opts.charge_allocations.map((a) => a.charge_id));

  // 4. Generate receipt
  const receipt = await generateReceipt(payment.id);

  return { payment, receipt };
}

// ─── Wallet Payment Flow ──────────────────────────────────────────────────────

export async function submitWalletPayment(opts: {
  student_id: string;
  charge_ids: string[];
  total_amount: number;
  payment_method: "jazzcash" | "easypaisa";
  reference_number: string;
  screenshot_url?: string;
}): Promise<Payment> {
  const { data, error } = await supabase
    .from("payments")
    .insert({
      student_id: opts.student_id,
      total_amount: opts.total_amount,
      payment_method: opts.payment_method,
      status: "pending",
      reference_number: opts.reference_number,
      screenshot_url: opts.screenshot_url ?? null,
      paid_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;

  // Fetch actual outstanding balance per charge so we can allocate proportionally
  const { data: charges, error: ce } = await supabase
    .from("student_charges")
    .select("id, amount")
    .in("id", opts.charge_ids);
  if (ce) throw ce;

  const { data: existingItems } = await supabase
    .from("payment_items")
    .select("charge_id, amount_paid")
    .in("charge_id", opts.charge_ids);

  const alreadyPaidMap: Record<string, number> = {};
  (existingItems ?? []).forEach((i: { charge_id: string; amount_paid: number }) => {
    alreadyPaidMap[i.charge_id] = (alreadyPaidMap[i.charge_id] || 0) + i.amount_paid;
  });

  // Outstanding balance per charge
  const outstanding = (charges ?? []).map((c: { id: string; amount: number }) => ({
    charge_id: c.id,
    balance: Math.max(0, c.amount - (alreadyPaidMap[c.id] || 0)),
  }));

  const totalOutstanding = outstanding.reduce((s, o) => s + o.balance, 0);

  // Allocate proportionally based on outstanding balance
  const items = outstanding.map((o, idx) => {
    const isLast = idx === outstanding.length - 1;
    const allocated = isLast
      ? opts.total_amount - outstanding.slice(0, -1).reduce((s, x) => s + Math.round((x.balance / totalOutstanding) * opts.total_amount * 100) / 100, 0)
      : Math.round((o.balance / totalOutstanding) * opts.total_amount * 100) / 100;
    return {
      payment_id: data.id,
      charge_id: o.charge_id,
      amount_paid: totalOutstanding > 0 ? allocated : Math.round((opts.total_amount / opts.charge_ids.length) * 100) / 100,
    };
  });

  await supabase.from("payment_items").insert(items);

  return data;
}

export async function approveWalletPayment(
  payment_id: string,
  verified_by: string
): Promise<{ receipt: Receipt }> {
  // Update payment status
  const { error: ue } = await supabase
    .from("payments")
    .update({ status: "completed", verified_by })
    .eq("id", payment_id);
  if (ue) throw ue;

  // Get charge ids from payment_items
  const { data: items } = await supabase
    .from("payment_items")
    .select("charge_id")
    .eq("payment_id", payment_id);

  const chargeIds = (items ?? []).map((i: { charge_id: string }) => i.charge_id);
  if (chargeIds.length) await updateChargeStatuses(chargeIds);

  const receipt = await generateReceipt(payment_id);
  return { receipt };
}

export async function rejectWalletPayment(
  payment_id: string,
  verified_by: string,
  reason: string
): Promise<void> {
  const { error } = await supabase
    .from("payments")
    .update({ status: "rejected", verified_by, rejection_reason: reason })
    .eq("id", payment_id);
  if (error) throw error;
}

// ─── Pending Payments (Admin) ─────────────────────────────────────────────────

export async function getPendingPayments(): Promise<Payment[]> {
  const { data, error } = await supabase
    .from("payments")
    .select(`
      *,
      student:students(full_name, roll_number, class),
      items:payment_items(*, charge:student_charges(title, amount))
    `)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Payment[];
}

export async function getAllPayments(filters: { status?: string; student_id?: string } = {}): Promise<Payment[]> {
  let q = supabase
    .from("payments")
    .select(`
      *,
      student:students(full_name, roll_number, class),
      items:payment_items(*, charge:student_charges(title, amount)),
      receipt:receipts(receipt_number, generated_at)
    `)
    .order("created_at", { ascending: false });

  if (filters.status) q = q.eq("status", filters.status);
  if (filters.student_id) q = q.eq("student_id", filters.student_id);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Payment[];
}

export async function getMyPayments(student_id: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from("payments")
    .select(`
      *,
      items:payment_items(*, charge:student_charges(title, amount)),
      receipt:receipts(receipt_number, generated_at)
    `)
    .eq("student_id", student_id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Payment[];
}

// ─── Ledger ───────────────────────────────────────────────────────────────────

export async function getStudentLedger(student_id: string): Promise<LedgerEntry> {
  // Step 1: total charged — sum of all charges for this student
  const { data: charges } = await supabase
    .from("student_charges")
    .select("amount")
    .eq("student_id", student_id);

  // Step 2: get all completed payment IDs for this student
  const { data: completedPayments } = await supabase
    .from("payments")
    .select("id")
    .eq("student_id", student_id)
    .eq("status", "completed");

  const paymentIds = (completedPayments ?? []).map((p: { id: string }) => p.id);

  // Step 3: sum payment_items only for those payment IDs
  let total_paid = 0;
  if (paymentIds.length > 0) {
    const { data: items } = await supabase
      .from("payment_items")
      .select("amount_paid")
      .in("payment_id", paymentIds);
    total_paid = (items ?? []).reduce((s: number, i: { amount_paid: number }) => s + i.amount_paid, 0);
  }

  const total_charged = (charges ?? []).reduce((s: number, c: { amount: number }) => s + c.amount, 0);

  return { student_id, total_charged, total_paid, balance: total_charged - total_paid };
}

export async function getAllStudentLedgers(): Promise<
  { student_id: string; full_name: string; roll_number: string; class: string; total_charged: number; total_paid: number; balance: number }[]
> {
  const { data: charges } = await supabase
    .from("student_charges")
    .select("student_id, amount, student:students(full_name, roll_number, class)");

  // Get completed payment IDs first, then sum payment_items — consistent with getStudentLedger
  const { data: completedPayments } = await supabase
    .from("payments")
    .select("id, student_id")
    .eq("status", "completed");

  const completedIds = (completedPayments ?? []).map((p: { id: string }) => p.id);

  const { data: paymentItems } = completedIds.length > 0
    ? await supabase
        .from("payment_items")
        .select("charge_id, amount_paid, payment_id")
        .in("payment_id", completedIds)
    : { data: [] };

  // Map payment_id -> student_id for attribution
  const paymentStudentMap: Record<string, string> = {};
  (completedPayments ?? []).forEach((p: { id: string; student_id: string }) => {
    paymentStudentMap[p.id] = p.student_id;
  });

  const charged: Record<string, number> = {};
  const info: Record<string, any> = {};
  (charges ?? []).forEach((c: any) => {
    charged[c.student_id] = (charged[c.student_id] || 0) + c.amount;
    if (!info[c.student_id] && c.student) info[c.student_id] = c.student;
  });

  const paid: Record<string, number> = {};
  (paymentItems ?? []).forEach((i: { payment_id: string; amount_paid: number }) => {
    const sid = paymentStudentMap[i.payment_id];
    if (sid) paid[sid] = (paid[sid] || 0) + i.amount_paid;
  });

  return Object.keys(info).map((sid) => ({
    student_id: sid,
    ...info[sid],
    total_charged: charged[sid] || 0,
    total_paid: paid[sid] || 0,
    balance: (charged[sid] || 0) - (paid[sid] || 0),
  }));
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export async function getTodayStats(): Promise<{
  collected_today: number;
  pending_dues: number;
  total_defaulters: number;
}> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: todayPayments } = await supabase
    .from("payments")
    .select("total_amount")
    .eq("status", "completed")
    .gte("paid_at", today);

  const { data: pendingCharges } = await supabase
    .from("student_charges")
    .select("amount")
    .in("status", ["pending", "partial"]);

  const { data: defaulters } = await supabase
    .from("student_charges")
    .select("student_id")
    .eq("status", "pending")
    .lt("due_date", today);

  const uniqueDefaulters = new Set((defaulters ?? []).map((d: any) => d.student_id));

  return {
    collected_today: (todayPayments ?? []).reduce((s: number, p: { total_amount: number }) => s + p.total_amount, 0),
    pending_dues: (pendingCharges ?? []).reduce((s: number, c: { amount: number }) => s + c.amount, 0),
    total_defaulters: uniqueDefaulters.size,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function updateChargeStatuses(charge_ids: string[]): Promise<void> {
  // Fetch all charges and their payment totals in 2 queries (not N queries)
  const { data: charges } = await supabase
    .from("student_charges")
    .select("id, amount")
    .in("id", charge_ids);

  const { data: items } = await supabase
    .from("payment_items")
    .select("charge_id, amount_paid")
    .in("charge_id", charge_ids);

  const paidMap: Record<string, number> = {};
  (items ?? []).forEach((i: { charge_id: string; amount_paid: number }) => {
    paidMap[i.charge_id] = (paidMap[i.charge_id] || 0) + i.amount_paid;
  });

  // Group charges by their new status — then do 1 update per status group
  // instead of 1 update per charge (fixes N+1 pattern)
  const groups: Record<string, string[]> = { paid: [], partial: [], pending: [] };
  for (const charge of charges ?? []) {
    const totalPaid = paidMap[charge.id] || 0;
    const status = totalPaid >= charge.amount ? "paid" : totalPaid > 0 ? "partial" : "pending";
    groups[status].push(charge.id);
  }

  // At most 3 database calls regardless of how many charges there are
  await Promise.all(
    Object.entries(groups)
      .filter(([, ids]) => ids.length > 0)
      .map(([status, ids]) =>
        supabase.from("student_charges").update({ status }).in("id", ids)
      )
  );
}

async function generateReceipt(payment_id: string): Promise<Receipt> {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 5).toUpperCase();
  const receipt_number = `RCP-${timestamp}-${random}`;

  const { data, error } = await supabase
    .from("receipts")
    .insert({ payment_id, receipt_number })
    .select()
    .single();
  if (error) throw error;
  return data;
}
