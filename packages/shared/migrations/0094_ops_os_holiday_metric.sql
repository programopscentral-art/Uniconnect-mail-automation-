-- ops_os: Holiday flag for daily reports
--
-- Lets a BOA mark "today is a holiday" at the top of the daily report.
-- When set, the rest of the form sections are disabled and submission
-- requires only the flag (plus an optional reason). PM Review and Operations
-- Overview surface a HOLIDAY badge so reviewers know not to expect data.
--
-- Modeled as two metrics under a dedicated 'day_type' section so the
-- existing submission_value plumbing works unchanged.

BEGIN;

INSERT INTO ops_os.metric_dim (metric_id, cadence, section, display_name, value_type, source_kind, is_required) VALUES
    ('daily.day_type.is_holiday',     'DAILY', 'day_type', 'Today is a holiday',     'boolean', 'manual', false),
    ('daily.day_type.holiday_reason', 'DAILY', 'day_type', 'Holiday reason (optional)', 'text', 'manual', false)
ON CONFLICT (metric_id) DO NOTHING;

COMMIT;
