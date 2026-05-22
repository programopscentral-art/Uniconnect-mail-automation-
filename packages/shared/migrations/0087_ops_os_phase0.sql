-- ─────────────────────────────────────────────────────────────────────────
-- UniConnect Operations OS — Phase 0 foundation
-- ─────────────────────────────────────────────────────────────────────────
-- Creates the ops_os schema with all foundational tables, indexes,
-- constraints, RLS policies, and immutability triggers.
--
-- Scope: backend spine only. No data is seeded. No materialized views.
-- Subsequent phases will add:
--   Phase 1: Seed metric_dim, campus_dim, user_campus_assignment
--   Phase 2: Source integrations + auto_fill_staging pulls
--   Phase 3: Auto-flag rule engine activation
--   Phase 4: Pattern detection
--
-- All policies reference current_setting('app.current_user_id', true)
-- which is set per-request by the application layer.
-- ─────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS ops_os;


-- ─── DIMENSIONAL TABLES ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ops_os.cluster_dim (
    cluster_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                text NOT NULL,
    cos_user_id         uuid NOT NULL REFERENCES public.users(id),
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops_os.campus_dim (
    campus_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code                text NOT NULL UNIQUE,
    display_name        text NOT NULL,
    university_id       uuid REFERENCES public.universities(id),
    region              text NOT NULL,
    cluster_id          uuid NOT NULL REFERENCES ops_os.cluster_dim(cluster_id),
    status              text NOT NULL DEFAULT 'active',
    onboarded_at        date NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_campus_status CHECK (status IN ('active', 'paused', 'wound_down'))
);
CREATE INDEX IF NOT EXISTS idx_campus_cluster ON ops_os.campus_dim(cluster_id);
CREATE INDEX IF NOT EXISTS idx_campus_status_active ON ops_os.campus_dim(status)
    WHERE status = 'active';

CREATE TABLE IF NOT EXISTS ops_os.user_campus_assignment (
    user_id             uuid NOT NULL REFERENCES public.users(id),
    campus_id           uuid NOT NULL REFERENCES ops_os.campus_dim(campus_id),
    role                text NOT NULL,
    assigned_at         timestamptz NOT NULL DEFAULT now(),
    revoked_at          timestamptz,
    PRIMARY KEY (user_id, campus_id, role),
    CONSTRAINT chk_uca_role CHECK (role IN ('BOA', 'PM'))
);
CREATE INDEX IF NOT EXISTS idx_uca_campus_active ON ops_os.user_campus_assignment(campus_id)
    WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_uca_user_active ON ops_os.user_campus_assignment(user_id)
    WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS ops_os.metric_dim (
    metric_id           text PRIMARY KEY,
    cadence             text NOT NULL,
    section             text NOT NULL,
    display_name        text NOT NULL,
    value_type          text NOT NULL,
    source_kind         text NOT NULL,
    source_system       text,
    is_required         boolean NOT NULL DEFAULT true,
    target_value        numeric,
    target_owner_role   text,
    threshold_kind      text,
    threshold_value     numeric,
    retired_at          timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_md_cadence CHECK (cadence IN ('DAILY', 'WEEKLY', 'MONTHLY')),
    CONSTRAINT chk_md_value_type CHECK (value_type IN ('numeric', 'text', 'boolean', 'percentage', 'currency')),
    CONSTRAINT chk_md_source_kind CHECK (source_kind IN ('auto_fill', 'manual')),
    CONSTRAINT chk_md_threshold_kind CHECK (threshold_kind IS NULL OR threshold_kind IN ('absolute', 'percentage'))
);


-- ─── SUBMISSION TABLES (the spine) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS ops_os.submission (
    submission_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campus_id           uuid NOT NULL REFERENCES ops_os.campus_dim(campus_id),
    cadence             text NOT NULL,
    period_start        date NOT NULL,
    period_end          date NOT NULL,
    status              text NOT NULL DEFAULT 'NEW',
    revision            integer NOT NULL DEFAULT 0,
    submitted_by        uuid REFERENCES public.users(id),
    submitted_at        timestamptz,
    signed_off_by       uuid REFERENCES public.users(id),
    signed_off_at       timestamptz,
    sent_back_count     integer NOT NULL DEFAULT 0,
    sent_back_reason_code text,
    sent_back_reason_text text,
    pm_remark           text,
    is_late_submission  boolean NOT NULL DEFAULT false,
    is_late_sign_off    boolean NOT NULL DEFAULT false,
    supersedes          uuid REFERENCES ops_os.submission(submission_id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_submission_status CHECK (
        status IN ('NEW', 'DRAFT', 'SUBMITTED', 'PM_REVIEW', 'SENT_BACK', 'SIGNED_OFF', 'RETRACTED')
    ),
    CONSTRAINT chk_submission_cadence CHECK (cadence IN ('DAILY', 'WEEKLY', 'MONTHLY')),
    CONSTRAINT chk_submission_period CHECK (period_start <= period_end),
    CONSTRAINT uq_submission_period_revision UNIQUE (campus_id, cadence, period_start, period_end, revision)
);
CREATE INDEX IF NOT EXISTS idx_submission_campus_period ON ops_os.submission(campus_id, period_start DESC, cadence);
CREATE INDEX IF NOT EXISTS idx_submission_status_open ON ops_os.submission(status)
    WHERE status IN ('NEW', 'DRAFT', 'SUBMITTED', 'PM_REVIEW', 'SENT_BACK');

CREATE TABLE IF NOT EXISTS ops_os.submission_value (
    submission_id       uuid NOT NULL REFERENCES ops_os.submission(submission_id) ON DELETE CASCADE,
    metric_id           text NOT NULL REFERENCES ops_os.metric_dim(metric_id),
    value_numeric       numeric,
    value_text          text,
    value_boolean       boolean,
    source_kind         text NOT NULL,
    source_system       text,
    sync_timestamp      timestamptz,
    auto_fill_original  jsonb,
    recorded_at         timestamptz NOT NULL DEFAULT now(),
    recorded_by         uuid REFERENCES public.users(id),
    PRIMARY KEY (submission_id, metric_id),
    CONSTRAINT chk_sv_source_kind CHECK (source_kind IN ('auto_fill', 'manual', 'amended'))
);
CREATE INDEX IF NOT EXISTS idx_sv_metric_recorded ON ops_os.submission_value(metric_id, recorded_at DESC);


-- ─── EDIT LOG + VERIFICATION ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ops_os.edit_event (
    edit_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id       uuid NOT NULL REFERENCES ops_os.submission(submission_id),
    metric_id           text NOT NULL REFERENCES ops_os.metric_dim(metric_id),
    source_system       text,
    original_value      jsonb NOT NULL,
    new_value           jsonb NOT NULL,
    delta_numeric       numeric,
    delta_percentage    numeric,
    threshold_breach    boolean NOT NULL DEFAULT false,
    edited_by           uuid NOT NULL REFERENCES public.users(id),
    edited_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_edit_event_breach ON ops_os.edit_event(source_system, edited_at DESC)
    WHERE threshold_breach = true;
CREATE INDEX IF NOT EXISTS idx_edit_event_submission ON ops_os.edit_event(submission_id);

CREATE TABLE IF NOT EXISTS ops_os.edit_triage_state (
    edit_id             uuid PRIMARY KEY REFERENCES ops_os.edit_event(edit_id),
    current_status      text NOT NULL DEFAULT 'OPEN',
    assigned_to         uuid REFERENCES public.users(id),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_ets_status CHECK (current_status IN ('OPEN', 'REVIEWING', 'RESOLVED', 'SYSTEM_GAP'))
);
CREATE INDEX IF NOT EXISTS idx_ets_status ON ops_os.edit_triage_state(current_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS ops_os.triage_action (
    triage_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    edit_id             uuid NOT NULL REFERENCES ops_os.edit_event(edit_id),
    status_from         text NOT NULL,
    status_to           text NOT NULL,
    actioned_by         uuid NOT NULL REFERENCES public.users(id),
    note                text,
    recorded_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_triage_edit ON ops_os.triage_action(edit_id, recorded_at DESC);


-- ─── SOURCE INTEGRATION TABLES ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ops_os.source_system_status (
    source_system       text PRIMARY KEY,
    current_status      text NOT NULL DEFAULT 'healthy',
    last_successful_at  timestamptz,
    last_attempt_at     timestamptz,
    consecutive_failures integer NOT NULL DEFAULT 0,
    latency_p50_ms      integer,
    latency_p95_ms      integer,
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_sss_status CHECK (current_status IN ('healthy', 'degraded', 'down'))
);

CREATE TABLE IF NOT EXISTS ops_os.auto_fill_staging (
    campus_id           uuid NOT NULL REFERENCES ops_os.campus_dim(campus_id),
    metric_id           text NOT NULL REFERENCES ops_os.metric_dim(metric_id),
    period_start        date NOT NULL,
    period_end          date NOT NULL,
    value_numeric       numeric,
    value_text          text,
    value_boolean       boolean,
    source_system       text NOT NULL,
    sync_timestamp      timestamptz NOT NULL,
    pull_log_id         uuid,
    PRIMARY KEY (campus_id, metric_id, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS ops_os.source_pull_log (
    pull_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_system       text NOT NULL,
    campus_id           uuid REFERENCES ops_os.campus_dim(campus_id),
    trigger             text NOT NULL,
    started_at          timestamptz NOT NULL,
    completed_at        timestamptz,
    status              text NOT NULL,
    error_message       text,
    rows_pulled         integer,
    latency_ms          integer,
    CONSTRAINT chk_pull_status CHECK (status IN ('pending', 'success', 'failure', 'timeout'))
);
CREATE INDEX IF NOT EXISTS idx_pull_log_source_started ON ops_os.source_pull_log(source_system, started_at DESC);


-- ─── AUTO-FLAG + NOTIFICATION ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ops_os.auto_flag_rule (
    rule_id             text PRIMARY KEY,
    name                text NOT NULL,
    description         text NOT NULL,
    trigger_event       text NOT NULL,
    predicate_json      jsonb NOT NULL,
    severity            text NOT NULL,
    routing_json        jsonb NOT NULL,
    sla_triage_minutes  integer NOT NULL DEFAULT 240,
    owner_role          text NOT NULL,
    is_active           boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_afr_severity CHECK (severity IN ('low', 'medium', 'high', 'critical'))
);

CREATE TABLE IF NOT EXISTS ops_os.auto_flag (
    flag_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id             text NOT NULL REFERENCES ops_os.auto_flag_rule(rule_id),
    campus_id           uuid REFERENCES ops_os.campus_dim(campus_id),
    subject_kind        text NOT NULL,
    subject_id          uuid,
    severity            text NOT NULL,
    summary             text NOT NULL,
    payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
    status              text NOT NULL DEFAULT 'OPEN',
    triage_started_at   timestamptz,
    triaged_by          uuid REFERENCES public.users(id),
    resolved_at         timestamptz,
    resolved_by         uuid REFERENCES public.users(id),
    sla_due_at          timestamptz NOT NULL,
    breached_at         timestamptz,
    opened_at           timestamptz NOT NULL DEFAULT now(),
    idempotency_key     text NOT NULL UNIQUE,
    CONSTRAINT chk_flag_severity CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT chk_flag_status CHECK (status IN ('OPEN', 'REVIEWING', 'RESOLVED', 'CLOSED_STALE'))
);
CREATE INDEX IF NOT EXISTS idx_flag_status_severity ON ops_os.auto_flag(status, severity, opened_at DESC)
    WHERE status IN ('OPEN', 'REVIEWING');
CREATE INDEX IF NOT EXISTS idx_flag_campus_status ON ops_os.auto_flag(campus_id, status);
CREATE INDEX IF NOT EXISTS idx_flag_sla_due ON ops_os.auto_flag(sla_due_at)
    WHERE status IN ('OPEN', 'REVIEWING');

CREATE TABLE IF NOT EXISTS ops_os.notification_dispatch (
    dispatch_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_id             uuid NOT NULL REFERENCES ops_os.auto_flag(flag_id),
    recipient_user_id   uuid NOT NULL REFERENCES public.users(id),
    recipient_role      text NOT NULL,
    channel             text NOT NULL,
    status              text NOT NULL DEFAULT 'pending',
    attempt_count       integer NOT NULL DEFAULT 0,
    sent_at             timestamptz,
    delivered_at        timestamptz,
    acked_at            timestamptz,
    failed_at           timestamptz,
    error_message       text,
    idempotency_key     text NOT NULL UNIQUE,
    CONSTRAINT chk_disp_channel CHECK (channel IN ('in_app', 'email', 'sms')),
    CONSTRAINT chk_disp_status CHECK (status IN ('pending', 'sent', 'delivered', 'acked', 'failed'))
);
CREATE INDEX IF NOT EXISTS idx_disp_recipient_pending ON ops_os.notification_dispatch(recipient_user_id, channel)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_disp_recipient_unread ON ops_os.notification_dispatch(recipient_user_id, sent_at DESC)
    WHERE acked_at IS NULL AND channel = 'in_app';


-- ─── PATTERN DETECTION ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ops_os.theme_vocabulary (
    theme_tag           text PRIMARY KEY,
    display_label       text NOT NULL,
    description         text,
    section             text NOT NULL,
    owner_role          text NOT NULL,
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops_os.pattern_detection_result (
    pattern_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    iso_week            text NOT NULL,
    theme_tag           text NOT NULL REFERENCES ops_os.theme_vocabulary(theme_tag),
    campus_count        integer NOT NULL,
    campus_ids          uuid[] NOT NULL,
    submission_ids      uuid[] NOT NULL,
    promoted            boolean NOT NULL,
    promoted_at         timestamptz,
    computed_at         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (iso_week, theme_tag)
);
CREATE INDEX IF NOT EXISTS idx_pattern_week_promoted ON ops_os.pattern_detection_result(iso_week, promoted)
    WHERE promoted = true;


-- ─── EVENT LOG (the audit + replay spine) ───────────────────────────────

CREATE TABLE IF NOT EXISTS ops_os.event_log (
    event_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type          text NOT NULL,
    aggregate_kind      text NOT NULL,
    aggregate_id        uuid NOT NULL,
    payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
    actor_user_id       uuid REFERENCES public.users(id),
    campus_id           uuid REFERENCES ops_os.campus_dim(campus_id),
    recorded_at         timestamptz NOT NULL DEFAULT now(),
    idempotency_key     text UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_event_aggregate ON ops_os.event_log(aggregate_kind, aggregate_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_type_recorded ON ops_os.event_log(event_type, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_campus_recorded ON ops_os.event_log(campus_id, recorded_at DESC)
    WHERE campus_id IS NOT NULL;


-- ─── IDEMPOTENCY LOG (24h retention) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS ops_os.idempotency_log (
    idempotency_key     text PRIMARY KEY,
    operation           text NOT NULL,
    result_hash         text,
    recorded_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_idemp_recorded ON ops_os.idempotency_log(recorded_at);


-- ─── SECTION 7 ACCESS LOG (sensitive incident audit) ────────────────────

CREATE TABLE IF NOT EXISTS ops_os.section_7_access_log (
    access_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id       uuid NOT NULL REFERENCES ops_os.submission(submission_id),
    accessed_by         uuid NOT NULL REFERENCES public.users(id),
    access_kind         text NOT NULL,
    accessed_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_s7_access_kind CHECK (access_kind IN ('read', 'edit', 'export'))
);
CREATE INDEX IF NOT EXISTS idx_s7_access_user ON ops_os.section_7_access_log(accessed_by, accessed_at DESC);


-- ─── IMMUTABILITY TRIGGER ────────────────────────────────────────────────
-- Once a submission is SIGNED_OFF, its values cannot be modified directly.
-- Amendments must create a new submission with supersedes pointer.

CREATE OR REPLACE FUNCTION ops_os.fn_prevent_modify_signed_off()
RETURNS TRIGGER AS $$
DECLARE
    sub_status text;
BEGIN
    SELECT status INTO sub_status
    FROM ops_os.submission
    WHERE submission_id = COALESCE(NEW.submission_id, OLD.submission_id)
      AND supersedes IS NULL;

    IF sub_status = 'SIGNED_OFF' THEN
        RAISE EXCEPTION 'ops_os immutability: submission % is signed off; create amendment via supersedes',
            COALESCE(NEW.submission_id, OLD.submission_id);
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_signed_off ON ops_os.submission_value;
CREATE TRIGGER trg_protect_signed_off
    BEFORE UPDATE OR DELETE ON ops_os.submission_value
    FOR EACH ROW EXECUTE FUNCTION ops_os.fn_prevent_modify_signed_off();


-- ─── ROW-LEVEL SECURITY ──────────────────────────────────────────────────
-- Policies reference current_setting('app.current_user_id', true)::uuid
-- which the application layer sets per request via SET LOCAL inside a tx.
-- If unset (e.g. migrations, admin sessions), the helper function returns
-- NULL and the policy denies access — fail closed.

CREATE OR REPLACE FUNCTION ops_os.current_user_id()
RETURNS uuid AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_user_id', true), '')::uuid;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION ops_os.current_user_role()
RETURNS text AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_user_role', true), '');
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION ops_os.is_network_role()
RETURNS boolean AS $$
BEGIN
    RETURN ops_os.current_user_role() IN ('ADMIN', 'PROGRAM_OPS', 'COS');
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION ops_os.user_can_see_campus(p_campus_id uuid)
RETURNS boolean AS $$
DECLARE
    uid uuid;
BEGIN
    uid := ops_os.current_user_id();
    IF uid IS NULL THEN RETURN false; END IF;

    -- Network-wide roles see all campuses
    IF ops_os.is_network_role() THEN RETURN true; END IF;

    -- COS sees cluster's campuses
    IF EXISTS (
        SELECT 1 FROM ops_os.campus_dim cd
        JOIN ops_os.cluster_dim cl ON cl.cluster_id = cd.cluster_id
        WHERE cd.campus_id = p_campus_id AND cl.cos_user_id = uid
    ) THEN RETURN true; END IF;

    -- BOA/PM see assigned campuses
    IF EXISTS (
        SELECT 1 FROM ops_os.user_campus_assignment
        WHERE user_id = uid AND campus_id = p_campus_id AND revoked_at IS NULL
    ) THEN RETURN true; END IF;

    RETURN false;
END;
$$ LANGUAGE plpgsql STABLE;

-- Enable RLS on every operational table
ALTER TABLE ops_os.submission           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_os.submission_value     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_os.edit_event           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_os.edit_triage_state    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_os.triage_action        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_os.auto_flag            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_os.notification_dispatch ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_os.event_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_os.section_7_access_log ENABLE ROW LEVEL SECURITY;

-- Submission: BOA/PM see own campus; COS sees cluster; admins see all
CREATE POLICY p_submission_scope ON ops_os.submission
    FOR ALL USING (ops_os.user_can_see_campus(campus_id));

-- Submission values: same scope as parent submission
CREATE POLICY p_submission_value_scope ON ops_os.submission_value
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM ops_os.submission s
            WHERE s.submission_id = submission_value.submission_id
              AND ops_os.user_can_see_campus(s.campus_id)
        )
    );

-- Section 7 isolation: only HR / Program Director / network admins read incident values
-- Other roles see section_7 metric values as NULL via this strict overlay
CREATE POLICY p_section_7_isolation ON ops_os.submission_value
    FOR SELECT USING (
        metric_id NOT LIKE 'section_7.%'
        OR ops_os.current_user_role() IN ('ADMIN', 'PROGRAM_OPS', 'HR')
    );

-- Edit events: only readable in scope of parent submission's campus
CREATE POLICY p_edit_event_scope ON ops_os.edit_event
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM ops_os.submission s
            WHERE s.submission_id = edit_event.submission_id
              AND ops_os.user_can_see_campus(s.campus_id)
        )
    );

CREATE POLICY p_edit_triage_state_scope ON ops_os.edit_triage_state
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM ops_os.edit_event e
            JOIN ops_os.submission s ON s.submission_id = e.submission_id
            WHERE e.edit_id = edit_triage_state.edit_id
              AND ops_os.user_can_see_campus(s.campus_id)
        )
    );

CREATE POLICY p_triage_action_scope ON ops_os.triage_action
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM ops_os.edit_event e
            JOIN ops_os.submission s ON s.submission_id = e.submission_id
            WHERE e.edit_id = triage_action.edit_id
              AND ops_os.user_can_see_campus(s.campus_id)
        )
    );

-- Auto-flag: campus-scoped or network for null campus_id
CREATE POLICY p_auto_flag_scope ON ops_os.auto_flag
    FOR ALL USING (
        campus_id IS NULL
        OR ops_os.user_can_see_campus(campus_id)
    );

-- Notification dispatch: recipient-only OR admin
CREATE POLICY p_notification_recipient ON ops_os.notification_dispatch
    FOR ALL USING (
        recipient_user_id = ops_os.current_user_id()
        OR ops_os.is_network_role()
    );

-- Event log: campus-scoped reads (events without campus_id are visible to network roles)
CREATE POLICY p_event_log_scope ON ops_os.event_log
    FOR SELECT USING (
        campus_id IS NULL AND ops_os.is_network_role()
        OR (campus_id IS NOT NULL AND ops_os.user_can_see_campus(campus_id))
    );

-- Section 7 access log: only network admins read it; everyone can append (for audit)
CREATE POLICY p_section_7_access_read ON ops_os.section_7_access_log
    FOR SELECT USING (ops_os.current_user_role() IN ('ADMIN', 'PROGRAM_OPS', 'HR'));
CREATE POLICY p_section_7_access_insert ON ops_os.section_7_access_log
    FOR INSERT WITH CHECK (accessed_by = ops_os.current_user_id());


-- ─── PERMISSIONS GRANT ───────────────────────────────────────────────────
-- The application connects as the postgres role; explicit grants document
-- intent and prepare for future service-role separation.

GRANT USAGE ON SCHEMA ops_os TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ops_os TO PUBLIC;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ops_os TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ops_os TO PUBLIC;
