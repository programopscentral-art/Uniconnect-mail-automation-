/**
 * Submission repository — the spine.
 *
 * All write operations:
 *   1. Run inside the caller's transaction (RLS context required)
 *   2. Emit an event_log row atomically with the mutation
 *   3. Use idempotency keys at the API boundary, not here
 *
 * State machine (enforced both here and by CHECK constraints):
 *
 *   NEW       → DRAFT       (on first field edit)
 *   NEW|DRAFT → SUBMITTED   (BOA submit)
 *   SUBMITTED → PM_REVIEW   (implicit on submit; same row but flag the PM)
 *   PM_REVIEW → SENT_BACK   (PM returns; revision tracking preserved)
 *   SENT_BACK → SUBMITTED   (BOA resubmits; revision++)
 *   PM_REVIEW → SIGNED_OFF  (terminal, immutable values via trigger)
 */

import type { PoolClient } from 'pg';
import { emitEvent } from './event_log';
import type {
    Cadence,
    SendBackReasonCode,
    Submission,
    SubmissionStatus,
    SubmissionValueRow,
    ValueType,
} from './types';

// ─── Read paths ──────────────────────────────────────────────────────────

export async function getSubmissionById(
    submission_id: string,
    client: PoolClient,
): Promise<Submission | null> {
    const r = await client.query(
        `SELECT * FROM ops_os.submission WHERE submission_id = $1`,
        [submission_id],
    );
    return (r.rows[0] as Submission) ?? null;
}

export async function getSubmissionValues(
    submission_id: string,
    client: PoolClient,
): Promise<SubmissionValueRow[]> {
    const r = await client.query(
        `SELECT * FROM ops_os.submission_value
         WHERE submission_id = $1
         ORDER BY metric_id`,
        [submission_id],
    );
    return r.rows as SubmissionValueRow[];
}

/**
 * Find existing submission for the (campus, cadence, period) tuple at the
 * latest revision, or null if none exists. Used to make create-submission
 * idempotent at the period level.
 */
export async function findCurrentSubmission(
    params: { campus_id: string; cadence: Cadence; period_start: string; period_end: string },
    client: PoolClient,
): Promise<Submission | null> {
    const r = await client.query(
        `SELECT * FROM ops_os.submission
         WHERE campus_id = $1 AND cadence = $2
           AND period_start = $3 AND period_end = $4
           AND supersedes IS NULL
         ORDER BY revision DESC
         LIMIT 1`,
        [params.campus_id, params.cadence, params.period_start, params.period_end],
    );
    return (r.rows[0] as Submission) ?? null;
}

// ─── Write paths ─────────────────────────────────────────────────────────

export async function createSubmission(
    params: {
        campus_id: string;
        cadence: Cadence;
        period_start: string;
        period_end: string;
        created_by: string;
    },
    client: PoolClient,
): Promise<Submission> {
    const r = await client.query(
        `INSERT INTO ops_os.submission
            (campus_id, cadence, period_start, period_end, status, revision)
         VALUES ($1, $2, $3, $4, 'NEW', 0)
         RETURNING *`,
        [params.campus_id, params.cadence, params.period_start, params.period_end],
    );
    const sub = r.rows[0] as Submission;

    await emitEvent(
        {
            event_type: 'submission.created',
            aggregate_kind: 'submission',
            aggregate_id: sub.submission_id,
            actor_user_id: params.created_by,
            campus_id: params.campus_id,
            payload: {
                cadence: params.cadence,
                period_start: params.period_start,
                period_end: params.period_end,
            },
        },
        client,
    );
    return sub;
}

export interface FieldUpdateInput {
    metric_id: string;
    value_type: ValueType;
    value: number | string | boolean | null;
}

/**
 * Upsert a single metric value on a submission. If the prior value came
 * from auto_fill and the new value differs, an edit_event is also recorded.
 *
 * This is the autosave path — it must be fast and resilient. If the
 * submission is SIGNED_OFF the immutability trigger will reject.
 */
