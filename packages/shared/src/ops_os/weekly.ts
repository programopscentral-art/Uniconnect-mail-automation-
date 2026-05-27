/**
 * Operations OS — weekly cadence helpers.
 *
 * Weekly reports use the same submission table + lifecycle as daily, but:
 *   - period_start = Monday (IST) of the reported week
 *   - period_end   = Sunday (IST) of the same week
 *   - cadence      = 'WEEKLY'
 *
 * The quantitative portion of a weekly report (sessions, attendance,
 * incidents, sent-backs, etc.) is NOT stored as separate weekly
 * submission_values. Instead it's derived on the fly by `getWeeklyRollup`
 * from the 7 daily submissions for that campus + period. DAILY remains
 * the single source of truth and weekly stays a view on top.
 *
 * The qualitative portion (summary, concerns, next_week_priorities,
 * team_morale, etc.) IS stored as submission_values under the WEEKLY
 * submission_id. These are the metrics seeded in migration 0096.
 */

import type { PoolClient } from 'pg';

// ── Period math ──────────────────────────────────────────────────────────

/** Today's date in IST as YYYY-MM-DD. */
function todayIstYmd(now: Date = new Date()): string {
    const istMs = now.getTime() + (5 * 60 + 30) * 60 * 1000;
    return new Date(istMs).toISOString().slice(0, 10);
}

/** Parse a YYYY-MM-DD string as a UTC date (no time component). */
function parseYmd(s: string): Date {
    return new Date(s + 'T00:00:00Z');
}

function formatYmd(d: Date): string {
    return d.toISOString().slice(0, 10);
}

/**
 * Given an IST calendar date, return the Monday→Sunday week boundaries that
 * contain it.
 *
 * Monday's getUTCDay() is 1. Sunday is 0. To get back to the Monday for any
 * day we subtract `(day === 0 ? 6 : day - 1)` UTC days from the input date —
 * since we treated the input as a UTC date this stays calendar-correct.
 */
export function weekBoundariesFromIstDate(ymd: string): { period_start: string; period_end: string } {
    const d = parseYmd(ymd);
    const day = d.getUTCDay();
    const daysSinceMonday = day === 0 ? 6 : day - 1;
    const mon = new Date(d.getTime() - daysSinceMonday * 86400_000);
    const sun = new Date(mon.getTime() + 6 * 86400_000);
    return { period_start: formatYmd(mon), period_end: formatYmd(sun) };
}

/**
 * Return the most recently *completed* Mon→Sun week in IST. Used as the
 * default period when a BOA opens the weekly report — the week being
 * summarized is always the one that just ended, never the current one.
 */
export function lastCompletedWeek(now: Date = new Date()): { period_start: string; period_end: string } {
    const today = todayIstYmd(now);
    const thisWeek = weekBoundariesFromIstDate(today);
    // If today is Monday (day=1 in UTC-shifted IST), thisWeek's Monday is
    // today and the "completed" week is the previous one.
    const d = parseYmd(today);
    const day = d.getUTCDay(); // 0..6 — 0=Sun, 1=Mon
    if (day === 1) {
        // shift one week back
        const monPrev = parseYmd(thisWeek.period_start);
        monPrev.setUTCDate(monPrev.getUTCDate() - 7);
        const sunPrev = new Date(monPrev.getTime() + 6 * 86400_000);
        return { period_start: formatYmd(monPrev), period_end: formatYmd(sunPrev) };
    }
    // Tuesday-Sunday: thisWeek.period_start is the active Monday, but the
    // user is summarizing the week-to-date or the previous completed week.
    // Convention: default to the most-recently-completed week, i.e. the
    // Mon→Sun whose Sunday is in the past or today.
    const sunThisWeek = parseYmd(thisWeek.period_end);
    if (sunThisWeek.getTime() <= d.getTime()) {
        // The Sunday of this week has already passed (i.e., today is Sun).
        return thisWeek;
    }
    // Today is mid-week — last completed week is the previous one.
    const monPrev = parseYmd(thisWeek.period_start);
    monPrev.setUTCDate(monPrev.getUTCDate() - 7);
    const sunPrev = new Date(monPrev.getTime() + 6 * 86400_000);
    return { period_start: formatYmd(monPrev), period_end: formatYmd(sunPrev) };
}

