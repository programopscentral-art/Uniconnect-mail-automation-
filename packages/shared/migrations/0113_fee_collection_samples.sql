-- Fee Collection v2 — intraday sampling, so "how much did we collect today"
-- is answerable at any hour instead of only the morning after.
--
-- Context: finance enters payments into the sheet from ~8 AM to ~9 PM IST.
-- What existed before could not show progress during that window:
--
--   * fee_collection_snapshot is one row per day, written first-write-wins,
--     so the row for today was captured by the first sync after midnight —
--     before anyone had typed anything. At 3 PM "today" still read as last
--     night's closing number.
--   * fee_daily_university_snapshot froze at 20:00 IST, an hour before the
--     team stops entering, so every day's final number was short.
--   * One sample per day also means one unlucky read poisons the day
--     permanently — 2026-09-03 recorded 5,593 fully paid between 5,736 on
--     the 2nd and 5,763 on the 4th, because that sync landed mid-edit.
--
-- This table takes a per-university sample into a 30-minute bucket on every
-- sync (the sync already runs every 5 minutes, so this is nearly free). The
-- last write in a bucket wins, so a mid-edit read is corrected minutes later
-- rather than becoming the record. Day-over-day deltas then come from
-- comparing the last bucket of one day with the current bucket of the next.

CREATE TABLE IF NOT EXISTS fee_collection_sample (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    window_id      UUID NOT NULL REFERENCES fee_semester_window(id) ON DELETE CASCADE,
    university_id  UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    -- IST calendar day and the 30-minute bucket within it (0 = 00:00–00:29,
    -- 47 = 23:30–23:59). Stored rather than derived so the unique index can
    -- make repeated syncs inside one bucket idempotent.
    ist_date       DATE NOT NULL,
    slot           SMALLINT NOT NULL CHECK (slot BETWEEN 0 AND 47),
    sample_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    strength       INTEGER NOT NULL DEFAULT 0,
    fully_paid     INTEGER NOT NULL DEFAULT 0,
    partially_paid INTEGER NOT NULL DEFAULT 0,
    yet_to_pay     INTEGER NOT NULL DEFAULT 0,
    total_payable  NUMERIC(16,2) NOT NULL DEFAULT 0,
    total_paid     NUMERIC(16,2) NOT NULL DEFAULT 0,
    -- 'sheet' | 'students' | 'mixed' — where the figures came from, so a
    -- delta spanning a source change can be explained rather than puzzled over.
    source         TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS fee_collection_sample_uniq
    ON fee_collection_sample (window_id, university_id, ist_date, slot);
CREATE INDEX IF NOT EXISTS fee_collection_sample_lookup_idx
    ON fee_collection_sample (window_id, ist_date DESC, slot DESC);
