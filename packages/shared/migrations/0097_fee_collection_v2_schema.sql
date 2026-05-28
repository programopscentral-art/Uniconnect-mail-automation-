-- Phase 7A.1 — Fee Collection v2 schema.
--
-- The old model (`fee_periods` = one (batch, term) per Google Sheet) no
-- longer fits NIAT's actual workflow. The new model is:
--
--   fee_semester_window  = one Google Sheet covering one "semester window"
--                          where multiple batches are running in parallel.
--                          Example sheet: "NIAT 2025 3rd Sem Fee collection"
--                          covers Batch 2024 in Sem 5, Batch 2023 in Sem 6,
--                          Batch 2025 in Sem 3, all at the same time.
--
--   fee_batch_period     = one row per BATCH sub-sheet inside the window.
--                          Sub-sheet name pattern: "YYYY-Semester N"
--                          (e.g. "2024-Semester 5"). Auto-discovered by the
--                          sync worker. Each batch_period holds student
--                          payment rows + per-university date metadata.
--
--   fee_dropout_log      = student dropout tracking sourced from the
--                          window's "dropout" sub-sheet.
--
-- Existing tables (fee_periods, fee_student_payments, fee_remarks,
-- fee_remark_attachments, fee_university_meta) are preserved so legacy
-- data stays browsable. The fee_student_payments / fee_remarks /
-- fee_university_meta tables get a new nullable `batch_period_id` column
-- so the new system can use them alongside the old `period_id`. Rows with
-- batch_period_id set are "v2", rows with period_id set are "v1 legacy".
--
-- Existing active fee_periods rows are flipped to status='archived' so
-- the new UI doesn't pull them. Set status='active' on individual rows
-- if you want them to keep showing in the legacy view.

BEGIN;

-- ── New parent tables ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fee_semester_window (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                     text NOT NULL,                              -- e.g. "NIAT 2025 3rd Sem Window"
    program                  text NOT NULL DEFAULT 'NIAT',
    sheet_id                 text NOT NULL,                              -- Google Sheet ID
    status                   text NOT NULL DEFAULT 'active',             -- active | archived
    auto_sync_enabled        boolean NOT NULL DEFAULT true,
    auto_sync_interval_minutes int NOT NULL DEFAULT 30,
    -- Comma-separated list of expected batch sub-sheet names (one per line
    -- in the UI). Used so the sync knows which tabs to fetch without
    -- needing Google Sheets API auth to list tabs.
    -- Example: '2024-Semester 5\n2023-Semester 6\n2025-Semester 3'
    batch_subsheets          text NOT NULL DEFAULT '',
    -- Names of the special tabs:
    dates_subsheet           text DEFAULT 'semester 3 dates',
    dropout_subsheet         text DEFAULT 'dropout',
    last_synced_at           timestamptz,
    last_sync_error          text,
    last_sync_summary        jsonb,
    created_by               uuid REFERENCES users(id),
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_fsw_status CHECK (status IN ('active', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_fsw_active ON fee_semester_window(status) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS fee_batch_period (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    window_id                uuid NOT NULL REFERENCES fee_semester_window(id) ON DELETE CASCADE,
    batch_start_year         int NOT NULL,                                -- e.g. 2024
    semester_number          int NOT NULL,                                -- e.g. 5
    subsheet_name            text NOT NULL,                               -- exact tab name: "2024-Semester 5"
    display_name             text NOT NULL,                               -- "NIAT Batch 2024 · Semester 5"
    student_count            int NOT NULL DEFAULT 0,                      -- snapshot from last sync
    last_synced_at           timestamptz,
    last_sync_summary        jsonb,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    UNIQUE (window_id, subsheet_name)
);

CREATE INDEX IF NOT EXISTS idx_fbp_window ON fee_batch_period(window_id);
CREATE INDEX IF NOT EXISTS idx_fbp_batch_year ON fee_batch_period(batch_start_year DESC);

CREATE TABLE IF NOT EXISTS fee_dropout_log (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    window_id                uuid NOT NULL REFERENCES fee_semester_window(id) ON DELETE CASCADE,
    batch_period_id          uuid REFERENCES fee_batch_period(id) ON DELETE SET NULL,
    zoho_user_id             text,
    university_id            uuid REFERENCES universities(id) ON DELETE SET NULL,
    student_name             text,
    dropped_at               date,
    reason                   text,
    raw_row                  jsonb,
    imported_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (window_id, zoho_user_id)
);

CREATE INDEX IF NOT EXISTS idx_fdl_window ON fee_dropout_log(window_id);
CREATE INDEX IF NOT EXISTS idx_fdl_batch_period ON fee_dropout_log(batch_period_id);

-- ── Add batch_period_id to existing tables so the new system can use
--    them alongside old period_id-based data ────────────────────────────

-- fee_student_payments existed with period_id. New rows use batch_period_id.
-- Also add a few columns the new model needs:
--   discount, previous_fee_due, tag_case, registration_status, current_term_discount
ALTER TABLE fee_student_payments
    ADD COLUMN IF NOT EXISTS batch_period_id    uuid REFERENCES fee_batch_period(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS previous_fee_due   numeric,
    ADD COLUMN IF NOT EXISTS current_term_discount numeric,
    ADD COLUMN IF NOT EXISTS registration_status text,
    ADD COLUMN IF NOT EXISTS tag_case           text;

-- The UNIQUE (period_id, zoho_user_id) constraint is too strict for v2 —
-- a student can appear in multiple windows over time. Add a v2-specific
-- unique that's bounded by batch_period instead.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fsp_batch_period_user
    ON fee_student_payments (batch_period_id, zoho_user_id)
    WHERE batch_period_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fsp_batch_period ON fee_student_payments(batch_period_id);

-- Make period_id nullable so v2 rows don't need a legacy period
ALTER TABLE fee_student_payments
    ALTER COLUMN period_id DROP NOT NULL;

-- fee_university_meta becomes per-(batch_period, university) in v2,
-- driven by the "semester N dates" sub-sheet.
ALTER TABLE fee_university_meta
    ADD COLUMN IF NOT EXISTS batch_period_id uuid REFERENCES fee_batch_period(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sem_last_date text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fum_batch_period_uni
    ON fee_university_meta (batch_period_id, university_id)
    WHERE batch_period_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fum_batch_period ON fee_university_meta(batch_period_id);

ALTER TABLE fee_university_meta
    ALTER COLUMN period_id DROP NOT NULL;

-- ── Archive legacy fee_periods ───────────────────────────────────────────
-- All currently-active legacy periods get flipped to archived so the new
-- UI doesn't see them. Admins can flip individual ones back if needed.

UPDATE fee_periods SET status = 'archived', updated_at = now()
 WHERE status = 'active';

COMMIT;
