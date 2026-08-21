-- Petty Cash Management module.
--
-- Extends the Budget/Finance Ops surface with the full petty-cash lifecycle:
--   request → approval → disbursement → bill → verification → settlement.
--
-- Built as its own self-contained request spine (petty_cash_requests) that
-- REUSES the Budget Proposals *patterns* (approval state machine, notifications,
-- audit log, university scoping, role→permission gating) in code — without
-- retrofitting request_type into the live budget_proposals table.
--
-- State machine:
--   DRAFT → SUBMITTED → APPROVED → DISBURSED → BILL_SUBMITTED
--         → BILL_VERIFIED → SETTLED → CLOSED
--   branches: SUBMITTED → SENT_BACK → DRAFT
--             SUBMITTED → REJECTED           (terminal)
--             APPROVED  → CANCELLED          (before money moves; terminal)

BEGIN;

-- 1. Status enum
DO $$ BEGIN
    CREATE TYPE petty_cash_status AS ENUM (
        'DRAFT', 'SUBMITTED', 'APPROVED', 'DISBURSED', 'BILL_SUBMITTED',
        'BILL_VERIFIED', 'SETTLED', 'CLOSED', 'SENT_BACK', 'REJECTED', 'CANCELLED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Human-readable request number: PC-<year>-<zero-padded global seq>
CREATE SEQUENCE IF NOT EXISTS petty_cash_no_seq START 1;

-- 2. Request spine
CREATE TABLE IF NOT EXISTS petty_cash_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_no text UNIQUE,
    university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    requester_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requester_name text,
    requester_email text NOT NULL,
    purpose text NOT NULL,
    category text NOT NULL DEFAULT 'MISC',
    payee_vendor text,
    amount_requested decimal(12,2) NOT NULL DEFAULT 0,
    needed_by date,
    linked_activity text,
    status petty_cash_status NOT NULL DEFAULT 'DRAFT',
    -- Denormalised bill deadline (set at disbursement) so the overdue flag is a
    -- pure query, not a nightly write.
    bill_due_on date,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pc_requests_univ ON petty_cash_requests(university_id);
CREATE INDEX IF NOT EXISTS idx_pc_requests_status ON petty_cash_requests(status);
CREATE INDEX IF NOT EXISTS idx_pc_requests_requester ON petty_cash_requests(requester_user_id);

-- 3. Approvals — Satish's decision, as a first-class event
CREATE TABLE IF NOT EXISTS petty_cash_approvals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL REFERENCES petty_cash_requests(id) ON DELETE CASCADE,
    approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
    approved_by_name text,
    approved_at timestamptz,
    amount_approved decimal(12,2) NOT NULL DEFAULT 0,
    -- IN_APP is auditable; offline channels require evidence + a distinct recorder.
    approval_channel text NOT NULL DEFAULT 'IN_APP', -- IN_APP | WHATSAPP | CALL | EMAIL
    evidence_url text,
    recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
    recorded_by_name text,
    remarks text,
    created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pc_approvals_req ON petty_cash_approvals(request_id);

-- 4. Disbursements — the money actually leaving
CREATE TABLE IF NOT EXISTS petty_cash_disbursements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL REFERENCES petty_cash_requests(id) ON DELETE CASCADE,
    amount_paid decimal(12,2) NOT NULL DEFAULT 0,
    paid_on date NOT NULL DEFAULT CURRENT_DATE,
    payment_mode text NOT NULL DEFAULT 'UPI', -- UPI | NEFT | CASH
    reference_no text, -- UTR / transaction ref (or acknowledgement id for CASH)
    proof_url text,
    paid_by uuid REFERENCES users(id) ON DELETE SET NULL,
    paid_by_name text,
    created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pc_disb_req ON petty_cash_disbursements(request_id);

-- 5. Bills — proof of what the money bought
CREATE TABLE IF NOT EXISTS petty_cash_bills (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL REFERENCES petty_cash_requests(id) ON DELETE CASCADE,
    bill_no text,
    bill_date date,
    vendor text,
    bill_amount decimal(12,2) NOT NULL DEFAULT 0,
    file_url text,
    file_name text,
    source text NOT NULL DEFAULT 'UPLOAD', -- UPLOAD | EMAIL
    status text NOT NULL DEFAULT 'PENDING', -- PENDING | VERIFIED | REJECTED
    verified_by uuid REFERENCES users(id) ON DELETE SET NULL,
    verified_by_name text,
    verified_on timestamptz,
    uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pc_bills_req ON petty_cash_bills(request_id);

-- 6. Settlements — closing the loop on the rupee difference
CREATE TABLE IF NOT EXISTS petty_cash_settlements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL REFERENCES petty_cash_requests(id) ON DELETE CASCADE,
    spent_amount decimal(12,2) NOT NULL DEFAULT 0,
    balance_amount decimal(12,2) NOT NULL DEFAULT 0,
    direction text NOT NULL DEFAULT 'RETURNED', -- RETURNED | TOPPED_UP | EXACT
    settled_on date NOT NULL DEFAULT CURRENT_DATE,
    reference text,
    reason_code text,
    settled_by uuid REFERENCES users(id) ON DELETE SET NULL,
    settled_by_name text,
    created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pc_settle_req ON petty_cash_settlements(request_id);

-- 7. Eligibility register — who is a 'trusted employee' and up to how much
CREATE TABLE IF NOT EXISTS petty_cash_eligibility (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    university_id uuid REFERENCES universities(id) ON DELETE CASCADE,
    max_per_request decimal(12,2) NOT NULL DEFAULT 10000,
    max_open_advance decimal(12,2) NOT NULL DEFAULT 15000,
    effective_from date DEFAULT CURRENT_DATE,
    effective_to date,
    granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
    granted_by_name text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (user_id, university_id)
);

-- 8. Audit log — immutable event trail per request
CREATE TABLE IF NOT EXISTS petty_cash_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL REFERENCES petty_cash_requests(id) ON DELETE CASCADE,
    action text NOT NULL,
    from_status text,
    to_status text,
    actor_id uuid,
    actor_name text,
    note text,
    created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pc_audit_req ON petty_cash_audit_log(request_id);

-- ── Invariants enforced in the database, not the UI ──────────────────────────

-- Invariant 1 + 2: no disbursement without an approval, and the payment can
-- never exceed the approved amount.
CREATE OR REPLACE FUNCTION pc_check_disbursement() RETURNS trigger AS $$
DECLARE approved numeric;
BEGIN
    SELECT MAX(a.amount_approved) INTO approved
      FROM petty_cash_approvals a
     WHERE a.request_id = NEW.request_id AND a.approved_at IS NOT NULL;
    IF approved IS NULL THEN
        RAISE EXCEPTION 'Cannot disburse: request % has no recorded approval', NEW.request_id;
    END IF;
    IF ROUND(NEW.amount_paid, 2) > ROUND(approved, 2) THEN
        RAISE EXCEPTION 'Disbursement (%) exceeds approved amount (%); a higher spend needs a fresh top-up approval', NEW.amount_paid, approved;
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pc_check_disbursement ON petty_cash_disbursements;
CREATE TRIGGER trg_pc_check_disbursement
    BEFORE INSERT OR UPDATE ON petty_cash_disbursements
    FOR EACH ROW EXECUTE FUNCTION pc_check_disbursement();

-- Invariant 3: the settlement identity always balances
-- (spent_amount + balance_amount = total disbursed for the request).
CREATE OR REPLACE FUNCTION pc_check_settlement() RETURNS trigger AS $$
DECLARE paid numeric;
BEGIN
    SELECT COALESCE(SUM(amount_paid), 0) INTO paid
      FROM petty_cash_disbursements WHERE request_id = NEW.request_id;
    IF ROUND(NEW.spent_amount + NEW.balance_amount, 2) <> ROUND(paid, 2) THEN
        RAISE EXCEPTION 'Settlement must balance: spent (%) + balance (%) must equal disbursed (%)',
            NEW.spent_amount, NEW.balance_amount, paid;
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pc_check_settlement ON petty_cash_settlements;
CREATE TRIGGER trg_pc_check_settlement
    BEFORE INSERT OR UPDATE ON petty_cash_settlements
    FOR EACH ROW EXECUTE FUNCTION pc_check_settlement();

-- ── Permissions: grant the 'petty-cash' feature to the finance-facing roles ──
UPDATE role_permissions
   SET features = features || '["petty-cash"]'::jsonb, updated_at = NOW()
 WHERE role IN ('ADMIN','PROGRAM_OPS','CMA_MANAGER','CMA','UNIVERSITY_OPERATOR','COS','PM','PMA','BOA')
   AND NOT (features ? 'petty-cash');

COMMIT;
