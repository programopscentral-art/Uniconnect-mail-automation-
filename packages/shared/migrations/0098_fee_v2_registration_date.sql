-- Phase 7A.7 — Fee Collection v2: add per-student registration_date column.
--
-- The sheet spec defines a "registration date" column per STUDENT (in the
-- batch sub-sheets), but fee_student_payments only had registration_status.
-- Migration 0097 missed adding the date column, so syncing any window
-- failed with:
--   column "registration_date" of relation "fee_student_payments" does not exist
--
-- The legacy fee_university_meta table has a UNIVERSITY-level
-- registration_date column already — leave that alone; this is the
-- per-student field used by v2.

BEGIN;

ALTER TABLE fee_student_payments
    ADD COLUMN IF NOT EXISTS registration_date date;

COMMIT;
