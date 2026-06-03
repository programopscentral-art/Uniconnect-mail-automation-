-- Phase 7B.7 — University name alias table for fee-collection sheet matching.
--
-- The Google Sheet has informal/abbreviated university names ("Takshasila",
-- "ADYPU", "Svyasa", "KKH Batch-2", etc.) that don't fuzzy-match the
-- canonical registry rows ("Takshashila University", "Ajeenkya DY Patil
-- University", "S-VYASA University", "KKH Hyderabad"). Each mismatch
-- drops every student row carrying that university name from the sync.
--
-- The fix: a tiny alias table the sync consults BEFORE the fuzzy matcher.
-- One row per (alias_text, university_id) pair. Pre-normalised alias_key
-- (lowercase, non-alphanumeric stripped) for cheap lookups.
--
-- Maintainable from SQL or a future admin UI. Aliases are case-insensitive
-- and ignore punctuation/spacing differences via the normalised key.

BEGIN;

CREATE TABLE IF NOT EXISTS fee_university_alias (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    alias_text    text NOT NULL,
    alias_key     text NOT NULL,  -- LOWER + strip non-alphanumeric of alias_text
    university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (alias_key)
);

CREATE INDEX IF NOT EXISTS idx_fee_university_alias_key ON fee_university_alias(alias_key);

COMMIT;
