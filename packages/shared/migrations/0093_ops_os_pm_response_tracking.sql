-- ops_os Phase 4: PM response tracking + auto-sign-off
--
-- Adds:
--   1. ops_os.submission.auto_signed_off — true if system signed off because
--      PM didn't respond by the 6:30 PM IST deadline. Distinguishes
--      genuine PM approvals from system fallbacks.
--   2. ops_os.user_campus_assignment.non_response_count — rolling counter
--      incremented every time the PM misses their sign-off window for an
--      assignment. Visible in COS / leadership dashboards.
--   3. ops_os.reminder_dispatch — tracks which reminder emails have been
--      sent for which (campus, period_start, kind) to prevent duplicate
--      sends within a day.

-- 1. Auto-sign-off flag on submission
ALTER TABLE ops_os.submission
    ADD COLUMN IF NOT EXISTS auto_signed_off boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_submission_auto_signed_off
    ON ops_os.submission(auto_signed_off)
    WHERE auto_signed_off = true;

-- 2. PM responsiveness counter on user_campus_assignment
ALTER TABLE ops_os.user_campus_assignment
    ADD COLUMN IF NOT EXISTS non_response_count integer NOT NULL DEFAULT 0;

ALTER TABLE ops_os.user_campus_assignment
    ADD COLUMN IF NOT EXISTS last_non_response_at timestamptz;

-- 3. Reminder dispatch dedupe table
CREATE TABLE IF NOT EXISTS ops_os.reminder_dispatch (
    reminder_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind             text NOT NULL,
    period_start     date NOT NULL,
    campus_id        uuid REFERENCES ops_os.campus_dim(campus_id),
    submission_id    uuid REFERENCES ops_os.submission(submission_id),
    recipient_user_id uuid NOT NULL REFERENCES public.users(id),
    sent_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_reminder_kind CHECK (kind IN (
        'boa_submit_due_soon',
        'pm_review_open',
        'pm_review_final',
        'pm_auto_signed_off_notice',
        'cos_auto_signed_off_alert'
    ))
);

-- Unique to dedupe same reminder fired twice in one day for same user
CREATE UNIQUE INDEX IF NOT EXISTS idx_reminder_dispatch_dedupe
    ON ops_os.reminder_dispatch(kind, period_start, recipient_user_id, COALESCE(campus_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS idx_reminder_dispatch_period
    ON ops_os.reminder_dispatch(period_start DESC);
