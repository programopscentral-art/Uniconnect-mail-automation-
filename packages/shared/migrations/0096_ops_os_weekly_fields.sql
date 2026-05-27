-- Phase 5: Weekly cadence — qualitative + holiday metric seeds.
--
-- Quantitative fields (sessions, attendance, incidents, sent-backs etc.)
-- are NOT stored as weekly submission_values — they're computed on the fly
-- from the 7 daily submissions for the same campus + week by the
-- getWeeklyRollup helper. That keeps DAILY as the single source of truth
-- and avoids drift between manually entered weekly numbers vs. their
-- daily components.
--
-- The fields below are the BOA's qualitative commentary that complements
-- the auto-rollup: this week's summary, highlights, concerns, next week's
-- priorities, team morale, and a whole-week holiday flag for sem-break /
-- vacation weeks with nothing to summarize.

BEGIN;

INSERT INTO ops_os.metric_dim (metric_id, cadence, section, display_name, value_type, source_kind, is_required) VALUES
    ('weekly.summary',                   'WEEKLY', 'summary',     'Week summary',                'text',    'manual', true),
    ('weekly.highlights',                'WEEKLY', 'summary',     'Highlights this week',        'text',    'manual', false),
    ('weekly.concerns',                  'WEEKLY', 'summary',     'Concerns / blockers',         'text',    'manual', true),
    ('weekly.next_week_priorities',      'WEEKLY', 'summary',     'Next week priorities',        'text',    'manual', true),
    ('weekly.team_morale',               'WEEKLY', 'summary',     'Team morale',                 'text',    'manual', true),  -- high | medium | low
    ('weekly.major_events',              'WEEKLY', 'summary',     'Major events held',           'text',    'manual', false),
    ('weekly.is_holiday_week',           'WEEKLY', 'day_type',    'Entire week was a holiday',   'boolean', 'manual', false),
    ('weekly.holiday_week_reason',       'WEEKLY', 'day_type',    'Holiday week reason',         'text',    'manual', false)
ON CONFLICT (metric_id) DO NOTHING;

COMMIT;