/**
 * Given an IST calendar date, return the 1st → last day of the month
 * containing it.
 */
export function monthBoundariesFromIstDate(ymd: string): { period_start: string; period_end: string } {
    const d = parseYmd(ymd);
    const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    return { period_start: formatYmd(first), period_end: formatYmd(last) };
}

/**
 * The previous calendar month in IST, used as the default period for the
 * monthly summary view. Today is in the current month; the "completed"
 * month is always the one before unless today is the 1st (then we use
 * the month that just ended).
 */
export function lastCompletedMonth(now: Date = new Date()): { period_start: string; period_end: string } {
    const today = todayIstYmd(now);
    const d = parseYmd(today);
    // Always show last calendar month for clarity — partial month would
    // be misleading on a summary view.
    const firstOfPrev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
    const lastOfPrev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
    return { period_start: formatYmd(firstOfPrev), period_end: formatYmd(lastOfPrev) };
}

/**
 * The current month-to-date (1st → today). Useful when the caller wants
 * the in-progress month rather than the previously completed one.
 */
export function currentMonthToDate(now: Date = new Date()): { period_start: string; period_end: string } {
    const today = todayIstYmd(now);
    const d = parseYmd(today);
    const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    return { period_start: formatYmd(first), period_end: today };
}

/**
 * The current week-to-date (this week's Monday → today). For Operations
 * Overview's Weekly tab — COS wants to see this week's progress, not last
 * week's completed report.
 */
export function currentWeekToDate(now: Date = new Date()): { period_start: string; period_end: string } {
    const today = todayIstYmd(now);
    const thisWeek = weekBoundariesFromIstDate(today);
    return { period_start: thisWeek.period_start, period_end: today };
}

/**
 * Full current week (this Monday → next Sunday). For Operations Overview
 * if you want to see the full week range even if some days are in the
 * future — non-existent submissions become "no submission".
 */
export function currentWeekFull(now: Date = new Date()): { period_start: string; period_end: string } {
    const today = todayIstYmd(now);
    return weekBoundariesFromIstDate(today);
}

// ── Weekly auto-rollup ───────────────────────────────────────────────────

export interface WeeklyRollup {
    period_start: string;
    period_end: string;
    days_in_range: number;
    days_submitted: number;
    days_signed_off: number;
    days_holiday: number;
    days_auto_signed_off: number;
    days_late_submission: number;
    days_no_submission: number;
    sent_backs_count: number;

    // Sums across the week (NULL-safe).
    total_sessions_held: number;
    total_sessions_scheduled: number;
    total_students_present: number;
    total_students_enrolled: number;
    total_faculty_absent: number;
    total_incidents_flagged: number;
    total_hostel_issues: number;
    total_transport_incidents: number;
    total_escalations_opened: number;
    total_escalations_closed: number;

    // Derived percentages — null when denominator is zero.
    avg_attendance_pct: number | null;
    sessions_held_pct: number | null;
}

const NUMERIC_METRICS = [
    'daily.academic.sessions_conducted',
    'daily.academic.sessions_scheduled',
    'daily.attendance.present',
    'daily.attendance.total_enrolled',
    'daily.faculty.absent_count',
    'daily.incidents.count',
    'daily.student_ops.hostel_issues_count',
    'daily.student_ops.transport_incidents_count',
    'daily.student_ops.escalations_opened',
    'daily.student_ops.escalations_closed',
] as const;

/**
 * Aggregate the 7 daily submissions for (campus, week) into a single rollup.
 * Daily submissions with status NEW/DRAFT are excluded — only SUBMITTED+
 * count toward the totals. Holiday days contribute 0 to numeric sums but
 * are counted in `days_holiday`.
 */
