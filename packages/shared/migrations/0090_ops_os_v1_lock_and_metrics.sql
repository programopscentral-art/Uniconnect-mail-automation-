-- ─────────────────────────────────────────────────────────────────────────
-- Ops OS V1: daily lock + V1 metric_dim seeds
-- ─────────────────────────────────────────────────────────────────────────
-- Builds on 0087_ops_os_phase0. Additive only:
--   1. Adds LOCKED to the submission status enum (with lock columns)
--   2. Extends the immutability trigger to protect LOCKED values
--   3. Seeds metric_dim with the 20 V1 DAILY fields
--
-- V1 form fields are hardcoded in the frontend; metric_dim entries here
-- exist solely as FK targets so submission_value rows are valid. The
-- catalog is not a UI config surface in V1.
-- ─────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Add LOCKED to the submission status CHECK constraint
ALTER TABLE ops_os.submission DROP CONSTRAINT IF EXISTS chk_submission_status;
ALTER TABLE ops_os.submission ADD CONSTRAINT chk_submission_status CHECK (
    status IN ('NEW', 'DRAFT', 'SUBMITTED', 'PM_REVIEW', 'SENT_BACK', 'SIGNED_OFF', 'LOCKED', 'RETRACTED')
);

-- 2. Add lock columns to submission
ALTER TABLE ops_os.submission ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE ops_os.submission ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES public.users(id);

-- Index to find SIGNED_OFF submissions for a given period efficiently
-- (used by the daily-lock worker). Partial index keeps it small.
CREATE INDEX IF NOT EXISTS idx_submission_lockable
    ON ops_os.submission (cadence, period_end)
    WHERE status = 'SIGNED_OFF' AND locked_at IS NULL;

-- 3. Extend the immutability trigger to also reject writes when LOCKED
-- (SIGNED_OFF protection already exists; LOCKED is strictly more restrictive)
CREATE OR REPLACE FUNCTION ops_os.fn_prevent_modify_signed_off()
RETURNS TRIGGER AS $$
DECLARE
    sub_status text;
BEGIN
    SELECT status INTO sub_status
    FROM ops_os.submission
    WHERE submission_id = COALESCE(NEW.submission_id, OLD.submission_id)
      AND supersedes IS NULL;

    IF sub_status IN ('SIGNED_OFF', 'LOCKED') THEN
        RAISE EXCEPTION 'ops_os immutability: submission % is % ; values cannot be modified',
            COALESCE(NEW.submission_id, OLD.submission_id), sub_status;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 4. Seed V1 DAILY metric_dim rows.
-- All marked source_kind='manual' for V1 (no auto-fill integrations yet).
-- Form hardcodes display labels + validation; these rows exist only as
-- FK targets for submission_value.
INSERT INTO ops_os.metric_dim
    (metric_id, cadence, section, display_name, value_type, source_kind, is_required)
VALUES
    -- Attendance Heartbeat
    ('daily.attendance.total_enrolled',       'DAILY', 'attendance',  'Total enrolled',           'numeric', 'manual', true),
    ('daily.attendance.present',              'DAILY', 'attendance',  'Present',                  'numeric', 'manual', true),
    ('daily.attendance.absent_authorized',    'DAILY', 'attendance',  'Absent (authorized)',      'numeric', 'manual', true),
    ('daily.attendance.absent_unauthorized',  'DAILY', 'attendance',  'Absent (unauthorized)',    'numeric', 'manual', true),
    -- Academic Delivery
    ('daily.academic.sessions_scheduled',     'DAILY', 'academic',    'Sessions scheduled',       'numeric', 'manual', true),
    ('daily.academic.sessions_conducted',     'DAILY', 'academic',    'Sessions conducted',       'numeric', 'manual', true),
    ('daily.academic.cancellation_notes',     'DAILY', 'academic',    'Cancellation notes',       'text',    'manual', false),
    -- Faculty Status
    ('daily.faculty.expected',                'DAILY', 'faculty',     'Faculty expected',         'numeric', 'manual', true),
    ('daily.faculty.present',                 'DAILY', 'faculty',     'Faculty present',          'numeric', 'manual', true),
    ('daily.faculty.substitution_notes',      'DAILY', 'faculty',     'Substitution notes',       'text',    'manual', false),
    -- Infrastructure
    ('daily.infra.power_status',              'DAILY', 'infra',       'Power status',             'text',    'manual', true),
    ('daily.infra.water_status',              'DAILY', 'infra',       'Water status',             'text',    'manual', true),
    ('daily.infra.connectivity_status',       'DAILY', 'infra',       'Connectivity status',      'text',    'manual', true),
    ('daily.infra.open_issues',               'DAILY', 'infra',       'Open infrastructure issues','text',   'manual', false),
    -- Student-facing operations
    ('daily.student_ops.mess_status',         'DAILY', 'student_ops', 'Mess service status',      'text',    'manual', true),
    ('daily.student_ops.transport_status',    'DAILY', 'student_ops', 'Transport status',         'text',    'manual', true),
    ('daily.student_ops.other_notes',         'DAILY', 'student_ops', 'Other student-ops notes',  'text',    'manual', false),
    -- Incidents
    ('daily.incidents.count',                 'DAILY', 'incidents',   'Incidents today',          'numeric', 'manual', true),
    ('daily.incidents.summary',               'DAILY', 'incidents',   'Incident summary',         'text',    'manual', false),
    -- BOA remark
    ('daily.remark.boa',                      'DAILY', 'remark',      'BOA remark',               'text',    'manual', false)
ON CONFLICT (metric_id) DO NOTHING;

COMMIT;