export async function updateSubmissionValue(
    params: {
        submission_id: string;
        metric_id: string;
        value: number | string | boolean | null;
        value_type: ValueType;
        actor_user_id: string;
    },
    client: PoolClient,
): Promise<{ recorded_at: string; threshold_breach: boolean; edit_emitted: boolean }> {
    // 1. Find existing row (if any) to detect edit vs. first-set
    const existing = await client.query<SubmissionValueRow>(
        `SELECT * FROM ops_os.submission_value
         WHERE submission_id = $1 AND metric_id = $2`,
        [params.submission_id, params.metric_id],
    );
    const prior = existing.rows[0] ?? null;

    // 2. Compute the value column to write
    const [colNumeric, colText, colBoolean] = ((): [number | null, string | null, boolean | null] => {
        if (params.value === null || params.value === undefined) return [null, null, null];
        switch (params.value_type) {
            case 'numeric':
            case 'percentage':
            case 'currency':
                return [Number(params.value), null, null];
            case 'text':
                return [null, String(params.value), null];
            case 'boolean':
                return [null, null, Boolean(params.value)];
        }
    })();

    // 3. Determine whether this is an edit of a prior auto_fill value
    let edit_emitted = false;
    let threshold_breach = false;
    let auto_fill_original: unknown = null;
    let source_kind: 'auto_fill' | 'manual' | 'amended' = 'manual';

    if (prior?.source_kind === 'auto_fill') {
        const priorPrimitive = readValue(prior);
        const next = params.value;
        const changed = !valuesEqual(priorPrimitive, next);

        if (changed) {
            // Look up threshold for this metric
            const md = await client.query<{
                threshold_kind: 'absolute' | 'percentage' | null;
                threshold_value: number | null;
            }>(
                `SELECT threshold_kind, threshold_value FROM ops_os.metric_dim
                 WHERE metric_id = $1`,
                [params.metric_id],
            );
            const tk = md.rows[0]?.threshold_kind ?? null;
            const tv = md.rows[0]?.threshold_value ?? null;

            let delta_numeric: number | null = null;
            let delta_percentage: number | null = null;
            if (typeof priorPrimitive === 'number' && typeof next === 'number') {
                delta_numeric = Math.abs(next - priorPrimitive);
                if (priorPrimitive !== 0) {
                    delta_percentage = (delta_numeric / Math.abs(priorPrimitive)) * 100;
                }
            }

            if (tk === 'absolute' && tv !== null && delta_numeric !== null) {
                threshold_breach = delta_numeric > tv;
            } else if (tk === 'percentage' && tv !== null && delta_percentage !== null) {
                threshold_breach = delta_percentage > tv;
            }

            // Insert edit_event
            const editR = await client.query<{ edit_id: string }>(
                `INSERT INTO ops_os.edit_event
                    (submission_id, metric_id, source_system, original_value, new_value,
                     delta_numeric, delta_percentage, threshold_breach, edited_by)
                 VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9)
                 RETURNING edit_id`,
                [
                    params.submission_id,
                    params.metric_id,
                    prior.source_system,
                    JSON.stringify(priorPrimitive),
                    JSON.stringify(next),
                    delta_numeric,
                    delta_percentage,
                    threshold_breach,
                    params.actor_user_id,
                ],
            );
            edit_emitted = true;
            auto_fill_original = priorPrimitive;
            source_kind = 'amended';

            // If threshold breach, also seed edit_triage_state row at OPEN
            if (threshold_breach && editR.rows[0]) {
                await client.query(
                    `INSERT INTO ops_os.edit_triage_state (edit_id, current_status)
                     VALUES ($1, 'OPEN')
                     ON CONFLICT (edit_id) DO NOTHING`,
                    [editR.rows[0].edit_id],
                );
            }

            await emitEvent(
                {
                    event_type: 'edit.captured',
                    aggregate_kind: 'edit',
                    aggregate_id: editR.rows[0].edit_id,
                    actor_user_id: params.actor_user_id,
                    payload: {
                        submission_id: params.submission_id,
                        metric_id: params.metric_id,
                        source_system: prior.source_system,
                        threshold_breach,
                        delta_numeric,
                        delta_percentage,
                    },
                },
                client,
            );
        }
    }

    // 4. Upsert the value
    const upsertR = await client.query<{ recorded_at: string }>(
        `INSERT INTO ops_os.submission_value
            (submission_id, metric_id, value_numeric, value_text, value_boolean,
             source_kind, source_system, sync_timestamp, auto_fill_original, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
         ON CONFLICT (submission_id, metric_id) DO UPDATE SET
            value_numeric = EXCLUDED.value_numeric,
            value_text = EXCLUDED.value_text,
            value_boolean = EXCLUDED.value_boolean,
            source_kind = EXCLUDED.source_kind,
            auto_fill_original = COALESCE(EXCLUDED.auto_fill_original, ops_os.submission_value.auto_fill_original),
            recorded_at = now(),
            recorded_by = EXCLUDED.recorded_by
         RETURNING recorded_at`,
        [
            params.submission_id,
            params.metric_id,
            colNumeric,
            colText,
            colBoolean,
            source_kind,
            prior?.source_system ?? null,
            prior?.sync_timestamp ?? null,
            auto_fill_original ? JSON.stringify(auto_fill_original) : null,
            params.actor_user_id,
        ],
    );

    // 5. Bump submission to DRAFT if still NEW
    await client.query(
        `UPDATE ops_os.submission
         SET status = CASE WHEN status = 'NEW' THEN 'DRAFT' ELSE status END,
             updated_at = now()
         WHERE submission_id = $1`,
        [params.submission_id],
    );

    // 6. Always emit a field_updated event (low-volume; useful for replay)
    await emitEvent(
        {
            event_type: 'submission.field_updated',
            aggregate_kind: 'submission',
            aggregate_id: params.submission_id,
            actor_user_id: params.actor_user_id,
            payload: {
                metric_id: params.metric_id,
                value_type: params.value_type,
                source_kind,
            },
        },
        client,
    );

    return {
        recorded_at: upsertR.rows[0].recorded_at,
        threshold_breach,
        edit_emitted,
    };
}