export async function getWeeklyRollup(
    params: { campus_id: string; period_start: string; period_end: string },
    client: PoolClient,
): Promise<WeeklyRollup> {
    const { campus_id, period_start, period_end } = params;

    // Per-day status + holiday + late flags
    const dailyStatus = await client.query<{
        period_start: string;
        status: string;
        auto_signed_off: boolean;
        is_late_submission: boolean;
        sent_back_count: number;
        is_holiday: boolean;
    }>(
        `SELECT s.period_start::text AS period_start,
                s.status,
                COALESCE(s.auto_signed_off, false) AS auto_signed_off,
                COALESCE(s.is_late_submission, false) AS is_late_submission,
                COALESCE(s.sent_back_count, 0) AS sent_back_count,
                COALESCE(
                    (SELECT value_boolean FROM ops_os.submission_value
                      WHERE submission_id = s.submission_id
                        AND metric_id = 'daily.day_type.is_holiday'),
                    false
                ) AS is_holiday
           FROM ops_os.submission s
          WHERE s.campus_id = $1
            AND s.cadence = 'DAILY'
            AND s.period_start BETWEEN $2::date AND $3::date
            AND s.supersedes IS NULL`,
        [campus_id, period_start, period_end],
    );

    // Numeric sums by metric_id, only from non-holiday submitted+ days
    const numericSums = await client.query<{ metric_id: string; total: string | null }>(
        `SELECT sv.metric_id, SUM(sv.value_numeric)::text AS total
           FROM ops_os.submission s
           JOIN ops_os.submission_value sv ON sv.submission_id = s.submission_id
          WHERE s.campus_id = $1
            AND s.cadence = 'DAILY'
            AND s.period_start BETWEEN $2::date AND $3::date
            AND s.supersedes IS NULL
            AND s.status IN ('SUBMITTED', 'PM_REVIEW', 'SIGNED_OFF', 'LOCKED', 'SENT_BACK')
            AND sv.metric_id = ANY($4::text[])
          GROUP BY sv.metric_id`,
        [campus_id, period_start, period_end, NUMERIC_METRICS as unknown as string[]],
    );
    const sums = new Map<string, number>();
    for (const r of numericSums.rows) {
        sums.set(r.metric_id, r.total ? Number(r.total) : 0);
    }
    const num = (k: string) => sums.get(k) ?? 0;

    // Day counters
    const days_in_range = Math.round(
        (parseYmd(period_end).getTime() - parseYmd(period_start).getTime()) / 86400_000,
    ) + 1;

    const submittedStatuses = new Set(['SUBMITTED', 'PM_REVIEW', 'SIGNED_OFF', 'LOCKED', 'SENT_BACK']);
    let days_submitted = 0, days_signed_off = 0, days_holiday = 0;
    let days_auto_signed_off = 0, days_late_submission = 0, sent_backs_count = 0;
    for (const r of dailyStatus.rows) {
        if (submittedStatuses.has(r.status)) days_submitted++;
        if (r.status === 'SIGNED_OFF' || r.status === 'LOCKED') days_signed_off++;
        if (r.is_holiday) days_holiday++;
        if (r.auto_signed_off) days_auto_signed_off++;
        if (r.is_late_submission) days_late_submission++;
        sent_backs_count += r.sent_back_count;
    }
    const days_no_submission = Math.max(0, days_in_range - dailyStatus.rowCount!);

    const total_sessions_held      = num('daily.academic.sessions_conducted');
    const total_sessions_scheduled = num('daily.academic.sessions_scheduled');
    const total_students_present   = num('daily.attendance.present');
    const total_students_enrolled  = num('daily.attendance.total_enrolled');

    const avg_attendance_pct = total_students_enrolled > 0
        ? Math.round((total_students_present / total_students_enrolled) * 100)
        : null;
    const sessions_held_pct = total_sessions_scheduled > 0
        ? Math.round((total_sessions_held / total_sessions_scheduled) * 100)
        : null;

    return {
        period_start,
        period_end,
        days_in_range,
        days_submitted,
        days_signed_off,
        days_holiday,
        days_auto_signed_off,
        days_late_submission,
        days_no_submission,
        sent_backs_count,
        total_sessions_held,
        total_sessions_scheduled,
        total_students_present,
        total_students_enrolled,
        total_faculty_absent: num('daily.faculty.absent_count'),
        total_incidents_flagged: num('daily.incidents.count'),
        total_hostel_issues: num('daily.student_ops.hostel_issues_count'),
        total_transport_incidents: num('daily.student_ops.transport_incidents_count'),
        total_escalations_opened: num('daily.student_ops.escalations_opened'),
        total_escalations_closed: num('daily.student_ops.escalations_closed'),
        avg_attendance_pct,
        sessions_held_pct,
    };
}

