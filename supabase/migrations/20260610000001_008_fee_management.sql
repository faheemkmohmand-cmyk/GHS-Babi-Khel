-- ═══════════════════════════════════════════════════════════════════════════════
-- 008 Fee Management System
-- Tables: fee_structures, fee_vouchers, fee_payments
-- With RLS policies for admin, teacher, student access
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Fee Structures ─────────────────────────────────────────────────────────
-- Defines the fee types and amounts per class (tuition, lab, library, transport, exam, etc.)
CREATE TABLE IF NOT EXISTS fee_structures (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class         TEXT NOT NULL,                   -- "6", "7", "8", "9", "10"
  fee_type      TEXT NOT NULL,                   -- "tuition", "lab", "library", "transport", "exam", "admission", "other"
  label         TEXT NOT NULL,                   -- Display name e.g. "Tuition Fee", "Lab Fee"
  amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_optional   BOOLEAN NOT NULL DEFAULT FALSE,  -- e.g. transport is optional
  is_recurring  BOOLEAN NOT NULL DEFAULT TRUE,   -- monthly/quarterly vs one-time (admission)
  frequency     TEXT NOT NULL DEFAULT 'monthly', -- "monthly", "quarterly", "annual", "one_time"
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(class, fee_type)
);

-- ─── Fee Vouchers ───────────────────────────────────────────────────────────
-- Auto-generated monthly/quarterly vouchers for each student
CREATE TABLE IF NOT EXISTS fee_vouchers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_number    TEXT NOT NULL UNIQUE,         -- auto-generated e.g. "FV-2026-06-001"
  student_id        UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class             TEXT NOT NULL,
  month             INTEGER NOT NULL,             -- 1-12
  year              INTEGER NOT NULL,
  fee_period        TEXT NOT NULL DEFAULT 'monthly', -- "monthly", "quarterly"
  fee_items         JSONB NOT NULL DEFAULT '[]',  -- [{fee_type, label, amount}]
  total_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date          DATE NOT NULL,
  bank_details      JSONB DEFAULT '{}',           -- {bank_name, account_title, account_number, iban}
  status            TEXT NOT NULL DEFAULT 'unpaid', -- "unpaid", "partial", "paid", "overdue", "waived"
  late_fee          NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id, month, year, fee_period)
);

-- ─── Fee Payments ───────────────────────────────────────────────────────────
-- Individual payment records (a voucher can have multiple partial payments)
CREATE TABLE IF NOT EXISTS fee_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id      UUID NOT NULL REFERENCES fee_vouchers(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  amount          NUMERIC(12,2) NOT NULL,
  payment_method  TEXT NOT NULL DEFAULT 'cash',   -- "cash", "bank", "online", "cheque"
  receipt_number  TEXT,                           -- manual or auto-generated
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  received_by     TEXT,                           -- admin name who collected
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fee_structures_class ON fee_structures(class);
CREATE INDEX IF NOT EXISTS idx_fee_structures_active ON fee_structures(is_active);
CREATE INDEX IF NOT EXISTS idx_fee_vouchers_student ON fee_vouchers(student_id);
CREATE INDEX IF NOT EXISTS idx_fee_vouchers_class ON fee_vouchers(class);
CREATE INDEX IF NOT EXISTS idx_fee_vouchers_status ON fee_vouchers(status);
CREATE INDEX IF NOT EXISTS idx_fee_vouchers_month_year ON fee_vouchers(month, year);
CREATE INDEX IF NOT EXISTS idx_fee_vouchers_due_date ON fee_vouchers(due_date);
CREATE INDEX IF NOT EXISTS idx_fee_payments_voucher ON fee_payments(voucher_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_student ON fee_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_date ON fee_payments(payment_date);

-- ─── Enable RLS ─────────────────────────────────────────────────────────────
ALTER TABLE fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_payments ENABLE ROW LEVEL SECURITY;

-- ─── RLS Policies ───────────────────────────────────────────────────────────

-- fee_structures: admins full access, others read-only
DO $$ BEGIN
  -- Admins
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fee_structures' AND policyname = 'fs_admin_all') THEN
    CREATE POLICY fs_admin_all ON fee_structures
      FOR ALL USING (
        EXISTS (SELECT 1 FROM auth.users WHERE auth.uid() = id)
        AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;

  -- Teachers read
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fee_structures' AND policyname = 'fs_teacher_read') THEN
    CREATE POLICY fs_teacher_read ON fee_structures
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM auth.users WHERE auth.uid() = id)
      );
  END IF;

  -- Students/parents read own class
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fee_structures' AND policyname = 'fs_student_read') THEN
    CREATE POLICY fs_student_read ON fee_structures
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM auth.users WHERE auth.uid() = id)
        AND class = (SELECT class FROM students WHERE id = auth.uid())
      );
  END IF;
END $$;

-- fee_vouchers: admins full access, students read own
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fee_vouchers' AND policyname = 'fv_admin_all') THEN
    CREATE POLICY fv_admin_all ON fee_vouchers
      FOR ALL USING (
        EXISTS (SELECT 1 FROM auth.users WHERE auth.uid() = id)
        AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fee_vouchers' AND policyname = 'fv_student_own') THEN
    CREATE POLICY fv_student_own ON fee_vouchers
      FOR SELECT USING (
        student_id = auth.uid()
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fee_vouchers' AND policyname = 'fv_teacher_read') THEN
    CREATE POLICY fv_teacher_read ON fee_vouchers
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM auth.users WHERE auth.uid() = id)
      );
  END IF;