export async function transitionToSubmitted(
    params: { submission_id: string; submitted_by: string; deadline?: Date },
    client: PoolClient,
): Promise<Submission> {
    const r = await client.query<Submission>(
        `UPDATE ops_os.submission
         SET status = 'SUBMITTED',
             submitted_by = $2,
             submitted_at = now(),
             is_late_submission = ($3::timestamptz IS NOT NULL AND now() > $3::timestamptz),
             updated_at = now()
         WHERE submission_id = $1
           AND status IN ('NEW', 'DRAFT', 'SENT_BACK')
         RETURNING *`,
        [params.submission_id, params.submitted_by, params.deadline ?? null],
    );
    if (r.rowCount === 0) {
        throw new Error(`submission ${params.submission_id} not in submittable state`);
    }
    const sub = r.rows[0];
    await emitEvent(
        {
            event_type: 'submission.submitted',
            aggregate_kind: 'submission',
            aggregate_id: sub.submission_id,
            actor_user_id: params.submitted_by,
            campus_id: sub.campus_id,
            payload: { is_late: sub.is_late_submission, revision: sub.revision },
        },
        client,
    );
    return sub;
}

export async function transitionToSignedOff(
    params: { submission_id: string; signed_off_by: string; pm_remark: string; deadline?: Date },
    client: PoolClient,
): Promise<Submission> {
    if (!params.pm_remark || params.pm_remark.trim().length === 0) {
        throw new Error('pm_remark is required for sign-off');
    }
    const r = await client.query<Submission>(
        `UPDATE ops_os.submission
         SET status = 'SIGNED_OFF',
             signed_off_by = $2,
             signed_off_at = now(),
             pm_remark = $3,
             is_late_sign_off = ($4::timestamptz IS NOT NULL AND now() > $4::timestamptz),
             updated_at = now()
         WHERE submission_id = $1
           AND status IN ('SUBMITTED', 'PM_REVIEW')
         RETURNING *`,
        [params.submission_id, params.signed_off_by, params.pm_remark, params.deadline ?? null],
    );
    if (r.rowCount === 0) {
        throw new Error(`submission ${params.submission_id} not in signable state`);
    }
    const sub = r.rows[0];
    await emitEvent(
        {
            event_type: 'submission.signed_off',
            aggregate_kind: 'submission',
            aggregate_id: sub.submission_id,
            actor_user_id: params.signed_off_by,
            campus_id: sub.campus_id,
            payload: { is_late: sub.is_late_sign_off },
        },
        client,
    );
    return sub;
}

