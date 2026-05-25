/**
 * UniConnect Operations OS — typed domain model.
 *
 * Every enum here is mirrored by a CHECK constraint in the 0087 migration.
 * Keeping these centralized makes the type system the source of truth for
 * allowed values and prevents silent drift between code and schema.
 */

export type Cadence = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export type SubmissionStatus =
    | 'NEW'
    | 'DRAFT'
    | 'SUBMITTED'
    | 'PM_REVIEW'
    | 'SENT_BACK'
    | 'SIGNED_OFF'
    | 'LOCKED'
    | 'RETRACTED';

export type ValueType = 'numeric' | 'text' | 'boolean' | 'percentage' | 'currency';

export type SourceKind = 'auto_fill' | 'manual' | 'amended';

export type SourceSystem =
    | 'biometric'
    | 'hrms'
    | 'schedule'
    | 'lms'
    | 'helpdesk'
    | 'escalation'
    | 'osm';

export type SourceSystemHealth = 'healthy' | 'degraded' | 'down';

export type FlagSeverity = 'low' | 'medium' | 'high' | 'critical';
export type FlagStatus = 'OPEN' | 'REVIEWING' | 'RESOLVED' | 'CLOSED_STALE';

export type NotificationChannel = 'in_app' | 'email' | 'sms';
export type NotificationStatus = 'pending' | 'sent' | 'delivered' | 'acked' | 'failed';

export type EditTriageStatus = 'OPEN' | 'REVIEWING' | 'RESOLVED' | 'SYSTEM_GAP';

export type SendBackReasonCode =
    | 'data_inconsistency'
    | 'missing_field'
    | 'needs_clarification'
    | 'other';

export type SubmissionRole = 'BOA' | 'PM';

/** Roles considered network-wide for RLS purposes. Aligns with ops_os.is_network_role(). */
export const NETWORK_ROLES = ['ADMIN', 'PROGRAM_OPS', 'COS'] as const;

// ─── Aggregate kinds for event_log ──────────────────────────────────────

export type AggregateKind =
    | 'submission'
    | 'submission_value'
    | 'edit'
    | 'source'
    | 'flag'
    | 'notification'
    | 'pattern'
    | 'verification';

/**
 * The complete V1 event type taxonomy. Adding a new event type requires
 * an ADR; this catalog is the source of truth.
 */
export type EventType =
    // Submission lifecycle
    | 'submission.created'
    | 'submission.field_updated'
    | 'submission.submitted'
    | 'submission.sent_back'
    | 'submission.signed_off'
    | 'submission.superseded'
    | 'submission.retracted'
    // Edit log
    | 'edit.captured'
    // Source integration
    | 'source.pull_started'
    | 'source.pull_succeeded'
    | 'source.pull_failed'
    | 'source.webhook_received'
    | 'source.status_changed'
    // Flag
    | 'flag.created'
    | 'flag.claimed'
    | 'flag.resolved'
    | 'flag.closed_stale'
    | 'flag.sla_breached'
    // Notification
    | 'notification.dispatched'
    | 'notification.delivered'
    | 'notification.acked'
    | 'notification.failed'
    // Pattern
    | 'pattern.theme_observed'
    | 'pattern.promoted'
    // Verification
    | 'verification.send_back'
    | 'verification.signed_off';

// ─── Row shapes (matching DDL) ──────────────────────────────────────────

export interface Submission {
    submission_id: string;
    campus_id: string;
    cadence: Cadence;
    period_start: string;            // ISO date
    period_end: string;
    status: SubmissionStatus;
    revision: number;
    submitted_by: string | null;
    submitted_at: string | null;
    signed_off_by: string | null;
    signed_off_at: string | null;
    sent_back_count: number;
    sent_back_reason_code: SendBackReasonCode | null;
    sent_back_reason_text: string | null;
    pm_remark: string | null;
    is_late_submission: boolean;
    is_late_sign_off: boolean;
    supersedes: string | null;
    locked_at: string | null;
    locked_by: string | null;
    created_at: string;
    updated_at: string;
}

export type SubmissionValueRow = {
    submission_id: string;
    metric_id: string;
    value_numeric: number | null;
    value_text: string | null;
    value_boolean: boolean | null;
    source_kind: SourceKind;
    source_system: SourceSystem | null;
    sync_timestamp: string | null;
    auto_fill_original: unknown;
    recorded_at: string;
    recorded_by: string | null;
};

export interface MetricDimension {
    metric_id: string;
    cadence: Cadence;
    section: string;
    display_name: string;
    value_type: ValueType;
    source_kind: SourceKind;
    source_system: SourceSystem | null;
    is_required: boolean;
    target_value: number | null;
    target_owner_role: string | null;
    threshold_kind: 'absolute' | 'percentage' | null;
    threshold_value: number | null;
    retired_at: string | null;
}

export interface EventLogEntry {
    event_id: string;
    event_type: EventType;
    aggregate_kind: AggregateKind;
    aggregate_id: string;
    payload: Record<string, unknown>;
    actor_user_id: string | null;
    campus_id: string | null;
    recorded_at: string;
    idempotency_key: string | null;
}

/** Discriminated union for typed value reads. */
export type TypedValue =
    | { value_type: 'numeric' | 'percentage' | 'currency'; value: number | null }
    | { value_type: 'text'; value: string | null }
    | { value_type: 'boolean'; value: boolean | null };
