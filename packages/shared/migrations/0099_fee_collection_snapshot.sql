-- Phase 7B.5 — Daily collection snapshot table for trend chart.
--
-- We don't track historical payment values per day on fee_student_payments,
-- so the collection-% trend chart needs its own time-series. One row per
-- (window, snapshot_date) capturing the totals. Inserted by the sync flow
-- idempotently (the UNIQUE constraint takes the first insert that day; later
-- syncs same day are no-ops).

BEGIN;

CREATE TABLE IF NOT EXISTS fee_collection_snapshot (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    window_id           uuid NOT NULL REFERENCES fee_semester_window(id) ON DELETE CASCADE,
    snapshot_date       date NOT NULL,
    students            int  NOT NULL DEFAULT 0,
    fully_paid          int  NOT NULL DEFAULT 0,
    partial             int  NOT NULL DEFAULT 0,
    yet_to_pay          int  NOT NULL DEFAULT 0,
    dropouts            int  NOT NULL DEFAULT 0,
    total_payable       numeric NOT NULL DEFAULT 0,
    total_paid          numeric NOT NULL DEFAULT 0,
    collection_pct_x100 int    NOT NULL DEFAULT 0, -- 73 means 73%
    captured_at         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (window_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_fee_collection_snapshot_window_date
    ON fee_collection_snapshot (window_id, snapshot_date DESC);

COMMIT;
