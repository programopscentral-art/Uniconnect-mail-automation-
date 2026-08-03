-- Exam-paper approval workflow.
--
-- A creator (e.g. BOA) builds a paper and clicks "Send for Approval", which
-- notifies the SMEs to review/edit. SMEs can then approve. Track the state +
-- who/when on the paper itself.
--
--   approval_status: 'draft' (default) | 'pending_review' | 'approved'

BEGIN;

ALTER TABLE assessment_papers
    ADD COLUMN IF NOT EXISTS approval_status     text NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS sent_for_review_at  timestamptz,
    ADD COLUMN IF NOT EXISTS sent_for_review_by  uuid,
    ADD COLUMN IF NOT EXISTS reviewed_at         timestamptz,
    ADD COLUMN IF NOT EXISTS reviewed_by         uuid;

COMMIT;
