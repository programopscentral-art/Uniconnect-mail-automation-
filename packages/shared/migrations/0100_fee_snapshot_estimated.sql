-- Phase 7B.6 — Mark synthetic (interpolated) snapshots as is_estimated
-- so the trend chart can render them with a different style (dashed line
-- + lighter dot) and the operator knows which values are real captured
-- snapshots vs. backfilled estimates from before the snapshot system
-- existed.

BEGIN;

ALTER TABLE fee_collection_snapshot
    ADD COLUMN IF NOT EXISTS is_estimated boolean NOT NULL DEFAULT false;

COMMIT;
