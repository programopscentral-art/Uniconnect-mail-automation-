-- Fee Collection v2 — make the app mirror the source Google Sheet exactly.
--
-- Two problems this addresses:
--
-- 1. The sheet's manually-maintained `Payment Status` column was read and then
--    thrown away; status was recomputed as `paid >= payable`. Finance marks a
--    student "Fully Paid" when they are a token amount short (settled, waived,
--    rounding), so the app under-reported Fully Paid on almost every
--    university (NIAT Chevella 82 vs the sheet's 165). We now trust the typed
--    value and keep the raw text alongside it for audit.
--
-- 2. Only 3 of the 20 university rows on the sheet's `dashboard` tab still
--    have per-student sub-sheets (ADYPU, KKH Batch-1/2). The other 17 are
--    maintained as dashboard rows only, so no amount of per-student
--    aggregation can reproduce them. fee_university_summary ingests that
--    dashboard tab verbatim and becomes the authoritative per-(batch,
--    university) figure wherever it exists.

ALTER TABLE fee_student_payments
    ADD COLUMN IF NOT EXISTS status_sheet TEXT;

COMMENT ON COLUMN fee_student_payments.status_sheet IS
    'Payment Status exactly as typed in the source sheet (NULL when blank). `status` is this value normalized, falling back to a paid/payable computation.';

ALTER TABLE fee_semester_window
    ADD COLUMN IF NOT EXISTS dashboard_subsheet TEXT;

COMMENT ON COLUMN fee_semester_window.dashboard_subsheet IS
    'Name of the sheet tab holding the per-university roll-up (University / batch / Payable / Paid / counts / Total Strength). Authoritative for the Overview.';

CREATE TABLE IF NOT EXISTS fee_university_summary (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    window_id         UUID NOT NULL REFERENCES fee_semester_window(id) ON DELETE CASCADE,
    batch_period_id   UUID REFERENCES fee_batch_period(id) ON DELETE CASCADE,
    university_id     UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    sheet_label       TEXT,          -- university name exactly as the sheet writes it
    batch_label       TEXT,          -- "batch-3" etc, as the sheet writes it
    strength          INTEGER NOT NULL DEFAULT 0,
    fully_paid        INTEGER NOT NULL DEFAULT 0,
    partially_paid    INTEGER NOT NULL DEFAULT 0,
    yet_to_pay        INTEGER NOT NULL DEFAULT 0,
    dropout_count     INTEGER NOT NULL DEFAULT 0,
    total_payable     NUMERIC(16,2) NOT NULL DEFAULT 0,
    total_paid        NUMERIC(16,2) NOT NULL DEFAULT 0,
    fully_paid_pct_x100 INTEGER,     -- the sheet's own "Fully Paid %" × 100
    registration_date TEXT,
    registration_status TEXT,
    remarks           TEXT,
    synced_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fee_university_summary_uniq
    ON fee_university_summary (window_id, batch_period_id, university_id);
CREATE INDEX IF NOT EXISTS fee_university_summary_window_idx
    ON fee_university_summary (window_id);

-- "Mallareddy" on the dashboard tab fuzzy-matches BOTH "Malla Reddy
-- University" and "Malla Reddy Vishwavidyapeeth"; pin it so the resolution
-- can't flip with row order.
INSERT INTO fee_university_alias (alias_key, alias_text, university_id)
SELECT 'mallareddy', 'Mallareddy', id FROM universities WHERE name = 'Malla Reddy University'
ON CONFLICT (alias_key) DO NOTHING;