// getWeeklyRollup works for any date range — alias for clarity at call sites.
export const getPeriodRollup = getWeeklyRollup;
export type PeriodRollup = WeeklyRollup;

// ── Org-wide overview across all campuses for a period ───────────────────

export interface CampusPeriodOverviewRow {
    campus_id: string;
    campus_code: string;
    campus_name: string;
    days_in_range: number;
    days_submitted: number;
    days_signed_off: number;
    days_holiday: number;
    days_auto_signed_off: number;
    days_late_submission: number;
    days_no_submission: number;
    sent_backs_count: number;
    total_sessions_held: number;
    total_sessions_scheduled: number;
    total_students_present: number;
    total_students_enrolled: number;
    total_incidents_flagged: number;
    avg_attendance_pct: number | null;
    sessions_held_pct: number | null;
}

/**
 * One row per active campus, each containing the period rollup for
 * (period_start..period_end). Used by Operations Overview's Weekly/Monthly
 * tabs so COS/leadership can scan all campuses at once without N+1
 * per-campus queries.
 */
export async function getCampusPeriodOverview(
    params: { period_start: string; period_end: string; campus_ids?: string[] },
    client: PoolClient,
): Promise<CampusPeriodOverviewRow[]> {
    const { period_start, period_end, campus_ids } = params;

    // Two queries (one per group), joined in JS by campus_id. Single-pass
    // SQL would be faster but harder to maintain — each pulls different
    // shape of data.

    // Day counters per campus
    const dayCounters = await client.query<{
        campus_id: string;
        days_submitted: string;
        days_signed_off: string;
        days_holiday: string;
        days_auto_signed_off: string;
        days_late_submission: string;
        sent_backs_count: string;
    }>(
        `WITH active AS (
            SELECT cd.campus_id FROM ops_os.campus_dim cd
             WHERE cd.status = 'active'
               AND ($3::uuid[] IS NULL OR cd.campus_id = ANY($3::uuid[]))
         )
         SELECT a.campus_id,
                COUNT(CASE WHEN s.status IN ('SUBMITTED','PM_REVIEW','SIGNED_OFF','LOCKED','SENT_BACK') THEN 1 END)::text AS days_submitted,
                COUNT(CASE WHEN s.status IN ('SIGNED_OFF','LOCKED') THEN 1 END)::text AS days_signed_off,
                COUNT(CASE WHEN EXISTS (
                    SELECT 1 FROM ops_os.submission_value sv
                     WHERE sv.submission_id = s.submission_id
                       AND sv.metric_id = 'daily.day_type.is_holiday'
                       AND sv.value_boolean = true
                ) THEN 1 END)::text AS days_holiday,
                COUNT(CASE WHEN s.auto_signed_off = true THEN 1 END)::text AS days_auto_signed_off,
                COUNT(CASE WHEN s.is_late_submission = true THEN 1 END)::text AS days_late_submission,
                COALESCE(SUM(s.sent_back_count), 0)::text AS sent_backs_count
           FROM active a
           LEFT JOIN ops_os.submission s
                  ON s.campus_id = a.campus_id
                 AND s.cadence = 'DAILY'
                 AND s.period_start BETWEEN $1::date AND $2::date
                 AND s.supersedes IS NULL
          GROUP BY a.campus_id`,
        [period_start, period_end, campus_ids ?? null],
    );

    // Numeric sums per campus
    const numericSums = await client.query<{
        campus_id: string;
        sessions_held: string;
        sessions_scheduled: string;
        students_present: string;
        students_enrolled: string;
        incidents: string;
    }>(
        `WITH active AS (
            SELECT cd.campus_id FROM ops_os.campus_dim cd
             WHERE cd.status = 'active'
               AND ($3::uuid[] IS NULL OR cd.campus_id = ANY($3::uuid[]))
         )
         SELECT a.campus_id,
                COALESCE(SUM(CASE WHEN sv.metric_id = 'daily.academic.sessions_conducted' THEN sv.value_numeric END), 0)::text AS sessions_held,
                COALESCE(SUM(CASE WHEN sv.metric_id = 'daily.academic.sessions_scheduled' THEN sv.value_numeric END), 0)::text AS sessions_scheduled,
                COALESCE(SUM(CASE WHEN sv.metric_id = 'daily.attendance.present'          THEN sv.value_numeric END), 0)::text AS students_present,
                COALESCE(SUM(CASE WHEN sv.metric_id = 'daily.attendance.total_enrolled'   THEN sv.value_numeric END), 0)::text AS students_enrolled,
                COALESCE(SUM(CASE WHEN sv.metric_id = 'daily.incidents.count'             THEN sv.value_numeric END), 0)::text AS incidents
           FROM active a
           LEFT JOIN ops_os.submission s
                  ON s.campus_id = a.campus_id
                 AND s.cadence = 'DAILY'
                 AND s.period_start BETWEEN $1::date AND $2::date
                 AND s.supersedes IS NULL
                 AND s.status IN ('SUBMITTED','PM_REVIEW','SIGNED_OFF','LOCKED','SENT_BACK')
           LEFT JOIN ops_os.submission_value sv ON sv.submission_id = s.submission_id
          GROUP BY a.campus_id`,
        [period_start, period_end, campus_ids ?? null],
    );

    // Campus labels
    const labels = await client.query<{ campus_id: string; code: string; display_name: string }>(
        `SELECT campus_id, code, display_name FROM ops_os.campus_dim
          WHERE status = 'active'
            AND ($1::uuid[] IS NULL OR campus_id = ANY($1::uuid[]))
          ORDER BY display_name`,
        [campus_ids ?? null],
    );

    const dayMap = new Map(dayCounters.rows.map(r => [r.campus_id, r]));
    const numMap = new Map(numericSums.rows.map(r => [r.campus_id, r]));

    const days_in_range = Math.round(
        (parseYmd(period_end).getTime() - parseYmd(period_start).getTime()) / 86400_000,
    ) + 1;

    return labels.rows.map(c => {
        const d = dayMap.get(c.campus_id);
        const n = numMap.get(c.campus_id);
        const days_submitted = Number(d?.days_submitted ?? 0);
        const days_signed_off = Number(d?.days_signed_off ?? 0);
        const days_holiday = Number(d?.days_holiday ?? 0);
        const days_auto_signed_off = Number(d?.days_auto_signed_off ?? 0);
        const days_late_submission = Number(d?.days_late_submission ?? 0);
        const sent_backs_count = Number(d?.sent_backs_count ?? 0);
        const days_no_submission = Math.max(0, days_in_range - days_submitted);

        const total_sessions_held = Number(n?.sessions_held ?? 0);
        const total_sessions_scheduled = Number(n?.sessions_scheduled ?? 0);
        const total_students_present = Number(n?.students_present ?? 0);
        const total_students_enrolled = Number(n?.students_enrolled ?? 0);
        const total_incidents_flagged = Number(n?.incidents ?? 0);

        const avg_attendance_pct = total_students_enrolled > 0
            ? Math.round((total_students_present / total_students_enrolled) * 100)
            : null;
        const sessions_held_pct = total_sessions_scheduled > 0
            ? Math.round((total_sessions_held / total_sessions_scheduled) * 100)
            : null;

        return {
            campus_id: c.campus_id,
            campus_code: c.code,
            campus_name: c.display_name,
            days_in_range,
            days_submitted,
            days_signed_off,
            days_holiday,
            days_auto_signed_off,
            days_late_submission,
            days_no_submission,
            sent_backs_count,
            total_sessions_held,
            total_sessions_scheduled,
            total_students_present,
            total_students_enrolled,
            total_incidents_flagged,
            avg_attendance_pct,
            sessions_held_pct,
        };
    });
}
