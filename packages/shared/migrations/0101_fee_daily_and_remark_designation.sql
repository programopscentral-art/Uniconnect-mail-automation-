-- Phase 7C — Daily Report lock + Remark designation.
--
-- Two additions for the fee-collection-v2 dashboard:
--
--   1. fee_daily_university_snapshot — a frozen, per-(window, university, date)
--      count table. The existing fee_collection_snapshot is window-level only,
--      which is too coarse for the Daily Report (which needs Fully/Partial per
--      university per day). Rows captured at 20:00 IST are marked locked=true so
--      the day's counts stop moving after 8 PM. The UNIQUE key makes the capture
--      idempotent (a worker restart or manual re-fire is a no-op for the day).
--
--   2. fee_remarks.designation — the job title/designation of whoever added a
--      remark, alongside the existing author_name. Shown in the remarks drawer
--      and included in CSV/XLSX exports next to the proof attachments.

BEGIN;

CREATE TABLE IF NOT EXISTS fee_daily_university_snapshot (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    window_id       uuid NOT NULL REFERENCES fee_semester_window(id) ON DELETE CASCADE,
    university_id   uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    snapshot_date   date NOT NULL,
    total           int     NOT NULL DEFAULT 0,
    fully_paid      int     NOT NULL DEFAULT 0,
    partial         int     NOT NULL DEFAULT 0,
    yet_to_pay      int     NOT NULL DEFAULT 0,
    total_payable   numeric NOT NULL DEFAULT 0,
    total_paid      numeric NOT NULL DEFAULT 0,
    locked          boolean NOT NULL DEFAULT false,
    captured_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (window_id, university_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_fdus_window_date
    ON fee_daily_university_snapshot (window_id, snapshot_date DESC);

ALTER TABLE fee_remarks
    ADD COLUMN IF NOT EXISTS designation text;

COMMIT;