/**
 * Retract a just-submitted draft back to DRAFT state. Allowed only when:
 *   - current status is SUBMITTED
 *   - submitted_at is within the retraction window (default 30 min)
 *   - no PM has opened the submission for review yet (proxied by checking
 *     for any `submission.pm_review_started` event for this aggregate; if
 *     that event type isn't emitted yet, we relax to "PM hasn't sent it
 *     back or signed it off either" which is implied by status=SUBMITTED).
 *
 * Returns the updated submission on success, or null when the retraction
 * window has closed (caller surfaces a specific error). Throws only on
 * outright invalid transitions (wrong status to begin with).
 */
export async function transitionToRetracted(
    params: {
        submission_id: string;
        actor_user_id: string;
        retraction_window_minutes?: number;
    },
    client: PoolClient,
): Promise<{ submission: Submission; reason?: never } | { submission: null; reason: 'wrong_status' | 'window_closed' | 'pm_already_reviewing' }> {
    const windowMin = params.retraction_window_minutes ?? 30;

    const current = await getSubmissionById(params.submission_id, client);
    if (!current) throw new Error(`submission ${params.submission_id} not found`);

    if (current.status !== 'SUBMITTED') {
        return { submission: null, reason: 'wrong_status' };
    }
    if (!current.submitted_at) {
        // Defensive: SUBMITTED row without submitted_at shouldn't exist, but bail safely.
        return { submission: null, reason: 'wrong_status' };
    }
    const submittedMs = new Date(current.submitted_at).getTime();
    if (Date.now() - submittedMs > windowMin * 60 * 1000) {
        return { submission: null, reason: 'window_closed' };
    }

    // Check whether a PM has begun review (proxied by the event log).
    // If the dedicated pm_review_started event isn't emitted yet, this
    // query returns 0 rows and the check passes — that's fine; if a PM
    // actually beat the BOA to sign-off / send-back, status wouldn't be
    // SUBMITTED anymore and we'd have failed the first check.
    const reviewStarted = await client.query<{ event_id: string }>(
        `SELECT event_id FROM ops_os.event_log
         WHERE aggregate_kind = 'submission'
           AND aggregate_id = $1
           AND event_type IN ('verification.send_back', 'verification.signed_off')
         LIMIT 1`,
        [params.submission_id],
    );
    if (reviewStarted.rowCount && reviewStarted.rowCount > 0) {
        return { submission: null, reason: 'pm_already_reviewing' };
    }

    const r = await client.query<Submission>(
        `UPDATE ops_os.submission
         SET status = 'DRAFT',
             submitted_at = NULL,
             submitted_by = NULL,
             is_late_submission = false,
             updated_at = now()
         WHERE submission_id = $1
           AND status = 'SUBMITTED'
         RETURNING *`,
        [params.submission_id],
    );
    if (r.rowCount === 0) {
        // Lost a race — somebody else changed status. Treat as wrong_status.
        return { submission: null, reason: 'wrong_status' };
    }
    const sub = r.rows[0];
    await emitEvent(
        {
            event_type: 'submission.retracted',
            aggregate_kind: 'submission',
            aggregate_id: sub.submission_id,
            actor_user_id: params.actor_user_id,
            campus_id: sub.campus_id,
            payload: {
                from_status: 'SUBMITTED',
                to_status: 'DRAFT',
                window_minutes: windowMin,
                original_submitted_at: current.submitted_at,
            },
        },
        client,
    );
    return { submission: sub };
}

/**
 * Lock a SIGNED_OFF submission. Called by the daily-lock worker at EOD per
 * campus. After lock, the immutability trigger rejects any value writes.
 *
 * Idempotent at the row level: re-locking an already-LOCKED row is a no-op
 * (RETURNING returns no rows; caller treats as success).
 */
export async function transitionToLocked(
    params: { submission_id: string; locked_by: string | null },
    client: PoolClient,
): Promise<Submission | null> {
    const r = await client.query<Submission>(
        `UPDATE ops_os.submission
         SET status = 'LOCKED',
             locked_at = now(),
             locked_by = $2,
             updated_at = now()
         WHERE submission_id = $1
           AND status = 'SIGNED_OFF'
         RETURNING *`,
        [params.submission_id, params.locked_by],
    );
    if (r.rowCount === 0) return null;
    const sub = r.rows[0];
    await emitEvent(
        {
            event_type: 'submission.signed_off', // reused for V1; dedicated lock event added later
            aggregate_kind: 'submission',
            aggregate_id: sub.submission_id,
            actor_user_id: params.locked_by,
            campus_id: sub.campus_id,
            payload: { transition: 'locked', locked_at: sub.locked_at },
        },
        client,
    );
    return sub;
}