END $$;

-- fee_payments: admins full access, students read own
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fee_payments' AND policyname = 'fp_admin_all') THEN
    CREATE POLICY fp_admin_all ON fee_payments
      FOR ALL USING (
        EXISTS (SELECT 1 FROM auth.users WHERE auth.uid() = id)
        AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fee_payments' AND policyname = 'fp_student_own') THEN
    CREATE POLICY fp_student_own ON fee_payments
      FOR SELECT USING (
        student_id = auth.uid()
      );
  END IF;
END $$;

-- ─── Seed Default Fee Structures ────────────────────────────────────────────
INSERT INTO fee_structures (class, fee_type, label, amount, is_optional, is_recurring, frequency)
VALUES
  -- Class 6
  ('6', 'tuition',   'Tuition Fee',      0,    FALSE, TRUE, 'monthly'),
  ('6', 'lab',       'Lab Fee',          0,    FALSE, TRUE, 'monthly'),
  ('6', 'library',   'Library Fee',      0,    FALSE, TRUE, 'monthly'),
  ('6', 'transport', 'Transport Fee',    0,    TRUE,  TRUE, 'monthly'),
  ('6', 'exam',      'Exam Fee',         0,    FALSE, TRUE, 'quarterly'),
  ('6', 'admission', 'Admission Fee',    0,    FALSE, FALSE,'one_time'),
  -- Class 7
  ('7', 'tuition',   'Tuition Fee',      0,    FALSE, TRUE, 'monthly'),
  ('7', 'lab',       'Lab Fee',          0,    FALSE, TRUE, 'monthly'),
  ('7', 'library',   'Library Fee',      0,    FALSE, TRUE, 'monthly'),
  ('7', 'transport', 'Transport Fee',    0,    TRUE,  TRUE, 'monthly'),
  ('7', 'exam',      'Exam Fee',         0,    FALSE, TRUE, 'quarterly'),
  ('7', 'admission', 'Admission Fee',    0,    FALSE, FALSE,'one_time'),
  -- Class 8
  ('8', 'tuition',   'Tuition Fee',      0,    FALSE, TRUE, 'monthly'),
  ('8', 'lab',       'Lab Fee',          0,    FALSE, TRUE, 'monthly'),
  ('8', 'library',   'Library Fee',      0,    FALSE, TRUE, 'monthly'),
  ('8', 'transport', 'Transport Fee',    0,    TRUE,  TRUE, 'monthly'),
  ('8', 'exam',      'Exam Fee',         0,    FALSE, TRUE, 'quarterly'),
  ('8', 'admission', 'Admission Fee',    0,    FALSE, FALSE,'one_time'),
  -- Class 9
  ('9', 'tuition',   'Tuition Fee',      0,    FALSE, TRUE, 'monthly'),
  ('9', 'lab',       'Lab Fee',          0,    FALSE, TRUE, 'monthly'),
  ('9', 'library',   'Library Fee',      0,    FALSE, TRUE, 'monthly'),
  ('9', 'transport', 'Transport Fee',    0,    TRUE,  TRUE, 'monthly'),
  ('9', 'exam',      'Exam Fee',         0,    FALSE, TRUE, 'quarterly'),
  ('9', 'admission', 'Admission Fee',    0,    FALSE, FALSE,'one_time'),
  ('9', 'bise',      'BISE Registration',0,    FALSE, FALSE,'one_time'),
  -- Class 10
  ('10', 'tuition',  'Tuition Fee',      0,    FALSE, TRUE, 'monthly'),
  ('10', 'lab',      'Lab Fee',          0,    FALSE, TRUE, 'monthly'),
  ('10', 'library',  'Library Fee',      0,    FALSE, TRUE, 'monthly'),
  ('10', 'transport','Transport Fee',     0,    TRUE,  TRUE, 'monthly'),
  ('10', 'exam',     'Exam Fee',         0,    FALSE, TRUE, 'quarterly'),
  ('10', 'admission','Admission Fee',     0,    FALSE, FALSE,'one_time'),
  ('10', 'bise',     'BISE Registration',0,    FALSE, FALSE,'one_time')
ON CONFLICT (class, fee_type) DO NOTHING;

-- ─── Auto-update updated_at trigger ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fee_structures_updated ON fee_structures;
CREATE TRIGGER trg_fee_structures_updated
  BEFORE UPDATE ON fee_structures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_fee_vouchers_updated ON fee_vouchers;
CREATE TRIGGER trg_fee_vouchers_updated
  BEFORE UPDATE ON fee_vouchers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Function: auto-mark overdue vouchers ───────────────────────────────────
CREATE OR REPLACE FUNCTION mark_overdue_vouchers()
RETURNS void AS $$
BEGIN
  UPDATE fee_vouchers
  SET status = 'overdue'
  WHERE status = 'unpaid'
    AND due_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
