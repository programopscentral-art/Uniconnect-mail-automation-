/**
 * Operational consumption layer — read-only queries for COS, OPS_HEAD,
 * and leadership to consume signed-off operational truth across campuses.
 *
 * Two functions:
 *   - getDailyOperationsOverview: one row per active campus per date, with
 *     derived flags (incident count, infra issues, late flags)
 *   - getSubmissionEvents: chronological audit trail for one submission,
 *     with actor names resolved
 *
 * Both honor RLS via the caller's withReadOnlyUserContext wrapper.
 */

import type { PoolClient } from 'pg';

// ─── Daily overview row shape ────────────────────────────────────────────

export type DailyOpsStatus =
    | 'NO_SUBMISSION'
    | 'NEW'
    | 'DRAFT'
    | 'SUBMITTED'
    | 'PM_REVIEW'
    | 'SENT_BACK'
    | 'SIGNED_OFF'
    | 'LOCKED'
    | 'RETRACTED';

export interface DailyOpsRow {
    campus_id: string;
    campus_code: string;
    campus_name: string;

    submission_id: string | null;
    status: DailyOpsStatus;
    submitted_at: string | null;
    signed_off_at: string | null;
    locked_at: string | null;

    is_late_submission: boolean;
    is_late_sign_off: boolean;
    sent_back_count: number;

    pm_remark_preview: string | null;
    pm_remark_truncated: boolean;

    incident_count: number;
    has_infra_issue: boolean;
}

export interface DailyOpsFilters {
    /** ISO date 'YYYY-MM-DD' — required */
    date: string;
    /** Optional subset of campus_ids to include */
    campus_ids?: string[];
    /** Filter by submission status (or 'NO_SUBMISSION'). Omit for all. */
    status?: DailyOpsStatus;
    /** Only rows where submission OR sign-off was late */
    late_only?: boolean;
    /** Only rows where incident_count > 0 */
    incident_only?: boolean;
}

/**
 * One row per active campus for the given date. Campuses without a
 * submission for that date appear with status='NO_SUBMISSION'.
 *
 * Derivations:
 *   - incident_count: value of daily.incidents.count (0 if no submission
 *     or field missing)
 *   - has_infra_issue: true if any of power/water/connectivity is not
 *     'normal', OR open_issues text is non-empty
 *   - pm_remark_preview: first 80 chars of pm_remark; pm_remark_truncated
 *     flag tells the UI to show a "more" affordance
 */
export async function getDailyOperationsOverview(
    filters: DailyOpsFilters,
    client: PoolClient,
): Promise<DailyOpsRow[]> {
    const args: unknown[] = [filters.date];
    const conds: string[] = [];

    if (filters.campus_ids && filters.campus_ids.length > 0) {
        args.push(filters.campus_ids);
        conds.push(`c.campus_id = ANY($${args.length}::uuid[])`);
    }

    const baseWhere = conds.length > 0 ? `AND ${conds.join(' AND ')}` : '';

    // Post-filter conditions evaluated against derived columns
    const postConds: string[] = [];
    if (filters.status) {
        args.push(filters.status);
        postConds.push(`status = $${args.length}`);
    }
    if (filters.late_only) {
        postConds.push(`(is_late_submission OR is_late_sign_off)`);
    }
    if (filters.incident_only) {
        postConds.push(`incident_count > 0`);
    }
    const postWhere = postConds.length > 0 ? `WHERE ${postConds.join(' AND ')}` : '';

    const sql = `
        WITH base AS (
            SELECT
                c.campus_id,
                c.code AS campus_code,
                c.display_name AS campus_name,

                s.submission_id,
                COALESCE(s.status, 'NO_SUBMISSION') AS status,
                s.submitted_at,
                s.signed_off_at,
                s.locked_at,

                COALESCE(s.is_late_submission, false) AS is_late_submission,
                COALESCE(s.is_late_sign_off,   false) AS is_late_sign_off,
                COALESCE(s.sent_back_count, 0) AS sent_back_count,

                CASE
                    WHEN s.pm_remark IS NULL THEN NULL
                    ELSE LEFT(s.pm_remark, 80)
                END AS pm_remark_preview,
                COALESCE(LENGTH(s.pm_remark) > 80, false) AS pm_remark_truncated,

                COALESCE(
                    (SELECT value_numeric::int
                       FROM ops_os.submission_value
                      WHERE submission_id = s.submission_id
                        AND metric_id = 'daily.incidents.count'),
                    0
                ) AS incident_count,

                EXISTS (
                    SELECT 1 FROM ops_os.submission_value
                     WHERE submission_id = s.submission_id
                       AND (
                           (metric_id = 'daily.infra.power_status'        AND value_text IS NOT NULL AND value_text <> 'normal')
                        OR (metric_id = 'daily.infra.water_status'        AND value_text IS NOT NULL AND value_text <> 'normal')
                        OR (metric_id = 'daily.infra.connectivity_status' AND value_text IS NOT NULL AND value_text <> 'normal')
                        OR (metric_id = 'daily.infra.open_issues'         AND value_text IS NOT NULL AND TRIM(value_text) <> '')
                       )
                ) AS has_infra_issue

            FROM ops_os.campus_dim c
            LEFT JOIN ops_os.submission s
                   ON s.campus_id = c.campus_id
                  AND s.cadence = 'DAILY'
                  AND s.period_start = $1::date
                  AND s.supersedes IS NULL
            WHERE c.status = 'active'
              ${baseWhere}
        )
        SELECT * FROM base
        ${postWhere}
        ORDER BY campus_name
    `;

    const r = await client.query<DailyOpsRow>(sql, args);
    return r.rows;
}

// ─── Submission event log ────────────────────────────────────────────────

export interface SubmissionEventRow {
    event_id: string;
    event_type: string;
    recorded_at: string;
    actor_user_id: string | null;
    actor_name: string | null;
    actor_email: string | null;
    payload: Record<string, unknown>;
}

/**
 * Chronological event log for a single submission, with actor name + email
 * resolved via a LEFT JOIN to public.users. Used by the read-only drill-
 * down page's timeline.
 *
 * Returns events from oldest to newest.
 */
export async function getSubmissionEvents(
    submission_id: string,
    client: PoolClient,
): Promise<SubmissionEventRow[]> {
    const r = await client.query<SubmissionEventRow>(
        `SELECT
            e.event_id,
            e.event_type,
            e.recorded_at,
            e.actor_user_id,
            u.name AS actor_name,
            u.email AS actor_email,
            e.payload
         FROM ops_os.event_log e
         LEFT JOIN public.users u ON u.id = e.actor_user_id
         WHERE e.aggregate_kind = 'submission'
           AND e.aggregate_id = $1::uuid
         ORDER BY e.recorded_at ASC, e.event_id ASC`,
        [submission_id],
    );
    return r.rows;
}