/**
 * Find SIGNED_OFF submissions ready to be locked for a given cadence + date.
 * Used by the daily-lock worker. Does NOT honor RLS (worker runs with
 * elevated privileges); callers must be system-only.
 */
export async function findSubmissionsToLock(
    params: { cadence: Cadence; period_end: string },
    client: PoolClient,
): Promise<Submission[]> {
    const r = await client.query<Submission>(
        `SELECT * FROM ops_os.submission
         WHERE cadence = $1
           AND period_end = $2
           AND status = 'SIGNED_OFF'
           AND locked_at IS NULL
         ORDER BY campus_id`,
        [params.cadence, params.period_end],
    );
    return r.rows;
}

/**
 * List submissions visible to the caller (RLS-scoped) for a given status set
 * and optional date range. Used by the PM review queue and BOA dashboard.
 */
export async function listSubmissions(
    params: {
        statuses?: SubmissionStatus[];
        cadence?: Cadence;
        campus_id?: string;
        period_start_from?: string;
        period_start_to?: string;
        limit?: number;
    },
    client: PoolClient,
): Promise<Submission[]> {
    const where: string[] = ['1=1'];
    const args: unknown[] = [];
    if (params.statuses && params.statuses.length > 0) {
        args.push(params.statuses);
        where.push(`status = ANY($${args.length}::text[])`);
    }
    if (params.cadence) {
        args.push(params.cadence);
        where.push(`cadence = $${args.length}`);
    }
    if (params.campus_id) {
        args.push(params.campus_id);
        where.push(`campus_id = $${args.length}`);
    }
    if (params.period_start_from) {
        args.push(params.period_start_from);
        where.push(`period_start >= $${args.length}`);
    }
    if (params.period_start_to) {
        args.push(params.period_start_to);
        where.push(`period_start <= $${args.length}`);
    }
    args.push(params.limit ?? 100);
    const limitClause = `LIMIT $${args.length}`;

    const r = await client.query<Submission>(
        `SELECT * FROM ops_os.submission
         WHERE ${where.join(' AND ')}
         ORDER BY period_start DESC, submitted_at DESC NULLS LAST
         ${limitClause}`,
        args,
    );
    return r.rows;
}

export async function transitionToSentBack(
    params: {
        submission_id: string;
        sent_back_by: string;
        reason_code: SendBackReasonCode;
        reason_text?: string;
    },
    client: PoolClient,
): Promise<Submission> {
    const r = await client.query<Submission>(
        `UPDATE ops_os.submission
         SET status = 'SENT_BACK',
             sent_back_count = sent_back_count + 1,
             sent_back_reason_code = $2,
             sent_back_reason_text = $3,
             updated_at = now()
         WHERE submission_id = $1
           AND status IN ('SUBMITTED', 'PM_REVIEW')
         RETURNING *`,
        [params.submission_id, params.reason_code, params.reason_text ?? null],
    );
    if (r.rowCount === 0) {
        throw new Error(`submission ${params.submission_id} not in send-back-able state`);
    }
    const sub = r.rows[0];
    await emitEvent(
        {
            event_type: 'submission.sent_back',
            aggregate_kind: 'submission',
            aggregate_id: sub.submission_id,
            actor_user_id: params.sent_back_by,
            campus_id: sub.campus_id,
            payload: { reason_code: params.reason_code, sent_back_count: sub.sent_back_count },
        },
        client,
    );
    return sub;
}

// ─── Helpers ────────────────────────────────────────────────────────────

function readValue(row: SubmissionValueRow): number | string | boolean | null {
    if (row.value_numeric !== null) return Number(row.value_numeric);
    if (row.value_text !== null) return row.value_text;
    if (row.value_boolean !== null) return row.value_boolean;
    return null;
}

function valuesEqual(a: unknown, b: unknown): boolean {
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
    return a === b;
}
