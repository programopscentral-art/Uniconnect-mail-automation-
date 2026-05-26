-- ─────────────────────────────────────────────────────────────────────────
-- Ops OS V2 daily form: expanded metric_dim seeds
-- ─────────────────────────────────────────────────────────────────────────
-- Adds the granular fields the operational design needs:
--   Section 2: success coaches + program ops attendance (paired X/Y)
--   Section 3: structured cancellation reason
--   Section 4: faculty absent count, replacement-assigned enum, SOP breach
--   Section 5: split infra into Wi-Fi / AV / Cleanliness / Electricity
--   Section 6: hostel issues, transport incidents, escalation counts
--   Section 7: explode incidents into PoSH/PoCSO, anti-ragging, safety,
--              parent complaint, CEO-visible — each Y/N with optional text
--
-- All seeded with source_kind='manual' for V2 (no real auto-fill
-- integrations yet — the UI shows AUTO labels for intent only; the
-- backend treats them as manual fields).
--
-- Additive only; ON CONFLICT DO NOTHING. Existing 20 V1 fields keep working.
-- ─────────────────────────────────────────────────────────────────────────

BEGIN;

INSERT INTO ops_os.metric_dim
    (metric_id, cadence, section, display_name, value_type, source_kind, is_required)
VALUES
    -- ── Section 2 · Attendance Heartbeat (new paired counts) ────────────
    ('daily.attendance.success_coaches_present', 'DAILY', 'attendance',  'Success coaches present', 'numeric', 'manual', true),
    ('daily.attendance.success_coaches_total',   'DAILY', 'attendance',  'Success coaches total',   'numeric', 'manual', true),
    ('daily.attendance.program_ops_present',     'DAILY', 'attendance',  'Program ops present',     'numeric', 'manual', true),
    ('daily.attendance.program_ops_total',       'DAILY', 'attendance',  'Program ops total',       'numeric', 'manual', true),

    -- ── Section 3 · Academic Delivery (structured cancellation reason) ──
    -- Enum stored as text: faculty_absent / infra_issue / holiday / student_absence / other
    ('daily.academic.cancellation_reason',  'DAILY', 'academic', 'Cancellation reason', 'text', 'manual', false),

    -- ── Section 4 · Faculty Status (granular) ───────────────────────────
    ('daily.faculty.absent_count',          'DAILY', 'faculty', 'Faculty absent today (count)', 'numeric', 'manual', true),
    ('daily.faculty.replacement_assigned',  'DAILY', 'faculty', 'Replacement assigned',         'text',    'manual', false),  -- yes | partial | no
    ('daily.faculty.absences_exceeding_sop','DAILY', 'faculty', 'Absences exceeding 2-day SOP', 'numeric', 'manual', true),

    -- ── Section 5 · Infrastructure (split into 4 systems) ───────────────
    ('daily.infra.wifi_status',          'DAILY', 'infra', 'Wi-Fi / ISP / bandwidth',          'text', 'manual', true),   -- ok | degraded | down
    ('daily.infra.av_status',            'DAILY', 'infra', 'TV / AV in classrooms',            'text', 'manual', true),   -- ok | partial | down
    ('daily.infra.av_notes',             'DAILY', 'infra', 'AV notes',                         'text', 'manual', false),
    ('daily.infra.cleanliness_status',   'DAILY', 'infra', 'Cleanliness — classroom / washroom / campus', 'text', 'manual', true),  -- ok | issues
    ('daily.infra.cleanliness_notes',    'DAILY', 'infra', 'Cleanliness notes',                'text', 'manual', false),
    ('daily.infra.electricity_status',   'DAILY', 'infra', 'Electricity / UPS / generator',    'text', 'manual', true),   -- ok | backup_engaged | down

    -- ── Section 6 · Student-Facing Operations (counts) ──────────────────
    ('daily.student_ops.hostel_issues_count',     'DAILY', 'student_ops', 'Hostel issues',           'numeric', 'manual', true),
    ('daily.student_ops.transport_incidents_count','DAILY', 'student_ops', 'Transport incidents',    'numeric', 'manual', true),
    ('daily.student_ops.escalations_opened',      'DAILY', 'student_ops', 'Escalations opened',      'numeric', 'manual', true),
    ('daily.student_ops.escalations_closed',      'DAILY', 'student_ops', 'Escalations closed',      'numeric', 'manual', true),

    -- ── Section 7 · Incidents & Safety (granular Y/N + text) ────────────
    -- Each yes auto-routes (eventually) to HR + designated owner.
    -- Form copy warns: "Be specific. Do not name parties."
    ('daily.incidents.posh_pocso',          'DAILY', 'incidents', 'PoSH / PoCSO concern',     'boolean', 'manual', true),
    ('daily.incidents.posh_pocso_text',     'DAILY', 'incidents', 'PoSH / PoCSO context',     'text',    'manual', false),
    ('daily.incidents.anti_ragging',        'DAILY', 'incidents', 'Anti-ragging / bullying',  'boolean', 'manual', true),
    ('daily.incidents.anti_ragging_text',   'DAILY', 'incidents', 'Anti-ragging context',     'text',    'manual', false),
    ('daily.incidents.safety_on_campus',    'DAILY', 'incidents', 'Safety incident on campus','boolean', 'manual', true),
    ('daily.incidents.safety_text',         'DAILY', 'incidents', 'Safety incident context',  'text',    'manual', false),
    ('daily.incidents.parent_complaint',    'DAILY', 'incidents', 'Parent complaint escalated','boolean','manual', true),
    ('daily.incidents.parent_complaint_text','DAILY', 'incidents', 'Parent complaint context','text',    'manual', false),
    ('daily.incidents.ceo_visible',         'DAILY', 'incidents', 'CEO-visible incident',     'boolean', 'manual', true),
    ('daily.incidents.ceo_visible_text',    'DAILY', 'incidents', 'CEO-visible context',      'text',    'manual', false)

ON CONFLICT (metric_id) DO NOTHING;

COMMIT;
